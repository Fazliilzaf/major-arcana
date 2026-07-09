'use strict';

/**
 * ccoPortalBankIdSession — nivå-2-sömmen för kundportalens BankID-inloggning
 * via Criipto (OIDC-broker). Se docs/cco-kundportal-inloggning-kontrakt.md.
 *
 * SÄKERHET / SCOPE:
 *   - Ingen live-nätverkstrafik i denna modul. Kodutbytet (`exchangeCode`) är en
 *     INJICERAD funktion — dry-run/mock som default, live bara när
 *     BANKID_API_KEY är satt OCH PORTAL_BANKID_LIVE === '1'.
 *   - Read-only mot patient-mastern (listPatients), skriver inget.
 *   - Canonical kund-id = patient.id (patientId). Personnummer lagras inte som
 *     id — det matchas EMOT patient-mastern och kastas.
 *   - Den avgörande regeln: personnumrets patientId måste vara SAMMA som den
 *     magiska tokenens ägare (tokenCustomerId). Annars nekas (skydd mot att en
 *     läckt länk kombineras med fel BankID).
 *
 * Ren funktion med injicerade beroenden — enkel att enhetstesta utan nät/fs.
 */

const crypto = require('node:crypto');

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inaktivitet (beslutat)

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Strippa personnummer till bara siffror (tolerant mot YYYYMMDD-XXXX etc). */
function pnrDigits(value) {
  return text(value).replace(/\D+/g, '');
}

/**
 * Två personnummer är samma person om deras siffror matchar. BankID/Criipto ger
 * 12 siffror (YYYYMMDDXXXX); patient-mastern kan ha 10 eller 12. Jämför på de
 * sista 10 siffrorna när längderna skiljer.
 */
function pnrEquals(a, b) {
  const da = pnrDigits(a);
  const db = pnrDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const tailA = da.slice(-10);
  const tailB = db.slice(-10);
  return tailA.length === 10 && tailA === tailB;
}

/** Live bara med både nyckel och explicit gate — annars dry-run/mock. */
function isBankIdLive(env = process.env) {
  return Boolean(text(env.BANKID_API_KEY)) && text(env.PORTAL_BANKID_LIVE) === '1';
}

/** Idura/Criipto acr_values — hämtat från tenant OIDC discovery. */
const BANKID_ACR_QR = 'urn:grn:authn:se:bankid:another-device:qr';
const BANKID_ACR_SAME_DEVICE = 'urn:grn:authn:se:bankid:same-device';
const BANKID_ACR_DEFAULT = 'urn:grn:authn:se:bankid';

function isMobileUserAgent(userAgent) {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(text(userAgent));
}

/**
 * Välj BankID-flöde: QR (dator→mobil, eller mobil skannar QR på skärmen) eller
 * same-device (mobil→BankID-app via autostart). Default mobil = QR tills iOS
 * autostart mot Idura test-RP är stabilt (same-device ger "Något gick fel").
 * Override: PORTAL_BANKID_ACR_VALUES eller ?flow=same-device|qr på login.
 */
function resolveBankIdAcrValues({ flow, userAgent, env = process.env } = {}) {
  const override = text(env.PORTAL_BANKID_ACR_VALUES);
  if (override) return override;
  const f = text(flow).toLowerCase();
  if (f === 'same-device' || f === 'same_device' || f === 'mobile') return BANKID_ACR_SAME_DEVICE;
  if (f === 'qr' || f === 'desktop') return BANKID_ACR_QR;
  if (isMobileUserAgent(userAgent)) return BANKID_ACR_QR;
  return BANKID_ACR_QR;
}

/**
 * Bygg Criiptos OIDC authorize-URL. Anroparen persisterar `state`/`nonce`
 * (server-side) och verifierar dem i callbacken.
 *
 * @returns {{url:string, state:string, nonce:string}}
 */
function createAuthRequest({
  domain,
  clientId,
  redirectUri,
  tokenCustomerId,
  acrValues = BANKID_ACR_QR,
  env = process.env,
} = {}) {
  const brokerDomain = text(domain) || text(env.CRIIPTO_DOMAIN);
  const client = text(clientId) || text(env.CRIIPTO_CLIENT_ID);
  const redirect = text(redirectUri);
  const owner = text(tokenCustomerId);
  if (!brokerDomain) throw new Error('createAuthRequest: domain/CRIIPTO_DOMAIN saknas');
  if (!client) throw new Error('createAuthRequest: clientId/CRIIPTO_CLIENT_ID saknas');
  if (!redirect) throw new Error('createAuthRequest: redirectUri saknas');
  if (!owner) throw new Error('createAuthRequest: tokenCustomerId saknas');

  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  const params = new URLSearchParams({
    client_id: client,
    redirect_uri: redirect,
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid',
    state,
    nonce,
    acr_values: acrValues,
  });
  const base = brokerDomain.replace(/\/+$/, '');
  const url = `https://${base.replace(/^https?:\/\//, '')}/oauth2/authorize?${params.toString()}`;
  return { url, state, nonce };
}

/** Läs personnummer ur OIDC-claims (Criipto lägger det i `ssn`, ibland `sub`). */
function pnrFromClaims(claims = {}) {
  const raw =
    text(claims.ssn) ||
    text(claims.personalNumber) ||
    text(claims.socialno) ||
    text(claims['https://claims.oidc.se/1.0/personalNumber']) ||
    text(claims.sub);
  return pnrDigits(raw);
}

/**
 * Matcha ett personnummer mot patient-mastern → canonical patientId.
 * Read-only. Exakt en → matched. Flera → ambiguous. Ingen → unmatched.
 */
async function resolvePatientByPnr(pnr, { patientMasterStore, tenantId = 'hairtpclinic' } = {}) {
  const target = pnrDigits(pnr);
  const base = { patientId: null, displayName: null };
  if (!target) return { ...base, status: 'no_pnr' };
  if (typeof patientMasterStore?.listPatients !== 'function') {
    return { ...base, status: 'store_unavailable' };
  }
  const result = await patientMasterStore.listPatients({ tenantId, limit: 20000 });
  const patients = Array.isArray(result && result.patients) ? result.patients : [];

  const byId = new Map();
  for (const p of patients) {
    const sources = [
      p.personnummer,
      p.cliento && p.cliento.personnummer,
      p.pipedrive && p.pipedrive.personnummer,
    ];
    if (!sources.some((s) => pnrEquals(s, target))) continue;
    const id = text(p.id) || text(p.patientId); // ALLTID canonical id
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, { patientId: id, displayName: text(p.displayName) || null });
  }

  const matches = [...byId.values()];
  if (matches.length === 0) return { ...base, status: 'unmatched' };
  if (matches.length > 1) return { ...base, status: 'ambiguous', candidates: matches };
  return { ...matches[0], status: 'matched' };
}

/**
 * Skapa en nivå-2-session efter verifierad BankID. Enforce:ar canonical-regeln.
 */
function createLevelTwoSession({
  patientId,
  tenantId = 'hairtpclinic',
  ttlMs = DEFAULT_SESSION_TTL_MS,
  nowMs = Date.now(),
} = {}) {
  const id = text(patientId);
  if (!id) throw new Error('createLevelTwoSession: patientId saknas');
  const created = Number.isFinite(nowMs) ? nowMs : Date.now();
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_SESSION_TTL_MS;
  return {
    sessionId: crypto.randomBytes(24).toString('hex'),
    level: 2,
    tenantId: text(tenantId),
    patientId: id,
    createdAt: new Date(created).toISOString(),
    expiresAt: new Date(created + ttl).toISOString(),
    expiresAtMs: created + ttl,
  };
}

/** Är sessionen fortfarande giltig? (inaktivitets-TTL; anroparen förnyar). */
function isSessionActive(session, nowMs = Date.now()) {
  const exp = Number(session && session.expiresAtMs);
  if (!Number.isFinite(exp)) return false;
  return (Number.isFinite(nowMs) ? nowMs : Date.now()) < exp;
}

/**
 * Verifiera BankID-callbacken och skapa nivå-2-session om allt stämmer.
 *
 * @param {object} ref
 * @param {string} ref.code             OIDC authorization code från callbacken
 * @param {string} ref.returnedState    state som brokern skickade tillbaka
 * @param {string} ref.expectedState    state vi sparade i createAuthRequest
 * @param {string} ref.tokenCustomerId  patientId från den magiska tokenens ägare
 * @param {string} [ref.tenantId]
 * @param {object} deps
 * @param {function} [deps.exchangeCode] async (code) => claims. Krävs live.
 * @param {object}   [deps.mockClaims]   claims att använda i dry-run/test.
 * @param {object}   deps.patientMasterStore
 * @param {object}   [deps.env]
 * @returns {Promise<{status:string, session?:object, patientId?:string, reason?:string}>}
 */
async function verifyBankIdCallback(ref = {}, deps = {}) {
  const code = text(ref.code);
  const returnedState = text(ref.returnedState);
  const expectedState = text(ref.expectedState);
  const tokenCustomerId = text(ref.tokenCustomerId);
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const { exchangeCode, mockClaims, patientMasterStore, env = process.env } = deps;

  if (!tokenCustomerId) return { status: 'denied', reason: 'no_token_owner' };
  if (!code) return { status: 'error', reason: 'no_code' };
  if (!expectedState || returnedState !== expectedState) {
    return { status: 'denied', reason: 'state_mismatch' };
  }

  // Hämta claims. Live kräver injicerat kodutbyte; dry-run använder mockClaims.
  let claims = null;
  if (isBankIdLive(env)) {
    if (typeof exchangeCode !== 'function') return { status: 'error', reason: 'no_exchange' };
    claims = await exchangeCode(code);
  } else {
    claims = mockClaims || (typeof exchangeCode === 'function' ? await exchangeCode(code) : null);
    if (!claims) return { status: 'dry_run', reason: 'no_mock_claims' };
  }

  const pnr = pnrFromClaims(claims || {});
  if (!pnr) return { status: 'error', reason: 'no_pnr_in_claims' };

  const match = await resolvePatientByPnr(pnr, { patientMasterStore, tenantId });
  if (match.status !== 'matched') {
    return { status: 'denied', reason: `pnr_${match.status}` };
  }

  // AVGÖRANDE regel: personnumrets patientId måste vara tokenägarens patientId.
  if (match.patientId !== tokenCustomerId) {
    return { status: 'denied', reason: 'owner_mismatch' };
  }

  const session = createLevelTwoSession({ patientId: match.patientId, tenantId });
  return { status: 'verified', patientId: match.patientId, session, live: isBankIdLive(env) };
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  BANKID_ACR_QR,
  BANKID_ACR_SAME_DEVICE,
  BANKID_ACR_DEFAULT,
  isBankIdLive,
  isMobileUserAgent,
  resolveBankIdAcrValues,
  createAuthRequest,
  pnrFromClaims,
  pnrDigits,
  pnrEquals,
  resolvePatientByPnr,
  createLevelTwoSession,
  isSessionActive,
  verifyBankIdCallback,
};
