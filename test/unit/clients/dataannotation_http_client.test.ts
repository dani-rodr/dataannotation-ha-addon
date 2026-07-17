// @ts-nocheck
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DataAnnotationHttpClient,
  extractAuthenticityToken,
} = require('../../../src/clients/dataannotation_http_client');

const PROJECTS_HTML = `
  <div id="workers/WorkerProjectsTable-hybrid-root" data-props="{&quot;dashboardMerchTargeting&quot;:{&quot;projects&quot;:[{&quot;id&quot;:&quot;project-1&quot;,&quot;name&quot;:&quot;Alpha&quot;,&quot;availableTasksFor&quot;:2,&quot;payPerHourInCents&quot;:2500}],&quot;easyProjects&quot;:[]},&quot;inProgressTasksInfo&quot;:[]}"></div>
`;

const PAYMENTS_HTML = `
  <div id="workers/TransferFundsPage-hybrid-root" data-props="{&quot;paymentStatus&quot;:{&quot;type&quot;:&quot;available&quot;,&quot;nextEligibleAt&quot;:null,&quot;amountInCents&quot;:12500},&quot;totalLifetimeEarnings&quot;:50000,&quot;unapprovedAmount&quot;:2000,&quot;lastPayoutAt&quot;:&quot;2026-07-01T00:00:00Z&quot;}"></div>
  <form action="/workers/payments/get_paid" method="post"><button>Get paid $125.00</button></form>
  <p>Next withdrawal: July 4, 2026 at 12:00 AM GMT+0</p>
`;

function response(body, { status = 200, url = 'https://app.dataannotation.tech/workers/projects', setCookie = [], location = null } = {}) {
  const headers = new Map();
  if (setCookie.length > 0) {
    headers.set('set-cookie', setCookie.join(', '));
  }
  if (location) {
    headers.set('location', location);
  }

  return {
    status,
    url,
    headers: {
      get(name) {
        return headers.get(name.toLowerCase()) || null;
      },
      getSetCookie() {
        return setCookie;
      },
    },
    async text() {
      return body;
    },
  };
}

test('extractAuthenticityToken reads the sign-in form token', () => {
  assert.equal(
    extractAuthenticityToken('<input name="authenticity_token" value="token-123">'),
    'token-123'
  );
});

test('HTTP client logs in, stores cookies, and reuses them for authenticated reads', async () => {
  const requests = [];
  let authenticated = false;
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/workers/projects') && !authenticated) {
      return response('<html>sign in</html>', {
        status: 302,
        url,
        location: 'https://app.dataannotation.tech/users/sign_in',
        setCookie: ['login_attempt=1; Path=/'],
      });
    }

    if (url.endsWith('/users/sign_in') && options.method === 'GET') {
      return response('<input name="authenticity_token" value="csrf-token">', {
        url,
        setCookie: ['preauth=1; Path=/'],
      });
    }

    if (url.endsWith('/users/sign_in') && options.method === 'POST') {
      assert.match(options.body, /authenticity_token=csrf-token/);
      assert.match(options.body, /user%5Bemail%5D=user%40example.com/);
      assert.match(options.body, /user%5Bpassword%5D=secret/);
      assert.match(options.headers.Cookie, /preauth=1/);
      authenticated = true;
      return response('', {
        status: 302,
        url,
        location: 'https://app.dataannotation.tech/workers/projects',
        setCookie: ['session=authenticated; Path=/'],
      });
    }

    assert.match(options.headers.Cookie, /session=authenticated/);
    return response(PROJECTS_HTML, { url });
  };

  const client = new DataAnnotationHttpClient({
    email: 'user@example.com',
    password: 'secret',
    fetchImpl,
  });

  const result = await client.getProjects();

  assert.equal(result.props.dashboardMerchTargeting.projects[0].id, 'project-1');
  assert.equal(requests.length, 4);
  assert.match(requests[3].options.headers.Cookie, /login_attempt=1/);
  assert.match(requests[3].options.headers.Cookie, /preauth=1/);
  assert.match(requests[3].options.headers.Cookie, /session=authenticated/);
});

test('HTTP client extracts payment props, buttons, and earnings JSON', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/workers/payments')) {
      return response(PAYMENTS_HTML, { url });
    }

    return response(JSON.stringify({ totalPaidOut: 30000, currentMonthEarnings: 20000 }), {
      url,
    });
  };

  const client = new DataAnnotationHttpClient({ fetchImpl });
  const result = await client.getPayments();

  assert.equal(result.props.paymentStatus.amountInCents, 12500);
  assert.equal(result.buttons[0].formAction, '/workers/payments/get_paid');
  assert.equal(result.buttons[0].formMethod, 'post');
  assert.equal(result.earningsSummary.totalPaidOut, 30000);
  assert.equal(result.nextWithdrawalText, 'Next withdrawal: July 4, 2026 at 12:00 AM GMT+0');
});
