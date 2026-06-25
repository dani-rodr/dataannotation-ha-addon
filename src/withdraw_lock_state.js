const fs = require('fs');
const path = require('path');

const DEFAULT_WITHDRAW_LOCKED = true;

function loadWithdrawLockState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return DEFAULT_WITHDRAW_LOCKED;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeWithdrawLockState(payload?.locked ?? payload?.withdrawLocked ?? payload?.value ?? payload?.state);
  } catch {
    return DEFAULT_WITHDRAW_LOCKED;
  }
}

function saveWithdrawLockState(filePath, locked) {
  if (!filePath) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        locked: Boolean(locked),
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function normalizeWithdrawLockState(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['on', 'true', 'locked', 'lock', '1'].includes(normalized)) {
      return true;
    }
    if (['off', 'false', 'unlocked', 'unlock', '0'].includes(normalized)) {
      return false;
    }
  }

  return DEFAULT_WITHDRAW_LOCKED;
}

module.exports = {
  DEFAULT_WITHDRAW_LOCKED,
  loadWithdrawLockState,
  normalizeWithdrawLockState,
  saveWithdrawLockState,
};
