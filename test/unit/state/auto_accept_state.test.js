const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_AUTO_ACCEPT_ENABLED,
  loadAutoAcceptState,
  normalizeAutoAcceptState,
  saveAutoAcceptState,
} = require('../../../src/state/auto_accept_state.ts');

test('normalizeAutoAcceptState defaults to disabled', () => {
  assert.equal(DEFAULT_AUTO_ACCEPT_ENABLED, false);
  assert.equal(normalizeAutoAcceptState(undefined), false);
  assert.equal(normalizeAutoAcceptState('ON'), true);
  assert.equal(normalizeAutoAcceptState('OFF'), false);
});

test('auto accept state round-trips through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-auto-accept-'));
  const filePath = path.join(dir, 'auto-accept-state.json');

  try {
    assert.equal(loadAutoAcceptState(filePath), false);
    saveAutoAcceptState(filePath, true);
    assert.equal(loadAutoAcceptState(filePath), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
