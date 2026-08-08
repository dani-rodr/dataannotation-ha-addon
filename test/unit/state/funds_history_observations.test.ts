// @ts-nocheck
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  applyFundsHistoryObservations,
  loadFundsHistoryObservations,
  saveFundsHistoryObservations,
} = require('../../../src/state/funds_history_observations.ts');

function entry(overrides = {}) {
  return {
    project: 'Example Project',
    kind: 'task',
    status: 'pending',
    amount: '$50.00',
    amount_cents: 5000,
    duration: null,
    entry_date: '2026-08-08T00:00:00.000Z',
    relative_age_value: 13,
    relative_age_unit: 'minute',
    relative_age_text: '13 minutes ago',
    days_until_available: 3,
    due_days: 3,
    estimated_work_at: '2026-08-08T11:47:00.000Z',
    estimated_payout_at: '2026-08-11T11:47:00.000Z',
    estimate_source: 'observed_minutes',
    estimate_confidence: 'high',
    ...overrides,
  };
}

test('observations persist and reuse the original payout estimate', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');
  const laterNow = new Date('2026-08-08T13:00:00.000Z');
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-funds-history-')), 'observations.json');

  const firstResult = applyFundsHistoryObservations([entry()], null, now);
  saveFundsHistoryObservations(filePath, firstResult.observations);
  const loaded = loadFundsHistoryObservations(filePath);
  const secondResult = applyFundsHistoryObservations([entry({ relative_age_value: 73 })], loaded, laterNow);

  assert.equal(secondResult.entries[0].estimated_payout_at, firstResult.entries[0].estimated_payout_at);
  assert.equal(secondResult.entries[0].observation_id, firstResult.entries[0].observation_id);
});

test('duplicate legacy rows keep separate observations before API cutover', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');
  const result = applyFundsHistoryObservations([
    entry({ estimated_work_at: '2026-08-08T11:47:00.000Z' }),
    entry({ relative_age_value: 26, relative_age_text: '26 minutes ago', estimated_work_at: '2026-08-08T11:34:00.000Z', estimated_payout_at: '2026-08-11T11:34:00.000Z' }),
  ], null, now);

  assert.equal(new Set(result.entries.map((item) => item.observation_id)).size, 2);
  assert.equal(new Set(result.entries.map((item) => item.estimated_payout_at)).size, 2);
});

test('source API entries get a stable identity on repeated syncs', () => {
  const apiEntry = entry({
    source_entry_id: 'api:TaskResponseWorkLog:future-1',
    source_created_at: '2026-08-08T11:47:00.000Z',
    estimate_source: 'api_created_at',
  });
  const now = new Date('2026-08-08T12:00:00.000Z');
  const first = applyFundsHistoryObservations([apiEntry], { version: 2, entries: {}, api_cutover_at: now.toISOString() }, now);
  const second = applyFundsHistoryObservations([apiEntry], first.observations, new Date('2026-08-08T13:00:00.000Z'));

  assert.equal(first.entries[0].observation_id, second.entries[0].observation_id);
  assert.equal(second.entries[0].source_entry_id, apiEntry.source_entry_id.toLowerCase());
});

test('pre-cutover API entries migrate onto the existing legacy observation ID', () => {
  const cutoff = new Date('2026-08-08T12:00:00.000Z');
  const legacy = entry({ estimated_work_at: '2026-08-08T10:00:00.000Z', estimated_payout_at: '2026-08-11T10:00:00.000Z' });
  const legacyResult = applyFundsHistoryObservations([legacy], null, cutoff);
  const apiEntry = entry({
    source_entry_id: 'api:TaskResponseWorkLog:legacy-1',
    source_created_at: '2026-08-08T10:30:00.000Z',
    estimated_work_at: '2026-08-08T10:30:00.000Z',
    estimated_payout_at: '2026-08-11T10:30:00.000Z',
    estimate_source: 'api_created_at',
  });
  const migrated = applyFundsHistoryObservations([apiEntry], {
    ...legacyResult.observations,
    api_cutover_at: cutoff.toISOString(),
  }, cutoff);

  assert.equal(migrated.entries[0].observation_id, legacyResult.entries[0].observation_id);
  assert.equal(migrated.entries[0].source_entry_id, apiEntry.source_entry_id.toLowerCase());
  assert.equal(migrated.observations.entries[legacyResult.entries[0].observation_id].source_entry_ids.includes(apiEntry.source_entry_id.toLowerCase()), true);
});

test('paid observations are removed while the paid row remains in the current summary', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');
  const pending = entry({ source_entry_id: 'api:TaskResponseWorkLog:paid-1' });
  const first = applyFundsHistoryObservations([pending], { version: 2, entries: {}, api_cutover_at: now.toISOString() }, now);
  const paid = applyFundsHistoryObservations([{ ...pending, status: 'paid' }], first.observations, now);

  assert.equal(paid.entries[0].status, 'paid');
  assert.equal(Object.keys(paid.observations.entries).length, 0);
});

test('persisted observation repair remains compatible with legacy stores', () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-funds-history-')), 'observations.json');
  const id = '2026-08-08|example project|task|$50.00|';
  saveFundsHistoryObservations(filePath, {
    version: 1,
    entries: {
      [id]: {
        fingerprint: id,
        project: 'Example Project',
        kind: 'task',
        status: 'pending',
        amount: '$50.00',
        amount_cents: 5000,
        entry_date: '2026-08-08T00:00:00.000Z',
        due_days: 3,
        first_seen_at: '2026-08-08T11:47:00.000Z',
        last_seen_at: '2026-08-08T11:47:00.000Z',
        estimated_work_at: '2026-08-08T11:47:00.000Z',
        estimated_payout_at: '2026-08-11T00:00:00.000Z',
        estimate_source: 'observed_minutes',
      },
    },
  });
  const loaded = loadFundsHistoryObservations(filePath);

  assert.equal(loaded.entries[id].observation_id, id);
  assert.equal(loaded.entries[id].estimated_payout_at, '2026-08-11T11:47:00.000Z');
});
