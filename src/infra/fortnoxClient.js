'use strict';

const FORTNOX_AUTH_URL = 'https://apps.fortnox.se/oauth-v1/auth';
const FORTNOX_TOKEN_URL = 'https://apps.fortnox.se/oauth-v1/token';
const FORTNOX_API_BASE = 'https://api.fortnox.se/3';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildFortnoxAuthUrl({ clientId, redirectUri, scope, state } = {}) {
  const url = new URL(FORTNOX_AUTH_URL);
  url.searchParams.set('client_id', normalizeText(clientId));
  url.searchParams.set('redirect_uri', normalizeText(redirectUri));
  url.searchParams.set('scope', normalizeText(scope) || 'customer invoice');
  url.searchParams.set('state', normalizeText(state));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

async function exchangeAuthorizationCode({
  clientId,
  clientSecret,
  redirectUri,
  code,
} = {}) {
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

async function requestFortnoxToken({ clientId, clientSecret, body }) {
  const credentials = Buffer.from(`${normalizeText(clientId)}:${normalizeText(clientSecret)}`).toString(
    'base64'
  );
  const response = await fetch(FORTNOX_TOKEN_URL, {
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
    const needsRefresh =
      !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < 60 * 1000;
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

  async function request(path, { method = 'GET', body } = {}) {
    const accessToken = await resolveAccessToken();
    const response = await fetch(`${FORTNOX_API_BASE}${path}`, {
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
  };
}

module.exports = {
  FORTNOX_API_BASE,
  FORTNOX_AUTH_URL,
  FORTNOX_TOKEN_URL,
  buildFortnoxAuthUrl,
  createFortnoxClient,
  exchangeAuthorizationCode,
  refreshAccessToken,
};
