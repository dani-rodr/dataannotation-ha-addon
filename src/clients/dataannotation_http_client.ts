// @ts-nocheck
const { extractPaymentsPage, extractProjectsPage } = require('../scrapers/dataannotation_html.ts');

const BASE_URL = 'https://app.dataannotation.tech';
const SIGN_IN_PATH = '/users/sign_in';

class DataAnnotationHttpClient {
  constructor(options = {}) {
    this.email = options.email || '';
    this.password = options.password || '';
    this.baseUrl = options.baseUrl || BASE_URL;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.logger = options.logger || { debug() {}, warning() {} };
    this.cookies = new Map();
    this.authenticityToken = null;
    this.loginPromise = null;
  }

  async getProjects() {
    const response = await this._getAuthenticated('/workers/projects');
    return extractProjectsPage(response.body, response.url);
  }

  async getPayments() {
    const [pageResponse, earningsResponse] = await Promise.all([
      this._getAuthenticated('/workers/payments'),
      this._getAuthenticated('/api_internal/payments/earnings_summary', {
        accept: 'application/json',
      }),
    ]);

    let earningsSummary;
    try {
      earningsSummary = JSON.parse(earningsResponse.body);
    } catch (error) {
      throw new Error(`DataAnnotation earnings response was not valid JSON: ${error.message}`);
    }

    return {
      ...extractPaymentsPage(pageResponse.body, pageResponse.url),
      earningsSummary,
    };
  }

  async _getAuthenticated(path, options = {}) {
    let response = await this._request(path, options);
    if (!isSignInResponse(response)) {
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`DataAnnotation request failed for ${path} with status ${response.status}`);
      }
      return response;
    }

    await this._login();
    response = await this._request(path, options);
    if (isSignInResponse(response)) {
      throw new Error(`DataAnnotation authentication failed for ${path}`);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`DataAnnotation request failed for ${path} with status ${response.status}`);
    }

    return response;
  }

  async _login() {
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = this._performLogin().finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }

  async _performLogin() {
    this.logger.debug('Authenticating DataAnnotation HTTP session');
    const signInResponse = await this._request(SIGN_IN_PATH);
    const authenticityToken = extractAuthenticityToken(signInResponse.body);
    if (!authenticityToken) {
      throw new Error('DataAnnotation sign-in page is missing its authenticity token');
    }

    const body = new URLSearchParams({
      authenticity_token: authenticityToken,
      'user[email]': this.email,
      'user[password]': this.password,
    });
    const response = await this._request(SIGN_IN_PATH, {
      method: 'POST',
      body: body.toString(),
      contentType: 'application/x-www-form-urlencoded',
      redirect: 'manual',
    });

    if (isSignInResponse(response)) {
      throw new Error('DataAnnotation login failed or session was rejected');
    }

    this.authenticityToken = authenticityToken;
  }

  async _request(path, options = {}) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('DataAnnotation HTTP fetch is unavailable');
    }

    const url = new URL(path, this.baseUrl).toString();
    const headers = {
      Accept: options.accept || 'text/html,application/xhtml+xml',
      'User-Agent': 'DataAnnotation-Projects-HA-Addon',
    };
    const cookieHeader = this._cookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }

    const response = await this.fetchImpl(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
      redirect: options.redirect || 'manual',
    });
    this._storeCookies(response.headers);
    const body = await response.text();

    return {
      status: response.status,
      headers: response.headers,
      body,
      url: response.url || url,
    };
  }

  _storeCookies(headers) {
    const values = getSetCookieValues(headers);
    for (const value of values) {
      const pair = String(value).split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }

      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (cookieValue) {
        this.cookies.set(name, cookieValue);
      } else {
        this.cookies.delete(name);
      }
    }
  }

  _cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function getSetCookieValues(headers) {
  if (typeof headers?.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const value = headers?.get?.('set-cookie');
  return value ? String(value).split(/,(?=\s*[^;,=]+=[^;,]+)/) : [];
}

function extractAuthenticityToken(html) {
  const match = String(html || '').match(/<input\b[^>]*name=["']authenticity_token["'][^>]*value=["']([^"']*)["']/i)
    || String(html || '').match(/<meta\b[^>]*name=["']csrf-token["'][^>]*content=["']([^"']*)["']/i);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function isSignInResponse(response) {
  if (response?.status === 401 || response?.status === 403) {
    return true;
  }

  if (response?.status >= 300 && response?.status < 400) {
    return String(response?.headers?.get?.('location') || '').includes('/users/sign_in');
  }

  return String(response?.url || '').includes('/users/sign_in')
    || /<form\b[^>]*action=["'][^"']*\/users\/sign_in/i.test(String(response?.body || ''));
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

module.exports = {
  DataAnnotationHttpClient,
  extractAuthenticityToken,
  isSignInResponse,
};
