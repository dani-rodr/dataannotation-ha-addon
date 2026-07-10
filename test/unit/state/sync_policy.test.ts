const assert = require('node:assert/strict');
const test = require('node:test');

const {
  mergePaymentsWithFundsHistory,
  pickFundsHistoryFields,
  retainNextWithdrawalAt,
  shouldIncludeFundsHistory,
  shouldIncludePayments,
} = require('../../../src/state/sync_policy.ts');

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

  assert.equal(
    shouldIncludeFundsHistory({
      includePayments: true,
      manualSyncRequested: false,
      initialSyncCompleted: true,
      fastPollingEnabled: true,
      now: 20_000,
      nextFundsHistoryAt: 50_000,
      nextExpeditedFundsHistoryAt: 15_000,
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

test('retainNextWithdrawalAt keeps a future withdrawal timestamp while funds are available', () => {
  const retained = retainNextWithdrawalAt(
    {
      can_withdraw: true,
      available_amount_cents: 10000,
      next_payout_entries: [
        { status: 'pending', amount_cents: 2500, estimated_payout_at: '2026-07-09T00:00:00.000Z' },
        { status: 'pending', amount_cents: 5000, estimated_payout_at: '2026-07-11T00:00:00.000Z' },
      ],
      next_withdrawal_at: '2026-07-08T10:00:00.000Z',
      next_withdrawal_text: 'Next withdrawal: July 8, 2026 at 10:00 AM GMT+0',
    },
    {
      next_withdrawal_at: '2026-07-10T19:16:00.000Z',
      next_withdrawal_text: 'Next withdrawal: July 10, 2026 at 7:16 PM GMT+0',
    },
    new Date('2026-07-08T09:00:00.000Z')
  );

  assert.equal(retained.next_withdrawal_at, '2026-07-10T19:16:00.000Z');
  assert.equal(retained.next_withdrawal_text, 'Next withdrawal: July 10, 2026 at 7:16 PM GMT+0');
  assert.equal(retained.next_withdrawal_amount_cents, 12500);
  assert.equal(retained.next_withdrawal_amount, 125);
  assert.equal(retained.next_withdrawal_amount_formatted, '$125.00');
});

test('retainNextWithdrawalAt clears stale withdrawal timestamps while funds are available', () => {
  const retained = retainNextWithdrawalAt(
    {
      can_withdraw: true,
      available_amount_cents: 10000,
      next_payout_entries: [
        { status: 'pending', amount_cents: 2500, estimated_payout_at: '2026-07-07T00:00:00.000Z' },
      ],
      next_withdrawal_at: '2026-07-08T10:00:00.000Z',
      next_withdrawal_text: 'Next withdrawal: July 8, 2026 at 10:00 AM GMT+0',
    },
    {
      next_withdrawal_at: '2026-07-07T19:16:00.000Z',
      next_withdrawal_text: 'Next withdrawal: July 7, 2026 at 7:16 PM GMT+0',
    },
    new Date('2026-07-08T09:00:00.000Z')
  );

  assert.equal(retained.next_withdrawal_at, null);
  assert.equal(retained.next_withdrawal_text, null);
  assert.equal(retained.next_withdrawal_amount_cents, 10000);
  assert.equal(retained.next_withdrawal_amount, 100);
  assert.equal(retained.next_withdrawal_amount_formatted, '$100.00');
});
