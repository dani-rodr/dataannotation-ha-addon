function shouldIncludePayments({ initialSyncCompleted, manualSyncRequested, fastPollingEnabled }) {
  return true;
}

function shouldIncludeFundsHistory({
  includePayments,
  manualSyncRequested,
  initialSyncCompleted,
  fastPollingEnabled,
  now,
  nextFundsHistoryAt,
  nextExpeditedFundsHistoryAt,
}) {
  if (!includePayments) {
    return false;
  }

  if (manualSyncRequested || !initialSyncCompleted) {
    return true;
  }

  if (Number.isFinite(nextExpeditedFundsHistoryAt) && now >= nextExpeditedFundsHistoryAt) {
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
    next_payout_at_human: payments?.next_payout_at_human ?? null,
    next_payout_entries: Array.isArray(payments?.next_payout_entries) ? payments.next_payout_entries : [],
    next_payout_amount: payments?.next_payout_amount ?? null,
    next_payout_source: payments?.next_payout_source ?? null,
    next_payout_confidence: payments?.next_payout_confidence ?? null,
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
