function shouldIncludePayments({ initialSyncCompleted, manualSyncRequested, fastPollingEnabled }) {
  return Boolean(manualSyncRequested || !fastPollingEnabled || !initialSyncCompleted);
}

function shouldIncludeFundsHistory({ includePayments, manualSyncRequested, initialSyncCompleted, fastPollingEnabled, now, nextFundsHistoryAt }) {
  if (!includePayments) {
    return false;
  }

  if (manualSyncRequested || !initialSyncCompleted) {
    return true;
  }

  if (fastPollingEnabled) {
    return false;
  }

  return Number.isFinite(nextFundsHistoryAt) ? now >= nextFundsHistoryAt : true;
}

function pickFundsHistoryFields(payments) {
  return {
    next_payout_days: payments?.next_payout_days ?? 0,
    next_payout_at: payments?.next_payout_at ?? null,
    next_payout_entries_count: payments?.next_payout_entries_count ?? 0,
    pending_payout_entries: Array.isArray(payments?.pending_payout_entries) ? payments.pending_payout_entries : [],
  };
}

function mergePaymentsWithFundsHistory(payments, fundsHistorySnapshot) {
  return {
    ...(payments || {}),
    ...(fundsHistorySnapshot || {}),
  };
}

module.exports = {
  mergePaymentsWithFundsHistory,
  pickFundsHistoryFields,
  shouldIncludeFundsHistory,
  shouldIncludePayments,
};
