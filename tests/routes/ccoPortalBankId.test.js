'use strict';

/* Routes för kundportalens BankID-inloggning (nivå 2). Testar hela flödet:
 * login → Criipto-redirect med signerad state-cookie, callback → nivå-2-
 * session vid matchande personnummer, /me speglar sessionen. Ingen live-trafik:
 * kodutbytet är injicerat. Säkerhetsnekanden: fel ägare, state-manipulation. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoPortalBankIdRouter } = require('../../src/routes/ccoPortalBankId');

const SECRET = 'test-secret';
const OWNER = { id: 'p-owner', displayName: 'Ägare', personnummer: '199001011234' };

function accessStoreWith(tokenMap) {
  return { resolveToken: (t) => tokenMap[t] || null };
}
function patientStoreWith(patients) {
  return { listPatients: async () => ({ patients, total: patients.length }) };
}

async function withServer(deps, run) {
  const app = express();
  app.use(
    createCcoPortalBankIdRouter({
      env: { NODE_ENV: 'test' },
      baseUrl: 'https://portal.test',
      sessionSecret: SECRET,
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

test('login → 302 till Criipto authorize + signerad state-cookie', async () => {
  await withServer(
    {
      accessStore: accessStoreWith({ tok: { tenantId: 'hairtpclinic', customerId: 'p-owner' } }),
      env: {
        NODE_ENV: 'test',
        CRIIPTO_DOMAIN: 'hairtp.criipto.id',
        CRIIPTO_CLIENT_ID: 'urn:client',
      },
    },
    async (base) => {
      const res = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=tok`, {
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      assert.match(
        res.headers.get('location'),
        /^https:\/\/hairtp\.criipto\.id\/oauth2\/authorize\?/
      );
      assert.ok(cookieFrom(res, 'cco_bankid_state'));
    }
  );
});

test('login → 401 vid ogiltig token', async () => {
  await withServer({ accessStore: accessStoreWith({}) }, async (base) => {
    const res = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=nope`, {
      redirect: 'manual',
    });
    assert.equal(res.status, 401);
  });
});

test('full loop: login → callback (matchande pnr) → me returnerar nivå-2', async () => {
  await withServer(
    {
      accessStore: accessStoreWith({ tok: { tenantId: 'hairtpclinic', customerId: 'p-owner' } }),
      patientMasterStore: patientStoreWith([OWNER]),
      exchangeCode: async () => ({ ssn: '199001011234' }),
      env: {
        NODE_ENV: 'test',
        CRIIPTO_DOMAIN: 'hairtp.criipto.id',
        CRIIPTO_CLIENT_ID: 'urn:client',
      },
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=tok`, {
        redirect: 'manual',
      });
      const stateCookie = cookieFrom(login, 'cco_bankid_state');
      const authUrl = new URL(login.headers.get('location'));
      const state = authUrl.searchParams.get('state');

      const cb = await fetch(`${base}/api/v1/cco-portal/bankid/callback?code=abc&state=${state}`, {
        redirect: 'manual',
        headers: { cookie: `cco_bankid_state=${stateCookie}` },
      });
      assert.equal(cb.status, 302);
      assert.match(cb.headers.get('location'), /\/portal-chat\/tok\?l2=ok/);
      const sessionCookie = cookieFrom(cb, 'cco_portal_l2');
      assert.ok(sessionCookie);

      const me = await fetch(`${base}/api/v1/cco-portal/me`, {
        headers: { cookie: `cco_portal_l2=${sessionCookie}` },
      });
      assert.equal(me.status, 200);
      const body = await me.json();
      assert.equal(body.authenticated, true);
      assert.equal(body.level, 2);
      assert.equal(body.patientId, 'p-owner');
    }
  );
});

test('callback NEKAR när personnumret tillhör annan patient än tokenägaren', async () => {
  await withServer(
    {
      accessStore: accessStoreWith({ tok: { tenantId: 'hairtpclinic', customerId: 'p-annan' } }),
      patientMasterStore: patientStoreWith([OWNER]), // pnr → p-owner, inte p-annan
      exchangeCode: async () => ({ ssn: '199001011234' }),
      env: {
        NODE_ENV: 'test',
        CRIIPTO_DOMAIN: 'hairtp.criipto.id',
        CRIIPTO_CLIENT_ID: 'urn:client',
      },
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=tok`, {
        redirect: 'manual',
      });
      const stateCookie = cookieFrom(login, 'cco_bankid_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');
      const cb = await fetch(`${base}/api/v1/cco-portal/bankid/callback?code=abc&state=${state}`, {
        redirect: 'manual',
        headers: { cookie: `cco_bankid_state=${stateCookie}` },
      });
      assert.equal(cb.status, 302);
      assert.match(cb.headers.get('location'), /l2=owner_mismatch/);
      assert.equal(cookieFrom(cb, 'cco_portal_l2'), null); // ingen session sätts
    }
  );
});

test('callback → state_expired utan giltig state-cookie (manipulation/CSRF)', async () => {
  await withServer(
    { patientMasterStore: patientStoreWith([OWNER]), exchangeCode: async () => ({ ssn: '1' }) },
    async (base) => {
      const cb = await fetch(`${base}/api/v1/cco-portal/bankid/callback?code=abc&state=x`, {
        redirect: 'manual',
      });
      assert.equal(cb.status, 400);
    }
  );
});

test('me → 401 utan session-cookie', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/v1/cco-portal/me`);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).authenticated, false);
  });
});

test('me → 401 vid manipulerad session-cookie (fel signatur)', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/v1/cco-portal/me`, {
      headers: { cookie: 'cco_portal_l2=eyJwYXRpZW50SWQiOiJwLW93bmVyIn0.badsig' },
    });
    assert.equal(res.status, 401);
  });
});
