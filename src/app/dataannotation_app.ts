const { DataAnnotationMqttBridge } = require('../integrations/mqtt_bridge.ts');
const { DataAnnotationClient } = require('../clients/dataannotation_client.ts');
const { createLogger } = require('../shared/logger.ts');
const { computeNextRunAt } = require('../shared/polling_schedule.ts');
const { loadClaimProjectsLockState, saveClaimProjectsLockState } = require('../state/claim_projects_state.ts');
const { loadAutoAcceptState, saveAutoAcceptState } = require('../state/auto_accept_state.ts');
const {
  computeNextFxRateRefreshAt,
  fetchUsdToPhpRate,
  getDisplayCurrency,
  loadCurrencyState,
  saveCurrencyState,
  shouldRefreshCurrencyRate,
} = require('../state/currency_conversion.ts');
const { loadFastPollingState, saveFastPollingState } = require('../state/fast_polling_state.ts');
const { loadNextWithdrawalState, saveNextWithdrawalState } = require('../state/next_withdrawal_state.ts');
const { clearAutoAcceptProjectCache, loadAutoAcceptProjects, pruneExpiredAutoAcceptProjects, saveAutoAcceptProjects, setAutoAcceptProjectEnabled } = require('../state/auto_accept_projects.ts');
const { loadWithdrawLockState, saveWithdrawLockState } = require('../state/withdraw_lock_state.ts');
const { shouldIncludeFundsHistory } = require('../state/sync_policy.ts');
const { doSync, getActivePollCron, republishCurrencyViews } = require('./sync.ts');
const { handleClaimRequest, handleWithdrawRequest } = require('./commands.ts');
const { purgeRecorderEntities } = require('../integrations/ha_notifications.ts');
const { WalletSync } = require('../wallet/wallet_sync.ts');
const { RuntimeState } = require('./runtime_state.ts');

const CURRENCY_HISTORY_ENTITY_IDS = [
  'sensor.data_annotation_available_funds',
  'sensor.data_annotation_total_earnings',
  'sensor.data_annotation_total_paid_out',
  'sensor.data_annotation_this_month',
  'sensor.data_annotation_best_month',
  'sensor.data_annotation_pending_approval',
];

const WITHDRAW_LOCK_STATE_PATH = '/data/withdraw-lock-state.json';
const CLAIM_PROJECTS_LOCK_STATE_PATH = '/data/claim-projects-lock-state.json';
const FAST_POLLING_STATE_PATH = '/data/fast-polling-state.json';
const AUTO_ACCEPT_STATE_PATH = '/data/auto-accept-state.json';
const AUTO_ACCEPT_PROJECTS_STATE_PATH = '/data/auto-accept-projects.json';
const CURRENCY_STATE_PATH = '/data/currency-state.json';
const NEXT_WITHDRAWAL_STATE_PATH = '/data/next-withdrawal-state.json';
const DEFAULT_EXPEDITED_FUNDS_HISTORY_DELAY_MINUTES = 2;

class DataAnnotationApp {
  config: any;
  version: any;
  running: boolean;
  state: any;
  logger: any;
  bridge: any;
  client: any;
  walletSync: any;

  constructor(options: any) {
    const config = options.config;
    const version = options.version;
    this.config = config;
    this.version = version;
    this.running = false;
    this.state = new RuntimeState();
    this.logger = createLogger(config.log_level);
    this.bridge = new DataAnnotationMqttBridge({
      host: config.mqtt_host,
      port: config.mqtt_port,
      username: config.mqtt_username || undefined,
      password: config.mqtt_password || undefined,
      topicPrefix: config.mqtt_topic_prefix,
      profileName: config.profile || 'Data Annotation',
      version,
      logger: this.logger,
    });
    this.client = new DataAnnotationClient({
      email: config.email,
      password: config.password,
      profileDir: config.browser_profile_dir,
      logger: this.logger,
    });
    this.walletSync = new WalletSync(config, this.logger);
  }

  async start() {
    this.running = true;
    this._loadPersistedState();
    await this._connectAndPublishStartupState();

    try {
      while (this.running) {
        await this._applyBridgeChanges();
        await this._refreshCurrencyRateIfDue();
        await this._syncIfDue();
        await sleep(1000);
      }
    } finally {
      await this.stop();
    }
  }

  async stop() {
    this.running = false;
    await this.client.close().catch(() => {});
    await this.bridge.close().catch(() => {});
  }

  _loadPersistedState() {
    this.state.withdrawLocked = loadWithdrawLockState(WITHDRAW_LOCK_STATE_PATH);
    this.state.claimProjectsLocked = loadClaimProjectsLockState(CLAIM_PROJECTS_LOCK_STATE_PATH);
    this.state.fastPollingEnabled = loadFastPollingState(FAST_POLLING_STATE_PATH);
    this.state.autoAcceptEnabled = loadAutoAcceptState(AUTO_ACCEPT_STATE_PATH);
    this.state.autoAcceptProjectCache = loadAutoAcceptProjects(AUTO_ACCEPT_PROJECTS_STATE_PATH);
    this.state.currencyState = loadCurrencyState(CURRENCY_STATE_PATH);
    this.state.persistedNextWithdrawalState = loadNextWithdrawalState(NEXT_WITHDRAWAL_STATE_PATH);
  }

  async _connectAndPublishStartupState() {
    const { config, state, bridge } = this;
    await bridge.waitForConnection();
    bridge.publishOnline();
    bridge.publishDiscovery({ currencyUnit: getDisplayCurrency(state.currencyState) });
    state.autoAcceptProjectCache = bridge.publishAutoAcceptProjectPreferences({
      projects: [],
      cache: state.autoAcceptProjectCache,
      autoAcceptEnabled: state.autoAcceptEnabled,
      now: new Date(),
    });
    saveAutoAcceptProjects(AUTO_ACCEPT_PROJECTS_STATE_PATH, state.autoAcceptProjectCache);
    this._publishStaticState();
  }

  async _applyBridgeChanges() {
    const { bridge, logger, state } = this;

    if (bridge.withdrawLockChange.value !== null) {
      state.withdrawLocked = bridge.withdrawLockChange.value;
      bridge.withdrawLockChange.value = null;
      saveWithdrawLockState(WITHDRAW_LOCK_STATE_PATH, state.withdrawLocked);
      bridge.publishWithdrawLockState(state.withdrawLocked);
      logger.info(`Withdraw lock state updated: ${state.withdrawLocked ? 'locked' : 'unlocked'}`);
    }

    if (bridge.claimProjectsLockChange.value !== null) {
      state.claimProjectsLocked = bridge.claimProjectsLockChange.value;
      bridge.claimProjectsLockChange.value = null;
      saveClaimProjectsLockState(CLAIM_PROJECTS_LOCK_STATE_PATH, state.claimProjectsLocked);
      bridge.publishClaimProjectsLockState(state.claimProjectsLocked);
      logger.info(`Claim projects lock state updated: ${state.claimProjectsLocked ? 'locked' : 'unlocked'}`);
    }

    if (bridge.fastPollingChange.value !== null) {
      state.fastPollingEnabled = bridge.fastPollingChange.value;
      bridge.fastPollingChange.value = null;
      saveFastPollingState(FAST_POLLING_STATE_PATH, state.fastPollingEnabled);
      bridge.publishFastPollingState(state.fastPollingEnabled);
      state.nextRunAt = Date.now();
      logger.info(`Fast polling state updated: ${state.fastPollingEnabled ? 'enabled' : 'disabled'}`);
    }

    if (bridge.autoAcceptChange.value !== null) {
      state.autoAcceptEnabled = bridge.autoAcceptChange.value;
      bridge.autoAcceptChange.value = null;
      saveAutoAcceptState(AUTO_ACCEPT_STATE_PATH, state.autoAcceptEnabled);
      bridge.publishAutoAcceptState(state.autoAcceptEnabled);
      if (state.autoAcceptEnabled) {
        state.lastAutoAcceptAttemptSignature = null;
        state.lastAutoAcceptPendingTarget = null;
        state.lastAutoAcceptPendingAttemptCount = 0;
        state.lastAutoAcceptPendingAttemptedAt = null;
      } else {
        state.lastAutoAcceptAttemptSignature = null;
        state.lastAutoAcceptPendingTarget = null;
        state.lastAutoAcceptPendingAttemptCount = 0;
        state.lastAutoAcceptPendingAttemptedAt = null;
      }
      logger.info(`Auto accept state updated: ${state.autoAcceptEnabled ? 'enabled' : 'disabled'}`);
      bridge.clearAutoAcceptProjectPreferences();
      if (state.autoAcceptEnabled && Array.isArray(state.lastSuccessfulProjects) && state.lastSuccessfulProjects.length > 0) {
        state.autoAcceptProjectCache = bridge.publishAutoAcceptProjectPreferences({
          projects: state.lastSuccessfulProjects || [],
          cache: state.autoAcceptProjectCache,
          autoAcceptEnabled: true,
          now: new Date(),
        });
        saveAutoAcceptProjects(AUTO_ACCEPT_PROJECTS_STATE_PATH, state.autoAcceptProjectCache);
      } else {
        saveAutoAcceptProjects(AUTO_ACCEPT_PROJECTS_STATE_PATH, state.autoAcceptProjectCache);
      }
    }

    const autoAcceptProjectChanges = bridge.drainAutoAcceptProjectChanges();
    if (autoAcceptProjectChanges.length > 0) {
      for (const change of autoAcceptProjectChanges) {
        state.autoAcceptProjectCache = setAutoAcceptProjectEnabled(state.autoAcceptProjectCache, change.projectId, change.enabled, new Date());
        logger.info(`Auto accept priority updated for ${change.projectId}: ${change.enabled ? 'enabled' : 'disabled'}`);
      }

      if (state.autoAcceptEnabled && Array.isArray(state.lastSuccessfulProjects) && state.lastSuccessfulProjects.length > 0) {
        state.autoAcceptProjectCache = bridge.publishAutoAcceptProjectPreferences({
          projects: state.lastSuccessfulProjects || [],
          cache: state.autoAcceptProjectCache,
          autoAcceptEnabled: true,
          now: new Date(),
        });
      }

      saveAutoAcceptProjects(AUTO_ACCEPT_PROJECTS_STATE_PATH, state.autoAcceptProjectCache);
    }

    if (bridge.clearAutoAcceptProjectCacheRequested.value) {
      bridge.clearAutoAcceptProjectCacheRequested.value = false;
      state.autoAcceptProjectCache = clearAutoAcceptProjectCache(state.autoAcceptProjectCache, new Date());
      saveAutoAcceptProjects(AUTO_ACCEPT_PROJECTS_STATE_PATH, state.autoAcceptProjectCache);
      bridge.clearAutoAcceptProjectPreferences();
      saveAutoAcceptProjects(AUTO_ACCEPT_PROJECTS_STATE_PATH, state.autoAcceptProjectCache);
      logger.info('Auto accept priority cache cleared');
    }

    if (bridge.currencyModeChange.value !== null) {
      state.currencyState.convert_to_php = bridge.currencyModeChange.value;
      bridge.currencyModeChange.value = null;
      saveCurrencyState(CURRENCY_STATE_PATH, state.currencyState);
      bridge.publishCurrencyModeState(state.currencyState.convert_to_php);
      bridge.publishDiscovery({ currencyUnit: getDisplayCurrency(state.currencyState) });
      republishCurrencyViews(bridge, state.lastSuccessfulProjects, state.lastSuccessfulPayments, state.currencyState, state.lastSuccessfulSyncAt);
      try {
        await purgeRecorderEntities({ entityIds: CURRENCY_HISTORY_ENTITY_IDS, keepDays: 0, logger });
      } catch (error: any) {
        logger.warning(`Failed to purge currency history after mode change: ${error.message}`);
      }
      logger.info(`Currency mode updated: ${state.currencyState.convert_to_php ? 'PHP' : 'USD'}`);
    }

    if (bridge.rebuildDiscoveryRequested.value) {
      bridge.rebuildDiscoveryRequested.value = false;
      bridge.rebuildDiscovery({ currencyUnit: getDisplayCurrency(state.currencyState) });
      this._publishStaticState();
      logger.info('MQTT discovery rebuild completed');
    }

    if (bridge.claimRequested.value) {
      const claimRequest = bridge.claimRequested.value;
      bridge.claimRequested.value = null;
      await handleClaimRequest(this.client, bridge, state.claimProjectsLocked, claimRequest, logger);
      bridge.scanRequested.value = true;
    }

    if (bridge.withdrawRequested.value) {
      bridge.withdrawRequested.value = false;
      await handleWithdrawRequest(this.client, this.walletSync, bridge, state.withdrawLocked, state.currencyState, state.lastSuccessfulPayments, logger);
      bridge.scanRequested.value = true;
    }
  }

  async _refreshCurrencyRateIfDue() {
    const { bridge, logger, state } = this;
    const now = Date.now();
    if (!shouldRefreshCurrencyRate(state.currencyState, new Date(now)) || now < state.nextCurrencyRateRefreshAt) {
      return;
    }

    const rateRefreshStartedAt = Date.now();
    try {
      const fxRate = await fetchUsdToPhpRate();
      state.currencyState.usd_php_rate = fxRate.rate;
      state.currencyState.usd_php_rate_date = fxRate.date;
      state.currencyState.usd_php_rate_fetched_at = fxRate.fetched_at;
      state.currencyState.usd_php_rate_source = fxRate.source;
      saveCurrencyState(CURRENCY_STATE_PATH, state.currencyState);
      bridge.publishCurrencyRate(fxRate);
      logger.info(`Refreshed USD/PHP rate: ${fxRate.rate} (${fxRate.date || 'unknown date'})`);
      if (state.currencyState.convert_to_php) {
        bridge.publishDiscovery({ currencyUnit: getDisplayCurrency(state.currencyState) });
        republishCurrencyViews(bridge, state.lastSuccessfulProjects, state.lastSuccessfulPayments, state.currencyState, state.lastSuccessfulSyncAt);
      }
      state.nextCurrencyRateRefreshAt = Date.parse(computeNextFxRateRefreshAt(new Date(now)));
    } catch (error: any) {
      logger.warning(`Failed to refresh USD/PHP rate: ${error.message}`);
      state.nextCurrencyRateRefreshAt = now + 60 * 60 * 1000;
    } finally {
      logger.debug(`Currency rate refresh took ${Date.now() - rateRefreshStartedAt}ms`);
    }
  }

  async _syncIfDue() {
    const { bridge, config, logger, state } = this;
    const now = Date.now();
    if (!bridge.scanRequested.value && now < state.nextRunAt) {
      return;
    }

    const manualSyncRequested = bridge.scanRequested.value;
    const includeFundsHistory = shouldIncludeFundsHistory({
      includePayments: true,
      manualSyncRequested,
      initialSyncCompleted: state.hasCompletedInitialSync,
      fastPollingEnabled: state.fastPollingEnabled,
      now,
      nextFundsHistoryAt: state.nextFundsHistoryAt,
      nextExpeditedFundsHistoryAt: state.nextExpeditedFundsHistoryAt,
    });
    bridge.scanRequested.value = false;
    logger.debug(`Sync mode: manual=${manualSyncRequested}, payments=true, fundsHistory=${includeFundsHistory}, fastPolling=${state.fastPollingEnabled}`);

    const previousPayments = {
      ...(state.persistedNextWithdrawalState || {}),
      ...(state.lastSuccessfulPayments || {}),
    };
    const syncResult = await doSync(
      this.client,
      bridge,
      config,
      state.lastSuccessfulSyncAt,
      state.lastSuccessfulProjectCount,
      state.lastSuccessfulTotalTaskCount,
      state.hasCompletedInitialSync,
      state.lastSuccessfulProjects,
      previousPayments,
      {
        enabled: state.autoAcceptEnabled,
        claimProjectsLocked: state.claimProjectsLocked,
        lastAttemptSignature: state.lastAutoAcceptAttemptSignature,
        pendingClaimTarget: state.lastAutoAcceptPendingTarget,
        pendingClaimAttemptCount: state.lastAutoAcceptPendingAttemptCount,
        pendingClaimAttemptedAt: state.lastAutoAcceptPendingAttemptedAt,
      },
      state.autoAcceptProjectCache,
      state.currencyState,
      state.withdrawLocked,
      includeFundsHistory,
      state.lastFundsHistorySnapshot,
      logger
    );

    const currentInProgressTask = Boolean(syncResult.taskStatus?.in_progress_task);
    state.autoAcceptEnabled = syncResult.autoAcceptState.enabled;
    state.lastAutoAcceptAttemptSignature = syncResult.autoAcceptState.lastAttemptSignature;
    state.lastAutoAcceptPendingTarget = syncResult.autoAcceptState.pendingClaimTarget || null;
    state.lastAutoAcceptPendingAttemptCount = Number.isFinite(syncResult.autoAcceptState.pendingClaimAttemptCount)
      ? syncResult.autoAcceptState.pendingClaimAttemptCount
      : 0;
    state.lastAutoAcceptPendingAttemptedAt = Number.isFinite(syncResult.autoAcceptState.pendingClaimAttemptedAt)
      ? syncResult.autoAcceptState.pendingClaimAttemptedAt
      : null;

    if (state.lastInProgressTask === true && currentInProgressTask === false) {
      const delayMinutes = Number(config.funds_history_after_task_delay_minutes ?? DEFAULT_EXPEDITED_FUNDS_HISTORY_DELAY_MINUTES);
      if (Number.isFinite(delayMinutes) && delayMinutes > 0) {
        const expeditedAt = Date.now() + delayMinutes * 60 * 1000;
        state.nextExpeditedFundsHistoryAt = Number.isFinite(state.nextExpeditedFundsHistoryAt)
          ? Math.min(state.nextExpeditedFundsHistoryAt, expeditedAt)
          : expeditedAt;
        state.nextRunAt = Math.min(state.nextRunAt, expeditedAt);
        logger.info(`Scheduled expedited Funds History sync in ${delayMinutes} minute${delayMinutes === 1 ? '' : 's'} after task completion`);
      }
    }

    state.lastInProgressTask = currentInProgressTask;
    state.lastSuccessfulSyncAt = syncResult.lastSuccessfulSyncAt;
    state.lastSuccessfulProjectCount = syncResult.lastSuccessfulProjectCount;
    state.lastSuccessfulTotalTaskCount = syncResult.lastSuccessfulTotalTaskCount;
    state.lastSuccessfulProjects = syncResult.projects || state.lastSuccessfulProjects;
    state.lastSuccessfulPayments = syncResult.payments || state.lastSuccessfulPayments;
    if (syncResult.payments) {
      try {
        saveNextWithdrawalState(NEXT_WITHDRAWAL_STATE_PATH, syncResult.payments);
      } catch (error: any) {
        logger.warning(`Failed to persist next withdrawal state: ${error.message}`);
      }
    }
    await this.walletSync.processSync({
      payments: syncResult.payments,
      fundsHistorySnapshot: syncResult.fundsHistorySnapshot,
      includeFundsHistory: syncResult.includeFundsHistory,
      currencyState: state.currencyState,
      now: new Date(now),
    });
    if (syncResult.fundsHistorySnapshot) {
      state.lastFundsHistorySnapshot = syncResult.fundsHistorySnapshot;
    }
    if (syncResult.includeFundsHistory) {
      state.nextFundsHistoryAt = Date.parse(computeNextRunAt(config.funds_history_cron, new Date(now)));
      if (Number.isFinite(state.nextExpeditedFundsHistoryAt) && Date.now() >= state.nextExpeditedFundsHistoryAt) {
        state.nextExpeditedFundsHistoryAt = null;
      }
    }
    state.hasCompletedInitialSync = true;
    state.nextRunAt = Date.parse(computeNextRunAt(getActivePollCron(config, state.fastPollingEnabled), new Date()));
    if (Number.isFinite(state.nextExpeditedFundsHistoryAt)) {
      state.nextRunAt = Math.min(state.nextRunAt, state.nextExpeditedFundsHistoryAt);
    }
    state.autoAcceptProjectCache = pruneExpiredAutoAcceptProjects(state.autoAcceptProjectCache, new Date());
    state.autoAcceptProjectCache = bridge.publishAutoAcceptProjectPreferences({
      projects: state.lastSuccessfulProjects || [],
      cache: state.autoAcceptProjectCache,
      autoAcceptEnabled: state.autoAcceptEnabled,
      now: new Date(),
    });
    saveAutoAcceptProjects(AUTO_ACCEPT_PROJECTS_STATE_PATH, state.autoAcceptProjectCache);
  }

  _publishStaticState() {
    const { config, state, bridge } = this;
    bridge.publishProfile(config.profile || 'Data Annotation');
    bridge.publishWithdrawLockState(state.withdrawLocked);
    bridge.publishClaimProjectsLockState(state.claimProjectsLocked);
    bridge.publishFastPollingState(state.fastPollingEnabled);
    bridge.publishAutoAcceptState(state.autoAcceptEnabled);
    bridge.publishCurrencyModeState(state.currencyState.convert_to_php);
    if (Number.isFinite(state.currencyState.usd_php_rate)) {
      bridge.publishCurrencyRate({
        base: 'USD',
        quote: 'PHP',
        rate: state.currencyState.usd_php_rate,
        date: state.currencyState.usd_php_rate_date,
        source: state.currencyState.usd_php_rate_source || 'frankfurter',
        fetched_at: state.currencyState.usd_php_rate_fetched_at,
      });
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  DataAnnotationApp,
};
