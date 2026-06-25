function extractPaymentsSnapshot({ pageProps, earningsSummary, buttonText, buttonDisabled, nextWithdrawalText }) {
  const availableAmountCents = numberOrZero(pageProps?.paymentStatus?.amountInCents);
  const canWithdraw = Boolean(!buttonDisabled && availableAmountCents > 0);
  const totalEarningsCents = numberOrZero(pageProps?.totalLifetimeEarnings);
  const pendingApprovalCents = numberOrZero(pageProps?.unapprovedAmount);
  const totalPaidOutCents = numberOrZero(earningsSummary?.totalPaidOut);
  const thisMonthCents = numberOrZero(earningsSummary?.currentMonthEarnings);
  const bestMonthSource = normalizeBestMonth(earningsSummary?.bestMonth);

  return {
    available_amount_cents: availableAmountCents,
    available_amount: centsToNumber(availableAmountCents),
    available_amount_formatted: formatCents(availableAmountCents),
    can_withdraw: canWithdraw,
    button_enabled: !buttonDisabled,
    button_text: buttonText || formatButtonText(availableAmountCents),
    next_withdrawal_at: pageProps?.paymentStatus?.nextEligibleAt || null,
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
    const nextWithdrawal = Array.from(document.querySelectorAll('p')).find((node) => /Next withdrawal:/i.test((node.innerText || node.textContent || '').trim()));
    return {
      buttonText: button ? (button.innerText || button.textContent || '').trim().replace(/\s+/g, ' ') : '',
      buttonDisabled: button ? Boolean(button.disabled) : false,
      nextWithdrawalText: nextWithdrawal ? (nextWithdrawal.innerText || nextWithdrawal.textContent || '').trim().replace(/\s+/g, ' ') : '',
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
};
