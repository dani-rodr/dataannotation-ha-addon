const { readConfig, configureLogging } = require('./config');
const { DataAnnotationClient } = require('./dataannotation_client');
const { createPersistentNotification } = require('./ha_notifications');
const { DataAnnotationMqttBridge } = require('./mqtt_bridge');
const { createLogger } = require('./logger');
const { summarizeProjects } = require('./scrapers/projects');
const { computeNextRunAt } = require('./polling_schedule');
const { loadFastPollingState, saveFastPollingState } = require('./fast_polling_state');
const { loadWithdrawLockState, saveWithdrawLockState } = require('./withdraw_lock_state');

const { version } = require('../package.json');

const WITHDRAW_LOCK_STATE_PATH = '/data/withdraw-lock-state.json';
const FAST_POLLING_STATE_PATH = '/data/fast-polling-state.json';

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
    `Config loaded: profile="${config.profile || 'Data Annotation'}", topic="${config.mqtt_topic_prefix}", poll="${config.poll_cron}", fast_poll="${config.fast_poll_cron}", mqtt_host="${config.mqtt_host}"`
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
  let fastPollingEnabled = loadFastPollingState(FAST_POLLING_STATE_PATH);

  try {
    await bridge.waitForConnection();
    bridge.publishOnline();
    bridge.publishDiscovery();
    bridge.publishProfile(config.profile || 'Data Annotation');
    bridge.publishWithdrawLockState(withdrawLocked);
    bridge.publishFastPollingState(fastPollingEnabled);

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

      if (bridge.fastPollingChange.value !== null) {
        fastPollingEnabled = bridge.fastPollingChange.value;
        bridge.fastPollingChange.value = null;
        saveFastPollingState(FAST_POLLING_STATE_PATH, fastPollingEnabled);
        bridge.publishFastPollingState(fastPollingEnabled);
        nextRunAt = Date.now();
        logger.info(`Fast polling state updated: ${fastPollingEnabled ? 'enabled' : 'disabled'}`);
      }

      if (bridge.withdrawRequested.value) {
        bridge.withdrawRequested.value = false;
        await handleWithdrawRequest(client, bridge, withdrawLocked, logger);
        bridge.scanRequested.value = true;
      }

      const now = Date.now();
      if (bridge.scanRequested.value || now >= nextRunAt) {
        const includePayments = bridge.scanRequested.value || !fastPollingEnabled;
        bridge.scanRequested.value = false;
        const syncResult = await doSync(
          client,
          bridge,
          config,
          lastSuccessfulSyncAt,
          lastSuccessfulProjectCount,
          lastSuccessfulTotalTaskCount,
          withdrawLocked,
          includePayments,
          logger
        );
        lastSuccessfulSyncAt = syncResult.lastSuccessfulSyncAt;
        lastSuccessfulProjectCount = syncResult.lastSuccessfulProjectCount;
        lastSuccessfulTotalTaskCount = syncResult.lastSuccessfulTotalTaskCount;
        nextRunAt = Date.parse(computeNextRunAt(getActivePollCron(config, fastPollingEnabled), new Date()));
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
  includePayments,
  logger
) {
  const startedAt = new Date().toISOString();
  logger.info(`Starting sync at ${startedAt}`);

  try {
    const result = await client.collectProjects();
    const completedAt = new Date().toISOString();
    const projectSummary = summarizeProjects(result.projects);

    logger.info(
      `${includePayments ? 'Sync' : 'Fast sync'} complete: ${projectSummary.count} projects, ${projectSummary.total_tasks} total tasks`
    );
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
    bridge.publishProjects(result.projects, completedAt);

    if (includePayments) {
      const payments = await client.collectPayments();
      logger.info(`Payments snapshot complete: available=${payments.available_amount_formatted}, canWithdraw=${payments.can_withdraw}`);
      logger.debug(`Payments page URL: ${payments.pageUrl}`);
      bridge.publishPayments(payments, payments.scraped_at || completedAt);
    } else {
      logger.debug('Skipping payments scrape during fast sync');
    }

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
    logger.warning('Retaining last known project summary because sync did not complete');
    return {
      lastSuccessfulSyncAt,
      lastSuccessfulProjectCount,
      lastSuccessfulTotalTaskCount,
    };
  }
}

function getActivePollCron(config, fastPollingEnabled) {
  return fastPollingEnabled ? config.fast_poll_cron : config.poll_cron;
}

async function handleWithdrawRequest(client, bridge, withdrawLocked, logger) {
  logger.info('Processing withdraw request');

  if (withdrawLocked) {
    try {
      await createPersistentNotification({
        title: 'Data Annotation Withdrawal Locked',
        message: buildWithdrawalLockedMessage(),
        notificationId: 'dataannotation_withdrawal_locked',
        logger,
      });
    } catch (error) {
      logger.warning(`Failed to create withdrawal locked notification: ${error.message}`);
    }
    logger.warning('Withdrawal request blocked because the lock is on');
    return;
  }

  logger.debug('Submitting withdrawal request through fresh eligibility check');
  const result = await client.withdrawAvailableFunds();
  const payments = result.payments || {};

  if (result.status !== 'submitted') {
    const nextWithdrawalAt = parseDate(payments?.next_withdrawal_at);
    const reason = !payments?.can_withdraw && nextWithdrawalAt && nextWithdrawalAt.getTime() > Date.now()
      ? 'time'
      : payments?.withdraw_button_present
        ? 'funds'
        : 'button';
    const message = buildWithdrawalNotReadyMessage(payments, reason);

    try {
      await createPersistentNotification({
        title: 'Data Annotation Withdrawal Not Ready',
        message,
        notificationId: 'dataannotation_withdrawal_not_ready',
        logger,
      });
    } catch (error) {
      logger.warning(`Failed to create withdrawal not-ready notification: ${error.message}`);
    }
    logger.warning(`Withdrawal request was not submitted: ${result.status}`);
  } else {
    logger.info('Withdrawal request submitted successfully');
  }

  bridge.publishPayments(payments);
  bridge.scanRequested.value = true;
  logger.debug('Scheduling sync after withdrawal request');
}

function buildWithdrawalLockedMessage() {
  return 'Withdrawals are currently locked.\n\nTurn off Withdraw Locked, then press Withdraw Funds again.';
}

function buildWithdrawalNotReadyMessage(payments, reason) {
  if (reason === 'time') {
    const nextWithdrawalText = formatFriendlyDate(payments.next_withdrawal_at);
    return `Withdrawal is not available yet.\n\nNext withdrawal: ${nextWithdrawalText || 'unknown'}.`;
  }

  if (!payments.withdraw_button_present) {
    return 'Withdrawal is not available right now.\n\nThe withdrawal button is not visible on DataAnnotation.';
  }

  return `Withdrawal is not available right now.\n\nAvailable funds: ${payments.available_amount_formatted}.`;
}

function formatFriendlyDate(value) {
  const date = parseDate(value);
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
