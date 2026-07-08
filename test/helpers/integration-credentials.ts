const fs = require('fs');
const path = require('path');

function loadIntegrationCredentials() {
  const envEmail = process.env.DATAANNOTATION_EMAIL || process.env.EMAIL;
  const envPassword = process.env.DATAANNOTATION_PASSWORD || process.env.PASSWORD;

  if (envEmail && envPassword) {
    return {
      email: envEmail,
      password: envPassword,
      source: 'env',
    };
  }

  const localPath = path.resolve(process.cwd(), 'integration.local.json');
  if (!fs.existsSync(localPath)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  if (!payload.email || !payload.password) {
    return null;
  }

  return {
    email: String(payload.email).trim(),
    password: String(payload.password),
    source: 'file',
  };
}

module.exports = {
  loadIntegrationCredentials,
};
