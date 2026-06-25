function extractPaymentsSnapshot({ pageProps, earningsSummary, buttonText, buttonDisabled, nextWithdrawalText, now = new Date() }) {
  const availableAmountCents = numberOrZero(pageProps?.paymentStatus?.amountInCents);
  const canWithdraw = Boolean(!buttonDisabled && availableAmountCents > 0);
  const totalEarningsCents = numberOrZero(pageProps?.totalLifetimeEarnings);
  const pendingApprovalCents = numberOrZero(pageProps?.unapprovedAmount);
  const totalPaidOutCents = numberOrZero(earningsSummary?.totalPaidOut);
  const thisMonthCents = numberOrZero(earningsSummary?.currentMonthEarnings);
  const bestMonthSource = normalizeBestMonth(earningsSummary?.bestMonth);
  const nextWithdrawalAt = normalizeNextWithdrawalAt({
    nextEligibleAt: pageProps?.paymentStatus?.nextEligibleAt,
    nextWithdrawalText,
    lastPayoutAt: pageProps?.lastPayoutAt || earningsSummary?.lastPayoutAt || null,
    now,
  });

  return {
    available_amount_cents: availableAmountCents,
    available_amount: centsToNumber(availableAmountCents),
    available_amount_formatted: formatCents(availableAmountCents),
    can_withdraw: canWithdraw,
    button_enabled: !buttonDisabled,
    button_text: buttonText || formatButtonText(availableAmountCents),
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
  };
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

function formatCents(value) {
  return `$${(numberOrZero(value) / 100).toFixed(2)}`;
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

function centsToNumber(value) {
  return numberOrZero(value) / 100;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNextWithdrawalAt({ nextEligibleAt, nextWithdrawalText, lastPayoutAt, now = new Date() }) {
  const direct = normalizeIsoDate(nextEligibleAt);
  if (direct) {
    return direct;
  }

  const parsed = parseNextWithdrawalText(nextWithdrawalText);
  if (parsed) {
    return parsed.toISOString();
  }

  return estimateNextWithdrawalAt(lastPayoutAt, now);
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

async function scrapePayments(page) {
  const rawProps = await page.$eval(
    'div[id="workers/TransferFundsPage-hybrid-root"]',
    (element) => element.getAttribute('data-props') || '{}'
  );

  const pageProps = JSON.parse(rawProps);
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

  const buttonInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const button = buttons.find((node) => /available$/i.test((node.innerText || node.textContent || '').trim()));
    const bodyText = (document.body?.innerText || document.body?.textContent || '').replace(/\s+/g, ' ').trim();
    const nextWithdrawalMatch = bodyText.match(/Next withdrawal:\s+[^$]+?(?:GMT[+-]\d{1,2}(?::\d{2})?)?/i);
    return {
      buttonText: button ? (button.innerText || button.textContent || '').trim().replace(/\s+/g, ' ') : '',
      buttonDisabled: button ? Boolean(button.disabled) : false,
      nextWithdrawalText: nextWithdrawalMatch ? nextWithdrawalMatch[0].trim().replace(/\s+/g, ' ') : '',
    };
  });

  return extractPaymentsSnapshot({
    pageProps,
    earningsSummary,
    buttonText: buttonInfo.buttonText,
    buttonDisabled: buttonInfo.buttonDisabled,
    nextWithdrawalText: buttonInfo.nextWithdrawalText,
  });
}

module.exports = {
  extractPaymentsSnapshot,
  scrapePayments,
  formatMonthLabel,
  formatCents,
  estimateNextWithdrawalAt,
  normalizeNextWithdrawalAt,
  parseNextWithdrawalText,
};
