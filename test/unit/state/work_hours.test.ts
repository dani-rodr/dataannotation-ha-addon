const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildWorkHoursSnapshot,
  getWeekStartDate,
  normalizeTimedWorkEntries,
  splitEntryByLocalDay,
} = require('../../../src/state/work_hours.ts');

test('normalizes valid timed entries and rejects invalid durations', () => {
  const entries = normalizeTimedWorkEntries([
    {
      type: 'TimedWorkEntry',
      id: 'one',
      status: 'Pending Approval',
      timeInMinutes: 426,
      createdAt: '2026-08-08T10:15:09.456Z',
      project: { name: 'Hourly Project' },
    },
    { id: 'negative', status: 'Paid', timeInMinutes: -1, createdAt: '2026-08-08T10:00:00Z' },
    { id: 'missing-time', status: 'Paid', createdAt: '2026-08-08T10:00:00Z' },
  ]);

  assert.deepEqual(entries, [{
    source_entry_id: 'api:TimedWorkEntry:one',
    source_created_at: '2026-08-08T10:15:09.456Z',
    duration_minutes: 426,
    project: 'Hourly Project',
    status: 'pending',
  }]);
});

test('splits an interval at local midnight rather than UTC midnight', () => {
  assert.deepEqual(
    splitEntryByLocalDay({ source_created_at: '2026-08-08T17:30:00Z', duration_minutes: 120 }, 'Asia/Manila'),
    [
      { date: '2026-08-08', minutes: 30 },
      { date: '2026-08-09', minutes: 90 },
    ]
  );
});

test('aggregates persisted entries, deduplicates updates, and retains totals on skipped polls', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-work-hours-'));
  const observationsPath = path.join(directory, 'observations.json');
  const now = new Date('2026-08-10T04:00:00Z');
  const entry = {
    type: 'TimedWorkEntry',
    id: 'one',
    status: 'Paid',
    timeInMinutes: 60,
    createdAt: '2026-08-10T03:00:00Z',
    project: { name: 'Hourly Project' },
  };

  try {
    const first = buildWorkHoursSnapshot({
      timedWorkEntries: [entry],
      includeFundsHistory: true,
      sourceComplete: true,
      observationsPath,
      timezone: 'Asia/Manila',
      timezoneSource: 'config',
      weekStart: 'monday',
      now,
    });
    assert.equal(first.work_hours_today_minutes, 60);
    assert.equal(first.work_hours_this_week_minutes, 60);
    assert.equal(first.work_hours_complete, true);
    assert.equal(first.work_hours_stale, false);

    const updated = buildWorkHoursSnapshot({
      timedWorkEntries: [{ ...entry, timeInMinutes: 120 }],
      includeFundsHistory: true,
      sourceComplete: true,
      observationsPath,
      timezone: 'Asia/Manila',
      timezoneSource: 'config',
      weekStart: 'monday',
      now,
    });
    assert.equal(updated.work_hours_today_minutes, 120);
    assert.equal(updated.work_hours_entry_count, 1);

    const skipped = buildWorkHoursSnapshot({
      includeFundsHistory: false,
      observationsPath,
      timezone: 'Asia/Manila',
      timezoneSource: 'config',
      weekStart: 'monday',
      now,
    });
    assert.equal(skipped.work_hours_today_minutes, 120);
    assert.equal(skipped.work_hours_stale, true);
    assert.equal(skipped.work_hours_last_updated, now.toISOString());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('uses the configured week start', () => {
  assert.equal(getWeekStartDate('2026-08-12', 'monday'), '2026-08-10');
  assert.equal(getWeekStartDate('2026-08-12', 'sunday'), '2026-08-09');
});
