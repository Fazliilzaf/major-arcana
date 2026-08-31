'use strict';

/**
 * Meta Ads Billing invoice adapter.
 *
 * Hämtar fakturor från Meta Marketing API via Graph API.
 * Kräver antingen:
 *  - En sparad OAuth-anslutning via cfoMetaAdsConnectorStore (rekommenderat),
 *    med ad_account_id sparad i connectorns metadata, ELLER
 *  - META_ADS_AD_ACCOUNT_ID + META_ADS_ACCESS_TOKEN (legacy/env-fallback)
 *
 * Docs:
 *  - https://developers.facebook.com/docs/marketing-api/billing
 */

const META_GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAccountId(value) {
  return normalizeText(value).replace(/^act_/, '').replace(/-/g, '');
}

function parseDate(value) {
  const str = normalizeText(value);
  if (!str) return null;
  const asNumber = Number(str);
  if (Number.isFinite(asNumber) && asNumber > 1_000_000_000) {
    return new Date(asNumber * 1000).toISOString().slice(0, 10);
  }
  if (Number.isFinite(asNumber) && asNumber > 1_000_000) {
    return new Date(asNumber).toISOString().slice(0, 10);
  }
  const iso = str.replace(/\//g, '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return null;
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
      const timeoutError = new Error(`Meta Ads-anrop timeout (${timeoutMs}ms): ${url}`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function createMetaAdsAdapter({
  adAccountId,
  accessToken,
  businessManagerId,
  connectorStore,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
} = {}) {
  const name = 'meta_ads';
  const displayName = 'Meta Ads';

  // Legacy/env-fallback: explicita parametrar eller miljövariabler.
  const envAdAccountId =
    normalizeAccountId(adAccountId) ||
    normalizeAccountId(process.env.META_ADS_AD_ACCOUNT_ID) ||
    normalizeAccountId(process.env.ARCANA_MARKETING_META_AD_ACCOUNT_ID);
  const envBusinessManagerId =
    normalizeText(businessManagerId) || normalizeText(process.env.META_BUSINESS_MANAGER_ID);
  const envAccessToken =
    normalizeText(accessToken) ||
    normalizeText(process.env.META_ADS_ACCESS_TOKEN) ||
    normalizeText(process.env.ARCANA_MARKETING_META_ACCESS_TOKEN);

  function hasConnectorStore() {
    return connectorStore && typeof connectorStore.isConnected === 'function';
  }

  function resolveAdAccountId() {
    if (hasConnectorStore()) {
      const fromStore = connectorStore.getAdAccountId();
      if (fromStore) return fromStore;
    }
    return envAdAccountId || null;
  }

  function resolveBusinessManagerId() {
    if (hasConnectorStore() && typeof connectorStore.getBusinessManagerId === 'function') {
      const fromStore = connectorStore.getBusinessManagerId();
      if (fromStore) return fromStore;
    }
    return envBusinessManagerId || null;
  }

  function resolveAccessToken() {
    if (hasConnectorStore()) {
      const fromStore = connectorStore.getAccessToken();
      if (fromStore) return fromStore;
    }
    return envAccessToken || null;
  }

  function isConfigured() {
    const token = resolveAccessToken();
    if (!token) return false;
    // business_invoices-edgen kräver business manager-id, inte ad account-id.
    return Boolean(resolveBusinessManagerId() || resolveAdAccountId());
  }

  function resolveAmount(rawAmount, currency) {
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount)) return { amount: 0, amountSek: null, amountOriginal: null };
    const isCents = Math.abs(amount) > 1000 && currency && currency !== 'JPY' && currency !== 'KRW';
    const finalAmount = isCents ? amount / 100 : amount;
    const amountSek = currency === 'SEK' ? finalAmount : null;
    return { amount: finalAmount, amountSek, amountOriginal: finalAmount };
  }

  async function fetchInvoices({ fromDate, toDate } = {}) {
    const safeBusinessManagerId = resolveBusinessManagerId();
    const safeAdAccountId = resolveAdAccountId();
    const safeAccessToken = resolveAccessToken();

    if (!safeAccessToken) {
      return {
        ok: false,
        error:
          'Meta Ads-adapter är inte konfigurerad. Koppla kontot via finance.html eller sätt META_ADS_ACCESS_TOKEN.',
        invoices: [],
      };
    }

    if (!safeBusinessManagerId && !safeAdAccountId) {
      return {
        ok: false,
        error:
          'Meta Ads-adapter saknar både business manager-id och ad account-id. Koppla om kontot via finance.html eller sätt META_BUSINESS_MANAGER_ID.',
        invoices: [],
      };
    }

    if (
      hasConnectorStore() &&
      typeof connectorStore.isTokenExpired === 'function' &&
      connectorStore.isTokenExpired()
    ) {
      return {
        ok: false,
        error: 'Meta Ads-anslutningen har gått ut. Koppla om kontot via finance.html.',
        invoices: [],
      };
    }

    if (!fromDate || !toDate) {
      return { ok: false, error: 'fromDate/toDate krävs', invoices: [] };
    }

    try {
      // business_invoices finns på business manager-nivå, inte ad account-nivå.
      // Använder businessManagerId om tillgängligt, annars faller vi tillbaka på
      // ad account-nivån (den kommer troligen att ge #100, men ger en tydlig signal).
      const graphPath = safeBusinessManagerId
        ? `${safeBusinessManagerId}/business_invoices`
        : `act_${safeAdAccountId}/business_invoices`;
      const url = new URL(`${META_GRAPH_API_BASE}/${graphPath}`);
      url.searchParams.set('access_token', safeAccessToken);
      url.searchParams.set('limit', '500');

      const response = await fetchWithTimeout(url.toString(), { method: 'GET' }, timeoutMs);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorText =
          payload?.error?.message ||
          payload?.error?.type ||
          `${response.status} ${response.statusText}`;
        return { ok: false, error: `Meta Ads API-fel: ${errorText}`, invoices: [] };
      }

      const rawInvoices = asArray(payload.data || payload.invoices || payload);
      const mapped = rawInvoices
        .filter((inv) => {
          const invoiceDate = parseDate(
            inv?.date || inv?.invoice_date || inv?.payment_date || inv?.period_start
          );
          if (!invoiceDate || !fromDate || !toDate) return true;
          return invoiceDate >= fromDate && invoiceDate <= toDate;
        })
        .map((inv) => {
          const currency = normalizeText(inv?.currency || inv?.invoice_currency) || 'USD';
          const { amount, amountSek, amountOriginal } = resolveAmount(
            inv?.amount || inv?.total || inv?.amount_due,
            currency
          );
          const date = parseDate(
            inv?.date || inv?.invoice_date || inv?.payment_date || inv?.period_start
          );
          return {
            supplier: 'Meta / Facebook',
            description: `Meta Ads faktura ${normalizeText(inv?.invoice_number || inv?.invoice_id || inv?.id || '')}`,
            amountSek,
            amountOriginal,
            currency,
            vatSek: null,
            date,
            invoiceNumber: normalizeText(inv?.invoice_number || inv?.invoice_id || inv?.id) || null,
            invoicePeriod: normalizeText(inv?.period) || null,
            pdfUrl: normalizeText(inv?.download_uri || inv?.download_url) || null,
            sourceUrl: safeBusinessManagerId
              ? `https://business.facebook.com/billing_hub/payment_settings?business_id=${safeBusinessManagerId}`
              : `https://business.facebook.com/billing_hub/payment_settings/account?act=${safeAdAccountId}`,
            raw: inv,
          };
        });

      return { ok: true, invoices: mapped };
    } catch (err) {
      return { ok: false, error: err?.message || 'okänt fel', invoices: [] };
    }
  }

  // Hämtar faktura-PDF via download_uri (signerad länk; access_token som
  // query-parameter om URL:en inte redan bär den).
  async function fetchInvoicePdfBuffer(pdfUrl) {
    const url = normalizeText(pdfUrl);
    if (!url) return { ok: false, error: 'pdfUrl saknas', buffer: null };
    const token = resolveAccessToken();
    const withToken =
      token && !url.includes('access_token=')
        ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`
        : url;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(withToken, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        return {
          ok: false,
          error: `PDF-nedladdning misslyckades (${response.status})`,
          buffer: null,
        };
      }
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length) return { ok: false, error: 'tom PDF', buffer: null };
      return { ok: true, buffer: buf };
    } catch (err) {
      return { ok: false, error: err?.message || 'nedladdningsfel', buffer: null };
    }
  }

  return {
    name,
    displayName,
    isConfigured,
    fetchInvoices,
    fetchInvoicePdfBuffer,
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = { createMetaAdsAdapter };
