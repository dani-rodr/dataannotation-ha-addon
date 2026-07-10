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
  if (!payload?.next_withdrawal_at) {
    return null;
  }

  const date = new Date(payload.next_withdrawal_at);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    next_withdrawal_at: date.toISOString(),
    next_withdrawal_text: normalizeText(payload.next_withdrawal_text),
    next_withdrawal_source: normalizeText(payload.next_withdrawal_source),
  };
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}
