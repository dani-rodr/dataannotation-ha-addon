const test = require('node:test');
const assert = require('node:assert/strict');

const { chooseWithdrawalButton, estimateNextWithdrawalAt, extractPaymentsSnapshot } = require('./payments');

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

test('extractPaymentsSnapshot uses the next payout delay when funds are zero', () => {
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
    next_payout_entries_count: 1,
    pending_payout_entries: [{ project: 'Example Project', status: 'pending' }],
    nextWithdrawalText: '',
    now,
  });

  assert.equal(snapshot.next_withdrawal_at, '2026-06-27T14:05:02.298Z');
});

test('extractPaymentsSnapshot waits until the next day when pending funds exist but no payout delay is known', () => {
  const now = new Date('2026-06-26T14:05:02.298Z');
  const snapshot = extractPaymentsSnapshot({
    pageProps: {
      totalLifetimeEarnings: 50000,
      unapprovedAmount: 0,
      paymentStatus: {
        type: 'none',
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
    next_payout_days: 0,
    next_payout_entries_count: 1,
    pending_payout_entries: [{ project: 'Example Project', status: 'pending' }],
    nextWithdrawalText: '',
    now,
  });

  assert.equal(snapshot.next_withdrawal_at, '2026-06-27T00:00:00.000Z');
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

  assert.equal(snapshot.next_withdrawal_at, '2026-06-29T00:00:00.000Z');
});

test('extractPaymentsSnapshot falls back to three days from now when no future payout is known', () => {
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
    now: new Date('2026-06-25T14:05:02.298Z'),
  });

  assert.equal(snapshot.next_withdrawal_at, '2026-06-28T00:00:00.000Z');
});

test('chooseWithdrawalButton accepts only the exact money available button', () => {
  const choice = chooseWithdrawalButton([
    { text: 'Share', disabled: false },
    { text: '$12.34 available', disabled: false },
  ]);

  assert.equal(choice.present, true);
  assert.equal(choice.enabled, true);
  assert.equal(choice.text, '$12.34 available');
  assert.equal(choice.count, 1);
});

test('chooseWithdrawalButton ignores nearby share buttons and requires a unique match', () => {
  const choice = chooseWithdrawalButton([
    { text: '$12.34 available', disabled: false },
    { text: '$12.34 available', disabled: false },
    { text: 'Share', disabled: false },
  ]);

  assert.equal(choice.present, true);
  assert.equal(choice.enabled, false);
  assert.equal(choice.text, null);
  assert.equal(choice.count, 2);
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
