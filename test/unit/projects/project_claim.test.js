const assert = require('node:assert/strict');
const test = require('node:test');

const { buildClaimProjectTarget, claimProjectTargetMatchesRowText, formatClaimProjectEntityName } = require('../../../src/project_claim.js');

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

test('claim project row matcher uses the project name', () => {
  const target = buildClaimProjectTarget({ slug: 'project_123', name: 'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26', id: 'abc-123' });

  assert.equal(
    claimProjectTargetMatchesRowText(
      'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26 $55.00/hr ($40 base + $15 priority) 2 Jun 11',
      target
    ),
    true
  );
});
