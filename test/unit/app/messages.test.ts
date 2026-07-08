// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildClaimNotReadyMessage,
  buildWithdrawalLockedMessage,
  buildWithdrawalNotReadyMessage,
} = require('../../../src/app/messages.ts');

test('buildWithdrawalLockedMessage explains the lock', () => {
  assert.equal(
    buildWithdrawalLockedMessage(),
    'Withdrawals are currently locked.\n\nTurn off Withdraw Locked, then press Withdraw Funds again.'
  );
});

test('buildClaimNotReadyMessage explains the main claim failure modes', () => {
  assert.match(buildClaimNotReadyMessage({ status: 'screen_too_small' }), /screen size requirement/);
  assert.match(buildClaimNotReadyMessage({ status: 'not_found' }), /not found on the current projects page/);
  assert.match(buildClaimNotReadyMessage({ status: 'wrong_route' }), /unexpected page/);
});

test('buildWithdrawalNotReadyMessage keeps the next withdrawal fallback readable', () => {
  assert.equal(
    buildWithdrawalNotReadyMessage({ next_withdrawal_at: 'invalid', withdraw_button_present: true, available_amount_formatted: '$0.00' }, 'time'),
    'Withdrawal is not available yet.\n\nNext withdrawal: unknown.'
  );
  assert.match(
    buildWithdrawalNotReadyMessage({ next_withdrawal_at: null, withdraw_button_present: false, available_amount_formatted: '$0.00' }, 'button'),
    /withdrawal button is not visible/
  );
});
