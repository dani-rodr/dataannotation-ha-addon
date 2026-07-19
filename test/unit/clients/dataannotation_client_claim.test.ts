// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const { DataAnnotationClient } = require('../../../src/clients/dataannotation_client.ts');

function createLogger() {
  return {
    debug() {},
    info() {},
    warning() {},
    error() {},
  };
}

function createAnchorPage({ anchors, url = 'https://app.dataannotation.tech/workers/projects' }) {
  const anchorNodes = anchors.map((anchor) => {
    anchor.clicked = false;
    return {
    innerText: anchor.text,
    textContent: anchor.text,
    disabled: false,
    clicked: false,
    getAttribute(name) {
      if (name === 'href') {
        return anchor.href;
      }

      if (name === 'aria-label') {
        return anchor.ariaLabel || anchor.text;
      }

      return null;
    },
    getBoundingClientRect() {
      return { width: anchor.visible === false ? 0 : 120, height: anchor.visible === false ? 0 : 24 };
    },
    click() {
      anchor.clicked = true;
      this.clicked = true;
    },
    };
  });

  const fakeDocument = {
    querySelectorAll(selector) {
      if (selector === 'a[href]') {
        return anchorNodes;
      }

      return [];
    },
  };

  const fakeWindow = {
    location: { href: url },
    getComputedStyle(node) {
      const visible = node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      return {
        display: visible ? 'block' : 'none',
        visibility: visible ? 'visible' : 'hidden',
        opacity: visible ? '1' : '0',
      };
    },
  };

  const page = {
    url() {
      return url;
    },
    evaluate: async (fn, arg) => {
      const previousDocument = global.document;
      const previousWindow = global.window;
      global.document = fakeDocument;
      global.window = fakeWindow;

      try {
        return await fn(arg);
      } finally {
        global.document = previousDocument;
        global.window = previousWindow;
      }
    },
  };

  return { page, anchorNodes, anchors };
}

test('claimProject prefers the task-list route and ignores report links', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  const harness = createAnchorPage({
    anchors: [
      { text: 'Open report', href: '/workers/projects/project-alpha/report_time' },
      { text: 'Open details', href: '/workers/projects/project-alpha/details' },
      { text: 'Alpha tasks', href: '/workers/tasks?project_id=project-alpha' },
      { text: 'Alpha', href: '/workers/projects/project-alpha' },
    ],
  });

  const result = await client._clickProjectClaimTarget(harness.page, [
    'https://app.dataannotation.tech/workers/tasks?project_id=project-alpha',
    'https://app.dataannotation.tech/workers/projects?project_id=project-alpha',
    'https://app.dataannotation.tech/workers/projects/project-alpha',
  ]);

  assert.equal(result.clicked, true);
  assert.equal(result.kind, 'anchor');
  assert.equal(result.href, '/workers/tasks?project_id=project-alpha');
  assert.equal(harness.anchors[0].clicked, false);
  assert.equal(harness.anchors[1].clicked, false);
  assert.equal(harness.anchors[2].clicked, true);
  assert.equal(harness.anchors[3].clicked, false);
});

test('claimProject falls back to the projects selection route and then the project detail route', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  const selectionHarness = createAnchorPage({
    anchors: [{ text: 'Alpha selection', href: '/workers/projects?project_id=project-alpha' }],
  });

  const selectionResult = await client._clickProjectClaimTarget(selectionHarness.page, [
    'https://app.dataannotation.tech/workers/tasks?project_id=project-alpha',
    'https://app.dataannotation.tech/workers/projects?project_id=project-alpha',
    'https://app.dataannotation.tech/workers/projects/project-alpha',
  ]);

  assert.equal(selectionResult.clicked, true);
  assert.equal(selectionResult.kind, 'anchor');
  assert.equal(selectionResult.href, '/workers/projects?project_id=project-alpha');
  assert.equal(selectionHarness.anchors[0].clicked, true);

  const detailHarness = createAnchorPage({
    anchors: [{ text: 'Alpha detail', href: '/workers/projects/project-alpha' }],
  });

  const detailResult = await client._clickProjectClaimTarget(detailHarness.page, [
    'https://app.dataannotation.tech/workers/tasks?project_id=project-alpha',
    'https://app.dataannotation.tech/workers/projects?project_id=project-alpha',
    'https://app.dataannotation.tech/workers/projects/project-alpha',
  ]);

  assert.equal(detailResult.clicked, true);
  assert.equal(detailResult.kind, 'anchor');
  assert.equal(detailResult.href, '/workers/projects/project-alpha');
  assert.equal(detailHarness.anchors[0].clicked, true);
});

test('claimProject fails closed when the canonical link is ambiguous', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  const harness = createAnchorPage({
    anchors: [
      { text: 'Alpha', href: '/workers/projects/project-alpha' },
      { text: 'Alpha duplicate', href: '/workers/projects/project-alpha' },
    ],
  });

  const result = await client._clickProjectClaimTarget(harness.page, 'https://app.dataannotation.tech/workers/projects/project-alpha');

  assert.equal(result.clicked, false);
  assert.equal(result.kind, 'ambiguous');
  assert.equal(harness.anchors[0].clicked, false);
  assert.equal(harness.anchors[1].clicked, false);
});

test('claimProject fails closed when the project has no canonical URL', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  let clicked = false;
  client._newPage = async () => ({
    url() {
      return 'https://app.dataannotation.tech/workers/projects';
    },
    close: async () => {},
  });
  client._applyClaimViewport = async () => {};
  client._loadAuthenticatedPage = async () => {};
  client._scrapeProjects = async () => [{ slug: 'alpha', name: 'Alpha', id: '', url: null }];
  client._clickProjectClaimTarget = async () => {
    clicked = true;
    return { clicked: false, kind: 'none', href: '' };
  };

  const result = await client.claimProject('alpha');

  assert.equal(clicked, false);
  assert.equal(result.status, 'not_found');
});

test('claimProject returns null when claim page state does not resolve before timeout', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  const page = {
    evaluate: async () => ({
      url: 'https://app.dataannotation.tech/workers/projects/project-alpha',
      enterVisible: false,
      exitVisible: false,
      hasScreenWarning: false,
    }),
  };

  const result = await client._waitForClaimPageState(page, () => false, 1);

  assert.equal(result, null);
});

test('claimProject uses the task query url for object-based claims', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  const loaded = [];
  client._newPage = async () => ({
    url() {
      return 'https://app.dataannotation.tech/workers/projects';
    },
    close: async () => {},
  });
  client._applyClaimViewport = async () => {};
  client._loadAuthenticatedPage = async (_page, url) => {
    loaded.push(url);
  };
  client._waitForClaimPageState = async () => ({
    url: 'https://app.dataannotation.tech/workers/tasks?project_id=project-alpha',
    enterVisible: false,
    exitVisible: true,
    hasScreenWarning: false,
    hasPageNotFound: false,
    bodyText: 'Exit Work Mode',
  });

  const result = await client.claimProject({ slug: 'alpha', id: 'project-alpha', name: 'Alpha' });

  assert.deepEqual(loaded, ['https://app.dataannotation.tech/workers/tasks?project_id=project-alpha']);
  assert.equal(result.status, 'already_in_work_mode');
});

test('claimProject reuses the direct task route after resolving a slug', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  const loaded = [];
  let clickedProjectLink = false;
  client._newPage = async () => ({
    url() {
      return 'https://app.dataannotation.tech/workers/projects';
    },
    close: async () => {},
  });
  client._applyClaimViewport = async () => {};
  client._loadAuthenticatedPage = async (_page, url) => {
    loaded.push(url);
  };
  client._scrapeProjects = async () => [{ slug: 'alpha', id: 'project-alpha', name: 'Alpha' }];
  client._clickProjectClaimTarget = async () => {
    clickedProjectLink = true;
    return { clicked: false, kind: 'ambiguous', href: '' };
  };
  client._waitForClaimPageState = async () => ({
    url: 'https://app.dataannotation.tech/workers/tasks?project_id=project-alpha',
    enterVisible: false,
    exitVisible: true,
    hasScreenWarning: false,
  });

  const result = await client.claimProject('alpha');

  assert.deepEqual(loaded, [
    'https://app.dataannotation.tech/workers/projects',
    'https://app.dataannotation.tech/workers/tasks?project_id=project-alpha',
  ]);
  assert.equal(clickedProjectLink, false);
  assert.equal(result.status, 'already_in_work_mode');
});

test('claimProject returns not_found immediately for a 404 task route', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  let clicked = false;
  const loaded = [];
  client._newPage = async () => ({
    url() {
      return 'https://app.dataannotation.tech/workers/projects';
    },
    goto: async (url) => {
      loaded.push(url);
      return { status: () => 404 };
    },
    waitForFunction: async () => {},
    waitForSelector: async () => {},
    close: async () => {},
  });
  client._applyClaimViewport = async () => {};
  client._waitForClaimPageState = async () => {
    clicked = true;
    return null;
  };

  const result = await client.claimProject({ slug: 'alpha', id: 'project-alpha', name: 'Alpha' });

  assert.deepEqual(loaded, ['https://app.dataannotation.tech/workers/tasks?project_id=project-alpha']);
  assert.equal(clicked, false);
  assert.equal(result.status, 'not_found');
});

test('claimProject does not treat Page not found text inside a valid task as missing', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  const loaded = [];
  client._newPage = async () => ({
    url() {
      return 'https://app.dataannotation.tech/workers/projects';
    },
    close: async () => {},
  });
  client._applyClaimViewport = async () => {};
  client._loadAuthenticatedPage = async (_page, url) => {
    loaded.push(url);
    return { status: 200 };
  };
  client._waitForClaimPageState = async () => ({
    url: 'https://app.dataannotation.tech/workers/tasks?project_id=project-alpha',
    title: 'DataAnnotation',
    bodyText: 'This task says Page not found in the prompt content',
    hasScreenWarning: false,
    enterVisible: false,
    exitVisible: false,
  });

  const result = await client.claimProject({ slug: 'alpha', id: 'project-alpha', name: 'Alpha' });

  assert.deepEqual(loaded, ['https://app.dataannotation.tech/workers/tasks?project_id=project-alpha']);
  assert.equal(result.status, 'not_available');
});

test('claimProject returns not_available when the task route redirects to the projects dashboard', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
  });

  let clicked = false;
  const loaded = [];
  client._newPage = async () => ({
    url() {
      return 'https://app.dataannotation.tech/workers/projects';
    },
    close: async () => {},
  });
  client._applyClaimViewport = async () => {};
  client._loadAuthenticatedPage = async (_page, url) => {
    loaded.push(url);
  };
  client._waitForClaimPageState = async () => ({
    url: 'https://app.dataannotation.tech/workers/projects?project_id=project-alpha',
    title: 'DataAnnotation',
    bodyText: 'DataAnnotation',
    hasScreenWarning: false,
    hasPageNotFound: false,
    enterVisible: false,
    exitVisible: false,
  });
  client._clickExactVisibleButton = async () => {
    clicked = true;
    return false;
  };

  const result = await client.claimProject({ slug: 'alpha', id: 'project-alpha', name: 'Alpha' });

  assert.deepEqual(loaded, ['https://app.dataannotation.tech/workers/tasks?project_id=project-alpha']);
  assert.equal(clicked, false);
  assert.equal(result.status, 'not_available');
});
