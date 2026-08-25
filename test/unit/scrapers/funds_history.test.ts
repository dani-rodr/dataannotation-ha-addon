// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeApiPayoutEntries,
  scrapeFundsHistory,
  summarizeFundsHistoryEntries,
  formatPublicPayoutEntries,
} = require('../../../src/scrapers/funds_history');

function recentEntries() {
  return {
    workLogs: [{
      type: 'TaskResponseWorkLog',
      id: 'task-1',
      status: 'Pending Approval',
      amountInCents: 5000,
      createdAt: '2026-08-08T11:42:17.123Z',
      project: { name: 'Example Project' },
    }],
    timedWorkEntries: [{
      type: 'TimedWorkEntry',
      id: 'time-1',
      status: 'Pending Approval',
      amountInCents: 39050,
      timeInMinutes: 426,
      createdAt: '2026-08-08T10:15:09.456Z',
      project: { name: 'Hourly Project' },
    }],
  };
}

test('normalizeApiPayoutEntries uses exact createdAt timestamps', () => {
  const entries = normalizeApiPayoutEntries(recentEntries(), new Date('2026-08-08T12:00:00.000Z'));

  assert.equal(entries.length, 2);
  assert.equal(entries[0].source_entry_id, 'api:TaskResponseWorkLog:task-1');
  assert.equal(entries[0].estimated_work_at, '2026-08-08T11:42:17.123Z');
  assert.equal(entries[0].estimated_payout_at, '2026-08-11T11:42:17.123Z');
  assert.equal(entries[0].estimate_source, 'api_created_at');
  assert.equal(entries[1].source_entry_id, 'api:TimedWorkEntry:time-1');
  assert.equal(entries[1].estimated_work_at, '2026-08-08T10:15:09.456Z');
  assert.equal(entries[1].estimated_payout_at, '2026-08-15T10:15:09.456Z');
  assert.equal(entries[1].duration, '7h 6 min');

  const publicEntries = formatPublicPayoutEntries(entries);
  assert.equal(publicEntries[0].estimated_work_at_iso, '2026-08-08T11:42:17.123Z');
  assert.equal(publicEntries[0].estimated_payout_at_iso, '2026-08-11T11:42:17.123Z');
});

test('API normalization keeps Paid entries and ignores Untransferred entries', () => {
  const entries = normalizeApiPayoutEntries({
    workLogs: [
      { type: 'TaskResponseWorkLog', id: 'paid', status: 'Paid', amountInCents: 100, createdAt: '2026-08-01T00:00:00Z' },
      { type: 'TaskResponseWorkLog', id: 'untransferred', status: 'Untransferred', amountInCents: 200, createdAt: '2026-08-01T00:00:00Z' },
    ],
    timedWorkEntries: [],
  });

  assert.deepEqual(entries.map((entry) => entry.status), ['paid']);
});

test('scrapeFundsHistory returns a complete API-backed summary', async () => {
  const result = await scrapeFundsHistory(recentEntries(), {
    now: new Date('2026-08-08T12:00:00.000Z'),
  });

  assert.equal(result.funds_history_complete, true);
  assert.equal(result.next_payout_entries_count, 2);
  assert.equal(result.next_payout_at, '2026-08-11T11:42:17.123Z');
  assert.equal(result.pending_payout_entries.find((entry) => entry.kind === 'task').estimated_work_at, '2026-08-08T11:42:17.123Z');
  assert.equal(result.work_hours_today_minutes, 426);
  assert.equal(result.work_hours_this_week_minutes, 426);
  assert.equal(result.work_hours_projects[0].project, 'Hourly Project');
});

test('scrapeFundsHistory marks an unavailable API response incomplete without scraping the UI', async () => {
  const result = await scrapeFundsHistory(null, { now: new Date('2026-08-08T12:00:00.000Z') });

  assert.equal(result.funds_history_complete, false);
  assert.deepEqual(result.pending_payout_entries, []);
});

test('summarizeFundsHistoryEntries chooses the earliest exact payout timestamp', () => {
  const summary = summarizeFundsHistoryEntries([
    { status: 'pending', days_until_available: 6, estimated_payout_at: '2026-08-15T10:00:00.000Z' },
    { status: 'pending', days_until_available: 2, estimated_payout_at: '2026-08-11T11:42:17.123Z' },
  ]);

  assert.equal(summary.next_payout_days, 2);
  assert.equal(summary.next_payout_at, '2026-08-11T11:42:17.123Z');
});

test('summarizeFundsHistoryEntries returns the latest paid batch amount', () => {
  const summary = summarizeFundsHistoryEntries([
    { status: 'paid', amount_cents: 150, entry_date: '2026-08-01T00:00:00.000Z' },
    { status: 'paid', amount_cents: 200, entry_date: '2026-08-01T00:00:00.000Z' },
    { status: 'paid', amount_cents: 75, entry_date: '2026-08-02T00:00:00.000Z' },
  ]);

  assert.equal(summary.last_payout_amount_cents, 75);
  assert.equal(summary.last_payout_amount, 0.75);
  assert.equal(summary.last_payout_amount_formatted, '$0.75');
});
