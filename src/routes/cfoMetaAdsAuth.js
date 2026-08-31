'use strict';

/**
 * cfoMetaAdsAuth.js — OAuth-inloggning för Meta Ads Billing API.
 *
 * Routes:
 *   GET  /api/v1/cco-cf/meta/auth         — starta OAuth, returnera URL
 *   GET  /api/v1/cco-cf/meta/callback     — hantera OAuth-callback
 *   GET  /api/v1/cco-cf/meta/status       — status för anslutning
 *   POST /api/v1/cco-cf/meta/disconnect   — koppla loss
 */

const express = require('express');

const META_API_VERSION = 'v21.0';
const FB_OAUTH_BASE = `https://www.facebook.com/${META_API_VERSION}`;
const FB_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const OAUTH_SCOPES = 'ads_read,business_management';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAccountId(value) {
  return normalizeText(value).replace(/^act_/, '').replace(/-/g, '');
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

function buildAuthUrl({ appId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    state,
  });
  return `${FB_OAUTH_BASE}/dialog/oauth?${params.toString()}`;
}

async function exchangeCode({ code, appId, appSecret, redirectUri }) {
  const url = new URL(`${FB_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code', code);

  const res = await fetch(url.toString(), { method: 'GET' });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail =
      payload?.error?.message || payload?.error?.type || `${res.status} ${res.statusText}`;
    const err = new Error(`Meta OAuth token exchange failed: ${detail}`);
    err.statusCode = res.status;
    throw err;
  }

  return payload || {};
}

async function exchangeLongLivedToken({ shortToken, appId, appSecret }) {
  const url = new URL(`${FB_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortToken);

  const res = await fetch(url.toString(), { method: 'GET' });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail =
      payload?.error?.message || payload?.error?.type || `${res.status} ${res.statusText}`;
    const err = new Error(`Meta OAuth long-lived token exchange failed: ${detail}`);
    err.statusCode = res.status;
    throw err;
  }

  return payload || {};
}

async function fetchAdAccounts({ accessToken }) {
  const url = new URL(`${FB_GRAPH_BASE}/me/adaccounts`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fields', 'name,id,account_status,business');
  url.searchParams.set('limit', '500');

  const res = await fetch(url.toString(), { method: 'GET' });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail =
      payload?.error?.message || payload?.error?.type || `${res.status} ${res.statusText}`;
    throw new Error(`Meta ad accounts fetch failed: ${detail}`);
  }

  return payload?.data || [];
}

function createCfoMetaAdsAuthRouter({
  config,
  connectorStore,
  requireAuth,
  requireRole,
  ROLE_OWNER,
  auditLog = null,
}) {
  const router = express.Router();

  const metaAds = config?.vendorInvoiceFetch?.metaAds || config?.metaAds || {};
  const appId = normalizeText(metaAds.appId || process.env.META_APP_ID);
  const appSecret = normalizeText(metaAds.appSecret || process.env.META_APP_SECRET);
  const redirectUri = normalizeText(metaAds.redirectUri || process.env.META_REDIRECT_URI || '');
  const defaultAdAccountId = normalizeAccountId(
    metaAds.adAccountId ||
      process.env.META_AD_ACCOUNT_ID ||
      process.env.META_ADS_AD_ACCOUNT_ID ||
      ''
  );
  const businessManagerId = normalizeText(
    metaAds.businessManagerId || process.env.META_BUSINESS_MANAGER_ID || ''
  );
  const defaultPageId = normalizeText(metaAds.pageId || process.env.META_PAGE_ID || '');

  function credentialsConfigured() {
    return !!(appId && appSecret && redirectUri);
  }

  function audit(action, actor, detail) {
    if (auditLog && typeof auditLog.append === 'function') {
      auditLog.append({ action, actor, target: { kind: 'meta_ads_connector' }, detail });
    }
  }

  function getAuthConfig() {
    return {
      credentialsConfigured: credentialsConfigured(),
      redirectUri,
      defaultAdAccountId,
      businessManagerId: businessManagerId || null,
      defaultPageId: defaultPageId || null,
    };
  }

  router.get('/cco-cf/meta/auth', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    if (!credentialsConfigured()) {
      return res.status(400).json({
        ok: false,
        error:
          'Meta Ads OAuth är inte konfigurerat (saknar META_APP_ID, META_APP_SECRET eller META_REDIRECT_URI)',
      });
    }
    const state = Buffer.from(
      JSON.stringify({
        userId: req.user?.id || null,
        role: req.user?.role || null,
        ts: Date.now(),
      })
    ).toString('base64url');
    const url = buildAuthUrl({ appId, redirectUri, state });
    audit(
      'cf.meta_ads.auth.started',
      { userId: req.user?.id, role: req.user?.role },
      { redirectUri }
    );
    return res.json({ ok: true, url });
  });

  router.get('/cco-cf/meta/callback', async (req, res) => {
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
        error: 'Meta Ads OAuth är inte konfigurerat på servern',
      });
    }

    try {
      const shortLived = await exchangeCode({
        code: String(code),
        appId,
        appSecret,
        redirectUri,
      });
      if (!shortLived.access_token) {
        return res.status(400).json({
          ok: false,
          error: 'Meta svarade inte med access_token',
        });
      }

      const longLived = await exchangeLongLivedToken({
        shortToken: shortLived.access_token,
        appId,
        appSecret,
      });

      const accessToken = longLived.access_token || shortLived.access_token;
      const expiresIn = longLived.expires_in || shortLived.expires_in || 5184000; // ~60 dagar
      const expiresAt = expiresIn
        ? new Date(Date.now() + asInt(expiresIn) * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString();

      let adAccountId = defaultAdAccountId;
      let accountName = 'Meta Ads';
      try {
        const adAccounts = await fetchAdAccounts({ accessToken });
        const preferred =
          adAccounts.find((a) => normalizeAccountId(a.id) === adAccountId) ||
          adAccounts.find((a) => a.id === `act_${adAccountId}`) ||
          adAccounts[0];
        if (preferred) {
          adAccountId = normalizeAccountId(preferred.id);
          accountName = preferred.name || accountName;
        }
      } catch (acctErr) {
        console.warn('[cfoMetaAdsAuth] kunde inte hämta ad accounts:', acctErr.message);
      }

      await connectorStore.saveConnection({
        accessToken,
        refreshToken: longLived.access_token || shortLived.access_token,
        expiresAt,
        accountName,
        adAccountId,
        businessManagerId,
        pageId: defaultPageId,
      });

      audit('cf.meta_ads.connected', actor, {
        adAccountId,
        accountName,
        hasBusinessManagerId: !!businessManagerId,
        hasPageId: !!defaultPageId,
      });

      return res.redirect('/finance.html?meta_ads_connected=1');
    } catch (err) {
      console.error('[cfoMetaAdsAuth] callback error:', err);
      audit('cf.meta_ads.connect_failed', actor, { error: err.message });
      return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
  });

  router.get('/cco-cf/meta/status', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const status = connectorStore.getStatus();
    return res.json({ ok: true, ...status, config: getAuthConfig() });
  });

  // Diagnostik/listning: hämta fakturor från Meta utan att skapa något.
  // ?probe=true kör discovery: adkontots business-fält + /me/businesses +
  // business_invoices per business — visar exakt vilken edge som fungerar.
  router.get('/cco-cf/meta/invoices', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const { createMetaAdsAdapter } = require('../cfo/vendors/metaAds');
      const adapter = createMetaAdsAdapter({ connectorStore });
      if (String(req.query.probe || '') === 'true') {
        const token = connectorStore.getAccessToken();
        const actId = connectorStore.getAdAccountId();
        const probe = { actId, steps: [] };
        const call = async (label, url) => {
          try {
            const r = await fetch(url);
            const j = await r.json().catch(() => ({}));
            probe.steps.push({
              label,
              status: r.status,
              ok: r.ok,
              error: j?.error?.message || null,
              data: Array.isArray(j?.data)
                ? j.data.slice(0, 5)
                : j?.data
                  ? 'paginerad'
                  : Object.keys(j).slice(0, 10),
            });
            return j;
          } catch (e) {
            probe.steps.push({ label, ok: false, error: e.message });
            return null;
          }
        };
        const base = 'https://graph.facebook.com/v21.0';
        const t = encodeURIComponent(token || '');
        await call(
          'adkonto+business-fält',
          `${base}/act_${actId}?fields=name,business,account_status&access_token=${t}`
        );
        const biz = await call(
          'me/businesses',
          `${base}/me/businesses?fields=name,id&access_token=${t}`
        );
        const bizIds = Array.isArray(biz?.data) ? biz.data.map((b) => b.id) : [];
        for (const bid of bizIds) {
          await call(
            `business_invoices@${bid}`,
            `${base}/${bid}/business_invoices?limit=10&access_token=${t}`
          );
        }
        await call(
          `act_business_invoices`,
          `${base}/act_${actId}/business_invoices?limit=10&access_token=${t}`
        );
        return res.json({ ok: true, probe });
      }
      const fromDate = req.query.fromDate || '2026-01-01';
      const toDate = req.query.toDate || new Date().toISOString().slice(0, 10);
      const result = await adapter.fetchInvoices({ fromDate, toDate });
      if (!result.ok) {
        return res
          .status(502)
          .json({ ok: false, error: result.error, configured: adapter.isConfigured() });
      }
      return res.json({
        ok: true,
        fromDate,
        toDate,
        count: result.invoices.length,
        invoices: result.invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          invoicePeriod: inv.invoicePeriod,
          date: inv.date,
          amountOriginal: inv.amountOriginal,
          currency: inv.currency,
          hasPdf: Boolean(inv.pdfUrl),
        })),
        sampleRaw: result.invoices[0]?.raw || null,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/cco-cf/meta/disconnect', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const actor = { userId: req.user?.id || null, role: req.user?.role || null };
    await connectorStore.disconnect({ reason: req.body?.reason || 'owner_request' });
    audit('cf.meta_ads.disconnected', actor, {});
    return res.json({ ok: true, disconnected: true });
  });

  return { router, credentialsConfigured };
}

module.exports = { createCfoMetaAdsAuthRouter };
