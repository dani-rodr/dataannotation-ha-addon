// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 35;
const DEFAULT_STATE = {
  version: 1,
  entries: {},
  last_complete_at: null,
  updated_at: null,
};

function buildWorkHoursSnapshot({
  timedWorkEntries = null,
  includeFundsHistory = false,
  sourceComplete = false,
  observationsPath = '/data/work-hours-observations.json',
  timezone = 'UTC',
  timezoneSource = 'utc_fallback',
  weekStart = 'monday',
  now = new Date(),
  logger = null,
} = {}) {
  const current = normalizeDate(now) || new Date();
  const state = loadWorkHoursObservations(observationsPath);

  if (includeFundsHistory && sourceComplete && Array.isArray(timedWorkEntries)) {
    for (const entry of normalizeTimedWorkEntries(timedWorkEntries)) {
      const existing = state.entries[entry.source_entry_id];
      state.entries[entry.source_entry_id] = {
        ...entry,
        first_seen_at: existing?.first_seen_at || current.toISOString(),
        last_seen_at: current.toISOString(),
      };
    }
    pruneExpiredEntries(state, current);
    state.last_complete_at = current.toISOString();
    state.updated_at = current.toISOString();
    try {
      saveWorkHoursObservations(observationsPath, state);
    } catch (error) {
      logger?.warning?.(`Failed to persist work-hours observations: ${error.message}`);
    }
  }

  return summarizeWorkHours(state, {
    timezone,
    timezoneSource,
    weekStart,
    now: current,
    stale: !includeFundsHistory || !sourceComplete,
  });
}

function normalizeTimedWorkEntries(entries) {
  return entries
    .map((entry) => {
      const createdAt = normalizeDate(entry?.createdAt);
      const id = normalizeText(entry?.id);
      const minutes = Number(entry?.timeInMinutes);
      const status = entry?.status === 'Pending Approval' ? 'pending' : entry?.status === 'Paid' ? 'paid' : null;
      if (!createdAt || !id || !status || !Number.isFinite(minutes) || minutes < 0) {
        return null;
      }

      return {
        source_entry_id: `api:TimedWorkEntry:${id}`,
        source_created_at: createdAt.toISOString(),
        duration_minutes: minutes,
        project: normalizeText(entry?.project?.name) || 'Unknown project',
        status,
      };
    })
    .filter(Boolean);
}

function summarizeWorkHours(state, { timezone, timezoneSource, weekStart, now, stale }) {
  const today = localDateKey(now, timezone);
  const currentWeekStart = getWeekStartDate(today, weekStart);
  const daily = new Map();
  const weekly = new Map();

  for (const entry of Object.values(state.entries || {})) {
    const segments = splitEntryByLocalDay(entry, timezone);
    for (const segment of segments) {
      if (segment.date === today) {
        daily.set(entry.project, (daily.get(entry.project) || 0) + segment.minutes);
      }
      if (segment.date >= currentWeekStart && segment.date < addDays(currentWeekStart, 7)) {
        weekly.set(entry.project, (weekly.get(entry.project) || 0) + segment.minutes);
      }
    }
  }

  const projects = Array.from(new Set([...daily.keys(), ...weekly.keys()]))
    .map((project) => ({
      project,
      today_minutes: roundMinutes(daily.get(project) || 0),
      today_hours: roundHours(daily.get(project) || 0),
      week_minutes: roundMinutes(weekly.get(project) || 0),
      week_hours: roundHours(weekly.get(project) || 0),
    }))
    .sort((left, right) => right.week_minutes - left.week_minutes || left.project.localeCompare(right.project));

  const todayMinutes = sumMap(daily);
  const weekMinutes = sumMap(weekly);
  return {
    work_hours_today: roundHours(todayMinutes),
    work_hours_today_minutes: roundMinutes(todayMinutes),
    work_hours_this_week: roundHours(weekMinutes),
    work_hours_this_week_minutes: roundMinutes(weekMinutes),
    work_hours_timezone: timezone,
    work_hours_timezone_source: timezoneSource,
    work_hours_week_start: weekStart,
    work_hours_today_date: today,
    work_hours_week_start_date: currentWeekStart,
    work_hours_entry_count: Object.keys(state.entries || {}).length,
    work_hours_projects: projects,
    work_hours_last_updated: state.last_complete_at,
    work_hours_complete: Boolean(state.last_complete_at),
    work_hours_stale: Boolean(stale),
    work_hours_allocation_method: 'backfilled_from_created_at',
  };
}

function splitEntryByLocalDay(entry, timezone) {
  const end = normalizeDate(entry.source_created_at);
  const minutes = Number(entry.duration_minutes);
  if (!end || !Number.isFinite(minutes) || minutes <= 0) {
    return [];
  }

  const start = new Date(end.getTime() - minutes * 60 * 1000);
  const segments = [];
  let cursor = start;
  while (cursor < end) {
    const date = localDateKey(cursor, timezone);
    const nextDate = addDays(date, 1);
    const nextBoundary = localDateStart(nextDate, timezone);
    const segmentEnd = nextBoundary > cursor && nextBoundary < end ? nextBoundary : end;
    const segmentMinutes = (segmentEnd.getTime() - cursor.getTime()) / 60000;
    if (segmentMinutes > 0) {
      segments.push({ date, minutes: segmentMinutes });
    }
    if (segmentEnd >= end) {
      break;
    }
    cursor = segmentEnd;
  }
  return segments;
}

function loadWorkHoursObservations(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return clone(DEFAULT_STATE);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...clone(DEFAULT_STATE),
      ...parsed,
      entries: parsed && typeof parsed.entries === 'object' ? parsed.entries : {},
    };
  } catch {
    return clone(DEFAULT_STATE);
  }
}

function saveWorkHoursObservations(filePath, state) {
  if (!filePath) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function pruneExpiredEntries(state, now) {
  const cutoff = now.getTime() - RETENTION_DAYS * DAY_MS;
  for (const [key, entry] of Object.entries(state.entries || {})) {
    const createdAt = normalizeDate(entry?.source_created_at);
    if (createdAt && createdAt.getTime() < cutoff) {
      delete state.entries[key];
    }
  }
}

function localDateKey(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localDateStart(dateKey, timezone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  let instant = new Date(Date.UTC(year, month - 1, day));
  for (let index = 0; index < 3; index += 1) {
    const localParts = getLocalParts(instant, timezone);
    const localAsUtc = Date.UTC(localParts.year, localParts.month - 1, localParts.day, localParts.hour, localParts.minute, localParts.second);
    const targetAsUtc = Date.UTC(year, month - 1, day);
    instant = new Date(targetAsUtc - (localAsUtc - instant.getTime()));
  }
  return instant;
}

function getLocalParts(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return values;
}

function getWeekStartDate(dateKey, weekStart) {
  const startDay = WEEK_DAYS[normalizeWeekStart(weekStart)];
  const date = new Date(`${dateKey}T00:00:00Z`);
  const currentDay = date.getUTCDay();
  const offset = (currentDay - startDay + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function normalizeWeekStart(value) {
  const normalized = normalizeText(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(WEEK_DAYS, normalized) ? normalized : 'monday';
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sumMap(values) {
  return Array.from(values.values()).reduce((sum, value) => sum + value, 0);
}

function roundMinutes(value) {
  return Math.round(value * 100) / 100;
}

function roundHours(value) {
  return Math.round((value / 60) * 100) / 100;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const WEEK_DAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

module.exports = {
  buildWorkHoursSnapshot,
  getWeekStartDate,
  localDateKey,
  normalizeTimedWorkEntries,
  splitEntryByLocalDay,
};
