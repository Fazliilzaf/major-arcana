'use strict';

/**
 * mock-bankid-oidc-e2e.js — kör HELA BankID-live-kedjan mot en RIKTIG OIDC-server
 * (en lokal mock som talar samma endpoints som Criipto). Till skillnad från
 * scripts/smoke-portal-bankid.js mockas INTE kodutbytet: routern gör ett riktigt
 * HTTP-token-utbyte, får ett riktigt RS256-signerat id_token och verifierar det
 * mot en riktig JWKS-endpoint (ccoCriiptoIdToken).
 *
 * Skillnad mot prod: mock-servern i stället för Criiptos tenant, och http i
 * stället för https (Criipto-URL:er är https). All LOGIK är den skarpa.
 *
 * Kör:  node scripts/mock-bankid-oidc-e2e.js
 */

const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');

const { createCcoPortalBankIdRouter } = require('../src/routes/ccoPortalBankId');
const { verifyCriiptoIdToken } = require('../src/ops/ccoCriiptoIdToken');

const CLIENT_ID = 'urn:mock:client';
const PNR = '199001011234';
const OWNER = { id: 'p-owner', displayName: 'Testkund', personnummer: PNR };
const TOKEN = 'magic-token-abc';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'mock-key-1';
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log('  ✓ ' + name);
  } else {
    fail += 1;
    console.log('  ✗ ' + name + (extra ? ' — ' + extra : ''));
  }
}
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function cookieFrom(res, name) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const hit = set.find((c) => c.startsWith(name + '='));
  return hit ? hit.split(';')[0].slice(name.length + 1) : null;
}

// ── Mock Criipto/OIDC-provider (riktig HTTP-server) ────────────────────────
// `ref.issuer` sätts efter listen() (late binding) — annars vet vi inte porten.
function buildMockOidc(ref) {
  const app = express();
  const codes = new Map(); // code -> { nonce }

  app.get('/.well-known/openid-configuration', (req, res) => {
    res.json({ issuer: ref.issuer, jwks_uri: ref.issuer + '/.well-known/jwks' });
  });
  app.get('/.well-known/jwks', (req, res) => res.json({ keys: [JWK] }));

  // "BankID-signering": ta emot authorize, redirecta direkt tillbaka med code.
  app.get('/oauth2/authorize', (req, res) => {
    const code = crypto.randomBytes(12).toString('hex');
    codes.set(code, { nonce: String(req.query.nonce || '') });
    const redirectUri = String(req.query.redirect_uri || '');
    const state = String(req.query.state || '');
    res.redirect(302, redirectUri + '?code=' + code + '&state=' + encodeURIComponent(state));
  });

  // Token-endpoint: returnera ett riktigt RS256-signerat id_token.
  app.post('/oauth2/token', express.urlencoded({ extended: false }), (req, res) => {
    const rec = codes.get(String(req.body.code || ''));
    if (!rec) return res.status(400).json({ error: 'invalid_grant' });
    const header = b64url({ alg: 'RS256', kid: KID, typ: 'JWT' });
    const payload = b64url({
      iss: ref.issuer,
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 300,
      ssn: PNR,
      nonce: rec.nonce,
    });
    const sig = crypto
      .sign('RSA-SHA256', Buffer.from(header + '.' + payload), privateKey)
      .toString('base64url');
    res.json({ id_token: header + '.' + payload + '.' + sig, token_type: 'Bearer' });
  });

  return app;
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

async function main() {
  // 1) Starta mock-OIDC-servern, sätt sedan issuer från den faktiska porten.
  const oidcRef = { issuer: '' };
  const oidc = await listen(buildMockOidc(oidcRef));
  const realHost = '127.0.0.1:' + oidc.port;
  const realIssuer = 'http://' + realHost;
  oidcRef.issuer = realIssuer;

  // 2) RIKTIGT kodutbyte: HTTP-POST till token-endpoint + JWKS-verifierat id_token.
  //    Samma logik som makeCriiptoExchange, men http mot mocken.
  function makeRealHttpExchange(nonce) {
    return async function exchangeCode(code) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: 'mock-secret',
        redirect_uri: baseUrl + '/api/v1/cco-portal/bankid/callback',
      });
      const resp = await fetch(realIssuer + '/oauth2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!resp.ok) throw new Error('token_' + resp.status);
      const json = await resp.json();
      const verdict = await verifyCriiptoIdToken(json.id_token, {
        domain: realHost,
        clientId: CLIENT_ID,
        nonce,
        expectedIssuer: realIssuer,
        fetchJwks: async () => {
          const r = await fetch(realIssuer + '/.well-known/jwks');
          return r.json();
        },
      });
      if (!verdict.valid) throw new Error('id_token_invalid:' + verdict.reason);
      return verdict.claims;
    };
  }

  // 3) Montera den RIKTIGA portal-routern i live-läge; exchange gör riktig HTTP.
  //    nonce plockas ur authorize-URL:en per försök (som Criipto gör).
  let currentNonce = '';
  const app = express();
  app.use(
    createCcoPortalBankIdRouter({
      env: {
        NODE_ENV: 'test',
        CRIIPTO_DOMAIN: realHost,
        CRIIPTO_CLIENT_ID: CLIENT_ID,
        BANKID_API_KEY: 'criipto',
        PORTAL_BANKID_LIVE: '1', // <-- LIVE-läge
      },
      baseUrl: '', // härleds från request-host nedan
      sessionSecret: 'e2e-secret',
      accessStore: {
        resolveToken: (t) =>
          t === TOKEN ? { tenantId: 'hairtpclinic', customerId: 'p-owner' } : null,
      },
      patientMasterStore: { listPatients: async () => ({ patients: [OWNER] }) },
      commercialStore: {
        getPatientRegisterCase: async () => ({
          quoteStatus: 'sent',
          coolingOffEndsAt: new Date(Date.now() - 86400000).toISOString(),
          offerPlan: { method: 'DHI', treatmentLabel: 'DHI — Hårlinje' },
        }),
      },
      exchangeCode: (code) => makeRealHttpExchange(currentNonce)(code),
    })
  );
  const appSrv = await listen(app);
  const baseUrl = 'http://127.0.0.1:' + appSrv.port;

  try {
    console.log('\n== BankID LIVE-kedja mot riktig OIDC-server ==');

    console.log('\n1) LOGIN → authorize-URL mot mock-Criipto');
    const login = await fetch(baseUrl + '/api/v1/cco-portal/bankid/login?token=' + TOKEN, {
      redirect: 'manual',
    });
    check('login svarar 302', login.status === 302);
    const authUrl = new URL(login.headers.get('location'));
    check('authorize pekar på mock-Criipto', authUrl.host === realHost, authUrl.host);
    const stateCookie = cookieFrom(login, 'cco_bankid_state');
    check('signerad state-cookie satt', Boolean(stateCookie));
    currentNonce = authUrl.searchParams.get('nonce'); // som Criipto: nonce i authorize

    console.log('\n2) "BankID-signering" mot mock-provider (riktig HTTP-redirect)');
    const authHttp = 'http://' + realHost + authUrl.pathname + authUrl.search;
    const signed = await fetch(authHttp, { redirect: 'manual' });
    check('provider redirectar tillbaka med code', signed.status === 302);
    const back = new URL(signed.headers.get('location'), baseUrl);
    check('code + state med i callback', Boolean(back.searchParams.get('code')), back.search);

    console.log('\n3) CALLBACK → riktigt token-utbyte + JWKS-verifiering');
    const cb = await fetch(baseUrl + back.pathname + back.search, {
      redirect: 'manual',
      headers: { cookie: 'cco_bankid_state=' + stateCookie },
    });
    check('callback svarar 302', cb.status === 302);
    check(
      'landar på /portal-chat/<token>?l2=ok',
      /\/portal-chat\/.*l2=ok/.test(cb.headers.get('location') || ''),
      cb.headers.get('location')
    );
    const sessionCookie = cookieFrom(cb, 'cco_portal_l2');
    check('nivå-2-session-cookie satt', Boolean(sessionCookie));

    console.log('\n4) ME → inloggad, med offert-payload');
    const me = await fetch(baseUrl + '/api/v1/cco-portal/me', {
      headers: { cookie: 'cco_portal_l2=' + sessionCookie },
    });
    const body = await me.json();
    check('me svarar 200', me.status === 200);
    check('authenticated=true, level=2', body.authenticated === true && body.level === 2);
    check('patientId = canonical p-owner', body.patientId === 'p-owner');
    check(
      'offert med (ready_to_sign)',
      body.offer && body.offer.signing && body.offer.signing.status === 'ready_to_sign',
      body.offer && body.offer.signing && body.offer.signing.status
    );
  } finally {
    await new Promise((r) => appSrv.server.close(r));
    await new Promise((r) => oidc.server.close(r));
  }

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' E2E: ' + pass + ' ok, ' + fail + ' fel\n');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E kraschade:', err);
  process.exit(1);
});
