class RuntimeState {
  withdrawLocked = false;
  claimProjectsLocked = false;
  fastPollingEnabled = false;
  autoAcceptEnabled = false;
  currencyState = null;
  lastSuccessfulSyncAt = null;
  lastSuccessfulProjectCount = 0;
  lastSuccessfulTotalTaskCount = 0;
  lastSuccessfulProjects = null;
  lastSuccessfulPayments = null;
  persistedNextWithdrawalState = null;
  lastFundsHistorySnapshot = null;
  autoAcceptProjectCache = null;
  lastInProgressTask = null;
  lastAutoAcceptAttemptSignature = null;
  lastAutoAcceptPendingTarget = null;
  lastAutoAcceptPendingAttemptCount = 0;
  lastAutoAcceptPendingAttemptedAt = null;
  nextRunAt = Date.now();
  nextCurrencyRateRefreshAt = Date.now();
  nextFundsHistoryAt = Date.now();
  nextExpeditedFundsHistoryAt = null;
  hasCompletedInitialSync = false;

  constructor() {
  }
}

module.exports = {
  RuntimeState,
};
