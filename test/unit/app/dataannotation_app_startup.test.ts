// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('module');

test('startup republishes cached auto-accept priorities when auto accept is enabled', async () => {
  const originalLoad = Module._load;
  let publishedArgs = null;

  class FakeBridge {
    constructor() {
      this.publishOnline = () => {};
      this.publishDiscovery = () => {};
      this.publishProfile = () => {};
      this.publishWithdrawLockState = () => {};
      this.publishClaimProjectsLockState = () => {};
      this.publishFastPollingState = () => {};
      this.publishAutoAcceptState = () => {};
      this.publishCurrencyModeState = () => {};
      this.publishCurrencyRate = () => {};
    }

    waitForConnection() {
      return Promise.resolve();
    }

    publishAutoAcceptProjectPreferences(args) {
      publishedArgs = args;
      return args.cache;
    }
  }

  class FakeClient {}
  class FakeWalletSync {}

  Module._load = function(request, parent, isMain) {
    if (request === '../integrations/mqtt_bridge.ts') {
      return { DataAnnotationMqttBridge: FakeBridge };
    }

    if (request === '../state/auto_accept_projects.ts') {
      return {
        loadAutoAcceptProjects: () => ({ version: 1, projects: {}, updated_at: '2026-07-16T00:00:00.000Z' }),
        saveAutoAcceptProjects: () => {},
        clearAutoAcceptProjectCache: (cache) => cache,
        pruneExpiredAutoAcceptProjects: (cache) => cache,
        setAutoAcceptProjectEnabled: (cache) => cache,
      };
    }

    if (request === '../clients/dataannotation_client.ts') {
      return { DataAnnotationClient: FakeClient };
    }

    if (request === '../wallet/wallet_sync.ts') {
      return { WalletSync: FakeWalletSync };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { DataAnnotationApp } = require('../../../src/app/dataannotation_app.ts');
    const app = new DataAnnotationApp({
      config: {
        mqtt_host: 'localhost',
        mqtt_port: 1883,
        mqtt_topic_prefix: 'dataannotation',
        profile: 'Data Annotation',
        email: 'user@example.com',
        password: 'secret',
        browser_profile_dir: '/tmp/profile',
        log_level: 'debug',
      },
      version: '1.0.0',
    });

    app.bridge = new FakeBridge();
    app.state.autoAcceptEnabled = true;
    app.state.autoAcceptProjectCache = {
      version: 1,
      updated_at: '2026-07-16T10:00:00.000Z',
      projects: {
        '550e8400-e29b-41d4-a716-446655440000': {
          project_id: '550e8400-e29b-41d4-a716-446655440000',
          enabled: true,
          last_seen_name: 'Priority Project',
          last_seen_slug: 'priority-project',
          last_seen_url: 'https://app.dataannotation.tech/workers/projects/550e8400-e29b-41d4-a716-446655440000',
          first_seen_at: '2026-07-15T10:00:00.000Z',
          last_seen_at: '2026-07-16T10:00:00.000Z',
        },
      },
    };
    app.state.currencyState = { convert_to_php: false };

    await app._connectAndPublishStartupState();

    assert.ok(publishedArgs);
    assert.equal(publishedArgs.autoAcceptEnabled, true);
    assert.equal(publishedArgs.projects.length, 0);
    assert.equal(publishedArgs.cache.projects['550e8400-e29b-41d4-a716-446655440000'].last_seen_at, '2026-07-16T10:00:00.000Z');
    assert.equal(app.state.autoAcceptProjectCache.projects['550e8400-e29b-41d4-a716-446655440000'].last_seen_at, '2026-07-16T10:00:00.000Z');
  } finally {
    Module._load = originalLoad;
  }
});
