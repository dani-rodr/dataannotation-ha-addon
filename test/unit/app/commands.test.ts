// @ts-nocheck
const assert = require('node:assert/strict');
const test = require('node:test');

const { buildAutoAcceptSignature } = require('../../../src/app/commands.ts');

test('buildAutoAcceptSignature returns null for an empty event list', () => {
  assert.equal(buildAutoAcceptSignature([]), null);
});

test('buildAutoAcceptSignature is stable for a new task list', () => {
  assert.equal(
    buildAutoAcceptSignature([
      { slug: 'a', added_tasks: 2, current_tasks: 4, name: 'Alpha' },
      { slug: 'b', added_tasks: 1, current_tasks: 1, name: 'Beta' },
    ]),
    'a|2|4|Alpha;;b|1|1|Beta'
  );
});
