// @ts-nocheck
function buildWithdrawalAmountSnapshot(payments: any, nextWithdrawalAt: string | null, now = new Date()) {
  const availableAmountCents = toCents(payments?.available_amount_cents, payments?.available_amount);
  const cutoff = parseDate(nextWithdrawalAt);
  const currentTime = normalizeDate(now);
  if (!cutoff || cutoff <= currentTime) {
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
    if (!payoutAt || payoutAt <= currentTime || payoutAt > cutoff) {
      return sum;
    }

    return sum + toCents(entry.amount_cents, entry.amount);
  }, 0);

  return formatWithdrawalAmount(availableAmountCents + pendingAmountCents);
}

function buildSuggestedWithdrawalSnapshot(payments: any, nextWithdrawalAt: string | null, now = new Date()) {
  const nextWithdrawal = parseDate(nextWithdrawalAt);
  if (!nextWithdrawal) {
    return {
      suggested_withdrawal_at: null,
      suggested_withdrawal_amount_cents: null,
      suggested_withdrawal_amount: null,
      suggested_withdrawal_amount_formatted: null,
      suggested_withdrawal_entries: [],
      suggested_withdrawal_entries_count: 0,
    };
  }

  const currentTime = normalizeDate(now);
  const entries = getPendingEntries(payments);
  const futureEntries = entries
    .map((entry, index) => ({ entry, index, payoutAt: parseDate(entry?.estimated_payout_at) }))
    .filter((item) => item.payoutAt && item.payoutAt > nextWithdrawal)
    .sort((left, right) => left.payoutAt.getTime() - right.payoutAt.getTime() || left.index - right.index);

  let suggestedAt = nextWithdrawal;
  for (const item of futureEntries) {
    if (item.payoutAt.getTime() - suggestedAt.getTime() > SIX_HOURS_MS) {
      break;
    }
    suggestedAt = item.payoutAt;
  }

  const contributingEntries = entries.filter((entry) => {
    const payoutAt = parseDate(entry?.estimated_payout_at);
    return payoutAt && payoutAt > currentTime && payoutAt <= suggestedAt;
  });
  const availableAmountCents = toCents(payments?.available_amount_cents, payments?.available_amount);
  const pendingAmountCents = contributingEntries.reduce(
    (sum, entry) => sum + toCents(entry.amount_cents, entry.amount),
    0,
  );
  const amountCents = availableAmountCents + pendingAmountCents;

  return {
    suggested_withdrawal_at: suggestedAt.toISOString(),
    suggested_withdrawal_amount_cents: amountCents,
    suggested_withdrawal_amount: amountCents / 100,
    suggested_withdrawal_amount_formatted: formatCents(amountCents),
    suggested_withdrawal_entries: contributingEntries,
    suggested_withdrawal_entries_count: contributingEntries.length,
  };
}

function getPendingEntries(payments: any) {
  const entries = Array.isArray(payments?.next_payout_entries)
    ? payments.next_payout_entries
    : Array.isArray(payments?.pending_payout_entries)
      ? payments.pending_payout_entries
      : [];
  return entries.filter((entry) => entry && entry.status === 'pending');
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

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
  buildSuggestedWithdrawalSnapshot,
};
