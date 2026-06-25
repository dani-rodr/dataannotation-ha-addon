const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { DataAnnotationClient } = require('../../src/dataannotation_client');
const { loadIntegrationCredentials } = require('../helpers/integration-credentials');

const credentials = loadIntegrationCredentials();

test('live DataAnnotation scrape validates the read-only project shape', { skip: !credentials ? 'missing credentials' : false }, async () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-live-test-'));
  const client = new DataAnnotationClient({
    email: credentials.email,
    password: credentials.password,
    profileDir,
  });

  try {
    const result = await client.collectProjects();

    assert.equal(result.authenticated, true);
    assert.equal(typeof result.count, 'number');
    assert.equal(result.count, result.projects.length);
    assert.ok(Array.isArray(result.projects));

    for (const project of result.projects) {
      assert.equal(typeof project.name, 'string');
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
    }
  } finally {
    await client.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});
