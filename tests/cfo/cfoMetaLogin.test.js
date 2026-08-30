'use strict';

/* Routes för CFO-ytans Meta (Facebook) OAuth-inloggning. Testar hela flödet:
 * login → facebook-dialog-redirect med signerad state-cookie, callback →
 * session vid matchande email + CF-roll, handoff-sida sparar
 * ARCANA_ADMIN_TOKEN. Ingen live-trafik: kodutbyte och profilhämtning är
 * injicerade. Säkerhetsnekanden: state-manipulation, okänd email, saknad
 * CF-roll, email saknas i Meta-profilen. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoCfoMetaLoginRouter } = require('../../src/routes/ccoCfoMetaLogin');

const SECRET = 'test-secret';
const CF_USER = { id: 'u-fin', email: 'fin@hairtpclinic.com' };
const NON_CF_USER = { id: 'u-staff', email: 'staff@hairtpclinic.com' };

function authStoreWith({ users = {}, memberships = [] } = {}) {
  return {
    getUserByEmail: async (email) => users[email] || null,
    listMembershipsForUser: async () => memberships,
    createSession: async ({ userId, membershipId }) => ({
      token: `tok-${userId}-${membershipId}`,
      session: { id: 's-1', userId, membershipId },
    }),
  };
}

async function withServer(deps, run) {
  const app = express();
  app.use(
    '/api/v1',
    createCcoCfoMetaLoginRouter({
      env: {
        NODE_ENV: 'test',
        META_APP_ID: 'app-123',
        META_APP_SECRET: 'secret-123',
        META_LOGIN_SECRET: SECRET,
      },
      baseUrl: 'https://cfo.hairtpclinic.com',
      ...deps,
    })
  );
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function cookieFrom(res, name) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const hit = set.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0].slice(name.length + 1) : null;
}

test('login → 302 till Meta-dialog med client_id + redirect_uri + signerad state-cookie', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/v1/cco-cf/meta/login`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const url = new URL(res.headers.get('location'));
    assert.equal(url.hostname, 'www.facebook.com');
    assert.match(url.pathname, /\/dialog\/oauth$/);
    assert.equal(url.searchParams.get('client_id'), 'app-123');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'email');
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'https://cfo.hairtpclinic.com/api/v1/cco-cf/meta/callback'
    );
    assert.ok(url.searchParams.get('state'));
    assert.ok(cookieFrom(res, 'cco_cfo_meta_state'));
  });
});

test('login → 503 meta_not_configured utan app-id/secret', async () => {
  await withServer(
    { env: { NODE_ENV: 'test', META_LOGIN_SECRET: SECRET } },
    async (base) => {
      const res = await fetch(`${base}/api/v1/cco-cf/meta/login`, { redirect: 'manual' });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'meta_not_configured');
    }
  );
});

test('full loop: login → callback → handoff-sida sparar ARCANA_ADMIN_TOKEN', async () => {
  await withServer(
    {
      authStore: authStoreWith({
        users: { [CF_USER.email]: CF_USER },
        memberships: [{ id: 'm-fin', userId: CF_USER.id, role: 'finance' }],
      }),
      exchangeCode: async (code) => {
        assert.equal(code, 'meta-code-1');
        return 'acc-token-1';
      },
      profileLoader: async (token) => {
        assert.equal(token, 'acc-token-1');
        return { id: 'meta-user-1', name: 'Fin Ansvarig', email: CF_USER.email };
      },
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-cf/meta/login`, { redirect: 'manual' });
      const stateCookie = cookieFrom(login, 'cco_cfo_meta_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');

      const cb = await fetch(
        `${base}/api/v1/cco-cf/meta/callback?code=meta-code-1&state=${encodeURIComponent(state)}`,
        { redirect: 'manual', headers: { cookie: `cco_cfo_meta_state=${stateCookie}` } }
      );
      assert.equal(cb.status, 200);
      const html = await cb.text();
      assert.match(html, /ARCANA_ADMIN_TOKEN/);
      assert.match(html, /tok-u-fin-m-fin/);
      assert.match(html, /finance\.html/);
    }
  );
});

test('callback → 400 vid manipulerad state', async () => {
  await withServer({}, async (base) => {
    const login = await fetch(`${base}/api/v1/cco-cf/meta/login`, { redirect: 'manual' });
    const stateCookie = cookieFrom(login, 'cco_cfo_meta_state');
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const tampered = state.slice(0, -2) + (state.endsWith('a') ? 'bb' : 'aa');

    const cb = await fetch(
      `${base}/api/v1/cco-cf/meta/callback?code=meta-code-1&state=${encodeURIComponent(tampered)}`,
      { redirect: 'manual', headers: { cookie: `cco_cfo_meta_state=${stateCookie}` } }
    );
    assert.equal(cb.status, 400);
  });
});

test('callback → 403 vid okänd email', async () => {
  await withServer(
    {
      authStore: authStoreWith({ users: {}, memberships: [] }),
      exchangeCode: async () => 'acc-token-1',
      profileLoader: async () => ({ id: 'meta-x', name: 'Okänd', email: 'nobody@example.com' }),
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-cf/meta/login`, { redirect: 'manual' });
      const stateCookie = cookieFrom(login, 'cco_cfo_meta_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');

      const cb = await fetch(
        `${base}/api/v1/cco-cf/meta/callback?code=meta-code-1&state=${encodeURIComponent(state)}`,
        { redirect: 'manual', headers: { cookie: `cco_cfo_meta_state=${stateCookie}` } }
      );
      assert.equal(cb.status, 403);
      const html = await cb.text();
      assert.match(html, /Ingen användare matchar/);
      assert.doesNotMatch(html, /ARCANA_ADMIN_TOKEN/);
    }
  );
});

test('callback → 403 när användaren saknar CF-roll', async () => {
  await withServer(
    {
      authStore: authStoreWith({
        users: { [NON_CF_USER.email]: NON_CF_USER },
        memberships: [{ id: 'm-staff', userId: NON_CF_USER.id, role: 'staff' }],
      }),
      exchangeCode: async () => 'acc-token-1',
      profileLoader: async () => ({ id: 'meta-s', name: 'Staff', email: NON_CF_USER.email }),
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-cf/meta/login`, { redirect: 'manual' });
      const stateCookie = cookieFrom(login, 'cco_cfo_meta_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');

      const cb = await fetch(
        `${base}/api/v1/cco-cf/meta/callback?code=meta-code-1&state=${encodeURIComponent(state)}`,
        { redirect: 'manual', headers: { cookie: `cco_cfo_meta_state=${stateCookie}` } }
      );
      assert.equal(cb.status, 403);
      const html = await cb.text();
      assert.match(html, /ingen CFO-roll/i);
      assert.doesNotMatch(html, /ARCANA_ADMIN_TOKEN/);
    }
  );
});

test('callback → 403 när Meta-profilen saknar email', async () => {
  await withServer(
    {
      authStore: authStoreWith({ users: {}, memberships: [] }),
      exchangeCode: async () => 'acc-token-1',
      profileLoader: async () => ({ id: 'meta-e', name: 'Utan E-post', email: '' }),
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-cf/meta/login`, { redirect: 'manual' });
      const stateCookie = cookieFrom(login, 'cco_cfo_meta_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');

      const cb = await fetch(
        `${base}/api/v1/cco-cf/meta/callback?code=meta-code-1&state=${encodeURIComponent(state)}`,
        { redirect: 'manual', headers: { cookie: `cco_cfo_meta_state=${stateCookie}` } }
      );
      assert.equal(cb.status, 403);
      const html = await cb.text();
      assert.match(html, /saknar en verifierad e-post/i);
    }
  );
});

test('callback → 502 när kodutbytet nekas av Meta', async () => {
  await withServer(
    {
      authStore: authStoreWith({ users: {}, memberships: [] }),
      exchangeCode: async () => {
        throw new Error('meta_token_exchange_400:bad_code');
      },
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-cf/meta/login`, { redirect: 'manual' });
      const stateCookie = cookieFrom(login, 'cco_cfo_meta_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');

      const cb = await fetch(
        `${base}/api/v1/cco-cf/meta/callback?code=meta-code-1&state=${encodeURIComponent(state)}`,
        { redirect: 'manual', headers: { cookie: `cco_cfo_meta_state=${stateCookie}` } }
      );
      assert.equal(cb.status, 502);
    }
  );
});
