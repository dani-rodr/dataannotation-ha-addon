// @ts-nocheck
const DAY_MS = 24 * 60 * 60 * 1000;
const {
  applyFundsHistoryObservations,
  loadFundsHistoryObservations,
  saveFundsHistoryObservations,
} = require('../state/funds_history_observations.ts');
const { buildWorkHoursSnapshot } = require('../state/work_hours.ts');

async function scrapeFundsHistory(apiEntries, {
  observationsPath = null,
  workHoursObservationsPath = null,
  workHoursTimezone = 'UTC',
  workHoursTimezoneSource = 'utc_fallback',
  workHoursWeekStart = 'monday',
  now = new Date(),
  logger = null,
} = {}) {
  if (!apiEntries || !Array.isArray(apiEntries.workLogs) || !Array.isArray(apiEntries.timedWorkEntries)) {
    return {
      ...summarizeFundsHistoryEntries([], now),
      ...buildWorkHoursSnapshot({
        includeFundsHistory: true,
        sourceComplete: false,
        observationsPath: workHoursObservationsPath,
        timezone: workHoursTimezone,
        timezoneSource: workHoursTimezoneSource,
        weekStart: workHoursWeekStart,
        now,
        logger,
      }),
      funds_history_complete: false,
    };
  }

  const parsedEntries = normalizeApiPayoutEntries(apiEntries, now);
  const observations = loadFundsHistoryObservations(observationsPath);
  const nextObservations = { ...observations, entries: { ...(observations.entries || {}) } };
  if (!normalizeIsoDate(nextObservations.api_cutover_at)) {
    nextObservations.api_cutover_at = normalizeIsoDate(now);
  }

  const merged = applyFundsHistoryObservations(parsedEntries, nextObservations, now);
  if (observationsPath) {
    try {
      saveFundsHistoryObservations(observationsPath, merged.observations);
    } catch {
      // Keep the live scrape working if persistence is unavailable.
    }
  }

  return {
    ...summarizeFundsHistoryEntries(merged.entries, now),
    ...buildWorkHoursSnapshot({
      timedWorkEntries: apiEntries.timedWorkEntries,
      includeFundsHistory: true,
      sourceComplete: true,
      observationsPath: workHoursObservationsPath,
      timezone: workHoursTimezone,
      timezoneSource: workHoursTimezoneSource,
      weekStart: workHoursWeekStart,
      now,
      logger,
    }),
    funds_history_complete: true,
  };
}

function summarizeFundsHistoryEntries(entries, now = new Date()) {
  const pendingEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry.status === 'pending')
    : [];
  const paidEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry.status === 'paid')
    : [];
  const lastPayoutSummary = summarizeLastPayoutEntries(paidEntries);

  const nextPayoutDays = pendingEntries.length > 0
    ? Math.min(...pendingEntries.map((entry) => numberOrZero(entry.days_until_available)))
    : 0;
  const nextPayoutAt = pendingEntries.length > 0
    ? pendingEntries
        .map((entry) => normalizeIsoDate(entry.estimated_payout_at) || computeNextPayoutAt(entry, now))
        .filter(Boolean)
        .sort()[0] || null
    : null;

  return {
    next_payout_days: nextPayoutDays,
    next_payout_at: nextPayoutAt,
    next_payout_entries_count: pendingEntries.length,
    pending_payout_entries: pendingEntries,
    last_payout_amount_cents: lastPayoutSummary.amount_cents,
    last_payout_amount: lastPayoutSummary.amount,
    last_payout_amount_formatted: lastPayoutSummary.amount_formatted,
  };
}

function normalizeApiPayoutEntries(value, now = new Date()) {
  const workLogs = Array.isArray(value?.workLogs) ? value.workLogs : [];
  const timedWorkEntries = Array.isArray(value?.timedWorkEntries) ? value.timedWorkEntries : [];
  return workLogs.concat(timedWorkEntries)
    .map((entry) => normalizeApiPayoutEntry(entry, now))
    .filter(Boolean);
}

function normalizeApiPayoutEntry(entry, now = new Date()) {
  const createdAt = normalizeDate(entry?.createdAt);
  const sourceId = normalizeText(entry?.id);
  if (!createdAt || !sourceId) {
    return null;
  }

  const isTimed = entry?.type === 'TimedWorkEntry';
  const status = entry?.status === 'Pending Approval'
    ? 'pending'
    : entry?.status === 'Paid'
      ? 'paid'
      : null;
  if (!status) {
    return null;
  }

  const dueDays = isTimed ? 7 : 3;
  const age = getRelativeAge(createdAt, now);
  const amountCents = numberOrZero(entry?.amountInCents);
  const sourceCreatedAt = createdAt.toISOString();
  const entryDate = `${sourceCreatedAt.slice(0, 10)}T00:00:00.000Z`;

  return {
    source_entry_id: `api:${entry.type}:${sourceId}`,
    source_created_at: sourceCreatedAt,
    project: normalizeText(entry?.project?.name) || null,
    kind: isTimed ? 'hourly' : 'task',
    status,
    amount: formatCents(amountCents),
    amount_cents: amountCents,
    duration: isTimed ? formatDuration(entry?.timeInMinutes) : null,
    relative_age_value: age.value,
    relative_age_unit: age.unit,
    relative_age_text: age.text,
    days_ago: Math.ceil(age.ageMs / DAY_MS),
    days_until_available: Math.max(0, Math.ceil(dueDays - (age.ageMs / DAY_MS))),
    entry_date: entryDate,
    due_days: dueDays,
    estimated_work_at: sourceCreatedAt,
    estimated_payout_at: new Date(createdAt.getTime() + dueDays * DAY_MS).toISOString(),
    estimate_source: 'api_created_at',
    estimate_confidence: 'high',
  };
}

function getRelativeAge(createdAt, now) {
  const ageMs = Math.max(0, (normalizeDate(now) || new Date()).getTime() - createdAt.getTime());
  const units = [
    ['week', 7 * DAY_MS],
    ['day', DAY_MS],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ];
  const [unit, unitMs] = units.find(([, milliseconds]) => ageMs >= milliseconds) || units[units.length - 1];
  const value = Math.floor(ageMs / unitMs);
  return {
    ageMs,
    value,
    unit,
    text: `${value} ${unit}${value === 1 ? '' : 's'} ago`,
  };
}

function formatDuration(value) {
  const minutes = Math.max(0, Math.trunc(Number(value) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) {
    return `${hours}h ${remainder} min`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remainder} min`;
}

function formatPublicPayoutEntries(entries) {
  return sortPayoutEntries(entries).map((entry) => formatPublicPayoutEntry(entry));
}

function formatPublicPayoutEntry(entry) {
  return {
    project: entry?.project || null,
    kind: entry?.kind || null,
    amount: entry?.amount || null,
    relative_age: entry?.relative_age_text || null,
    estimated_work_at: formatHumanTimestamp(entry?.estimated_work_at),
    estimated_payout_at: formatHumanTimestamp(entry?.estimated_payout_at),
    estimated_work_at_iso: normalizeIsoDate(entry?.estimated_work_at),
    estimated_payout_at_iso: normalizeIsoDate(entry?.estimated_payout_at),
    source: entry?.estimate_source || null,
    confidence: entry?.estimate_confidence || null,
  };
}

function sortPayoutEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftValue = String(left.entry?.estimated_payout_at || '');
      const rightValue = String(right.entry?.estimated_payout_at || '');
      if (!leftValue && !rightValue) return left.index - right.index;
      if (!leftValue) return 1;
      if (!rightValue) return -1;
      return leftValue.localeCompare(rightValue) || left.index - right.index;
    })
    .map((item) => item.entry);
}

function summarizeLastPayoutEntries(entries) {
  const grouped = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = normalizePayoutGroupKey(entry);
    if (key === null) continue;
    const cents = Number.isFinite(Number(entry?.amount_cents))
      ? Number(entry.amount_cents)
      : amountToCents(entry?.amount);
    grouped.set(key, (grouped.get(key) || 0) + cents);
  }
  if (grouped.size === 0) {
    return { amount_cents: null, amount: null, amount_formatted: null };
  }
  const latestKey = Math.max(...grouped.keys());
  const amountCents = grouped.get(latestKey) || 0;
  return {
    amount_cents: amountCents,
    amount: centsToNumber(amountCents),
    amount_formatted: formatCents(amountCents),
  };
}

function normalizePayoutGroupKey(entry) {
  const entryDate = normalizeDate(entry?.entry_date) || normalizeDate(entry?.estimated_payout_at);
  return entryDate ? entryDate.getTime() : null;
}

function computeNextPayoutAt(entry, now = new Date()) {
  if (!entry || entry.status !== 'pending') return null;
  const entryDate = normalizeDate(entry.entry_date);
  if (entryDate && Number.isFinite(Number(entry.due_days))) {
    return new Date(entryDate.getTime() + (numberOrZero(entry.due_days) + 1) * DAY_MS).toISOString();
  }
  return null;
}

function amountToCents(value) {
  const match = String(value || '').match(/^\$([\d,]+)(?:\.(\d{2}))?$/);
  if (!match) return 0;
  const [, dollarsRaw, centsRaw = '00'] = match;
  return Number(dollarsRaw.replace(/,/g, '')) * 100 + Number(centsRaw);
}

function centsToNumber(value) {
  return numberOrZero(value) / 100;
}

function formatCents(value) {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberOrZero(value) / 100)}`;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHumanTimestamp(value) {
  const date = normalizeDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function normalizeIsoDate(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = {
  scrapeFundsHistory,
  summarizeFundsHistoryEntries,
  formatPublicPayoutEntries,
  normalizeApiPayoutEntries,
};
