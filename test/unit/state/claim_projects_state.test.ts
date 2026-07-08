const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_CLAIM_PROJECTS_LOCKED,
  loadClaimProjectsLockState,
  normalizeClaimProjectsLockState,
  saveClaimProjectsLockState,
} = require('../../../src/state/claim_projects_state.ts');

test('normalizeClaimProjectsLockState defaults to unlocked', () => {
  assert.equal(DEFAULT_CLAIM_PROJECTS_LOCKED, false);
  assert.equal(normalizeClaimProjectsLockState(undefined), false);
  assert.equal(normalizeClaimProjectsLockState('ON'), true);
  assert.equal(normalizeClaimProjectsLockState('OFF'), false);
});

test('claim projects lock state round-trips through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-claim-lock-'));
  const filePath = path.join(dir, 'claim-projects-lock-state.json');

  try {
    assert.equal(loadClaimProjectsLockState(filePath), false);
    saveClaimProjectsLockState(filePath, true);
    assert.equal(loadClaimProjectsLockState(filePath), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
