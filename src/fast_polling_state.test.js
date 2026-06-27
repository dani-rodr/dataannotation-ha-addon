const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_FAST_POLLING_ENABLED,
  loadFastPollingState,
  normalizeFastPollingState,
  saveFastPollingState,
} = require('./fast_polling_state');

test('normalizeFastPollingState defaults to disabled', () => {
  assert.equal(DEFAULT_FAST_POLLING_ENABLED, false);
  assert.equal(normalizeFastPollingState(undefined), false);
  assert.equal(normalizeFastPollingState('ON'), true);
  assert.equal(normalizeFastPollingState('OFF'), false);
});

test('fast polling state round-trips through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-fast-poll-'));
  const filePath = path.join(dir, 'fast-polling-state.json');

  try {
    assert.equal(loadFastPollingState(filePath), false);
    saveFastPollingState(filePath, true);
    assert.equal(loadFastPollingState(filePath), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
