const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDeviceInfo, buildDiscoveryNames } = require('./mqtt_bridge');

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
  });
});
