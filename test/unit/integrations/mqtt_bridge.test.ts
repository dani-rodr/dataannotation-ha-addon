const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const { buildDeviceInfo, buildDiscoveryNames, formatProjectEntityName, shortenProjectName } = require('../../../src/integrations/mqtt_bridge.ts');
const { formatClaimProjectEntityName } = require('../../../src/projects/project_claim.ts');

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
    in_progress_task: 'In Progress Task',
    last_sync: 'Last Sync',
    withdraw_locked: 'Withdraw Locked',
    claim_projects_locked: 'Claim Projects Locked',
    fast_polling: 'Fast Polling',
    auto_accept: 'Auto Accept',
    currency_mode: 'Currency to PHP',
    usd_php_rate: 'USD to PHP Rate',
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

test('claim project discovery includes project availability and offline publication updates published slugs', () => {
  const publishes = [];
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'mqtt') {
      return {
        connect() {
          return {
            on() {},
            subscribe() {},
            publish(topic, payload) {
              publishes.push({ topic, payload });
            },
            end(_force, _options, callback) {
              callback?.();
            },
          };
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { DataAnnotationMqttBridge } = require('../../../src/integrations/mqtt_bridge.ts');
    const bridge = new DataAnnotationMqttBridge({
      host: 'localhost',
      port: 1883,
      topicPrefix: 'dataannotation',
      profileName: 'Test Profile',
      version: '1.0.0',
    });

    bridge._publishProjectClaimDiscovery({ slug: 'project-1', name: 'Example Project' });
    const claimConfig = publishes.find((entry) => entry.topic === 'homeassistant/button/dataannotation_claim_project_project-1/config');
    assert.ok(claimConfig);
    assert.equal(JSON.parse(claimConfig.payload).availability_topic, 'dataannotation/projects/project-1/availability');

    publishes.length = 0;
    bridge.publishedProjectSlugs.add('project-1');
    bridge.publishPublishedProjectAvailability(false);
    assert.deepEqual(publishes, [{ topic: 'dataannotation/projects/project-1/availability', payload: 'offline' }]);
  } finally {
    Module._load = originalLoad;
  }
});
