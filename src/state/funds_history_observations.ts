// @ts-nocheck
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OBSERVATIONS = {
  version: 2,
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
  const seenObservationIds = new Set();
  const matchedStableKeys = new Map();
  const seenFingerprintCounts = new Map();
  const { byFingerprint, byStableKey } = buildObservationIndex(state);
  const mergedEntries = [];

  for (const entry of sortParsedEntries(entries)) {
    if (!entry || !entry.status) {
      continue;
    }

    const fingerprint = buildFundsHistoryEntryFingerprint(entry);
    const stableKey = buildStableObservationKey(entry);
    const fingerprintCount = fingerprint ? ((seenFingerprintCounts.get(fingerprint) || 0) + 1) : 1;
    if (fingerprint) {
      seenFingerprintCounts.set(fingerprint, fingerprintCount);
    }
    const exactExisting = fingerprint ? byFingerprint.get(fingerprint) || null : null;
    const stableCandidates = stableKey ? byStableKey.get(stableKey) || [] : [];
    let existing = exactExisting;

    if (!existing && stableCandidates.length > 0) {
      const candidate = stableCandidates.find((item) => !seenObservationIds.has(normalizeText(item?.observation_id)));
      if (candidate) {
        const matchedCount = matchedStableKeys.get(stableKey) || 0;
        existing = candidate;
        matchedStableKeys.set(stableKey, matchedCount + 1);
      }
    }

    if (entry.status === 'paid') {
      if (existing?.observation_id) {
        delete state.entries[existing.observation_id];
        seenObservationIds.add(existing.observation_id);
      }

      if (fingerprint && byFingerprint.has(fingerprint)) {
        const observation = byFingerprint.get(fingerprint);
        delete state.entries[observation.observation_id];
        seenObservationIds.add(observation.observation_id);
      }

      mergedEntries.push(entry);
      continue;
    }

    if (existing?.observation_id) {
      seenObservationIds.add(existing.observation_id);
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

    const aliases = existing ? Array.from(new Set([...(existing.aliases || []), existing.fingerprint, existing.current_fingerprint, fingerprint].filter(Boolean).map((value) => normalizeText(value)).filter(Boolean))) : [fingerprint].filter(Boolean);
    const mergedEntry = toObservationRecord({
      ...entry,
      ...estimate,
      first_seen_at: estimate.first_seen_at || current.toISOString(),
      last_seen_at: current.toISOString(),
      estimated_work_at: estimate.estimated_work_at || null,
      estimated_payout_at: estimate.estimated_payout_at || null,
      estimate_source: estimate.estimate_source || null,
      estimate_confidence: estimate.estimate_confidence || null,
    }, fingerprint || makeObservationId(stableKey, fingerprintCount), current, existing, aliases, fingerprintCount);

    if (mergedEntry.observation_id) {
      state.entries[mergedEntry.observation_id] = pickStoredObservationFields(mergedEntry);
      seenObservationIds.add(mergedEntry.observation_id);
    }

    mergedEntries.push(mergedEntry);
  }

  for (const [observationId, observation] of Object.entries(state.entries)) {
    if (seenObservationIds.has(observationId)) {
      continue;
    }

    if ((observation as any).status === 'paid') {
      delete state.entries[observationId];
      continue;
    }

    const payoutAt = normalizeDate((observation as any).estimated_payout_at);
    if (payoutAt && payoutAt.getTime() <= current.getTime()) {
      delete state.entries[observationId];
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
    observation_id: entry.observation_id,
    fingerprint: entry.fingerprint,
    current_fingerprint: entry.current_fingerprint,
    aliases: entry.aliases,
    stable_key: entry.stable_key,
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
      normalizedEntries[normalized.observation_id] = normalized;
    }
  }

  return {
    version: 2,
    entries: normalizedEntries,
    updated_at: normalizeIsoDate(value?.updated_at) || null,
  };
}

function sortParsedEntries(entries: any) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftKey = buildStableObservationKey(left.entry);
      const rightKey = buildStableObservationKey(right.entry);

      if (leftKey !== rightKey) {
        return leftKey.localeCompare(rightKey);
      }

      const leftDate = normalizeDate(left.entry?.first_seen_at)?.getTime() || 0;
      const rightDate = normalizeDate(right.entry?.first_seen_at)?.getTime() || 0;
      if (leftDate !== rightDate) {
        return leftDate - rightDate;
      }

      return left.index - right.index;
    })
    .map((item) => item.entry);
}

function normalizeObservationEntry(fingerprint: any, entry: any) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const normalizedFingerprint = normalizeText(entry.fingerprint || fingerprint);
  if (!normalizedFingerprint) {
    return null;
  }

  const normalizedObservationId = normalizeText(entry.observation_id || entry.current_fingerprint || normalizedFingerprint) || normalizedFingerprint;
  const aliases = normalizeAliasList(entry.aliases || entry.fingerprint_aliases || []);
  const normalizedAliases = uniqueTextList([normalizedFingerprint, normalizedObservationId, ...aliases].filter(Boolean));

  const normalized = {
    observation_id: normalizedObservationId,
    fingerprint: normalizedFingerprint,
    current_fingerprint: normalizeText(entry.current_fingerprint || normalizedFingerprint) || normalizedFingerprint,
    aliases: normalizedAliases,
    stable_key: normalizeText(entry.stable_key || buildStableObservationKey(entry)) || buildStableObservationKey(entry),
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

function buildStableObservationKey(entry: any) {
  return [
    normalizeText(entry?.entry_date),
    normalizeText(entry?.kind),
    String(numberOrZero(entry?.amount_cents)),
  ].join('|');
}

function normalizeAliasList(value: any) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function uniqueTextList(values: any) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean))];
}

function makeObservationId(fingerprint: string, occurrence = 1) {
  const suffix = Math.max(1, Math.trunc(Number(occurrence) || 1));
  const hash = crypto.createHash('sha1').update(String(fingerprint || '')).digest('hex').slice(0, 12);
  return suffix > 1 ? `obs_${hash}#${suffix}` : `obs_${hash}`;
}

function toObservationRecord(entry: any, currentFingerprint: string, now: Date, existing: any = null, aliases: string[] = [], occurrence = 1) {
  const observationId = existing?.observation_id || (occurrence > 1 ? makeObservationId(currentFingerprint || buildStableObservationKey(entry), occurrence) : currentFingerprint || makeObservationId(currentFingerprint || buildStableObservationKey(entry), occurrence));
  const fingerprintAliases = uniqueTextList([
    ...(Array.isArray(existing?.aliases) ? existing.aliases : []),
    ...(Array.isArray(aliases) ? aliases : []),
    normalizeText(existing?.fingerprint),
    normalizeText(existing?.current_fingerprint),
    normalizeText(currentFingerprint),
  ]);

  return {
    observation_id: observationId,
    fingerprint: currentFingerprint,
    current_fingerprint: currentFingerprint,
    aliases: fingerprintAliases,
    stable_key: buildStableObservationKey(entry),
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
    first_seen_at: normalizeIsoDate(entry.first_seen_at) || now.toISOString(),
    last_seen_at: normalizeIsoDate(entry.last_seen_at) || now.toISOString(),
    estimated_work_at: normalizeIsoDate(entry.estimated_work_at) || null,
    estimated_payout_at: normalizeIsoDate(entry.estimated_payout_at) || null,
    estimate_source: entry.estimate_source || null,
    estimate_confidence: entry.estimate_confidence || null,
  };
}

function buildObservationIndex(state: any) {
  const byFingerprint = new Map();
  const byStableKey = new Map();

  for (const observation of Object.values(state?.entries || {})) {
    const id = normalizeText(observation?.observation_id);
    if (!id) {
      continue;
    }

    for (const alias of uniqueTextList([observation?.fingerprint, observation?.current_fingerprint, ...(Array.isArray(observation?.aliases) ? observation.aliases : [])])) {
      byFingerprint.set(alias, observation);
    }

    const stableKey = normalizeText(observation?.stable_key);
    if (!stableKey) {
      continue;
    }

    if (!byStableKey.has(stableKey)) {
      byStableKey.set(stableKey, []);
    }

    byStableKey.get(stableKey).push(observation);
  }

  for (const observations of byStableKey.values()) {
    observations.sort((left, right) => {
      const leftSeen = normalizeDate(left?.first_seen_at)?.getTime() || 0;
      const rightSeen = normalizeDate(right?.first_seen_at)?.getTime() || 0;
      if (leftSeen !== rightSeen) {
        return leftSeen - rightSeen;
      }

      return String(left?.observation_id || '').localeCompare(String(right?.observation_id || ''));
    });
  }

  return { byFingerprint, byStableKey };
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
