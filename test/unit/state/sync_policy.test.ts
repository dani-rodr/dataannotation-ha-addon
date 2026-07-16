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
    last_payout_amount_cents: 1234,
    last_payout_amount: 12.34,
    last_payout_amount_formatted: '$12.34',
  });

  assert.deepEqual(fields, {
    available_amount_cents: null,
    available_amount: null,
    next_payout_days: 2,
    next_payout_at: '2026-06-29T16:00:00.000Z',
    next_payout_entries_count: 3,
    next_payout_at_human: 'June 29, 2026, 4:00 PM',
    next_payout_entries: [{ project: 'Example', estimated_payout_at: '2026-06-29T16:00:00.000Z' }],
    next_payout_amount: 12.34,
    next_payout_source: 'funds_history',
    next_payout_confidence: 'high',
    pending_payout_entries: [{ project: 'Example' }],
    funds_history_complete: null,
    last_payout_amount_cents: 1234,
    last_payout_amount: 12.34,
    last_payout_amount_formatted: '$12.34',
  });
});

test('mergePaymentsWithFundsHistory keeps current summary and prior history fields', () => {
  const merged = mergePaymentsWithFundsHistory(
    {
      available_amount: 25.67,
      available_amount_cents: 2567,
      can_withdraw: true,
      next_payout_days: 0,
      next_payout_at_human: null,
      next_payout_entries: [],
      next_payout_amount: null,
      next_payout_source: null,
      next_payout_confidence: null,
    },
    {
      available_amount: 12.34,
      available_amount_cents: 1234,
      next_payout_days: 2,
      next_payout_at: '2026-06-29T16:00:00.000Z',
      next_payout_at_human: 'June 29, 2026, 4:00 PM',
      next_payout_entries: [{ project: 'Example' }],
      next_payout_amount: 12.34,
      next_payout_source: 'funds_history',
      next_payout_confidence: 'high',
      last_payout_amount_cents: 1234,
      last_payout_amount: 12.34,
      last_payout_amount_formatted: '$12.34',
    }
  );

  assert.equal(merged.available_amount, 25.67);
  assert.equal(merged.available_amount_cents, 2567);
  assert.equal(merged.can_withdraw, true);
  assert.equal(merged.next_payout_days, 2);
  assert.equal(merged.next_payout_at, '2026-06-29T16:00:00.000Z');
  assert.equal(merged.next_payout_at_human, 'June 29, 2026, 4:00 PM');
  assert.deepEqual(merged.next_payout_entries, [{ project: 'Example' }]);
  assert.equal(merged.next_payout_amount, 12.34);
  assert.equal(merged.next_payout_source, 'funds_history');
  assert.equal(merged.next_payout_confidence, 'high');
  assert.equal(merged.last_payout_amount_cents, 1234);
  assert.equal(merged.last_payout_amount, 12.34);
  assert.equal(merged.last_payout_amount_formatted, '$12.34');
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
      next_withdrawal_source: 'direct',
    },
    new Date('2026-07-08T09:00:00.000Z')
  );

  assert.equal(retained.next_withdrawal_at, '2026-07-10T19:16:00.000Z');
  assert.equal(retained.next_withdrawal_text, 'Next withdrawal: July 10, 2026 at 7:16 PM GMT+0');
  assert.equal(retained.next_withdrawal_source, 'direct');
  assert.equal(retained.next_withdrawal_amount_cents, 12500);
  assert.equal(retained.next_withdrawal_amount, 125);
  assert.equal(retained.next_withdrawal_amount_formatted, '$125.00');
});

test('retainNextWithdrawalAt leaves a fresh button-based estimate alone when there is no prior future timestamp', () => {
  const retained = retainNextWithdrawalAt(
    {
      can_withdraw: true,
      available_amount_cents: 10000,
      next_withdrawal_source: 'button',
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

  assert.equal(retained.next_withdrawal_at, '2026-07-08T10:00:00.000Z');
  assert.equal(retained.next_withdrawal_text, 'Next withdrawal: July 8, 2026 at 10:00 AM GMT+0');
  assert.equal(retained.next_withdrawal_amount_cents, 12500);
  assert.equal(retained.next_withdrawal_amount, 125);
  assert.equal(retained.next_withdrawal_amount_formatted, '$125.00');
});

test('retainNextWithdrawalAt keeps a known future withdrawal timestamp after a non-direct refresh', () => {
  const retained = retainNextWithdrawalAt(
    {
      can_withdraw: false,
      available_amount: 0,
      available_amount_cents: 0,
      next_withdrawal_at: null,
      next_withdrawal_source: 'fallback',
      next_withdrawal_text: null,
      next_payout_entries: [
        { status: 'pending', amount_cents: 1900788, estimated_payout_at: '2026-07-11T16:00:00.000Z' },
        { status: 'pending', amount_cents: 4024746, estimated_payout_at: '2026-07-11T16:00:00.000Z' },
        { status: 'pending', amount_cents: 3108982, estimated_payout_at: '2026-07-14T16:00:00.000Z' },
      ],
    },
    {
      next_withdrawal_at: '2026-07-13T11:17:10.000Z',
      next_withdrawal_text: 'Next withdrawal: July 13, 2026 at 7:17 PM GMT+8',
    },
    new Date('2026-07-10T12:00:00.000Z')
  );

  assert.equal(retained.next_withdrawal_at, '2026-07-13T11:17:10.000Z');
  assert.equal(retained.next_withdrawal_text, 'Next withdrawal: July 13, 2026 at 7:17 PM GMT+8');
  assert.equal(retained.next_withdrawal_amount_cents, 5925534);
  assert.equal(retained.next_withdrawal_amount, 59255.34);
  assert.equal(retained.next_withdrawal_amount_formatted, '$59,255.34');
});

test('retainNextWithdrawalAt lets a fresh direct timestamp replace persisted state', () => {
  const retained = retainNextWithdrawalAt(
    {
      next_withdrawal_at: '2026-07-14T11:17:10.000Z',
      next_withdrawal_text: 'Next withdrawal: July 14, 2026 at 7:17 PM GMT+8',
      next_withdrawal_source: 'direct',
    },
    {
      next_withdrawal_at: '2026-07-13T11:17:10.000Z',
      next_withdrawal_text: 'Next withdrawal: July 13, 2026 at 7:17 PM GMT+8',
      next_withdrawal_source: 'estimated',
    },
    new Date('2026-07-10T12:00:00.000Z')
  );

  assert.equal(retained.next_withdrawal_at, '2026-07-14T11:17:10.000Z');
  assert.equal(retained.next_withdrawal_text, 'Next withdrawal: July 14, 2026 at 7:17 PM GMT+8');
  assert.equal(retained.next_withdrawal_source, 'direct');
});

test('retainNextWithdrawalAt backfills last payout amount from previous available funds after withdrawal', () => {
  const retained = retainNextWithdrawalAt(
    {
      can_withdraw: true,
      available_amount: 0,
      available_amount_cents: 0,
      last_payout_at: '2026-07-10T11:17:10.950Z',
      last_payout_amount_cents: null,
      last_payout_amount: null,
      last_payout_amount_formatted: null,
    },
    {
      available_amount: 495,
      available_amount_cents: 49500,
      last_payout_at: '2026-07-08T11:17:10.950Z',
    },
    new Date('2026-07-10T12:00:00.000Z')
  );

  assert.equal(retained.last_payout_amount_cents, 49500);
  assert.equal(retained.last_payout_amount, 495);
  assert.equal(retained.last_payout_amount_formatted, '$495.00');
});

test('retainNextWithdrawalAt falls back to the previous available amount when cents are absent', () => {
  const retained = retainNextWithdrawalAt(
    {
      can_withdraw: true,
      available_amount: 0,
      available_amount_cents: null,
      last_payout_amount_cents: null,
      last_payout_amount: null,
      last_payout_amount_formatted: null,
    },
    {
      available_amount: 12.34,
      available_amount_cents: null,
    },
    new Date('2026-07-10T12:00:00.000Z')
  );

  assert.equal(retained.last_payout_amount_cents, 1234);
  assert.equal(retained.last_payout_amount, 12.34);
});
