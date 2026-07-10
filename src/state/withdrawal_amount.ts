// @ts-nocheck
function buildWithdrawalAmountSnapshot(payments: any, nextWithdrawalAt: string | null, now = new Date()) {
  const availableAmountCents = toCents(payments?.available_amount_cents, payments?.available_amount);
  const cutoff = parseDate(nextWithdrawalAt);
  if (!cutoff || cutoff <= normalizeDate(now)) {
    return formatWithdrawalAmount(availableAmountCents);
  }

  const entries = Array.isArray(payments?.next_payout_entries)
    ? payments.next_payout_entries
    : Array.isArray(payments?.pending_payout_entries)
      ? payments.pending_payout_entries
      : [];

  const pendingAmountCents = entries.reduce((sum, entry) => {
    if (!entry || entry.status !== 'pending') {
      return sum;
    }

    const payoutAt = parseDate(entry.estimated_payout_at);
    if (!payoutAt || payoutAt > cutoff) {
      return sum;
    }

    return sum + toCents(entry.amount_cents, entry.amount);
  }, 0);

  return formatWithdrawalAmount(availableAmountCents + pendingAmountCents);
}

function formatWithdrawalAmount(cents: number) {
  return {
    next_withdrawal_amount_cents: cents,
    next_withdrawal_amount: cents / 100,
    next_withdrawal_amount_formatted: formatCents(cents),
  };
}

function formatCents(value: number) {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(value) || 0) / 100)}`;
}

function toCents(centsValue: unknown, amountValue: unknown) {
  const cents = Number(centsValue);
  if (Number.isFinite(cents)) {
    return cents;
  }

  const amount = Number(amountValue);
  if (Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }

  return 0;
}

function parseDate(value: unknown) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDate(value: unknown) {
  const date = parseDate(value);
  return date || new Date(0);
}

module.exports = {
  buildWithdrawalAmountSnapshot,
};
