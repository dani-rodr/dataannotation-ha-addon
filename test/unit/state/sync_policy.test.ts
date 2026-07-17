const assert = require('node:assert/strict');
const test = require('node:test');

const {
  clearExpiredPayoutDetails,
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

  assert.equal(
    shouldIncludeFundsHistory({
      includePayments: true,
      manualSyncRequested: false,
      initialSyncCompleted: true,
      fastPollingEnabled: true,
      now: 20_000,
      nextFundsHistoryAt: 20_000,
      nextExpeditedFundsHistoryAt: Number.POSITIVE_INFINITY,
    }),
    true
  );

  assert.equal(
    shouldIncludeFundsHistory({
      includePayments: true,
      manualSyncRequested: false,
      initialSyncCompleted: true,
      fastPollingEnabled: true,
      now: 10_000,
      nextFundsHistoryAt: 20_000,
      nextExpeditedFundsHistoryAt: Number.POSITIVE_INFINITY,
    }),
    false
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

test('clearExpiredPayoutDetails clears the complete stale payout schedule atomically', () => {
  const payments = {
    available_amount_cents: 2998218,
    pending_approval_cents: 255227,
    next_payout_days: 0,
    next_payout_at: '2026-07-17T08:07:25.000Z',
    next_payout_at_human: 'July 17, 2026, 4:07 PM',
    next_payout_entries_count: 7,
    next_payout_entries: Array.from({ length: 7 }, (_, index) => ({
      amount: index === 0 ? '$481.25' : '$10.00',
      estimated_payout_at: index === 0 ? '2026-07-17T08:07:25.000Z' : '2026-07-18T10:16:15.000Z',
    })),
    next_payout_entries_public: [{ amount: '$481.25' }],
    pending_payout_entries: [{ amount: '$481.25' }],
    pending_payout_entries_public: [{ amount: '$481.25' }],
    next_payout_amount: '$481.25',
    next_payout_source: 'observed_minutes',
    next_payout_confidence: 'high',
    funds_history_complete: true,
  };

  const sanitized = clearExpiredPayoutDetails(payments, new Date('2026-07-17T15:08:00.000Z'));

  assert.equal(sanitized.available_amount_cents, 2998218);
  assert.equal(sanitized.pending_approval_cents, 255227);
  assert.equal(sanitized.next_payout_days, 0);
  assert.equal(sanitized.next_payout_at, null);
  assert.equal(sanitized.next_payout_at_human, null);
  assert.equal(sanitized.next_payout_entries_count, 0);
  assert.deepEqual(sanitized.next_payout_entries, []);
  assert.deepEqual(sanitized.next_payout_entries_public, []);
  assert.deepEqual(sanitized.pending_payout_entries, []);
  assert.deepEqual(sanitized.pending_payout_entries_public, []);
  assert.equal(sanitized.next_payout_amount, null);
  assert.equal(sanitized.next_payout_source, null);
  assert.equal(sanitized.next_payout_confidence, null);
  assert.equal(sanitized.funds_history_complete, false);
  assert.equal(payments.next_payout_entries.length, 7);
});

test('clearExpiredPayoutDetails clears an expired entry even when the summary timestamp is future', () => {
  const sanitized = clearExpiredPayoutDetails({
    next_payout_at: '2026-07-18T10:16:15.000Z',
    next_payout_entries: [
      { estimated_payout_at: '2026-07-17T08:07:25.000Z' },
      { estimated_payout_at: '2026-07-18T10:16:15.000Z' },
    ],
    pending_payout_entries: [],
    next_payout_entries_count: 2,
    next_payout_amount: '$20.00',
  }, new Date('2026-07-17T15:08:00.000Z'));

  assert.equal(sanitized.next_payout_at, null);
  assert.deepEqual(sanitized.next_payout_entries, []);
  assert.equal(sanitized.next_payout_entries_count, 0);
  assert.equal(sanitized.next_payout_amount, null);
  assert.equal(sanitized.funds_history_complete, false);
});

test('clearExpiredPayoutDetails preserves a future schedule without mutating it', () => {
  const payments = {
    next_payout_at: '2026-07-18T10:16:15.000Z',
    next_payout_entries: [{ estimated_payout_at: '2026-07-18T10:16:15.000Z' }],
    pending_payout_entries: [{ estimated_payout_at: '2026-07-18T10:16:15.000Z' }],
    next_payout_entries_count: 1,
    next_payout_amount: '$20.00',
    funds_history_complete: true,
  };

  assert.deepEqual(clearExpiredPayoutDetails(payments, new Date('2026-07-17T15:08:00.000Z')), payments);
});

test('clearExpiredPayoutDetails clears invalid or orphaned retained details', () => {
  const invalid = clearExpiredPayoutDetails({
    next_payout_at: 'not-a-date',
    next_payout_entries: [{ estimated_payout_at: null }],
    next_payout_entries_public: [{ amount: '$20.00' }],
    pending_payout_entries: [],
  }, new Date('2026-07-17T15:08:00.000Z'));
  assert.equal(invalid.next_payout_at, null);
  assert.deepEqual(invalid.next_payout_entries, []);
  assert.deepEqual(invalid.next_payout_entries_public, []);
  assert.equal(invalid.funds_history_complete, false);

  const orphaned = clearExpiredPayoutDetails({
    next_payout_at: '2026-07-18T10:16:15.000Z',
    next_payout_entries: [],
    next_payout_entries_public: [{ amount: '$20.00' }],
    pending_payout_entries: [],
  }, new Date('2026-07-17T15:08:00.000Z'));
  assert.equal(orphaned.next_payout_at, null);
  assert.deepEqual(orphaned.next_payout_entries_public, []);
  assert.equal(orphaned.funds_history_complete, false);
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

test('retainNextWithdrawalAt excludes payout entries that are already expired', () => {
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
  assert.equal(retained.next_withdrawal_amount_cents, 10000);
  assert.equal(retained.next_withdrawal_amount, 100);
  assert.equal(retained.next_withdrawal_amount_formatted, '$100.00');
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

test('retainNextWithdrawalAt restores a persisted last payout amount only for the same payout timestamp', () => {
  const retained = retainNextWithdrawalAt(
    {
      last_payout_at: '2026-07-16T11:17:37.000Z',
      last_payout_amount_cents: null,
      last_payout_amount: null,
      last_payout_amount_formatted: null,
      available_amount_cents: 48625,
      next_withdrawal_at: null,
    },
    {
      last_payout_at: '2026-07-16T11:17:37.000Z',
      last_payout_amount_cents: 50500,
      last_payout_amount: 505,
      last_payout_amount_formatted: '$505.00',
    },
    new Date('2026-07-17T00:00:00.000Z')
  );

  assert.equal(retained.last_payout_amount_cents, 50500);
  assert.equal(retained.last_payout_amount, 505);
  assert.equal(retained.last_payout_amount_formatted, '$505.00');

  const differentPayout = retainNextWithdrawalAt(
    {
      last_payout_at: '2026-07-17T11:17:37.000Z',
      last_payout_amount_cents: null,
      last_payout_amount: null,
      available_amount_cents: 48625,
      next_withdrawal_at: null,
    },
    {
      last_payout_at: '2026-07-16T11:17:37.000Z',
      last_payout_amount_cents: 50500,
      last_payout_amount: 505,
    },
    new Date('2026-07-17T12:00:00.000Z')
  );

  assert.equal(differentPayout.last_payout_amount_cents, null);
});
