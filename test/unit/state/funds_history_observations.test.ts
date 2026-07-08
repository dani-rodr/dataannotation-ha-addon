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
const { parseFundsHistoryDetailRow } = require('../../../src/scrapers/funds_history.ts');

test('funds history observations persist and reuse the original payout estimate', () => {
  const now = new Date('2026-06-28T19:45:00.000Z');
  const laterNow = new Date('2026-06-28T20:45:00.000Z');
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-funds-history-')), 'observations.json');

  const firstEntry = parseFundsHistoryDetailRow(
    'Time Entry ··· $390.50 7h 6 min Pending Approval · 11 hours ago',
    'Example Project',
    new Date('2026-06-28T00:00:00.000Z'),
    now
  );
  const firstResult = applyFundsHistoryObservations([firstEntry], null, now);
  saveFundsHistoryObservations(filePath, firstResult.observations);

  const loaded = loadFundsHistoryObservations(filePath);
  const secondEntry = parseFundsHistoryDetailRow(
    'Time Entry ··· $390.50 7h 6 min Pending Approval · 12 hours ago',
    'Example Project',
    new Date('2026-06-28T00:00:00.000Z'),
    laterNow
  );
  const secondResult = applyFundsHistoryObservations([secondEntry], loaded, laterNow);

  assert.equal(secondResult.entries.length, 1);
  assert.equal(secondResult.entries[0].estimated_payout_at, firstResult.entries[0].estimated_payout_at);
  assert.equal(secondResult.entries[0].first_seen_at, firstResult.entries[0].first_seen_at);
  assert.equal(secondResult.entries[0].estimate_source, 'observed_hours');
});

test('funds history observations preserve minute-based estimates', () => {
  const now = new Date('2026-06-28T19:45:00.000Z');
  const laterNow = new Date('2026-06-28T19:58:00.000Z');
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-funds-history-')), 'observations.json');

  const firstEntry = parseFundsHistoryDetailRow(
    'Task Submission $50.00 Pending Approval · 13 minutes ago',
    'Example Project',
    new Date('2026-06-28T00:00:00.000Z'),
    now
  );
  const firstResult = applyFundsHistoryObservations([firstEntry], null, now);
  saveFundsHistoryObservations(filePath, firstResult.observations);

  const loaded = loadFundsHistoryObservations(filePath);
  const secondEntry = parseFundsHistoryDetailRow(
    'Task Submission $50.00 Pending Approval · 26 minutes ago',
    'Example Project',
    new Date('2026-06-28T00:00:00.000Z'),
    laterNow
  );
  const secondResult = applyFundsHistoryObservations([secondEntry], loaded, laterNow);

  assert.equal(secondResult.entries.length, 1);
  assert.equal(secondResult.entries[0].estimated_payout_at, firstResult.entries[0].estimated_payout_at);
  assert.equal(secondResult.entries[0].estimate_source, 'observed_minutes');
});

test('funds history observations repair persisted minute entries with midnight fallback payouts', () => {
  const now = new Date('2026-06-28T19:58:00.000Z');
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-funds-history-')), 'observations.json');
  const badStore = {
    version: 1,
    entries: {
      '2026-06-28|example project|task submission|$50.00|': {
        fingerprint: '2026-06-28|example project|task submission|$50.00|',
        project: 'Example Project',
        kind: 'task',
        status: 'pending',
        amount: '$50.00',
        amount_cents: 5000,
        duration: null,
        entry_date: '2026-06-28T00:00:00.000Z',
        relative_age_value: 13,
        relative_age_unit: 'minute',
        relative_age_text: '13 minutes ago',
        days_until_available: 3,
        due_days: 3,
        first_seen_at: '2026-06-28T19:45:00.000Z',
        last_seen_at: '2026-06-28T19:45:00.000Z',
        estimated_work_at: '2026-06-28T19:32:00.000Z',
        estimated_payout_at: '2026-07-01T00:00:00.000Z',
        estimate_source: 'observed_minutes',
        estimate_confidence: 'high',
      },
    },
    updated_at: '2026-06-28T19:45:00.000Z',
  };

  saveFundsHistoryObservations(filePath, badStore);
  const loaded = loadFundsHistoryObservations(filePath);
  const repaired = applyFundsHistoryObservations([], loaded, now);

  assert.equal(repaired.observations.entries['2026-06-28|example project|task submission|$50.00|'].estimated_payout_at, '2026-07-01T19:32:00.000Z');
  assert.equal(repaired.observations.entries['2026-06-28|example project|task submission|$50.00|'].estimate_source, 'observed_minutes');
});

test('funds history observations prune stale pending entries after payout passes', () => {
  const now = new Date('2026-06-28T19:45:00.000Z');
  const laterNow = new Date('2026-07-08T19:45:00.000Z');
  const entry = parseFundsHistoryDetailRow(
    'Time Entry ··· $390.50 7h 6 min Pending Approval · 11 hours ago',
    'Example Project',
    new Date('2026-06-28T00:00:00.000Z'),
    now
  );

  const firstResult = applyFundsHistoryObservations([entry], null, now);
  const secondResult = applyFundsHistoryObservations([], firstResult.observations, laterNow);

  assert.equal(Object.keys(secondResult.observations.entries).length, 0);
});
