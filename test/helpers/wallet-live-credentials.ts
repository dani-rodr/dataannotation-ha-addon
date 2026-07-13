// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');

const WALLET_LIVE_WRITE_TEST_ACK = '1';
const WALLET_LIVE_WRITE_CLEANUP_ACK = '1';

function loadWalletLiveCredentials() {
  const local = loadLocalWalletConfig();
  const token = normalizeText(process.env.WALLET_TOKEN) || normalizeText(local['wallet-token']) || normalizeText(local.wallet_token);
  const accountId = normalizeText(process.env.WALLET_LIVE_WRITE_ACCOUNT_ID)
    || normalizeText(local['wallet-live-write-account-id'])
    || normalizeText(local.wallet_live_write_account_id);
  const writeAck = normalizeFlag(process.env.WALLET_LIVE_WRITE_TEST);
  const cleanupAck = normalizeFlag(process.env.WALLET_LIVE_WRITE_CLEANUP);

  if (!token || !accountId) {
    return null;
  }

  return {
    token,
    accountId,
    source: process.env.WALLET_TOKEN ? 'env' : 'file',
    canWrite: writeAck === WALLET_LIVE_WRITE_TEST_ACK && cleanupAck === WALLET_LIVE_WRITE_CLEANUP_ACK,
    writeAck,
    cleanupAck,
    ackRequired: {
      write: WALLET_LIVE_WRITE_TEST_ACK,
      cleanup: WALLET_LIVE_WRITE_CLEANUP_ACK,
    },
  };
}

function loadLocalWalletConfig() {
  const localPath = path.resolve(process.cwd(), 'integration.local.json');
  if (!fs.existsSync(localPath)) {
    return {};
  }

  try {
    const payload = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function normalizeFlag(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return '1';
  }

  return '';
}

export {};

module.exports = {
  WALLET_LIVE_WRITE_CLEANUP_ACK,
  WALLET_LIVE_WRITE_TEST_ACK,
  loadWalletLiveCredentials,
};
