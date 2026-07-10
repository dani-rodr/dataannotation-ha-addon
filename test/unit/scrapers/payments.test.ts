const test = require('node:test');
const assert = require('node:assert/strict');

const { chooseWithdrawalButton, estimateNextWithdrawalAt, extractPaymentsSnapshot } = require('../../../src/scrapers/payments');

function formatHumanTimestamp(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function localMidnightIsoFrom(now, daysOffset) {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + daysOffset,
    0,
    0,
    0,
    0
  ).toISOString();
}

test('extractPaymentsSnapshot maps the observed cooldown state', () => {
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 223619,
      unapprovedAmount: 183243,
      paymentStatus: {
        type: 'cooldown',
        nextEligibleAt: '2026-06-25T14:05:02Z',
        amountInCents: 0,
      },
      unpaidPendingAmountInCents: 0,
      lastPayoutAt: '2026-06-22T14:05:02.298Z',
      showFundsHistoryTable: true,
    },
    earningsSummary: {
      totalPaidOut: 40376,
      currentMonthEarnings: 223619,
      bestMonth: {
        month: '2026-06',
        withdrawnInCents: 40376,
        earnedInCents: 0,
        pendingInCents: 183243,
      },
    },
    buttonText: '$0.00 available',
    buttonDisabled: true,
    nextWithdrawalText: 'Next withdrawal: June 25, 2026 at 10:05 PM GMT+8',
  });

  assert.equal(snapshot.available_amount, 0);
  assert.equal(snapshot.available_amount_formatted, '$0.00');
  assert.equal(snapshot.can_withdraw, false);
  assert.equal(snapshot.button_enabled, false);
  assert.equal(snapshot.button_text, '$0.00 available');
  assert.equal(snapshot.next_withdrawal_at, '2026-06-25T14:05:02.000Z');
  assert.equal(snapshot.next_withdrawal_text, 'Next withdrawal: June 25, 2026 at 10:05 PM GMT+8');
  assert.equal(snapshot.total_earnings, 2236.19);
  assert.equal(snapshot.total_paid_out, 403.76);
  assert.equal(snapshot.this_month, 2236.19);
  assert.equal(snapshot.best_month, 2236.19);
  assert.equal(snapshot.best_month_label, 'June 2026');
  assert.equal(snapshot.pending_approval, 1832.43);
  assert.equal(snapshot.last_payout_at, '2026-06-22T14:05:02.298Z');
});

test('extractPaymentsSnapshot marks withdrawable funds as available', () => {
  const now = new Date('2026-06-26T14:05:02.298Z');
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 50000,
      unapprovedAmount: 0,
      paymentStatus: {
        type: 'available',
        nextEligibleAt: null,
        amountInCents: 50000,
      },
      unpaidPendingAmountInCents: 0,
      lastPayoutAt: '2026-06-24T14:05:02.298Z',
      showFundsHistoryTable: true,
    },
    earningsSummary: {
      totalPaidOut: 0,
      currentMonthEarnings: 50000,
      bestMonth: {
        month: '2026-06',
        withdrawnInCents: 50000,
        earnedInCents: 0,
        pendingInCents: 0,
      },
    },
    buttonText: '$500.00 available',
    buttonDisabled: false,
    nextWithdrawalText: '',
    now,
  });

  assert.equal(snapshot.available_amount, 500);
  assert.equal(snapshot.can_withdraw, true);
  assert.equal(snapshot.button_enabled, true);
  assert.equal(snapshot.payment_status, 'available');
  assert.equal(snapshot.next_withdrawal_at, '2026-06-26T14:10:02.298Z');
});

test('extractPaymentsSnapshot uses the next payout timestamp when funds are zero', () => {
  const now = new Date('2026-06-26T14:05:02.298Z');
  const nextPayoutAt = localMidnightIsoFrom(now, 1);
  const nextPayoutAtHuman = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(nextPayoutAt));
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 50000,
      unapprovedAmount: 0,
      paymentStatus: {
        type: 'cooldown',
        nextEligibleAt: null,
        amountInCents: 0,
      },
      unpaidPendingAmountInCents: 0,
      lastPayoutAt: '2026-06-24T14:05:02.298Z',
      showFundsHistoryTable: true,
    },
    earningsSummary: {
      totalPaidOut: 0,
      currentMonthEarnings: 50000,
      bestMonth: {
        month: '2026-06',
        withdrawnInCents: 50000,
        earnedInCents: 0,
        pendingInCents: 0,
      },
    },
    buttonText: '$0.00 available',
    buttonDisabled: true,
    next_payout_days: 1,
    next_payout_at: nextPayoutAt,
    next_payout_entries_count: 1,
    pending_payout_entries: [{
      project: 'Example Project',
      kind: 'hourly',
      status: 'pending',
      amount: '$0.00',
      estimated_payout_at: nextPayoutAt,
      estimate_source: 'row_date_fallback',
      estimate_confidence: 'low',
    }],
    nextWithdrawalText: '',
    now,
  });

  assert.equal(snapshot.next_payout_at, nextPayoutAt);
  assert.equal(snapshot.next_payout_at_human, nextPayoutAtHuman);
  assert.equal(snapshot.next_withdrawal_at, nextPayoutAt);
  assert.equal(snapshot.next_withdrawal_amount_cents, 0);
  assert.equal(snapshot.next_withdrawal_amount, 0);
  assert.equal(snapshot.next_withdrawal_amount_formatted, '$0.00');
  assert.equal(snapshot.next_payout_entries_count, 1);
  assert.equal(snapshot.next_payout_entries[0].project, 'Example Project');
  assert.equal(snapshot.next_payout_entries[0].kind, 'hourly');
  assert.equal(snapshot.next_payout_entries[0].amount, '$0.00');
  assert.equal(snapshot.next_payout_entries[0].status, 'pending');
  assert.equal(snapshot.next_payout_entries[0].estimated_payout_at, nextPayoutAt);
  assert.equal(snapshot.next_payout_entries[0].estimate_source, 'row_date_fallback');
  assert.equal(snapshot.next_payout_entries[0].estimate_confidence, 'low');
  assert.deepEqual(snapshot.next_payout_entries_public, [
    {
      project: 'Example Project',
      kind: 'hourly',
      amount: '$0.00',
      relative_age: null,
      estimated_work_at: null,
      estimated_payout_at: formatHumanTimestamp(nextPayoutAt),
      source: 'row_date_fallback',
      confidence: 'low',
    },
  ]);
  assert.deepEqual(snapshot.pending_payout_entries_public, snapshot.next_payout_entries_public);
});

test('extractPaymentsSnapshot sorts payout entries and computes withdrawable amount', () => {
  const now = new Date('2026-06-26T14:05:02.298Z');
  const earlier = localMidnightIsoFrom(now, 1);
  const later = localMidnightIsoFrom(now, 2);
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 60000,
      unapprovedAmount: 1234,
      paymentStatus: {
        type: 'cooldown',
        nextEligibleAt: null,
        amountInCents: 0,
      },
      unpaidPendingAmountInCents: 0,
      lastPayoutAt: '2026-06-24T14:05:02.298Z',
      showFundsHistoryTable: true,
    },
    earningsSummary: {
      totalPaidOut: 0,
      currentMonthEarnings: 60000,
      bestMonth: {
        month: '2026-06',
        withdrawnInCents: 60000,
        earnedInCents: 0,
        pendingInCents: 0,
      },
    },
    buttonText: '$0.00 available',
    buttonDisabled: true,
    next_payout_days: 2,
    next_payout_at: earlier,
    next_payout_entries_count: 2,
    pending_payout_entries: [
      {
        project: 'Later Project',
        kind: 'task',
        status: 'pending',
        amount: '$20.00',
        amount_cents: 2000,
        estimated_payout_at: later,
        estimate_source: 'row_date_fallback',
        estimate_confidence: 'low',
      },
      {
        project: 'Earlier Project',
        kind: 'hourly',
        status: 'pending',
        amount: '$12.34',
        amount_cents: 1234,
        estimated_payout_at: earlier,
        estimate_source: 'row_date_fallback',
        estimate_confidence: 'low',
      },
    ],
    nextWithdrawalText: '',
    now,
  });

  assert.equal(snapshot.next_withdrawal_at, earlier);
  assert.equal(snapshot.next_withdrawal_amount_cents, 1234);
  assert.equal(snapshot.next_withdrawal_amount, 12.34);
  assert.equal(snapshot.next_withdrawal_amount_formatted, '$12.34');
  assert.deepEqual(snapshot.next_payout_entries.map((entry) => entry.project), ['Earlier Project', 'Later Project']);
  assert.deepEqual(snapshot.next_payout_entries_public.map((entry) => entry.project), ['Earlier Project', 'Later Project']);
  assert.deepEqual(snapshot.pending_payout_entries_public.map((entry) => entry.project), ['Earlier Project', 'Later Project']);
});

test('estimateNextWithdrawalAt uses last payout plus three days while still in the future', () => {
  const estimated = estimateNextWithdrawalAt('2026-06-22T14:05:02.298Z', '2026-06-23T14:05:02.298Z');

  assert.equal(estimated, '2026-06-25T14:05:02.298Z');
});

test('estimateNextWithdrawalAt clamps to now when the three day window has passed', () => {
  const estimated = estimateNextWithdrawalAt('2026-06-20T14:05:02.298Z', '2026-06-25T14:05:02.298Z');

  assert.equal(estimated, '2026-06-25T14:05:02.298Z');
});

test('extractPaymentsSnapshot falls back to a three day estimate when no future payout is known', () => {
  const now = new Date('2026-06-26T14:05:02.298Z');
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 50000,
      unapprovedAmount: 0,
      paymentStatus: {
        type: 'cooldown',
        nextEligibleAt: null,
        amountInCents: 0,
      },
      unpaidPendingAmountInCents: 0,
      lastPayoutAt: '2026-06-20T14:05:02.298Z',
      showFundsHistoryTable: true,
    },
    earningsSummary: {
      totalPaidOut: 0,
      currentMonthEarnings: 50000,
      bestMonth: {
        month: '2026-06',
        withdrawnInCents: 50000,
        earnedInCents: 0,
        pendingInCents: 0,
      },
    },
    buttonText: '$0.00 available',
    buttonDisabled: true,
    nextWithdrawalText: '',
    now,
  });

  assert.equal(snapshot.next_withdrawal_at, localMidnightIsoFrom(now, 3));
});

test('extractPaymentsSnapshot falls back to three days from now when no future payout is known', () => {
  const now = new Date('2026-06-25T14:05:02.298Z');
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 50000,
      unapprovedAmount: 0,
      paymentStatus: {
        type: 'cooldown',
        nextEligibleAt: null,
        amountInCents: 0,
      },
      unpaidPendingAmountInCents: 0,
      lastPayoutAt: '2026-06-20T14:05:02.298Z',
      showFundsHistoryTable: true,
    },
    earningsSummary: {
      totalPaidOut: 0,
      currentMonthEarnings: 50000,
      bestMonth: {
        month: '2026-06',
        withdrawnInCents: 50000,
        earnedInCents: 0,
        pendingInCents: 0,
      },
    },
    buttonText: '$0.00 available',
    buttonDisabled: true,
    nextWithdrawalText: '',
    now,
  });

  assert.equal(snapshot.next_withdrawal_at, localMidnightIsoFrom(now, 3));
});

test('chooseWithdrawalButton accepts the exact legacy money available button', () => {
  const choice = chooseWithdrawalButton([
    { text: 'Share', disabled: false },
    { text: '$12.34 available', disabled: false },
  ]);

  assert.equal(choice.present, true);
  assert.equal(choice.enabled, true);
  assert.equal(choice.text, '$12.34 available');
  assert.equal(choice.count, 1);
});

test('chooseWithdrawalButton accepts the live get paid submit button', () => {
  const choice = chooseWithdrawalButton([
    { text: 'Get paid $12.34', disabled: false, formAction: '/workers/payments/get_paid', formMethod: 'post' },
    { text: 'Share', disabled: false, formAction: '', formMethod: '' },
  ], 1234);

  assert.equal(choice.present, true);
  assert.equal(choice.enabled, true);
  assert.equal(choice.text, 'Get paid $12.34');
  assert.equal(choice.count, 1);
});

test('chooseWithdrawalButton accepts the live get paid submit button with thousands separators', () => {
  const choice = chooseWithdrawalButton([
    { text: 'Get paid $1,087.17', disabled: false, formAction: '/workers/payments/get_paid', formMethod: 'post' },
    { text: 'Share', disabled: false, formAction: '', formMethod: '' },
  ], 108717);

  assert.equal(choice.present, true);
  assert.equal(choice.enabled, true);
  assert.equal(choice.text, 'Get paid $1,087.17');
  assert.equal(choice.count, 1);
});

test('chooseWithdrawalButton rejects wrong amount and share buttons', () => {
  const choice = chooseWithdrawalButton([
    { text: 'Get paid $12.35', disabled: false, formAction: '/workers/payments/get_paid', formMethod: 'post' },
    { text: 'Share', disabled: false, formAction: '', formMethod: '' },
  ], 1234);

  assert.equal(choice.present, false);
  assert.equal(choice.enabled, false);
  assert.equal(choice.text, null);
  assert.equal(choice.count, 0);
});

test('extractPaymentsSnapshot reports no withdraw button when the exact button is missing', () => {
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 50000,
      unapprovedAmount: 0,
      paymentStatus: {
        type: 'cooldown',
        nextEligibleAt: null,
        amountInCents: 0,
      },
      unpaidPendingAmountInCents: 0,
      lastPayoutAt: '2026-06-24T14:05:02.298Z',
      showFundsHistoryTable: true,
    },
    earningsSummary: {
      totalPaidOut: 0,
      currentMonthEarnings: 50000,
      bestMonth: {
        month: '2026-06',
        withdrawnInCents: 50000,
        earnedInCents: 0,
        pendingInCents: 0,
      },
    },
    buttonText: 'Share',
    buttonDisabled: false,
    nextWithdrawalText: '',
  });

  assert.equal(snapshot.withdraw_button_present, false);
  assert.equal(snapshot.button_enabled, false);
  assert.equal(snapshot.can_withdraw, false);
  assert.equal(snapshot.button_text, null);
});

test('extractPaymentsSnapshot keeps a validated live withdraw button', () => {
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 50000,
      unapprovedAmount: 0,
      paymentStatus: {
        type: 'available',
        nextEligibleAt: null,
        amountInCents: 50000,
      },
      unpaidPendingAmountInCents: 0,
      lastPayoutAt: '2026-06-24T14:05:02.298Z',
      showFundsHistoryTable: true,
    },
    earningsSummary: {
      totalPaidOut: 0,
      currentMonthEarnings: 50000,
      bestMonth: {
        month: '2026-06',
        withdrawnInCents: 50000,
        earnedInCents: 0,
        pendingInCents: 0,
      },
    },
    withdrawButton: {
      present: true,
      enabled: true,
      disabled: false,
      text: 'Get paid $500.00',
      count: 1,
    },
    buttonText: '',
    buttonDisabled: true,
    nextWithdrawalText: '',
    now: new Date('2026-06-26T14:05:02.298Z'),
  });

  assert.equal(snapshot.withdraw_button_present, true);
  assert.equal(snapshot.button_enabled, true);
  assert.equal(snapshot.can_withdraw, true);
  assert.equal(snapshot.button_text, 'Get paid $500.00');
  assert.equal(snapshot.withdraw_button_count, 1);
});
