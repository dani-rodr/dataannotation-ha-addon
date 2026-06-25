const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_WITHDRAW_LOCKED,
  loadWithdrawLockState,
  normalizeWithdrawLockState,
  saveWithdrawLockState,
} = require('./withdraw_lock_state');

test('normalizeWithdrawLockState defaults to locked', () => {
  assert.equal(DEFAULT_WITHDRAW_LOCKED, true);
  assert.equal(normalizeWithdrawLockState(undefined), true);
  assert.equal(normalizeWithdrawLockState('ON'), true);
  assert.equal(normalizeWithdrawLockState('OFF'), false);
});

test('withdraw lock state round-trips through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-lock-'));
  const filePath = path.join(dir, 'withdraw-lock-state.json');

  try {
    assert.equal(loadWithdrawLockState(filePath), true);
    saveWithdrawLockState(filePath, false);
    assert.equal(loadWithdrawLockState(filePath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
