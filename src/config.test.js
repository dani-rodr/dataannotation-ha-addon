const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeLogLevel, normalizeSlug } = require('./config/config.ts');

test('normalizeSlug converts spaces to underscores', () => {
  assert.equal(normalizeSlug('Data Annotation'), 'data_annotation');
});

test('normalizeLogLevel accepts debug-like input', () => {
  assert.equal(normalizeLogLevel('DEBUG'), 'debug');
  assert.equal(normalizeLogLevel('warn'), 'info');
});
