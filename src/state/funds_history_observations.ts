// @ts-nocheck
// @ts-nocheck
const path = require('node:path');
const fs = require('node:fs');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OBSERVATIONS = {
  version: 1,
  entries: {},
  updated_at: null,
};

function loadFundsHistoryObservations(filePath: any) {
  if (!filePath || !fs.existsSync(filePath)) {
    return cloneObservations(DEFAULT_OBSERVATIONS);
  }

  try {
    return normalizeObservations(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return cloneObservations(DEFAULT_OBSERVATIONS);
  }
}

function saveFundsHistoryObservations(filePath: any, observations: any) {
  if (!filePath) {
    return;
  }

  const normalized = normalizeObservations(observations);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
}

function applyFundsHistoryObservations(entries: any, observations: any = null, now = new Date()) {
  const current = normalizeDate(now) || new Date();
  const state = normalizeObservations(observations);
  const seenFingerprints = new Set();
  const mergedEntries = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.status) {
      continue;
    }

    const fingerprint = buildFundsHistoryEntryFingerprint(entry);
    const existing = fingerprint ? state.entries[fingerprint] || null : null;

    if (entry.status === 'paid') {
      if (fingerprint) {
        delete state.entries[fingerprint];
        seenFingerprints.add(fingerprint);
      }
      continue;
    }

    if (fingerprint) {
      seenFingerprints.add(fingerprint);
    }

    const estimate = existing
      ? {
          estimated_work_at: existing.estimated_work_at || null,
          estimated_payout_at: existing.estimated_payout_at || null,
          estimate_source: existing.estimate_source || null,
          estimate_confidence: existing.estimate_confidence || null,
          first_seen_at: existing.first_seen_at || existing.last_seen_at || current.toISOString(),
        }
      : estimateFundsHistoryEntry(entry, current);

    const mergedEntry = {
      ...entry,
      fingerprint: fingerprint || null,
      first_seen_at: estimate.first_seen_at || current.toISOString(),
      last_seen_at: current.toISOString(),
      estimated_work_at: estimate.estimated_work_at || null,
      estimated_payout_at: estimate.estimated_payout_at || null,
      estimate_source: estimate.estimate_source || null,
      estimate_confidence: estimate.estimate_confidence || null,
    };

    if (fingerprint) {
      state.entries[fingerprint] = pickStoredObservationFields(mergedEntry);
    }

    mergedEntries.push(mergedEntry);
  }

  for (const [fingerprint, observation] of Object.entries(state.entries)) {
    if (seenFingerprints.has(fingerprint)) {
      continue;
    }

    if ((observation as any).status === 'paid') {
      delete state.entries[fingerprint];
      continue;
    }

    const payoutAt = normalizeDate((observation as any).estimated_payout_at);
    if (payoutAt && payoutAt.getTime() <= current.getTime()) {
      delete state.entries[fingerprint];
    }
  }

  state.updated_at = current.toISOString();

  return {
    entries: mergedEntries,
    observations: state,
  };
}

function estimateFundsHistoryEntry(entry: any, now = new Date()) {
  const current = normalizeDate(now) || new Date();
  const ageUnit = String(entry?.relative_age_unit || '').toLowerCase();
  const ageValue = numberOrZero(entry?.relative_age_value);
  const dueDays = numberOrZero(entry?.due_days) || (entry?.kind === 'task' ? 3 : 7);
  const entryDate = normalizeDate(entry?.entry_date);
  let estimatedWorkAt = null;
  let estimateSource = null;
  let estimateConfidence = null;

  if ((ageUnit === 'hour' || ageUnit === 'minute') && ageValue > 0) {
    estimatedWorkAt = new Date(current.getTime() - ageValue * relativeAgeUnitToMs(ageUnit));
    estimateSource = ageUnit === 'minute' ? 'observed_minutes' : 'observed_hours';
    estimateConfidence = 'high';
  } else if (entryDate) {
    estimatedWorkAt = entryDate;
    estimateSource = 'row_date_fallback';
    estimateConfidence = 'low';
  } else {
    estimatedWorkAt = current;
    estimateSource = 'current_time_fallback';
    estimateConfidence = 'low';
  }

  let estimatedPayoutAt = null;
  if ((ageUnit === 'hour' || ageUnit === 'minute') && ageValue > 0) {
    estimatedPayoutAt = estimatePayoutAtFromWorkAt(estimatedWorkAt, dueDays, current);
  } else if (entryDate) {
    estimatedPayoutAt = estimatePayoutAtFromEntryDate(entryDate, dueDays, current);
  } else {
    estimatedPayoutAt = toLocalMidnightAtOffset(current, dueDays) || new Date(current.getTime() + dueDays * DAY_MS);
  }

  return {
    first_seen_at: current.toISOString(),
    estimated_work_at: estimatedWorkAt.toISOString(),
    estimated_payout_at: estimatedPayoutAt.toISOString(),
    estimate_source: estimateSource,
    estimate_confidence: estimateConfidence,
  };
}

function buildFundsHistoryEntryFingerprint(entry: any) {
  const parts = [
    normalizeText(entry?.entry_date || ''),
    normalizeText(entry?.project || ''),
    normalizeText(entry?.kind || ''),
    normalizeText(entry?.amount || ''),
    normalizeText(entry?.duration || ''),
  ];

  if (parts.every((part) => !part)) {
    return null;
  }

  return parts.join('|');
}

function pickStoredObservationFields(entry: any) {
  return {
    fingerprint: entry.fingerprint,
    project: entry.project,
    kind: entry.kind,
    status: entry.status,
    amount: entry.amount,
    amount_cents: entry.amount_cents,
    duration: entry.duration,
    entry_date: entry.entry_date,
    relative_age_value: entry.relative_age_value,
    relative_age_unit: entry.relative_age_unit,
    relative_age_text: entry.relative_age_text,
    days_until_available: entry.days_until_available,
    due_days: entry.due_days,
    first_seen_at: entry.first_seen_at,
    last_seen_at: entry.last_seen_at,
    estimated_work_at: entry.estimated_work_at,
    estimated_payout_at: entry.estimated_payout_at,
    estimate_source: entry.estimate_source,
    estimate_confidence: entry.estimate_confidence,
  };
}

function normalizeObservations(value: any) {
  const entries = value && typeof value === 'object' && value.entries && typeof value.entries === 'object' ? value.entries : {};
  const normalizedEntries = {};

  for (const [fingerprint, entry] of Object.entries(entries)) {
    const normalized = normalizeObservationEntry(fingerprint, entry);
    if (normalized) {
      normalizedEntries[fingerprint] = normalized;
    }
  }

  return {
    version: 1,
    entries: normalizedEntries,
    updated_at: normalizeIsoDate(value?.updated_at) || null,
  };
}

function normalizeObservationEntry(fingerprint: any, entry: any) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const normalizedFingerprint = normalizeText(entry.fingerprint || fingerprint);
  if (!normalizedFingerprint) {
    return null;
  }

  const normalized = {
    fingerprint: normalizedFingerprint,
    project: entry.project || null,
    kind: entry.kind || null,
    status: entry.status || 'pending',
    amount: entry.amount || null,
    amount_cents: numberOrZero(entry.amount_cents),
    duration: entry.duration || null,
    entry_date: normalizeIsoDate(entry.entry_date) || null,
    relative_age_value: numberOrZero(entry.relative_age_value),
    relative_age_unit: entry.relative_age_unit || null,
    relative_age_text: entry.relative_age_text || null,
    days_until_available: numberOrZero(entry.days_until_available),
    due_days: numberOrZero(entry.due_days),
    first_seen_at: normalizeIsoDate(entry.first_seen_at) || null,
    last_seen_at: normalizeIsoDate(entry.last_seen_at) || null,
    estimated_work_at: normalizeIsoDate(entry.estimated_work_at) || null,
    estimated_payout_at: normalizeIsoDate(entry.estimated_payout_at) || null,
    estimate_source: entry.estimate_source || null,
    estimate_confidence: entry.estimate_confidence || null,
  };

  return repairObservationEntry(normalized);
}

function normalizeIsoDate(value: any) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function normalizeDate(value: any) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextLocalMidnight(value: any, daysOffset: any) {
  const date = normalizeDate(value);
  if (!date) {
    return null;
  }

  const result = new Date(date);
  result.setDate(result.getDate() + numberOrZero(daysOffset));
  result.setHours(0, 0, 0, 0);
  return result;
}

function toLocalMidnightAtOffset(value: any, daysOffset: any) {
  return nextLocalMidnight(value, daysOffset);
}

function estimatePayoutAtFromEntryDate(entryDate: any, dueDays: any, now = new Date()) {
  const baseDate = normalizeDate(entryDate);
  if (!baseDate) {
    return null;
  }

  const payoutDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + numberOrZero(dueDays) + 1,
    0,
    0,
    0,
    0
  );

  const current = normalizeDate(now) || new Date();
  if (payoutDate <= current) {
    payoutDate.setDate(payoutDate.getDate() + 1);
  }

  return payoutDate;
}

function estimatePayoutAtFromWorkAt(workAt: any, dueDays: any, now = new Date()) {
  const baseDate = normalizeDate(workAt);
  if (!baseDate) {
    return null;
  }

  const payoutDate = new Date(baseDate.getTime() + numberOrZero(dueDays) * DAY_MS);
  const current = normalizeDate(now) || new Date();
  if (payoutDate <= current) {
    payoutDate.setDate(payoutDate.getDate() + 1);
  }

  return payoutDate;
}

function repairObservationEntry(entry: any) {
  const current = normalizeDate(entry.last_seen_at || entry.first_seen_at || new Date()) || new Date();
  const payoutAt = normalizeDate(entry.estimated_payout_at);
  const workAt = normalizeDate(entry.estimated_work_at);
  const dueDays = numberOrZero(entry.due_days) || (entry.kind === 'task' ? 3 : 7);
  const shouldRepairMidnightFallback = Boolean(
    payoutAt &&
    workAt &&
    payoutAt.getUTCHours() === 0 &&
    payoutAt.getUTCMinutes() === 0 &&
    payoutAt.getUTCSeconds() === 0 &&
    payoutAt.getUTCMilliseconds() === 0
  );

  if (shouldRepairMidnightFallback) {
    const repaired = estimatePayoutAtFromWorkAt(workAt, dueDays, current);
    if (repaired) {
      return {
        ...entry,
        estimated_payout_at: repaired.toISOString(),
      };
    }
  }

  if (payoutAt && payoutAt.getTime() <= current.getTime()) {
    if (workAt) {
      const repaired = estimatePayoutAtFromWorkAt(workAt, dueDays, current);
      if (repaired) {
        return {
          ...entry,
          estimated_payout_at: repaired.toISOString(),
        };
      }
    }

    return {
      ...entry,
      estimated_payout_at: new Date(current.getTime() + DAY_MS).toISOString(),
    };
  }

  return entry;
}

function cloneObservations(value: any) {
  return normalizeObservations(JSON.parse(JSON.stringify(value)));
}

function normalizeText(value: any) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().toLowerCase();
}

function numberOrZero(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeAgeUnitToMs(unit: any) {
  switch (String(unit || '').toLowerCase()) {
    case 'minute':
      return 60 * 1000;
    case 'hour':
      return 60 * 60 * 1000;
    default:
      return DAY_MS;
  }
}

module.exports = {
  applyFundsHistoryObservations,
  loadFundsHistoryObservations,
  saveFundsHistoryObservations,
};
