const assert = require('node:assert/strict');
const Module = require('module');
const test = require('node:test');

test('browser session grants notification permissions for DataAnnotation', async () => {
  const originalLoad = Module._load;
  const calls: Array<{ origin: string; permissions: string[] }> = [];

  Module._load = function(request: string, parent: any, isMain: boolean) {
    if (request === 'puppeteer-core') {
      return {
        launch: async () => ({
          defaultBrowserContext() {
            return {
              overridePermissions: async (origin: string, permissions: string[]) => {
                calls.push({ origin, permissions });
              },
            };
          },
          newPage: async () => ({
            evaluate: async () => {},
            setDefaultTimeout() {},
            setDefaultNavigationTimeout() {},
          }),
          close: async () => {},
        }),
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { DataAnnotationBrowserSession } = require('../../../src/clients/browser_session.ts');
    const session = new DataAnnotationBrowserSession({
      executablePath: '/usr/bin/google-chrome',
      logger: { debug() {} },
    });

    await session.newPage();

    assert.deepEqual(calls, [{ origin: 'https://app.dataannotation.tech', permissions: ['notifications'] }]);
  } finally {
    Module._load = originalLoad;
  }
});
