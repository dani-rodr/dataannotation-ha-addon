// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const { doSync } = require('../../../src/app/sync.ts');

function createBridge() {
  return {
    publishOnline() {},
    publishProfile() {},
    publishWithdrawLockState() {},
    publishSummary() {},
    publishStatusSuccess() {},
    publishProjects() {},
    publishTaskStatus() {},
    publishPayments() {},
    publishStatusError() {},
    publishPublishedProjectAvailability() {},
    scanRequested: { value: false },
  };
}

function createLogger() {
  return {
    debug() {},
    info() {},
    warning() {},
    error() {},
  };
}

test('doSync preserves auto accept retry state when payments scraping fails', async () => {
  const client = {
    async collectProjects() {
      return {
        loginState: 'authenticated',
        pageUrl: 'https://app.dataannotation.tech/workers/projects',
        projects: [{ slug: 'alpha', name: 'Alpha', id: 'project-alpha', url: 'https://app.dataannotation.tech/workers/projects/project-alpha', tasks: 2 }],
        taskStatus: {},
      };
    },
    async claimProject() {
      return { status: 'not_available', pageUrl: 'https://app.dataannotation.tech/workers/projects/project-alpha' };
    },
    async collectPayments() {
      throw new Error('payments failed');
    },
  };

  const result = await doSync(
    client,
    createBridge(),
    { excluded_project_patterns: '', profile: 'Data Annotation', fast_poll_cron: '*/5 * * * * *', poll_cron: '*/5 * * * *', funds_history_cron: '*/30 * * * *' },
    null,
    0,
    0,
    true,
    [],
    null,
    { enabled: true, claimProjectsLocked: false, lastAttemptSignature: null, pendingClaimTarget: null, pendingClaimAttemptCount: 0, pendingClaimAttemptedAt: null },
    null,
    { convert_to_php: false, usd_php_rate: 56, usd_php_rate_source: 'test', usd_php_rate_date: '2026-01-01', usd_php_rate_fetched_at: '2026-01-01T00:00:00.000Z' },
    false,
    false,
    null,
    createLogger()
  );

  assert.equal(result.autoAcceptState.enabled, true);
  assert.equal(result.autoAcceptState.lastAttemptSignature, 'project-alpha|2|2|Alpha');
  assert.equal(result.autoAcceptState.pendingClaimTarget.slug, 'alpha');
  assert.equal(result.autoAcceptState.pendingClaimAttemptCount, 1);
  assert.equal(result.payments, null);
});
