const { convertPaymentsForCurrency, convertProjectsForCurrency, getDisplayCurrency } = require('../state/currency_conversion.ts');
const { detectNewTaskProjects } = require('../projects/project_delta.ts');
const { filterExcludedProjects } = require('../projects/project_filters.ts');
const { summarizeProjects } = require('../scrapers/projects.ts');
const { mergePaymentsWithFundsHistory, pickFundsHistoryFields, retainNextWithdrawalAt } = require('../state/sync_policy.ts');
const { maybeAutoAcceptNewTasks } = require('./commands.ts');

const FUNDS_HISTORY_OBSERVATIONS_PATH = '/data/funds-history-observations.json';

export function getActivePollCron(config: any, fastPollingEnabled: boolean): string {
  return fastPollingEnabled ? config.fast_poll_cron : config.poll_cron;
}

export function republishCurrencyViews(bridge: any, projects: any, payments: any, currencyState: any, scrapedAt = new Date().toISOString()): void {
  if (Array.isArray(projects)) {
    bridge.publishProjects(convertProjectsForCurrency(projects, currencyState), scrapedAt);
  }

  if (payments) {
    bridge.publishPayments(convertPaymentsForCurrency(payments, currencyState), payments.scraped_at || scrapedAt);
  }
}

export async function doSync(
  client: any,
  bridge: any,
  config: any,
  lastSuccessfulSyncAt: any,
  lastSuccessfulProjectCount: number,
  lastSuccessfulTotalTaskCount: number,
  initialSyncCompleted: boolean,
  previousProjects: any,
  lastSuccessfulPayments: any,
  autoAcceptState: any,
  currencyState: any,
  withdrawLocked: boolean,
  includeFundsHistory: boolean,
  lastFundsHistorySnapshot: any,
  logger: any
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
      logger.debug(`Excluded projects: ${excludedProjects.map((project: any) => project.name).join(' | ')}`);
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
      excluded_project_names: excludedProjects.map((project: any) => project.name),
      new_task_detected: newTaskEvents.length > 0,
      new_task_count: newTaskEvents.reduce((sum: number, event: any) => sum + event.added_tasks, 0),
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
    const paymentsForPublish = retainNextWithdrawalAt(mergedPayments, lastSuccessfulPayments, new Date());
    logger.info(`Payments snapshot complete: available=${paymentsForPublish.available_amount_formatted}, canWithdraw=${paymentsForPublish.can_withdraw}`);
    logger.debug(`Payments page URL: ${paymentsForPublish.pageUrl}`);
    if (!includeFundsHistory) {
      logger.debug('Payments snapshot reused last known Funds History fields');
    }
    const publishedPayments = convertPaymentsForCurrency(paymentsForPublish, currencyState);
    bridge.publishPayments(publishedPayments, mergedPayments.scraped_at || completedAt);

    return {
      lastSuccessfulSyncAt: completedAt,
      lastSuccessfulProjectCount: projectSummary.count,
      lastSuccessfulTotalTaskCount: projectSummary.total_tasks,
      projects,
      payments: paymentsForPublish,
      currencyUnit: displayCurrency,
      autoAcceptState: autoAcceptResult,
      fundsHistorySnapshot: includeFundsHistory ? pickFundsHistoryFields(mergedPayments) : null,
      includeFundsHistory,
      taskStatus: result.taskStatus,
      newTaskEvents,
    };
  } catch (error: any) {
    logger.error(`Sync failed: ${error.stack || error.message}`);
    bridge.publishStatusError({
      trigger: 'poll',
      state: 'offline',
      loginState: 'login_failed',
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: lastSuccessfulSyncAt,
      lastError: error.message,
    });
    bridge.publishPublishedProjectAvailability(false);
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
