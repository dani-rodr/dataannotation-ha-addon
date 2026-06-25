const { readConfig, configureLogging } = require('./config');
const { DataAnnotationClient } = require('./dataannotation_client');
const { createPersistentNotification } = require('./ha_notifications');
const { DataAnnotationMqttBridge } = require('./mqtt_bridge');
const { createLogger } = require('./logger');
const { summarizeProjects } = require('./scrapers/projects');
const { loadWithdrawLockState, saveWithdrawLockState } = require('./withdraw_lock_state');

const { version } = require('../package.json');

const WITHDRAW_LOCK_STATE_PATH = '/data/withdraw-lock-state.json';

let running = true;

process.on('SIGINT', () => {
  running = false;
});

process.on('SIGTERM', () => {
  running = false;
});

async function main() {
  const config = await readConfig();
  configureLogging(config.log_level);
  const logger = createLogger(config.log_level);

  logger.info(`Starting Data Annotation add-on v${version}`);
  logger.debug(
    `Config loaded: profile="${config.profile || 'Data Annotation'}", topic="${config.mqtt_topic_prefix}", poll=${config.poll_interval_minutes}m, mqtt_host="${config.mqtt_host}"`
  );

  const bridge = new DataAnnotationMqttBridge({
    host: config.mqtt_host,
    port: config.mqtt_port,
    username: config.mqtt_username || undefined,
    password: config.mqtt_password || undefined,
    topicPrefix: config.mqtt_topic_prefix,
    profileName: config.profile || 'Data Annotation',
    version,
    logger,
    publishTargets: ['projects', 'status'],
  });

  const client = new DataAnnotationClient({
    email: config.email,
    password: config.password,
    profileDir: config.browser_profile_dir,
    logger,
  });

  let withdrawLocked = loadWithdrawLockState(WITHDRAW_LOCK_STATE_PATH);

  try {
    await bridge.waitForConnection();
    bridge.publishOnline();
    bridge.publishDiscovery();
    bridge.publishProfile(config.profile || 'Data Annotation');
    bridge.publishWithdrawLockState(withdrawLocked);

    let lastSuccessfulSyncAt = null;
    let lastSuccessfulProjectCount = 0;
    let lastSuccessfulTotalTaskCount = 0;
    let nextRunAt = Date.now();

    while (running) {
      if (bridge.withdrawLockChange.value !== null) {
        withdrawLocked = bridge.withdrawLockChange.value;
        bridge.withdrawLockChange.value = null;
        saveWithdrawLockState(WITHDRAW_LOCK_STATE_PATH, withdrawLocked);
        bridge.publishWithdrawLockState(withdrawLocked);
        logger.info(`Withdraw lock state updated: ${withdrawLocked ? 'locked' : 'unlocked'}`);
      }

      if (bridge.withdrawRequested.value) {
        bridge.withdrawRequested.value = false;
        await handleWithdrawRequest(client, bridge, withdrawLocked, logger);
        bridge.scanRequested.value = true;
      }

      const now = Date.now();
      if (bridge.scanRequested.value || now >= nextRunAt) {
        bridge.scanRequested.value = false;
        const syncResult = await doSync(
          client,
          bridge,
          config,
          lastSuccessfulSyncAt,
          lastSuccessfulProjectCount,
          lastSuccessfulTotalTaskCount,
          withdrawLocked,
          logger
        );
        lastSuccessfulSyncAt = syncResult.lastSuccessfulSyncAt;
        lastSuccessfulProjectCount = syncResult.lastSuccessfulProjectCount;
        lastSuccessfulTotalTaskCount = syncResult.lastSuccessfulTotalTaskCount;
        nextRunAt = Date.now() + config.poll_interval_minutes * 60 * 1000;
      }

      await sleep(1000);
    }
  } finally {
    await client.close().catch(() => {});
    await bridge.close().catch(() => {});
  }
}

async function doSync(
  client,
  bridge,
  config,
  lastSuccessfulSyncAt,
  lastSuccessfulProjectCount,
  lastSuccessfulTotalTaskCount,
  withdrawLocked,
  logger
) {
  const startedAt = new Date().toISOString();
  logger.info(`Starting sync at ${startedAt}`);

  try {
    const result = await client.collectProjects();
    const completedAt = new Date().toISOString();
    const projectSummary = summarizeProjects(result.projects);

    logger.info(`Sync complete: ${projectSummary.count} projects, ${projectSummary.total_tasks} total tasks`);
    logger.debug(`Projects page URL: ${result.pageUrl}`);

    bridge.publishOnline();
    bridge.publishProfile(config.profile || 'Data Annotation');
    bridge.publishWithdrawLockState(withdrawLocked);
    bridge.publishSummary({
      count: projectSummary.count,
      total_tasks: projectSummary.total_tasks,
      profile: config.profile || 'Data Annotation',
      login_state: result.loginState,
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: completedAt,
    });
    bridge.publishStatusSuccess({
      trigger: 'poll',
      state: 'online',
      loginState: result.loginState,
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: completedAt,
      lastError: null,
    });
    bridge.publishProjects(result.projects);

    const payments = await client.collectPayments();
    logger.info(`Payments snapshot complete: available=${payments.available_amount_formatted}, canWithdraw=${payments.can_withdraw}`);
    logger.debug(`Payments page URL: ${payments.pageUrl}`);
    bridge.publishPayments(payments);

    return {
      lastSuccessfulSyncAt: completedAt,
      lastSuccessfulProjectCount: result.count,
      lastSuccessfulTotalTaskCount: projectSummary.total_tasks,
    };
  } catch (error) {
    logger.error(`Sync failed: ${error.stack || error.message}`);
    bridge.publishStatusError({
      trigger: 'poll',
      state: 'offline',
      loginState: 'login_failed',
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: lastSuccessfulSyncAt,
      lastError: error.message,
    });
    bridge.publishWithdrawLockState(withdrawLocked);
    bridge.publishSummary({
      count: lastSuccessfulProjectCount || 0,
      total_tasks: lastSuccessfulTotalTaskCount || 0,
      profile: config.profile || 'Data Annotation',
      login_state: 'login_failed',
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: lastSuccessfulSyncAt,
      lastError: error.message,
    });
    return {
      lastSuccessfulSyncAt,
      lastSuccessfulProjectCount,
      lastSuccessfulTotalTaskCount,
    };
  }
}

async function handleWithdrawRequest(client, bridge, withdrawLocked, logger) {
  logger.info('Processing withdraw request');

  const payments = await client.collectPayments();

  if (withdrawLocked) {
    const nextWithdrawalText = payments.next_withdrawal_at
      ? `Next withdrawal is at ${payments.next_withdrawal_at}. `
      : '';

    try {
      await createPersistentNotification({
        title: 'Data Annotation Withdrawal Locked',
        message: `${nextWithdrawalText}Turn off Withdraw Locked before trying again.`,
        notificationId: 'dataannotation_withdrawal_locked',
        logger,
      });
    } catch (error) {
      logger.warning(`Failed to create withdrawal locked notification: ${error.message}`);
    }
    logger.warning('Withdrawal request blocked because the lock is on');
    bridge.publishPayments(payments);
    return;
  }

  if (!payments.can_withdraw || payments.available_amount <= 0 || !payments.button_enabled) {
    const nextWithdrawalText = payments.next_withdrawal_at
      ? `Next withdrawal is at ${payments.next_withdrawal_at}.`
      : 'DataAnnotation did not provide a next withdrawal time.';

    try {
      await createPersistentNotification({
        title: 'Data Annotation Withdrawal Not Ready',
        message: `Cannot withdraw yet. ${nextWithdrawalText}`,
        notificationId: 'dataannotation_withdrawal_not_ready',
        logger,
      });
    } catch (error) {
      logger.warning(`Failed to create withdrawal not-ready notification: ${error.message}`);
    }
    logger.warning('Withdrawal request blocked because funds are not available yet');
    bridge.publishPayments(payments);
    return;
  }

  const result = await client.withdrawAvailableFunds();
  bridge.publishPayments(result.payments || payments);
  logger.info(`Withdrawal request submitted: ${result.status}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
