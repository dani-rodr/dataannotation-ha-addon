const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  loadLastPayoutState,
  saveWalletSyncState,
} = require('../../../src/state/wallet_sync_state.ts');

test('wallet sync state recovers a uniquely matching legacy last payout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-wallet-state-'));
  const filePath = path.join(dir, 'state.json');

  try {
    saveWalletSyncState(filePath, {
      version: 4,
      last_seen_last_payout_at: '2026-07-16T11:17:37.000Z',
      withdrawal_events: {
        current: {
          source_type: 'withdrawal',
          source_amount_usd_cents: 50500,
          completed_at: '2026-07-16T11:18:13.000Z',
        },
      },
    });

    assert.deepEqual(loadLastPayoutState(filePath), {
      last_payout_at: '2026-07-16T11:17:37.000Z',
      last_payout_amount_cents: 50500,
      last_payout_amount: 505,
      last_payout_amount_formatted: '$505.00',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('wallet sync state refuses an ambiguous legacy last payout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-wallet-state-'));
  const filePath = path.join(dir, 'state.json');

  try {
    saveWalletSyncState(filePath, {
      version: 4,
      last_seen_last_payout_at: '2026-07-16T11:17:37.000Z',
      withdrawal_events: {
        first: {
          source_type: 'withdrawal',
          source_amount_usd_cents: 50500,
          completed_at: '2026-07-16T11:18:13.000Z',
        },
        second: {
          source_type: 'withdrawal',
          source_amount_usd_cents: 62000,
          completed_at: '2026-07-16T11:19:13.000Z',
        },
      },
    });

    assert.equal(loadLastPayoutState(filePath), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('wallet sync state ignores nearby non-withdrawal events during legacy recovery', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-wallet-state-'));
  const filePath = path.join(dir, 'state.json');

  try {
    saveWalletSyncState(filePath, {
      version: 4,
      last_seen_last_payout_at: '2026-07-16T11:17:37.000Z',
      withdrawal_events: {
        unrelated: {
          source_type: 'income',
          source_amount_usd_cents: 99999,
          completed_at: '2026-07-16T11:18:13.000Z',
        },
        withdrawal: {
          source_type: 'withdrawal',
          source_amount_usd_cents: 50500,
          completed_at: '2026-07-16T11:18:13.000Z',
        },
      },
    });

    assert.deepEqual(loadLastPayoutState(filePath), {
      last_payout_at: '2026-07-16T11:17:37.000Z',
      last_payout_amount_cents: 50500,
      last_payout_amount: 505,
      last_payout_amount_formatted: '$505.00',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('wallet sync state requires an exact payout timestamp for newer withdrawal events', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataannotation-wallet-state-'));
  const filePath = path.join(dir, 'state.json');

  try {
    saveWalletSyncState(filePath, {
      version: 4,
      last_seen_last_payout_at: '2026-07-16T11:17:37.000Z',
      withdrawal_events: {
        wrong_timestamp: {
          source_type: 'withdrawal',
          source_amount_usd_cents: 50500,
          payout_at: '2026-07-16T11:18:37.000Z',
          completed_at: '2026-07-16T11:18:13.000Z',
        },
      },
    });

    assert.equal(loadLastPayoutState(filePath), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
