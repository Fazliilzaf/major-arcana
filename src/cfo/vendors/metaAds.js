'use strict';

/**
 * Meta Ads Billing invoice adapter.
 *
 * Hämtar fakturor från Meta Marketing API via Graph API.
 * Kräver:
 *  - META_ADS_AD_ACCOUNT_ID (numeric, utan "act_")
 *  - META_ADS_ACCESS_TOKEN (long-lived user access token med ads_read)
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
  // Meta returnerar ofta Unix-timestamp som sekunder (t.ex. "1672531200") eller ISO.
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
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
} = {}) {
  const name = 'meta_ads';
  const displayName = 'Meta Ads';

  const safeAdAccountId =
    normalizeAccountId(adAccountId) ||
    normalizeAccountId(process.env.META_ADS_AD_ACCOUNT_ID) ||
    normalizeAccountId(process.env.ARCANA_MARKETING_META_AD_ACCOUNT_ID);
  const safeAccessToken =
    normalizeText(accessToken) ||
    normalizeText(process.env.META_ADS_ACCESS_TOKEN) ||
    normalizeText(process.env.ARCANA_MARKETING_META_ACCESS_TOKEN);

  function isConfigured() {
    return Boolean(safeAdAccountId && safeAccessToken);
  }

  function resolveAmount(rawAmount, currency) {
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount)) return { amount: 0, amountSek: null, amountOriginal: null };
    // Meta kan returnera belopp i olika enheter beroende på endpoint.
    // Vissa endpoints returnerar cents, andra den verkliga valutan.
    // Vi antar här att beloppet är i huvudvaluta (t.ex. 12.50 EUR) om det är litet,
    // annars i cents. Detta är en MVP-heuristik som kan finjusteras när vi ser svaret.
    const isCents = Math.abs(amount) > 1000 && currency && currency !== 'JPY' && currency !== 'KRW';
    const finalAmount = isCents ? amount / 100 : amount;
    const amountSek = currency === 'SEK' ? finalAmount : null;
    return { amount: finalAmount, amountSek, amountOriginal: finalAmount };
  }

  async function fetchInvoices({ fromDate, toDate } = {}) {
    if (!isConfigured()) {
      return {
        ok: false,
        error:
          'Meta Ads-adapter är inte konfigurerad (saknar META_ADS_AD_ACCOUNT_ID eller META_ADS_ACCESS_TOKEN)',
        invoices: [],
      };
    }

    if (!fromDate || !toDate) {
      return { ok: false, error: 'fromDate/toDate krävs', invoices: [] };
    }

    try {
      const url = new URL(`${META_GRAPH_API_BASE}/act_${safeAdAccountId}/invoices`);
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
            description: `Meta Ads faktura ${normalizeText(inv?.invoice_number || inv?.id || '')}`,
            amountSek,
            amountOriginal,
            currency,
            vatSek: null,
            date,
            invoiceNumber: normalizeText(inv?.invoice_number || inv?.id) || null,
            invoicePeriod: normalizeText(inv?.period) || null,
            sourceUrl: `https://business.facebook.com/billing_hub/payment_settings/account?act=${safeAdAccountId}`,
            raw: inv,
          };
        });

      return { ok: true, invoices: mapped };
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = { createMetaAdsAdapter };
