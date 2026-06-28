const fs = require('fs');
const path = require('path');

const DEFAULT_CLAIM_PROJECTS_LOCKED = false;

function loadClaimProjectsLockState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return DEFAULT_CLAIM_PROJECTS_LOCKED;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeClaimProjectsLockState(payload?.locked ?? payload?.claimProjectsLocked ?? payload?.value ?? payload?.state);
  } catch {
    return DEFAULT_CLAIM_PROJECTS_LOCKED;
  }
}

function saveClaimProjectsLockState(filePath, locked) {
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

function normalizeClaimProjectsLockState(value) {
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

  return DEFAULT_CLAIM_PROJECTS_LOCKED;
}

module.exports = {
  DEFAULT_CLAIM_PROJECTS_LOCKED,
  loadClaimProjectsLockState,
  normalizeClaimProjectsLockState,
  saveClaimProjectsLockState,
};
