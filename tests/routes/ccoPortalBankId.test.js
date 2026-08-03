'use strict';

/* Routes för kundportalens BankID-inloggning (nivå 2). Testar hela flödet:
 * login → Criipto-redirect med signerad state-cookie, callback → nivå-2-
 * session vid matchande personnummer, /me speglar sessionen. Ingen live-trafik:
 * kodutbytet är injicerat. Säkerhetsnekanden: fel ägare, state-manipulation. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoPortalBankIdRouter, signCookie } = require('../../src/routes/ccoPortalBankId');

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

test('me returnerar offert-payload från commercial-store efter inloggning', async () => {
  const commercialStore = {
    getPatientRegisterCase: async ({ patientId }) =>
      patientId === 'p-owner'
        ? {
            quoteStatus: 'sent',
            coolingOffEndsAt: new Date(Date.now() - 86400000).toISOString(),
            offerPlan: { method: 'DHI', treatmentLabel: 'DHI — Hårlinje' },
            customerName: 'Ägare',
          }
        : null,
  };
  await withServer(
    {
      accessStore: accessStoreWith({ tok: { tenantId: 'hairtpclinic', customerId: 'p-owner' } }),
      patientMasterStore: patientStoreWith([OWNER]),
      commercialStore,
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
      const sessionCookie = cookieFrom(cb, 'cco_portal_l2');
      const me = await fetch(`${base}/api/v1/cco-portal/me`, {
        headers: { cookie: `cco_portal_l2=${sessionCookie}` },
      });
      const body = await me.json();
      assert.equal(body.offer.hasOffer, true);
      assert.equal(body.offer.offerPlan.method, 'DHI');
      assert.equal(body.offer.signing.status, 'ready_to_sign');
      assert.equal(body.offer.signing.canAccept, true);
    }
  );
});

test('nivå-2 /me visar dokumentmetadata för ägaren, aldrig instanspayload', async () => {
  const documentInstanceStore = {
    listForPatient: async ({ patientId }) =>
      patientId === 'p-owner'
        ? [
            {
              instanceId: 'inst-owner',
              documentTypeId: 'haelso_tp_sve',
              status: 'filled',
              filledAt: '2026-07-10T12:00:00Z',
              payload: { secret: 'never-client' },
            },
          ]
        : [],
  };
  const cookie = signCookie(
    { patientId: 'p-owner', tenantId: 'hairtpclinic', exp: Date.now() + 60_000 },
    SECRET
  );
  await withServer({ documentInstanceStore }, async (base) => {
    const res = await fetch(`${base}/api/v1/cco-portal/me`, {
      headers: { cookie: `cco_portal_l2=${cookie}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.offer.documents.length, 1);
    assert.equal(body.offer.documents[0].titel, 'Hälsodeklaration · Hair TP Clinic');
    assert.equal(JSON.stringify(body).includes('never-client'), false);
  });
});

test('nivå-2 dokumentroute är fail-closed utan session och mellan patienter', async () => {
  const documentInstanceStore = {
    listForPatient: async ({ patientId }) =>
      patientId === 'p-owner'
        ? [{ instanceId: 'inst-owner', documentTypeId: 'haelso_tp_sve', status: 'filled' }]
        : [{ instanceId: 'inst-other', documentTypeId: 'haelso_tp_sve', status: 'filled' }],
  };
  const ownerCookie = signCookie(
    { patientId: 'p-owner', tenantId: 'hairtpclinic', exp: Date.now() + 60_000 },
    SECRET
  );
  await withServer({ documentInstanceStore }, async (base) => {
    const noSession = await fetch(`${base}/api/v1/cco-portal/documents/instance/inst-owner`);
    assert.equal(noSession.status, 401);

    const other = await fetch(`${base}/api/v1/cco-portal/documents/instance/inst-other`, {
      headers: { cookie: `cco_portal_l2=${ownerCookie}` },
    });
    assert.equal(other.status, 404);

    const own = await fetch(`${base}/api/v1/cco-portal/documents/instance/inst-owner`, {
      headers: { cookie: `cco_portal_l2=${ownerCookie}` },
    });
    assert.equal(own.status, 200);
    assert.match(await own.text(), /Hälsodeklaration/);
  });
});

test('nivå-2 signerat avtal öppnas bara för sessionens patient', async () => {
  const commercialStore = {
    getPatientRegisterCase: async ({ patientId }) =>
      patientId === 'p-owner'
        ? { quoteStatus: 'accepted', offerDocumentId: 'offer-owner' }
        : { quoteStatus: 'accepted', offerDocumentId: 'offer-other' },
  };
  const offerDocumentStore = {
    readHtml: async ({ documentId }) =>
      documentId === 'offer-owner' ? { html: '<h1>Ägarens avtal</h1>' } : null,
  };
  const ownerCookie = signCookie(
    { patientId: 'p-owner', tenantId: 'hairtpclinic', exp: Date.now() + 60_000 },
    SECRET
  );
  await withServer({ commercialStore, offerDocumentStore }, async (base) => {
    const res = await fetch(`${base}/api/v1/cco-portal/documents/offer?patientId=p-other`, {
      headers: { cookie: `cco_portal_l2=${ownerCookie}` },
    });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Ägarens avtal/);
  });
});

/* ── ORD-80: esign-token (rika offer-portalen) + tokensort-styrt återhopp ── */

const ESIGN_ENV = {
  NODE_ENV: 'test',
  CRIIPTO_DOMAIN: 'hairtp.criipto.id',
  CRIIPTO_CLIENT_ID: 'urn:client',
};

function commercialStoreWithEsign(map) {
  return { findCaseByEsignToken: async (t) => map[t] || null };
}

test('ORD-80: esign-token loggar in och återhoppar till rika offer-portalen (l2=ok)', async () => {
  await withServer(
    {
      accessStore: accessStoreWith({}),
      commercialStore: commercialStoreWithEsign({
        esig: { tenantId: 'hairtpclinic', customerId: 'p-owner', esignToken: 'esig' },
      }),
      patientMasterStore: patientStoreWith([OWNER]),
      exchangeCode: async () => ({ ssn: '199001011234' }),
      env: ESIGN_ENV,
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=esig`, {
        redirect: 'manual',
      });
      assert.equal(login.status, 302);
      const stateCookie = cookieFrom(login, 'cco_bankid_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');
      const cb = await fetch(`${base}/api/v1/cco-portal/bankid/callback?code=abc&state=${state}`, {
        redirect: 'manual',
        headers: { cookie: `cco_bankid_state=${stateCookie}` },
      });
      assert.equal(cb.status, 302);
      assert.match(
        cb.headers.get('location'),
        /\/api\/v1\/cco-commercial\/customer-offer-portal\?token=esig&l2=ok/
      );
      const sessionCookie = cookieFrom(cb, 'cco_portal_l2');
      assert.ok(sessionCookie, 'nivå 2-cookien ska sättas');
    }
  );
});

test('ORD-80: esign-token med FEL ägare nekas → offer-portal med l2=owner_mismatch, ingen session', async () => {
  await withServer(
    {
      accessStore: accessStoreWith({}),
      commercialStore: commercialStoreWithEsign({
        esig: { tenantId: 'hairtpclinic', customerId: 'p-annan', esignToken: 'esig' },
      }),
      patientMasterStore: patientStoreWith([
        OWNER,
        { id: 'p-annan', displayName: 'Annan', personnummer: '198507071111' },
      ]),
      exchangeCode: async () => ({ ssn: '199001011234' }),
      env: ESIGN_ENV,
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=esig`, {
        redirect: 'manual',
      });
      const stateCookie = cookieFrom(login, 'cco_bankid_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');
      const cb = await fetch(`${base}/api/v1/cco-portal/bankid/callback?code=abc&state=${state}`, {
        redirect: 'manual',
        headers: { cookie: `cco_bankid_state=${stateCookie}` },
      });
      assert.equal(cb.status, 302);
      assert.match(
        cb.headers.get('location'),
        /\/api\/v1\/cco-commercial\/customer-offer-portal\?token=esig&l2=owner_mismatch/
      );
      assert.equal(cookieFrom(cb, 'cco_portal_l2'), null, 'ingen session vid ägarmiss');
    }
  );
});

test('ORD-80: PORTAL_BANKID_RETURN=chat tvingar portal-chat även för esign-token', async () => {
  await withServer(
    {
      accessStore: accessStoreWith({}),
      commercialStore: commercialStoreWithEsign({
        esig: { tenantId: 'hairtpclinic', customerId: 'p-owner', esignToken: 'esig' },
      }),
      patientMasterStore: patientStoreWith([OWNER]),
      exchangeCode: async () => ({ ssn: '199001011234' }),
      env: { ...ESIGN_ENV, PORTAL_BANKID_RETURN: 'chat' },
    },
    async (base) => {
      const login = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=esig`, {
        redirect: 'manual',
      });
      const stateCookie = cookieFrom(login, 'cco_bankid_state');
      const state = new URL(login.headers.get('location')).searchParams.get('state');
      const cb = await fetch(`${base}/api/v1/cco-portal/bankid/callback?code=abc&state=${state}`, {
        redirect: 'manual',
        headers: { cookie: `cco_bankid_state=${stateCookie}` },
      });
      assert.match(cb.headers.get('location'), /\/portal-chat\/esig\?l2=ok/);
    }
  );
});

test('ORD-80: token som varken är magisk eller esign → 401', async () => {
  await withServer(
    {
      accessStore: accessStoreWith({}),
      commercialStore: commercialStoreWithEsign({}),
      env: ESIGN_ENV,
    },
    async (base) => {
      const res = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=nope`, {
        redirect: 'manual',
      });
      assert.equal(res.status, 401);
    }
  );
});

test('ORD-80: magisk token återhoppar fortfarande till portal-chat (oförändrat beteende)', async () => {
  await withServer(
    {
      accessStore: accessStoreWith({ tok: { tenantId: 'hairtpclinic', customerId: 'p-owner' } }),
      commercialStore: commercialStoreWithEsign({}),
      patientMasterStore: patientStoreWith([OWNER]),
      exchangeCode: async () => ({ ssn: '199001011234' }),
      env: ESIGN_ENV,
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
      assert.match(cb.headers.get('location'), /\/portal-chat\/tok\?l2=ok/);
    }
  );
});
