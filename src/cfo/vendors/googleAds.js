'use strict';

/**
 * Google Ads Billing invoice adapter.
 *
 * Hämtar fakturor från Google Ads Billing API via REST.
 * Kräver:
 *  - GOOGLE_ADS_DEVELOPER_TOKEN
 *  - GOOGLE_ADS_CUSTOMER_ID (numeric, utan bindestreck)
 *  - GOOGLE_ADS_ACCESS_TOKEN (OAuth access token)
 *  - GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC-konto, krävs om konto inte är direkt ägare)
 *
 * Docs:
 *  - https://developers.google.com/google-ads/api/rest/auth
 *  - https://developers.google.com/google-ads/api/docs/billing/invoicing
 */

const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v16';
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
  // Google Ads Billing API period format: YYYYMM
  const d = parseDate(isoDate);
  if (!d) return null;
  return d.slice(0, 4) + d.slice(5, 7);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let text;
    if (typeof response.text === 'function') {
      text = await response.text();
    } else if (typeof response.json === 'function') {
      const jsonValue = await response.json();
      text = typeof jsonValue === 'string' ? jsonValue : JSON.stringify(jsonValue ?? '');
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

function createGoogleAdsAdapter({
  developerToken,
  customerId,
  loginCustomerId,
  accessToken,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
} = {}) {
  const name = 'google_ads';
  const displayName = 'Google Ads';
  const safeDeveloperToken = normalizeText(developerToken);
  const safeCustomerId = normalizeCustomerId(customerId);
  const safeLoginCustomerId = normalizeCustomerId(loginCustomerId);
  const safeAccessToken = normalizeText(accessToken);

  function isConfigured() {
    return Boolean(safeDeveloperToken && safeCustomerId && safeAccessToken);
  }

  function authHeaders() {
    const headers = {
      Authorization: `Bearer ${safeAccessToken}`,
      'developer-token': safeDeveloperToken,
      'Content-Type': 'application/json',
    };
    if (safeLoginCustomerId) {
      headers['login-customer-id'] = safeLoginCustomerId;
    }
    return headers;
  }

  /**
   * Hämta invoices för en eller flera månader.
   */
  async function fetchInvoices({ fromDate, toDate } = {}) {
    if (!isConfigured()) {
      return {
        ok: false,
        error: 'Google Ads-adapter är inte konfigurerad (saknar token/customerId/developerToken)',
        invoices: [],
      };
    }

    const fromPeriod = formatPeriod(fromDate);
    const toPeriod = formatPeriod(toDate);
    if (!fromPeriod || !toPeriod) {
      return { ok: false, error: 'fromDate/toDate krävs i formatet YYYY-MM-DD', invoices: [] };
    }

    const url = new URL(`${GOOGLE_ADS_API_BASE}/customers/${safeCustomerId}/invoices`);
    url.searchParams.set('pageSize', '100');
    // Billing API stödjer inte alltid date-range; vi filtrerar efteråt om det behövs.

    try {
      const response = await fetchWithTimeout(
        url.toString(),
        {
          method: 'GET',
          headers: authHeaders(),
        },
        timeoutMs
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorText =
          payload?.error?.message ||
          payload?.error?.status ||
          `${response.status} ${response.statusText}`;
        return {
          ok: false,
          error: `Google Ads Billing API fel: ${errorText}`,
          invoices: [],
        };
      }

      const rawInvoices = Array.isArray(payload.invoices) ? payload.invoices : [];
      const invoices = rawInvoices
        .filter((inv) => {
          const period = String(inv?.invoicePeriod || inv?.invoicePeriodStart || '');
          if (!period) return true; // inkludera alltid om vi inte kan avgöra
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
            sourceUrl: `https://ads.google.com/aw/billing/documents?customerId=${safeCustomerId}`,
            raw: inv,
          };
        });

      return { ok: true, invoices };
    } catch (err) {
      return { ok: false, error: err?.message || 'okänt fel', invoices: [] };
    }
  }

  return {
    name,
    displayName,
    isConfigured,
    fetchInvoices,
  };
}

module.exports = { createGoogleAdsAdapter };
