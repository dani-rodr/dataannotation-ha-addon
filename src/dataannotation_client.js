const fs = require('fs');
const puppeteer = require('puppeteer-core');

const { extractProjects } = require('./scrapers/projects');
const { chooseWithdrawalButton, scrapePayments } = require('./scrapers/payments');

const NULL_LOGGER = {
  debug() {},
  info() {},
  warning() {},
  error() {},
};

const PROJECTS_URL = 'https://app.dataannotation.tech/workers/projects';
const PAYMENTS_URL = 'https://app.dataannotation.tech/workers/payments';
const SIGN_IN_URL = 'https://app.dataannotation.tech/users/sign_in';

class DataAnnotationClient {
  constructor(options) {
    this.email = options.email;
    this.password = options.password;
    this.profileDir = options.profileDir;
    this.executablePath = options.executablePath || resolveExecutablePath();
    this.logger = options.logger || NULL_LOGGER;
    this.browser = null;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async collectProjects() {
    const page = await this._newPage();

    try {
      this.logger.debug('Opening DataAnnotation projects page');
      const loginState = await this._ensureAuthenticated(page);
      const projects = await this._scrapeProjects(page);
      this.logger.debug(`Scraped ${projects.length} DataAnnotation projects`);

      return {
        authenticated: true,
        loginState,
        projects,
        count: projects.length,
        pageUrl: page.url(),
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async collectPayments() {
    const page = await this._newPage();

    try {
      this.logger.debug('Opening DataAnnotation payments page');
      await this._loadAuthenticatedPage(page, PAYMENTS_URL, 'div[id="workers/TransferFundsPage-hybrid-root"][data-props]');
      const payments = await scrapePayments(page);
      this.logger.debug(
        `Scraped payments snapshot: available=${payments.available_amount_formatted}, canWithdraw=${payments.can_withdraw}`
      );

      return {
        authenticated: true,
        loginState: 'authenticated',
        pageUrl: page.url(),
        ...payments,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async withdrawAvailableFunds() {
    const page = await this._newPage();

    try {
      this.logger.debug('Opening DataAnnotation payments page for withdrawal');
      await this._loadAuthenticatedPage(page, PAYMENTS_URL, 'div[id="workers/TransferFundsPage-hybrid-root"][data-props]');
      const payments = await scrapePayments(page, { includeFundsHistory: false });

      if (!payments.can_withdraw || payments.available_amount <= 0 || !payments.button_enabled) {
        return {
          status: 'not_available',
          pageUrl: page.url(),
          payments,
        };
      }

      const button = await this._findWithdrawalButton(page, payments.available_amount_cents);
      if (!button) {
        return {
          status: 'not_available',
          pageUrl: page.url(),
          payments,
        };
      }

      this.logger.info('Clicking DataAnnotation withdrawal button');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {}),
        button.click(),
      ]);

      await sleep(2000);

      const refreshedPayments = await scrapePayments(page).catch(() => payments);
      return {
        status: 'submitted',
        pageUrl: page.url(),
        payments: refreshedPayments,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async _ensureAuthenticated(page) {
    await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    if (this._looksLoggedOut(page)) {
      this.logger.debug('Detected sign-in page, refreshing session');
      await this._login(page);
      await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]', { timeout: 30000 });
      return 'authenticated';
    }

    this.logger.debug('Authenticated session detected, waiting for projects payload');
    await page.waitForSelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]', { timeout: 30000 });
    return 'authenticated';
  }

  async _loadAuthenticatedPage(page, url, readySelector) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    if (this._looksLoggedOut(page)) {
      this.logger.debug(`Detected sign-in page while loading ${url}, refreshing session`);
      await this._login(page);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(readySelector, { timeout: 30000 });
      return 'authenticated';
    }

    this.logger.debug(`Authenticated session detected, waiting for payload at ${url}`);
    await page.waitForSelector(readySelector, { timeout: 30000 });
    return 'authenticated';
  }

  _looksLoggedOut(page) {
    return page.url().includes('/users/sign_in');
  }

  async _login(page) {
    this.logger.debug('Opening sign-in page');
    await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#user_email', { timeout: 30000 });
    await page.type('#user_email', this.email, { delay: 20 });
    await page.type('#user_password', this.password, { delay: 20 });

    const submitSelector = 'form[action$="/users/sign_in"] button[type="submit"]';
    this.logger.debug('Submitting sign-in form');
    const submitButton = (await page.$(submitSelector)) || (await page.$('button[type="submit"]'));
    if (!submitButton) {
      throw new Error('Could not find the DataAnnotation sign-in submit button');
    }
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
      submitButton.click(),
    ]);

    await sleep(2000);

    if (page.url().includes('/users/sign_in')) {
      throw new Error('DataAnnotation login failed or session was rejected');
    }
  }

  async _scrapeProjects(page) {
    this.logger.debug('Reading DataAnnotation project data-props payload');
    const rawProps = await page.$eval(
      'div[id="workers/WorkerProjectsTable-hybrid-root"]',
      (element) => element.getAttribute('data-props') || '{}'
    );

    const props = JSON.parse(rawProps);
    return extractProjects(props);
  }

  async _findWithdrawalButton(page, availableAmountCents = null) {
    const buttons = await page.evaluate(() => {
      const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
      return Array.from(document.querySelectorAll('button')).map((node) => ({
        text: normalizeText(node.innerText || node.textContent || ''),
        disabled: Boolean(node.disabled),
        ariaLabel: normalizeText(node.getAttribute('aria-label') || ''),
        title: normalizeText(node.getAttribute('title') || ''),
        ariaDisabled: normalizeText(node.getAttribute('aria-disabled') || ''),
        formAction: normalizeText(node.form?.getAttribute('action') || ''),
        formMethod: normalizeText(node.form?.getAttribute('method') || ''),
      }));
    });

    const withdrawButton = chooseWithdrawalButton(buttons, availableAmountCents);
    if (!withdrawButton.present || withdrawButton.count !== 1 || !withdrawButton.enabled || !withdrawButton.text) {
      return null;
    }

    const handles = await page.$$('button');
    for (const button of handles) {
      const text = await button.evaluate((node) => (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ')).catch(() => '');
      const disabled = await button.evaluate((node) => Boolean(node.disabled)).catch(() => true);
      if (!disabled && text === withdrawButton.text) {
        return button;
      }
    }

    return null;
  }

  async _newPage() {
    const browser = await this._browser();
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(45000);
    return page;
  }

  async _browser() {
    if (this.browser) {
      return this.browser;
    }

    if (this.profileDir) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }

    if (!this.executablePath) {
      throw new Error('Chromium executable not found in expected locations');
    }

    this.logger.debug(`Launching Chromium: ${this.executablePath}`);
    this.browser = await puppeteer.launch({
      executablePath: this.executablePath,
      headless: 'new',
      userDataDir: this.profileDir,
      ignoreHTTPSErrors: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1440,900',
      ],
    });

    return this.browser;
  }
}

function resolveExecutablePath() {
  const envCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
  ].filter(Boolean);

  for (const candidate of envCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const candidates = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  DataAnnotationClient,
  PROJECTS_URL,
  SIGN_IN_URL,
};
