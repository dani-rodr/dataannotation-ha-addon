const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_FAST_POLL_CRON,
  computeNextRunAt,
  getPollingCronIntervalSeconds,
  normalizePollingCron,
  validatePollingCron,
} = require('../../../src/shared/polling_schedule.ts');

test('normalizePollingCron keeps the supported simple schedules', () => {
  assert.equal(normalizePollingCron('*/5 * * * *'), '*/5 * * * *');
  assert.equal(normalizePollingCron('*/5 * * * * *'), '*/5 * * * * *');
  assert.equal(normalizePollingCron('*/30 * * * * *'), '*/30 * * * * *');
});

test('default fast poll runs every 5 seconds', () => {
  assert.equal(DEFAULT_FAST_POLL_CRON, '*/5 * * * * *');
});

test('computeNextRunAt advances to the next cron boundary', () => {
  assert.equal(computeNextRunAt('*/5 * * * *', '2026-06-27T19:44:30.000Z'), '2026-06-27T19:45:00.000Z');
  assert.equal(computeNextRunAt('*/30 * * * * *', '2026-06-27T19:44:31.500Z'), '2026-06-27T19:45:00.000Z');
});

test('validatePollingCron rejects sub-5-second schedules', () => {
  assert.doesNotThrow(() => validatePollingCron('*/5 * * * * *'));
  assert.throws(() => validatePollingCron('*/4 * * * * *'));
  assert.throws(() => validatePollingCron('* * * * * *'));
});

test('getPollingCronIntervalSeconds reports the simple schedule interval', () => {
  assert.equal(getPollingCronIntervalSeconds('*/5 * * * *'), 300);
  assert.equal(getPollingCronIntervalSeconds('*/30 * * * * *'), 30);
});
