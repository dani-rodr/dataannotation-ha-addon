const assert = require('node:assert/strict');
const test = require('node:test');

const { createLogger } = require('./logger');

test('createLogger prefixes messages with an ISO timestamp', () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const messages = [];

  console.log = (...args) => messages.push(args.join(' '));
  console.warn = (...args) => messages.push(args.join(' '));
  console.error = (...args) => messages.push(args.join(' '));

  try {
    const logger = createLogger('debug');
    logger.info('hello');
    logger.warning('careful');

    assert.match(messages[0], /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z\] \[INFO\] hello$/);
    assert.match(messages[1], /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z\] \[WARN\] careful$/);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
});
