// @ts-nocheck
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { WalletSync, calculatePaypalFeeCents } = require('../../../src/wallet/wallet_sync.ts');

function createLogger() {
  return {
    debug() {},
    info() {},
    warning() {},
    error() {},
  };
}

function createWalletSync() {
  const sync = new WalletSync(
    {
      wallet_write_enabled: true,
      wallet_token: 'token',
      wallet_data_annotation_account_name: 'Data Annotation',
      wallet_gotyme_account_name: 'GoTyme',
      wallet_income_category_name: 'Income',
      wallet_fee_category_name: 'Charges, Fees',
      wallet_paypal_fee_rate: 0.01,
      wallet_paypal_fee_min_usd: 0.25,
      wallet_paypal_fee_max_usd: 10,
      wallet_settlement_adjustment: 0.99856,
    },
    createLogger()
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-wallet-sync-'));
  sync.statePath = path.join(dir, 'wallet-sync-state.json');

  return { sync, dir };
}

test('WalletSync imports new funds history entries once and dedupes on rerun', async () => {
  const { sync, dir } = createWalletSync();
  const createdRecords = [];
  let findCallCount = 0;

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currencyCode: 'PHP' },
      { id: 'gt', name: 'GoTyme', currencyCode: 'PHP' },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async () => {
      findCallCount += 1;
      return findCallCount === 1 ? [] : [{ id: 'record-1' }];
    },
    createRecords: async (records) => {
      createdRecords.push(records);
      return { results: records.map((record, index) => ({ success: true, id: `record-${index + 1}`, record })) };
    },
  };

  try {
    const payments = {
      pending_payout_entries: [
        {
          status: 'pending',
          project: 'Labeling Task',
          amount_cents: 1234,
          first_seen_at: '2026-07-14T11:00:00.000Z',
          fingerprint: 'fingerprint-123',
        },
      ],
      last_payout_at: null,
      available_amount_cents: 1234,
      available_amount: 12.34,
    };

    const currencyState = {
      convert_to_php: false,
      usd_php_rate: 61.579,
      usd_php_rate_date: '2026-07-14',
      usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z',
      usd_php_rate_source: 'frankfurter',
    };

    const first = await sync.processSync({
      payments,
      fundsHistorySnapshot: { pending_payout_entries: payments.pending_payout_entries },
      includeFundsHistory: true,
      currencyState,
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(first.enabled, true);
    assert.equal(first.changed, true);
    assert.equal(createdRecords.length, 1);
    assert.equal(createdRecords[0][0].paymentType, 'web_payment');
    assert.equal(createdRecords[0][0].recordState, 'cleared');
    assert.equal(createdRecords[0][0].amount.currencyCode, 'PHP');
    assert.match(createdRecords[0][0].note, /^DAWALLET\|income\|DAWALLET\|inc\|/);

    const second = await sync.processSync({
      payments,
      fundsHistorySnapshot: { pending_payout_entries: payments.pending_payout_entries },
      includeFundsHistory: true,
      currencyState,
      now: new Date('2026-07-14T12:05:00.000Z'),
    });

    assert.equal(second.enabled, true);
    assert.equal(second.changed, false);
    assert.equal(createdRecords.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync recreates a missing income record when sync state is stale', async () => {
  const { sync, dir } = createWalletSync();
  const createdRecords = [];

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currencyCode: 'PHP' },
      { id: 'gt', name: 'GoTyme', currencyCode: 'PHP' },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async () => [],
    createRecords: async (records) => {
      createdRecords.push(records);
      return { results: records.map((record, index) => ({ success: true, id: `record-${index + 1}`, record })) };
    },
  };

  try {
    const payments = {
      pending_payout_entries: [
        {
          status: 'pending',
          project: 'Labeling Task',
          amount_cents: 1234,
          first_seen_at: '2026-07-14T11:00:00.000Z',
          fingerprint: 'fingerprint-123',
        },
      ],
      last_payout_at: null,
      available_amount_cents: 1234,
      available_amount: 12.34,
    };

    const currencyState = {
      convert_to_php: false,
      usd_php_rate: 61.579,
      usd_php_rate_date: '2026-07-14',
      usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z',
      usd_php_rate_source: 'frankfurter',
    };

    const first = await sync.processSync({
      payments,
      fundsHistorySnapshot: { pending_payout_entries: payments.pending_payout_entries },
      includeFundsHistory: true,
      currencyState,
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(first.enabled, true);
    assert.equal(first.changed, true);
    assert.equal(createdRecords.length, 1);

    sync.client.findRecordsByNote = async () => [];

    const second = await sync.processSync({
      payments,
      fundsHistorySnapshot: { pending_payout_entries: payments.pending_payout_entries },
      includeFundsHistory: true,
      currencyState,
      now: new Date('2026-07-14T12:05:00.000Z'),
    });

    assert.equal(second.enabled, true);
    assert.equal(second.changed, true);
    assert.equal(createdRecords.length, 2);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.equal(Object.keys(state.imported_funds_entries).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync marks a partial income batch as failed and backs off', async () => {
  const { sync, dir } = createWalletSync();
  const createdRecords = [];

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currencyCode: 'PHP' },
      { id: 'gt', name: 'GoTyme', currencyCode: 'PHP' },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async () => [],
    createRecords: async (records) => {
      createdRecords.push(records);
      return {
        status: 207,
        results: [
          { success: true, id: 'record-1', record: records[0] },
          { success: false, error: 'validation failed' },
        ],
      };
    },
  };

  try {
    const payments = {
      pending_payout_entries: [
        { status: 'pending', project: 'Labeling Task A', amount_cents: 1000, first_seen_at: '2026-07-14T11:00:00.000Z', fingerprint: 'fingerprint-a' },
        { status: 'pending', project: 'Labeling Task B', amount_cents: 2000, first_seen_at: '2026-07-14T11:05:00.000Z', fingerprint: 'fingerprint-b' },
      ],
      last_payout_at: null,
      available_amount_cents: 3000,
      available_amount: 30,
    };

    const currencyState = {
      convert_to_php: false,
      usd_php_rate: 61.579,
      usd_php_rate_date: '2026-07-14',
      usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z',
      usd_php_rate_source: 'frankfurter',
    };

    const result = await sync.processSync({
      payments,
      fundsHistorySnapshot: { pending_payout_entries: payments.pending_payout_entries },
      includeFundsHistory: true,
      currencyState,
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(result.enabled, true);
    assert.equal(result.changed, false);
    assert.match(result.error, /Wallet income batch incomplete/);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.equal(Object.keys(state.imported_funds_entries).length, 1);
    assert.ok(state.wallet_api_retry_after_at);
    assert.equal(createdRecords.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync records a confirmed withdrawal only after explicit submission', async () => {
  const { sync, dir } = createWalletSync();
  const createdRecords = [];

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currencyCode: 'PHP' },
      { id: 'gt', name: 'GoTyme', currencyCode: 'PHP' },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async () => [],
    createRecords: async (records) => {
      createdRecords.push(records);
      return { results: records.map((record, index) => ({ success: true, id: `record-${createdRecords.length}-${index + 1}`, record })) };
    },
  };

  try {
    const baselinePayments = {
      last_payout_at: '2026-07-14T11:30:00.000Z',
      last_payout_amount_cents: 1000,
      available_amount_cents: 0,
      available_amount: 0,
    };

    const currencyState = {
      convert_to_php: false,
      usd_php_rate: 61.579,
      usd_php_rate_date: '2026-07-14',
      usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z',
      usd_php_rate_source: 'frankfurter',
    };

    const baseline = await sync.processSync({
      payments: baselinePayments,
      includeFundsHistory: false,
      currencyState,
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(baseline.enabled, true);
    assert.equal(baseline.changed, false);
    assert.equal(createdRecords.length, 0);

    const withdrawal = await sync.recordWithdrawalSubmission({
      payments: {
        ...baselinePayments,
        last_payout_amount_cents: 50500,
        last_payout_amount: 505,
        last_payout_at: '2026-07-15T11:30:00.000Z',
      },
      currencyState,
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    assert.equal(withdrawal.enabled, true);
    assert.equal(withdrawal.changed, true);
    assert.equal(createdRecords.length, 2);
    assert.equal(createdRecords[0][0].paymentType, 'transfer');
    assert.equal(createdRecords[0][0].categoryId, 'fees');
    assert.equal(createdRecords[0][0].amount.currencyCode, 'PHP');
    assert.match(createdRecords[0][0].note, /fee=\$5\.05/);
    assert.equal(createdRecords[1][0].transfer.accountId, 'gt');
    assert.equal(createdRecords[1][0].recordState, 'cleared');
    assert.equal(createdRecords[1][0].amount.currencyCode, 'PHP');
    assert.match(createdRecords[1][0].note, /fee=\$5\.05/);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.equal(Object.keys(state.withdrawal_events).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('calculatePaypalFeeCents applies the 1% fee with no minimum floor', async () => {
  assert.equal(calculatePaypalFeeCents(50500, { feeRate: 0.01, feeMaxUsd: 10 }), 505);
  assert.equal(calculatePaypalFeeCents(2500, { feeRate: 0.01, feeMaxUsd: 10 }), 25);
  assert.equal(calculatePaypalFeeCents(2_000_000, { feeRate: 0.01, feeMaxUsd: 10 }), 1000);
});

test('WalletSync persists a backoff when the Wallet API rate limits requests', async () => {
  const { sync, dir } = createWalletSync();
  let fetchCount = 0;

  sync.client = {
    fetchAccounts: async () => {
      fetchCount += 1;
      const error = new Error('rate limited');
      error.status = 429;
      error.retryAfterSeconds = 60;
      throw error;
    },
    fetchCategories: async () => [],
    findRecordsByNote: async () => [],
    createRecords: async () => ({ results: [] }),
  };

  try {
    const result = await sync.processSync({
      payments: { pending_payout_entries: [], available_amount_cents: 0, available_amount: 0 },
      includeFundsHistory: true,
      currencyState: { convert_to_php: false, usd_php_rate: 61.579, usd_php_rate_date: '2026-07-14', usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z', usd_php_rate_source: 'frankfurter' },
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(result.enabled, true);
    assert.equal(result.changed, false);
    assert.equal(fetchCount, 1);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.ok(state.wallet_api_retry_after_at);
    assert.equal(state.wallet_api_failure_count, 1);

    const skipped = await sync.processSync({
      payments: { pending_payout_entries: [], available_amount_cents: 0, available_amount: 0 },
      includeFundsHistory: true,
      currencyState: { convert_to_php: false, usd_php_rate: 61.579, usd_php_rate_date: '2026-07-14', usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z', usd_php_rate_source: 'frankfurter' },
      now: new Date('2026-07-14T12:00:30.000Z'),
    });

    assert.equal(skipped.reason, 'wallet_backoff');
    assert.equal(fetchCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync accepts Wallet account currency from nested account currency data', async () => {
  const { sync, dir } = createWalletSync();

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currency: { code: 'PHP' } },
      { id: 'gt', name: 'GoTyme', currency: { code: 'PHP' } },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async () => [],
    createRecords: async () => ({ results: [] }),
  };

  try {
    const result = await sync.processSync({
      payments: {
        pending_payout_entries: [],
        last_payout_at: null,
        available_amount_cents: 0,
        available_amount: 0,
      },
      includeFundsHistory: false,
      currencyState: {
        convert_to_php: false,
        usd_php_rate: 61.579,
        usd_php_rate_date: '2026-07-14',
        usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z',
        usd_php_rate_source: 'frankfurter',
      },
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(result.enabled, true);
    assert.equal(result.changed, false);
    assert.equal(result.reason, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
