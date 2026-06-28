const assert = require('node:assert/strict');
const test = require('node:test');

const { parseFundsHistoryEntries, summarizeFundsHistoryEntries, parseFundsHistoryDetailRow } = require('./funds_history');

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
