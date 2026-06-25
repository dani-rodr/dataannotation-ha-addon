const { readConfig, configureLogging } = require('./config');
const { DataAnnotationClient } = require('./dataannotation_client');
const { DataAnnotationMqttBridge } = require('./mqtt_bridge');
const { createLogger } = require('./logger');

const { version } = require('../package.json');

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

  try {
    await bridge.waitForConnection();
    bridge.publishOnline();
    bridge.publishDiscovery();
    bridge.publishProfile(config.profile || 'Data Annotation');

    let lastSuccessfulSyncAt = null;
    let lastSuccessfulProjectCount = 0;
    let nextRunAt = Date.now();

    while (running) {
      const now = Date.now();
      if (bridge.scanRequested.value || now >= nextRunAt) {
        bridge.scanRequested.value = false;
        const syncResult = await doSync(client, bridge, config, lastSuccessfulSyncAt, lastSuccessfulProjectCount, logger);
        lastSuccessfulSyncAt = syncResult.lastSuccessfulSyncAt;
        lastSuccessfulProjectCount = syncResult.lastSuccessfulProjectCount;
        nextRunAt = Date.now() + config.poll_interval_minutes * 60 * 1000;
      }

      await sleep(1000);
    }
  } finally {
    await client.close().catch(() => {});
    await bridge.close().catch(() => {});
  }
}

async function doSync(client, bridge, config, lastSuccessfulSyncAt, lastSuccessfulProjectCount, logger) {
  const startedAt = new Date().toISOString();
  logger.info(`Starting sync at ${startedAt}`);

  try {
    const result = await client.collectProjects();
    const completedAt = new Date().toISOString();

    logger.info(`Sync complete: ${result.count} projects`);
    logger.debug(`Projects page URL: ${result.pageUrl}`);

    bridge.publishOnline();
    bridge.publishProfile(config.profile || 'Data Annotation');
    bridge.publishSummary({
      count: result.count,
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

    return { lastSuccessfulSyncAt: completedAt, lastSuccessfulProjectCount: result.count };
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
    bridge.publishSummary({
      count: lastSuccessfulProjectCount || 0,
      profile: config.profile || 'Data Annotation',
      login_state: 'login_failed',
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: lastSuccessfulSyncAt,
      lastError: error.message,
    });
    return { lastSuccessfulSyncAt, lastSuccessfulProjectCount };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
