// @ts-nocheck
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { maybeAutoAcceptNewTasks } = require('../../../src/app/commands.ts');

function createLogger() {
  return {
    debug() {},
    info() {},
    warning() {},
    error() {},
  };
}

function createBridge() {
  return {
    publishAutoAcceptState() {},
    scanRequested: { value: false },
  };
}

test('maybeAutoAcceptNewTasks retries a pending project even without a fresh delta', async () => {
  const claimCalls = [];
  const client = {
    async claimProject(slug) {
      claimCalls.push(slug);
      return { status: 'not_available', pageUrl: 'https://app.dataannotation.tech/workers/projects/alpha' };
    },
  };

  const currentProjects = [{ slug: 'alpha', tasks: 2, name: 'Alpha' }];
  const newTaskEvents = [{ slug: 'alpha', added_tasks: 1, current_tasks: 2, name: 'Alpha', url: 'https://app.dataannotation.tech/workers/projects/alpha' }];
  const initial = await maybeAutoAcceptNewTasks({
    bridge: createBridge(),
    client,
    logger: createLogger(),
    autoAcceptEnabled: true,
    claimProjectsLocked: false,
    currentProjects,
    newTaskEvents,
    lastAttemptSignature: null,
    pendingClaimTarget: null,
    pendingClaimAttemptCount: 0,
    pendingClaimAttemptedAt: null,
    taskStatus: {},
  });

  const retry = await maybeAutoAcceptNewTasks({
    bridge: createBridge(),
    client,
    logger: createLogger(),
    autoAcceptEnabled: initial.enabled,
    claimProjectsLocked: false,
    currentProjects,
    newTaskEvents: [],
    lastAttemptSignature: initial.lastAttemptSignature,
    pendingClaimTarget: initial.pendingClaimTarget,
    pendingClaimAttemptCount: initial.pendingClaimAttemptCount,
    pendingClaimAttemptedAt: initial.pendingClaimAttemptedAt,
    taskStatus: {},
  });

  assert.equal(claimCalls.length, 2);
  assert.equal(claimCalls[0].slug, 'alpha');
  assert.equal(claimCalls[1].slug, 'alpha');
  assert.equal(initial.pendingClaimAttemptCount, 1);
  assert.equal(retry.pendingClaimAttemptCount, 2);
  assert.equal(retry.pendingClaimTarget.slug, 'alpha');
});

test('maybeAutoAcceptNewTasks prefers enabled cached projects when multiple new tasks appear', async () => {
  const claimCalls = [];
  const client = {
    async claimProject(project) {
      claimCalls.push(project);
      return { status: 'not_available', pageUrl: 'https://app.dataannotation.tech/workers/projects/alpha' };
    },
  };

  const result = await maybeAutoAcceptNewTasks({
    bridge: createBridge(),
    client,
    logger: createLogger(),
    autoAcceptEnabled: true,
    claimProjectsLocked: false,
    currentProjects: [
      { id: 'alpha-id', slug: 'alpha', tasks: 2, name: 'Alpha' },
      { id: 'beta-id', slug: 'beta', tasks: 2, name: 'Beta' },
    ],
    newTaskEvents: [
      { id: 'alpha-id', slug: 'alpha', added_tasks: 1, current_tasks: 2, name: 'Alpha', url: 'https://app.dataannotation.tech/workers/projects/alpha-id' },
      { id: 'beta-id', slug: 'beta', added_tasks: 1, current_tasks: 2, name: 'Beta', url: 'https://app.dataannotation.tech/workers/projects/beta-id' },
    ],
    autoAcceptProjectCache: {
      projects: {
        'beta-id': { project_id: 'beta-id', enabled: true },
      },
    },
    lastAttemptSignature: null,
    pendingClaimTarget: null,
    pendingClaimAttemptCount: 0,
    pendingClaimAttemptedAt: null,
    taskStatus: {},
  });

  assert.equal(claimCalls.length, 1);
  assert.equal(claimCalls[0].id, 'beta-id');
  assert.equal(result.pendingClaimTarget.id, 'beta-id');
});

test('maybeAutoAcceptNewTasks clears pending state after a successful claim', async () => {
  const originalMkdirSync = fs.mkdirSync;
  const originalWriteFileSync = fs.writeFileSync;
  const client = {
    async claimProject() {
      return { status: 'claimed', pageUrl: 'https://app.dataannotation.tech/workers/projects/alpha' };
    },
  };

  fs.mkdirSync = () => {};
  fs.writeFileSync = () => {};

  try {
    const result = await maybeAutoAcceptNewTasks({
      bridge: createBridge(),
      client,
      logger: createLogger(),
      autoAcceptEnabled: true,
      claimProjectsLocked: false,
      currentProjects: [{ slug: 'alpha', tasks: 2, name: 'Alpha' }],
      newTaskEvents: [{ slug: 'alpha', added_tasks: 1, current_tasks: 2, name: 'Alpha', url: 'https://app.dataannotation.tech/workers/projects/alpha' }],
      lastAttemptSignature: null,
      pendingClaimTarget: { slug: 'alpha', added_tasks: 1, current_tasks: 2, name: 'Alpha', url: 'https://app.dataannotation.tech/workers/projects/alpha' },
      pendingClaimAttemptCount: 1,
      pendingClaimAttemptedAt: Date.now(),
      taskStatus: {},
    });

    assert.equal(result.enabled, false);
    assert.equal(result.lastAttemptSignature, null);
    assert.equal(result.pendingClaimTarget, null);
    assert.equal(result.pendingClaimAttemptCount, 0);
  } finally {
    fs.mkdirSync = originalMkdirSync;
    fs.writeFileSync = originalWriteFileSync;
  }
});

test('maybeAutoAcceptNewTasks preserves pending retries when the project disappears briefly', async () => {
  const client = {
    async claimProject() {
      throw new Error('should not be called');
    },
  };

  const result = await maybeAutoAcceptNewTasks({
    bridge: createBridge(),
    client,
    logger: createLogger(),
    autoAcceptEnabled: true,
    claimProjectsLocked: false,
    currentProjects: [],
    newTaskEvents: [],
    lastAttemptSignature: 'alpha|2|2|Alpha',
    pendingClaimTarget: { slug: 'alpha', added_tasks: 2, current_tasks: 2, name: 'Alpha', url: 'https://app.dataannotation.tech/workers/projects/alpha' },
    pendingClaimAttemptCount: 1,
    pendingClaimAttemptedAt: Date.now(),
    taskStatus: {},
    now: Date.now() + 5000,
  });

  assert.equal(result.lastAttemptSignature, 'alpha|2|2|Alpha');
  assert.equal(result.pendingClaimAttemptCount, 1);
  assert.equal(result.pendingClaimTarget.slug, 'alpha');
});

test('maybeAutoAcceptNewTasks expires pending retries after thirty seconds', async () => {
  let claimCalls = 0;
  const originalMkdirSync = fs.mkdirSync;
  const originalWriteFileSync = fs.writeFileSync;
  const client = {
    async claimProject(slug) {
      claimCalls += 1;
      return { status: 'claimed', pageUrl: `https://app.dataannotation.tech/workers/projects/${slug}` };
    },
  };

  fs.mkdirSync = () => {};
  fs.writeFileSync = () => {};

  try {
    const now = Date.now();
    const result = await maybeAutoAcceptNewTasks({
      bridge: createBridge(),
      client,
      logger: createLogger(),
      autoAcceptEnabled: true,
      claimProjectsLocked: false,
      currentProjects: [{ slug: 'beta', tasks: 3, name: 'Beta' }],
      newTaskEvents: [{ slug: 'beta', added_tasks: 3, current_tasks: 3, name: 'Beta', url: 'https://app.dataannotation.tech/workers/projects/beta' }],
      lastAttemptSignature: 'beta|3|3|Beta',
      pendingClaimTarget: { slug: 'beta', added_tasks: 3, current_tasks: 3, name: 'Beta', url: 'https://app.dataannotation.tech/workers/projects/beta' },
      pendingClaimAttemptCount: 2,
      pendingClaimAttemptedAt: now - 31000,
      taskStatus: {},
      now,
    });

    assert.equal(claimCalls, 1);
    assert.equal(result.enabled, false);
    assert.equal(result.lastAttemptSignature, null);
    assert.equal(result.pendingClaimTarget, null);
  } finally {
    fs.mkdirSync = originalMkdirSync;
    fs.writeFileSync = originalWriteFileSync;
  }
});
