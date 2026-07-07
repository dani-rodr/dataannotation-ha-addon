const { readConfig, configureLogging } = require('./config');
const { DataAnnotationClient } = require('./dataannotation_client');
const { detectNewTaskProjects } = require('./project_delta');
const { createPersistentNotification } = require('./ha_notifications');
const { DataAnnotationMqttBridge } = require('./mqtt_bridge');
const { createLogger } = require('./logger');
const { summarizeProjects } = require('./scrapers/projects');
const { computeNextRunAt } = require('./polling_schedule');
const { loadClaimProjectsLockState, saveClaimProjectsLockState } = require('./claim_projects_state');
const { loadAutoAcceptState, saveAutoAcceptState } = require('./auto_accept_state');
const {
  computeNextFxRateRefreshAt,
  convertPaymentsForCurrency,
  convertProjectsForCurrency,
  fetchUsdToPhpRate,
  getDisplayCurrency,
  loadCurrencyState,
  saveCurrencyState,
  shouldRefreshCurrencyRate,
} = require('./currency_conversion');
const {
  mergePaymentsWithFundsHistory,
  pickFundsHistoryFields,
  shouldIncludeFundsHistory,
} = require('./sync_policy');
const { loadFastPollingState, saveFastPollingState } = require('./fast_polling_state');
const { loadWithdrawLockState, saveWithdrawLockState } = require('./withdraw_lock_state');
const { filterExcludedProjects } = require('./project_filters');

const { version } = require('../package.json');

const WITHDRAW_LOCK_STATE_PATH = '/data/withdraw-lock-state.json';
const CLAIM_PROJECTS_LOCK_STATE_PATH = '/data/claim-projects-lock-state.json';
const FAST_POLLING_STATE_PATH = '/data/fast-polling-state.json';
const AUTO_ACCEPT_STATE_PATH = '/data/auto-accept-state.json';
const CURRENCY_STATE_PATH = '/data/currency-state.json';
const FUNDS_HISTORY_OBSERVATIONS_PATH = '/data/funds-history-observations.json';
const DEFAULT_EXPEDITED_FUNDS_HISTORY_DELAY_MINUTES = 2;

let running = true;

process.on('SIGINT', () => {
  running = false;
});

process.on('SIGTERM', () => {
  running = false;
});

async function main() {
  const config = await readConfig();
  configureLogging(config.log_level);
  const logger = createLogger(config.log_level);

  logger.info(`Starting Data Annotation add-on v${version}`);
  logger.debug(
    `Config loaded: profile="${config.profile || 'Data Annotation'}", topic="${config.mqtt_topic_prefix}", poll="${config.poll_cron}", fast_poll="${config.fast_poll_cron}", funds_history="${config.funds_history_cron}", mqtt_host="${config.mqtt_host}"`
  );

  const bridge = new DataAnnotationMqttBridge({
    host: config.mqtt_host,
    port: config.mqtt_port,
    username: config.mqtt_username || undefined,
    password: config.mqtt_password || undefined,
    topicPrefix: config.mqtt_topic_prefix,
    profileName: config.profile || 'Data Annotation',
    version,
    logger,
    publishTargets: ['projects', 'status'],
  });

  const client = new DataAnnotationClient({
    email: config.email,
    password: config.password,
    profileDir: config.browser_profile_dir,
    logger,
  });

  let withdrawLocked = loadWithdrawLockState(WITHDRAW_LOCK_STATE_PATH);
  let claimProjectsLocked = loadClaimProjectsLockState(CLAIM_PROJECTS_LOCK_STATE_PATH);
  let fastPollingEnabled = loadFastPollingState(FAST_POLLING_STATE_PATH);
  let autoAcceptEnabled = loadAutoAcceptState(AUTO_ACCEPT_STATE_PATH);
  let currencyState = loadCurrencyState(CURRENCY_STATE_PATH);

  try {
    await bridge.waitForConnection();
    bridge.publishOnline();
    bridge.publishDiscovery({ currencyUnit: getDisplayCurrency(currencyState) });
    bridge.publishProfile(config.profile || 'Data Annotation');
    bridge.publishWithdrawLockState(withdrawLocked);
    bridge.publishClaimProjectsLockState(claimProjectsLocked);
    bridge.publishFastPollingState(fastPollingEnabled);
    bridge.publishAutoAcceptState(autoAcceptEnabled);
    bridge.publishCurrencyModeState(currencyState.convert_to_php);
    if (Number.isFinite(currencyState.usd_php_rate)) {
      bridge.publishCurrencyRate({
        base: 'USD',
        quote: 'PHP',
        rate: currencyState.usd_php_rate,
        date: currencyState.usd_php_rate_date,
        source: currencyState.usd_php_rate_source || 'frankfurter',
        fetched_at: currencyState.usd_php_rate_fetched_at,
      });
    }

    let lastSuccessfulSyncAt = null;
    let lastSuccessfulProjectCount = 0;
    let lastSuccessfulTotalTaskCount = 0;
    let lastSuccessfulProjects = null;
    let lastSuccessfulPayments = null;
    let nextRunAt = Date.now();
    let nextCurrencyRateRefreshAt = Date.now();
    let nextFundsHistoryAt = Date.now();
    let nextExpeditedFundsHistoryAt = null;
    let hasCompletedInitialSync = false;
    let lastFundsHistorySnapshot = null;
    let lastInProgressTask = null;
    let lastAutoAcceptAttemptSignature = null;

    while (running) {
      if (bridge.withdrawLockChange.value !== null) {
        withdrawLocked = bridge.withdrawLockChange.value;
        bridge.withdrawLockChange.value = null;
        saveWithdrawLockState(WITHDRAW_LOCK_STATE_PATH, withdrawLocked);
        bridge.publishWithdrawLockState(withdrawLocked);
        logger.info(`Withdraw lock state updated: ${withdrawLocked ? 'locked' : 'unlocked'}`);
      }

      if (bridge.claimProjectsLockChange.value !== null) {
        claimProjectsLocked = bridge.claimProjectsLockChange.value;
        bridge.claimProjectsLockChange.value = null;
        saveClaimProjectsLockState(CLAIM_PROJECTS_LOCK_STATE_PATH, claimProjectsLocked);
        bridge.publishClaimProjectsLockState(claimProjectsLocked);
        logger.info(`Claim projects lock state updated: ${claimProjectsLocked ? 'locked' : 'unlocked'}`);
      }

      if (bridge.fastPollingChange.value !== null) {
        fastPollingEnabled = bridge.fastPollingChange.value;
        bridge.fastPollingChange.value = null;
        saveFastPollingState(FAST_POLLING_STATE_PATH, fastPollingEnabled);
        bridge.publishFastPollingState(fastPollingEnabled);
        nextRunAt = Date.now();
        logger.info(`Fast polling state updated: ${fastPollingEnabled ? 'enabled' : 'disabled'}`);
      }

      if (bridge.autoAcceptChange.value !== null) {
        autoAcceptEnabled = bridge.autoAcceptChange.value;
        bridge.autoAcceptChange.value = null;
        saveAutoAcceptState(AUTO_ACCEPT_STATE_PATH, autoAcceptEnabled);
        bridge.publishAutoAcceptState(autoAcceptEnabled);
        if (autoAcceptEnabled) {
          lastAutoAcceptAttemptSignature = null;
        }
        logger.info(`Auto accept state updated: ${autoAcceptEnabled ? 'enabled' : 'disabled'}`);
      }

      if (bridge.currencyModeChange.value !== null) {
        currencyState.convert_to_php = bridge.currencyModeChange.value;
        bridge.currencyModeChange.value = null;
        saveCurrencyState(CURRENCY_STATE_PATH, currencyState);
        bridge.publishCurrencyModeState(currencyState.convert_to_php);
        bridge.publishDiscovery({ currencyUnit: getDisplayCurrency(currencyState) });
        republishCurrencyViews(bridge, lastSuccessfulProjects, lastSuccessfulPayments, currencyState, lastSuccessfulSyncAt);
        logger.info(`Currency mode updated: ${currencyState.convert_to_php ? 'PHP' : 'USD'}`);
      }

      if (bridge.claimRequested.value) {
        const claimRequest = bridge.claimRequested.value;
        bridge.claimRequested.value = null;
        await handleClaimRequest(client, bridge, claimProjectsLocked, claimRequest, logger);
        bridge.scanRequested.value = true;
      }

      if (bridge.withdrawRequested.value) {
        bridge.withdrawRequested.value = false;
        await handleWithdrawRequest(client, bridge, withdrawLocked, currencyState, logger);
        bridge.scanRequested.value = true;
      }

      const now = Date.now();
      if (shouldRefreshCurrencyRate(currencyState, new Date(now)) && now >= nextCurrencyRateRefreshAt) {
        const rateRefreshStartedAt = Date.now();
        try {
          const fxRate = await fetchUsdToPhpRate();
          currencyState.usd_php_rate = fxRate.rate;
          currencyState.usd_php_rate_date = fxRate.date;
          currencyState.usd_php_rate_fetched_at = fxRate.fetched_at;
          currencyState.usd_php_rate_source = fxRate.source;
          saveCurrencyState(CURRENCY_STATE_PATH, currencyState);
          bridge.publishCurrencyRate(fxRate);
          logger.info(`Refreshed USD/PHP rate: ${fxRate.rate} (${fxRate.date || 'unknown date'})`);
          if (currencyState.convert_to_php) {
            bridge.publishDiscovery({ currencyUnit: getDisplayCurrency(currencyState) });
            republishCurrencyViews(bridge, lastSuccessfulProjects, lastSuccessfulPayments, currencyState, lastSuccessfulSyncAt);
          }
          nextCurrencyRateRefreshAt = Date.parse(computeNextFxRateRefreshAt(new Date(now)));
        } catch (error) {
          logger.warning(`Failed to refresh USD/PHP rate: ${error.message}`);
          nextCurrencyRateRefreshAt = now + 60 * 60 * 1000;
        } finally {
          logger.debug(`Currency rate refresh took ${Date.now() - rateRefreshStartedAt}ms`);
        }
      }

      if (bridge.scanRequested.value || now >= nextRunAt) {
        const manualSyncRequested = bridge.scanRequested.value;
        const includeFundsHistory = shouldIncludeFundsHistory({
          includePayments: true,
          manualSyncRequested,
          initialSyncCompleted: hasCompletedInitialSync,
          fastPollingEnabled,
          now,
          nextFundsHistoryAt,
          nextExpeditedFundsHistoryAt,
        });
        bridge.scanRequested.value = false;
        logger.debug(`Sync mode: manual=${manualSyncRequested}, payments=true, fundsHistory=${includeFundsHistory}, fastPolling=${fastPollingEnabled}`);
        const syncResult = await doSync(
          client,
          bridge,
          config,
          lastSuccessfulSyncAt,
          lastSuccessfulProjectCount,
          lastSuccessfulTotalTaskCount,
          hasCompletedInitialSync,
          lastSuccessfulProjects,
          {
            enabled: autoAcceptEnabled,
            claimProjectsLocked,
            lastAttemptSignature: lastAutoAcceptAttemptSignature,
          },
          currencyState,
          withdrawLocked,
          includeFundsHistory,
          lastFundsHistorySnapshot,
          logger
        );
        const currentInProgressTask = Boolean(syncResult.taskStatus?.in_progress_task);

        autoAcceptEnabled = syncResult.autoAcceptState.enabled;
        lastAutoAcceptAttemptSignature = syncResult.autoAcceptState.lastAttemptSignature;

        if (lastInProgressTask === true && currentInProgressTask === false) {
          const delayMinutes = Number(config.funds_history_after_task_delay_minutes ?? DEFAULT_EXPEDITED_FUNDS_HISTORY_DELAY_MINUTES);
          if (Number.isFinite(delayMinutes) && delayMinutes > 0) {
            const expeditedAt = Date.now() + delayMinutes * 60 * 1000;
            nextExpeditedFundsHistoryAt = Number.isFinite(nextExpeditedFundsHistoryAt)
              ? Math.min(nextExpeditedFundsHistoryAt, expeditedAt)
              : expeditedAt;
            nextRunAt = Math.min(nextRunAt, expeditedAt);
            logger.info(`Scheduled expedited Funds History sync in ${delayMinutes} minute${delayMinutes === 1 ? '' : 's'} after task completion`);
          }
        }
        lastInProgressTask = currentInProgressTask;
        lastSuccessfulSyncAt = syncResult.lastSuccessfulSyncAt;
        lastSuccessfulProjectCount = syncResult.lastSuccessfulProjectCount;
        lastSuccessfulTotalTaskCount = syncResult.lastSuccessfulTotalTaskCount;
        lastSuccessfulProjects = syncResult.projects || lastSuccessfulProjects;
        lastSuccessfulPayments = syncResult.payments || lastSuccessfulPayments;
        if (syncResult.fundsHistorySnapshot) {
          lastFundsHistorySnapshot = syncResult.fundsHistorySnapshot;
        }
        if (syncResult.includeFundsHistory) {
          nextFundsHistoryAt = Date.parse(computeNextRunAt(config.funds_history_cron, new Date()));
          if (Number.isFinite(nextExpeditedFundsHistoryAt) && Date.now() >= nextExpeditedFundsHistoryAt) {
            nextExpeditedFundsHistoryAt = null;
          }
        }
        hasCompletedInitialSync = true;
        nextRunAt = Date.parse(computeNextRunAt(getActivePollCron(config, fastPollingEnabled), new Date()));
        if (Number.isFinite(nextExpeditedFundsHistoryAt)) {
          nextRunAt = Math.min(nextRunAt, nextExpeditedFundsHistoryAt);
        }
      }

      await sleep(1000);
    }
  } finally {
    await client.close().catch(() => {});
    await bridge.close().catch(() => {});
  }
}

async function doSync(
  client,
  bridge,
  config,
  lastSuccessfulSyncAt,
  lastSuccessfulProjectCount,
  lastSuccessfulTotalTaskCount,
  initialSyncCompleted,
  previousProjects,
  autoAcceptState,
  currencyState,
  withdrawLocked,
  includeFundsHistory,
  lastFundsHistorySnapshot,
  logger
) {
  const startedAt = new Date().toISOString();
  logger.info(`Starting sync at ${startedAt}`);

  try {
    const projectStartedAt = Date.now();
    const result = await client.collectProjects();
    const completedAt = new Date().toISOString();
    const filteredProjectsResult = filterExcludedProjects(result.projects, config.excluded_project_patterns);
    const projects = filteredProjectsResult.projects;
    const excludedProjects = filteredProjectsResult.excludedProjects;
    const projectSummary = summarizeProjects(projects);
    const newTaskEvents = initialSyncCompleted ? detectNewTaskProjects(previousProjects, projects) : [];
    logger.debug(`Project scrape completed in ${Date.now() - projectStartedAt}ms`);
    if (excludedProjects.length > 0) {
      logger.info(`Filtered ${excludedProjects.length} excluded project${excludedProjects.length === 1 ? '' : 's'} from project totals`);
      logger.debug(`Excluded projects: ${excludedProjects.map((project) => project.name).join(' | ')}`);
    }

    logger.info(
      `${includeFundsHistory ? 'Sync' : 'Fast sync'} complete: ${projectSummary.count} projects, ${projectSummary.total_tasks} total tasks`
    );
    logger.debug(`Projects page URL: ${result.pageUrl}`);

    bridge.publishOnline();
    bridge.publishProfile(config.profile || 'Data Annotation');
    bridge.publishWithdrawLockState(withdrawLocked);
    bridge.publishSummary({
      count: projectSummary.count,
      total_tasks: projectSummary.total_tasks,
      profile: config.profile || 'Data Annotation',
      login_state: result.loginState,
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: completedAt,
      excluded_project_count: excludedProjects.length,
      excluded_project_names: excludedProjects.map((project) => project.name),
      new_task_detected: newTaskEvents.length > 0,
      new_task_count: newTaskEvents.reduce((sum, event) => sum + event.added_tasks, 0),
      new_task_project_name: newTaskEvents[0]?.name || null,
      new_task_project_url: newTaskEvents[0]?.url || null,
      new_task_detected_at: newTaskEvents.length > 0 ? completedAt : null,
      new_tasks: newTaskEvents,
    });
    bridge.publishStatusSuccess({
      trigger: 'poll',
      state: 'online',
      loginState: result.loginState,
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: completedAt,
      lastError: null,
    });
    const displayCurrency = getDisplayCurrency(currencyState);
    const publishedProjects = convertProjectsForCurrency(projects, currencyState);
    bridge.publishProjects(publishedProjects, completedAt);
    bridge.publishTaskStatus(result.taskStatus, completedAt);

    for (const event of newTaskEvents) {
      logger.info(`New DataAnnotation task detected: "${event.name}" (+${event.added_tasks}, total ${event.current_tasks})${event.url ? ` ${event.url}` : ''}`);
    }

    const autoAcceptStartedAt = Date.now();
    const autoAcceptResult = await maybeAutoAcceptNewTasks({
      bridge,
      client,
      logger,
      autoAcceptEnabled: autoAcceptState.enabled,
      claimProjectsLocked: autoAcceptState.claimProjectsLocked,
      newTaskEvents,
      lastAttemptSignature: autoAcceptState.lastAttemptSignature,
      taskStatus: result.taskStatus,
    });
    autoAcceptState.enabled = autoAcceptResult.enabled;
    autoAcceptState.lastAttemptSignature = autoAcceptResult.lastAttemptSignature;
    logger.debug(`Auto accept decision completed in ${Date.now() - autoAcceptStartedAt}ms`);

    const paymentsStartedAt = Date.now();
    const payments = await client.collectPayments({
      includeFundsHistory,
      fundsHistoryObservationsPath: FUNDS_HISTORY_OBSERVATIONS_PATH,
    });
    logger.debug(`Payments scrape completed in ${Date.now() - paymentsStartedAt}ms`);
    const mergedPayments = includeFundsHistory
      ? payments
      : mergePaymentsWithFundsHistory(payments, lastFundsHistorySnapshot);
    logger.info(`Payments snapshot complete: available=${mergedPayments.available_amount_formatted}, canWithdraw=${mergedPayments.can_withdraw}`);
    logger.debug(`Payments page URL: ${mergedPayments.pageUrl}`);
    if (!includeFundsHistory) {
      logger.debug('Payments snapshot reused last known Funds History fields');
    }
    const publishedPayments = convertPaymentsForCurrency(mergedPayments, currencyState);
    bridge.publishPayments(publishedPayments, mergedPayments.scraped_at || completedAt);

    return {
      lastSuccessfulSyncAt: completedAt,
      lastSuccessfulProjectCount: projectSummary.count,
      lastSuccessfulTotalTaskCount: projectSummary.total_tasks,
      projects,
      payments: mergedPayments,
      currencyUnit: displayCurrency,
      autoAcceptState: autoAcceptResult,
      fundsHistorySnapshot: includeFundsHistory ? pickFundsHistoryFields(mergedPayments) : null,
      includeFundsHistory,
      taskStatus: result.taskStatus,
      newTaskEvents,
    };
  } catch (error) {
    logger.error(`Sync failed: ${error.stack || error.message}`);
    bridge.publishStatusError({
      trigger: 'poll',
      state: 'offline',
      loginState: 'login_failed',
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: lastSuccessfulSyncAt,
      lastError: error.message,
    });
    bridge.publishWithdrawLockState(withdrawLocked);
      logger.warning('Retaining last known project summary because sync did not complete');
    return {
      lastSuccessfulSyncAt,
      lastSuccessfulProjectCount,
      lastSuccessfulTotalTaskCount,
      projects: previousProjects,
      payments: null,
      currencyUnit: getDisplayCurrency(currencyState),
      autoAcceptState,
      fundsHistorySnapshot: null,
      includeFundsHistory: false,
      taskStatus: null,
      newTaskEvents: [],
    };
  }
}

function getActivePollCron(config, fastPollingEnabled) {
  return fastPollingEnabled ? config.fast_poll_cron : config.poll_cron;
}

function buildAutoAcceptSignature(newTaskEvents) {
  if (!Array.isArray(newTaskEvents) || newTaskEvents.length === 0) {
    return null;
  }

  return newTaskEvents
    .map((event) => [event.slug, event.added_tasks, event.current_tasks, event.name].join('|'))
    .join(';;');
}

function republishCurrencyViews(bridge, projects, payments, currencyState, scrapedAt = new Date().toISOString()) {
  if (Array.isArray(projects)) {
    bridge.publishProjects(convertProjectsForCurrency(projects, currencyState), scrapedAt);
  }

  if (payments) {
    bridge.publishPayments(convertPaymentsForCurrency(payments, currencyState), payments.scraped_at || scrapedAt);
  }
}

async function maybeAutoAcceptNewTasks({
  bridge,
  client,
  logger,
  autoAcceptEnabled,
  claimProjectsLocked,
  newTaskEvents,
  lastAttemptSignature,
  taskStatus,
}) {
  let enabled = Boolean(autoAcceptEnabled);
  let nextAttemptSignature = lastAttemptSignature || null;

  if (!enabled) {
    return { enabled, lastAttemptSignature: nextAttemptSignature };
  }

  if (taskStatus?.in_progress_task) {
    logger.info('Auto accept disabled because In Progress Task is ON');
    saveAutoAcceptState(AUTO_ACCEPT_STATE_PATH, false);
    bridge.publishAutoAcceptState(false);
    return { enabled: false, lastAttemptSignature: null };
  }

  if (claimProjectsLocked) {
    logger.info('Auto accept disabled because Claim Projects Locked is ON');
    saveAutoAcceptState(AUTO_ACCEPT_STATE_PATH, false);
    bridge.publishAutoAcceptState(false);
    return { enabled: false, lastAttemptSignature: null };
  }

  if (!Array.isArray(newTaskEvents) || newTaskEvents.length === 0) {
    return { enabled, lastAttemptSignature: nextAttemptSignature };
  }

  const signature = buildAutoAcceptSignature(newTaskEvents);
  if (signature && signature === nextAttemptSignature) {
    return { enabled, lastAttemptSignature: nextAttemptSignature };
  }

  const claimTarget = newTaskEvents[0];
  nextAttemptSignature = signature;
  logger.info(`Auto accept detected new task: "${claimTarget.name}"${claimTarget.url ? ` ${claimTarget.url}` : ''}`);
  const claimStartedAt = Date.now();
  const claimResult = await client.claimProject(claimTarget.slug);
  logger.info(`Auto accept claim result for ${claimTarget.slug}: ${claimResult.status}`);
  logger.debug(`Auto accept claim completed in ${Date.now() - claimStartedAt}ms`);

  if (claimResult.status === 'claimed' || claimResult.status === 'already_in_work_mode') {
    logger.info('Auto accept turned off after successful claim');
    saveAutoAcceptState(AUTO_ACCEPT_STATE_PATH, false);
    bridge.publishAutoAcceptState(false);
    bridge.scanRequested.value = true;
    return { enabled: false, lastAttemptSignature: null };
  }

  return { enabled, lastAttemptSignature: nextAttemptSignature };
}

async function handleWithdrawRequest(client, bridge, withdrawLocked, currencyState, logger) {
  logger.info('Processing withdraw request');

  if (withdrawLocked) {
    try {
      await createPersistentNotification({
        title: 'Data Annotation Withdrawal Locked',
        message: buildWithdrawalLockedMessage(),
        notificationId: 'dataannotation_withdrawal_locked',
        logger,
      });
    } catch (error) {
      logger.warning(`Failed to create withdrawal locked notification: ${error.message}`);
    }
    logger.warning('Withdrawal request blocked because the lock is on');
    return;
  }

  logger.debug('Submitting withdrawal request through fresh eligibility check');
  const result = await client.withdrawAvailableFunds();
  const payments = result.payments || {};
  const publishedPayments = convertPaymentsForCurrency(payments, currencyState);

  if (result.status !== 'submitted') {
    const nextWithdrawalAt = parseDate(publishedPayments?.next_withdrawal_at);
    const reason = !publishedPayments?.can_withdraw && nextWithdrawalAt && nextWithdrawalAt.getTime() > Date.now()
      ? 'time'
      : publishedPayments?.withdraw_button_present
        ? 'funds'
        : 'button';
    const message = buildWithdrawalNotReadyMessage(publishedPayments, reason);

    try {
      await createPersistentNotification({
        title: 'Data Annotation Withdrawal Not Ready',
        message,
        notificationId: 'dataannotation_withdrawal_not_ready',
        logger,
      });
    } catch (error) {
      logger.warning(`Failed to create withdrawal not-ready notification: ${error.message}`);
    }
    logger.warning(`Withdrawal request was not submitted: ${result.status}`);
  } else {
    logger.info('Withdrawal request submitted successfully');
  }

  bridge.publishPayments(publishedPayments);
  bridge.scanRequested.value = true;
  logger.debug('Scheduling sync after withdrawal request');
}

async function handleClaimRequest(client, bridge, claimProjectsLocked, claimRequest, logger) {
  logger.info(`Processing claim project request${claimRequest?.slug ? ` for ${claimRequest.slug}` : ''}`);

  if (claimProjectsLocked) {
    try {
      await createPersistentNotification({
        title: 'Data Annotation Claim Projects Locked',
        message: buildClaimProjectsLockedMessage(),
        notificationId: 'dataannotation_claim_projects_locked',
        logger,
      });
    } catch (error) {
      logger.warning(`Failed to create claim projects locked notification: ${error.message}`);
    }
    logger.warning('Claim project request blocked because the lock is on');
    return;
  }

  if (!claimRequest?.slug) {
    logger.warning('Claim project request missing a project slug');
    return;
  }

  logger.debug('Submitting claim project request through fresh project page check');
  const result = await client.claimProject(claimRequest.slug);

  if (result.status === 'claimed' || result.status === 'already_in_work_mode') {
    logger.info(`Claim project request completed: ${result.status}`);
  } else {
    try {
      await createPersistentNotification({
        title: 'Data Annotation Claim Project Not Ready',
        message: buildClaimNotReadyMessage(result),
        notificationId: 'dataannotation_claim_project_not_ready',
        logger,
      });
    } catch (error) {
      logger.warning(`Failed to create claim project not-ready notification: ${error.message}`);
    }
    logger.warning(`Claim project request was not completed: ${result.status}`);
  }

  logger.debug(`Claim project result page URL: ${result.pageUrl || ''}`);
}

function buildWithdrawalLockedMessage() {
  return 'Withdrawals are currently locked.\n\nTurn off Withdraw Locked, then press Withdraw Funds again.';
}

function buildClaimProjectsLockedMessage() {
  return 'Claim projects are currently locked.\n\nTurn off Claim Projects Locked, then press Claim Project again.';
}

function buildClaimNotReadyMessage(result) {
  if (result?.status === 'screen_too_small') {
    return 'Claim Project is not available right now.\n\nThe task page is still blocked by the screen size requirement.';
  }

  if (result?.status === 'not_found') {
    return 'Claim Project is not available right now.\n\nThe project was not found on the current projects page.';
  }

  if (result?.status === 'wrong_route') {
    return 'Claim Project navigated to an unexpected page.\n\nThe project row did not open a task page.';
  }

  return 'Claim Project is not available right now.\n\nThe project did not open a claimable task page.';
}

function buildWithdrawalNotReadyMessage(payments, reason) {
  if (reason === 'time') {
    const nextWithdrawalText = formatFriendlyDate(payments.next_withdrawal_at);
    return `Withdrawal is not available yet.\n\nNext withdrawal: ${nextWithdrawalText || 'unknown'}.`;
  }

  if (!payments.withdraw_button_present) {
    return 'Withdrawal is not available right now.\n\nThe withdrawal button is not visible on DataAnnotation.';
  }

  return `Withdrawal is not available right now.\n\nAvailable funds: ${payments.available_amount_formatted}.`;
}

function formatFriendlyDate(value) {
  const date = parseDate(value);
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
