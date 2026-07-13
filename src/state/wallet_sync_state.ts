// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_WALLET_SYNC_STATE = {
  version: 2,
  created_at: null,
  updated_at: null,
  first_sync_completed_at: null,
  wallet_api_retry_after_at: null,
  wallet_api_failure_count: 0,
  wallet_api_last_error: null,
  last_seen_last_payout_at: null,
  last_seen_available_amount_cents: null,
  last_seen_available_amount: null,
  imported_funds_entries: {},
  withdrawal_events: {},
};

function loadWalletSyncState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return cloneWalletSyncState(DEFAULT_WALLET_SYNC_STATE);
  }

  try {
    return normalizeWalletSyncState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return cloneWalletSyncState(DEFAULT_WALLET_SYNC_STATE);
  }
}

function saveWalletSyncState(filePath, state) {
  if (!filePath) {
    return;
  }

  const normalized = normalizeWalletSyncState(state);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2));
  fs.renameSync(tempPath, filePath);
}

function normalizeWalletSyncState(value) {
  const payload = value && typeof value === 'object' ? value : {};
  const version = normalizeNumber(payload.version) || 2;
  return {
    version,
    created_at: normalizeIsoDate(payload.created_at) || null,
    updated_at: normalizeIsoDate(payload.updated_at) || null,
    first_sync_completed_at: normalizeIsoDate(payload.first_sync_completed_at) || null,
    wallet_api_retry_after_at: normalizeIsoDate(payload.wallet_api_retry_after_at) || null,
    wallet_api_failure_count: normalizeNumber(payload.wallet_api_failure_count) || 0,
    wallet_api_last_error: normalizeText(payload.wallet_api_last_error),
    last_seen_last_payout_at: normalizeIsoDate(payload.last_seen_last_payout_at) || null,
    last_seen_available_amount_cents: normalizeNumber(payload.last_seen_available_amount_cents),
    last_seen_available_amount: normalizeNumber(payload.last_seen_available_amount),
    imported_funds_entries: normalizeEntryMap(payload.imported_funds_entries),
    withdrawal_events: normalizeEntryMap(payload.withdrawal_events),
  };
}

function normalizeEntryMap(value) {
  const entries = value && typeof value === 'object' ? value : {};
  const normalized = {};

  for (const [key, entry] of Object.entries(entries)) {
    const normalizedEntry = normalizeLedgerEntry(key, entry);
    if (normalizedEntry) {
      normalized[key] = normalizedEntry;
    }
  }

  return normalized;
}

function normalizeLedgerEntry(key, value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const feeRecordId = normalizeText(value.fee_record_id) || normalizeText(value.record_id);
  const transferRecordId = normalizeText(value.transfer_record_id) || normalizeText(value.mirror_record_id);

  return {
    key: String(value.key || key || '').trim(),
    note_marker: normalizeText(value.note_marker),
    source_marker: normalizeText(value.source_marker),
    fee_record_id: feeRecordId,
    transfer_record_id: transferRecordId,
    record_id: feeRecordId,
    mirror_record_id: transferRecordId,
    source_fingerprint: normalizeText(value.source_fingerprint),
    source_type: normalizeText(value.source_type),
    source_amount_usd_cents: normalizeNumber(value.source_amount_usd_cents),
    source_amount_php_cents: normalizeNumber(value.source_amount_php_cents),
    source_fee_usd_cents: normalizeNumber(value.source_fee_usd_cents),
    source_fee_php_cents: normalizeNumber(value.source_fee_php_cents),
    source_net_usd_cents: normalizeNumber(value.source_net_usd_cents),
    source_net_php_cents: normalizeNumber(value.source_net_php_cents),
    source_rate: normalizeNumber(value.source_rate),
    created_at: normalizeIsoDate(value.created_at) || null,
    completed_at: normalizeIsoDate(value.completed_at) || null,
    last_attempt_at: normalizeIsoDate(value.last_attempt_at) || null,
    attempt_count: normalizeNumber(value.attempt_count) || 0,
    last_error: normalizeText(value.last_error),
  };
}

function cloneWalletSyncState(value) {
  return normalizeWalletSyncState(JSON.parse(JSON.stringify(value)));
}

function normalizeIsoDate(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

module.exports = {
  DEFAULT_WALLET_SYNC_STATE,
  loadWalletSyncState,
  saveWalletSyncState,
  normalizeWalletSyncState,
};
