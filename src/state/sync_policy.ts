import type { PaymentSnapshot } from '../shared/types';
const { buildWithdrawalAmountSnapshot } = require('./withdrawal_amount.ts');

export function shouldIncludePayments(_options: { initialSyncCompleted: boolean; manualSyncRequested: boolean; fastPollingEnabled: boolean }): boolean {
  return true;
}

export function shouldIncludeFundsHistory({
  includePayments,
  manualSyncRequested,
  initialSyncCompleted,
  fastPollingEnabled,
  now,
  nextFundsHistoryAt,
  nextExpeditedFundsHistoryAt,
}: {
  includePayments: boolean;
  manualSyncRequested: boolean;
  initialSyncCompleted: boolean;
  fastPollingEnabled: boolean;
  now: number;
  nextFundsHistoryAt: number;
  nextExpeditedFundsHistoryAt: number;
}): boolean {
  if (!includePayments) {
    return false;
  }

  if (manualSyncRequested || !initialSyncCompleted) {
    return true;
  }

  if (Number.isFinite(nextExpeditedFundsHistoryAt) && now >= nextExpeditedFundsHistoryAt) {
    return true;
  }

  if (fastPollingEnabled) {
    return false;
  }

  return Number.isFinite(nextFundsHistoryAt) ? now >= nextFundsHistoryAt : true;
}

export function pickFundsHistoryFields(payments: PaymentSnapshot | null | undefined): Pick<PaymentSnapshot, 'next_payout_days' | 'next_payout_at' | 'next_payout_entries_count' | 'next_payout_at_human' | 'next_payout_entries' | 'next_payout_amount' | 'next_payout_source' | 'next_payout_confidence' | 'pending_payout_entries'> {
  return {
    next_payout_days: payments?.next_payout_days ?? 0,
    next_payout_at: payments?.next_payout_at ?? null,
    next_payout_entries_count: payments?.next_payout_entries_count ?? 0,
    next_payout_at_human: payments?.next_payout_at_human ?? null,
    next_payout_entries: Array.isArray(payments?.next_payout_entries) ? payments.next_payout_entries : [],
    next_payout_amount: payments?.next_payout_amount ?? null,
    next_payout_source: payments?.next_payout_source ?? null,
    next_payout_confidence: payments?.next_payout_confidence ?? null,
    pending_payout_entries: Array.isArray(payments?.pending_payout_entries) ? payments.pending_payout_entries : [],
  };
}

export function mergePaymentsWithFundsHistory(payments: PaymentSnapshot | null | undefined, fundsHistorySnapshot: Partial<PaymentSnapshot> | null | undefined): PaymentSnapshot {
  return {
    ...(payments || {}),
    ...(fundsHistorySnapshot || {}),
  };
}

export function retainNextWithdrawalAt(currentPayments: PaymentSnapshot | null | undefined, previousPayments: PaymentSnapshot | null | undefined, now: Date = new Date()): PaymentSnapshot {
  const current = { ...(currentPayments || {}) };
  if (current.can_withdraw) {
    const previousNextWithdrawalAt = parseDate(previousPayments?.next_withdrawal_at);
    const currentTime = parseDate(now) || new Date();
    if (previousNextWithdrawalAt && previousNextWithdrawalAt > currentTime) {
      current.next_withdrawal_at = previousPayments?.next_withdrawal_at ?? null;
      if (previousPayments?.next_withdrawal_text) {
        current.next_withdrawal_text = previousPayments.next_withdrawal_text;
      }
    } else {
      current.next_withdrawal_at = null;
      current.next_withdrawal_text = null;
    }
  }

  Object.assign(current, buildWithdrawalAmountSnapshot(current, current.next_withdrawal_at || null, now));
  return current;
}

function parseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}
