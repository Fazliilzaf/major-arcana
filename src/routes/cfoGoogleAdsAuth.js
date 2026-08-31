'use strict';

/**
 * cfoGoogleAdsAuth.js — OAuth-inloggning för Google Ads Billing API.
 *
 * Routes:
 *   GET  /api/v1/cco-cf/google/auth         — starta OAuth, returnera URL
 *   GET  /api/v1/cco-cf/google/callback       — hantera OAuth-callback
 *   GET  /api/v1/cco-cf/google/status         — status för anslutning
 *   POST /api/v1/cco-cf/google/disconnect     — koppla loss
 */

const express = require('express');

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function maskString(value) {
  const s = String(value || '');
  if (s.length <= 8) return '***';
  return `${s.slice(0, 2)}...${s.slice(-2)} (len ${s.length})`;
}

function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_ADS_SCOPE,
    state,
  });
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`;
}

async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail =
      payload?.error_description || payload?.error || `${res.status} ${res.statusText}`;
    const err = new Error(`Google OAuth token exchange failed: ${detail}`);
    err.statusCode = res.status;
    throw err;
  }

  return payload || {};
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail =
      payload?.error_description || payload?.error || `${res.status} ${res.statusText}`;
    const err = new Error(`Google OAuth refresh failed: ${detail}`);
    err.statusCode = res.status;
    throw err;
  }

  return payload || {};
}

function parseCustomerIds(value) {
  return normalizeText(value)
    .split(/[,;]/)
    .map((s) => s.replace(/-/g, '').trim())
    .filter(Boolean);
}

function createCfoGoogleAdsAuthRouter({
  config,
  connectorStore,
  requireAuth,
  requireRole,
  ROLE_OWNER,
  auditLog = null,
}) {
  const router = express.Router();

  const googleAds = config?.vendorInvoiceFetch?.googleAds || config?.googleAds || {};
  const clientId = normalizeText(googleAds.clientId || process.env.GOOGLE_CLIENT_ID);
  const clientSecret = normalizeText(googleAds.clientSecret || process.env.GOOGLE_CLIENT_SECRET);
  const redirectUri = normalizeText(googleAds.redirectUri || process.env.GOOGLE_REDIRECT_URI || '');
  const developerToken = normalizeText(
    googleAds.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  );
  const loginCustomerId = normalizeText(
    googleAds.loginCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || ''
  ).replace(/-/g, '');
  const customerIds = parseCustomerIds(
    googleAds.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || ''
  );

  function credentialsConfigured() {
    return !!(clientId && clientSecret && redirectUri && developerToken && customerIds.length > 0);
  }

  function audit(action, actor, detail) {
    if (auditLog && typeof auditLog.append === 'function') {
      auditLog.append({ action, actor, target: { kind: 'google_ads_connector' }, detail });
    }
  }

  function getAuthConfig() {
    return {
      credentialsConfigured: credentialsConfigured(),
      redirectUri,
      customerIds,
      loginCustomerId: loginCustomerId || null,
      developerTokenConfigured: !!developerToken,
    };
  }

  router.get('/cco-cf/google/auth', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    if (!credentialsConfigured()) {
      return res.status(400).json({
        ok: false,
        error:
          'Google Ads OAuth är inte konfigurerat (saknar clientId, clientSecret, redirectUri, developerToken eller customerId)',
      });
    }
    const state = Buffer.from(
      JSON.stringify({
        userId: req.user?.id || null,
        role: req.user?.role || null,
        ts: Date.now(),
      })
    ).toString('base64url');
    const url = buildAuthUrl({ clientId, redirectUri, state });
    audit(
      'cf.google_ads.auth.started',
      { userId: req.user?.id, role: req.user?.role },
      { redirectUri }
    );
    return res.json({ ok: true, url });
  });

  router.get('/cco-cf/google/callback', async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      return res.status(400).json({ ok: false, error: `${error}: ${errorDescription || ''}` });
    }
    if (!code || !state) {
      return res.status(400).json({ ok: false, error: 'Saknar code eller state' });
    }

    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
    } catch {
      return res.status(400).json({ ok: false, error: 'Ogiltig state-parameter' });
    }

    const actor = { userId: stateData.userId || null, role: stateData.role || null };

    if (!credentialsConfigured()) {
      return res.status(400).json({
        ok: false,
        error: 'Google Ads OAuth är inte konfigurerat på servern',
      });
    }

    try {
      const tokens = await exchangeCode({
        code: String(code),
        clientId,
        clientSecret,
        redirectUri,
      });
      if (!tokens.refresh_token) {
        // Detta kan hända om användaren redan godkänt appen utan prompt=consent.
        return res.status(400).json({
          ok: false,
          error:
            'Google svarade inte med refresh_token. Koppla loss i Google-kontot och försök igen, eller kör med prompt=consent.',
        });
      }

      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + asInt(tokens.expires_in) * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString();

      await connectorStore.saveConnection({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        accountName: tokens.id_token ? 'Google Ads' : 'Google Ads-konto',
        customerIds: customerIds.join(','),
        loginCustomerId,
        developerTokenConfigured: !!developerToken,
      });

      audit('cf.google_ads.connected', actor, {
        customerIds,
        hasLoginCustomerId: !!loginCustomerId,
        hasDeveloperToken: !!developerToken,
      });

      // Redirect tillbaka till finance.html med framgångsflagga.
      // Relativ redirect så vi stannar på samma host (t.ex. cfo.hairtpclinic.com).
      return res.redirect('/finance.html?google_ads_connected=1');
    } catch (err) {
      console.error('[cfoGoogleAdsAuth] callback error:', err);
      audit('cf.google_ads.connect_failed', actor, { error: err.message });
      return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
  });

  router.get('/cco-cf/google/status', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const status = connectorStore.getStatus();
    return res.json({ ok: true, ...status, config: getAuthConfig() });
  });

  // Diagnostik/listning: hämta fakturor från Google Ads Billing API utan att
  // skapa något. Visar även om fakturorna har nedladdningsbar PDF (pdfUrl).
  router.get('/cco-cf/google/invoices', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const { createGoogleAdsAdapter } = require('../cfo/vendors/googleAds');
      const adapter = createGoogleAdsAdapter({ connectorStore });
      const fromDate = req.query.fromDate || '2026-01-01';
      const toDate = req.query.toDate || new Date().toISOString().slice(0, 10);
      // skipLoginCustomerId=true: testa direktåtkomst som OAuth-användaren
      // utan MCC-headern (diagnostik om login-customer-id ställer till det).
      const skipLoginCustomerId = String(req.query.skipLoginCustomerId || '') === 'true';
      const loginCustomerIdOverride = req.query.loginCustomerId || null;
      const result = await adapter.fetchInvoices({
        fromDate,
        toDate,
        skipLoginCustomerId,
        loginCustomerIdOverride,
      });
      if (!result.ok) {
        return res.status(502).json({
          ok: false,
          error: result.error,
          configured: adapter.isConfigured(),
        });
      }
      return res.json({
        ok: true,
        fromDate,
        toDate,
        count: result.invoices.length,
        accountErrors: result.accountErrors || [],
        invoices: result.invoices.map((inv) => ({
          supplier: inv.supplier,
          invoiceNumber: inv.invoiceNumber,
          invoicePeriod: inv.invoicePeriod,
          date: inv.date,
          amountOriginal: inv.amountOriginal,
          currency: inv.currency,
          hasPdf: Boolean(inv.pdfUrl),
        })),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Diagnostik: vilka kunder kan OAuth-användaren nå med denna developer
  // token? Tom lista = MCC/OAuth-koppling saknas. IDn med = åtkomst finns.
  router.get(
    '/cco-cf/google/accessible-customers',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const { createGoogleAdsAdapter } = require('../cfo/vendors/googleAds');
        const adapter = createGoogleAdsAdapter({ connectorStore });
        const accessToken = await adapter._ensureAccessToken();
        const response = await fetch(
          'https://googleads.googleapis.com/v22/customers:listAccessibleCustomers',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
            },
          }
        );
        const payload = await response.json().catch(() => ({}));
        return res.status(response.ok ? 200 : 502).json({
          ok: response.ok,
          status: response.status,
          resourceNames: payload.resourceNames || [],
          error: payload.error?.message || null,
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.post(
    '/cco-cf/google/disconnect',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const actor = { userId: req.user?.id || null, role: req.user?.role || null };
      await connectorStore.disconnect({ reason: req.body?.reason || 'owner_request' });
      audit('cf.google_ads.disconnected', actor, {});
      return res.json({ ok: true, disconnected: true });
    }
  );

  return { router, refreshAccessToken, credentialsConfigured };
}

module.exports = { createCfoGoogleAdsAuthRouter };
