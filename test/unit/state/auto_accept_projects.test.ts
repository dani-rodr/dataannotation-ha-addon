// @ts-nocheck
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  clearAutoAcceptProjectCache,
  loadAutoAcceptProjects,
  pruneExpiredAutoAcceptProjects,
  saveAutoAcceptProjects,
  setAutoAcceptProjectEnabled,
  upsertAutoAcceptProject,
} = require('../../../src/state/auto_accept_projects.ts');

function tempFilePath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-auto-accept-projects-')), name);
}

test('auto accept project cache round-trips through disk', () => {
  const filePath = tempFilePath('cache.json');
  const now = new Date('2026-07-16T10:00:00.000Z');

  const cache = upsertAutoAcceptProject(
    { version: 1, projects: {}, updated_at: null },
    { id: 'project-alpha', slug: 'alpha', name: 'Alpha', url: 'https://app.dataannotation.tech/workers/projects/project-alpha' },
    true,
    now
  );
  saveAutoAcceptProjects(filePath, cache, now);

  const loaded = loadAutoAcceptProjects(filePath, now);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.projects['project-alpha'].enabled, true);
  assert.equal(loaded.projects['project-alpha'].last_seen_name, 'Alpha');
});

test('auto accept project cache prunes stale entries and clears cleanly', () => {
  const now = new Date('2026-07-16T10:00:00.000Z');
  const stale = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

  const cache = {
    version: 1,
    updated_at: stale.toISOString(),
    projects: {
      'project-alpha': {
        project_id: 'project-alpha',
        enabled: true,
        last_seen_name: 'Alpha',
        last_seen_slug: 'alpha',
        last_seen_url: 'https://app.dataannotation.tech/workers/projects/project-alpha',
        first_seen_at: stale.toISOString(),
        last_seen_at: stale.toISOString(),
      },
    },
  };

  const pruned = pruneExpiredAutoAcceptProjects(cache, now);
  assert.deepEqual(pruned.projects, {});

  const cleared = clearAutoAcceptProjectCache(cache, now);
  assert.deepEqual(cleared.projects, {});
  assert.equal(cleared.version, 1);
});

test('auto accept project cache updates enabled state only for known ids', () => {
  const now = new Date('2026-07-16T10:00:00.000Z');
  const seeded = upsertAutoAcceptProject(
    { version: 1, projects: {}, updated_at: null },
    { id: 'project-alpha', slug: 'alpha', name: 'Alpha', url: 'https://app.dataannotation.tech/workers/projects/project-alpha' },
    false,
    now
  );
  const enabled = setAutoAcceptProjectEnabled(seeded, 'project-alpha', true, now);
  assert.equal(enabled.projects['project-alpha'].enabled, true);

  const unchanged = setAutoAcceptProjectEnabled(seeded, 'missing', true, now);
  assert.equal(unchanged.projects['project-alpha'].enabled, false);
});
