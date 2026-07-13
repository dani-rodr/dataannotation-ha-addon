// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');

function loadWalletLiveCredentials() {
  const local = loadLocalWalletConfig();
  const token = normalizeText(process.env.WALLET_TOKEN) || normalizeText(local['wallet-token']) || normalizeText(local.wallet_token);

  if (!token) {
    return null;
  }

  return {
    token,
    source: process.env.WALLET_TOKEN ? 'env' : 'file',
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

module.exports = {
  loadWalletLiveCredentials,
};
