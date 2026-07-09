// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const { DataAnnotationClient } = require('../../../src/clients/dataannotation_client.ts');

function createPromptPage({ bodyText, buttons }) {
  const buttonNodes = buttons.map((button) => ({
    disabled: Boolean(button.disabled),
    innerText: button.text,
    textContent: button.text,
    getAttribute(name) {
      if (name === 'aria-label') {
        return button.ariaLabel || button.text;
      }

      return null;
    },
    getBoundingClientRect() {
      return { width: 120, height: 24 };
    },
    click() {
      button.clicked = true;
    },
  }));

  const fakeDocument = {
    body: { innerText: bodyText },
    querySelectorAll(selector) {
      if (selector === 'button,[role="button"],input[type="button"],input[type="submit"]') {
        return buttonNodes;
      }

      return [];
    },
  };

  const fakeWindow = {
    getComputedStyle() {
      return { display: 'block', visibility: 'visible', opacity: '1' };
    },
  };

  let evaluateCalls = 0;

  const page = {
    evaluate: async (fn) => {
      evaluateCalls += 1;
      const previousDocument = global.document;
      const previousWindow = global.window;
      global.document = fakeDocument;
      global.window = fakeWindow;

      try {
        return await fn();
      } finally {
        global.document = previousDocument;
        global.window = previousWindow;
      }
    },
  };

  return { page, buttonNodes, buttons, getEvaluateCalls: () => evaluateCalls };
}

test('notification prompt handler clicks the exact DataAnnotation overlay once', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: { debug() {}, info() {}, warning() {}, error() {} },
  });

  const maybeLater = { text: 'Maybe later', clicked: false };
  const allowNotifications = { text: 'Allow notifications', clicked: false };
  const harness = createPromptPage({
    bodyText: 'New projects fill up fast',
    buttons: [maybeLater, allowNotifications],
  });

  const firstResult = await client._handleNotificationPrompt(harness.page, 'projects landing');
  const secondResult = await client._handleNotificationPrompt(harness.page, 'projects landing');

  assert.equal(firstResult, true);
  assert.equal(secondResult, false);
  assert.equal(allowNotifications.clicked, true);
  assert.equal(maybeLater.clicked, false);
  assert.equal(harness.getEvaluateCalls(), 1);
});

test('notification prompt handler ignores unrelated buttons', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: { debug() {}, info() {}, warning() {}, error() {} },
  });

  const allowNotifications = { text: 'Allow notifications', clicked: false };
  const harness = createPromptPage({
    bodyText: 'Welcome back',
    buttons: [allowNotifications],
  });

  const result = await client._handleNotificationPrompt(harness.page, 'projects landing');

  assert.equal(result, false);
  assert.equal(allowNotifications.clicked, false);
  assert.equal(harness.getEvaluateCalls(), 1);
});
