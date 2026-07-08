'use strict';

/* Verifierar Criiptos id_token (RS256) mot JWKS. Testet genererar en riktig
 * RSA-nyckel, signerar JWT:er och kontrollerar att giltiga token accepteras och
 * att manipulation/fel iss/aud/exp/nonce/kid nekas. Ingen nättrafik. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { verifyCriiptoIdToken } = require('../../src/ops/ccoCriiptoIdToken');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };
const JWKS = { keys: [JWK] };

const DOMAIN = 'hairtp.criipto.id';
const CLIENT = 'urn:my:client';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeToken(claims = {}, { kid = KID, alg = 'RS256', key = privateKey } = {}) {
  const header = b64url({ alg, kid, typ: 'JWT' });
  const payload = b64url({
    iss: `https://${DOMAIN}`,
    aud: CLIENT,
    exp: Math.floor(Date.now() / 1000) + 300,
    ssn: '199001011234',
    nonce: 'n-1',
    ...claims,
  });
  const signingInput = `${header}.${payload}`;
  if (alg === 'none') return `${signingInput}.`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url');
  return `${signingInput}.${sig}`;
}

const OPTS = { domain: DOMAIN, clientId: CLIENT, nonce: 'n-1', jwks: JWKS };

test('giltigt id_token → valid, returnerar claims', async () => {
  const r = await verifyCriiptoIdToken(makeToken(), OPTS);
  assert.equal(r.valid, true);
  assert.equal(r.claims.ssn, '199001011234');
});

test('manipulerad payload → bad_signature', async () => {
  const token = makeToken();
  const parts = token.split('.');
  const tampered = Buffer.from(JSON.stringify({ ssn: '190001010000' })).toString('base64url');
  const r = await verifyCriiptoIdToken(`${parts[0]}.${tampered}.${parts[2]}`, OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'bad_signature');
});

test('fel signeringsnyckel (angripare) → bad_signature', async () => {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const r = await verifyCriiptoIdToken(makeToken({}, { key: other }), OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'bad_signature');
});

test('alg none avvisas', async () => {
  const r = await verifyCriiptoIdToken(makeToken({}, { alg: 'none' }), OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'alg_not_rs256');
});

test('okänd kid → kid_not_found', async () => {
  const r = await verifyCriiptoIdToken(makeToken({}, { kid: 'annan-kid' }), OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'kid_not_found');
});

test('fel issuer → iss_mismatch', async () => {
  const r = await verifyCriiptoIdToken(makeToken({ iss: 'https://evil.example' }), OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'iss_mismatch');
});

test('fel aud → aud_mismatch', async () => {
  const r = await verifyCriiptoIdToken(makeToken({ aud: 'urn:other' }), OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'aud_mismatch');
});

test('utgånget token → expired', async () => {
  const r = await verifyCriiptoIdToken(
    makeToken({ exp: Math.floor(Date.now() / 1000) - 3600 }),
    OPTS
  );
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'expired');
});

test('fel nonce → nonce_mismatch (replay-skydd)', async () => {
  const r = await verifyCriiptoIdToken(makeToken({ nonce: 'n-2' }), OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'nonce_mismatch');
});

test('aud som array som innehåller client_id accepteras', async () => {
  const r = await verifyCriiptoIdToken(makeToken({ aud: ['urn:other', CLIENT] }), OPTS);
  assert.equal(r.valid, true);
});

test('injicerad fetchJwks används när jwks inte ges', async () => {
  let called = false;
  const r = await verifyCriiptoIdToken(makeToken(), {
    domain: DOMAIN,
    clientId: CLIENT,
    nonce: 'n-1',
    fetchJwks: async (d) => {
      called = true;
      assert.equal(d, DOMAIN);
      return JWKS;
    },
  });
  assert.equal(called, true);
  assert.equal(r.valid, true);
});

test('trasig JWKS-hämtning → jwks_fetch_failed, kraschar inte', async () => {
  const r = await verifyCriiptoIdToken(makeToken(), {
    domain: DOMAIN,
    clientId: CLIENT,
    fetchJwks: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(r.valid, false);
  assert.match(r.reason, /^jwks_fetch_failed:/);
});
