const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeApiPayoutEntries,
  parseFundsHistoryEntries,
  selectFundsHistoryEntries,
  summarizeFundsHistoryEntries,
  parseFundsHistoryDetailRow,
  formatPublicPayoutEntries,
} = require('../../../src/scrapers/funds_history');

function localMidnightIsoFrom(now, daysOffset) {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + daysOffset,
    0,
    0,
    0,
    0
  ).toISOString();
}

function localMidnightIsoFromDate(dateValue, daysOffset) {
  const date = new Date(dateValue);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + daysOffset,
    0,
    0,
    0,
    0
  ).toISOString();
}

test('parseFundsHistoryEntries computes hourly payout delay from pending approval rows', () => {
  const entries = parseFundsHistoryEntries([
    'Jun 25 $371.25',
    'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26 $371.25',
    'Task Submission $0.00',
    'Time Entry ··· $371.25 6h 45 min Pending Approval · 1 day ago',
    'Jun 23 $406.09',
    'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26 $406.09',
    'Time Entry ··· $406.09 7h 23 min Pending Approval · 2 days ago',
    'Jun 22 $385.00',
    'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26 $385.00',
    'Time Entry ··· $385.00 7h 0 min Pending Approval · 3 days ago',
  ]);

  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((entry) => entry.kind), ['hourly', 'hourly', 'hourly']);
  assert.deepEqual(entries.map((entry) => entry.days_until_available), [6, 5, 4]);
  assert.equal(entries[0].project.startsWith('Boxing'), true);
});

test('parseFundsHistoryDetailRow ignores paid entries', () => {
  const paid = parseFundsHistoryDetailRow(
    'Task Submission $50.00 Paid · 6 days ago',
    'Example Project'
  );

  assert.equal(paid.status, 'paid');
  assert.equal(paid.kind, 'task');
  assert.equal(paid.amount, '$50.00');
  assert.equal(paid.relative_age_unit, 'day');
});

test('parseFundsHistoryDetailRow parses task pending entries', () => {
  const parsed = parseFundsHistoryDetailRow(
    'Task Submission $50.00 Pending Approval · 1 day ago',
    'Example Project'
  );

  assert.equal(parsed.kind, 'task');
  assert.equal(parsed.days_ago, 1);
  assert.equal(parsed.days_until_available, 2);
  assert.equal(parsed.project, 'Example Project');
});

test('parseFundsHistoryDetailRow uses observed hours for a precise payout estimate', () => {
  const now = new Date('2026-06-28T19:45:00.000Z');
  const parsed = parseFundsHistoryDetailRow(
    'Time Entry ··· $390.50 7h 6 min Pending Approval · 11 hours ago',
    'Example Project',
    new Date('2026-06-28T00:00:00.000Z'),
    now
  );

  assert.equal(parsed.status, 'pending');
  assert.equal(parsed.relative_age_unit, 'hour');
  assert.equal(parsed.estimate_source, 'observed_hours');
  assert.equal(parsed.estimate_confidence, 'high');
  assert.equal(parsed.estimated_payout_at, '2026-07-05T08:45:00.000Z');
});

test('parseFundsHistoryDetailRow uses observed minutes for a precise payout estimate', () => {
  const now = new Date('2026-06-28T19:45:00.000Z');
  const parsed = parseFundsHistoryDetailRow(
    'Task Submission $50.00 Pending Approval · 13 minutes ago',
    'Example Project',
    new Date('2026-06-28T00:00:00.000Z'),
    now
  );

  assert.equal(parsed.status, 'pending');
  assert.equal(parsed.relative_age_unit, 'minute');
  assert.equal(parsed.estimate_source, 'observed_minutes');
  assert.equal(parsed.estimate_confidence, 'high');
  assert.equal(parsed.estimated_payout_at, '2026-07-01T19:32:00.000Z');
});

test('parseFundsHistoryDetailRow falls back to midnight for day-based entries', () => {
  const now = new Date('2026-06-28T19:45:00.000Z');
  const parsed = parseFundsHistoryDetailRow(
    'Time Entry ··· $390.50 7h 6 min Pending Approval · 3 days ago',
    'Example Project',
    new Date('2026-06-25T00:00:00.000Z'),
    now
  );

  assert.equal(parsed.status, 'pending');
  assert.equal(parsed.relative_age_unit, 'day');
  assert.equal(parsed.estimate_source, 'row_date_fallback');
  assert.equal(parsed.estimate_confidence, 'low');
  assert.equal(parsed.estimated_payout_at, localMidnightIsoFromDate('2026-06-25T00:00:00.000Z', 8));
});

test('summarizeFundsHistoryEntries returns the earliest next payout day', () => {
  const now = new Date('2026-06-26T14:05:02.298Z');
  const summary = summarizeFundsHistoryEntries([
    { status: 'pending', days_until_available: 6 },
    { status: 'pending', days_until_available: 2 },
    { status: 'pending', days_until_available: 4 },
    { status: 'paid', days_until_available: 0 },
  ], now);

  assert.equal(summary.next_payout_days, 2);
  assert.equal(summary.next_payout_entries_count, 3);
  assert.equal(summary.next_payout_at, localMidnightIsoFrom(now, 3));
});

test('summarizeFundsHistoryEntries returns the latest paid batch amount', () => {
  const summary = summarizeFundsHistoryEntries([
    {
      status: 'paid',
      amount: '$1.50',
      amount_cents: 150,
      entry_date: '2026-06-24T00:00:00.000Z',
      estimated_payout_at: '2026-06-24T00:00:00.000Z',
    },
    {
      status: 'paid',
      amount: '$2.00',
      amount_cents: 200,
      entry_date: '2026-06-24T00:00:00.000Z',
      estimated_payout_at: '2026-06-24T00:00:00.000Z',
    },
    {
      status: 'paid',
      amount: '$0.75',
      amount_cents: 75,
      entry_date: '2026-06-23T00:00:00.000Z',
      estimated_payout_at: '2026-06-23T00:00:00.000Z',
    },
  ]);

  assert.equal(summary.last_payout_amount_cents, 350);
  assert.equal(summary.last_payout_amount, 3.5);
  assert.equal(summary.last_payout_amount_formatted, '$3.50');
});

test('parseFundsHistoryEntries anchors next payout to the row date', () => {
  const rows = [
    'Jun 20',
    'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26 $331.84',
    'Time Entry ··· $331.84 6h 2 min Pending Approval · 6 days ago',
  ];

  const entries = parseFundsHistoryEntries(rows, new Date(2026, 5, 27, 12, 0, 0, 0));

  assert.equal(entries.length, 1);
  assert.equal(new Date(entries[0].entry_date).getFullYear(), 2026);
  assert.equal(new Date(entries[0].entry_date).getMonth(), 5);
  assert.equal(new Date(entries[0].entry_date).getDate(), 20);
  assert.equal(entries[0].days_until_available, 1);
});

test('normalizeApiPayoutEntries uses exact source timestamps for task and hourly entries', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');
  const entries = normalizeApiPayoutEntries({
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
  }, now);

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

test('selectFundsHistoryEntries keeps the first API sync on legacy page estimates and uses exact timestamps after cutover', () => {
  const firstNow = new Date('2026-08-08T12:00:00.000Z');
  const secondNow = new Date('2026-08-08T12:30:00.000Z');
  const apiEntries = {
    workLogs: [{
      type: 'TaskResponseWorkLog',
      id: 'task-new',
      status: 'Pending Approval',
      amountInCents: 5000,
      createdAt: '2026-08-08T12:10:15.321Z',
      project: { name: 'Example Project' },
    }],
    timedWorkEntries: [],
  };
  const legacyEntry = parseFundsHistoryDetailRow(
    'Task Submission $50.00 Pending Approval · 1 day ago',
    'Example Project',
    new Date('2026-08-07T00:00:00.000Z'),
    firstNow
  );
  const first = selectFundsHistoryEntries([legacyEntry], apiEntries, null, firstNow);
  assert.deepEqual(first.entries, [legacyEntry]);
  assert.equal(first.observations.api_cutover_at, firstNow.toISOString());

  const secondLegacyEntry = parseFundsHistoryDetailRow(
    'Task Submission $50.00 Pending Approval · 1 day ago',
    'Example Project',
    new Date('2026-08-07T00:00:00.000Z'),
    secondNow
  );
  const second = selectFundsHistoryEntries([secondLegacyEntry], apiEntries, first.observations, secondNow);
  assert.equal(second.entries.length, 1);
  assert.equal(second.entries[0].source_entry_id, 'api:TaskResponseWorkLog:task-new');
  assert.equal(second.entries[0].estimated_work_at, '2026-08-08T12:10:15.321Z');
  assert.equal(second.entries[0].estimated_payout_at, '2026-08-11T12:10:15.321Z');
});
