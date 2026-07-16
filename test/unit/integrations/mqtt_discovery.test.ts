// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildDeviceInfo,
  buildDiscoveryNames,
  formatProjectEntityName,
  normalizeProjectName,
  shortenProjectName,
} = require('../../../src/integrations/mqtt_discovery.ts');

test('mqtt discovery helpers keep the public labels stable', () => {
  assert.deepEqual(buildDiscoveryNames(), {
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
  });
});

test('mqtt discovery helpers normalize and shorten project names', () => {
  const name = ' [Reference Version]  Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26 ';
  assert.equal(normalizeProjectName(name), 'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode');
  assert.ok(shortenProjectName(name).length <= 40);
  assert.equal(formatProjectEntityName(name).startsWith('Project - '), true);
});

test('mqtt discovery device metadata keeps the Data Annotation label', () => {
  const device = buildDeviceInfo('Daniel Rodriguez', '1.2.3');
  assert.equal(device.name, 'Data Annotation');
  assert.equal(device.manufacturer, 'Data Annotation');
  assert.equal(device.model, 'Worker Projects Scraper');
  assert.equal(device.sw_version, '1.2.3');
});
