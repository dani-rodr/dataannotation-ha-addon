const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  loadNextWithdrawalState,
  normalizeNextWithdrawalState,
  saveNextWithdrawalState,
} = require('../../../src/state/next_withdrawal_state.ts');

test('next withdrawal state round-trips through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-next-withdrawal-'));
  const filePath = path.join(dir, 'state.json');

  try {
    saveNextWithdrawalState(filePath, {
      next_withdrawal_at: '2026-07-13T11:17:10+00:00',
      next_withdrawal_text: 'Next withdrawal: July 13, 2026 at 7:17 PM GMT+8',
      next_withdrawal_source: 'direct',
      next_withdrawal_amount: 999,
    });

    assert.deepEqual(loadNextWithdrawalState(filePath), {
      next_withdrawal_at: '2026-07-13T11:17:10.000Z',
      next_withdrawal_text: 'Next withdrawal: July 13, 2026 at 7:17 PM GMT+8',
      next_withdrawal_source: 'direct',
      last_payout_at: null,
      last_payout_amount_cents: null,
      last_payout_amount: null,
      last_payout_amount_formatted: null,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('next withdrawal state rejects missing, malformed, and invalid timestamps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-next-withdrawal-'));
  const filePath = path.join(dir, 'state.json');

  try {
    assert.equal(loadNextWithdrawalState(filePath), null);
    fs.writeFileSync(filePath, '{broken');
    assert.equal(loadNextWithdrawalState(filePath), null);
    assert.equal(normalizeNextWithdrawalState({ next_withdrawal_at: 'invalid' }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('saving an unknown withdrawal clears the persisted timestamp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-next-withdrawal-'));
  const filePath = path.join(dir, 'state.json');

  try {
    saveNextWithdrawalState(filePath, null);
    assert.equal(loadNextWithdrawalState(filePath), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('next withdrawal state preserves a last payout when no next withdrawal is known', () => {
  const state = normalizeNextWithdrawalState({
    last_payout_at: '2026-07-16T11:17:37Z',
    last_payout_amount_cents: 48125,
    last_payout_amount: 481.25,
    last_payout_amount_formatted: '$481.25',
  });

  assert.deepEqual(state, {
    next_withdrawal_at: null,
    next_withdrawal_text: null,
    next_withdrawal_source: null,
    last_payout_at: '2026-07-16T11:17:37.000Z',
    last_payout_amount_cents: 48125,
    last_payout_amount: 481.25,
    last_payout_amount_formatted: '$481.25',
  });
});
