// @ts-nocheck
const test = require('node:test');
const assert = require('node:assert/strict');

const { DataAnnotationClient } = require('../../../src/clients/dataannotation_client');

function createLogger() {
  return { debug() {}, info() {}, warning() {}, error() {} };
}

function createHttpPaymentClient(paymentStatus) {
  return new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
    httpClient: {
      async getPayments() {
        return {
          pageUrl: 'https://app.dataannotation.tech/workers/payments',
          props: {
            paymentStatus,
            totalLifetimeEarnings: 50000,
            unapprovedAmount: 2000,
          },
          buttons: [],
          nextWithdrawalText: '',
          earningsSummary: { totalPaidOut: 30000, currentMonthEarnings: 20000 },
        };
      },
    },
  });
}

test('routine project reads use HTTP without creating a browser page', async () => {
  let browserPages = 0;
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
    httpClient: {
      async getProjects() {
        return {
          pageUrl: 'https://app.dataannotation.tech/workers/projects',
          props: {
            dashboardMerchTargeting: {
              projects: [{ id: 'project-1', name: 'Alpha', availableTasksFor: 2, payPerHourInCents: 2500 }],
              easyProjects: [],
            },
            inProgressTasksInfo: [],
          },
        };
      },
    },
  });
  client.browserSession.newPage = async () => {
    browserPages += 1;
    throw new Error('browser should not be used');
  };

  const result = await client.collectProjects();

  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].name, 'Alpha');
  assert.equal(browserPages, 0);
});

test('HTTP payment read uses the existing payment normalizer without a browser page', async () => {
  let browserPages = 0;
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
    httpClient: {
      async getPayments() {
        return {
          pageUrl: 'https://app.dataannotation.tech/workers/payments',
          props: {
            paymentStatus: { type: 'available', amountInCents: 12500, nextEligibleAt: null },
            totalLifetimeEarnings: 50000,
            unapprovedAmount: 2000,
          },
          buttons: [{
            text: 'Get paid $125.00',
            disabled: false,
            ariaDisabled: '',
            formAction: '/workers/payments/get_paid',
            formMethod: 'post',
          }],
          nextWithdrawalText: 'Next withdrawal: July 4, 2026 at 12:00 AM GMT+0',
          earningsSummary: { totalPaidOut: 30000, currentMonthEarnings: 20000 },
        };
      },
    },
  });
  client.browserSession.newPage = async () => {
    browserPages += 1;
    throw new Error('browser should not be used');
  };

  const result = await client.collectPayments({ includeFundsHistory: false });

  assert.equal(result.available_amount, 125);
  assert.equal(result.pending_approval, 20);
  assert.equal(result.can_withdraw, true);
  assert.equal(browserPages, 0);
});

test('HTTP payment read uses eligible payment status when the withdrawal button is browser-rendered', async () => {
  const client = createHttpPaymentClient({
    type: 'eligible',
    amountInCents: 12500,
    getPayUrl: '/workers/payments/get_paid',
  });

  const result = await client.collectPayments({ includeFundsHistory: false });

  assert.equal(result.can_withdraw, true);
  assert.equal(result.withdraw_button_present, true);
  assert.equal(result.button_enabled, true);
  assert.equal(result.button_text, 'Get paid $125.00');
});

test('HTTP payment read fails closed for ineligible or unexpected payment status', async () => {
  const cases = [
    { type: 'cooldown', amountInCents: 12500, getPayUrl: '/workers/payments/get_paid' },
    { type: 'eligible', amountInCents: 12500, getPayUrl: '/workers/payments/other' },
    { type: 'eligible', amountInCents: 0, getPayUrl: '/workers/payments/get_paid' },
  ];

  for (const paymentStatus of cases) {
    const client = createHttpPaymentClient(paymentStatus);
    const result = await client.collectPayments({ includeFundsHistory: false });
    assert.equal(result.can_withdraw, false);
    assert.equal(result.withdraw_button_present, false);
  }
});

test('HTTP project failure falls back to the existing browser reader', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
    httpClient: {
      async getProjects() {
        throw new Error('HTTP unavailable');
      },
    },
  });
  client._collectProjectsWithBrowser = async () => ({
    authenticated: true,
    loginState: 'authenticated',
    projects: [],
    taskStatus: null,
    count: 0,
    pageUrl: 'browser-fallback',
  });

  const result = await client.collectProjects();

  assert.equal(result.pageUrl, 'browser-fallback');
});

test('full payment reads keep the browser path for Funds History', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
    httpClient: {
      async getPayments() {
        throw new Error('HTTP should not be used for Funds History');
      },
    },
  });
  client._collectPaymentsWithBrowser = async () => ({
    authenticated: true,
    loginState: 'authenticated',
    pageUrl: 'browser-funds-history',
  });

  const result = await client.collectPayments({ includeFundsHistory: true });

  assert.equal(result.pageUrl, 'browser-funds-history');
});

test('payment collection keeps the browser default when Funds History is unspecified', async () => {
  const client = new DataAnnotationClient({
    email: 'user@example.com',
    password: 'secret',
    executablePath: '/usr/bin/google-chrome',
    logger: createLogger(),
    httpClient: {
      async getPayments() {
        throw new Error('HTTP should not be used for the default full read');
      },
    },
  });
  client._collectPaymentsWithBrowser = async () => ({
    authenticated: true,
    loginState: 'authenticated',
    pageUrl: 'browser-default-funds-history',
  });

  const result = await client.collectPayments();

  assert.equal(result.pageUrl, 'browser-default-funds-history');
});
