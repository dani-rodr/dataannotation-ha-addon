const assert = require('node:assert/strict');
const test = require('node:test');

const { buildClaimProjectTarget, formatClaimProjectEntityName } = require('./project_claim');

test('buildClaimProjectTarget preserves slug name and id', () => {
  const target = buildClaimProjectTarget({ slug: 'project_123', name: 'Boxing', id: 'abc-123' });

  assert.deepEqual(target, {
    slug: 'project_123',
    name: 'Boxing',
    id: 'abc-123',
  });
});

test('claim project entity names are prefixed and shortened', () => {
  assert.equal(formatClaimProjectEntityName('Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26').startsWith('Claim Project - '), true);
});
