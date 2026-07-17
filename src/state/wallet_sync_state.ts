// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_WALLET_SYNC_STATE = {
  version: 4,
  created_at: null,
  updated_at: null,
  first_sync_completed_at: null,
  wallet_api_retry_after_at: null,
  wallet_api_failure_count: 0,
  wallet_api_last_error: null,
  last_seen_last_payout_at: null,
  last_seen_last_payout_amount_cents: null,
  last_seen_available_amount_cents: null,
  last_seen_available_amount: null,
  last_applied_settlement_rate: null,
  pending_revaluation: null,
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
  const sourceVersion = normalizeNumber(payload.version) || 2;
  const version = Math.max(4, sourceVersion);
  return {
    version,
    created_at: normalizeIsoDate(payload.created_at) || null,
    updated_at: normalizeIsoDate(payload.updated_at) || null,
    first_sync_completed_at: normalizeIsoDate(payload.first_sync_completed_at) || null,
    wallet_api_retry_after_at: normalizeIsoDate(payload.wallet_api_retry_after_at) || null,
    wallet_api_failure_count: normalizeNumber(payload.wallet_api_failure_count) || 0,
    wallet_api_last_error: normalizeText(payload.wallet_api_last_error),
    last_seen_last_payout_at: normalizeIsoDate(payload.last_seen_last_payout_at) || null,
    last_seen_last_payout_amount_cents: normalizeNumber(payload.last_seen_last_payout_amount_cents),
    last_seen_available_amount_cents: normalizeNumber(payload.last_seen_available_amount_cents),
    last_seen_available_amount: normalizeNumber(payload.last_seen_available_amount),
    last_applied_settlement_rate: normalizeNumber(payload.last_applied_settlement_rate),
    pending_revaluation: normalizePendingRevaluation(payload.pending_revaluation),
    imported_funds_entries: normalizeEntryMap(payload.imported_funds_entries, sourceVersion),
    withdrawal_events: normalizeEntryMap(payload.withdrawal_events),
  };
}

function normalizeEntryMap(value, sourceVersion = 4) {
  const entries = value && typeof value === 'object' ? value : {};
  const normalized = {};

  for (const [key, entry] of Object.entries(entries)) {
    const normalizedEntry = normalizeLedgerEntry(key, entry, sourceVersion);
    if (normalizedEntry) {
      normalized[key] = normalizedEntry;
    }
  }

  return normalized;
}

function normalizeLedgerEntry(key, value, sourceVersion = 4) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const feeRecordId = normalizeText(value.fee_record_id) || normalizeText(value.record_id);
  const transferRecordId = normalizeText(value.transfer_record_id) || normalizeText(value.mirror_record_id);

  const sourceType = normalizeText(value.source_type);
  let status = normalizeText(value.status);
  let sourceRate = normalizeNumber(value.source_rate);
  if (sourceType === 'income' && sourceVersion < 4 && !status) {
    status = 'unclassified';
  }
  if (sourceType === 'income' && sourceVersion < 4 && status !== 'historical_locked' && status !== 'transferred') {
    sourceRate = null;
  }

  return {
    key: String(value.key || key || '').trim(),
    note_marker: normalizeText(value.note_marker),
    source_marker: normalizeText(value.source_marker),
    source_observation_id: normalizeText(value.source_observation_id),
    source_project: normalizeText(value.source_project),
    fee_record_id: feeRecordId,
    transfer_record_id: transferRecordId,
    record_id: feeRecordId,
    mirror_record_id: transferRecordId,
    source_fingerprint: normalizeText(value.source_fingerprint),
    source_type: sourceType,
    source_amount_usd_cents: normalizeNumber(value.source_amount_usd_cents),
    source_amount_php_cents: normalizeNumber(value.source_amount_php_cents),
    source_fee_usd_cents: normalizeNumber(value.source_fee_usd_cents),
    source_fee_php_cents: normalizeNumber(value.source_fee_php_cents),
    source_net_usd_cents: normalizeNumber(value.source_net_usd_cents),
    source_net_php_cents: normalizeNumber(value.source_net_php_cents),
    source_rate: sourceRate,
    payout_at: normalizeIsoDate(value.payout_at) || null,
    status: status || (sourceType === 'income' ? 'unclassified' : 'historical_locked'),
    status_updated_at: normalizeIsoDate(value.status_updated_at) || null,
    withdrawal_marker: normalizeText(value.withdrawal_marker),
    transferred_at: normalizeIsoDate(value.transferred_at) || null,
    created_at: normalizeIsoDate(value.created_at) || null,
    completed_at: normalizeIsoDate(value.completed_at) || null,
    last_attempt_at: normalizeIsoDate(value.last_attempt_at) || null,
    attempt_count: normalizeNumber(value.attempt_count) || 0,
    last_error: normalizeText(value.last_error),
  };
}

function normalizePendingRevaluation(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    queued_at: normalizeIsoDate(value.queued_at) || null,
    reason: normalizeText(value.reason),
    reference_rate: normalizeNumber(value.reference_rate),
    settlement_rate: normalizeNumber(value.settlement_rate),
    source: normalizeText(value.source),
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
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadLastPayoutState(filePath) {
  const state = loadWalletSyncState(filePath);
  const payoutAt = state.last_seen_last_payout_at;
  if (!payoutAt) {
    return null;
  }

  let amountCents = state.last_seen_last_payout_amount_cents;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    const payoutDate = new Date(payoutAt);
    const candidates = Object.values(state.withdrawal_events || {}).filter((event) => {
      if (normalizeText(event?.source_type) !== 'withdrawal') {
        return false;
      }

      const eventPayoutAt = normalizeIsoDate(event?.payout_at);
      if (eventPayoutAt) {
        return eventPayoutAt === payoutAt;
      }

      const completedAt = normalizeIsoDate(event?.completed_at);
      const sourceAmountCents = Number(event?.source_amount_usd_cents);
      if (!completedAt || !Number.isFinite(sourceAmountCents) || sourceAmountCents <= 0) {
        return false;
      }

      const distance = Math.abs(new Date(completedAt).getTime() - payoutDate.getTime());
      return distance <= 5 * 60 * 1000;
    });

    if (candidates.length !== 1) {
      return null;
    }

    amountCents = Number(candidates[0].source_amount_usd_cents);
  }

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return null;
  }

  const normalizedAmountCents = Math.round(amountCents);
  return {
    last_payout_at: payoutAt,
    last_payout_amount_cents: normalizedAmountCents,
    last_payout_amount: normalizedAmountCents / 100,
    last_payout_amount_formatted: `$${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(normalizedAmountCents / 100)}`,
  };
}

module.exports = {
  DEFAULT_WALLET_SYNC_STATE,
  loadWalletSyncState,
  loadLastPayoutState,
  saveWalletSyncState,
  normalizeWalletSyncState,
};
