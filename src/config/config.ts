import fs from 'fs';
import http from 'http';

import {
  DEFAULT_FAST_POLL_CRON,
  DEFAULT_FUNDS_HISTORY_CRON,
  DEFAULT_POLL_CRON,
  normalizePollingCron,
} from '../shared/polling_schedule';
import { parseExcludedProjectPatterns } from '../projects/project_filters';

type Config = {
  profile: string;
  email: string;
  password: string;
  poll_cron: string;
  fast_poll_cron: string;
  funds_history_cron: string;
  funds_history_after_task_delay_minutes: number;
  excluded_project_patterns: string[] | string;
  mqtt_topic_prefix: string;
  log_level: string;
  browser_profile_dir?: string;
  mqtt_host?: string | null;
  mqtt_port?: number;
  mqtt_username?: string | null;
  mqtt_password?: string | null;
};

type MqttSupervisorConfig = {
  mqtt_host: string | null;
  mqtt_port: number;
  mqtt_username: string | null;
  mqtt_password: string | null;
};

const DEFAULT_CONFIG: Config = {
  profile: '',
  email: '',
  password: '',
  poll_cron: DEFAULT_POLL_CRON,
  fast_poll_cron: DEFAULT_FAST_POLL_CRON,
  funds_history_cron: DEFAULT_FUNDS_HISTORY_CRON,
  funds_history_after_task_delay_minutes: 2,
  excluded_project_patterns: [],
  mqtt_topic_prefix: 'dataannotation',
  log_level: 'info',
};

export async function readConfig(): Promise<Config> {
  const config: Config = { ...DEFAULT_CONFIG };
  const optionsPath = '/data/options.json';

  if (fs.existsSync(optionsPath)) {
    const options = JSON.parse(fs.readFileSync(optionsPath, 'utf8'));
    config.profile = stringOrDefault(options.profile ?? options.profile_name, config.profile);
    config.email = stringOrDefault(options.email ?? options.dataannotation_email, config.email);
    config.password = stringOrDefault(options.password ?? options.dataannotation_password, config.password);
    if (options.poll_cron !== undefined) {
      config.poll_cron = stringOrDefault(options.poll_cron, config.poll_cron);
    }
    config.fast_poll_cron = stringOrDefault(options.fast_poll_cron, config.fast_poll_cron);
    config.funds_history_cron = stringOrDefault(options.funds_history_cron, config.funds_history_cron);
    if (options.funds_history_after_task_delay_minutes !== undefined) {
      config.funds_history_after_task_delay_minutes = numberOrDefault(
        options.funds_history_after_task_delay_minutes,
        config.funds_history_after_task_delay_minutes,
        0,
        1440
      );
    }
    config.excluded_project_patterns = stringOrDefault(options.excluded_project_patterns ?? options.excluded_projects, '');
    config.mqtt_topic_prefix = stringOrDefault(options.mqtt_topic_prefix, config.mqtt_topic_prefix);
    config.log_level = stringOrDefault(options.log_level, config.log_level);
  }

  if (process.env.EMAIL || process.env.DATAANNOTATION_EMAIL) {
    config.email = process.env.EMAIL || process.env.DATAANNOTATION_EMAIL || config.email;
  }
  if (process.env.PASSWORD || process.env.DATAANNOTATION_PASSWORD) {
    config.password = process.env.PASSWORD || process.env.DATAANNOTATION_PASSWORD || config.password;
  }
  if (process.env.PROFILE || process.env.DATAANNOTATION_PROFILE_NAME) {
    config.profile = process.env.PROFILE || process.env.DATAANNOTATION_PROFILE_NAME || config.profile;
  }
  if (process.env.MQTT_TOPIC_PREFIX) {
    config.mqtt_topic_prefix = process.env.MQTT_TOPIC_PREFIX;
  }
  if (process.env.POLL_CRON) {
    config.poll_cron = process.env.POLL_CRON;
  }
  if (process.env.FAST_POLL_CRON) {
    config.fast_poll_cron = process.env.FAST_POLL_CRON;
  }
  if (process.env.FUNDS_HISTORY_CRON) {
    config.funds_history_cron = process.env.FUNDS_HISTORY_CRON;
  }
  if (process.env.EXCLUDED_PROJECT_PATTERNS) {
    config.excluded_project_patterns = process.env.EXCLUDED_PROJECT_PATTERNS;
  }

  config.profile = stringOrDefault(config.profile, DEFAULT_CONFIG.profile);
  config.email = stringOrDefault(config.email, '');
  config.password = stringOrDefault(config.password, '');
  config.mqtt_topic_prefix = normalizeSlug(config.mqtt_topic_prefix || DEFAULT_CONFIG.mqtt_topic_prefix);
  config.log_level = normalizeLogLevel(config.log_level);
  config.poll_cron = normalizePollingCron(config.poll_cron, DEFAULT_POLL_CRON);
  config.fast_poll_cron = normalizePollingCron(config.fast_poll_cron, DEFAULT_FAST_POLL_CRON);
  config.funds_history_cron = normalizePollingCron(config.funds_history_cron, DEFAULT_FUNDS_HISTORY_CRON);
  config.excluded_project_patterns = parseExcludedProjectPatterns(config.excluded_project_patterns);
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

export function configureLogging(logLevel: string): void {
  const levels = new Set(['debug', 'info', 'warning', 'error']);
  const level = levels.has(String(logLevel).toLowerCase()) ? String(logLevel).toLowerCase() : 'info';
  process.env.BASHIO_LOG_LEVEL = level;
}

export function normalizeSlug(value: unknown): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'dataannotation';
}

export function normalizeLogLevel(value: unknown): string {
  const allowed = ['debug', 'info', 'warning', 'error'];
  const normalized = String(value || 'info').toLowerCase();
  return allowed.includes(normalized) ? normalized : 'info';
}

function stringOrDefault(value: unknown, fallback: string): string {
  if (value === undefined || value === null) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function numberOrDefault(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.trunc(parsed);
  return Math.min(max, Math.max(min, rounded));
}

async function getMqttFromSupervisor(): Promise<MqttSupervisorConfig> {
  const fallback: MqttSupervisorConfig = {
    mqtt_host: null,
    mqtt_port: 1883,
    mqtt_username: null,
    mqtt_password: null,
  };

  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    return fallback;
  }

  return new Promise<MqttSupervisorConfig>((resolve) => {
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
          } catch {
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
