const fs = require('fs');
const http = require('http');

const DEFAULT_CONFIG = {
  profile: '',
  email: '',
  password: '',
  poll_interval_minutes: 5,
  mqtt_topic_prefix: 'dataannotation',
  log_level: 'info',
};

async function readConfig() {
  const config = { ...DEFAULT_CONFIG };
  const optionsPath = '/data/options.json';

  if (fs.existsSync(optionsPath)) {
    const options = JSON.parse(fs.readFileSync(optionsPath, 'utf8'));
    config.profile = stringOrDefault(options.profile ?? options.profile_name, config.profile);
    config.email = stringOrDefault(options.email ?? options.dataannotation_email, config.email);
    config.password = stringOrDefault(options.password ?? options.dataannotation_password, config.password);
    config.poll_interval_minutes = numberOrDefault(options.poll_interval_minutes, config.poll_interval_minutes, 1, 1440);
    config.mqtt_topic_prefix = stringOrDefault(options.mqtt_topic_prefix, config.mqtt_topic_prefix);
    config.log_level = stringOrDefault(options.log_level, config.log_level);
  }

  if (process.env.EMAIL || process.env.DATAANNOTATION_EMAIL) {
    config.email = process.env.EMAIL || process.env.DATAANNOTATION_EMAIL;
  }
  if (process.env.PASSWORD || process.env.DATAANNOTATION_PASSWORD) {
    config.password = process.env.PASSWORD || process.env.DATAANNOTATION_PASSWORD;
  }
  if (process.env.PROFILE || process.env.DATAANNOTATION_PROFILE_NAME) {
    config.profile = process.env.PROFILE || process.env.DATAANNOTATION_PROFILE_NAME;
  }
  if (process.env.MQTT_TOPIC_PREFIX) {
    config.mqtt_topic_prefix = process.env.MQTT_TOPIC_PREFIX;
  }

  config.profile = stringOrDefault(config.profile, DEFAULT_CONFIG.profile);
  config.email = stringOrDefault(config.email, '');
  config.password = stringOrDefault(config.password, '');
  config.mqtt_topic_prefix = normalizeSlug(config.mqtt_topic_prefix || DEFAULT_CONFIG.mqtt_topic_prefix);
  config.log_level = normalizeLogLevel(config.log_level);
  config.browser_profile_dir = '/data/chrome-profile';
  Object.assign(config, await getMqttFromSupervisor());

  config.mqtt_host = stringOrDefault(process.env.MQTT_HOST || config.mqtt_host, '');
  config.mqtt_port = numberOrDefault(process.env.MQTT_PORT || config.mqtt_port, 1883, 1, 65535);
  config.mqtt_username = stringOrDefault(process.env.MQTT_USERNAME || config.mqtt_username, '');
  config.mqtt_password = stringOrDefault(process.env.MQTT_PASSWORD || config.mqtt_password, '');

  if (!config.email) {
    throw new Error("Configuration value 'email' is required");
  }

  if (!config.password) {
    throw new Error("Configuration value 'password' is required");
  }

  if (!config.mqtt_host) {
    throw new Error('No MQTT broker configured. Install Mosquitto or expose MQTT_HOST variables.');
  }

  return config;
}

function configureLogging(logLevel) {
  const levels = new Set(['debug', 'info', 'warning', 'error']);
  const level = levels.has(String(logLevel).toLowerCase()) ? String(logLevel).toLowerCase() : 'info';
  process.env.BASHIO_LOG_LEVEL = level;
}

function stringOrDefault(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

function numberOrDefault(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.trunc(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'dataannotation';
}

function normalizeLogLevel(value) {
  const allowed = ['debug', 'info', 'warning', 'error'];
  const normalized = String(value || 'info').toLowerCase();
  return allowed.includes(normalized) ? normalized : 'info';
}

async function getMqttFromSupervisor() {
  const fallback = {
    mqtt_host: null,
    mqtt_port: 1883,
    mqtt_username: null,
    mqtt_password: null,
  };

  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    return fallback;
  }

  return new Promise((resolve) => {
    const request = http.request(
      {
        hostname: 'supervisor',
        path: '/services/mqtt',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const data = payload.data || payload;
            resolve({
              mqtt_host: data.host || fallback.mqtt_host,
              mqtt_port: Number(data.port || fallback.mqtt_port),
              mqtt_username: data.username || fallback.mqtt_username,
              mqtt_password: data.password || fallback.mqtt_password,
            });
          } catch (error) {
            resolve(fallback);
          }
        });
      }
    );

    request.on('error', () => resolve(fallback));
    request.setTimeout(10000, () => {
      request.destroy();
      resolve(fallback);
    });
    request.end();
  });
}

module.exports = {
  readConfig,
  configureLogging,
  normalizeSlug,
  normalizeLogLevel,
};
