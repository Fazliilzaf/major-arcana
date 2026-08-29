'use strict';

/**
 * Google Ads Billing invoice adapter.
 *
 * Hämtar fakturor från Google Ads Billing API via REST.
 * Kräver:
 *  - GOOGLE_ADS_DEVELOPER_TOKEN
 *  - GOOGLE_ADS_CUSTOMER_ID (numeric, utan bindestreck)
 *  - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (OAuth-app)
 *  - Sparad refresh-token från cfoGoogleAdsConnectorStore
 *
 * Docs:
 *  - https://developers.google.com/google-ads/api/rest/auth
 *  - https://developers.google.com/google-ads/api/docs/billing/invoicing
 */

// Google Ads API-versioner sunset:as löpande (~1 år livslängd). v16–v21 är
// pensionerade och svarar 404; v22 är den första levande versionen
// (verifierat 2026-08-29: oautentiserat anrop ger 401, inte 404).
const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v22';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCustomerId(value) {
  return normalizeText(value).replace(/-/g, '');
}

function parseDate(value) {
  const str = normalizeText(value);
  if (!str) return null;
  const iso = str.replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso;
}

function formatPeriod(isoDate) {
  const d = parseDate(isoDate);
  if (!d) return null;
  return d.slice(0, 4) + d.slice(5, 7);
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let text;
    if (typeof response.text === 'function') {
      text = await response.text();
    } else {
      text = '';
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      text: () => Promise.resolve(text),
      json: () => Promise.resolve(text).then((t) => JSON.parse(t || '{}')),
    };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutError = new Error(`Google Ads-anrop timeout (${timeoutMs}ms): ${url}`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Saknar refreshToken, clientId eller clientSecret för Google Ads OAuth');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchWithTimeout(
    GOOGLE_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    30_000
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      payload?.error_description || payload?.error || `${response.status} ${response.statusText}`;
    const err = new Error(`Google Ads OAuth refresh failed: ${detail}`);
    err.statusCode = response.status;
    throw err;
  }
  return payload;
}

function createGoogleAdsAdapter({
  developerToken,
  customerId,
  loginCustomerId,
  clientId,
  clientSecret,
  connectorStore,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
} = {}) {
  const name = 'google_ads';
  const displayName = 'Google Ads';

  // Miljövariabler är fallback om inget skickas explicit (vilket är normalfallet
  // när adaptern initieras via vendorRegistry från cfoVendorInvoiceFetch).
  const safeDeveloperToken =
    normalizeText(developerToken) || normalizeText(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const safeClientId = normalizeText(clientId) || normalizeText(process.env.GOOGLE_CLIENT_ID);
  const safeClientSecret =
    normalizeText(clientSecret) || normalizeText(process.env.GOOGLE_CLIENT_SECRET);
  const safeLoginCustomerId =
    normalizeCustomerId(loginCustomerId) ||
    normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

  function resolveCustomerIds() {
    if (customerId) {
      return normalizeText(customerId)
        .split(/[,;]/)
        .map((s) => normalizeCustomerId(s))
        .filter(Boolean);
    }
    if (process.env.GOOGLE_ADS_CUSTOMER_ID) {
      return normalizeText(process.env.GOOGLE_ADS_CUSTOMER_ID)
        .split(/[,;]/)
        .map((s) => normalizeCustomerId(s))
        .filter(Boolean);
    }
    if (connectorStore && typeof connectorStore.getCustomerIds === 'function') {
      return connectorStore.getCustomerIds();
    }
    return [];
  }

  function isConfigured() {
    return Boolean(
      safeDeveloperToken &&
      resolveCustomerIds().length > 0 &&
      safeClientId &&
      safeClientSecret &&
      connectorStore
    );
  }

  function authHeaders(accessToken) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': safeDeveloperToken,
      'Content-Type': 'application/json',
    };
    if (safeLoginCustomerId) {
      headers['login-customer-id'] = safeLoginCustomerId;
    }
    return headers;
  }

  async function ensureAccessToken() {
    if (!connectorStore) {
      throw new Error('Google Ads-connectorStore saknas');
    }
    if (!connectorStore.isConnected()) {
      throw new Error(
        'Google Ads är inte kopplat. Gå till finance.html och klicka "Koppla Google Ads".'
      );
    }

    // Om access token fortfarande är giltigt, använd det.
    let accessToken = connectorStore.getAccessToken();
    if (accessToken && !connectorStore.isTokenExpired()) {
      return accessToken;
    }

    const refreshToken = connectorStore.getRefreshToken();
    if (!refreshToken) {
      throw new Error('Google Ads-anslutningen saknar refresh token — koppla om kontot.');
    }

    const tokens = await refreshAccessToken({
      refreshToken,
      clientId: safeClientId,
      clientSecret: safeClientSecret,
    });

    if (!tokens.access_token) {
      throw new Error('Google Ads refresh returnerade ingen access token');
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + asInt(tokens.expires_in) * 1000).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString();

    await connectorStore.updateAccessToken({ accessToken: tokens.access_token, expiresAt });
    accessToken = tokens.access_token;
    return accessToken;
  }

  async function fetchBufferWithTimeout(url, options = {}, timeout = DEFAULT_FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        return { ok: false, status: response.status, buffer: null };
      }
      const arrayBuffer = await response.arrayBuffer();
      return { ok: true, status: response.status, buffer: Buffer.from(arrayBuffer) };
    } catch (error) {
      if (error && error.name === 'AbortError') {
        const timeoutError = new Error(`Google Ads PDF-nedladdning timeout (${timeout}ms): ${url}`);
        timeoutError.statusCode = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // Hämtar själva faktura-PDF:en via invoice.pdfUrl (signerad URL).
  // Googles exempel laddar ner URL:en utan auth, men vissa konton kräver
  // OAuth-header — prova med Authorization först, fall tillbaka utan.
  async function fetchInvoicePdfBuffer(pdfUrl) {
    const url = normalizeText(pdfUrl);
    if (!url) return { ok: false, error: 'pdfUrl saknas', buffer: null };
    let accessToken = null;
    try {
      accessToken = await ensureAccessToken();
    } catch (err) {
      // Fortsätt ändå — URL:en kan vara publikt signerad.
    }
    const attempts = [];
    if (accessToken) attempts.push({ Authorization: `Bearer ${accessToken}` });
    attempts.push({});
    let lastStatus = null;
    for (const headers of attempts) {
      try {
        const res = await fetchBufferWithTimeout(url, { method: 'GET', headers }, timeoutMs);
        if (res.ok && res.buffer && res.buffer.length > 0) {
          return { ok: true, buffer: res.buffer };
        }
        lastStatus = res.status;
      } catch (err) {
        lastStatus = err?.statusCode || err?.message;
      }
    }
    return {
      ok: false,
      error: `PDF-nedladdning misslyckades (${lastStatus || 'okänt'})`,
      buffer: null,
    };
  }

  async function fetchInvoices({ fromDate, toDate } = {}) {
    if (!isConfigured()) {
      return {
        ok: false,
        error:
          'Google Ads-adapter är inte konfigurerad (saknar developer token, customerId, clientId/clientSecret eller connector store)',
        invoices: [],
      };
    }

    const fromPeriod = formatPeriod(fromDate);
    const toPeriod = formatPeriod(toDate);
    if (!fromPeriod || !toPeriod) {
      return { ok: false, error: 'fromDate/toDate krävs i formatet YYYY-MM-DD', invoices: [] };
    }

    try {
      const accessToken = await ensureAccessToken();
      const customerIds = resolveCustomerIds();
      const allInvoices = [];
      const accountErrors = [];

      for (const cid of customerIds) {
        const url = new URL(`${GOOGLE_ADS_API_BASE}/customers/${cid}/invoices`);
        url.searchParams.set('pageSize', '100');

        const response = await fetchWithTimeout(
          url.toString(),
          {
            method: 'GET',
            headers: authHeaders(accessToken),
          },
          timeoutMs
        );

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const errorText =
            payload?.error?.message ||
            payload?.error?.status ||
            `${response.status} ${response.statusText}`;
          // Hoppa över konton som inte kan nås just nu, rapportera i stället för att döda hela hämtningen.
          console.warn(
            `[googleAdsAdapter] kunde inte hämta fakturor för konto ${cid}: ${errorText}`
          );
          accountErrors.push({ customerId: cid, status: response.status, error: errorText });
          continue;
        }

        const rawInvoices = Array.isArray(payload.invoices) ? payload.invoices : [];
        const mapped = rawInvoices
          .filter((inv) => {
            const period = String(inv?.invoicePeriod || inv?.invoicePeriodStart || '');
            if (!period) return true;
            return period >= fromPeriod && period <= toPeriod;
          })
          .map((inv) => {
            const amount = Number(inv?.amountMicros || 0) / 1_000_000;
            const currency = normalizeText(inv?.currencyCode) || 'SEK';
            const date = String(inv?.invoicePeriodStart || inv?.invoicePeriod || '');
            const formattedDate =
              date.length === 6 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-01` : parseDate(date);
            return {
              supplier: 'Google Ads',
              description: `Google Ads faktura ${normalizeText(inv?.invoiceNumber) || ''}`,
              amountSek: currency === 'SEK' ? amount : null,
              amountOriginal: amount,
              currency,
              vatSek: null,
              date: formattedDate,
              invoiceNumber: normalizeText(inv?.invoiceNumber) || null,
              invoicePeriod: normalizeText(inv?.invoicePeriod) || null,
              pdfUrl: normalizeText(inv?.pdfUrl) || null,
              sourceUrl: `https://ads.google.com/aw/billing/documents?customerId=${cid}`,
              raw: inv,
            };
          });

        allInvoices.push(...mapped);
      }

      return { ok: true, invoices: allInvoices, accountErrors };
    } catch (err) {
      return { ok: false, error: err?.message || 'okänt fel', invoices: [] };
    }
  }

  function needsBasicAccessError(message) {
    if (!message) return false;
    const lower = message.toLowerCase();
    return (
      lower.includes('permission denied') ||
      lower.includes('customer_not_enabled') ||
      lower.includes('not_ads_user') ||
      lower.includes('developer-token') ||
      lower.includes('developer token')
    );
  }

  async function fetchCampaignSpend({ fromDate, toDate } = {}) {
    if (!isConfigured()) {
      return {
        ok: false,
        error:
          'Google Ads-adapter är inte konfigurerad (saknar developer token, customerId, clientId/clientSecret eller connector store)',
        accounts: [],
      };
    }
    const from = parseDate(fromDate);
    const to = parseDate(toDate);
    if (!from || !to) {
      return { ok: false, error: 'fromDate/toDate krävs i formatet YYYY-MM-DD', accounts: [] };
    }

    try {
      const accessToken = await ensureAccessToken();
      const customerIds = resolveCustomerIds();
      const accounts = [];
      const accountErrors = [];

      for (const cid of customerIds) {
        const url = `${GOOGLE_ADS_API_BASE}/customers/${cid}/googleAds:searchStream`;
        const query =
          'SELECT customer.id, campaign.id, campaign.name, segments.date, metrics.cost_micros ' +
          `FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`;

        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: authHeaders(accessToken),
            body: JSON.stringify({ query }),
          },
          timeoutMs
        );

        const rawText = await response.text();
        const lines = rawText.split(/\r?\n/).filter(Boolean);
        const results = [];
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (Array.isArray(parsed.results)) {
              results.push(...parsed.results);
            } else if (parsed.error) {
              const errorMessage =
                parsed.error.message || parsed.error.status || JSON.stringify(parsed.error);
              if (needsBasicAccessError(errorMessage)) {
                return { ok: false, error: errorMessage, needsBasicAccess: true, accounts: [] };
              }
              console.warn(`[googleAdsAdapter] searchStream fel för ${cid}: ${errorMessage}`);
              continue;
            }
          } catch (parseErr) {
            // Ignorera korrupta NDJSON-rader.
          }
        }

        if (!response.ok && results.length === 0) {
          let errorMessage = `${response.status} ${response.statusText}`;
          try {
            const firstError = JSON.parse(lines[0] || '{}');
            errorMessage = firstError.error?.message || errorMessage;
          } catch {}
          const basicAccess = needsBasicAccessError(errorMessage);
          if (basicAccess) {
            return {
              ok: false,
              error: errorMessage,
              needsBasicAccess: true,
              accounts: [],
              accountErrors,
            };
          }
          console.warn(`[googleAdsAdapter] searchStream misslyckades för ${cid}: ${errorMessage}`);
          accountErrors.push({ customerId: cid, status: response.status, error: errorMessage });
          continue;
        }

        const byCampaign = new Map();
        const byMonth = new Map();
        let totalSpendSek = 0;
        for (const row of results) {
          const costMicros = Number(row.metrics?.costMicros || row.metrics?.cost_micros || 0);
          if (!Number.isFinite(costMicros) || costMicros <= 0) continue;
          const spendSek = costMicros / 1_000_000;
          const campaignId = String(row.campaign?.id || '');
          const campaignName = row.campaign?.name || '';
          const date = row.segments?.date || '';
          const month = date.length >= 7 ? date.slice(0, 7) : '';

          totalSpendSek += spendSek;
          if (month) {
            byMonth.set(month, (byMonth.get(month) || 0) + spendSek);
          }
          if (campaignId) {
            const existing = byCampaign.get(campaignId) || {
              campaignId,
              name: campaignName,
              spendSek: 0,
            };
            existing.spendSek += spendSek;
            byCampaign.set(campaignId, existing);
          }
        }

        accounts.push({
          customerId: cid,
          totalSpendSek: Math.round(totalSpendSek * 100) / 100,
          byMonth: [...byMonth.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, spendSek]) => ({ month, spendSek: Math.round(spendSek * 100) / 100 })),
          campaigns: [...byCampaign.values()]
            .sort((a, b) => b.spendSek - a.spendSek)
            .map((c) => ({ ...c, spendSek: Math.round(c.spendSek * 100) / 100 })),
        });
      }

      return { ok: true, accounts, accountErrors };
    } catch (err) {
      const basicAccess = needsBasicAccessError(err?.message);
      return {
        ok: false,
        error: err?.message || 'okänt fel',
        ...(basicAccess ? { needsBasicAccess: true } : {}),
        accounts: [],
      };
    }
  }

  return {
    name,
    displayName,
    isConfigured,
    fetchInvoices,
    fetchCampaignSpend,
    fetchInvoicePdfBuffer,
    // Exponerade för test/diagnostik
    _ensureAccessToken: ensureAccessToken,
  };
}

module.exports = { createGoogleAdsAdapter, refreshAccessToken };
