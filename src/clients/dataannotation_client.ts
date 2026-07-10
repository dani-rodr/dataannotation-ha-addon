const fs = require('fs');
// @ts-nocheck
const { CLAIM_WORK_SCREEN_METRICS, buildClaimProjectTarget } = require('../projects/project_claim.ts');
const { extractProjects } = require('../scrapers/projects.ts');
const { extractTaskStatus } = require('../scrapers/task_status.ts');
const { chooseWithdrawalButton, scrapePayments } = require('../scrapers/payments.ts');
const { DataAnnotationBrowserSession, resolveExecutablePath } = require('./browser_session.ts');

const NULL_LOGGER = {
  debug() {},
  info() {},
  warning() {},
  error() {},
};

const PROJECTS_URL = 'https://app.dataannotation.tech/workers/projects';
const PAYMENTS_URL = 'https://app.dataannotation.tech/workers/payments';
const SIGN_IN_URL = 'https://app.dataannotation.tech/users/sign_in';
const CLAIM_WORK_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

class DataAnnotationClient {
  constructor(options) {
    this.email = options.email;
    this.password = options.password;
    this.profileDir = options.profileDir;
    this.executablePath = options.executablePath || resolveExecutablePath();
    this.logger = options.logger || NULL_LOGGER;
    this.browserSession = new DataAnnotationBrowserSession({
      profileDir: this.profileDir,
      executablePath: this.executablePath,
      logger: this.logger,
    });
    this.notificationPromptHandled = false;
  }

  async close() {
    await this.browserSession.close();
  }

  async collectProjects() {
    const page = await this._newPage();

    try {
      this.logger.debug('Opening DataAnnotation projects page');
      const loginState = await this._ensureAuthenticated(page);
      const props = await this._readWorkerProjectsProps(page);
      this.logger.debug(
        `Raw project payload counts: projects=${countItems(props?.dashboardMerchTargeting?.projects)}, easyProjects=${countItems(props?.dashboardMerchTargeting?.easyProjects)}, reportableProjectsInfo=${countItems(props?.reportableProjectsInfo)}, inProgressTasksInfo=${countItems(props?.inProgressTasksInfo)}`
      );
      if (this.logger.debug) {
        this.logger.debug(`Raw project payload preview: ${describeProjectList('projects', props?.dashboardMerchTargeting?.projects)}${describeProjectList('easyProjects', props?.dashboardMerchTargeting?.easyProjects)}${describeProjectList('reportableProjectsInfo', props?.reportableProjectsInfo)}`);
      }
      const projects = extractProjects(props);
      const taskStatus = extractTaskStatus(props, page.url());
      this.logger.debug(`Scraped ${projects.length} DataAnnotation projects`);
      this.logger.debug(`Normalized projects: ${describeProjectList('selected', projects)}`);

      return {
        authenticated: true,
        loginState,
        projects,
        taskStatus,
        count: projects.length,
        pageUrl: page.url(),
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async collectPayments(options = {}) {
    const page = await this._newPage();

    try {
      this.logger.debug('Opening DataAnnotation payments page');
      await this._loadAuthenticatedPage(page, PAYMENTS_URL, 'div[id="workers/TransferFundsPage-hybrid-root"][data-props]');
      const payments = await scrapePayments(page, {
        includeFundsHistory: options.includeFundsHistory !== false,
        fundsHistoryObservationsPath: options.fundsHistoryObservationsPath || null,
      });
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
      this.logger.debug('Reading fresh withdrawal eligibility snapshot');
      const payments = await scrapePayments(page, { includeFundsHistory: false });
      this.logger.debug(
        `Withdrawal preflight: available=${payments.available_amount_formatted}, canWithdraw=${payments.can_withdraw}, buttonPresent=${payments.withdraw_button_present}, buttonEnabled=${payments.button_enabled}`
      );

      if (!payments.can_withdraw || payments.available_amount <= 0 || !payments.button_enabled) {
        this.logger.debug('Withdrawal preflight rejected before click');
        return {
          status: 'not_available',
          pageUrl: page.url(),
          payments,
        };
      }

      const button = await this._findWithdrawalButton(page, payments.available_amount_cents);
      if (!button) {
        this.logger.debug('Withdrawal button lookup returned no exact match');
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

      this.logger.debug('Waiting for withdrawal navigation to settle');
      await sleep(2000);

      const refreshedPayments = await scrapePayments(page).catch(() => payments);
      this.logger.debug(
        `Withdrawal refresh snapshot: available=${refreshedPayments.available_amount_formatted}, canWithdraw=${refreshedPayments.can_withdraw}`
      );
      return {
        status: 'submitted',
        pageUrl: page.url(),
        payments: refreshedPayments,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async claimProject(projectSlug) {
    const page = await this._newPage();

    try {
      this.logger.debug(`Opening DataAnnotation projects page for claim: ${projectSlug}`);
      await this._applyClaimViewport(page);
      await this._loadAuthenticatedPage(page, PROJECTS_URL, 'div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]');
      this.logger.debug('Reading fresh project list for claim request');
      const projects = await this._scrapeProjects(page);
      const project = projects.find((item) => item.slug === projectSlug);

      if (!project) {
        this.logger.debug('Claim request target project was not found in the active project list');
        return {
          status: 'not_found',
          pageUrl: page.url(),
          projectSlug,
        };
      }

      this.logger.debug(`Claim target fields: slug=${project.slug}, id=${project.id || ''}, name=${project.name}`);
      await this._openProjectsTab(page, project.name);

      const clickResult = await this._clickProjectClaimTarget(page, project);
      this.logger.debug(`Project row click result: ${clickResult.kind || 'none'}${clickResult.href ? ` (${clickResult.href})` : ''}`);

      if (!clickResult.clicked) {
        return {
          status: 'not_found',
          pageUrl: page.url(),
          project,
        };
      }

      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 7000 }).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);

      const pageState = await this._readClaimPageState(page);
      this.logger.debug(`Claim target landed on ${pageState.url}`);

      if (pageState.hasScreenWarning) {
        return {
          status: 'screen_too_small',
          pageUrl: pageState.url,
          project,
          pageState,
        };
      }

      if (/\/workers\/projects\/[^/]+\/report_time(?:\?|$)/.test(pageState.url)) {
        return {
          status: 'wrong_route',
          pageUrl: pageState.url,
          project,
          pageState,
        };
      }

      if (pageState.exitVisible) {
        return {
          status: 'already_in_work_mode',
          pageUrl: pageState.url,
          project,
          pageState,
        };
      }

      if (pageState.enterVisible) {
        const clickedEnter = await this._clickExactVisibleButton(page, 'Enter Work Mode');
        if (!clickedEnter) {
          return {
            status: 'not_available',
            pageUrl: pageState.url,
            project,
            pageState,
          };
        }

        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 7000 }).catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);

        const afterEnter = await this._readClaimPageState(page);
        if (afterEnter.exitVisible) {
          return {
            status: 'claimed',
            pageUrl: afterEnter.url,
            project,
            pageState: afterEnter,
          };
        }

        return {
          status: 'not_available',
          pageUrl: afterEnter.url,
          project,
          pageState: afterEnter,
        };
      }

      return {
        status: 'not_available',
        pageUrl: pageState.url,
        project,
        pageState,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async _ensureAuthenticated(page) {
    await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        () =>
          Boolean(document.querySelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]')) ||
          Boolean(window.location.href.includes('/users/sign_in')),
        { timeout: 30000 }
      )
      .catch(() => {});

    if (this._looksLoggedOut(page)) {
      this.logger.debug('Detected sign-in page, refreshing session');
      await this._login(page);
      await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]', { timeout: 30000 });
      await this._handleNotificationPrompt(page, 'projects landing after login');
      return 'authenticated';
    }

    this.logger.debug('Authenticated session detected, waiting for projects payload');
    await page.waitForSelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]', { timeout: 30000 });
    await this._handleNotificationPrompt(page, 'projects landing');
    return 'authenticated';
  }

  async _loadAuthenticatedPage(page, url, readySelector) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        (selector) => Boolean(document.querySelector(selector)) || Boolean(window.location.href.includes('/users/sign_in')),
        { timeout: 30000 },
        readySelector
      )
      .catch(() => {});

    if (this._looksLoggedOut(page)) {
      this.logger.debug(`Detected sign-in page while loading ${url}, refreshing session`);
      await this._login(page);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(readySelector, { timeout: 30000 });
      await this._handleNotificationPrompt(page, `authenticated load for ${url}`);
      return 'authenticated';
    }

    this.logger.debug(`Authenticated session detected, waiting for payload at ${url}`);
    await page.waitForSelector(readySelector, { timeout: 30000 });
    await this._handleNotificationPrompt(page, `authenticated load for ${url}`);
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

    if (page.url().includes('/users/sign_in')) {
      throw new Error('DataAnnotation login failed or session was rejected');
    }

    await this._handleNotificationPrompt(page, 'login redirect');
  }

  async _handleNotificationPrompt(page, context = 'authenticated page') {
    if (this.notificationPromptHandled) {
      return false;
    }

    this.notificationPromptHandled = true;

    try {
      const result = await page.evaluate(`(() => {
        const normalize = (value) => String(value || '').trim().replace(/\\s+/g, ' ');
        const isVisible = (node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        };

        const bodyText = normalize(document.body?.innerText || '');
        const promptText = 'New projects fill up fast';
        if (!bodyText.includes(promptText)) {
          return { seen: false, clicked: false };
        }

        const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'));
        const target = buttons.find((node) => normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || '') === 'Allow notifications' && !node.disabled && isVisible(node));
        if (!target) {
          return { seen: true, clicked: false };
        }

        target.click();
        return { seen: true, clicked: true };
      })()`);

      if (!result.seen) {
        this.logger.debug(`No notification prompt seen on ${context}`);
        return false;
      }

      if (result.clicked) {
        this.logger.info(`Accepted DataAnnotation notification prompt on ${context}`);
        return true;
      }

      this.logger.warning(`Notification prompt was seen on ${context} but no exact Allow notifications button was found`);
      return false;
    } catch (error) {
      this.logger.warning(`Notification prompt handling failed on ${context}: ${error.message}`);
      return false;
    }
  }

  async _scrapeProjects(page) {
    const props = await this._readWorkerProjectsProps(page);
    return extractProjects(props);
  }

  async _readWorkerProjectsProps(page) {
    this.logger.debug('Reading DataAnnotation project data-props payload');
    const rawProps = await page.$eval('[id="workers/WorkerProjectsTable-hybrid-root"]', (element) => element.getAttribute('data-props') || '{}');
    return JSON.parse(rawProps);
  }

  async _applyClaimViewport(page) {
    await page.setViewport({
      width: CLAIM_WORK_SCREEN_METRICS.width,
      height: CLAIM_WORK_SCREEN_METRICS.height,
      deviceScaleFactor: CLAIM_WORK_SCREEN_METRICS.deviceScaleFactor,
      isMobile: CLAIM_WORK_SCREEN_METRICS.mobile,
      hasTouch: CLAIM_WORK_SCREEN_METRICS.hasTouch,
    });

    const client = await page.target().createCDPSession();
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: CLAIM_WORK_SCREEN_METRICS.width,
      height: CLAIM_WORK_SCREEN_METRICS.height,
      deviceScaleFactor: CLAIM_WORK_SCREEN_METRICS.deviceScaleFactor,
      mobile: CLAIM_WORK_SCREEN_METRICS.mobile,
      screenWidth: CLAIM_WORK_SCREEN_METRICS.screenWidth,
      screenHeight: CLAIM_WORK_SCREEN_METRICS.screenHeight,
      positionX: CLAIM_WORK_SCREEN_METRICS.positionX,
      positionY: CLAIM_WORK_SCREEN_METRICS.positionY,
      dontSetVisibleSize: CLAIM_WORK_SCREEN_METRICS.dontSetVisibleSize,
    });

    await page.setUserAgent(CLAIM_WORK_USER_AGENT);
  }

  async _clickProjectClaimTarget(page, project) {
    const target = buildClaimProjectTarget(project);

    return page.evaluate(({ slug, name, id }) => {
      const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
      const exactName = normalize(name);
      const exactSlug = normalize(slug);
      const exactId = normalize(id);

      const rows = Array.from(document.querySelectorAll('tr'));
      for (const row of rows) {
        const rowText = normalize(row.innerText || row.textContent || '');
        if (!rowText) {
          continue;
        }

        const rowMatches = [exactName, exactSlug, exactId].filter(Boolean).some((needle) => rowText.includes(needle));
        if (!rowMatches) {
          continue;
        }

        const anchors = Array.from(row.querySelectorAll('a[href]'));
        const preferredAnchor = anchors.find((anchor) => normalize(anchor.innerText || anchor.textContent || '') === exactName)
          || anchors.find((anchor) => normalize(anchor.innerText || anchor.textContent || '').includes(exactName))
          || anchors.find((anchor) => {
            const href = normalize(anchor.getAttribute('href') || '');
            return href && !/\/report_time(?:\?|$)/.test(href);
          });

        if (preferredAnchor) {
          preferredAnchor.click();
          return {
            clicked: true,
            kind: 'anchor',
            href: preferredAnchor.getAttribute('href') || '',
          };
        }

        row.click();
        return {
          clicked: true,
          kind: 'row',
          href: '',
        };
      }

      return {
        clicked: false,
        kind: 'none',
        href: '',
      };
    }, target);
  }

  async _openProjectsTab(page, projectName) {
    const clicked = await page.evaluate(() => {
      const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
      const candidates = Array.from(document.querySelectorAll('a,button,[role="tab"]')).filter((node) => {
        const text = normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || '');
        return /^Projects(?:\s+\d+)?$/i.test(text) || /^Projects\b/i.test(text);
      });

      const visibleCandidates = candidates.filter((node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      });

      if (visibleCandidates.length === 0) {
        return false;
      }

      visibleCandidates[0].click();
      return true;
    });

    if (clicked) {
      await page.waitForFunction(
        () => {
          const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
          return Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"],button[aria-selected="true"]')).some((node) => /^Projects(?:\s+\d+)?$/i.test(normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || '')));
        },
        { timeout: 10000 }
      ).catch(() => {});
    }

    return clicked;
  }

  async _readClaimPageState(page) {
    return page.evaluate(() => {
      const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
      const isVisible = (node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      };

      const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'))
        .map((node) => {
          const text = normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || '');
          return {
            text,
            disabled: Boolean(node.disabled),
            visible: isVisible(node),
          };
        })
        .filter((button) => button.visible && button.text);

      const enterButtons = buttons.filter((button) => button.text === 'Enter Work Mode' && !button.disabled);
      const exitButtons = buttons.filter((button) => button.text === 'Exit Work Mode' && !button.disabled);

      return {
        url: location.href,
        title: document.title,
        bodyText: normalize(document.body?.innerText || ''),
        hasScreenWarning:
          document.body?.innerText?.includes('This project requires a minimum screen size of 1024px.') ||
          document.body?.innerText?.includes('The task content has been hidden until you meet the screen size requirement.'),
        enterVisible: enterButtons.length > 0,
        exitVisible: exitButtons.length > 0,
        enterCount: enterButtons.length,
        exitCount: exitButtons.length,
      };
    });
  }

  async _clickExactVisibleButton(page, label) {
    return page.evaluate((targetLabel) => {
      const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
      const isVisible = (node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      };

      const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'));
      const matches = buttons.filter((node) => normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || '') === targetLabel && !node.disabled && isVisible(node));

      if (matches.length !== 1) {
        return false;
      }

      matches[0].click();
      return true;
    }, label);
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
    return this.browserSession.newPage();
  }
}

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

function describeProjectList(label, list, limit = 3) {
  const items = Array.isArray(list) ? list.slice(0, limit) : [];
  if (items.length === 0) {
    return `${label}=[]`;
  }

  const preview = items
    .map((project) => {
      const name = String(project?.name || project?.workerSubtitle || 'Unknown project').trim();
      const id = String(project?.id || project?.slug || '').trim();
      const tasks = String(project?.availableTasksFor ?? project?.tasks ?? '').trim();
      const url = String(project?.url || '').trim();
      const routeHint = url.includes('/report_time') ? ' report_time' : '';
      return `${name}${id ? ` [${id}]` : ''}${tasks ? ` tasks=${tasks}` : ''}${routeHint}`;
    })
    .join(' | ');

  return `${label}=${preview}${countItems(list) > limit ? ` (+${countItems(list) - limit} more)` : ''}; `;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  DataAnnotationClient,
  PROJECTS_URL,
  SIGN_IN_URL,
};
