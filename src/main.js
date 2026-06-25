const { readConfig, configureLogging } = require('./config');
const { DataAnnotationClient } = require('./dataannotation_client');
const { DataAnnotationMqttBridge } = require('./mqtt_bridge');

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

  const bridge = new DataAnnotationMqttBridge({
    host: config.mqtt_host,
    port: config.mqtt_port,
    username: config.mqtt_username || undefined,
    password: config.mqtt_password || undefined,
    topicPrefix: config.mqtt_topic_prefix,
    profileName: config.profile_name,
    version,
    publishTargets: ['projects', 'status'],
  });

  const client = new DataAnnotationClient({
    email: config.dataannotation_email,
    password: config.dataannotation_password,
    profileDir: config.browser_profile_dir,
  });

  try {
    await bridge.waitForConnection();
    bridge.publishOnline();
    bridge.publishDiscovery();
    bridge.publishProfile(config.profile_name);

    let lastSuccessfulSyncAt = null;
    let nextRunAt = Date.now();

    while (running) {
      const now = Date.now();
      if (bridge.scanRequested.value || now >= nextRunAt) {
        bridge.scanRequested.value = false;
        lastSuccessfulSyncAt = await doSync(client, bridge, config, lastSuccessfulSyncAt);
        nextRunAt = Date.now() + config.poll_interval_minutes * 60 * 1000;
      }

      await sleep(1000);
    }
  } finally {
    await client.close().catch(() => {});
    await bridge.close().catch(() => {});
  }
}

async function doSync(client, bridge, config, lastSuccessfulSyncAt) {
  const startedAt = new Date().toISOString();

  try {
    const result = await client.collectProjects();
    const completedAt = new Date().toISOString();

    bridge.publishOnline();
    bridge.publishProfile(config.profile_name);
    bridge.publishSummary({
      count: result.count,
      profile_name: config.profile_name,
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
    return completedAt;
  } catch (error) {
    bridge.publishStatusError({
      trigger: 'poll',
      state: 'offline',
      loginState: 'login_failed',
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: lastSuccessfulSyncAt,
      lastError: error.message,
    });
    return lastSuccessfulSyncAt;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
