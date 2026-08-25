import type { PaymentSnapshot } from '../shared/types';
const { buildWithdrawalAmountSnapshot, buildSuggestedWithdrawalSnapshot } = require('./withdrawal_amount.ts');
const { formatPublicPayoutEntries } = require('../scrapers/funds_history.ts');

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

  if (Number.isFinite(nextFundsHistoryAt) && now >= nextFundsHistoryAt) {
    return true;
  }

  return Number.isFinite(nextFundsHistoryAt) ? false : !fastPollingEnabled;
}

export function pickFundsHistoryFields(payments: PaymentSnapshot | null | undefined): Pick<PaymentSnapshot, 'available_amount_cents' | 'available_amount' | 'next_payout_days' | 'next_payout_at' | 'next_payout_entries_count' | 'next_payout_at_human' | 'next_payout_entries' | 'next_payout_entries_public' | 'next_payout_amount' | 'next_payout_source' | 'next_payout_confidence' | 'pending_payout_entries' | 'pending_payout_entries_public' | 'funds_history_complete' | 'last_payout_amount_cents' | 'last_payout_amount' | 'last_payout_amount_formatted' | 'work_hours_today' | 'work_hours_today_minutes' | 'work_hours_this_week' | 'work_hours_this_week_minutes' | 'work_hours_timezone' | 'work_hours_timezone_source' | 'work_hours_week_start' | 'work_hours_today_date' | 'work_hours_week_start_date' | 'work_hours_entry_count' | 'work_hours_projects' | 'work_hours_last_updated' | 'work_hours_complete' | 'work_hours_stale' | 'work_hours_allocation_method'> {
  return {
    available_amount_cents: payments?.available_amount_cents ?? null,
    available_amount: payments?.available_amount ?? null,
    next_payout_days: payments?.next_payout_days ?? 0,
    next_payout_at: payments?.next_payout_at ?? null,
    next_payout_entries_count: payments?.next_payout_entries_count ?? 0,
    next_payout_at_human: payments?.next_payout_at_human ?? null,
    next_payout_entries: Array.isArray(payments?.next_payout_entries) ? payments.next_payout_entries : [],
    next_payout_entries_public: Array.isArray(payments?.next_payout_entries_public) ? payments.next_payout_entries_public : [],
    next_payout_amount: payments?.next_payout_amount ?? null,
    next_payout_source: payments?.next_payout_source ?? null,
    next_payout_confidence: payments?.next_payout_confidence ?? null,
    pending_payout_entries: Array.isArray(payments?.pending_payout_entries) ? payments.pending_payout_entries : [],
    pending_payout_entries_public: Array.isArray(payments?.pending_payout_entries_public) ? payments.pending_payout_entries_public : [],
    funds_history_complete: payments?.funds_history_complete ?? null,
    last_payout_amount_cents: payments?.last_payout_amount_cents ?? null,
    last_payout_amount: payments?.last_payout_amount ?? null,
    last_payout_amount_formatted: payments?.last_payout_amount_formatted ?? null,
    work_hours_today: payments?.work_hours_today ?? 0,
    work_hours_today_minutes: payments?.work_hours_today_minutes ?? 0,
    work_hours_this_week: payments?.work_hours_this_week ?? 0,
    work_hours_this_week_minutes: payments?.work_hours_this_week_minutes ?? 0,
    work_hours_timezone: payments?.work_hours_timezone ?? 'UTC',
    work_hours_timezone_source: payments?.work_hours_timezone_source ?? 'utc_fallback',
    work_hours_week_start: payments?.work_hours_week_start ?? 'monday',
    work_hours_today_date: payments?.work_hours_today_date ?? null,
    work_hours_week_start_date: payments?.work_hours_week_start_date ?? null,
    work_hours_entry_count: payments?.work_hours_entry_count ?? 0,
    work_hours_projects: Array.isArray(payments?.work_hours_projects) ? payments.work_hours_projects : [],
    work_hours_last_updated: payments?.work_hours_last_updated ?? null,
    work_hours_complete: payments?.work_hours_complete ?? false,
    work_hours_stale: payments?.work_hours_stale ?? true,
    work_hours_allocation_method: payments?.work_hours_allocation_method ?? 'backfilled_from_created_at',
  };
}

export function mergePaymentsWithFundsHistory(payments: PaymentSnapshot | null | undefined, fundsHistorySnapshot: Partial<PaymentSnapshot> | null | undefined): PaymentSnapshot {
  const currentPayments = payments || {};
  const merged = {
    ...currentPayments,
    ...(fundsHistorySnapshot || {}),
  };

  if (Object.prototype.hasOwnProperty.call(currentPayments, 'available_amount_cents')) {
    merged.available_amount_cents = currentPayments.available_amount_cents;
  }

  if (Object.prototype.hasOwnProperty.call(currentPayments, 'available_amount')) {
    merged.available_amount = currentPayments.available_amount;
  }

  for (const key of Object.keys(currentPayments).filter((key) => key.startsWith('work_hours_'))) {
    merged[key] = currentPayments[key];
  }

  return merged;
}

export function clearExpiredPayoutDetails(payments: PaymentSnapshot | null | undefined, now: Date = new Date()): PaymentSnapshot {
  const current: any = { ...(payments || {}) };
  const currentTime = parseDate(now) || new Date();
  const nextPayoutAt = parseDate(current.next_payout_at);
  const nextPayoutEntries = Array.isArray(current.next_payout_entries) ? current.next_payout_entries : [];
  const nextPayoutEntriesPublic = Array.isArray(current.next_payout_entries_public) ? current.next_payout_entries_public : [];
  const pendingPayoutEntries = Array.isArray(current.pending_payout_entries) ? current.pending_payout_entries : [];
  const pendingPayoutEntriesPublic = Array.isArray(current.pending_payout_entries_public) ? current.pending_payout_entries_public : [];
  const hasNextPayoutAtValue = current.next_payout_at !== undefined && current.next_payout_at !== null && current.next_payout_at !== '';
  const hasInvalidEntry = [...nextPayoutEntries, ...pendingPayoutEntries].some((entry: any) => !parseDate(entry?.estimated_payout_at));
  const hasOrphanedPublicEntries = (nextPayoutEntriesPublic.length > 0 && nextPayoutEntries.length === 0)
    || (pendingPayoutEntriesPublic.length > 0 && pendingPayoutEntries.length === 0);
  const hasExpiredEntry = [...nextPayoutEntries, ...pendingPayoutEntries].some((entry: any) => {
    const payoutAt = parseDate(entry?.estimated_payout_at);
    return Boolean(payoutAt && payoutAt <= currentTime);
  });

  if (!hasExpiredEntry && !hasInvalidEntry && !hasOrphanedPublicEntries && ((nextPayoutAt && nextPayoutAt > currentTime) || (!hasNextPayoutAtValue && nextPayoutEntries.length === 0 && pendingPayoutEntries.length === 0))) {
    return current;
  }

  return {
    ...current,
    next_payout_days: 0,
    next_payout_at: null,
    next_payout_at_human: null,
    next_payout_entries_count: 0,
    next_payout_entries: [],
    next_payout_entries_public: [],
    pending_payout_entries: [],
    pending_payout_entries_public: [],
    next_payout_amount: null,
    next_payout_source: null,
    next_payout_confidence: null,
    funds_history_complete: false,
  };
}

export function retainNextWithdrawalAt(currentPayments: PaymentSnapshot | null | undefined, previousPayments: PaymentSnapshot | null | undefined, now: Date = new Date()): PaymentSnapshot {
  const current = { ...(currentPayments || {}) };
  const previousNextWithdrawalAt = parseDate(previousPayments?.next_withdrawal_at);
  const currentTime = parseDate(now) || new Date();

  if (previousNextWithdrawalAt && previousNextWithdrawalAt > currentTime && current.next_withdrawal_source !== 'direct') {
    current.next_withdrawal_at = previousPayments?.next_withdrawal_at ?? null;
    current.next_withdrawal_text = previousPayments?.next_withdrawal_text ?? null;
    current.next_withdrawal_source = previousPayments?.next_withdrawal_source ?? null;
  }

  retainLastPayoutAmount(current, previousPayments);

  Object.assign(current, buildWithdrawalAmountSnapshot(current, current.next_withdrawal_at || null, now));
  const suggestedWithdrawal = buildSuggestedWithdrawalSnapshot(current, current.next_withdrawal_at || null, now);
  Object.assign(current, suggestedWithdrawal, {
    suggested_withdrawal_entries_public: formatPublicPayoutEntries(suggestedWithdrawal.suggested_withdrawal_entries),
  });
  return current;
}

function parseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function retainLastPayoutAmount(currentPayments: PaymentSnapshot, previousPayments: PaymentSnapshot | null | undefined) {
  if (currentPayments.last_payout_amount_cents !== null && currentPayments.last_payout_amount_cents !== undefined && currentPayments.last_payout_amount !== null && currentPayments.last_payout_amount !== undefined) {
    return;
  }

  const currentLastPayoutAt = parseDate(currentPayments.last_payout_at);
  const previousLastPayoutAt = parseDate(previousPayments?.last_payout_at);
  if (currentLastPayoutAt && previousLastPayoutAt && currentLastPayoutAt.getTime() === previousLastPayoutAt.getTime()) {
    const previousLastPayoutAmountCents = normalizeCents(previousPayments?.last_payout_amount_cents, previousPayments?.last_payout_amount);
    if (previousLastPayoutAmountCents !== null) {
      currentPayments.last_payout_amount_cents = previousLastPayoutAmountCents;
      currentPayments.last_payout_amount = previousLastPayoutAmountCents / 100;
      currentPayments.last_payout_amount_formatted = previousPayments?.last_payout_amount_formatted || formatCents(previousLastPayoutAmountCents);
      return;
    }
  }

  const previousAvailableAmountCents = normalizeCents(previousPayments?.available_amount_cents, previousPayments?.available_amount);
  const currentAvailableAmountCents = normalizeCents(currentPayments.available_amount_cents, currentPayments.available_amount);
  if (previousAvailableAmountCents === null || previousAvailableAmountCents <= 0 || (currentAvailableAmountCents !== null && currentAvailableAmountCents > 0)) {
    return;
  }

  currentPayments.last_payout_amount_cents = previousAvailableAmountCents;
  currentPayments.last_payout_amount = previousAvailableAmountCents / 100;
  currentPayments.last_payout_amount_formatted = formatCents(previousAvailableAmountCents);
}

function normalizeCents(centsValue: unknown, amountValue: unknown): number | null {
  if (centsValue !== undefined && centsValue !== null && centsValue !== '') {
    const cents = Number(centsValue);
    if (Number.isFinite(cents)) {
      return Math.round(cents);
    }
  }

  if (amountValue !== undefined && amountValue !== null && amountValue !== '') {
    const amount = Number(amountValue);
    if (Number.isFinite(amount)) {
      return Math.round(amount * 100);
    }
  }

  return null;
}

function formatCents(value: number): string {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100)}`;
}
