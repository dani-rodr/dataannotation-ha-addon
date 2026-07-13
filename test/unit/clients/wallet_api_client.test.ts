// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const { WalletApiClient } = require('../../../src/clients/wallet_api_client.ts');

test('WalletApiClient.findRecordsByNote builds the expected record query', async () => {
  const originalFetch = global.fetch;
  let requestedUrl = null;

  global.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ records: [{ id: 'record-1', note: 'DAWALLET|inc|abc123' }], nextOffset: null }),
      headers: new Headers(),
    };
  };

  try {
    const client = new WalletApiClient('test-token');
    const records = await client.findRecordsByNote({
      accountId: 'account-1',
      noteMarker: 'DAWALLET|inc|abc123',
      paymentType: 'web_payment',
      categoryId: 'cat-1',
      startRecordDate: '2026-07-14T00:00:00.000Z',
      endRecordDate: '2026-07-15T00:00:00.000Z',
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'record-1');
    assert.match(requestedUrl, /\/records\?/);
    assert.match(requestedUrl, /accountId=account-1/);
    assert.match(requestedUrl, /note=contains\.DAWALLET%7Cinc%7Cabc123/);
    assert.match(requestedUrl, /paymentType=web_payment/);
    assert.match(requestedUrl, /categoryId=cat-1/);
    assert.match(requestedUrl, /recordDate=gte\.2026-07-14T00%3A00%3A00\.000Z/);
    assert.match(requestedUrl, /recordDate=lt\.2026-07-15T00%3A00%3A00\.000Z/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('WalletApiClient.deleteRecords sends the record id list contract', async () => {
  const originalFetch = global.fetch;
  let requestedUrl = null;
  let requestedBody = null;

  global.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedBody = options?.body ? JSON.parse(options.body) : null;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ deleted: true }),
      headers: new Headers(),
    };
  };

  try {
    const client = new WalletApiClient('test-token');
    const response = await client.deleteRecords(['record-1', 'record-2']);

    assert.deepEqual(response, { deleted: true });
    assert.match(requestedUrl, /\/records$/);
    assert.deepEqual(requestedBody, { ids: ['record-1', 'record-2'] });
  } finally {
    global.fetch = originalFetch;
  }
});
