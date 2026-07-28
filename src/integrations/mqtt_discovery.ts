function normalizeProjectName(name) {
  return String(name || 'Unknown project')
    .trim()
    .replace(/^(?:\[[^\]]+\]\s*)+/, '')
    .replace(/\s+-\s+\d{2}\/\d{2}\/\d{2}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortenProjectName(name, maxLength = 40) {
  const cleaned = normalizeProjectName(name);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatProjectEntityName(name) {
  return `Project - ${shortenProjectName(name, 40)}`;
}

function buildDiscoveryNames() {
  return {
    button: 'Sync Now',
    clear_auto_accept_project_cache: 'Clear Priority Cache',
    profile: 'Profile',
    project_count: 'Project Count',
    total_tasks: 'Total Tasks',
    in_progress_task: 'In Progress Task',
    withdraw_locked: 'Withdraw Locked',
    claim_projects_locked: 'Claim Projects Locked',
    fast_polling: 'Fast Polling',
    auto_accept: 'Auto Accept',
    currency_mode: 'Currency to PHP',
    usd_php_rate: 'USD to PHP Rate',
    withdraw_funds: 'Withdraw Funds',
    rebuild_discovery: 'Rebuild Discovery',
    next_payout: 'Next Payout',
    auto_accept_project: 'Auto Accept Priority',
  };
}

function formatAutoAcceptProjectEntityName(name) {
  return `Auto Accept Priority - ${shortenProjectName(name, 40)}`;
}

function buildDeviceInfo(profileName, version) {
  return {
    identifiers: [`dataannotation_${slugify(profileName)}`],
    name: 'Data Annotation',
    manufacturer: 'Data Annotation',
    model: 'Worker Projects Scraper',
    sw_version: version,
  };
}

function slugify(value) {
  const normalized = String(value || 'dataannotation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'dataannotation';
}

module.exports = {
  buildDeviceInfo,
  buildDiscoveryNames,
  formatAutoAcceptProjectEntityName,
  formatProjectEntityName,
  normalizeProjectName,
  shortenProjectName,
  slugify,
};
