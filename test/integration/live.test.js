const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { DataAnnotationClient } = require('../../src/clients/dataannotation_client.js');
const { summarizeProjects } = require('../../src/scrapers/projects');
const { loadIntegrationCredentials } = require('../helpers/integration-credentials');

const credentials = loadIntegrationCredentials();

test('live DataAnnotation scrape validates the read-only project shape', { skip: !credentials ? 'missing credentials' : false }, async (t) => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-live-test-'));
  const client = new DataAnnotationClient({
    email: credentials.email,
    password: credentials.password,
    profileDir,
  });

  try {
    const result = await client.collectProjects();

    const source = credentials.source === 'file' ? 'integration.local.json' : 'environment';
    t.diagnostic(`credential source: ${source}`);
    t.diagnostic(`authenticated: ${result.authenticated}`);
    t.diagnostic(`login state: ${result.loginState}`);
    t.diagnostic(`project count: ${result.count}`);
    t.diagnostic(`page url: ${result.pageUrl}`);

    await t.test('authentication succeeds', () => {
      assert.equal(result.authenticated, true);
      assert.equal(result.loginState, 'authenticated');
    });

    await t.test('project list shape is valid', () => {
      assert.equal(typeof result.count, 'number');
      assert.equal(result.count, result.projects.length);
      assert.ok(Array.isArray(result.projects));
    });

    const projectSummary = summarizeProjects(result.projects);
    t.diagnostic(`total tasks: ${projectSummary.total_tasks}`);
    t.diagnostic(`in progress task count: ${result.taskStatus?.in_progress_task_count ?? 0}`);

    await t.test('project task total is valid', () => {
      assert.equal(projectSummary.count, result.projects.length);
      assert.equal(
        projectSummary.total_tasks,
        result.projects.reduce((sum, project) => sum + project.tasks, 0)
      );
    });

    await t.test('task status shape is valid', () => {
      assert.equal(typeof result.taskStatus?.in_progress_task, 'boolean');
      assert.equal(typeof result.taskStatus?.in_progress_task_count, 'number');
      assert.ok(Array.isArray(result.taskStatus?.in_progress_tasks));
      assert.equal(result.taskStatus?.in_progress_task_count, result.taskStatus?.in_progress_tasks.length);
    });

    for (const [index, project] of result.projects.entries()) {
      await t.test(`project ${index} validates`, () => {
        assert.equal(typeof project.name, 'string');
        assert.ok(project.name.length > 0);
        assert.equal(typeof project.tasks, 'number');
        assert.ok(project.tasks >= 0);
        assert.match(project.pay, /^\$\d+\.\d{2}\/hr$/);
        assert.match(project.base_pay, /^\$\d+\.\d{2}\/hr$/);
        assert.match(project.priority_pay, /^\$\d+\.\d{2}\/hr$/);
        assert.ok(Array.isArray(project.tags));
        assert.ok(project.tags.every((tag) => typeof tag === 'string'));
        assert.ok(['project', 'coding', 'qualification'].includes(project.category));
        assert.ok(project.created === null || typeof project.created === 'string');
        assert.equal(typeof project.id, 'string');
        assert.ok(project.url === null || typeof project.url === 'string');
      });
    }

    if (result.projects.length === 0) {
      await t.test('no active projects are present', () => {
        assert.deepEqual(result.projects, []);
      });
    }

    const payments = await client.collectPayments();
    t.diagnostic(`payments page url: ${payments.pageUrl}`);
    t.diagnostic(`available funds: ${payments.available_amount_formatted}`);
    t.diagnostic(`can withdraw: ${payments.can_withdraw}`);
    t.diagnostic(`payment status: ${payments.payment_status}`);
    t.diagnostic(`next payout days: ${payments.next_payout_days}`);
    t.diagnostic(`next payout at: ${payments.next_payout_at}`);
    t.diagnostic(`next payout entries: ${payments.next_payout_entries_count}`);
    t.diagnostic(`next withdrawal at: ${payments.next_withdrawal_at}`);
    t.diagnostic(`next withdrawal text: ${payments.next_withdrawal_text}`);

    await t.test('payments snapshot shape is valid', () => {
      assert.equal(payments.authenticated, true);
      assert.equal(payments.loginState, 'authenticated');
      assert.equal(typeof payments.available_amount, 'number');
      assert.ok(payments.available_amount >= 0);
      assert.equal(typeof payments.can_withdraw, 'boolean');
      assert.equal(typeof payments.button_enabled, 'boolean');
      assert.equal(payments.can_withdraw, payments.button_enabled && payments.available_amount > 0);
      assert.ok(typeof payments.total_earnings === 'number');
      assert.ok(payments.total_earnings >= 0);
      assert.ok(typeof payments.total_paid_out === 'number');
      assert.ok(payments.total_paid_out >= 0);
      assert.ok(typeof payments.this_month === 'number');
      assert.ok(typeof payments.best_month === 'number');
      assert.ok(typeof payments.pending_approval === 'number');
      assert.equal(typeof payments.next_payout_days, 'number');
      assert.ok(payments.next_payout_days >= 0);
      assert.ok(payments.next_payout_at === null || typeof payments.next_payout_at === 'string');
      assert.equal(typeof payments.next_payout_entries_count, 'number');
      assert.ok(Array.isArray(payments.pending_payout_entries));
      assert.equal(payments.next_payout_entries_count, payments.pending_payout_entries.length);
      assert.ok(payments.next_withdrawal_at === null || typeof payments.next_withdrawal_at === 'string');
      assert.ok(payments.last_payout_at === null || typeof payments.last_payout_at === 'string');
      assert.ok(payments.next_withdrawal_text === null || typeof payments.next_withdrawal_text === 'string');
    });
  } finally {
    await client.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});
