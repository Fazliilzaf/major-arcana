'use strict';

/**
 * cfoGoogleAdsConnectorStore — spara Google Ads OAuth-anslutning för CFO.
 *
 * Eftersom refresh_token är långlivad men känslig krypteras den på disk med
 * AES-256-GCM (se cfoCrypto.js). Access token och metadata lagras också, men
 * access token är kortlivat och förnyas vid behov.
 *
 * Filplats: stateRoot/cfo-google-ads-connector.json (gitignored via data/).
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { encrypt, decrypt } = require('./cfoCrypto');

const SCHEMA_VERSION = '1.0.0';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCustomerIds(value) {
  return normalizeText(value)
    .split(/[,;]/)
    .map((s) => s.replace(/-/g, '').trim())
    .filter(Boolean);
}

async function createCfoGoogleAdsConnectorStore({ filePath } = {}) {
  if (!filePath) throw new Error('filePath krävs');
  await fsp.mkdir(path.dirname(filePath), { recursive: true });

  const data = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    connected: false,
    status: 'disconnected',
    real: false,
    token: null, // krypterad access token (kortlivad)
    refreshToken: null, // krypterad refresh token
    expiresAt: null,
    meta: {
      developerTokenConfigured: false,
      customerIds: [],
      loginCustomerId: null,
      accountName: null,
    },
    history: [],
  };

  async function load() {
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.assign(data, parsed);
        // Avkryptera aldrig här; gör det explicit vid läsning.
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        console.error('[cfoGoogleAdsConnectorStore] kunde inte läsa fil:', err?.message);
      }
    }
  }

  await load();

  async function persist() {
    data.updatedAt = nowIso();
    await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  function audit(action, detail) {
    data.history.push({
      action,
      at: nowIso(),
      detail: detail || {},
    });
    // Bevara senaste 100 poster.
    if (data.history.length > 100) data.history = data.history.slice(-100);
  }

  function isConnected() {
    return data.connected === true && data.status === 'connected';
  }

  function isTokenExpired() {
    if (!data.expiresAt) return true;
    // 1 minuts marginal.
    return new Date(data.expiresAt) < new Date(Date.now() - 60 * 1000);
  }

  function getRefreshToken() {
    return decrypt(data.refreshToken);
  }

  function getAccessToken() {
    return decrypt(data.token);
  }

  function getCustomerIds() {
    return parseCustomerIds(data.meta?.customerIds?.join(','));
  }

  async function saveConnection({
    accessToken,
    refreshToken,
    expiresAt,
    accountName,
    customerIds,
    loginCustomerId,
    developerTokenConfigured,
  } = {}) {
    if (!refreshToken) {
      throw new Error('refreshToken krävs för att spara en real Google Ads-anslutning');
    }
    data.connected = true;
    data.status = 'connected';
    data.real = true;
    data.token = encrypt(accessToken) || null;
    data.refreshToken = encrypt(refreshToken) || null;
    data.expiresAt = expiresAt || null;
    data.meta.accountName = accountName || null;
    data.meta.customerIds = parseCustomerIds(customerIds);
    data.meta.loginCustomerId = normalizeText(loginCustomerId).replace(/-/g, '') || null;
    data.meta.developerTokenConfigured = developerTokenConfigured === true;
    audit('google_ads.connected', {
      accountName: data.meta.accountName,
      customerIds: data.meta.customerIds,
      hasLoginCustomerId: !!data.meta.loginCustomerId,
      hasDeveloperToken: data.meta.developerTokenConfigured,
    });
    await persist();
  }

  async function updateAccessToken({ accessToken, expiresAt } = {}) {
    if (!accessToken) return;
    data.token = encrypt(accessToken) || null;
    data.expiresAt = expiresAt || null;
    await persist();
  }

  async function disconnect({ reason = '' } = {}) {
    data.connected = false;
    data.status = 'disconnected';
    data.real = false;
    data.token = null;
    data.refreshToken = null;
    data.expiresAt = null;
    audit('google_ads.disconnected', { reason });
    await persist();
  }

  function getStatus() {
    return {
      connected: isConnected(),
      status: data.status,
      real: data.real,
      expired: isConnected() && isTokenExpired() && !data.refreshToken,
      expiresAt: data.expiresAt,
      accountName: data.meta?.accountName || null,
      customerIds: data.meta?.customerIds || [],
      loginCustomerId: data.meta?.loginCustomerId || null,
      developerTokenConfigured: data.meta?.developerTokenConfigured === true,
      credentialsConfigured: data.meta?.developerTokenConfigured === true,
    };
  }

  return {
    isConnected,
    isTokenExpired,
    getAccessToken,
    getRefreshToken,
    getCustomerIds,
    saveConnection,
    updateAccessToken,
    disconnect,
    getStatus,
    // Exponera rådata internt för adaptern.
    _data: data,
  };
}

module.exports = { createCfoGoogleAdsConnectorStore };
