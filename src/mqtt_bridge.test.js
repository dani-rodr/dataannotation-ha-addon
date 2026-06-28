const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDeviceInfo, buildDiscoveryNames, formatProjectEntityName, shortenProjectName } = require('./mqtt_bridge');
const { formatClaimProjectEntityName } = require('./project_claim');

test('device metadata uses a clean Data Annotation name', () => {
  const device = buildDeviceInfo('Daniel Rodriguez', '0.1.1');
  assert.equal(device.name, 'Data Annotation');
  assert.equal(device.manufacturer, 'Data Annotation');
  assert.equal(device.model, 'Worker Projects Scraper');
  assert.equal(device.sw_version, '0.1.1');
  assert.equal(device.identifiers[0], 'dataannotation_daniel_rodriguez');
});

test('discovery names stay short', () => {
  assert.deepEqual(buildDiscoveryNames(), {
    button: 'Sync Now',
    profile: 'Profile',
    project_count: 'Project Count',
    total_tasks: 'Total Tasks',
    status: 'Status',
    last_sync: 'Last Sync',
    withdraw_locked: 'Withdraw Locked',
    claim_projects_locked: 'Claim Projects Locked',
    fast_polling: 'Fast Polling',
    withdraw_funds: 'Withdraw Funds',
    next_payout: 'Next Payout',
  });
});

test('project entity names are prefixed and shortened', () => {
  const short = shortenProjectName('Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26');
  assert.equal(short.includes('06/14/26'), false);
  assert.ok(short.length <= 40);
  assert.equal(formatProjectEntityName('Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26').startsWith('Project - '), true);
});

test('claim project entity names are prefixed and shortened', () => {
  assert.equal(
    formatClaimProjectEntityName('Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26').startsWith('Claim Project - '),
    true
  );
});
