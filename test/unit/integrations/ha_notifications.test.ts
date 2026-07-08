const assert = require('node:assert/strict');
const test = require('node:test');

const { purgeRecorderEntities } = require('../../../src/integrations/ha_notifications.ts');

test('purgeRecorderEntities calls the recorder service with explicit entity ids', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  process.env.SUPERVISOR_TOKEN = 'test-token';

  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => '',
    };
  };

  try {
    await purgeRecorderEntities({
      entityIds: ['sensor.data_annotation_total_earnings', 'sensor.data_annotation_this_month'],
      keepDays: 0,
      logger: { info() {}, warning() {} },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://supervisor/core/api/services/recorder/purge_entities');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      entity_id: ['sensor.data_annotation_total_earnings', 'sensor.data_annotation_this_month'],
      keep_days: 0,
    });
  } finally {
    global.fetch = originalFetch;
    delete process.env.SUPERVISOR_TOKEN;
  }
});
