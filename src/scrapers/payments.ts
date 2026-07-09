// @ts-nocheck
const { formatPublicPayoutEntries, scrapeFundsHistory } = require('./funds_history.ts');

function extractPaymentsSnapshot({
  pageProps,
  earningsSummary,
  withdrawButton = null,
  buttonText,
  buttonDisabled,
  nextWithdrawalText,
  next_payout_days = 0,
  next_payout_at = null,
  next_payout_entries_count = 0,
  pending_payout_entries = [],
  scrapedAt = null,
  now = new Date(),
}) {
  const availableAmountCents = numberOrZero(pageProps?.paymentStatus?.amountInCents);
  const normalizedWithdrawButton = withdrawButton || normalizeWithdrawalButton(buttonText, buttonDisabled);
  const canWithdraw = Boolean(normalizedWithdrawButton.present && normalizedWithdrawButton.enabled && availableAmountCents > 0);
  const totalEarningsCents = numberOrZero(pageProps?.totalLifetimeEarnings);
  const pendingApprovalCents = numberOrZero(pageProps?.unapprovedAmount);
  const totalPaidOutCents = numberOrZero(earningsSummary?.totalPaidOut);
  const thisMonthCents = numberOrZero(earningsSummary?.currentMonthEarnings);
  const bestMonthSource = normalizeBestMonth(earningsSummary?.bestMonth);
  const nextPayoutEntries = buildNextPayoutEntries(pending_payout_entries);
  const nextPayoutEntry = nextPayoutEntries[0] || null;
  const nextWithdrawalAt = normalizeNextWithdrawalAt({
    nextEligibleAt: pageProps?.paymentStatus?.nextEligibleAt,
    nextWithdrawalText,
    lastPayoutAt: pageProps?.lastPayoutAt || earningsSummary?.lastPayoutAt || null,
    canWithdraw,
    availableAmountCents,
    nextPayoutAt: next_payout_at,
    nextPayoutDays: next_payout_days,
    now,
  });

  return {
    available_amount_cents: availableAmountCents,
    available_amount: centsToNumber(availableAmountCents),
    available_amount_formatted: formatCents(availableAmountCents),
    can_withdraw: canWithdraw,
    button_enabled: normalizedWithdrawButton.enabled,
    button_text: normalizedWithdrawButton.text,
    withdraw_button_present: normalizedWithdrawButton.present,
    withdraw_button_text: normalizedWithdrawButton.text,
    withdraw_button_count: normalizedWithdrawButton.count,
    withdraw_button_disabled: normalizedWithdrawButton.present ? normalizedWithdrawButton.disabled : null,
    next_withdrawal_at: nextWithdrawalAt,
    next_withdrawal_text: nextWithdrawalText || null,
    payment_status: pageProps?.paymentStatus?.type || null,
    total_earnings_cents: totalEarningsCents,
    total_earnings: centsToNumber(totalEarningsCents),
    total_earnings_formatted: formatCents(totalEarningsCents),
    total_paid_out_cents: totalPaidOutCents,
    total_paid_out: centsToNumber(totalPaidOutCents),
    total_paid_out_formatted: formatCents(totalPaidOutCents),
    this_month_cents: thisMonthCents,
    this_month: centsToNumber(thisMonthCents),
    this_month_formatted: formatCents(thisMonthCents),
    best_month_cents: bestMonthSource.cents,
    best_month: centsToNumber(bestMonthSource.cents),
    best_month_label: bestMonthSource.label,
    best_month_formatted: formatCents(bestMonthSource.cents),
    pending_approval_cents: pendingApprovalCents,
    pending_approval: centsToNumber(pendingApprovalCents),
    pending_approval_formatted: formatCents(pendingApprovalCents),
    last_payout_at: pageProps?.lastPayoutAt || earningsSummary?.lastPayoutAt || null,
    next_payout_days: numberOrZero(next_payout_days),
    next_payout_at: normalizeIsoDate(next_payout_at),
    next_payout_at_human: formatHumanTimestamp(next_payout_at),
    next_payout_entries_count: numberOrZero(next_payout_entries_count),
    pending_payout_entries: Array.isArray(pending_payout_entries) ? pending_payout_entries : [],
    pending_payout_entries_public: formatPublicPayoutEntries(pending_payout_entries),
    next_payout_entries: nextPayoutEntries,
    next_payout_entries_public: formatPublicPayoutEntries(nextPayoutEntries),
    next_payout_amount: nextPayoutEntry?.amount || null,
    next_payout_source: nextPayoutEntry?.source || null,
    next_payout_confidence: nextPayoutEntry?.confidence || null,
    scraped_at: normalizeIsoDate(scrapedAt) || null,
  };
}

function buildNextPayoutEntries(pendingEntries) {
  return (Array.isArray(pendingEntries) ? pendingEntries : [])
    .filter((entry) => entry && entry.status === 'pending')
    .sort((left, right) => String(left.estimated_payout_at || '').localeCompare(String(right.estimated_payout_at || '')));
}

function normalizeBestMonth(bestMonth) {
  if (!bestMonth) {
    return { cents: 0, label: null };
  }

  const cents = numberOrZero(bestMonth.withdrawnInCents) + numberOrZero(bestMonth.earnedInCents) + numberOrZero(bestMonth.pendingInCents);
  const label = formatMonthLabel(bestMonth.month);
  return { cents, label };
}

function formatButtonText(amountCents) {
  return `${formatCents(amountCents)} available`;
}

function normalizeWithdrawalButton(buttonText, buttonDisabled) {
  const text = normalizeText(buttonText);
  if (!text) {
    return {
      present: false,
      enabled: false,
      disabled: null,
      text: null,
      count: 0,
    };
  }

  if (!WITHDRAW_BUTTON_TEXT_PATTERN.test(text)) {
    return {
      present: false,
      enabled: false,
      disabled: null,
      text: null,
      count: 0,
    };
  }

  const disabled = Boolean(buttonDisabled);
  return {
    present: true,
    enabled: !disabled,
    disabled,
    text,
    count: 1,
  };
}

function formatCents(value) {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberOrZero(value) / 100)}`;
}

function formatMonthLabel(isoMonth) {
  if (!isoMonth) {
    return null;
  }

  const date = new Date(`${isoMonth}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return String(isoMonth);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatHumanTimestamp(value) {
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

function centsToNumber(value) {
  return numberOrZero(value) / 100;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNextWithdrawalAt({
  nextEligibleAt,
  nextWithdrawalText,
  lastPayoutAt,
  canWithdraw = false,
  availableAmountCents = 0,
  nextPayoutAt = null,
  nextPayoutDays = 0,
  now = new Date(),
}) {
  const direct = normalizeIsoDate(nextEligibleAt);
  if (direct) {
    return direct;
  }

  const parsed = parseNextWithdrawalText(nextWithdrawalText);
  if (parsed) {
    return parsed.toISOString();
  }

  const availableAmount = numberOrZero(availableAmountCents);
  const current = normalizeDate(now) || new Date();

  if (canWithdraw && availableAmount > 0) {
    return addMinutes(current, 5).toISOString();
  }

  if (availableAmount > 0) {
    const estimated = estimateNextWithdrawalAt(lastPayoutAt, current);
    return estimated || nextLocalMidnight(current, 3);
  }

  const payoutAt = normalizeIsoDate(nextPayoutAt);
  if (payoutAt) {
    return payoutAt;
  }

  if (numberOrZero(nextPayoutDays) > 0) {
    return nextLocalMidnight(current, nextPayoutDays);
  }

  return nextLocalMidnight(current, 3);
}

function estimateNextWithdrawalAt(lastPayoutAt, now = new Date()) {
  const lastPayout = normalizeDate(lastPayoutAt);
  if (!lastPayout) {
    return null;
  }

  const estimatedAt = new Date(lastPayout.getTime() + 3 * 24 * 60 * 60 * 1000);
  const current = normalizeDate(now);
  if (!current) {
    return estimatedAt.toISOString();
  }

  return estimatedAt < current ? current.toISOString() : estimatedAt.toISOString();
}

function addMinutes(value, minutes) {
  const date = normalizeDate(value);
  if (!date) {
    return null;
  }

  return new Date(date.getTime() + numberOrZero(minutes) * 60 * 1000);
}

function nextLocalMidnight(value, daysOffset) {
  const date = normalizeDate(value);
  if (!date) {
    return null;
  }

  const midnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + numberOrZero(daysOffset),
    0,
    0,
    0,
    0
  );

  if (midnight <= date) {
    midnight.setDate(midnight.getDate() + 1);
  }

  return midnight.toISOString();
}

function normalizeIsoDate(value) {
  const date = normalizeDate(value);
  if (!date) {
    return null;
  }

  return date.toISOString();
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNextWithdrawalText(text) {
  if (!text) {
    return null;
  }

  const match = String(text)
    .trim()
    .match(/^Next withdrawal:\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+GMT([+-]\d{1,2}(?::\d{2})?)$/i);

  if (!match) {
    return null;
  }

  const [, monthName, day, year, hour, minute, meridiem, gmtOffset] = match;
  const monthIndex = MONTH_NAMES.indexOf(monthName.toLowerCase());
  if (monthIndex === -1) {
    return null;
  }

  const hour12 = Number(hour);
  let hour24 = hour12 % 12;
  if (meridiem.toUpperCase() === 'PM') {
    hour24 += 12;
  }

  const offsetMinutes = parseGmtOffsetMinutes(gmtOffset);
  if (offsetMinutes === null) {
    return null;
  }

  const utcMillis = Date.UTC(Number(year), monthIndex, Number(day), hour24, Number(minute)) - offsetMinutes * 60 * 1000;
  return new Date(utcMillis);
}

function parseGmtOffsetMinutes(value) {
  const match = String(value).match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const [, sign, hoursRaw, minutesRaw] = match;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw || '0');
  const total = hours * 60 + minutes;
  return sign === '-' ? -total : total;
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const WITHDRAW_BUTTON_TEXT_PATTERN = /^\$[\d,]+(?:\.\d{2})?\s+available$/i;

async function scrapePayments(page, { includeFundsHistory = true, fundsHistoryObservationsPath = null, now = new Date() } = {}) {
  const rawProps = await page.$eval(
    'div[id="workers/TransferFundsPage-hybrid-root"]',
    (element) => element.getAttribute('data-props') || '{}'
  );

  const pageProps = JSON.parse(rawProps);
  await page.evaluate("globalThis.__name = globalThis.__name || ((value) => value)").catch(() => {});
  const earningsSummary = await page.evaluate(async () => {
    const response = await fetch('/api_internal/payments/earnings_summary', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`earnings_summary request failed with ${response.status}`);
    }
    return await response.json();
  });

  await page.waitForFunction(() => {
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    return Array.from(document.querySelectorAll('button')).some((node) => {
      const text = normalize(node.innerText || node.textContent || '');
      const action = normalize(node.form?.getAttribute('action') || '');
      const method = normalize(node.form?.getAttribute('method') || '');
      return (
        /^Get paid \$[\d,]+(?:\.\d{2})?$/i.test(text) &&
        /\/workers\/payments\/get_paid(?:\?|$)/.test(action) &&
        method.toLowerCase() === 'post'
      ) || /^\$[\d,]+(?:\.\d{2})?\s+available$/i.test(text);
    });
  }, { timeout: 10000 }).catch(() => {});

  const buttonInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const mapButton = (node) => ({
      text: (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' '),
      disabled: Boolean(node.disabled),
      ariaDisabled: (node.getAttribute('aria-disabled') || '').trim().replace(/\s+/g, ' '),
      ariaLabel: (node.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '),
      title: (node.getAttribute('title') || '').trim().replace(/\s+/g, ' '),
      formAction: (node.form?.getAttribute('action') || '').trim().replace(/\s+/g, ' '),
      formMethod: (node.form?.getAttribute('method') || '').trim().replace(/\s+/g, ' '),
    });
    const bodyText = (document.body?.innerText || document.body?.textContent || '').replace(/\s+/g, ' ').trim();
    const nextWithdrawalMatch = bodyText.match(/Next withdrawal:\s+[^$]+?(?:GMT[+-]\d{1,2}(?::\d{2})?)?/i);
    return {
      buttons: buttons.map(mapButton),
      nextWithdrawalText: nextWithdrawalMatch ? nextWithdrawalMatch[0].trim().replace(/\s+/g, ' ') : '',
    };
  });

  const availableAmountCents = numberOrZero(pageProps?.paymentStatus?.amountInCents);
  let withdrawButton = chooseWithdrawalButton(buttonInfo.buttons, availableAmountCents);
  if (!withdrawButton.present && availableAmountCents > 0) {
    withdrawButton = await page.evaluate((amountInCents) => {
      const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
      const exactAmount = `$${(Number(amountInCents) / 100).toFixed(2)}`;
      const candidates = Array.from(document.querySelectorAll('button')).map((node) => ({
        text: normalize(node.innerText || node.textContent || ''),
        disabled: Boolean(node.disabled),
        ariaDisabled: normalize(node.getAttribute('aria-disabled') || ''),
        formAction: normalize(node.form?.getAttribute('action') || ''),
        formMethod: normalize(node.form?.getAttribute('method') || ''),
      })).filter((button) => {
        if (!button.text || button.disabled || button.ariaDisabled === 'true') {
          return false;
        }

        if (button.text === `${exactAmount} available`) {
          return true;
        }

        return button.text === `Get paid ${exactAmount}`
          && button.formMethod.toLowerCase() === 'post'
          && /\/workers\/payments\/get_paid(?:\?|$)/.test(button.formAction);
      });

      if (candidates.length !== 1) {
        return {
          present: candidates.length > 0,
          enabled: false,
          disabled: null,
          text: null,
          count: candidates.length,
        };
      }

      const button = candidates[0];
      return {
        present: true,
        enabled: !button.disabled,
        disabled: button.disabled,
        text: button.text,
        count: 1,
      };
    }, availableAmountCents);
  }
  const fundsHistory = includeFundsHistory ? await scrapeFundsHistory(page, { observationsPath: fundsHistoryObservationsPath, now }) : {
    next_payout_days: 0,
    next_payout_entries_count: 0,
    pending_payout_entries: [],
  };
  const scrapedAt = new Date().toISOString();

  return extractPaymentsSnapshot({
    pageProps,
    earningsSummary,
    withdrawButton,
    buttonText: withdrawButton.text,
    buttonDisabled: withdrawButton.disabled,
    nextWithdrawalText: buttonInfo.nextWithdrawalText,
    scrapedAt,
    ...fundsHistory,
  });
}

function chooseWithdrawalButton(buttons, availableAmountCents = null) {
  const candidates = Array.isArray(buttons)
    ? buttons
        .map(normalizeButtonCandidate)
        .filter((button) => isWithdrawalCandidate(button, availableAmountCents))
    : [];

  if (candidates.length !== 1) {
    return {
      present: candidates.length > 0,
      enabled: false,
      disabled: null,
      text: null,
      count: candidates.length,
    };
  }

  const button = candidates[0];
  return {
    present: true,
    enabled: !button.disabled,
    disabled: button.disabled,
    text: button.text,
    count: 1,
  };
}

function normalizeButtonCandidate(button) {
  if (!button) {
    return null;
  }

  const text = normalizeText(button.text || button.ariaLabel || button.title);
  return {
    text,
    disabled: Boolean(button.disabled),
    ariaDisabled: normalizeText(button.ariaDisabled || ''),
    formAction: normalizeText(button.formAction || ''),
    formMethod: normalizeText(button.formMethod || ''),
  };
}

function isWithdrawalCandidate(button, availableAmountCents = null) {
  if (!button || !button.text) {
    return false;
  }

  if (button.disabled || button.ariaDisabled === 'true') {
    return false;
  }

  const exactAmount = availableAmountCents === null ? null : formatCents(availableAmountCents);
  const matchesLegacyText = WITHDRAW_BUTTON_TEXT_PATTERN.test(button.text) && (exactAmount === null || button.text === `${exactAmount} available`);
  if (matchesLegacyText) {
    return true;
  }

  const matchesCurrentText = WITHDRAW_BUTTON_SUBMIT_PATTERN.test(button.text) && (exactAmount === null || button.text === `Get paid ${exactAmount}`);
  const matchesForm = button.formMethod.toLowerCase() === 'post' && /\/workers\/payments\/get_paid(?:\?|$)/.test(button.formAction);

  return matchesForm && matchesCurrentText;
}

const WITHDRAW_BUTTON_SUBMIT_PATTERN = /^Get paid \$[\d,]+(?:\.\d{2})?$/i;

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

module.exports = {
  extractPaymentsSnapshot,
  scrapePayments,
  chooseWithdrawalButton,
  formatMonthLabel,
  formatCents,
  estimateNextWithdrawalAt,
  normalizeNextWithdrawalAt,
  parseNextWithdrawalText,
};
