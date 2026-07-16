// @ts-nocheck
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { normalizeLogLevel, normalizeSlug, readConfig } = require('../../src/config/config.ts');

test('normalizeSlug converts spaces to underscores', () => {
  assert.equal(normalizeSlug('Data Annotation'), 'data_annotation');
});

test('normalizeLogLevel accepts debug-like input', () => {
  assert.equal(normalizeLogLevel('DEBUG'), 'debug');
  assert.equal(normalizeLogLevel('warn'), 'info');
});

test('readConfig preserves wallet decimal values', async () => {
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;
  const originalMqttHost = process.env.MQTT_HOST;

  fs.existsSync = (filePath) => filePath === '/data/options.json' ? true : originalExistsSync(filePath);
  fs.readFileSync = (filePath, encoding) => {
    if (filePath === '/data/options.json') {
      return JSON.stringify({
        email: 'test@example.com',
        password: 'secret',
        mqtt_host: 'localhost',
        wallet_write_enabled: true,
        wallet_token: 'wallet-token',
        wallet_paypal_fee_rate: 0.015,
        wallet_paypal_fee_min_usd: 0.35,
        wallet_paypal_fee_max_usd: 12.5,
        wallet_settlement_adjustment: 0.9975,
      });
    }

    return originalReadFileSync(filePath, encoding);
  };
  process.env.MQTT_HOST = 'localhost';

  try {
    const config = await readConfig();
    assert.equal(config.fast_poll_cron, '*/5 * * * * *');
    assert.equal(config.wallet_paypal_fee_rate, 0.015);
    assert.equal(config.wallet_paypal_fee_min_usd, 0.35);
    assert.equal(config.wallet_paypal_fee_max_usd, 12.5);
    assert.equal(config.wallet_settlement_adjustment, 0.9975);
  } finally {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    if (originalMqttHost === undefined) {
      delete process.env.MQTT_HOST;
    } else {
      process.env.MQTT_HOST = originalMqttHost;
    }
  }
});

test('readConfig defaults fast polling to 5 seconds and preserves explicit values', async () => {
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;
  const originalMqttHost = process.env.MQTT_HOST;

  fs.existsSync = (filePath) => filePath === '/data/options.json' ? true : originalExistsSync(filePath);
  fs.readFileSync = (filePath, encoding) => {
    if (filePath === '/data/options.json') {
      return JSON.stringify({
        email: 'test@example.com',
        password: 'secret',
        mqtt_host: 'localhost',
        fast_poll_cron: '*/15 * * * * *',
      });
    }

    return originalReadFileSync(filePath, encoding);
  };
  process.env.MQTT_HOST = 'localhost';

  try {
    const config = await readConfig();
    assert.equal(config.fast_poll_cron, '*/15 * * * * *');
  } finally {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    if (originalMqttHost === undefined) {
      delete process.env.MQTT_HOST;
    } else {
      process.env.MQTT_HOST = originalMqttHost;
    }
  }
});
