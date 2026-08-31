'use strict';

/**
 * cfoMetaAdsConnectorStore — spara Meta Ads OAuth-anslutning för CFO.
 *
 * Eftersom access token är långlivad (typiskt 60 dagar för Meta) men känslig
 * krypteras den på disk med AES-256-GCM (se cfoCrypto.js). Refresh-token
 * stöds inte av Meta på samma sätt som Google; vi förnyar access token via
 * OAuth-flödet vid behov.
 *
 * Filplats: stateRoot/cfo-meta-ads-connector.json (gitignored via data/).
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { encrypt, decrypt } = require('./cfoCrypto');

const SCHEMA_VERSION = '1.0.0';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAccountId(value) {
  return normalizeText(value).replace(/^act_/, '').replace(/-/g, '');
}

function parseAccountId(value) {
  const raw = normalizeText(value).replace(/^act_/, '').replace(/-/g, '');
  return raw || null;
}

async function createCfoMetaAdsConnectorStore({ filePath } = {}) {
  if (!filePath) throw new Error('filePath krävs');
  await fsp.mkdir(path.dirname(filePath), { recursive: true });

  const data = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    connected: false,
    status: 'disconnected',
    real: false,
    token: null, // krypterad access token (långlivad i Meta, typiskt 60 dagar)
    refreshToken: null, // krypterad refresh token (Meta har ej alltid en, men spara om den ges)
    expiresAt: null,
    meta: {
      adAccountId: null,
      accountName: null,
      businessManagerId: null,
      pageId: null,
    },
    history: [],
  };

  async function load() {
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.assign(data, parsed);
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        console.error('[cfoMetaAdsConnectorStore] kunde inte läsa fil:', err?.message);
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

  function getAccessToken() {
    return decrypt(data.token);
  }

  function getRefreshToken() {
    return decrypt(data.refreshToken);
  }

  function getAdAccountId() {
    return parseAccountId(data.meta?.adAccountId);
  }

  function getBusinessManagerId() {
    return normalizeText(data.meta?.businessManagerId) || null;
  }

  async function saveConnection({
    accessToken,
    refreshToken,
    expiresAt,
    accountName,
    adAccountId,
    businessManagerId,
    pageId,
  } = {}) {
    if (!accessToken) {
      throw new Error('accessToken krävs för att spara en real Meta Ads-anslutning');
    }
    data.connected = true;
    data.status = 'connected';
    data.real = true;
    data.token = encrypt(accessToken) || null;
    data.refreshToken = encrypt(refreshToken) || null;
    data.expiresAt = expiresAt || null;
    data.meta.accountName = accountName || null;
    data.meta.adAccountId = parseAccountId(adAccountId) || null;
    data.meta.businessManagerId = normalizeText(businessManagerId) || null;
    data.meta.pageId = normalizeText(pageId) || null;
    audit('meta_ads.connected', {
      accountName: data.meta.accountName,
      adAccountId: data.meta.adAccountId,
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
    audit('meta_ads.disconnected', { reason });
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
      adAccountId: data.meta?.adAccountId || null,
      businessManagerId: data.meta?.businessManagerId || null,
      pageId: data.meta?.pageId || null,
    };
  }

  return {
    isConnected,
    isTokenExpired,
    getAccessToken,
    getRefreshToken,
    getAdAccountId,
    getBusinessManagerId,
    saveConnection,
    updateAccessToken,
    disconnect,
    getStatus,
    _data: data,
  };
}

module.exports = { createCfoMetaAdsConnectorStore };
