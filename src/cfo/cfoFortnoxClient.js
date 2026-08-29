'use strict';

const FORTNOX_AUTH_URL = 'https://apps.fortnox.se/oauth-v1/auth';
const FORTNOX_TOKEN_URL = 'https://apps.fortnox.se/oauth-v1/token';
const FORTNOX_REVOKE_URL = 'https://apps.fortnox.se/oauth-v1/revoke';
const FORTNOX_API_BASE = 'https://api.fortnox.se/3';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Bygger Fortnox auth-URL (authorization_code-flöde).
 *
 * @param {object} input
 * @param {string} input.clientId
 * @param {string} input.redirectUri
 * @param {string} input.scope
 * @param {string} input.state
 * @param {string} [input.accountType] — sätt till 'service' om OAuth-appen har Service Account
 *   aktiverat i Fortnox Dev Portal. Då skapas/återanvänds ett service-konto
 *   (robot-användare) frikopplat från specifik user-license. Krävs typiskt
 *   för att undvika `error_missing_license` när vanlig user-license saknas.
 */
function buildFortnoxAuthUrl({ clientId, redirectUri, scope, state, accountType } = {}) {
  const url = new URL(FORTNOX_AUTH_URL);
  url.searchParams.set('client_id', normalizeText(clientId));
  url.searchParams.set('redirect_uri', normalizeText(redirectUri));
  url.searchParams.set('scope', normalizeText(scope) || 'customer invoice payment bookkeeping');
  url.searchParams.set('state', normalizeText(state));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('response_type', 'code');
  // Service account-flag (kräver att Dev Portal-toggeln är på)
  const at = normalizeText(accountType).toLowerCase();
  if (at === 'service') {
    url.searchParams.set('account_type', 'service');
  }
  return url.toString();
}

async function exchangeAuthorizationCode({ clientId, clientSecret, redirectUri, code } = {}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: normalizeText(code),
    redirect_uri: normalizeText(redirectUri),
  });
  return requestFortnoxToken({ clientId, clientSecret, body });
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken } = {}) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: normalizeText(refreshToken),
  });
  return requestFortnoxToken({ clientId, clientSecret, body });
}

/**
 * Service Account client_credentials-flöde.
 * Kräver att Service Account är aktiverat i Dev Portal OCH att
 * authorize-flödet med account_type=service körts en gång för att
 * skapa service-kontot på tenant.
 *
 * @param {object} input
 * @param {string} input.clientId
 * @param {string} input.clientSecret
 * @param {string|number} input.tenantId — Fortnox numeric TenantId (NOT vår app-tenantId)
 * @param {string} [input.scope] — optional, defaults to consent scopes
 */
async function requestClientCredentialsToken({ clientId, clientSecret, tenantId, scope } = {}) {
  const numericTenant = String(tenantId || '').trim();
  if (!numericTenant) throw new Error('tenantId krävs för client_credentials');
  const credentials = Buffer.from(
    `${normalizeText(clientId)}:${normalizeText(clientSecret)}`
  ).toString('base64');
  const params = { grant_type: 'client_credentials' };
  if (scope) params.scope = normalizeText(scope);
  const body = new URLSearchParams(params);
  const response = await fetchWithTimeout(FORTNOX_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      TenantId: numericTenant,
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      normalizeText(payload.error_description || payload.error) ||
        'Fortnox client_credentials request failed.'
    );
    error.statusCode = response.status;
    error.metadata = payload;
    throw error;
  }
  const expiresIn = Number(payload.expires_in) || 3600;
  return {
    accessToken: normalizeText(payload.access_token),
    refreshToken: '', // client_credentials → ingen refresh token
    scope: normalizeText(payload.scope),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    tokenType: normalizeText(payload.token_type) || 'bearer',
  };
}

/**
 * Revoke en refresh token (rekommenderat för authorization_code-flöde
 * eftersom access tokens har kort livslängd).
 */
async function revokeRefreshToken({ clientId, clientSecret, refreshToken } = {}) {
  const credentials = Buffer.from(
    `${normalizeText(clientId)}:${normalizeText(clientSecret)}`
  ).toString('base64');
  const body = new URLSearchParams({
    token_type_hint: 'refresh_token',
    token: normalizeText(refreshToken),
  });
  const response = await fetchWithTimeout(FORTNOX_REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      normalizeText(payload.error_description || payload.error) || 'Fortnox revoke request failed.'
    );
    error.statusCode = response.status;
    error.metadata = payload;
    throw error;
  }
  return { revoked: Boolean(payload.revoked) };
}

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    // Läs body under samma timeout-skydd så att vi aldrig hänger på
    // en halvlevererad HTTP-respons (t.ex. headers kommer men body stannar).
    // Vissa test-mocks har bara .json(); stöd även det.
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
      const timeoutError = new Error(`Fortnox-anrop timeout (${timeoutMs}ms): ${url}`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestFortnoxToken({ clientId, clientSecret, body }) {
  const credentials = Buffer.from(
    `${normalizeText(clientId)}:${normalizeText(clientSecret)}`
  ).toString('base64');
  const response = await fetchWithTimeout(FORTNOX_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      normalizeText(payload.error_description || payload.error) || 'Fortnox token request failed.'
    );
    error.statusCode = response.status;
    error.metadata = payload;
    throw error;
  }
  const expiresIn = Number(payload.expires_in) || 3600;
  return {
    accessToken: normalizeText(payload.access_token),
    refreshToken: normalizeText(payload.refresh_token),
    scope: normalizeText(payload.scope),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

function createFortnoxClient({
  clientId,
  clientSecret,
  getConnection,
  saveConnection,
  tenantId,
} = {}) {
  async function resolveAccessToken() {
    const connection = await getConnection({ tenantId });
    if (!connection.accessToken) {
      const error = new Error('Fortnox är inte anslutet.');
      error.statusCode = 503;
      throw error;
    }
    const expiresAtMs = Date.parse(connection.expiresAt || '');
    // Förnya tidigt (50 minuter före utgång) så att långa batcher
    // (t.ex. voucher-sync) aldrig riskerar att köra med ett access token
    // som går ut mitt i processen. Fortnox access tokens lever 60 min.
    const needsRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < 50 * 60 * 1000;
    if (!needsRefresh) {
      return connection.accessToken;
    }
    if (!connection.refreshToken) {
      return connection.accessToken;
    }
    const refreshed = await refreshAccessToken({
      clientId,
      clientSecret,
      refreshToken: connection.refreshToken,
    });
    await saveConnection({
      tenantId,
      connection: {
        ...connection,
        ...refreshed,
        connected: true,
        lastRefreshAt: new Date().toISOString(),
        lastError: '',
      },
    });
    return refreshed.accessToken;
  }

  async function request(path, { method = 'GET', body, query } = {}) {
    const accessToken = await resolveAccessToken();
    let url = `${FORTNOX_API_BASE}${path}`;
    if (query && typeof query === 'object') {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
      if (params.toString()) url += `?${params.toString()}`;
    }
    const response = await fetchWithTimeout(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Secret': normalizeText(clientSecret),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        normalizeText(payload?.ErrorInformation?.message) ||
        normalizeText(payload?.message) ||
        `Fortnox API ${response.status}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.metadata = payload;
      throw error;
    }
    return payload;
  }

  return {
    createCustomer(payload) {
      return request('/customers', { method: 'POST', body: payload });
    },
    updateCustomer(customerNumber, payload) {
      return request(`/customers/${encodeURIComponent(customerNumber)}`, {
        method: 'PUT',
        body: payload,
      });
    },
    getCustomer(customerNumber) {
      return request(`/customers/${encodeURIComponent(customerNumber)}`);
    },
    listCustomers({ email, organisationNumber, page = 1 } = {}) {
      const params = new URLSearchParams({ page: String(page) });
      if (email) params.set('email', normalizeText(email));
      if (organisationNumber) params.set('organisationnumber', normalizeText(organisationNumber));
      return request(`/customers?${params.toString()}`);
    },
    getCompanyInformation() {
      return request('/companyinformation');
    },
    // 19F.4 Fix #2 — invoice + voucher listing per customer
    listInvoices({ customerNumber, fromDate, toDate, page = 1 } = {}) {
      const params = new URLSearchParams({ page: String(page) });
      if (customerNumber) params.set('customernumber', String(customerNumber));
      if (fromDate) params.set('fromdate', String(fromDate));
      if (toDate) params.set('todate', String(toDate));
      return request(`/invoices?${params.toString()}`);
    },
    getInvoice(documentNumber) {
      return request(`/invoices/${encodeURIComponent(documentNumber)}`);
    },
    // Förskott/deposit hanteras typiskt som InvoicePayment med separat dokumenttyp
    // OBS (ORD-58d): Fortnox /invoicepayments stödjer INTE fromdate/todate —
    // API:t svarar "Ogiltig parameter i anropet" (verifierat i prod 2026-07-12).
    // Datumfönstret filtreras i stället klient-sidigt i cfoFortnoxPaidPeriodTotals.
    listInvoicePayments({ customerNumber, page = 1 } = {}) {
      const params = new URLSearchParams({ page: String(page) });
      if (customerNumber) params.set('customernumber', String(customerNumber));
      return request(`/invoicepayments?${params.toString()}`);
    },
    // CF.9 (ORD-67, ägar-GO 2026-07-13 "GO + dryRun först"): verifikat-write.
    // OBS: kräver bookkeeping-scope i OAuth-anslutningen — dagens scope är
    // "customer invoice payment bookkeeping" → om-anslutning krävs innan skarp körning.
    // Anropas ENDAST via cfoFortnoxVoucherSync (env-gate + OAuth-gate + dryRun).
    createVoucher(voucherPayload) {
      return request('/vouchers', { method: 'POST', body: { Voucher: voucherPayload } });
    },
    // ORD-CM-30 · Läs-endpoint för syncing-avstämning: lista verifikat för det
    // räkenskapsår som innehåller datumet. Används ENDAST för att hitta redan
    // skapade verifikat (Description "CF <id> ...") — skriver ingenting.
    listVouchers({ financialYearDate, page = 1, limit = 100 } = {}) {
      const params = new URLSearchParams();
      if (financialYearDate) params.set('financialyeardate', financialYearDate);
      params.set('limit', String(limit));
      params.set('page', String(page));
      return request(`/vouchers?${params.toString()}`);
    },
    // Verifikat-läs för CFO-granskning (t.ex. verifiera kreditnota-rader).
    // financialYearRef är antingen räkenskapsårets numeriska Id (sträng/siffra)
    // eller ett datum (YYYY-MM-DD) som ligger inom räkenskapsåret. Fortnox
    // svarar 400 om ett datum skickas till /vouchers/{series}/{number}.
    getVoucher(voucherSeries, voucherNumber, financialYearRef) {
      const series = normalizeText(voucherSeries) || 'A';
      const number = encodeURIComponent(String(voucherNumber));
      const params = new URLSearchParams();
      if (financialYearRef) params.set('financialyear', String(financialYearRef));
      const qs = params.toString();
      return request(`/vouchers/${encodeURIComponent(series)}/${number}${qs ? '?' + qs : ''}`);
    },
    /**
     * Löser ett datum (YYYY-MM-DD) till det räkenskapsårs-id som Fortnox
     * kräver för /vouchers/{series}/{number} och /accounts/{number}.
     * Returnerar null om året inte hittas eller om något saknas.
     */
    async resolveFinancialYearId(dateStr) {
      const iso = normalizeText(dateStr).slice(0, 10);
      if (!iso) return null;
      const yearsRes = await request('/financialyears');
      const years = Array.isArray(yearsRes?.FinancialYears) ? yearsRes.FinancialYears : [];
      const year = years.find((y) => {
        const from = y?.FromDate ? String(y.FromDate).slice(0, 10) : null;
        const to = y?.ToDate ? String(y.ToDate).slice(0, 10) : null;
        if (!from || !to) return false;
        return iso >= from && iso <= to;
      });
      return year?.Id ? String(year.Id) : null;
    },
    // CF.9 — kontohantering: läs och uppdatera BAS-konton i Fortnox.
    // financialYear kan vara ett datum (YYYY-MM-DD) eller Fortnox år-ID.
    getAccount(accountNumber, { financialYear } = {}) {
      return request(`/accounts/${encodeURIComponent(accountNumber)}`, {
        query: financialYear ? { financialyear: String(financialYear) } : undefined,
      });
    },
    updateAccount(accountNumber, payload, { financialYear } = {}) {
      return request(`/accounts/${encodeURIComponent(accountNumber)}`, {
        method: 'PUT',
        body: { Account: payload },
        query: financialYear ? { financialyear: String(financialYear) } : undefined,
      });
    },
    activateAccount(accountNumber, { financialYear } = {}) {
      return request(`/accounts/${encodeURIComponent(accountNumber)}`, {
        method: 'PUT',
        body: { Account: { Active: true } },
        query: financialYear ? { financialyear: String(financialYear) } : undefined,
      });
    },
    listFinancialYears() {
      return request('/financialyears');
    },
    // ORD-B · Underlagsåterhämtning: Fortnox-arkivet (bilagor som revisorn
    // eventuellt laddat upp). Rätt endpoint är /archive (inte /attachments —
    // verifierat mot API:t 2026-08-29: "No such route"). Kräver att
    // anslutningens scope täcker arkivet — annars scope-fel, vilket
    // diagnostik-routen surfacar.
    listAttachments({ page = 1, limit = 100 } = {}) {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      return request(`/archive?${params.toString()}`);
    },
    getAttachment(attachmentId) {
      return request(`/archive/${encodeURIComponent(String(attachmentId))}`);
    },
    // Leverantörsfakturor (kan ha kopplade filer i Fortnox).
    listSupplierInvoices({ page = 1, limit = 100, fromDate, toDate } = {}) {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (fromDate) params.set('fromdate', String(fromDate));
      if (toDate) params.set('todate', String(toDate));
      return request(`/supplierinvoices?${params.toString()}`);
    },
  };
}

module.exports = {
  FORTNOX_API_BASE,
  FORTNOX_AUTH_URL,
  FORTNOX_TOKEN_URL,
  FORTNOX_REVOKE_URL,
  buildFortnoxAuthUrl,
  createFortnoxClient,
  exchangeAuthorizationCode,
  refreshAccessToken,
  requestClientCredentialsToken,
  revokeRefreshToken,
};
