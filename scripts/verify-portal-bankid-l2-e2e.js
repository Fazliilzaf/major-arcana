'use strict';

/**
 * verify-portal-bankid-l2-e2e — SÄKERT test-bevis av kundportalens BankID
 * nivå-2-kedja, HELA vägen, in-process, utan fysisk BankID-app och utan
 * Criipto/Idura-nätverk.
 *
 * Kör:  node scripts/verify-portal-bankid-l2-e2e.js
 *       npm run verify:portal-bankid-l2-e2e
 *
 * VARFÖR detta script finns
 * -------------------------
 * Serversidan (login → authorize → QR-poll) är verifierad korrekt. Blockeringen
 * som återstår är REN MILJÖMATCHNING: prod kör mot Iduras TEST-broker och ett
 * PRODUKTIONS-BankID kan inte signera mot test-brokern ("QR-koden är ogiltig"),
 * och Idura test har ingen eID-simulator påslagen. Det går alltså inte att
 * bevisa kedjan via en riktig app utan att antingen (a) aktivera test-eID i
 * Idura/Criipto eller (b) gå till prod-cert. Se runbooken, avsnitt "Väg A".
 *
 * Detta script bevisar istället HELA nivå-2-sömmen i kod, deterministiskt:
 *   1) login            → 302 till Criipto authorize + signerad state-cookie
 *   2) callback (match) → verified → nivå-2-session-cookie → redirect l2=ok
 *   3) callback (miss)  → denied owner_mismatch, INGEN session-cookie
 *   4) callback (okänd) → denied pnr_unmatched, INGEN session-cookie
 *   5) /me (session)    → 200 authenticated=true, level=2, canonical patientId
 *   6) /me (ingen)      → 401 authenticated=false
 *   7) /me (manipulerad)→ 401 (fel cookie-signatur)
 *
 * SÄKERHET / SCOPE
 * ----------------
 *   - Ingen riktig nätverkstrafik: Criiptos kodutbyte (`exchangeCode`) är
 *     INJICERAT (mock som returnerar valfritt personnummer). Det skarpa,
 *     JWKS-verifierade utbytet rörs inte.
 *   - Ingen riktig patientdata: en fixture-patient-master i minnet.
 *   - Inga hemligheter i loggar: personnummer maskeras, cookievärden loggas ej.
 *   - Den riktiga `ccoPortalAccessStore` (magisk länk-token) används mot en
 *     temp-fil under os.tmpdir() så att HELA kedjan (issueToken → resolveToken
 *     → login → callback → /me) bevisas, utan att röra ./data.
 *   - Detta är ETT FRISTÅENDE SCRIPT, inte en route. Ingen test-callback-
 *     simulator monteras i servern → det finns ingen prod-bypass att missbruka.
 */

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');
const assert = require('node:assert/strict');
const express = require('express');

const { createCcoPortalBankIdRouter } = require('../src/routes/ccoPortalBankId');
const { createCcoPortalAccessStore } = require('../src/ops/ccoPortalAccessStore');

// ── Fixture-data (ingen riktig patientdata) ────────────────────────────────
const TENANT = 'hairtpclinic';
const OWNER_PNR = '199001011234'; // testpersonnummer, aldrig en riktig person
const STRANGER_PNR = '198505055678';
const UNKNOWN_PNR = '190001019999'; // finns ej i mastern

const OWNER = { id: 'p-owner-uuid', displayName: 'Testkund Öberg', personnummer: '19900101-1234' };
const STRANGER = { id: 'p-annan-uuid', displayName: 'Annan Ärlig', personnummer: '19850505-5678' };

const FIXTURE_PATIENTS = [OWNER, STRANGER];
const patientMasterStore = {
  listPatients: async () => ({ patients: FIXTURE_PATIENTS, total: FIXTURE_PATIENTS.length }),
};

// Minimal offert-källa så /me kan bevisa payload-vägen (read-only).
const commercialStore = {
  getPatientRegisterCase: async ({ patientId }) =>
    patientId === OWNER.id
      ? {
          quoteStatus: 'sent',
          coolingOffEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
          offerPlan: { method: 'DHI', treatmentLabel: 'DHI — Hårlinje' },
          customerName: OWNER.displayName,
        }
      : null,
};

// ── Testramverk (litet, tydligt) ───────────────────────────────────────────
let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Maskera personnummer i loggar: behåll bara födelseår, dölj resten. */
function maskPnr(pnr) {
  const digits = String(pnr || '').replace(/\D+/g, '');
  return digits ? `${digits.slice(0, 4)}****-****` : '(inget)';
}

function cookieFrom(res, name) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const hit = set.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0].slice(name.length + 1) : null;
}

/**
 * Montera routern med injicerat kodutbyte som returnerar givet personnummer,
 * starta en in-memory Express-server, kör `run(base)`, städa.
 */
async function withServer({ accessStore, exchangePnr }, run) {
  const app = express();
  app.use(
    createCcoPortalBankIdRouter({
      env: {
        NODE_ENV: 'test',
        CRIIPTO_DOMAIN: 'hairtp.criipto.id',
        CRIIPTO_CLIENT_ID: 'urn:client',
      },
      baseUrl: 'https://portal.local',
      sessionSecret: 'e2e-secret-not-a-real-secret',
      accessStore,
      patientMasterStore,
      commercialStore,
      // INJICERAT kodutbyte — ingen riktig Criipto/nätverk. Returnerar det
      // personnummer testfallet vill simulera att BankID gav tillbaka.
      exchangeCode: async () => ({ ssn: exchangePnr }),
    })
  );
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

/** Kör login→callback och returnera { cb, sessionCookie, location }. */
async function driveLoginCallback(base, token, { code = 'authz-code-xyz' } = {}) {
  const login = await fetch(
    `${base}/api/v1/cco-portal/bankid/login?token=${encodeURIComponent(token)}`,
    {
      redirect: 'manual',
    }
  );
  assert.equal(login.status, 302, 'login ska svara 302');
  const stateCookie = cookieFrom(login, 'cco_bankid_state');
  assert.ok(stateCookie, 'login ska sätta state-cookie');
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const cb = await fetch(
    `${base}/api/v1/cco-portal/bankid/callback?code=${code}&state=${encodeURIComponent(state)}`,
    { redirect: 'manual', headers: { cookie: `cco_bankid_state=${stateCookie}` } }
  );
  return {
    login,
    cb,
    sessionCookie: cookieFrom(cb, 'cco_portal_l2'),
    location: cb.headers.get('location') || '',
  };
}

async function main() {
  console.log('\n=== BankID nivå-2 E2E-bevis (in-process, ingen app/nätverk) ===');
  console.log(`Fixture-ägare pnr: ${maskPnr(OWNER_PNR)} → canonical ${OWNER.id}`);

  // Riktig access-store mot temp-fil → bevisar issueToken→resolveToken-kedjan.
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bankid-l2-e2e-'));
  const accessStore = await createCcoPortalAccessStore({
    filePath: path.join(tmpDir, 'portal-access-tokens.json'),
  });

  try {
    // Mynta magiska länkar via den RIKTIGA access-storen.
    const ownerLink = await accessStore.issueToken({ tenantId: TENANT, customerId: OWNER.id });
    const strangerLink = await accessStore.issueToken({
      tenantId: TENANT,
      customerId: STRANGER.id,
    });
    check('access-store myntar ägarens magiska token', Boolean(ownerLink.token));
    check('access-store myntar annan patients magiska token', Boolean(strangerLink.token));

    // ── 1+2+5: Happy path ────────────────────────────────────────────────
    console.log('\n1–2) LOGIN → CALLBACK (matchande pnr) → nivå-2-session');
    await withServer({ accessStore, exchangePnr: OWNER_PNR }, async (base) => {
      const login = await fetch(
        `${base}/api/v1/cco-portal/bankid/login?token=${encodeURIComponent(ownerLink.token)}`,
        { redirect: 'manual' }
      );
      check('login → 302', login.status === 302);
      const loc = login.headers.get('location') || '';
      check(
        'login → redirect till Criipto authorize',
        /hairtp\.criipto\.id\/oauth2\/authorize\?/.test(loc)
      );
      check(
        'authorize-URL bär acr_values BankID QR',
        /acr_values=urn%3Agrn%3Aauthn%3Ase%3Abankid/.test(loc)
      );
      check('login sätter signerad state-cookie', Boolean(cookieFrom(login, 'cco_bankid_state')));

      const stateCookie = cookieFrom(login, 'cco_bankid_state');
      const state = new URL(loc).searchParams.get('state');
      const cb = await fetch(
        `${base}/api/v1/cco-portal/bankid/callback?code=authz&state=${encodeURIComponent(state)}`,
        { redirect: 'manual', headers: { cookie: `cco_bankid_state=${stateCookie}` } }
      );
      check('callback → 302 tillbaka till portalen', cb.status === 302);
      check('callback → l2=ok', /\/portal-chat\/.*\?l2=ok$/.test(cb.headers.get('location') || ''));
      const sessionCookie = cookieFrom(cb, 'cco_portal_l2');
      check('callback sätter signerad nivå-2-session-cookie', Boolean(sessionCookie));

      console.log('\n5) ME (giltig session) → authenticated nivå-2 + payload');
      const me = await fetch(`${base}/api/v1/cco-portal/me`, {
        headers: { cookie: `cco_portal_l2=${sessionCookie}` },
      });
      check('/me → 200', me.status === 200);
      const body = await me.json();
      check('/me authenticated=true, level=2', body.authenticated === true && body.level === 2);
      check('/me patientId = canonical (ej personnummer)', body.patientId === OWNER.id);
      check('/me lämnar inte ut personnummer', JSON.stringify(body).indexOf(OWNER_PNR) === -1);
      check('/me offert-payload byggd (hasOffer)', Boolean(body.offer && body.offer.hasOffer));
      check('/me live=false (dry-run/injicerat utbyte)', body.live === false);
    });

    // ── 3: owner_mismatch (läckt länk + fel BankID) ──────────────────────
    console.log('\n3) SÄKERHET: callback med fel ägare → owner_mismatch');
    await withServer({ accessStore, exchangePnr: OWNER_PNR }, async (base) => {
      // Länken ägs av STRANGER, men BankID gav ägarens personnummer.
      const { cb, sessionCookie, location } = await driveLoginCallback(base, strangerLink.token);
      check('callback → 302', cb.status === 302);
      check('nekas med l2=owner_mismatch', /l2=owner_mismatch/.test(location));
      check('INGEN nivå-2-session sätts vid owner_mismatch', sessionCookie === null);
    });

    // ── 4: pnr_unmatched (BankID-pnr saknas i mastern) ───────────────────
    console.log('\n4) SÄKERHET: callback med okänt personnummer → pnr_unmatched');
    await withServer({ accessStore, exchangePnr: UNKNOWN_PNR }, async (base) => {
      const { cb, sessionCookie, location } = await driveLoginCallback(base, ownerLink.token);
      check('callback → 302', cb.status === 302);
      check('nekas med l2=pnr_unmatched', /l2=pnr_unmatched/.test(location));
      check('INGEN nivå-2-session sätts vid pnr_unmatched', sessionCookie === null);
    });

    // ── 6+7: /me utan / med manipulerad session ──────────────────────────
    console.log('\n6–7) ME utan cookie → 401, ME med manipulerad cookie → 401');
    await withServer({ accessStore, exchangePnr: OWNER_PNR }, async (base) => {
      const noCookie = await fetch(`${base}/api/v1/cco-portal/me`);
      check('/me utan cookie → 401', noCookie.status === 401);
      check(
        '/me utan cookie → authenticated=false',
        (await noCookie.json()).authenticated === false
      );

      const tampered = await fetch(`${base}/api/v1/cco-portal/me`, {
        headers: { cookie: 'cco_portal_l2=eyJwYXRpZW50SWQiOiJwLW93bmVyLXV1aWQifQ.badsig' },
      });
      check('/me med manipulerad cookie → 401 (fel signatur)', tampered.status === 401);
    });

    // Sanity: samma pnr men löst mot en ANNAN patient stannar canonical.
    check('fixture har unika canonical id:n', OWNER.id !== STRANGER.id);
    check('STRANGER_PNR skiljer sig från OWNER_PNR', OWNER_PNR !== STRANGER_PNR);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} E2E-bevis: ${pass} ok, ${fail} fel`);
  if (fail === 0) {
    console.log(
      'Hela nivå-2-kedjan bevisad i kod. Återstår för RIKTIGT BankID: aktivera\n' +
        'Idura/Criipto test-eID (väg A) ELLER prod-cert + prod-domän. Se runbook.\n'
    );
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E-bevis kraschade:', err);
  process.exit(1);
});
