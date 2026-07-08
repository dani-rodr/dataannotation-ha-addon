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
  });
});

test('configuration and diagnostic entities are categorized for the device page', () => {
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

    bridge.publishDiscovery();

    const parse = (topic) => JSON.parse(publishes.find((entry) => entry.topic === topic).payload);

    assert.equal(parse('homeassistant/switch/dataannotation_withdraw_locked/config').entity_category, 'config');
    assert.equal(parse('homeassistant/switch/dataannotation_claim_projects_locked/config').entity_category, 'config');
    assert.equal(parse('homeassistant/switch/dataannotation_fast_polling/config').entity_category, 'config');
    assert.equal(parse('homeassistant/switch/dataannotation_currency_mode/config').entity_category, 'config');
    assert.equal(parse('homeassistant/switch/dataannotation_auto_accept/config').entity_category, 'config');
    assert.equal(parse('homeassistant/sensor/dataannotation_profile_name/config').entity_category, 'diagnostic');
    assert.equal(parse('homeassistant/sensor/dataannotation_usd_php_rate/config').entity_category, 'diagnostic');
    assert.equal(parse('homeassistant/sensor/dataannotation_total_earnings/config').entity_category, 'diagnostic');
    assert.equal(parse('homeassistant/sensor/dataannotation_total_paid_out/config').entity_category, 'diagnostic');
    assert.equal(parse('homeassistant/sensor/dataannotation_this_month/config').entity_category, 'diagnostic');
    assert.equal(parse('homeassistant/sensor/dataannotation_best_month/config').entity_category, 'diagnostic');
    assert.equal(parse('homeassistant/sensor/dataannotation_last_payout/config').entity_category, 'diagnostic');
    assert.equal(parse('homeassistant/sensor/dataannotation_pending_approval/config').json_attributes_topic, 'dataannotation/payments/summary');
    assert.equal(parse('homeassistant/sensor/dataannotation_pending_approval/config').json_attributes_template, "{{ {'pending_payout_entries': value_json.pending_payout_entries_public} | tojson }}");
    assert.equal(parse('homeassistant/sensor/dataannotation_next_payout/config').json_attributes_topic, 'dataannotation/payments/summary');
    assert.equal(parse('homeassistant/sensor/dataannotation_next_payout/config').json_attributes_template, "{{ {'next_payout_at_human': value_json.next_payout_at_human, 'next_payout_entries': value_json.next_payout_entries_public, 'next_payout_entries_count': value_json.next_payout_entries_count, 'next_payout_amount': value_json.next_payout_amount, 'next_payout_source': value_json.next_payout_source, 'next_payout_confidence': value_json.next_payout_confidence} | tojson }}");
    assert.equal(parse('homeassistant/button/dataannotation_rebuild_discovery/config').entity_category, 'config');
  } finally {
    Module._load = originalLoad;
  }
});

test('rebuild discovery clears and republishes categorized entities', () => {
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

    bridge.rebuildDiscovery();

    const fastPollingPublishes = publishes.filter((entry) => entry.topic === 'homeassistant/switch/dataannotation_fast_polling/config');
    assert.equal(fastPollingPublishes.some((entry) => entry.payload === ''), true);

    const profilePublishes = publishes.filter((entry) => entry.topic === 'homeassistant/sensor/dataannotation_profile_name/config');
    assert.equal(profilePublishes.some((entry) => entry.payload === ''), true);

    const rebuildButtonPublishes = publishes.filter((entry) => entry.topic === 'homeassistant/button/dataannotation_rebuild_discovery/config');
    assert.equal(rebuildButtonPublishes.some((entry) => entry.payload === ''), true);
    assert.equal(JSON.parse(rebuildButtonPublishes.find((entry) => entry.payload !== '').payload).entity_category, 'config');
  } finally {
    Module._load = originalLoad;
  }
});

test('total tasks discovery omits long-term statistics metadata', () => {
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

    bridge.publishDiscovery();
    const discovery = publishes.find((entry) => entry.topic === 'homeassistant/sensor/dataannotation_total_tasks/config');
    assert.ok(discovery);
    assert.equal(JSON.parse(discovery.payload).state_class, undefined);
  } finally {
    Module._load = originalLoad;
  }
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
    bridge.publishDiscovery();
    assert.equal(publishes.some((entry) => entry.topic.includes('dataannotation_status') || entry.topic.includes('dataannotation_last_sync')), false);

    publishes.length = 0;
    bridge.publishedProjectSlugs.add('project-1');
    bridge.publishPublishedProjectAvailability(false);
    assert.deepEqual(publishes, [{ topic: 'dataannotation/projects/project-1/availability', payload: 'offline' }]);
  } finally {
    Module._load = originalLoad;
  }
});
