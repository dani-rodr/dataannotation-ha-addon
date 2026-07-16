// @ts-nocheck
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { WalletSync, calculatePaypalFeeCents } = require('../../../src/wallet/wallet_sync.ts');
const { pickFundsHistoryFields } = require('../../../src/state/sync_policy.ts');

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
       wallet_settlement_adjustment: 0.99985676,
    },
    createLogger()
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-wallet-sync-'));
  sync.statePath = path.join(dir, 'wallet-sync-state.json');

  return { sync, dir };
}

function buildIncomeMarker(sourceFingerprint, occurrence = 1) {
  return `DAWALLET|inc|${crypto.createHash('sha1').update(String(sourceFingerprint || '')).digest('hex').slice(0, 12)}#${Math.max(1, Math.trunc(Number(occurrence) || 1))}`;
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

test('WalletSync corrects an existing pending record without creating a duplicate', async () => {
  const { sync, dir } = createWalletSync();
  sync.config.wallet_settlement_adjustment = 1;
  const sourceFingerprint = 'existing-pending-record';
  const marker = buildIncomeMarker(sourceFingerprint);
  const createdRecords = [];
  const patchCalls = [];

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currencyCode: 'PHP' },
      { id: 'gt', name: 'GoTyme', currencyCode: 'PHP' },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async () => [{ id: 'existing-record' }],
    fetchRecords: async () => [{
      id: 'existing-record',
      accountId: 'da',
      accountIsBankSync: false,
      paymentType: 'web_payment',
      transfer: null,
      amount: { value: 600, currencyCode: 'PHP' },
      note: `DAWALLET|income|${marker} proj=Existing project usd=$10.00 php=PHP 600.00 rate=60.0000`,
    }],
    createRecords: async (records) => {
      createdRecords.push(records);
      return { results: records.map((record) => ({ success: true, id: 'unexpected-create', record })) };
    },
    patchRecords: async (records) => {
      patchCalls.push(records);
      return { results: records.map((record) => ({ success: true, id: record.id, record })) };
    },
  };

  try {
    const payments = {
      pending_payout_entries: [{
        status: 'pending',
        project: 'Existing project',
        amount_cents: 1000,
        first_seen_at: '2026-07-14T11:00:00.000Z',
        observation_id: sourceFingerprint,
      }],
      available_amount_cents: 0,
      available_amount: 0,
    };
    const result = await sync.processSync({
      payments,
      fundsHistorySnapshot: pickFundsHistoryFields(payments),
      includeFundsHistory: true,
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
    assert.equal(createdRecords.length, 0);
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0][0].id, 'existing-record');
    assert.equal(patchCalls[0][0].amount, 615.79);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync verifies the current amount when a queued record rate already matches', async () => {
  const { sync, dir } = createWalletSync();
  const marker = buildIncomeMarker('active-amount-mismatch');
  const patchCalls = [];

  sync.client = {
    fetchRecords: async () => [{
      id: 'active-record',
      accountId: 'da',
      accountIsBankSync: false,
      paymentType: 'web_payment',
      transfer: null,
      amount: { value: 600, currencyCode: 'PHP' },
      note: `DAWALLET|income|${marker} proj=Active project usd=$10.00 php=PHP 600.00 rate=61.5790`,
    }],
    patchRecords: async (records) => {
      patchCalls.push(records);
      return { results: records.map((record) => ({ success: true, id: record.id, record })) };
    },
  };

  try {
    const state = {
      last_applied_settlement_rate: 60,
      pending_revaluation: { settlement_rate: 61.579 },
      imported_funds_entries: {
        [marker]: {
          note_marker: marker,
          source_type: 'income',
          source_fingerprint: 'active-amount-mismatch',
          source_amount_usd_cents: 1000,
          source_amount_php_cents: 60000,
          source_rate: 61.579,
          record_id: 'active-record',
          status: 'pending',
        },
      },
    };

    const result = await sync._applyQueuedRevaluation({
      state,
      referenceData: { dataAnnotationAccount: { id: 'da' } },
      fx: { referenceRate: 61.579, settlementRate: 61.579 },
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(result.changed, true);
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0][0].amount, 615.79);
    assert.equal(state.last_applied_settlement_rate, 61.579);
    assert.equal(state.pending_revaluation, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync leaves a manually deleted income record absent instead of recreating it', async () => {
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
    assert.equal(createdRecords.length, 1);

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
    assert.equal(createdRecords.length, 0);

    const trackedIncomeMarker = buildIncomeMarker('withdrawal-income');
    const unrelatedIncomeMarker = buildIncomeMarker('unrelated-available-income');
    const trackedState = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    trackedState.imported_funds_entries[trackedIncomeMarker] = {
      key: trackedIncomeMarker,
      note_marker: trackedIncomeMarker,
      source_type: 'income',
      source_fingerprint: 'withdrawal-income',
      source_amount_usd_cents: 50500,
      source_amount_php_cents: 3_000_000,
      source_rate: 60,
      record_id: 'record-income-withdrawal',
      status: 'available',
      status_updated_at: '2026-07-14T11:00:00.000Z',
    };
    trackedState.imported_funds_entries[unrelatedIncomeMarker] = {
      key: unrelatedIncomeMarker,
      note_marker: unrelatedIncomeMarker,
      source_type: 'income',
      source_fingerprint: 'unrelated-available-income',
      source_amount_usd_cents: 1000,
      source_amount_php_cents: 60_000,
      source_rate: 60,
      record_id: 'record-income-unrelated',
      status: 'available',
      status_updated_at: '2026-07-14T11:00:00.000Z',
    };
    fs.writeFileSync(sync.statePath, JSON.stringify(trackedState, null, 2));

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
    assert.match(createdRecords[0][0].note, /php=PHP 3\d\d\.\d{2}/);
    assert.equal(createdRecords[1][0].transfer.accountId, 'gt');
    assert.equal(createdRecords[1][0].recordState, 'cleared');
    assert.equal(createdRecords[1][0].amount.currencyCode, 'PHP');
    assert.match(createdRecords[1][0].note, /fee=\$5\.05/);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.equal(Object.keys(state.withdrawal_events).length, 1);
    assert.equal(state.imported_funds_entries[trackedIncomeMarker].status, 'transferred');
    assert.equal(state.imported_funds_entries[trackedIncomeMarker].withdrawal_marker, Object.keys(state.withdrawal_events)[0]);
    assert.equal(state.imported_funds_entries[unrelatedIncomeMarker].status, 'available');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync revalues current pending income and locks historical income outside the pending set', async () => {
  const { sync, dir } = createWalletSync();
  sync.config.wallet_settlement_adjustment = 1;

  const pendingFingerprint = 'obs-pending';
  const historicalFingerprint = 'obs-historical';
  const pendingMarker = buildIncomeMarker(pendingFingerprint);
  const historicalMarker = buildIncomeMarker(historicalFingerprint);
  const patchCalls = [];

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currencyCode: 'PHP' },
      { id: 'gt', name: 'GoTyme', currencyCode: 'PHP' },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async ({ noteMarker }) => {
      if (noteMarker === pendingMarker) {
        return [{ id: 'record-pending' }];
      }

      return [];
    },
    fetchRecords: async ({ id }) => {
      if (id === 'record-pending') {
        return [{
          id: 'record-pending',
          accountId: 'da',
          accountIsBankSync: false,
          paymentType: 'web_payment',
          transfer: null,
          amount: { value: 10, currencyCode: 'PHP' },
          note: `DAWALLET|income|${pendingMarker} proj=Pending project usd=$10.00 php=PHP 9.00 rate=60.0000`,
        }];
      }

      return [];
    },
    patchRecords: async (records) => {
      patchCalls.push(records);
      return { results: records.map((record) => ({ success: true, id: record.id, record })) };
    },
    createRecords: async () => ({ results: [] }),
  };

  try {
    fs.writeFileSync(sync.statePath, JSON.stringify({
      version: 3,
      imported_funds_entries: {
        [pendingMarker]: {
          key: pendingMarker,
          note_marker: pendingMarker,
          source_marker: pendingFingerprint,
          source_observation_id: pendingFingerprint,
          source_project: 'Pending project',
          record_id: 'record-pending',
          source_type: 'income',
          source_fingerprint: pendingFingerprint,
          source_amount_usd_cents: 1000,
          source_amount_php_cents: 900,
          source_rate: 60,
          status: 'historical_locked',
          status_updated_at: '2026-07-14T11:00:00.000Z',
          created_at: '2026-07-14T11:00:00.000Z',
        },
        [historicalMarker]: {
          key: historicalMarker,
          note_marker: historicalMarker,
          source_marker: historicalFingerprint,
          source_observation_id: historicalFingerprint,
          source_project: 'Old project',
          record_id: 'record-historical',
          source_type: 'income',
          source_fingerprint: historicalFingerprint,
          source_amount_usd_cents: 2000,
          source_amount_php_cents: 1800,
          source_rate: 60,
          status: 'historical_locked',
          status_updated_at: '2026-07-14T11:00:00.000Z',
          created_at: '2026-07-14T11:00:00.000Z',
        },
      },
      withdrawal_events: {},
    }, null, 2));

    const result = await sync.processSync({
      payments: {
        pending_payout_entries: [
          {
            status: 'pending',
            project: 'Pending project',
            amount_cents: 1000,
            first_seen_at: '2026-07-14T11:00:00.000Z',
            observation_id: pendingFingerprint,
          },
        ],
        available_amount_cents: 0,
        available_amount: 0,
      },
      fundsHistorySnapshot: {
        pending_payout_entries: [
          {
            status: 'pending',
            project: 'Pending project',
            amount_cents: 1000,
            first_seen_at: '2026-07-14T11:00:00.000Z',
            observation_id: pendingFingerprint,
          },
        ],
      },
      includeFundsHistory: true,
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
    assert.equal(result.changed, true);
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].length, 1);
    assert.equal(patchCalls[0][0].id, 'record-pending');
    assert.equal(patchCalls[0][0].amount, 615.79);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.equal(state.imported_funds_entries[pendingMarker].status, 'pending');
    assert.equal(state.imported_funds_entries[pendingMarker].source_rate, 61.579);
    assert.equal(state.imported_funds_entries[pendingMarker].source_amount_php_cents, 61579);
    assert.equal(state.imported_funds_entries[historicalMarker].status, 'historical_locked');
    assert.equal(state.imported_funds_entries[historicalMarker].source_rate, 60);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync revalues available funds only when the missing pending set matches the available balance exactly', async () => {
  const { sync, dir } = createWalletSync();
  sync.config.wallet_settlement_adjustment = 1;

  const markerA = buildIncomeMarker('obs-available-a');
  const markerB = buildIncomeMarker('obs-available-b');
  const patchCalls = [];

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
    fetchRecords: async ({ id }) => {
      if (id === 'record-a') {
        return [{
          id: 'record-a',
          accountId: 'da',
          accountIsBankSync: false,
          paymentType: 'web_payment',
          transfer: null,
          amount: { value: 10, currencyCode: 'PHP' },
          note: `DAWALLET|income|${markerA} proj=Available A usd=$10.00 php=PHP 9.00 rate=60.0000`,
        }];
      }

      if (id === 'record-b') {
        return [{
          id: 'record-b',
          accountId: 'da',
          accountIsBankSync: false,
          paymentType: 'web_payment',
          transfer: null,
          amount: { value: 20, currencyCode: 'PHP' },
          note: `DAWALLET|income|${markerB} proj=Available B usd=$20.00 php=PHP 18.00 rate=60.0000`,
        }];
      }

      return [];
    },
    patchRecords: async (records) => {
      patchCalls.push(records);
      return { results: records.map((record) => ({ success: true, id: record.id, record })) };
    },
    createRecords: async () => ({ results: [] }),
  };

  try {
    fs.writeFileSync(sync.statePath, JSON.stringify({
      version: 2,
      imported_funds_entries: {
        [markerA]: {
          key: markerA,
          note_marker: markerA,
          source_marker: 'obs-available-a',
          source_observation_id: 'obs-available-a',
          source_project: 'Available A',
          record_id: 'record-a',
          source_type: 'income',
          source_fingerprint: 'obs-available-a',
          source_amount_usd_cents: 1000,
          source_amount_php_cents: 900,
          source_rate: 60,
          created_at: '2026-07-14T11:00:00.000Z',
        },
        [markerB]: {
          key: markerB,
          note_marker: markerB,
          source_marker: 'obs-available-b',
          source_observation_id: 'obs-available-b',
          source_project: 'Available B',
          record_id: 'record-b',
          source_type: 'income',
          source_fingerprint: 'obs-available-b',
          source_amount_usd_cents: 2000,
          source_amount_php_cents: 1800,
          source_rate: 60,
          created_at: '2026-07-14T11:00:00.000Z',
        },
      },
      withdrawal_events: {},
    }, null, 2));

    const result = await sync.processSync({
      payments: {
        pending_payout_entries: [],
        available_amount_cents: 3000,
        available_amount: 30,
      },
      fundsHistorySnapshot: pickFundsHistoryFields({
        pending_payout_entries: [],
        available_amount_cents: 3000,
        available_amount: 30,
      }),
      includeFundsHistory: true,
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
    assert.equal(result.changed, true);
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].length, 2);
    assert.deepEqual(patchCalls[0].map((item) => item.id).sort(), ['record-a', 'record-b']);
    assert.equal(patchCalls[0][0].amount, 615.79);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.equal(state.imported_funds_entries[markerA].status, 'available');
    assert.equal(state.imported_funds_entries[markerB].status, 'available');
    assert.equal(state.imported_funds_entries[markerA].source_rate, 61.579);
    assert.equal(state.imported_funds_entries[markerB].source_rate, 61.579);
    assert.equal(state.last_applied_settlement_rate, 61.579);
    assert.equal(state.pending_revaluation, null);

    const second = await sync.processSync({
      payments: {
        pending_payout_entries: [],
        available_amount_cents: 3000,
        available_amount: 30,
      },
      fundsHistorySnapshot: pickFundsHistoryFields({
        pending_payout_entries: [],
        available_amount_cents: 3000,
        available_amount: 30,
      }),
      includeFundsHistory: true,
      currencyState: {
        convert_to_php: false,
        usd_php_rate: 61.579,
        usd_php_rate_date: '2026-07-14',
        usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z',
        usd_php_rate_source: 'frankfurter',
      },
      now: new Date('2026-07-14T12:05:00.000Z'),
    });

    assert.equal(second.changed, false);
    assert.equal(patchCalls.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync keeps a revaluation queued when the Wallet PATCH response has no matching result', async () => {
  const { sync, dir } = createWalletSync();
  sync.config.wallet_settlement_adjustment = 1;

  const sourceFingerprint = 'obs-patch-response-missing';
  const marker = buildIncomeMarker(sourceFingerprint);
  let patchCallCount = 0;

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currencyCode: 'PHP' },
      { id: 'gt', name: 'GoTyme', currencyCode: 'PHP' },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async () => [{ id: 'record-active' }],
    fetchRecords: async () => [{
      id: 'record-active',
      accountId: 'da',
      accountIsBankSync: false,
      paymentType: 'web_payment',
      transfer: null,
      amount: { value: 600, currencyCode: 'PHP' },
      note: `DAWALLET|income|${marker} proj=Active project usd=$10.00 php=PHP 600.00 rate=60.0000`,
    }],
    patchRecords: async () => {
      patchCallCount += 1;
      return { results: [] };
    },
    createRecords: async () => ({ results: [] }),
  };

  try {
    fs.writeFileSync(sync.statePath, JSON.stringify({
      version: 4,
      imported_funds_entries: {
        [marker]: {
          key: marker,
          note_marker: marker,
          source_marker: sourceFingerprint,
          source_observation_id: sourceFingerprint,
          source_project: 'Active project',
          record_id: 'record-active',
          source_type: 'income',
          source_fingerprint: sourceFingerprint,
          source_amount_usd_cents: 1000,
          source_amount_php_cents: 60000,
          source_rate: 60,
          status: 'pending',
          status_updated_at: '2026-07-14T11:00:00.000Z',
          created_at: '2026-07-14T11:00:00.000Z',
        },
      },
      withdrawal_events: {},
    }, null, 2));

    const result = await sync.processSync({
      payments: {
        pending_payout_entries: [{
          status: 'pending',
          project: 'Active project',
          amount_cents: 1000,
          first_seen_at: '2026-07-14T11:00:00.000Z',
          observation_id: sourceFingerprint,
        }],
        available_amount_cents: 0,
        available_amount: 0,
      },
      fundsHistorySnapshot: pickFundsHistoryFields({
        pending_payout_entries: [{
          status: 'pending',
          project: 'Active project',
          amount_cents: 1000,
          first_seen_at: '2026-07-14T11:00:00.000Z',
          observation_id: sourceFingerprint,
        }],
        available_amount_cents: 0,
        available_amount: 0,
      }),
      includeFundsHistory: true,
      currencyState: {
        convert_to_php: false,
        usd_php_rate: 61.579,
        usd_php_rate_date: '2026-07-14',
        usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z',
        usd_php_rate_source: 'frankfurter',
      },
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(result.changed, true);
    assert.equal(patchCallCount, 1);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.equal(state.last_applied_settlement_rate, null);
    assert.equal(state.pending_revaluation.settlement_rate, 61.579);
    assert.equal(state.imported_funds_entries[marker].source_rate, 60);
    assert.equal(state.imported_funds_entries[marker].source_amount_php_cents, 60000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync does not revalue entries when Available Funds has an ambiguous subset match', async () => {
  const { sync, dir } = createWalletSync();
  let patchCallCount = 0;
  const entries = {};

  for (const [index, amount] of [1000, 2000, 3000].entries()) {
    const marker = buildIncomeMarker(`obs-ambiguous-${index}`);
    entries[marker] = {
      key: marker,
      note_marker: marker,
      source_type: 'income',
      source_fingerprint: `obs-ambiguous-${index}`,
      source_amount_usd_cents: amount,
      source_amount_php_cents: amount * 60,
      source_rate: 60,
      record_id: `record-${index}`,
      status: 'pending',
      status_updated_at: '2026-07-14T11:00:00.000Z',
    };
  }

  sync.client = {
    patchRecords: async () => {
      patchCallCount += 1;
      return { results: [] };
    },
  };

  try {
    const state = {
      imported_funds_entries: entries,
      pending_revaluation: { settlement_rate: 61.579 },
      last_applied_settlement_rate: null,
    };

    const reconciliation = sync._reconcileIncomeStatuses({
      state,
      currentPendingMarkers: new Set(),
      availableAmountCents: 3000,
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(reconciliation.changed, true);
    assert.deepEqual(Object.values(entries).map((entry) => entry.status), ['unclassified', 'unclassified', 'unclassified']);

    const applied = await sync._applyQueuedRevaluation({
      state,
      referenceData: { dataAnnotationAccount: { id: 'da' } },
      fx: { referenceRate: 61.579, settlementRate: 61.579 },
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(applied.changed, false);
    assert.equal(patchCallCount, 0);
    assert.equal(state.last_applied_settlement_rate, null);
    assert.equal(state.pending_revaluation.settlement_rate, 61.579);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync keeps active entries unresolved when Funds History is incomplete', async () => {
  const { sync, dir } = createWalletSync();
  const markerA = buildIncomeMarker('obs-incomplete-a');
  const markerB = buildIncomeMarker('obs-incomplete-b');
  const state = {
    imported_funds_entries: {
      [markerA]: {
        note_marker: markerA,
        source_type: 'income',
        source_amount_usd_cents: 1000,
        source_rate: 60,
        record_id: 'record-a',
        status: 'available',
      },
      [markerB]: {
        note_marker: markerB,
        source_type: 'income',
        source_amount_usd_cents: 2000,
        source_rate: 60,
        record_id: 'record-b',
        status: 'pending',
      },
    },
    pending_revaluation: { settlement_rate: 61.579 },
    last_applied_settlement_rate: null,
  };

  try {
    const reconciliation = sync._reconcileIncomeStatuses({
      state,
      currentPendingMarkers: new Set(),
      availableAmountCents: 0,
      historyComplete: false,
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(reconciliation.changed, true);
    assert.equal(state.imported_funds_entries[markerA].status, 'unclassified');
    assert.equal(state.imported_funds_entries[markerB].status, 'unclassified');

    const applied = await sync._applyQueuedRevaluation({
      state,
      referenceData: { dataAnnotationAccount: { id: 'da' } },
      fx: { referenceRate: 61.579, settlementRate: 61.579 },
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(applied.changed, false);
    assert.equal(state.last_applied_settlement_rate, null);
    assert.equal(state.pending_revaluation.settlement_rate, 61.579);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WalletSync does not patch an income record that is no longer in the Data Annotation account', async () => {
  const { sync, dir } = createWalletSync();
  sync.config.wallet_settlement_adjustment = 1;

  const sourceFingerprint = 'obs-moved-record';
  const marker = buildIncomeMarker(sourceFingerprint);
  let patchCallCount = 0;

  sync.client = {
    fetchAccounts: async () => [
      { id: 'da', name: 'Data Annotation', currencyCode: 'PHP' },
      { id: 'gt', name: 'GoTyme', currencyCode: 'PHP' },
    ],
    fetchCategories: async () => [
      { id: 'income', name: 'Income', archived: false },
      { id: 'fees', name: 'Charges, Fees', archived: false },
    ],
    findRecordsByNote: async () => [{ id: 'record-moved' }],
    fetchRecords: async () => [{
      id: 'record-moved',
      accountId: 'other-account',
      accountIsBankSync: false,
      paymentType: 'web_payment',
      transfer: null,
      amount: { value: 600, currencyCode: 'PHP' },
      note: `DAWALLET|income|${marker} proj=Moved project usd=$10.00 php=PHP 600.00 rate=60.0000`,
    }],
    patchRecords: async () => {
      patchCallCount += 1;
      return { results: [] };
    },
    createRecords: async () => ({ results: [] }),
  };

  try {
    fs.writeFileSync(sync.statePath, JSON.stringify({
      version: 4,
      imported_funds_entries: {
        [marker]: {
          key: marker,
          note_marker: marker,
          source_marker: sourceFingerprint,
          source_observation_id: sourceFingerprint,
          source_project: 'Moved project',
          record_id: 'record-moved',
          source_type: 'income',
          source_fingerprint: sourceFingerprint,
          source_amount_usd_cents: 1000,
          source_amount_php_cents: 60000,
          source_rate: 60,
          status: 'pending',
          status_updated_at: '2026-07-14T11:00:00.000Z',
          created_at: '2026-07-14T11:00:00.000Z',
        },
      },
      withdrawal_events: {},
    }, null, 2));

    const result = await sync.processSync({
      payments: {
        pending_payout_entries: [{
          status: 'pending',
          project: 'Moved project',
          amount_cents: 1000,
          first_seen_at: '2026-07-14T11:00:00.000Z',
          observation_id: sourceFingerprint,
        }],
        available_amount_cents: 0,
        available_amount: 0,
      },
      fundsHistorySnapshot: pickFundsHistoryFields({
        pending_payout_entries: [{
          status: 'pending',
          project: 'Moved project',
          amount_cents: 1000,
          first_seen_at: '2026-07-14T11:00:00.000Z',
          observation_id: sourceFingerprint,
        }],
        available_amount_cents: 0,
        available_amount: 0,
      }),
      includeFundsHistory: true,
      currencyState: {
        convert_to_php: false,
        usd_php_rate: 61.579,
        usd_php_rate_date: '2026-07-14',
        usd_php_rate_fetched_at: '2026-07-14T10:00:00.000Z',
        usd_php_rate_source: 'frankfurter',
      },
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    assert.equal(result.changed, true);
    assert.equal(patchCallCount, 0);

    const state = JSON.parse(fs.readFileSync(sync.statePath, 'utf8'));
    assert.equal(state.imported_funds_entries[marker].status, 'historical_locked');
    assert.equal(state.last_applied_settlement_rate, 61.579);
    assert.equal(state.pending_revaluation, null);
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
