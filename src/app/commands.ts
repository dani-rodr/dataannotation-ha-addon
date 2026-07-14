const { createPersistentNotification } = require('../integrations/ha_notifications.ts');
const { saveAutoAcceptState } = require('../state/auto_accept_state.ts');
const { convertPaymentsForCurrency } = require('../state/currency_conversion.ts');
const { retainNextWithdrawalAt } = require('../state/sync_policy.ts');
const { buildClaimNotReadyMessage, buildClaimProjectsLockedMessage, buildWithdrawalLockedMessage, buildWithdrawalNotReadyMessage, parseDate } = require('./messages.ts');

const AUTO_ACCEPT_STATE_PATH = '/data/auto-accept-state.json';

export function buildAutoAcceptSignature(newTaskEvents: unknown): string | null {
  if (!Array.isArray(newTaskEvents) || newTaskEvents.length === 0) {
    return null;
  }

  return newTaskEvents
    .map((event: any) => [event.slug, event.added_tasks, event.current_tasks, event.name].join('|'))
    .join(';;');
}

export async function maybeAutoAcceptNewTasks({
  bridge,
  client,
  logger,
  autoAcceptEnabled,
  claimProjectsLocked,
  newTaskEvents,
  lastAttemptSignature,
  taskStatus,
}: any) {
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

export async function handleWithdrawRequest(client: any, walletSync: any, bridge: any, withdrawLocked: boolean, currencyState: any, lastSuccessfulPayments: any, logger: any) {
  logger.info('Processing withdraw request');

  if (withdrawLocked) {
    try {
      await createPersistentNotification({
        title: 'Data Annotation Withdrawal Locked',
        message: buildWithdrawalLockedMessage(),
        notificationId: 'dataannotation_withdrawal_locked',
        logger,
      });
    } catch (error: any) {
      logger.warning(`Failed to create withdrawal locked notification: ${error.message}`);
    }
    logger.warning('Withdrawal request blocked because the lock is on');
    return;
  }

  logger.debug('Submitting withdrawal request through fresh eligibility check');
  const result = await client.withdrawAvailableFunds();
  const payments = retainNextWithdrawalAt(result.payments || {}, lastSuccessfulPayments || null, new Date());
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
    } catch (error: any) {
      logger.warning(`Failed to create withdrawal not-ready notification: ${error.message}`);
    }
    logger.warning(`Withdrawal request was not submitted: ${result.status}`);
  } else {
    logger.info('Withdrawal request submitted successfully');
    if (walletSync?.recordWithdrawalSubmission) {
      await walletSync.recordWithdrawalSubmission({
        payments,
        currencyState,
        now: new Date(),
      });
    }
  }

  bridge.publishPayments(publishedPayments);
  bridge.scanRequested.value = true;
  logger.debug('Scheduling sync after withdrawal request');
}

export async function handleClaimRequest(client: any, bridge: any, claimProjectsLocked: boolean, claimRequest: any, logger: any) {
  logger.info(`Processing claim project request${claimRequest?.slug ? ` for ${claimRequest.slug}` : ''}`);

  if (claimProjectsLocked) {
    try {
      await createPersistentNotification({
        title: 'Data Annotation Claim Projects Locked',
        message: buildClaimProjectsLockedMessage(),
        notificationId: 'dataannotation_claim_projects_locked',
        logger,
      });
    } catch (error: any) {
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
    } catch (error: any) {
      logger.warning(`Failed to create claim project not-ready notification: ${error.message}`);
    }
    logger.warning(`Claim project request was not completed: ${result.status}`);
  }

  logger.debug(`Claim project result page URL: ${result.pageUrl || ''}`);
}
