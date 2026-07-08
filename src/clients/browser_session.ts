// @ts-nocheck
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');

class DataAnnotationBrowserSession {
  constructor(options) {
    this.profileDir = options.profileDir;
    this.executablePath = options.executablePath || resolveExecutablePath();
    this.logger = options.logger;
    this.browser = null;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async newPage() {
    const browser = await this._browser();
    const page = await browser.newPage();
    await page.evaluate("globalThis.__name = globalThis.__name || ((value) => value)").catch(() => {});
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

module.exports = {
  DataAnnotationBrowserSession,
  resolveExecutablePath,
};
