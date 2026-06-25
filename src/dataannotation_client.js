const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const { extractProjects } = require('./scrapers/projects');

const PROJECTS_URL = 'https://app.dataannotation.tech/workers/projects';
const SIGN_IN_URL = 'https://app.dataannotation.tech/users/sign_in';

class DataAnnotationClient {
  constructor(options) {
    this.email = options.email;
    this.password = options.password;
    this.profileDir = options.profileDir;
    this.executablePath = options.executablePath || resolveExecutablePath();
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
      const loginState = await this._ensureAuthenticated(page);
      const projects = await this._scrapeProjects(page);

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

  async _ensureAuthenticated(page) {
    await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    if (this._looksLoggedOut(page)) {
      await this._login(page);
      await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]', { timeout: 30000 });
      return 'authenticated';
    }

    await page.waitForSelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]', { timeout: 30000 });
    return 'authenticated';
  }

  _looksLoggedOut(page) {
    return page.url().includes('/users/sign_in');
  }

  async _login(page) {
    await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#user_email', { timeout: 30000 });
    await page.type('#user_email', this.email, { delay: 20 });
    await page.type('#user_password', this.password, { delay: 20 });

    const submitSelector = 'form[action$="/users/sign_in"] button[type="submit"]';
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
      page.click(submitSelector),
    ]);

    await page.waitForTimeout(2000);

    if (page.url().includes('/users/sign_in')) {
      throw new Error('DataAnnotation login failed or session was rejected');
    }
  }

  async _scrapeProjects(page) {
    const rawProps = await page.$eval(
      'div[id="workers/WorkerProjectsTable-hybrid-root"]',
      (element) => element.getAttribute('data-props') || '{}'
    );

    const props = JSON.parse(rawProps);
    return extractProjects(props);
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

module.exports = {
  DataAnnotationClient,
  PROJECTS_URL,
  SIGN_IN_URL,
};
