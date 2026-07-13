// @ts-nocheck
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { WalletApiClient } = require('../../src/clients/wallet_api_client.ts');
const { loadWalletLiveCredentials, WALLET_LIVE_WRITE_CLEANUP_ACK, WALLET_LIVE_WRITE_TEST_ACK } = require('../helpers/wallet-live-credentials');

const credentials = loadWalletLiveCredentials();
const skipReason = !credentials ? 'missing wallet credentials' : credentials.canWrite ? false : 'missing live write acknowledgement';

test('Wallet live write round-trips a uniquely marked record', { skip: skipReason }, async () => {
  assert.equal(credentials.writeAck, WALLET_LIVE_WRITE_TEST_ACK);
  assert.equal(credentials.cleanupAck, WALLET_LIVE_WRITE_CLEANUP_ACK);

  const runId = crypto.randomUUID();
  const marker = `[DA-WALLET-LIVE-TEST:${runId}]`;
  const journalPath = path.resolve(process.cwd(), 'data', 'wallet-live-write-journal', `${runId}.json`);
  const client = new WalletApiClient(credentials.token);
  const recordDate = new Date();
  const amountValue = 0.01;
  const expectedCurrency = 'PHP';
  let createdRecordId = null;
  const recordDateRange = makeDayRange(recordDate);

  try {
    await recoverWalletJournals(client, journalPath);

    const accounts = await client.fetchAccounts();
    const targetAccount = accounts.find((account) => String(account?.id) === credentials.accountId);
    assert.ok(targetAccount, `Wallet account ${credentials.accountId} not found`);

    const incomeCategory = await resolveCategory(client, 'Income');
    assert.ok(incomeCategory, 'Income category not found');

    const created = await client.createRecords({
      accountId: targetAccount.id,
      categoryId: incomeCategory.id,
      amount: { value: amountValue, currencyCode: expectedCurrency },
      recordDate: recordDate.toISOString(),
      paymentType: 'web_payment',
      recordState: 'cleared',
      note: marker,
      counterParty: 'Data Annotation',
    }, true);

    const createdResult = extractSingleResult(created);
    createdRecordId = createdResult.id || createdResult.record?.id || null;
    assert.ok(createdRecordId, 'Wallet create response did not return a record id');

    writeJournal(journalPath, {
      runId,
      marker,
      recordId: createdRecordId,
      accountId: String(targetAccount.id),
      categoryId: String(incomeCategory.id),
      amountValue,
      currencyCode: expectedCurrency,
      paymentType: 'web_payment',
      recordState: 'cleared',
      recordDate: recordDate.toISOString(),
      createdAt: new Date().toISOString(),
    });

    const records = await client.findRecordsByNote({
      accountId: targetAccount.id,
      noteMarker: marker,
      paymentType: 'web_payment',
      categoryId: incomeCategory.id,
      startRecordDate: recordDateRange.start,
      endRecordDate: recordDateRange.end,
    });

    const createdRecord = records.find((record) => String(record?.id) === String(createdRecordId)) || records[0] || null;
    assert.ok(createdRecord, 'Created Wallet record was not found by note search');
    assert.equal(String(createdRecord.id), String(createdRecordId));
    assert.equal(String(createdRecord.accountId || createdRecord.account?.id || ''), String(targetAccount.id));
    assert.equal(normalizeText(createdRecord.note).includes(marker), true);
    assert.equal(normalizeNumber(createdRecord.amount?.value), amountValue);
    assert.equal(normalizeText(createdRecord.amount?.currencyCode).toUpperCase(), expectedCurrency);
    assert.equal(normalizeText(createdRecord.paymentType), 'web_payment');
    assert.equal(normalizeText(createdRecord.recordState), 'cleared');

    await verifyExactRecord(client, {
      accountId: targetAccount.id,
      marker,
      recordId: createdRecordId,
      categoryId: incomeCategory.id,
      paymentType: 'web_payment',
      startRecordDate: recordDateRange.start,
      endRecordDate: recordDateRange.end,
      amountValue,
      currencyCode: expectedCurrency,
    });

    const cleanupRead = await client.findRecordsByNote({
      accountId: targetAccount.id,
      noteMarker: marker,
      paymentType: 'web_payment',
      categoryId: incomeCategory.id,
      startRecordDate: recordDateRange.start,
      endRecordDate: recordDateRange.end,
    });
    assert.ok(cleanupRead.some((record) => String(record?.id) === String(createdRecordId)), 'Record disappeared before cleanup');

    await client.deleteRecords([createdRecordId]);

    const afterDelete = await client.findRecordsByNote({
      accountId: targetAccount.id,
      noteMarker: marker,
      paymentType: 'web_payment',
      categoryId: incomeCategory.id,
      startRecordDate: recordDateRange.start,
      endRecordDate: recordDateRange.end,
    });
    assert.equal(afterDelete.some((record) => String(record?.id) === String(createdRecordId)), false);

    fs.rmSync(journalPath, { force: true });
  } finally {
    pruneEmptyJournalDir(path.dirname(journalPath));
  }
});

async function resolveCategory(client, categoryName) {
  const categories = await client.fetchCategories();
  return categories.find((category) => normalizeText(category?.name).toLowerCase() === normalizeText(categoryName).toLowerCase() && category?.archived !== true) || null;
}

async function verifyExactRecord(client, { accountId, marker, recordId, categoryId, paymentType, startRecordDate, endRecordDate, amountValue, currencyCode }) {
  const records = await client.findRecordsByNote({
    accountId,
    noteMarker: marker,
    paymentType,
    categoryId,
    startRecordDate,
    endRecordDate,
  });

  const record = records.find((item) => String(item?.id) === String(recordId)) || null;
  assert.ok(record, 'Exact Wallet record was not returned by note search');
  assert.equal(String(record.id), String(recordId));
  assert.equal(String(record.accountId || record.account?.id || ''), String(accountId));
  assert.equal(normalizeText(record.note).includes(marker), true);
  assert.equal(normalizeNumber(record.amount?.value), amountValue);
  assert.equal(normalizeText(record.amount?.currencyCode).toUpperCase(), currencyCode);
  assert.equal(normalizeText(record.paymentType), paymentType);
}

function extractSingleResult(response) {
  const results = Array.isArray(response?.results) ? response.results : Array.isArray(response) ? response : [];
  assert.ok(results.length > 0, 'Wallet create response did not include results');
  return results[0];
}

function writeJournal(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

async function recoverWalletJournals(client, journalPath) {
  const dir = path.dirname(journalPath);
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const entryName of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entryName);
    if (!entryName.endsWith('.json') || !fs.statSync(entryPath).isFile()) {
      continue;
    }

    let journal;
    try {
      journal = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
    } catch {
      continue;
    }

    if (!journal?.recordId || !journal?.marker || !journal?.accountId || !journal?.recordDate) {
      continue;
    }

    if (normalizeText(journal.paymentType).toLowerCase() !== 'web_payment') {
      continue;
    }

    if (normalizeText(journal.recordState).toLowerCase() !== 'cleared') {
      continue;
    }

    const bounds = makeDayRange(new Date(journal.recordDate));
    const records = await client.findRecordsByNote({
      accountId: journal.accountId,
      noteMarker: journal.marker,
      paymentType: journal.paymentType,
      categoryId: journal.categoryId || undefined,
      startRecordDate: bounds.start,
      endRecordDate: bounds.end,
    });

    const exact = records.find((record) => String(record?.id) === String(journal.recordId));
    if (!exact) {
      continue;
    }

    if (normalizeNumber(exact.amount?.value) !== normalizeNumber(journal.amountValue)) {
      continue;
    }

    if (normalizeText(exact.amount?.currencyCode).toUpperCase() !== normalizeText(journal.currencyCode).toUpperCase()) {
      continue;
    }

    if (normalizeText(exact.paymentType).toLowerCase() !== normalizeText(journal.paymentType).toLowerCase()) {
      continue;
    }

    if (normalizeText(exact.recordState).toLowerCase() !== normalizeText(journal.recordState).toLowerCase()) {
      continue;
    }

    if (String(exact.categoryId || exact.category?.id || '') !== String(journal.categoryId || '')) {
      continue;
    }

    await client.deleteRecords([journal.recordId]);
    fs.rmSync(entryPath, { force: true });
  }
}

function pruneEmptyJournalDir(dirPath) {
  try {
    if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
      fs.rmdirSync(dirPath);
    }
  } catch {}
}

function makeDayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}
