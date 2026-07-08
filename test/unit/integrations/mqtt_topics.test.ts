// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const { buildTopicHelpers } = require('../../../src/integrations/mqtt_topics.ts');

test('mqtt topic helpers build stable topics', () => {
  const topics = buildTopicHelpers('dataannotation');
  assert.equal(topics.topic('availability'), 'dataannotation/availability');
  assert.equal(topics.projectStateTopic('project-1'), 'dataannotation/projects/project-1/state');
  assert.equal(topics.projectAvailabilityTopic('project-1'), 'dataannotation/projects/project-1/availability');
});
