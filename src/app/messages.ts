// @ts-nocheck
import type { PaymentSnapshot } from '../shared/types';

export type WithdrawalNotReadyReason = 'time' | 'funds' | 'button';

export function buildWithdrawalLockedMessage(): string {
  return 'Withdrawals are currently locked.\n\nTurn off Withdraw Locked, then press Withdraw Funds again.';
}

export function buildClaimProjectsLockedMessage(): string {
  return 'Claim projects are currently locked.\n\nTurn off Claim Projects Locked, then press Claim Project again.';
}

export function buildClaimNotReadyMessage(result: { status?: string } | null | undefined): string {
  if (result?.status === 'screen_too_small') {
    return 'Claim Project is not available right now.\n\nThe task page is still blocked by the screen size requirement.';
  }

  if (result?.status === 'not_found') {
    return 'Claim Project is not available right now.\n\nThe project was not found on the current projects page.';
  }

  if (result?.status === 'wrong_route') {
    return 'Claim Project navigated to an unexpected page.\n\nThe project row did not open a task page.';
  }

  return 'Claim Project is not available right now.\n\nThe project did not open a claimable task page.';
}

export function buildWithdrawalNotReadyMessage(payments: PaymentSnapshot, reason: WithdrawalNotReadyReason): string {
  if (reason === 'time') {
    const nextWithdrawalText = formatFriendlyDate(payments.next_withdrawal_at);
    return `Withdrawal is not available yet.\n\nNext withdrawal: ${nextWithdrawalText || 'unknown'}.`;
  }

  if (!payments.withdraw_button_present) {
    return 'Withdrawal is not available right now.\n\nThe withdrawal button is not visible on DataAnnotation.';
  }

  return `Withdrawal is not available right now.\n\nAvailable funds: ${payments.available_amount_formatted}.`;
}

export function formatFriendlyDate(value: unknown): string | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function parseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}
