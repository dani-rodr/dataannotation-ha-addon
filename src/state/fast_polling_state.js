const fs = require('fs');
const path = require('path');

const DEFAULT_FAST_POLLING_ENABLED = false;

function loadFastPollingState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return DEFAULT_FAST_POLLING_ENABLED;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeFastPollingState(payload?.enabled ?? payload?.fastPollingEnabled ?? payload?.value ?? payload?.state);
  } catch {
    return DEFAULT_FAST_POLLING_ENABLED;
  }
}

function saveFastPollingState(filePath, enabled) {
  if (!filePath) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        enabled: Boolean(enabled),
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function normalizeFastPollingState(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['on', 'true', 'enabled', 'enable', '1'].includes(normalized)) {
      return true;
    }
    if (['off', 'false', 'disabled', 'disable', '0'].includes(normalized)) {
      return false;
    }
  }

  return DEFAULT_FAST_POLLING_ENABLED;
}

module.exports = {
  DEFAULT_FAST_POLLING_ENABLED,
  loadFastPollingState,
  normalizeFastPollingState,
  saveFastPollingState,
};
