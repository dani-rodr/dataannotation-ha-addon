const MONTH_SUMMARY_PATTERN = /^[A-Z][a-z]{2}\s+\d{1,2}(?:\s+\$[\d,]+(?:\.\d{2})?)?$/;
const DAY_MS = 24 * 60 * 60 * 1000;
// @ts-nocheck
const {
  applyFundsHistoryObservations,
  loadFundsHistoryObservations,
  saveFundsHistoryObservations,
} = require('../state/funds_history_observations.ts');

const DETAIL_ROW_PATTERN = /^(Time Entry|Task Submission)\s+(?:·{1,3}\s+)?(\$[\d,]+(?:\.\d{2})?)(?:\s+(.*?))?\s+(Pending Approval|Paid)\s+·\s+(\d+)\s+(minute|hour|day|week)s?\s+ago$/i;
const DETAIL_KIND_PATTERN = /\b(Time Entry|Task Submission)\b/i;
const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

async function scrapeFundsHistory(page: any, { observationsPath = null, now = new Date(), apiEntries = null }: any = {}) {
  const historyTabReady = await openFundsHistoryTab(page);
  const historyRowsReady = await expandFundsHistoryRows(page);

  const rows = await page.$$eval('tr', (tableRows: any[]) => {
    const normalize = (value: any) => String(value || '').trim().replace(/\s+/g, ' ');
    return tableRows
      .map((row: any) => normalize((row as any).innerText || (row as any).textContent || ''))
      .filter(Boolean);
  });

  const parsedEntries = parseFundsHistoryEntries(rows, now);
  const observations = loadFundsHistoryObservations(observationsPath);
  const selectedEntries = selectFundsHistoryEntries(parsedEntries, apiEntries, observations, now);
  const merged = applyFundsHistoryObservations(selectedEntries.entries, selectedEntries.observations, now);

  if (observationsPath) {
    try {
      saveFundsHistoryObservations(observationsPath, merged.observations);
    } catch {
      // Keep the live scrape working even if the persistence layer is unavailable.
    }
  }

  return {
    ...summarizeFundsHistoryEntries(merged.entries, now),
    funds_history_complete: historyTabReady && historyRowsReady && parsedEntries.length > 0,
  };
}

function parseFundsHistoryEntries(rows: any, now = new Date()) {
  const entries = [];
  let currentProject = null;
  let currentMonthDate = null;

  for (const rowText of Array.isArray(rows) ? rows : []) {
    const text = normalizeText(rowText);
    if (!text) {
      continue;
    }

    if (MONTH_SUMMARY_PATTERN.test(text)) {
      currentMonthDate = parseMonthSummaryDate(text, now);
      currentProject = null;
      continue;
    }

    if (isProjectSummaryRow(text)) {
      currentProject = extractProjectName(text);
      continue;
    }

    const entry = parseFundsHistoryDetailRow(text, currentProject, currentMonthDate, now);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function summarizeFundsHistoryEntries(entries: any, now = new Date()) {
  const pendingEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry.status === 'pending')
    : [];
  const paidEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry.status === 'paid')
    : [];
  const lastPayoutSummary = summarizeLastPayoutEntries(paidEntries);

  const nextPayoutDays = pendingEntries.length > 0
    ? Math.min(...pendingEntries.map((entry) => entry.days_until_available))
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

function selectFundsHistoryEntries(parsedEntries: any[], apiEntries: any, observations: any, now = new Date()) {
  const normalizedApiEntries = normalizeApiPayoutEntries(apiEntries, now);
  const nextObservations = observations && typeof observations === 'object'
    ? { ...observations, entries: { ...(observations.entries || {}) } }
    : { version: 2, entries: {}, api_cutover_at: null, updated_at: null };

  if (apiEntries === null || apiEntries === undefined) {
    return { entries: parsedEntries, observations: nextObservations };
  }

  if (!normalizeDate(nextObservations.api_cutover_at)) {
    // Keep the first API sync on the existing page estimates; only later entries switch sources.
    nextObservations.api_cutover_at = normalizeIsoDate(now);
    return { entries: parsedEntries, observations: nextObservations };
  }

  const cutoff = normalizeDate(nextObservations.api_cutover_at);
  const futureEntries = normalizedApiEntries.filter((entry: any) => {
    const createdAt = normalizeDate(entry.source_created_at);
    return createdAt && cutoff && createdAt >= cutoff;
  });

  if (futureEntries.length === 0) {
    return { entries: parsedEntries, observations: nextObservations };
  }

  const usedPageIndexes = new Set<number>();
  for (const apiEntry of futureEntries) {
    const pageIndex = findMatchingPageEntry(parsedEntries, apiEntry, usedPageIndexes);
    if (pageIndex !== null) {
      usedPageIndexes.add(pageIndex);
    }
  }

  return {
    entries: parsedEntries.filter((_, index) => !usedPageIndexes.has(index)).concat(futureEntries),
    observations: nextObservations,
  };
}

function normalizeApiPayoutEntries(value: any, now = new Date()) {
  const workLogs = Array.isArray(value?.workLogs) ? value.workLogs : [];
  const timedWorkEntries = Array.isArray(value?.timedWorkEntries) ? value.timedWorkEntries : [];
  return workLogs.concat(timedWorkEntries)
    .map((entry: any) => normalizeApiPayoutEntry(entry, now))
    .filter(Boolean);
}

function normalizeApiPayoutEntry(entry: any, now = new Date()) {
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

function findMatchingPageEntry(entries: any[], apiEntry: any, usedIndexes: Set<number>) {
  const candidates = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => !usedIndexes.has(index)
      && entry?.status === apiEntry.status
      && payoutEntryMatchKey(entry) === payoutEntryMatchKey(apiEntry));

  if (candidates.length === 0) {
    return null;
  }

  const apiWorkAt = normalizeDate(apiEntry.estimated_work_at)?.getTime() || 0;
  candidates.sort((left, right) => {
    const leftWorkAt = normalizeDate(left.entry?.estimated_work_at)?.getTime() || 0;
    const rightWorkAt = normalizeDate(right.entry?.estimated_work_at)?.getTime() || 0;
    return Math.abs(leftWorkAt - apiWorkAt) - Math.abs(rightWorkAt - apiWorkAt) || left.index - right.index;
  });
  return candidates[0].index;
}

function payoutEntryMatchKey(entry: any) {
  return [
    normalizeText(entry?.project),
    normalizeText(entry?.kind),
    String(numberOrZero(entry?.amount_cents)),
    normalizeText(entry?.duration),
  ].join('|');
}

function getRelativeAge(createdAt: Date, now: Date) {
  const ageMs = Math.max(0, (normalizeDate(now) || new Date()).getTime() - createdAt.getTime());
  const units: [string, number][] = [
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

function formatDuration(value: any) {
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

function formatPublicPayoutEntries(entries: any) {
  return sortPayoutEntries(entries).map((entry) => formatPublicPayoutEntry(entry));
}

function formatPublicPayoutEntry(entry: any) {
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

function parseFundsHistoryDetailRow(text: string, project: string | null, entryDate: string | Date | null = null, now = new Date()) {
  const match = text.match(DETAIL_ROW_PATTERN);

  if (!match) {
    return null;
  }

  const [, kindLabel, amount, durationText, statusLabel, relativeAgeValue, relativeAgeUnit] = match;
  const kind = kindLabel.toLowerCase() === 'time entry' ? 'hourly' : 'task';
  const status = statusLabel.toLowerCase() === 'pending approval' ? 'pending' : 'paid';
  const normalizedAgeValue = Number(relativeAgeValue);
  const normalizedAgeUnit = relativeAgeUnit.toLowerCase();
  const dueDays = kind === 'hourly' ? 7 : 3;
  const ageDays = normalizedAgeUnit === 'minute'
    ? normalizedAgeValue / (24 * 60)
    : normalizedAgeUnit === 'hour'
      ? normalizedAgeValue / 24
      : normalizedAgeUnit === 'week'
        ? normalizedAgeValue * 7
        : normalizedAgeValue;
  const normalizedEntryDate = normalizeDate(entryDate);
  const entryDateValue = normalizedEntryDate ? normalizedEntryDate.toISOString() : null;
  const isPreciseEstimate = (normalizedAgeUnit === 'minute' || normalizedAgeUnit === 'hour') && Number.isFinite(normalizedAgeValue) && normalizedAgeValue > 0;
  const estimatedWorkAt = isPreciseEstimate
    ? estimateWorkAt(now, normalizedAgeValue, normalizedAgeUnit, entryDateValue)
    : entryDateValue || normalizeDate(now)?.toISOString() || new Date().toISOString();
  const estimatedPayoutAt = isPreciseEstimate
    ? estimatePayoutAt(estimatedWorkAt, dueDays, now)
    : estimatePayoutAtFromEntryDate(entryDateValue, dueDays, now) || toLocalMidnightAtOffset(now, dueDays);

  return {
    project: project || null,
    kind,
    status,
    amount,
    amount_cents: amountToCents(amount),
    duration: durationText ? durationText.trim() : null,
    relative_age_value: Number.isFinite(normalizedAgeValue) ? normalizedAgeValue : 0,
    relative_age_unit: normalizedAgeUnit,
    relative_age_text: `${Number.isFinite(normalizedAgeValue) ? normalizedAgeValue : 0} ${normalizedAgeUnit}${Number.isFinite(normalizedAgeValue) && normalizedAgeValue === 1 ? '' : 's'} ago`,
    days_ago: Math.ceil(ageDays),
    days_until_available: Math.max(0, Math.ceil(dueDays - ageDays)),
    entry_date: entryDateValue,
    due_days: dueDays,
    estimated_work_at: estimatedWorkAt,
    estimated_payout_at: estimatedPayoutAt,
    estimate_source: normalizedAgeUnit === 'minute'
      ? 'observed_minutes'
      : normalizedAgeUnit === 'hour'
        ? 'observed_hours'
        : 'row_date_fallback',
    estimate_confidence: isPreciseEstimate ? 'high' : 'low',
  };
}

function isProjectSummaryRow(text: string) {
  return /^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text)
    && !MONTH_SUMMARY_PATTERN.test(text)
    && !DETAIL_KIND_PATTERN.test(text)
    && !/\b(Paid|Pending Approval)\b/i.test(text);
}

function extractProjectName(text: string) {
  return text.replace(/\s+\$[\d,]+(?:\.\d{2})?$/, '').trim();
}

function parseMonthSummaryDate(text: string, now = new Date()) {
  const match = String(text).trim().match(/^([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (!match) {
    return null;
  }

  const monthIndex = MONTH_NAMES.indexOf(match[1].toLowerCase());
  if (monthIndex === -1) {
    return null;
  }

  const current = normalizeDate(now) || new Date();
  const year = inferYearForMonth(monthIndex, current);
  return new Date(year, monthIndex, Number(match[2]), 0, 0, 0, 0);
}

function sortPayoutEntries(entries: any) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftValue = String(left.entry?.estimated_payout_at || '');
      const rightValue = String(right.entry?.estimated_payout_at || '');

      if (!leftValue && !rightValue) {
        return left.index - right.index;
      }

      if (!leftValue) {
        return 1;
      }

      if (!rightValue) {
        return -1;
      }

      if (leftValue === rightValue) {
        return left.index - right.index;
      }

      return leftValue.localeCompare(rightValue);
    })
    .map((item) => item.entry);
}

function summarizeLastPayoutEntries(entries: any) {
  const grouped = new Map<number, number>();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = normalizePayoutGroupKey(entry);
    if (key === null) {
      continue;
    }

    const cents = Number.isFinite(Number(entry?.amount_cents))
      ? Number(entry?.amount_cents)
      : amountToCents(entry?.amount);
    grouped.set(key, (grouped.get(key) || 0) + cents);
  }

  if (grouped.size === 0) {
    return {
      amount_cents: null,
      amount: null,
      amount_formatted: null,
    };
  }

  const latestKey = Math.max(...grouped.keys());
  const amountCents = grouped.get(latestKey) || 0;
  return {
    amount_cents: amountCents,
    amount: centsToNumber(amountCents),
    amount_formatted: formatCents(amountCents),
  };
}

function normalizePayoutGroupKey(entry: any) {
  const entryDate = normalizeDate(entry?.entry_date) || normalizeDate(entry?.estimated_payout_at);
  return entryDate ? entryDate.getTime() : null;
}

function centsToNumber(value: any) {
  return numberOrZero(value) / 100;
}

function formatCents(value: any) {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberOrZero(value) / 100)}`;
}

function inferYearForMonth(monthIndex: number, now: Date) {
  let year = now.getFullYear();
  if (monthIndex > now.getMonth() + 1) {
    year -= 1;
  }

  return year;
}

function computeNextPayoutAt(entry: any, now = new Date()) {
  if (!entry || entry.status !== 'pending') {
    return null;
  }

  const entryDate = normalizeDate(entry.entry_date);
  if (entryDate && Number.isFinite(Number(entry.due_days))) {
    const payoutDate = new Date(
      entryDate.getFullYear(),
      entryDate.getMonth(),
      entryDate.getDate() + numberOrZero(entry.due_days) + 1,
      0,
      0,
      0,
      0
    );

    const current = normalizeDate(now) || new Date();
    if (payoutDate <= current) {
      payoutDate.setDate(payoutDate.getDate() + 1);
    }

    return payoutDate.toISOString();
  }

  if (Number.isFinite(Number(entry.days_until_available))) {
    return toLocalMidnightAtOffset(now, numberOrZero(entry.days_until_available) + 1);
  }

  return null;
}

function estimateWorkAt(now: Date, ageValue: number, ageUnit: string, fallbackEntryDate: string | null) {
  const current = normalizeDate(now) || new Date();
  if (Number.isFinite(ageValue) && ageValue > 0) {
    const ms = ageValue * relativeAgeUnitToMs(ageUnit);
    return new Date(current.getTime() - ms).toISOString();
  }

  return fallbackEntryDate || current.toISOString();
}

function estimatePayoutAtFromEntryDate(entryDate: string | Date | null, dueDays: number, now = new Date()) {
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

  return payoutDate.toISOString();
}

function estimatePayoutAt(estimatedWorkAt: string | Date | null, dueDays: number, now = new Date()) {
  const workAt = normalizeDate(estimatedWorkAt);
  if (!workAt) {
    return null;
  }

  const payoutAt = new Date(workAt.getTime() + numberOrZero(dueDays) * 24 * 60 * 60 * 1000);
  const current = normalizeDate(now) || new Date();
  if (payoutAt <= current) {
    return toLocalMidnightAtOffset(current, 1);
  }

  return payoutAt.toISOString();
}

function relativeAgeUnitToMs(unit: string) {
  switch (String(unit || '').toLowerCase()) {
    case 'minute':
      return 60 * 1000;
    case 'hour':
      return 60 * 60 * 1000;
    case 'week':
      return 7 * 24 * 60 * 60 * 1000;
    case 'day':
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function amountToCents(value: string) {
  const match = String(value || '').match(/^\$([\d,]+)(?:\.(\d{2}))?$/);
  if (!match) {
    return 0;
  }

  const [, dollarsRaw, centsRaw = '00'] = match;
  return Number(dollarsRaw.replace(/,/g, '')) * 100 + Number(centsRaw);
}

function toLocalMidnightAtOffset(now: Date, daysOffset: number) {
  const date = normalizeDate(now) || new Date();
  const localMidnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + numberOrZero(daysOffset),
    0,
    0,
    0,
    0
  );

  if (localMidnight <= date) {
    localMidnight.setDate(localMidnight.getDate() + 1);
  }

  return localMidnight.toISOString();
}

async function openFundsHistoryTab(page: any) {
  const tabFound = await page.evaluate(() => {
    const normalize = (value: any) => String(value || '').trim().replace(/\s+/g, ' ');
    const target = Array.from(document.querySelectorAll('button,[role="tab"]')).find((element) => {
      const node = element as any;
      const text = normalize(node.innerText || node.textContent || '');
      const aria = normalize(element.getAttribute('aria-label') || '');
      const title = normalize(element.getAttribute('title') || '');
      return /Funds History/i.test(text) || /Funds History/i.test(aria) || /Funds History/i.test(title);
    });

    if (target) {
      (target as any).click();
    }

    return Boolean(target);
  });

  if (!tabFound) {
    return false;
  }

  const historyLoaded = await page.waitForFunction(() => {
    const normalize = (value: any) => String(value || '').trim().replace(/\s+/g, ' ');
    return Array.from(document.querySelectorAll('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer')).some((element) => {
      const node = element as any;
      const text = normalize(node.innerText || node.textContent || '');
      return /^[A-Z][a-z]{2}\s+\d{1,2}$/.test(text);
    });
  }, { timeout: 30000 }).then(() => true).catch(() => false);

  await sleep(250);
  return historyLoaded;
}

async function expandFundsHistoryRows(page: any) {
  const monthRowCount = await clickFundsHistoryRows(page, 'month');
  const monthRowsExpanded = await page.waitForFunction(() => {
    const normalize = (value: any) => String(value || '').trim().replace(/\s+/g, ' ');
    return Array.from(document.querySelectorAll('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer')).some((element) => {
      const node = element as any;
      const text = normalize(node.innerText || node.textContent || '');
      return /^(Time Entry|Task Submission)/i.test(text) || (/^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text) && !/^[A-Z][a-z]{2}\s+\d{1,2}$/.test(text));
    });
  }, { timeout: 30000 }).then(() => true).catch(() => false);

  await sleep(250);
  const projectRowCount = await clickFundsHistoryRows(page, 'project');
  const projectRowsExpanded = await page.waitForFunction(() => {
    const normalize = (value: any) => String(value || '').trim().replace(/\s+/g, ' ');
    return Array.from(document.querySelectorAll('tr')).some((row) => {
      const node = row as any;
      const text = normalize(node.innerText || node.textContent || '');
      return /Pending Approval/i.test(text) || /Paid/i.test(text);
    });
  }, { timeout: 30000 }).then(() => true).catch(() => false);

  await sleep(250);
  return monthRowCount > 0 && monthRowsExpanded && projectRowCount > 0 && projectRowsExpanded;
}

async function clickFundsHistoryRows(page: any, kind: 'month' | 'project') {
  return page.evaluate((rowKind: 'month' | 'project') => {
    const normalize = (value: any) => String(value || '').trim().replace(/\s+/g, ' ');
    const isMonth = (text: string) => /^[A-Z][a-z]{2}\s+\d{1,2}\s+\$[\d,]+(?:\.\d{2})?$/.test(text);
    const isDetail = (text: string) => /^(Time Entry|Task Submission|Paid|Pending Approval)/i.test(text);
    const isProject = (text: string) => /^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text) && !isMonth(text) && !isDetail(text);
    const predicate = rowKind === 'month' ? isMonth : isProject;
    let count = 0;

    for (const row of Array.from(document.querySelectorAll('tr'))) {
      const node = row as any;
      const text = normalize(node.innerText || node.textContent || '');
      const target = node.querySelector('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer') as any;
      if (text && target && predicate(text)) {
        target.click();
        count += 1;
      }
    }

    return count;
  }, kind);
}

function normalizeText(value: any) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDate(value: any) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHumanTimestamp(value: any) {
  const date = normalizeDate(value);
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function normalizeIsoDate(value: any) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function numberOrZero(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  scrapeFundsHistory,
  parseFundsHistoryEntries,
  summarizeFundsHistoryEntries,
  parseFundsHistoryDetailRow,
  formatPublicPayoutEntries,
  normalizeApiPayoutEntries,
  selectFundsHistoryEntries,
  isProjectSummaryRow,
  extractProjectName,
};
