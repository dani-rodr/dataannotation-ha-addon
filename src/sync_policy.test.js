const assert = require('node:assert/strict');
const test = require('node:test');

const {
  mergePaymentsWithFundsHistory,
  pickFundsHistoryFields,
  shouldIncludeFundsHistory,
  shouldIncludePayments,
} = require('./sync_policy');

test('shouldIncludePayments always keeps the lightweight payments scrape enabled', () => {
  assert.equal(shouldIncludePayments({ initialSyncCompleted: false, manualSyncRequested: false, fastPollingEnabled: true }), true);
  assert.equal(shouldIncludePayments({ initialSyncCompleted: true, manualSyncRequested: false, fastPollingEnabled: true }), true);
  assert.equal(shouldIncludePayments({ initialSyncCompleted: true, manualSyncRequested: true, fastPollingEnabled: true }), true);
});

test('shouldIncludeFundsHistory only runs when the slow schedule is due', () => {
  assert.equal(
    shouldIncludeFundsHistory({
      includePayments: true,
      manualSyncRequested: false,
      initialSyncCompleted: true,
      fastPollingEnabled: false,
      now: 10_000,
      nextFundsHistoryAt: 20_000,
    }),
    false
  );

  assert.equal(
    shouldIncludeFundsHistory({
      includePayments: true,
      manualSyncRequested: false,
      initialSyncCompleted: true,
      fastPollingEnabled: false,
      now: 20_000,
      nextFundsHistoryAt: 20_000,
    }),
    true
  );

  assert.equal(
    shouldIncludeFundsHistory({
      includePayments: true,
      manualSyncRequested: true,
      initialSyncCompleted: true,
      fastPollingEnabled: true,
      now: 10_000,
      nextFundsHistoryAt: 20_000,
    }),
    true
  );
});

test('pickFundsHistoryFields preserves the last history snapshot', () => {
  const fields = pickFundsHistoryFields({
    next_payout_days: 2,
    next_payout_at: '2026-06-29T16:00:00.000Z',
    next_payout_entries_count: 3,
    next_payout_at_human: 'June 29, 2026, 4:00 PM',
    next_payout_entries: [{ project: 'Example', estimated_payout_at: '2026-06-29T16:00:00.000Z' }],
    next_payout_amount: 12.34,
    next_payout_source: 'funds_history',
    next_payout_confidence: 'high',
    pending_payout_entries: [{ project: 'Example' }],
  });

  assert.deepEqual(fields, {
    next_payout_days: 2,
    next_payout_at: '2026-06-29T16:00:00.000Z',
    next_payout_entries_count: 3,
    next_payout_at_human: 'June 29, 2026, 4:00 PM',
    next_payout_entries: [{ project: 'Example', estimated_payout_at: '2026-06-29T16:00:00.000Z' }],
    next_payout_amount: 12.34,
    next_payout_source: 'funds_history',
    next_payout_confidence: 'high',
    pending_payout_entries: [{ project: 'Example' }],
  });
});

test('mergePaymentsWithFundsHistory keeps current summary and prior history fields', () => {
  const merged = mergePaymentsWithFundsHistory(
    {
      available_amount: 12.34,
      can_withdraw: true,
      next_payout_days: 0,
      next_payout_at_human: null,
      next_payout_entries: [],
      next_payout_amount: null,
      next_payout_source: null,
      next_payout_confidence: null,
    },
    {
      next_payout_days: 2,
      next_payout_at: '2026-06-29T16:00:00.000Z',
      next_payout_at_human: 'June 29, 2026, 4:00 PM',
      next_payout_entries: [{ project: 'Example' }],
      next_payout_amount: 12.34,
      next_payout_source: 'funds_history',
      next_payout_confidence: 'high',
    }
  );

  assert.equal(merged.available_amount, 12.34);
  assert.equal(merged.can_withdraw, true);
  assert.equal(merged.next_payout_days, 2);
  assert.equal(merged.next_payout_at, '2026-06-29T16:00:00.000Z');
  assert.equal(merged.next_payout_at_human, 'June 29, 2026, 4:00 PM');
  assert.deepEqual(merged.next_payout_entries, [{ project: 'Example' }]);
  assert.equal(merged.next_payout_amount, 12.34);
  assert.equal(merged.next_payout_source, 'funds_history');
  assert.equal(merged.next_payout_confidence, 'high');
});
