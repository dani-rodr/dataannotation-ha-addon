const fs = require('fs');
const path = require('path');

const DEFAULT_AUTO_ACCEPT_ENABLED = false;

function loadAutoAcceptState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return DEFAULT_AUTO_ACCEPT_ENABLED;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeAutoAcceptState(payload?.enabled ?? payload?.autoAcceptEnabled ?? payload?.value ?? payload?.state);
  } catch {
    return DEFAULT_AUTO_ACCEPT_ENABLED;
  }
}

function saveAutoAcceptState(filePath, enabled) {
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

function normalizeAutoAcceptState(value) {
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

  return DEFAULT_AUTO_ACCEPT_ENABLED;
}

module.exports = {
  DEFAULT_AUTO_ACCEPT_ENABLED,
  loadAutoAcceptState,
  normalizeAutoAcceptState,
  saveAutoAcceptState,
};
