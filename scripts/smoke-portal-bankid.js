'use strict';

/**
 * Smoke-test för kundportalens BankID-inloggning (nivå 2) — kör HELA loopen
 * lokalt i dry-run utan Criipto: login → callback → me, plus säkerhetsnekanden.
 *
 * Kör:  node scripts/smoke-portal-bankid.js
 *
 * Bevisar wiring:en (routes, state-/session-cookies, pnr→patientId, owner-check).
 * Det skarpa Criipto-kodutbytet mockas här; med riktig Criipto byts bara env +
 * en riktig BankID-signering in (se docs/cco-kundportal-bankid-criipto-runbook.md).
 */

const http = require('node:http');
const express = require('express');
const { createCcoPortalBankIdRouter } = require('../src/routes/ccoPortalBankId');

const OWNER = { id: 'p-owner', displayName: 'Testkund', personnummer: '199001011234' };
const TOKEN = 'magic-token-abc';

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}`);
  }
}
function cookieFrom(res, name) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const hit = set.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0].slice(name.length + 1) : null;
}

async function main() {
  const app = express();
  app.use(
    createCcoPortalBankIdRouter({
      env: {
        NODE_ENV: 'test',
        CRIIPTO_DOMAIN: 'hairtp.criipto.id',
        CRIIPTO_CLIENT_ID: 'urn:client',
      },
      baseUrl: 'https://portal.local',
      sessionSecret: 'smoke-secret',
      accessStore: {
        resolveToken: (t) =>
          t === TOKEN ? { tenantId: 'hairtpclinic', customerId: 'p-owner' } : null,
      },
      patientMasterStore: { listPatients: async () => ({ patients: [OWNER] }) },
      // Mocka Criiptos kodutbyte (skarpt: JWKS-verifierat token från brokern).
      exchangeCode: async () => ({ ssn: '199001011234' }),
    })
  );
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    console.log('\n1) LOGIN → redirect till BankID/Criipto');
    const login = await fetch(`${base}/api/v1/cco-portal/bankid/login?token=${TOKEN}`, {
      redirect: 'manual',
    });
    check('svarar 302', login.status === 302);
    const loc = login.headers.get('location') || '';
    check('redirectar till Criipto authorize', /hairtp\.criipto\.id\/oauth2\/authorize/.test(loc));
    const stateCookie = cookieFrom(login, 'cco_bankid_state');
    check('sätter signerad state-cookie', Boolean(stateCookie));
    const state = new URL(loc).searchParams.get('state');

    console.log('\n2) CALLBACK (matchande personnummer) → nivå-2-session');
    const cb = await fetch(`${base}/api/v1/cco-portal/bankid/callback?code=xyz&state=${state}`, {
      redirect: 'manual',
      headers: { cookie: `cco_bankid_state=${stateCookie}` },
    });
    check('svarar 302 tillbaka till portalen', cb.status === 302);
    check(
      'landar på /portal-chat/<token>?l2=ok',
      /\/portal-chat\/.*l2=ok/.test(cb.headers.get('location') || '')
    );
    const sessionCookie = cookieFrom(cb, 'cco_portal_l2');
    check('sätter signerad nivå-2-session-cookie', Boolean(sessionCookie));

    console.log('\n3) ME → speglar inloggad nivå-2');
    const me = await fetch(`${base}/api/v1/cco-portal/me`, {
      headers: { cookie: `cco_portal_l2=${sessionCookie}` },
    });
    const body = await me.json();
    check('svarar 200', me.status === 200);
    check('authenticated=true, level=2', body.authenticated === true && body.level === 2);
    check('patientId = canonical p-owner', body.patientId === 'p-owner');

    console.log('\n4) SÄKERHET: fel BankID-ägare nekas');
    const app2 = express();
    app2.use(
      createCcoPortalBankIdRouter({
        env: {
          NODE_ENV: 'test',
          CRIIPTO_DOMAIN: 'hairtp.criipto.id',
          CRIIPTO_CLIENT_ID: 'urn:client',
        },
        baseUrl: 'https://portal.local',
        sessionSecret: 'smoke-secret',
        // Länken ägs av någon ANNAN än den som signerar med BankID.
        accessStore: { resolveToken: () => ({ tenantId: 'hairtpclinic', customerId: 'p-annan' }) },
        patientMasterStore: { listPatients: async () => ({ patients: [OWNER] }) },
        exchangeCode: async () => ({ ssn: '199001011234' }),
      })
    );
    const server2 = http.createServer(app2);
    await new Promise((r) => server2.listen(0, '127.0.0.1', r));
    const base2 = `http://127.0.0.1:${server2.address().port}`;
    const login2 = await fetch(`${base2}/api/v1/cco-portal/bankid/login?token=${TOKEN}`, {
      redirect: 'manual',
    });
    const sc2 = cookieFrom(login2, 'cco_bankid_state');
    const st2 = new URL(login2.headers.get('location')).searchParams.get('state');
    const cb2 = await fetch(`${base2}/api/v1/cco-portal/bankid/callback?code=x&state=${st2}`, {
      redirect: 'manual',
      headers: { cookie: `cco_bankid_state=${sc2}` },
    });
    check(
      'owner-mismatch nekas (l2=owner_mismatch)',
      /l2=owner_mismatch/.test(cb2.headers.get('location') || '')
    );
    check('ingen nivå-2-session sätts vid nekad', cookieFrom(cb2, 'cco_portal_l2') === null);
    await new Promise((r) => server2.close(r));
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} Smoke: ${pass} ok, ${fail} fel\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke kraschade:', err);
  process.exit(1);
});
