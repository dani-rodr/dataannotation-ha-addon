// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const { mergePersistedLastPayoutState } = require('../../../src/app/dataannotation_app.ts');

test('persisted Last Payout merge keeps the newer timestamp and amount', () => {
  const merged = mergePersistedLastPayoutState(
    {
      next_withdrawal_at: '2026-07-29T15:00:00.000Z',
      last_payout_at: '2026-07-28T15:31:49.000Z',
      last_payout_amount_cents: 5048822,
      last_payout_amount: 50488.22,
      last_payout_amount_formatted: 'PHP 50,488.22',
    },
    {
      last_payout_at: '2026-07-25T15:31:40.000Z',
      last_payout_amount_cents: 122625,
      last_payout_amount: 1226.25,
      last_payout_amount_formatted: '$1,226.25',
    }
  );

  assert.equal(merged.last_payout_at, '2026-07-28T15:31:49.000Z');
  assert.equal(merged.last_payout_amount_cents, 5048822);
  assert.equal(merged.last_payout_amount, 50488.22);
});

test('persisted Last Payout merge clears conflicting amounts for the same timestamp', () => {
  const merged = mergePersistedLastPayoutState(
    {
      last_payout_at: '2026-07-28T15:31:49.000Z',
      last_payout_amount_cents: 5048822,
      last_payout_amount: 50488.22,
    },
    {
      last_payout_at: '2026-07-28T15:31:49.000Z',
      last_payout_amount_cents: 122625,
      last_payout_amount: 1226.25,
    }
  );

  assert.equal(merged.last_payout_at, '2026-07-28T15:31:49.000Z');
  assert.equal(merged.last_payout_amount_cents, null);
  assert.equal(merged.last_payout_amount, null);
  assert.equal(merged.last_payout_amount_formatted, null);
});

test('persisted Last Payout merge accepts a newer Wallet payout state', () => {
  const merged = mergePersistedLastPayoutState(
    {
      last_payout_at: '2026-07-25T15:31:40.000Z',
      last_payout_amount_cents: 122625,
    },
    {
      last_payout_at: '2026-07-28T15:31:49.000Z',
      last_payout_amount_cents: 81875,
      last_payout_amount: 818.75,
      last_payout_amount_formatted: '$818.75',
    }
  );

  assert.equal(merged.last_payout_at, '2026-07-28T15:31:49.000Z');
  assert.equal(merged.last_payout_amount_cents, 81875);
  assert.equal(merged.last_payout_amount, 818.75);
});
