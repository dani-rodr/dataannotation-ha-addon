const MONTH_SUMMARY_PATTERN = /^[A-Z][a-z]{2}\s+\d{1,2}(?:\s+\$[\d,]+(?:\.\d{2})?)?$/;
const DETAIL_STATUS_PATTERN = /\b(Pending Approval|Paid)\s*·\s*(\d+)\s+day(?:s)?\s+ago\b/i;
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

async function scrapeFundsHistory(page) {
  await openFundsHistoryTab(page);
  await expandFundsHistoryRows(page);

  const rows = await page.$$eval('tr', (tableRows) => {
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    return tableRows
      .map((row) => normalize(row.innerText || row.textContent || ''))
      .filter(Boolean);
  });

  return summarizeFundsHistoryEntries(parseFundsHistoryEntries(rows));
}

function parseFundsHistoryEntries(rows, now = new Date()) {
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

    const entry = parseFundsHistoryDetailRow(text, currentProject, currentMonthDate);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function summarizeFundsHistoryEntries(entries, now = new Date()) {
  const pendingEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry.status === 'pending')
    : [];

  const nextPayoutDays = pendingEntries.length > 0
    ? Math.min(...pendingEntries.map((entry) => entry.days_until_available))
    : 0;
  const nextPayoutAt = pendingEntries.length > 0
    ? pendingEntries
        .map((entry) => computeNextPayoutAt(entry, now))
        .filter(Boolean)
        .sort()[0] || null
    : null;

  return {
    next_payout_days: nextPayoutDays,
    next_payout_at: nextPayoutAt,
    next_payout_entries_count: pendingEntries.length,
    pending_payout_entries: pendingEntries,
  };
}

function parseFundsHistoryDetailRow(text, project, entryDate = null) {
  const kindMatch = text.match(DETAIL_KIND_PATTERN);
  const statusMatch = text.match(DETAIL_STATUS_PATTERN);

  if (!kindMatch || !statusMatch) {
    return null;
  }

  const kind = kindMatch[1].toLowerCase() === 'time entry' ? 'hourly' : 'task';
  const status = statusMatch[1].toLowerCase() === 'pending approval' ? 'pending' : 'paid';
  if (status !== 'pending') {
    return null;
  }

  const daysAgo = Number(statusMatch[2]);
  const dueDays = kind === 'hourly' ? 7 : 3;

  return {
    project: project || null,
    kind,
    status,
    days_ago: Number.isFinite(daysAgo) ? daysAgo : 0,
    days_until_available: Math.max(0, dueDays - (Number.isFinite(daysAgo) ? daysAgo : 0)),
    entry_date: normalizeDate(entryDate) ? normalizeDate(entryDate).toISOString() : null,
    due_days: dueDays,
  };
}

function isProjectSummaryRow(text) {
  return /^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text)
    && !MONTH_SUMMARY_PATTERN.test(text)
    && !DETAIL_KIND_PATTERN.test(text)
    && !/\b(Paid|Pending Approval)\b/i.test(text);
}

function extractProjectName(text) {
  return text.replace(/\s+\$[\d,]+(?:\.\d{2})?$/, '').trim();
}

function parseMonthSummaryDate(text, now = new Date()) {
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

function inferYearForMonth(monthIndex, now) {
  let year = now.getFullYear();
  if (monthIndex > now.getMonth() + 1) {
    year -= 1;
  }

  return year;
}

function computeNextPayoutAt(entry, now = new Date()) {
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

function toLocalMidnightAtOffset(now, daysOffset) {
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

async function openFundsHistoryTab(page) {
  await page.evaluate(() => {
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    const target = Array.from(document.querySelectorAll('button,[role="tab"]')).find((element) => {
      const text = normalize(element.innerText || element.textContent || '');
      const aria = normalize(element.getAttribute('aria-label') || '');
      const title = normalize(element.getAttribute('title') || '');
      return /Funds History/i.test(text) || /Funds History/i.test(aria) || /Funds History/i.test(title);
    });

    if (target) {
      target.click();
    }
  });

  await page.waitForFunction(() => {
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    return Array.from(document.querySelectorAll('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer')).some((element) => {
      const text = normalize(element.innerText || element.textContent || '');
      return /^[A-Z][a-z]{2}\s+\d{1,2}$/.test(text);
    });
  }, { timeout: 30000 }).catch(() => {});

  await sleep(250);
}

async function expandFundsHistoryRows(page) {
  await clickFundsHistoryRows(page, 'month');
  await page.waitForFunction(() => {
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    return Array.from(document.querySelectorAll('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer')).some((element) => {
      const text = normalize(element.innerText || element.textContent || '');
      return /^(Time Entry|Task Submission)/i.test(text) || (/^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text) && !/^[A-Z][a-z]{2}\s+\d{1,2}$/.test(text));
    });
  }, { timeout: 30000 }).catch(() => {});

  await sleep(250);
  await clickFundsHistoryRows(page, 'project');
  await page.waitForFunction(() => {
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    return Array.from(document.querySelectorAll('tr')).some((row) => {
      const text = normalize(row.innerText || row.textContent || '');
      return /Pending Approval/i.test(text) || /Paid/i.test(text);
    });
  }, { timeout: 30000 }).catch(() => {});

  await sleep(250);
}

async function clickFundsHistoryRows(page, kind) {
  return page.evaluate((rowKind) => {
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    const isMonth = (text) => /^[A-Z][a-z]{2}\s+\d{1,2}\s+\$[\d,]+(?:\.\d{2})?$/.test(text);
    const isDetail = (text) => /^(Time Entry|Task Submission|Paid|Pending Approval)/i.test(text);
    const isProject = (text) => /^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text) && !isMonth(text) && !isDetail(text);
    const predicate = rowKind === 'month' ? isMonth : isProject;
    let count = 0;

    for (const row of Array.from(document.querySelectorAll('tr'))) {
      const text = normalize(row.innerText || row.textContent || '');
      const target = row.querySelector('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer');
      if (text && target && predicate(text)) {
        target.click();
        count += 1;
      }
    }

    return count;
  }, kind);
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  scrapeFundsHistory,
  parseFundsHistoryEntries,
  summarizeFundsHistoryEntries,
  parseFundsHistoryDetailRow,
  isProjectSummaryRow,
  extractProjectName,
};
