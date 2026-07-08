'use strict';

/**
 * ccoPortalBankId — routes för kundportalens BankID-inloggning (nivå 2) via
 * Criipto (OIDC). Se docs/cco-kundportal-inloggning-kontrakt.md.
 *
 * Monteras av server.js: app.use('/', createCcoPortalBankIdRouter({ ... })).
 *
 * Routes:
 *   GET /api/v1/cco-portal/bankid/login?token=<magisk-token>
 *       → löser token → tokenägarens patientId, bygger Criipto authorize-URL,
 *         sätter signerad state-cookie, 302 redirect till brokern.
 *   GET /api/v1/cco-portal/bankid/callback?code=..&state=..
 *       → verifierar state-cookie, byter code mot claims (live: Criipto token-
 *         endpoint; annars dry-run), matchar personnummer → patientId, kräver
 *         att det är samma patient som tokenägaren, sätter nivå-2-session-cookie.
 *   GET /api/v1/cco-portal/me
 *       → läser nivå-2-session-cookie, returnerar identitet (401 om ingen).
 *
 * SÄKERHET: ingen live-trafik utan BANKID_API_KEY + PORTAL_BANKID_LIVE=1.
 * Cookies är HMAC-signerade (ingen ny dependency). Read-only mot patient-master.
 */

const express = require('express');
const crypto = require('node:crypto');

const {
  createAuthRequest,
  verifyBankIdCallback,
  isBankIdLive,
} = require('../ops/ccoPortalBankIdSession');
const { verifyCriiptoIdToken } = require('../ops/ccoCriiptoIdToken');

const STATE_COOKIE = 'cco_bankid_state';
const SESSION_COOKIE = 'cco_portal_l2';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min att hinna igenom BankID

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}
function b64urlDecode(str) {
  return Buffer.from(String(str), 'base64url').toString('utf8');
}

/** HMAC-signera ett JSON-objekt → "<payload>.<sig>" (base64url). */
function signCookie(obj, secret) {
  const payload = b64urlEncode(JSON.stringify(obj));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Verifiera + parsa en signerad cookie. Returnerar null vid manipulation. */
function readCookie(raw, secret) {
  const value = text(raw);
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(b64urlDecode(payload));
  } catch {
    return null;
  }
}

/** Parsa `Cookie`-headern manuellt (ingen cookie-parser i stacken). */
function parseCookies(req) {
  const header = text(req.headers && req.headers.cookie);
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/** Avkoda payload-delen av ett JWT (utan signaturverifiering). */
function decodeJwtPayload(jwt) {
  const parts = text(jwt).split('.');
  if (parts.length < 2) return {};
  try {
    return JSON.parse(b64urlDecode(parts[1]));
  } catch {
    return {};
  }
}

/**
 * Skarpt kodutbyte mot Criiptos token-endpoint. Körs bara i live-läge.
 * id_token verifieras mot Criiptos JWKS (signatur + iss/aud/exp/nonce) innan
 * dess claims returneras — annars kastas. Se ccoCriiptoIdToken.js.
 */
function makeCriiptoExchange({ env, redirectUri, nonce, verifyIdToken = verifyCriiptoIdToken }) {
  return async function exchangeCode(code) {
    const domain = text(env.CRIIPTO_DOMAIN);
    const clientId = text(env.CRIIPTO_CLIENT_ID);
    const clientSecret = text(env.CRIIPTO_CLIENT_SECRET) || text(env.BANKID_API_KEY);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });
    const resp = await fetch(`https://${domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!resp.ok) throw new Error(`criipto_token_${resp.status}`);
    const json = await resp.json();
    const verdict = await verifyIdToken(json.id_token, { domain, clientId, nonce });
    if (!verdict.valid) throw new Error(`id_token_invalid:${verdict.reason}`);
    return verdict.claims;
  };
}

function createCcoPortalBankIdRouter({
  accessStore,
  getAccessStore,
  patientMasterStore,
  getPatientMasterStore,
  env = process.env,
  baseUrl = process.env.PUBLIC_BASE_URL || '',
  sessionSecret,
  exchangeCode, // injicerbart för test; annars byggs Criipto-utbytet i live
} = {}) {
  const router = express.Router();
  const secret =
    text(sessionSecret) ||
    text(env.PORTAL_SESSION_SECRET) ||
    crypto.randomBytes(32).toString('hex'); // ephemeral fallback (dev/dry-run)
  const secure = text(env.NODE_ENV) === 'production';
  const resolveAccessStore = () => accessStore || (getAccessStore && getAccessStore()) || null;
  const resolvePatientStore = () =>
    patientMasterStore || (getPatientMasterStore && getPatientMasterStore()) || null;

  const redirectUriFor = (req) => {
    const base = text(baseUrl) || `${req.protocol}://${req.get('host')}`;
    return `${base.replace(/\/+$/, '')}/api/v1/cco-portal/bankid/callback`;
  };

  // ── GET login ────────────────────────────────────────────────────────────
  router.get('/api/v1/cco-portal/bankid/login', (req, res) => {
    const token = text(req.query.token);
    const store = resolveAccessStore();
    if (!token || typeof store?.resolveToken !== 'function') {
      return res.status(400).json({ error: 'missing_token' });
    }
    const resolved = store.resolveToken(token);
    if (!resolved || !text(resolved.customerId)) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    let auth;
    try {
      auth = createAuthRequest({
        redirectUri: redirectUriFor(req),
        tokenCustomerId: resolved.customerId,
        env,
      });
    } catch (err) {
      return res.status(503).json({ error: 'bankid_unconfigured', detail: err.message });
    }
    const stateCookie = signCookie(
      {
        state: auth.state,
        nonce: auth.nonce,
        tokenCustomerId: resolved.customerId,
        tenantId: resolved.tenantId || 'hairtpclinic',
        token,
        exp: Date.now() + STATE_TTL_MS,
      },
      secret
    );
    res.cookie(STATE_COOKIE, stateCookie, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: STATE_TTL_MS,
      path: '/',
    });
    return res.redirect(302, auth.url);
  });

  // ── GET callback ─────────────────────────────────────────────────────────
  router.get('/api/v1/cco-portal/bankid/callback', async (req, res) => {
    const cookies = parseCookies(req);
    const stateData = readCookie(cookies[STATE_COOKIE], secret);
    if (!stateData || Number(stateData.exp) < Date.now()) {
      return res.status(400).json({ error: 'state_expired' });
    }
    const store = resolvePatientStore();
    const exchange =
      exchangeCode ||
      makeCriiptoExchange({
        env,
        redirectUri: redirectUriFor(req),
        nonce: text(stateData.nonce),
      });

    const result = await verifyBankIdCallback(
      {
        code: text(req.query.code),
        returnedState: text(req.query.state),
        expectedState: text(stateData.state),
        tokenCustomerId: text(stateData.tokenCustomerId),
        tenantId: text(stateData.tenantId),
      },
      { exchangeCode: exchange, patientMasterStore: store, env }
    );

    res.clearCookie(STATE_COOKIE, { path: '/' });

    if (result.status !== 'verified') {
      const back = text(stateData.token)
        ? `/portal-chat/${encodeURIComponent(stateData.token)}?l2=${encodeURIComponent(result.reason || result.status)}`
        : '/';
      return res.redirect(302, back);
    }

    const sessionCookie = signCookie(
      {
        patientId: result.patientId,
        tenantId: text(stateData.tenantId),
        exp: result.session.expiresAtMs,
      },
      secret
    );
    res.cookie(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: result.session.expiresAtMs - Date.now(),
      path: '/',
    });
    const back = `/portal-chat/${encodeURIComponent(stateData.token)}?l2=ok`;
    return res.redirect(302, back);
  });

  // ── GET me (nivå-2-status) ───────────────────────────────────────────────
  router.get('/api/v1/cco-portal/me', (req, res) => {
    const cookies = parseCookies(req);
    const session = readCookie(cookies[SESSION_COOKIE], secret);
    if (!session || Number(session.exp) < Date.now() || !text(session.patientId)) {
      return res.status(401).json({ authenticated: false });
    }
    return res.json({
      authenticated: true,
      level: 2,
      patientId: session.patientId,
      tenantId: session.tenantId || 'hairtpclinic',
      expiresAt: new Date(Number(session.exp)).toISOString(),
      live: isBankIdLive(env),
    });
  });

  return router;
}

module.exports = {
  createCcoPortalBankIdRouter,
  // exporterade för test/återanvändning
  signCookie,
  readCookie,
  decodeJwtPayload,
};
