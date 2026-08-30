'use strict';

/**
 * ccoCfoMetaLogin — Meta (Facebook) OAuth-inloggning för CFO-ytan (finance.html).
 *
 * Monteras av server.js FÖRE createCfoRouter, eftersom cfo-routern kräver
 * Bearer-auth på HELA /cco-cf — login/callback måste vara öppna för att kunna
 * genomföra OAuth-dansen.
 *
 * Routes:
 *   GET /api/v1/cco-cf/meta/login
 *       → bygger Meta OAuth-dialog-URL (scope: email), sätter HMAC-signerad
 *         state-cookie, 302 till facebook.com.
 *   GET /api/v1/cco-cf/meta/callback?code=..&state=..
 *       → verifierar state-cookien, byter code mot access_token
 *         (graph.facebook.com/oauth/access_token), hämtar /me (id, name,
 *         email), matchar email → aktiv användare med CF-roll
 *         (owner/finance/revisor), skapar session och renderar en handoff-sida
 *         som sparar token som ARCANA_ADMIN_TOKEN (samma nyckel som /admin och
 *         finance.html använder) och redirectar till /finance.html.
 *
 * SÄKERHET: state-cookien är HMAC-signerad (samma mönster som BankID-portalen).
 * Ingen session skapas för användare utan CF-roll. Kräver META_APP_ID +
 * META_APP_SECRET i miljön — annars 503 (meta_not_configured). Inga Meta-
 * credentials loggas; fel loggas som korta felkoder.
 */

const express = require('express');
const crypto = require('node:crypto');

const STATE_COOKIE = 'cco_cfo_meta_state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min att hinna genom Meta-dialogen
const CF_ROLE_ORDER = ['owner', 'finance', 'revisor'];
const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
const RETURN_PATH = '/finance.html';

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

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createCcoCfoMetaLoginRouter({
  authStore,
  getAuditLog = () => null,
  env = process.env,
  baseUrl = process.env.PUBLIC_BASE_URL || '',
  exchangeCode, // injicerbart för test; annars byggs Graph-utbytet live
  profileLoader, // injicerbart för test; annars /me mot graph.facebook.com
} = {}) {
  const router = express.Router();

  const appId = text(env.META_APP_ID);
  const appSecret = text(env.META_APP_SECRET);
  const graphVersion = text(env.META_GRAPH_VERSION) || 'v22.0';
  const secret =
    text(env.META_LOGIN_SECRET) ||
    text(env.PORTAL_SESSION_SECRET) ||
    crypto.randomBytes(32).toString('hex'); // ephemeral fallback (dev/dry-run)
  const secure = text(env.NODE_ENV) === 'production';

  function metaConfigured() {
    return Boolean(appId && appSecret);
  }

  const redirectUriFor = (req) => {
    const configured = text(env.META_REDIRECT_URI);
    if (configured) return configured;
    const base = text(baseUrl) || `${req.protocol}://${req.get('host')}`;
    return `${base.replace(/\/+$/, '')}/api/v1/cco-cf/meta/callback`;
  };

  function audit(actor, action, detail = {}) {
    try {
      const log = getAuditLog();
      if (log && typeof log.append === 'function') {
        log.append({
          action,
          kind: action,
          surface: 'cco.cf.meta_login',
          actor: { role: actor.role || 'anonymous', userId: actor.userId || null, ip: actor.ip || null },
          result: action.endsWith('.denied') ? 'denied' : 'ok',
          detail,
        });
      }
    } catch {
      // Audit får aldrig sänka inloggningsflödet.
    }
  }

  function actorFrom(req) {
    return {
      role: 'anonymous',
      userId: null,
      ip: req.ip || req.socket?.remoteAddress || null,
    };
  }

  function errorPage(title, message) {
    return `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#1a1a1a}main{border:1px solid #e5e5e5;border-radius:12px;padding:2rem}h1{font-size:1.25rem;margin-top:0}p{line-height:1.5}a{color:#1877f2}</style><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/api/v1/cco-cf/meta/login">Försök igen</a></p></main></body></html>`;
  }

  /** Byt OAuth-code mot användar-access_token hos Meta (Graph API). */
  function makeGraphExchange() {
    return async function exchange(code, redirectUri) {
      const params = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      });
      const url = `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`;
      const resp = await fetch(url, { method: 'GET' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !text(json.access_token)) {
        const detail =
          text(json.error && json.error.message) || text(json.error && json.error.code) || 'no_access_token';
        throw new Error(`meta_token_exchange_${resp.status}:${detail.slice(0, 120)}`);
      }
      return text(json.access_token);
    };
  }

  /** Hämta Meta-profilen (id, name, email) med access_token. */
  async function loadMetaProfile(accessToken) {
    const url = `https://graph.facebook.com/${graphVersion}/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`;
    const resp = await fetch(url, { method: 'GET' });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !text(json.id)) {
      throw new Error(`meta_profile_fetch_${resp.status}`);
    }
    return { id: text(json.id), name: text(json.name), email: text(json.email) };
  }

  /** Handoff-sida: spara token i localStorage + redirecta till CFO-ytan. */
  function handoffPage(token) {
    const safeToken = String(token).replace(/</g, '\\u003c');
    return `<!doctype html><html lang="sv"><meta charset="utf-8"><title>Loggar in…</title><body><script>
    try { localStorage.setItem(${JSON.stringify(TOKEN_KEY)}, ${JSON.stringify(safeToken)}); } catch (e) {}
    location.replace(${JSON.stringify(RETURN_PATH)});
  </script></body></html>`;
  }

  // ── GET login ────────────────────────────────────────────────────────────
  router.get('/cco-cf/meta/login', (req, res) => {
    if (!metaConfigured()) {
      return res.status(503).json({ error: 'meta_not_configured' });
    }
    const stateData = { nonce: crypto.randomUUID(), exp: Date.now() + STATE_TTL_MS };
    const signed = signCookie(stateData, secret);
    res.cookie(STATE_COOKIE, signed, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: STATE_TTL_MS,
      path: '/',
    });
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUriFor(req),
      state: signed,
      response_type: 'code',
      scope: 'email',
    });
    return res.redirect(302, `https://www.facebook.com/${graphVersion}/dialog/oauth?${params.toString()}`);
  });

  // ── GET callback ─────────────────────────────────────────────────────────
  router.get('/cco-cf/meta/callback', async (req, res) => {
    const cookies = parseCookies(req);
    const stateData = readCookie(cookies[STATE_COOKIE], secret);
    res.clearCookie(STATE_COOKIE, { path: '/' });

    if (!stateData || Number(stateData.exp) < Date.now() || !text(stateData.nonce)) {
      return res
        .status(400)
        .send(errorPage('Meta-inloggning misslyckades', 'Säkerhetskontrollen (state) misslyckades. Försök igen.'));
    }
    // CSRF-skydd: state i query måste vara identisk med den signerade cookien.
    if (text(req.query.state) !== (cookies[STATE_COOKIE] || '')) {
      return res
        .status(400)
        .send(errorPage('Meta-inloggning misslyckades', 'Säkerhetskontrollen (state) misslyckades. Försök igen.'));
    }
    const code = text(req.query.code);
    if (!code) {
      return res
        .status(400)
        .send(errorPage('Meta-inloggning misslyckades', 'Meta returnerade ingen inloggningskod.'));
    }
    if (!metaConfigured()) {
      return res
        .status(503)
        .send(errorPage('Meta-inloggning inte konfigurerad', 'Servern saknar META_APP_ID/META_APP_SECRET.'));
    }

    let accessToken;
    try {
      accessToken = await (exchangeCode || makeGraphExchange())(code, redirectUriFor(req));
    } catch (err) {
      audit(actorFrom(req), 'auth.meta_login.token_exchange_failed', { reason: text(err.message) });
      return res
        .status(502)
        .send(errorPage('Meta-inloggning misslyckades', 'Meta nekade inloggningskoden. Försök igen.'));
    }

    let profile;
    try {
      profile = await (profileLoader || loadMetaProfile)(accessToken);
    } catch (err) {
      audit(actorFrom(req), 'auth.meta_login.profile_fetch_failed', { reason: text(err.message) });
      return res
        .status(502)
        .send(errorPage('Meta-inloggning misslyckades', 'Kunde inte hämta din Meta-profil. Försök igen.'));
    }

    if (!profile.email) {
      audit(actorFrom(req), 'auth.meta_login.denied', { reason: 'meta_email_missing', metaUserId: profile.id });
      return res
        .status(403)
        .send(
          errorPage(
            'Åtkomst nekad',
            'Ditt Meta-konto saknar en verifierad e-postadress. Logga in med e-post/lösenord via /admin istället.'
          )
        );
    }

    const user = await authStore.getUserByEmail(profile.email).catch(() => null);
    if (!user) {
      audit(actorFrom(req), 'auth.meta_login.denied', { reason: 'no_matching_user', email: profile.email });
      return res
        .status(403)
        .send(
          errorPage(
            'Åtkomst nekad',
            `Ingen användare matchar ${escapeHtml(profile.email)}. Logga in med e-post/lösenord via /admin istället.`
          )
        );
    }

    const memberships = await authStore.listMembershipsForUser(user.id).catch(() => []);
    const cfMembership =
      CF_ROLE_ORDER.map((role) => memberships.find((m) => m.role === role)).find(Boolean) || null;
    if (!cfMembership) {
      audit(
        { role: 'anonymous', userId: user.id, ip: actorFrom(req).ip },
        'auth.meta_login.denied',
        { reason: 'no_cf_role', email: profile.email }
      );
      return res
        .status(403)
        .send(
          errorPage(
            'Åtkomst nekad',
            'Ditt konto har ingen CFO-roll (owner/finance/revisor). Logga in med e-post/lösenord via /admin istället.'
          )
        );
    }

    const created = await authStore.createSession({ userId: user.id, membershipId: cfMembership.id });
    audit(
      { role: cfMembership.role, userId: user.id, ip: actorFrom(req).ip },
      'auth.meta_login',
      { email: profile.email, metaUserId: profile.id, membershipId: cfMembership.id }
    );

    return res.send(handoffPage(created.token));
  });

  return router;
}

module.exports = {
  createCcoCfoMetaLoginRouter,
  // exporterade för test/återanvändning
  signCookie,
  readCookie,
};
