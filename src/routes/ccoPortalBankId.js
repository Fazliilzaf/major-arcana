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
 *       → läser nivå-2-session-cookie, returnerar identitet + `offer`
 *         (offert, journal-referens, bokningar); 401 om ingen session.
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
  resolveBankIdAcrValues,
} = require('../ops/ccoPortalBankIdSession');
const { verifyCriiptoIdToken } = require('../ops/ccoCriiptoIdToken');
const { buildLevelTwoPayload, buildLevelTwoDocuments } = require('../ops/ccoPortalCustomerPayload');
const {
  L2_SESSION_COOKIE,
  signCookie,
  readCookie,
  parseCookies,
  resolveL2Secret,
} = require('../ops/ccoPortalL2Cookie');

const STATE_COOKIE = 'cco_bankid_state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min att hinna igenom BankID

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function b64urlDecode(str) {
  return Buffer.from(String(str), 'base64url').toString('utf8');
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
  commercialStore,
  getCommercialStore,
  journalStore,
  getJournalStore,
  bookingStore,
  getBookingStore,
  documentInstanceStore,
  getDocumentInstanceStore,
  offerDocumentStore,
  getOfferDocumentStore,
  env = process.env,
  baseUrl = process.env.PUBLIC_BASE_URL || '',
  sessionSecret,
  exchangeCode, // injicerbart för test; annars byggs Criipto-utbytet i live
} = {}) {
  const router = express.Router();
  const resolveCommercialStore = () =>
    commercialStore || (getCommercialStore && getCommercialStore()) || null;
  const resolveJournalStore = () => journalStore || (getJournalStore && getJournalStore()) || null;
  const resolveBookingStore = () => bookingStore || (getBookingStore && getBookingStore()) || null;
  const resolveDocumentInstanceStore = () =>
    documentInstanceStore || (getDocumentInstanceStore && getDocumentInstanceStore()) || null;
  const resolveOfferDocumentStore = () =>
    offerDocumentStore || (getOfferDocumentStore && getOfferDocumentStore()) || null;
  const secret = resolveL2Secret({ sessionSecret, env });
  const secure = text(env.NODE_ENV) === 'production';
  const resolveAccessStore = () => accessStore || (getAccessStore && getAccessStore()) || null;
  const resolvePatientStore = () =>
    patientMasterStore || (getPatientMasterStore && getPatientMasterStore()) || null;

  function readLevelTwoSession(req, res) {
    const cookies = parseCookies(req);
    const session = readCookie(cookies[L2_SESSION_COOKIE], secret);
    if (!session || Number(session.exp) < Date.now() || !text(session.patientId)) {
      res.status(401).json({ authenticated: false });
      return null;
    }
    return {
      patientId: text(session.patientId),
      tenantId: text(session.tenantId) || 'hairtpclinic',
      sessionId: text(session.sessionId),
      expiresAt: Number(session.exp),
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function documentMetadataPage(document) {
    return `<!doctype html><html lang="sv"><meta charset="utf-8"><title>${escapeHtml(document.titel)}</title><body><main><h1>${escapeHtml(document.titel)}</h1><p>Status: ${escapeHtml(document.status)}</p><p>Datum: ${escapeHtml(document.datum || 'Ej angivet')}</p><p>Källa: ${escapeHtml(document.källa)}</p></main></body></html>`;
  }

  const redirectUriFor = (req) => {
    const base = text(baseUrl) || `${req.protocol}://${req.get('host')}`;
    return `${base.replace(/\/+$/, '')}/api/v1/cco-portal/bankid/callback`;
  };

  // ORD-80: login accepterar BÅDA tokensorterna — magisk access-token (portal-
  // chat) OCH esign-token (rika offer-portalen). Samma ägarregel nedströms:
  // BankID-personnumrets patientId måste matcha tokenägarens, oavsett sort.
  const resolvePortalToken = async (token) => {
    const store = resolveAccessStore();
    if (typeof store?.resolveToken === 'function') {
      const resolved = store.resolveToken(token);
      if (resolved && text(resolved.customerId)) {
        return {
          kind: 'magic',
          customerId: text(resolved.customerId),
          tenantId: text(resolved.tenantId),
        };
      }
    }
    const commercial = resolveCommercialStore();
    if (typeof commercial?.findCaseByEsignToken === 'function') {
      const match = await commercial.findCaseByEsignToken(token).catch(() => null);
      const customerId = text(match?.customerId || match?.patientId);
      if (customerId) {
        return { kind: 'esign', customerId, tenantId: text(match?.tenantId) };
      }
    }
    // ORD-154 §3: en återkallad token matchar inte esignToken längre, men ska
    // kännas igen så kunden får ett begripligt nej i stället för invalid_token.
    // Skilj "superseded" (ny offertversion) från "revoked" (medveten återkallelse).
    if (typeof commercial?.findCaseByRevokedEsignToken === 'function') {
      const revoked = await commercial.findCaseByRevokedEsignToken(token).catch(() => null);
      if (revoked) {
        const rev = (Array.isArray(revoked.esignRevocations) ? revoked.esignRevocations : []).find(
          (r) => text(r && r.token) === text(token)
        );
        return { kind: 'revoked', superseded: text(rev && rev.reason).toLowerCase() === 'superseded' };
      }
    }
    return null;
  };

  // ORD-80: återhopp efter BankID styrs av tokensort — esign-token hör hemma i
  // rika offer-portalen, magisk token i portal-chatten (offer-portalen kan inte
  // serva magiska tokens). PORTAL_BANKID_RETURN=chat tvingar chat för alla.
  const returnUrlFor = (stateData, l2) => {
    const token = text(stateData.token);
    if (!token) return '/';
    const forceChat = text(env.PORTAL_BANKID_RETURN).toLowerCase() === 'chat';
    if (!forceChat && text(stateData.tokenKind) === 'esign') {
      return `/api/v1/cco-commercial/customer-offer-portal?token=${encodeURIComponent(token)}&l2=${encodeURIComponent(l2)}`;
    }
    return `/portal-chat/${encodeURIComponent(token)}?l2=${encodeURIComponent(l2)}`;
  };

  // ── GET login ────────────────────────────────────────────────────────────
  router.get('/api/v1/cco-portal/bankid/login', async (req, res) => {
    const token = text(req.query.token);
    if (!token) {
      return res.status(400).json({ error: 'missing_token' });
    }
    const resolved = await resolvePortalToken(token);
    // ORD-154 §3: återkallad token → begripligt nej, skilt från invalid_token.
    if (resolved?.kind === 'revoked') {
      const message = resolved.superseded
        ? 'En nyare version av offerten finns. Kontakta kliniken.'
        : 'Den här offerten är inte längre aktuell. Kontakta kliniken.';
      return res.status(410).json({ error: 'offer_revoked', message });
    }
    if (!resolved || !text(resolved.customerId)) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    let auth;
    try {
      auth = createAuthRequest({
        redirectUri: redirectUriFor(req),
        tokenCustomerId: resolved.customerId,
        acrValues: resolveBankIdAcrValues({
          flow: req.query.flow,
          userAgent: req.headers && req.headers['user-agent'],
          env,
        }),
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
        tokenKind: resolved.kind,
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
      // ORD-80: neka-fallet hoppar tillbaka till rätt yta (tokensort-styrt).
      return res.redirect(302, returnUrlFor(stateData, result.reason || result.status));
    }

    const sessionCookie = signCookie(
      {
        patientId: result.patientId,
        tenantId: text(stateData.tenantId),
        sessionId: text(result.session.sessionId),
        verifiedAt: text(result.session.createdAt),
        exp: result.session.expiresAtMs,
      },
      secret
    );
    res.cookie(L2_SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: result.session.expiresAtMs - Date.now(),
      path: '/',
    });
    // ORD-80: ok-fallet — esign-token tillbaka till rika offer-portalen.
    return res.redirect(302, returnUrlFor(stateData, 'ok'));
  });

  // ── GET me (nivå-2-status + offert-payload) ──────────────────────────────
  router.get('/api/v1/cco-portal/me', async (req, res) => {
    const session = readLevelTwoSession(req, res);
    if (!session) return undefined;
    const { patientId, tenantId } = session;

    // Nivå-2-payload (read-only): offert (samma offerPlan-källa som PDF/
    // signeringssida) + journal-REFERENS + bokningar. En läsning som fallerar
    // får aldrig bryta auth-svaret.
    let offer = null;
    try {
      const commercial = resolveCommercialStore();
      const journal = resolveJournalStore();
      const booking = resolveBookingStore();
      const documents = resolveDocumentInstanceStore();
      const [commercialCase, journalEntries, bookingCases, documentInstances] = await Promise.all([
        typeof commercial?.getPatientRegisterCase === 'function'
          ? commercial.getPatientRegisterCase({ tenantId, patientId }).catch(() => null)
          : null,
        typeof journal?.listEntries === 'function'
          ? journal.listEntries({ tenantId, patientId }).catch(() => [])
          : [],
        typeof booking?.listCasesForCustomer === 'function'
          ? booking.listCasesForCustomer({ tenantId, patientId }).catch(() => [])
          : [],
        typeof documents?.listForPatient === 'function'
          ? documents.listForPatient({ tenantId, patientId }).catch(() => [])
          : [],
      ]);
      offer = buildLevelTwoPayload({
        patientId,
        commercialCase,
        journalEntries,
        bookingCases,
        documentInstances,
      });
    } catch {
      offer = null;
    }

    return res.json({
      authenticated: true,
      level: 2,
      patientId,
      tenantId,
      expiresAt: new Date(session.expiresAt).toISOString(),
      live: isBankIdLive(env),
      offer,
    });
  });

  // Metadata för en dokumentinstans. Inga råa formulärsvar exponeras här:
  // bara samma säkra radrendering som i /me, alltid bound till L2-sessionen.
  router.get('/api/v1/cco-portal/documents/instance/:instanceId', async (req, res) => {
    const session = readLevelTwoSession(req, res);
    if (!session) return undefined;
    const store = resolveDocumentInstanceStore();
    if (typeof store?.listForPatient !== 'function') {
      return res.status(404).json({ error: 'document_not_found' });
    }
    const instances = await store
      .listForPatient({ tenantId: session.tenantId, patientId: session.patientId })
      .catch(() => []);
    const instanceId = text(req.params.instanceId);
    const instance = (Array.isArray(instances) ? instances : []).find(
      (row) => text(row && row.instanceId) === instanceId
    );
    if (!instance) return res.status(404).json({ error: 'document_not_found' });
    const document = buildLevelTwoDocuments({ documentInstances: [instance] })[0];
    if (!document) return res.status(404).json({ error: 'document_not_found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(documentMetadataPage(document));
  });

  // Signerat avtal kan öppnas, men endast om samma L2-session äger patienten
  // och patientens commercialCase fortfarande pekar på just det lokala dokumentet.
  router.get('/api/v1/cco-portal/documents/offer', async (req, res) => {
    const session = readLevelTwoSession(req, res);
    if (!session) return undefined;
    const commercial = resolveCommercialStore();
    const documents = resolveOfferDocumentStore();
    if (
      typeof commercial?.getPatientRegisterCase !== 'function' ||
      typeof documents?.readHtml !== 'function'
    ) {
      return res.status(404).json({ error: 'document_not_found' });
    }
    const commercialCase = await commercial
      .getPatientRegisterCase({ tenantId: session.tenantId, patientId: session.patientId })
      .catch(() => null);
    const documentId = text(commercialCase && commercialCase.offerDocumentId);
    // ORD: offerten ska synas som underlag FÖRE accept — skyddet är att rätt
    // person är inloggad (L2-session), inte affärsläget (quoteStatus).
    if (!documentId) {
      return res.status(404).json({ error: 'document_not_found' });
    }
    const payload = await documents
      .readHtml({ tenantId: session.tenantId, documentId })
      .catch(() => null);
    if (!text(payload && payload.html)) return res.status(404).json({ error: 'document_not_found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(payload.html);
  });

  return router;
}

module.exports = {
  createCcoPortalBankIdRouter,
  // exporterade för test/återanvändning
  L2_SESSION_COOKIE,
  signCookie,
  readCookie,
  decodeJwtPayload,
};
