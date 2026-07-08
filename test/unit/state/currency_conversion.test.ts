const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  computeNextFxRateRefreshAt,
  convertPaymentsForCurrency,
  convertProjectsForCurrency,
  getDisplayCurrency,
  loadCurrencyState,
  normalizeCurrencyState,
  saveCurrencyState,
  shouldRefreshCurrencyRate,
} = require('../../../src/state/currency_conversion.ts');

test('normalizeCurrencyState defaults to USD mode', () => {
  const state = normalizeCurrencyState({});

  assert.equal(state.convert_to_php, false);
  assert.equal(state.usd_php_rate, null);
});

test('currency state round-trips through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-currency-'));
  const filePath = path.join(dir, 'currency-state.json');

  try {
    assert.equal(loadCurrencyState(filePath).convert_to_php, false);
    saveCurrencyState(filePath, {
      convert_to_php: true,
      usd_php_rate: 61.471,
      usd_php_rate_date: '2026-07-03',
      usd_php_rate_fetched_at: '2026-07-03T15:30:00.000Z',
      usd_php_rate_source: 'frankfurter',
    });
    const loaded = loadCurrencyState(filePath);

    assert.equal(loaded.convert_to_php, true);
    assert.equal(loaded.usd_php_rate, 61.471);
    assert.equal(loaded.usd_php_rate_date, '2026-07-03');
    assert.equal(loaded.usd_php_rate_source, 'frankfurter');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('computeNextFxRateRefreshAt schedules a UTC daily refresh', () => {
  assert.equal(computeNextFxRateRefreshAt('2026-07-03T14:00:00.000Z'), '2026-07-03T15:30:00.000Z');
  assert.equal(computeNextFxRateRefreshAt('2026-07-03T16:00:00.000Z'), '2026-07-04T15:30:00.000Z');
});

test('shouldRefreshCurrencyRate refreshes stale cached rates after the daily window', () => {
  assert.equal(
    shouldRefreshCurrencyRate({ usd_php_rate: 61.471, usd_php_rate_date: '2026-07-02' }, new Date('2026-07-03T14:00:00.000Z')),
    false
  );
  assert.equal(
    shouldRefreshCurrencyRate({ usd_php_rate: 61.471, usd_php_rate_date: '2026-07-02' }, new Date('2026-07-03T16:00:00.000Z')),
    true
  );
});

test('convertProjectsForCurrency converts pay fields into PHP', () => {
  const projects = convertProjectsForCurrency([
    {
      name: 'Example',
      pay: '$55.00/hr',
      base_pay: '$40.00/hr',
      priority_pay: '$15.00/hr',
    },
  ], {
    convert_to_php: true,
    usd_php_rate: 61.471,
  });

  assert.equal(getDisplayCurrency({ convert_to_php: true, usd_php_rate: 61.471 }), 'PHP');
  assert.equal(projects[0].currency, 'PHP');
  assert.equal(projects[0].pay, 'PHP 3,380.91/hr');
  assert.equal(projects[0].base_pay, 'PHP 2,458.84/hr');
  assert.equal(projects[0].priority_pay, 'PHP 922.07/hr');
});

test('convertPaymentsForCurrency converts monetary summary fields into PHP', () => {
  const payments = convertPaymentsForCurrency(
    {
      available_amount: 371.25,
      available_amount_cents: 37125,
      available_amount_formatted: '$371.25',
      total_earnings: 2236.19,
      total_earnings_cents: 223619,
      total_earnings_formatted: '$2,236.19',
      total_paid_out: 403.76,
      total_paid_out_cents: 40376,
      total_paid_out_formatted: '$403.76',
      this_month: 2236.19,
      this_month_cents: 223619,
      this_month_formatted: '$2,236.19',
      best_month: 2236.19,
      best_month_cents: 223619,
      best_month_formatted: '$2,236.19',
      pending_approval: 1832.43,
      pending_approval_cents: 183243,
      pending_approval_formatted: '$1,832.43',
      next_payout_amount: 12.34,
      next_payout_entries: [{ amount: '$12.34', amount_cents: 1234 }],
      pending_payout_entries: [{ amount: '$12.34', amount_cents: 1234 }],
    },
    {
      convert_to_php: true,
      usd_php_rate: 61.471,
    }
  );

  assert.equal(payments.currency, 'PHP');
  assert.equal(payments.available_amount, 22821.11);
  assert.equal(payments.available_amount_cents, 2282111);
  assert.equal(payments.available_amount_formatted, 'PHP 22,821.11');
  assert.equal(payments.total_earnings, 137460.84);
  assert.equal(payments.total_paid_out, 24819.53);
  assert.equal(payments.this_month_formatted, 'PHP 137,460.84');
  assert.equal(payments.next_payout_amount, 758.55);
  assert.equal(payments.next_payout_entries[0].amount, 'PHP 758.55');
  assert.equal(payments.pending_payout_entries[0].amount, 'PHP 758.55');
});

test('convertPaymentsForCurrency converts formatted next payout amounts into PHP', () => {
  const payments = convertPaymentsForCurrency(
    {
      next_payout_amount: '$12.34',
    },
    {
      convert_to_php: true,
      usd_php_rate: 61.471,
    }
  );

  assert.equal(payments.next_payout_amount, 'PHP 758.55');
});

test('convertPaymentsForCurrency converts withdrawal button labels into PHP', () => {
  const payments = convertPaymentsForCurrency(
    {
      button_text: 'Get paid $1,087.17',
      withdraw_button_text: 'Get paid $1,087.17',
    },
    {
      convert_to_php: true,
      usd_php_rate: 60,
    }
  );

  assert.equal(payments.button_text, 'Get paid PHP 65,230.20');
  assert.equal(payments.withdraw_button_text, 'Get paid PHP 65,230.20');
});
