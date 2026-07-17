import fs from 'fs';
import path from 'path';

import type { PaymentSnapshot } from '../shared/types';

export function loadNextWithdrawalState(filePath: string | null | undefined): PaymentSnapshot | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return normalizeNextWithdrawalState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

export function saveNextWithdrawalState(filePath: string | null | undefined, payments: PaymentSnapshot | null | undefined): void {
  if (!filePath) {
    return;
  }

  const state = normalizeNextWithdrawalState(payments);
  const payload = state || {
    next_withdrawal_at: null,
    next_withdrawal_text: null,
    next_withdrawal_source: null,
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    ...payload,
    updated_at: new Date().toISOString(),
  }, null, 2));
}

export function normalizeNextWithdrawalState(value: unknown): PaymentSnapshot | null {
  const payload = value && typeof value === 'object' ? value as PaymentSnapshot : null;
  if (!payload) {
    return null;
  }

  const nextWithdrawalAt = normalizeDate(payload.next_withdrawal_at);
  const lastPayoutAt = normalizeDate(payload.last_payout_at);
  if (!nextWithdrawalAt && !lastPayoutAt) {
    return null;
  }

  const lastPayoutAmountCents = normalizeCents(payload.last_payout_amount_cents, payload.last_payout_amount);
  return {
    next_withdrawal_at: nextWithdrawalAt,
    next_withdrawal_text: normalizeText(payload.next_withdrawal_text),
    next_withdrawal_source: normalizeText(payload.next_withdrawal_source),
    last_payout_at: lastPayoutAt,
    last_payout_amount_cents: lastPayoutAmountCents,
    last_payout_amount: lastPayoutAmountCents === null ? null : lastPayoutAmountCents / 100,
    last_payout_amount_formatted: lastPayoutAmountCents === null
      ? null
      : normalizeText(payload.last_payout_amount_formatted) || formatCents(lastPayoutAmountCents),
  };
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function normalizeDate(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
