// @ts-nocheck
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { WalletApiClient } = require('../../src/clients/wallet_api_client.ts');
const { loadWalletLiveCredentials } = require('../helpers/wallet-live-credentials');

const credentials = loadWalletLiveCredentials();
const skipReason = !credentials ? 'missing wallet credentials' : false;

test('Wallet live write creates an income record in Income', { skip: skipReason }, async () => {
  await runRecordScenario({
    scenario: 'income',
    categoryName: 'Income',
    accountName: 'Data Annotation',
    paymentType: 'web_payment',
    recordState: 'cleared',
    amountValue: 0.01,
    amountSign: 1,
    noteSuffix: 'income',
  });
});

test('Wallet live write creates a fee record in Charges, fees', { skip: skipReason }, async () => {
  await runRecordScenario({
    scenario: 'fee',
    categoryName: 'Charges, fees',
    accountName: 'Data Annotation',
    paymentType: 'transfer',
    recordState: 'cleared',
    amountValue: 0.01,
    amountSign: -1,
    noteSuffix: 'fee',
  });
});

test('Wallet live write creates a transfer pair between Data Annotation and GoTyme', { skip: skipReason }, async () => {
  await runTransferScenario();
});

async function runRecordScenario({ scenario, categoryName, accountName, paymentType, recordState, amountValue, amountSign, noteSuffix }) {
  const client = new WalletApiClient(credentials.token);
  const runId = crypto.randomUUID();
  const marker = `[DA-WALLET-LIVE-TEST:${runId}]`;
  const note = `${marker} ${noteSuffix}`;
  const recordDate = new Date();
  const journalPath = buildJournalPath(runId);

  try {
    await recoverWalletJournals(client, journalPath);

    const context = await loadWalletContext(client);
    const account = resolveAccountByName(context.accounts, accountName);
    assert.ok(account, `Wallet account ${accountName} not found`);
    assert.equal(resolveAccountCurrencyCode(account), 'PHP');

    const category = resolveCategoryByName(context.categories, categoryName);
    assert.ok(category, `Wallet category ${categoryName} not found`);

    const created = await client.createRecords({
      accountId: account.id,
      categoryId: category.id,
      amount: { value: amountValue * amountSign, currencyCode: 'PHP' },
      recordDate: recordDate.toISOString(),
      paymentType,
      recordState,
      note,
      counterParty: scenario === 'fee' ? 'PayPal' : 'Data Annotation',
    }, true);

    const createdResult = extractSingleResult(created);
    const createdRecordId = createdResult.id || createdResult.record?.id || null;
    assert.ok(createdRecordId, 'Wallet create response did not return a record id');

    writeJournal(journalPath, {
      runId,
      scenario,
      createdAt: new Date().toISOString(),
      records: [{
        accountId: String(account.id),
        categoryId: String(category.id),
        recordId: String(createdRecordId),
        note,
        amountValue: amountValue * amountSign,
        currencyCode: 'PHP',
        paymentType,
        recordState,
        recordDate: recordDate.toISOString(),
      }],
    });

    const record = await readSingleRecord({
      client,
      accountId: account.id,
      note,
      categoryId: category.id,
      paymentType,
      recordState,
      recordDate,
      amountValue: amountValue * amountSign,
      currencyCode: 'PHP',
      expectedRecordId: createdRecordId,
    });

    assert.equal(record.note, note);
    assert.equal(String(record.categoryId || record.category?.id || ''), String(category.id));

    await client.deleteRecords([createdRecordId]);

    const afterDelete = await client.findRecordsByNote({
      accountId: account.id,
      noteMarker: note,
      paymentType,
      categoryId: category.id,
      startRecordDate: dayRange(recordDate).start,
      endRecordDate: dayRange(recordDate).end,
    });
    assert.equal(afterDelete.some((item) => String(item?.id) === String(createdRecordId)), false);

    fs.rmSync(journalPath, { force: true });
  } finally {
    pruneEmptyJournalDir(path.dirname(journalPath));
  }
}

async function runTransferScenario() {
  const client = new WalletApiClient(credentials.token);
  const runId = crypto.randomUUID();
  const marker = `[DA-WALLET-LIVE-TEST:${runId}]`;
  const note = `${marker} transfer`;
  const recordDate = new Date();
  const journalPath = buildJournalPath(runId);

  try {
    await recoverWalletJournals(client, journalPath);

    const context = await loadWalletContext(client);
    const sourceAccount = resolveAccountByName(context.accounts, 'Data Annotation');
    const mirrorAccount = resolveAccountByName(context.accounts, 'GoTyme');
    assert.ok(sourceAccount, 'Wallet account Data Annotation not found');
    assert.ok(mirrorAccount, 'Wallet account GoTyme not found');
    assert.equal(resolveAccountCurrencyCode(sourceAccount), 'PHP');
    assert.equal(resolveAccountCurrencyCode(mirrorAccount), 'PHP');

    const created = await client.createRecords({
      accountId: sourceAccount.id,
      amount: { value: -0.01, currencyCode: 'PHP' },
      recordDate: recordDate.toISOString(),
      paymentType: 'transfer',
      recordState: 'cleared',
      note,
      counterParty: 'GoTyme',
      transfer: {
        pairingMode: 'new',
        accountId: mirrorAccount.id,
      },
    }, true);

    const createdResult = extractSingleResult(created);
    const sourceRecordId = createdResult.id || createdResult.record?.id || null;
    assert.ok(sourceRecordId, 'Wallet transfer create response did not return a source record id');

    writeJournal(journalPath, {
      runId,
      scenario: 'transfer',
      createdAt: new Date().toISOString(),
      records: [
        {
          accountId: String(sourceAccount.id),
          recordId: String(sourceRecordId),
          note,
          amountValue: -0.01,
          currencyCode: 'PHP',
          paymentType: 'transfer',
          recordState: 'cleared',
          recordDate: recordDate.toISOString(),
        },
        {
          accountId: String(mirrorAccount.id),
          recordId: null,
          note,
          amountValue: 0.01,
          currencyCode: 'PHP',
          paymentType: 'transfer',
          recordState: 'cleared',
          recordDate: recordDate.toISOString(),
        },
      ],
    });

    const sourceRecord = await readSingleRecord({
      client,
      accountId: sourceAccount.id,
      note,
      paymentType: 'transfer',
      recordState: 'cleared',
      recordDate,
      amountValue: -0.01,
      currencyCode: 'PHP',
      expectedRecordId: sourceRecordId,
    });

    const mirrorRecord = await readSingleRecord({
      client,
      accountId: mirrorAccount.id,
      note,
      paymentType: 'transfer',
      recordState: 'cleared',
      recordDate,
      amountValue: 0.01,
      currencyCode: 'PHP',
    });

    assert.equal(sourceRecord.note, note);
    assert.equal(mirrorRecord.note, note);
    assert.equal(sourceRecord.paymentType, 'transfer');
    assert.equal(mirrorRecord.paymentType, 'transfer');
    assert.equal(sourceRecord.recordState, 'cleared');
    assert.equal(mirrorRecord.recordState, 'cleared');
    assert.equal(String(sourceRecord.accountId || sourceRecord.account?.id || ''), String(sourceAccount.id));
    assert.equal(String(mirrorRecord.accountId || mirrorRecord.account?.id || ''), String(mirrorAccount.id));
    assert.equal(normalizeNumber(sourceRecord.amount?.value), -0.01);
    assert.equal(normalizeNumber(mirrorRecord.amount?.value), 0.01);
    assert.equal(normalizeText(sourceRecord.amount?.currencyCode).toUpperCase(), 'PHP');
    assert.equal(normalizeText(mirrorRecord.amount?.currencyCode).toUpperCase(), 'PHP');

    writeJournal(journalPath, {
      runId,
      scenario: 'transfer',
      createdAt: new Date().toISOString(),
      records: [
        {
          accountId: String(sourceAccount.id),
          recordId: String(sourceRecordId),
          note,
          amountValue: -0.01,
          currencyCode: 'PHP',
          paymentType: 'transfer',
          recordState: 'cleared',
          recordDate: recordDate.toISOString(),
        },
        {
          accountId: String(mirrorAccount.id),
          recordId: String(mirrorRecord.id),
          note,
          amountValue: 0.01,
          currencyCode: 'PHP',
          paymentType: 'transfer',
          recordState: 'cleared',
          recordDate: recordDate.toISOString(),
        },
      ],
    });

    await client.deleteRecords([sourceRecord.id, mirrorRecord.id]);

    const sourceAfterDelete = await client.findRecordsByNote({
      accountId: sourceAccount.id,
      noteMarker: note,
      paymentType: 'transfer',
      startRecordDate: dayRange(recordDate).start,
      endRecordDate: dayRange(recordDate).end,
    });
    const mirrorAfterDelete = await client.findRecordsByNote({
      accountId: mirrorAccount.id,
      noteMarker: note,
      paymentType: 'transfer',
      startRecordDate: dayRange(recordDate).start,
      endRecordDate: dayRange(recordDate).end,
    });

    assert.equal(sourceAfterDelete.some((item) => String(item?.id) === String(sourceRecord.id)), false);
    assert.equal(mirrorAfterDelete.some((item) => String(item?.id) === String(mirrorRecord.id)), false);

    fs.rmSync(journalPath, { force: true });
  } finally {
    pruneEmptyJournalDir(path.dirname(journalPath));
  }
}

async function loadWalletContext(client) {
  const [accounts, categories] = await Promise.all([client.fetchAccounts(), client.fetchCategories()]);
  return { accounts, categories };
}

function resolveAccountByName(accounts, name) {
  const target = normalizeText(name).toLowerCase();
  const matches = Array.isArray(accounts)
    ? accounts.filter((account) => normalizeText(account?.name).toLowerCase() === target)
    : [];

  return matches.length === 1 ? matches[0] : null;
}

function resolveCategoryByName(categories, name) {
  const target = normalizeText(name).toLowerCase();
  const matches = Array.isArray(categories)
    ? categories.filter((category) => normalizeText(category?.name).toLowerCase() === target && category?.archived !== true)
    : [];

  return matches.length === 1 ? matches[0] : null;
}

function resolveAccountCurrencyCode(account) {
  const candidate = account?.currencyCode
    || account?.currency
    || account?.baseCurrency
    || account?.initialBalance?.currencyCode
    || account?.balance?.currencyCode
    || account?.currency?.code
    || account?.currency?.currencyCode
    || account?.currency?.isoCode
    || account?.currency?.currency_code
    || account?.currency?.shortCode
    || account?.currency?.name
    || account?.baseCurrency?.code
    || account?.baseCurrency?.currencyCode
    || account?.baseCurrency?.isoCode
    || account?.baseCurrency?.currency_code
    || account?.baseCurrency?.shortCode
    || account?.baseCurrency?.name;

  return normalizeText(candidate).toUpperCase();
}

async function readSingleRecord({ client, accountId, note, paymentType, recordState, recordDate, amountValue, currencyCode, categoryId = null, expectedRecordId = null }) {
  const records = await client.findRecordsByNote({
    accountId,
    noteMarker: note,
    paymentType,
    categoryId,
    startRecordDate: dayRange(recordDate).start,
    endRecordDate: dayRange(recordDate).end,
  });

  const record = expectedRecordId
    ? records.find((item) => String(item?.id) === String(expectedRecordId)) || null
    : records[0] || null;

  assert.ok(record, 'Wallet record was not returned by note search');
  assert.equal(String(record.accountId || record.account?.id || ''), String(accountId));
  assert.equal(normalizeText(record.note), note);
  assert.equal(normalizeText(record.paymentType), paymentType);
  assert.equal(normalizeText(record.recordState), recordState);
  assert.equal(normalizeNumber(record.amount?.value), amountValue);
  assert.equal(normalizeText(record.amount?.currencyCode).toUpperCase(), currencyCode.toUpperCase());

  if (categoryId) {
    assert.equal(String(record.categoryId || record.category?.id || ''), String(categoryId));
  }

  if (expectedRecordId) {
    assert.equal(String(record.id), String(expectedRecordId));
  }

  return record;
}

function buildJournalPath(runId) {
  return path.resolve(process.cwd(), 'data', 'wallet-live-write-journal', `${runId}.json`);
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

    if (!Array.isArray(journal?.records) || journal.records.length === 0) {
      continue;
    }

    const recoveredIds = [];
    for (const entry of journal.records) {
      const recovered = await recoverJournalEntry(client, entry);
      if (!recovered) {
        recoveredIds.length = 0;
        break;
      }

      recoveredIds.push(recovered);
    }

    if (recoveredIds.length !== journal.records.length) {
      continue;
    }

    await client.deleteRecords(recoveredIds);
    fs.rmSync(entryPath, { force: true });
  }
}

async function recoverJournalEntry(client, entry) {
  if (!entry?.accountId || !entry?.recordDate || !entry?.note) {
    return null;
  }

  const recordDate = new Date(entry.recordDate);
  const records = await client.findRecordsByNote({
    accountId: entry.accountId,
    noteMarker: entry.note,
    paymentType: entry.paymentType || 'web_payment',
    categoryId: entry.categoryId || undefined,
    startRecordDate: dayRange(recordDate).start,
    endRecordDate: dayRange(recordDate).end,
  });

  const matches = records.filter((record) => {
    if (normalizeNumber(record.amount?.value) !== normalizeNumber(entry.amountValue)) {
      return false;
    }

    if (normalizeText(record.amount?.currencyCode).toUpperCase() !== normalizeText(entry.currencyCode).toUpperCase()) {
      return false;
    }

    if (normalizeText(record.note) !== normalizeText(entry.note)) {
      return false;
    }

    if (normalizeText(record.paymentType).toLowerCase() !== normalizeText(entry.paymentType || 'web_payment').toLowerCase()) {
      return false;
    }

    if (normalizeText(record.recordState).toLowerCase() !== normalizeText(entry.recordState || 'cleared').toLowerCase()) {
      return false;
    }

    if (entry.categoryId && String(record.categoryId || record.category?.id || '') !== String(entry.categoryId)) {
      return false;
    }

    return !entry.recordId || String(record?.id) === String(entry.recordId);
  });

  const exact = matches.length === 1 ? matches[0] : null;
  if (!exact) {
    return null;
  }

  return String(exact.id);
}

function pruneEmptyJournalDir(dirPath) {
  try {
    if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
      fs.rmdirSync(dirPath);
    }
  } catch {}
}

function dayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function extractSingleResult(response) {
  const results = Array.isArray(response?.results) ? response.results : Array.isArray(response) ? response : [];
  assert.ok(results.length > 0, 'Wallet create response did not include results');
  return results[0];
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
