// @ts-nocheck
const { URL } = require('node:url');

const WALLET_BASE_URL = 'https://rest.budgetbakers.com/wallet/v1/api';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PAGES = 50;

class WalletApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WalletApiError';
    this.details = details;
    this.status = details.status || null;
    this.retryAfterSeconds = details.retryAfterSeconds || null;
    this.rateLimitRemaining = details.rateLimitRemaining || null;
    this.rateLimitLimit = details.rateLimitLimit || null;
  }
}

class WalletApiClient {
  constructor(token) {
    this.token = token;
    this.baseUrl = WALLET_BASE_URL;
  }

  async fetchAccounts() {
    return this._collect('accounts', 'accounts');
  }

  async fetchCategories() {
    return this._collect('categories', 'categories');
  }

  async fetchRecords(query = {}) {
    return this._collect('records', 'records', query);
  }

  async findRecordsByNote({ accountId, noteMarker, paymentType = null, categoryId = null, startRecordDate = null, endRecordDate = null }) {
    const query = {
      accountId,
      note: `contains.${noteMarker}`,
      limit: 20,
    };

    if (paymentType) {
      query.paymentType = paymentType;
    }

    if (categoryId) {
      query.categoryId = categoryId;
    }

    if (startRecordDate) {
      query.recordDate = `gte.${startRecordDate}`;
    }

    if (endRecordDate) {
      query.recordDate = query.recordDate ? [query.recordDate, `lt.${endRecordDate}`] : `lt.${endRecordDate}`;
    }

    const records = await this.fetchRecords(query);
    const normalizedMarker = normalizeText(noteMarker);
    return Array.isArray(records)
      ? records.filter((record) => normalizeText(record?.note).includes(normalizedMarker))
      : [];
  }

  async createRecords(records, returnData = true) {
    const response = await this._request('POST', '/records', {
      query: { returnData: returnData ? 'true' : 'false' },
      body: Array.isArray(records) ? records : [records],
    });

    return response.data;
  }

  async patchRecords(records, returnData = true) {
    const recordItems = Array.isArray(records) ? records.map((record) => ({ ...(record || {}) })) : [];
    if (recordItems.length === 0) {
      throw new WalletApiError('Wallet API patchRecords requires at least one record');
    }

    if (recordItems.length > 10) {
      throw new WalletApiError('Wallet API patchRecords supports at most 10 records per request');
    }

    const response = await this._request('PATCH', '/records', {
      query: {
        validation: 'strict',
        returnData: returnData ? 'true' : 'false',
      },
      body: recordItems,
    });

    return response.data;
  }

  async deleteRecords(ids) {
    const recordIds = Array.isArray(ids) ? ids.map((value) => String(value).trim()).filter(Boolean) : [];
    if (recordIds.length === 0) {
      throw new WalletApiError('Wallet API deleteRecords requires at least one record id');
    }

    if (recordIds.length > 10) {
      throw new WalletApiError('Wallet API deleteRecords supports at most 10 record ids per request');
    }

    const response = await this._request('DELETE', '/records', {
      body: { ids: recordIds },
    });

    return response.data;
  }

  async _collect(resource, collectionKey, query = {}, maxPages = DEFAULT_MAX_PAGES) {
    const items = [];
    let offset = 0;
    const seenOffsets = new Set();
    let pageCount = 0;

    while (true) {
      if (seenOffsets.has(offset) || pageCount >= maxPages) {
        break;
      }
      seenOffsets.add(offset);
      pageCount += 1;

      const payload = await this._request('GET', `/${resource}`, {
        query: {
          limit: 200,
          offset,
          agentHints: 'true',
          ...query,
        },
      });

      const pageItems = Array.isArray(payload.data?.[collectionKey]) ? payload.data[collectionKey] : [];
      items.push(...pageItems);

      const nextOffset = payload.data?.nextOffset;
      if (nextOffset === undefined || nextOffset === null) {
        break;
      }

      offset = Number(nextOffset);
      if (!Number.isFinite(offset)) {
        break;
      }
    }

    return items;
  }

  async _request(method, resource, { query = {}, body = null } = {}) {
    const url = new URL(`${this.baseUrl}${resource}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null && item !== '') {
            url.searchParams.append(key, String(item));
          }
        }
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok && response.status !== 207) {
        throw new WalletApiError(`Wallet API ${method} ${resource} failed with ${response.status}`, {
          status: response.status,
          body: data || text || null,
          retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
          rateLimitRemaining: toInt(response.headers.get('x-ratelimit-remaining')),
          rateLimitLimit: toInt(response.headers.get('x-ratelimit-limit')),
        });
      }

      return {
        status: response.status,
        data,
        headers: response.headers,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function parseRetryAfter(value) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((date.getTime() - Date.now()) / 1000));
}

function toInt(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

module.exports = {
  WALLET_BASE_URL,
  WalletApiClient,
  WalletApiError,
};
