import fs from 'fs';
import path from 'path';

export const DEFAULT_FAST_POLLING_ENABLED = false;

export function loadFastPollingState(filePath: string | null | undefined): boolean {
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

export function saveFastPollingState(filePath: string | null | undefined, enabled: boolean): void {
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

export function normalizeFastPollingState(value: unknown): boolean {
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
