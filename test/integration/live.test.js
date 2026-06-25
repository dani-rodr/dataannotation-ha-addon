const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { DataAnnotationClient } = require('../../src/dataannotation_client');
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
        assert.equal(Object.hasOwn(project, 'id'), false);
      });
    }

    if (result.projects.length === 0) {
      await t.test('no active projects are present', () => {
        assert.deepEqual(result.projects, []);
      });
    }
  } finally {
    await client.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});
