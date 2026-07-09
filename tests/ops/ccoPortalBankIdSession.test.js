'use strict';

/* Nivå-2-sömmen för kundportalens BankID-inloggning (Criipto OIDC). Ingen live-
 * trafik: kodutbytet är injicerat, dry-run/mock som default. Canonical patientId,
 * personnummer matchas EMOT patient-mastern och kastas. Avgörande regel:
 * personnumrets patientId måste vara den magiska tokenens ägare. */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isBankIdLive,
  createAuthRequest,
  resolveBankIdAcrValues,
  BANKID_ACR_QR,
  BANKID_ACR_SAME_DEVICE,
  pnrFromClaims,
  pnrEquals,
  resolvePatientByPnr,
  createLevelTwoSession,
  isSessionActive,
  verifyBankIdCallback,
  DEFAULT_SESSION_TTL_MS,
} = require('../../src/ops/ccoPortalBankIdSession');

function storeWith(patients) {
  return {
    patientMasterStore: { listPatients: async () => ({ patients, total: patients.length }) },
  };
}

test('isBankIdLive kräver BÅDE nyckel och gate=1', () => {
  assert.equal(isBankIdLive({}), false);
  assert.equal(isBankIdLive({ BANKID_API_KEY: 'k' }), false);
  assert.equal(isBankIdLive({ PORTAL_BANKID_LIVE: '1' }), false);
  assert.equal(isBankIdLive({ BANKID_API_KEY: 'k', PORTAL_BANKID_LIVE: '1' }), true);
});

test('createAuthRequest bygger Criipto authorize-URL med state+nonce', () => {
  const r = createAuthRequest({
    domain: 'hairtp.criipto.id',
    clientId: 'urn:client',
    redirectUri: 'https://arcana.hairtpclinic.com/api/v1/cco-portal/bankid/callback',
    tokenCustomerId: 'p-1',
  });
  assert.match(r.url, /^https:\/\/hairtp\.criipto\.id\/oauth2\/authorize\?/);
  assert.match(r.url, /response_type=code/);
  assert.match(r.url, /scope=openid/);
  assert.ok(r.state && r.nonce && r.state !== r.nonce);
  assert.match(r.url, new RegExp(`state=${r.state}`));
  assert.match(r.url, /acr_values=urn%3Agrn%3Aauthn%3Ase%3Abankid%3Aanother-device%3Aqr/);
});

test('resolveBankIdAcrValues: qr default, same-device bara vid explicit flow', () => {
  assert.equal(resolveBankIdAcrValues({ userAgent: 'Mozilla/5.0 (Macintosh)' }), BANKID_ACR_QR);
  assert.equal(
    resolveBankIdAcrValues({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS)' }),
    BANKID_ACR_QR
  );
  assert.equal(resolveBankIdAcrValues({ flow: 'same-device' }), BANKID_ACR_SAME_DEVICE);
});

test('createAuthRequest kastar utan tokenCustomerId (ingen anonym step-up)', () => {
  assert.throws(() =>
    createAuthRequest({ domain: 'd', clientId: 'c', redirectUri: 'https://x/cb' })
  );
});

test('pnrEquals matchar 12-siffrigt mot 10-siffrigt och formaterat', () => {
  assert.equal(pnrEquals('199001011234', '9001011234'), true);
  assert.equal(pnrEquals('19900101-1234', '199001011234'), true);
  assert.equal(pnrEquals('199001011234', '199001019999'), false);
  assert.equal(pnrEquals('', '199001011234'), false);
});

test('pnrFromClaims läser ssn, personalNumber och faller tillbaka på sub', () => {
  assert.equal(pnrFromClaims({ ssn: '19900101-1234' }), '199001011234');
  assert.equal(pnrFromClaims({ personalNumber: '199001011234' }), '199001011234');
  assert.equal(pnrFromClaims({ sub: '199001011234' }), '199001011234');
  assert.equal(pnrFromClaims({}), '');
});

test('resolvePatientByPnr → canonical patient.id, aldrig cliento-id', async () => {
  const stores = storeWith([
    { id: 'p-uuid-1', displayName: 'Anna', personnummer: '19900101-1234' },
    { id: 'p-uuid-2', displayName: 'Bo', personnummer: '19850505-5678' },
  ]);
  const r = await resolvePatientByPnr('199001011234', stores);
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-uuid-1');
  assert.equal(r.displayName, 'Anna');
});

test('resolvePatientByPnr matchar via cliento.personnummer men ger canonical id', async () => {
  const stores = storeWith([
    {
      id: 'p-9',
      displayName: 'Legacy',
      cliento: { id: 'cliento_9', personnummer: '199001011234' },
    },
  ]);
  const r = await resolvePatientByPnr('199001011234', stores);
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-9');
  assert.doesNotMatch(r.patientId, /^cliento_/);
});

test('resolvePatientByPnr → ambiguous vid flera träffar', async () => {
  const stores = storeWith([
    { id: 'p-a', personnummer: '199001011234' },
    { id: 'p-b', personnummer: '19900101-1234' },
  ]);
  const r = await resolvePatientByPnr('199001011234', stores);
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.patientId, null);
  assert.equal(r.candidates.length, 2);
});

test('resolvePatientByPnr → unmatched / no_pnr / store_unavailable', async () => {
  assert.equal((await resolvePatientByPnr('199001011234', storeWith([]))).status, 'unmatched');
  assert.equal((await resolvePatientByPnr('', storeWith([]))).status, 'no_pnr');
  assert.equal((await resolvePatientByPnr('199001011234', {})).status, 'store_unavailable');
});

test('createLevelTwoSession sätter 30-min TTL och kastar utan patientId', () => {
  const s = createLevelTwoSession({ patientId: 'p-1', nowMs: 1_000_000 });
  assert.equal(s.level, 2);
  assert.equal(s.patientId, 'p-1');
  assert.equal(s.expiresAtMs, 1_000_000 + DEFAULT_SESSION_TTL_MS);
  assert.throws(() => createLevelTwoSession({}));
});

test('isSessionActive respekterar utgång', () => {
  const s = createLevelTwoSession({ patientId: 'p-1', nowMs: 0 });
  assert.equal(isSessionActive(s, 1000), true);
  assert.equal(isSessionActive(s, DEFAULT_SESSION_TTL_MS + 1), false);
  assert.equal(isSessionActive(null, 0), false);
});

// ── verifyBankIdCallback — huvudflödet + säkerhetsnekanden ──────────────────

const OK_CLAIMS = { ssn: '199001011234' };
const OWNER_STORE = storeWith([
  { id: 'p-owner', displayName: 'Ägare', personnummer: '199001011234' },
]);

test('verifyBankIdCallback → verified när pnr matchar tokenägaren', async () => {
  const r = await verifyBankIdCallback(
    { code: 'c', returnedState: 's', expectedState: 's', tokenCustomerId: 'p-owner' },
    { mockClaims: OK_CLAIMS, patientMasterStore: OWNER_STORE.patientMasterStore }
  );
  assert.equal(r.status, 'verified');
  assert.equal(r.patientId, 'p-owner');
  assert.equal(r.session.level, 2);
  assert.equal(r.live, false);
});

test('verifyBankIdCallback NEKAR när personnumrets patient ≠ tokenägaren', async () => {
  // BankID tillhör p-owner, men den magiska länken ägs av någon annan.
  const r = await verifyBankIdCallback(
    { code: 'c', returnedState: 's', expectedState: 's', tokenCustomerId: 'p-annan' },
    { mockClaims: OK_CLAIMS, patientMasterStore: OWNER_STORE.patientMasterStore }
  );
  assert.equal(r.status, 'denied');
  assert.equal(r.reason, 'owner_mismatch');
  assert.equal(r.session, undefined);
});

test('verifyBankIdCallback NEKAR vid state-mismatch (CSRF-skydd)', async () => {
  const r = await verifyBankIdCallback(
    { code: 'c', returnedState: 'x', expectedState: 's', tokenCustomerId: 'p-owner' },
    { mockClaims: OK_CLAIMS, patientMasterStore: OWNER_STORE.patientMasterStore }
  );
  assert.equal(r.status, 'denied');
  assert.equal(r.reason, 'state_mismatch');
});

test('verifyBankIdCallback NEKAR när pnr inte finns i patient-mastern', async () => {
  const r = await verifyBankIdCallback(
    { code: 'c', returnedState: 's', expectedState: 's', tokenCustomerId: 'p-owner' },
    { mockClaims: { ssn: '190001019999' }, patientMasterStore: OWNER_STORE.patientMasterStore }
  );
  assert.equal(r.status, 'denied');
  assert.equal(r.reason, 'pnr_unmatched');
});

test('verifyBankIdCallback → dry_run när inga mock-claims och ej live', async () => {
  const r = await verifyBankIdCallback(
    { code: 'c', returnedState: 's', expectedState: 's', tokenCustomerId: 'p-owner' },
    { patientMasterStore: OWNER_STORE.patientMasterStore }
  );
  assert.equal(r.status, 'dry_run');
});

test('verifyBankIdCallback → error utan code, denied utan tokenägare', async () => {
  const noCode = await verifyBankIdCallback(
    { returnedState: 's', expectedState: 's', tokenCustomerId: 'p-owner' },
    { mockClaims: OK_CLAIMS, patientMasterStore: OWNER_STORE.patientMasterStore }
  );
  assert.equal(noCode.status, 'error');
  const noOwner = await verifyBankIdCallback(
    { code: 'c', returnedState: 's', expectedState: 's' },
    { mockClaims: OK_CLAIMS, patientMasterStore: OWNER_STORE.patientMasterStore }
  );
  assert.equal(noOwner.status, 'denied');
  assert.equal(noOwner.reason, 'no_token_owner');
});

test('verifyBankIdCallback live-läge kräver injicerat exchangeCode', async () => {
  const r = await verifyBankIdCallback(
    { code: 'c', returnedState: 's', expectedState: 's', tokenCustomerId: 'p-owner' },
    {
      patientMasterStore: OWNER_STORE.patientMasterStore,
      env: { BANKID_API_KEY: 'k', PORTAL_BANKID_LIVE: '1' },
    }
  );
  assert.equal(r.status, 'error');
  assert.equal(r.reason, 'no_exchange');
});

test('verifyBankIdCallback live-läge verifierar via exchangeCode', async () => {
  const r = await verifyBankIdCallback(
    { code: 'auth-code', returnedState: 's', expectedState: 's', tokenCustomerId: 'p-owner' },
    {
      patientMasterStore: OWNER_STORE.patientMasterStore,
      exchangeCode: async (code) => {
        assert.equal(code, 'auth-code');
        return { ssn: '199001011234' };
      },
      env: { BANKID_API_KEY: 'k', PORTAL_BANKID_LIVE: '1' },
    }
  );
  assert.equal(r.status, 'verified');
  assert.equal(r.live, true);
});
