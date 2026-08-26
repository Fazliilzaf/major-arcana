'use strict';

/**
 * Microsoft Graph SharePoint/e-recept connector.
 *
 * Delar samma auth/client-mönster som mail-connectors
 * (microsoftGraphSendConnector / microsoftGraphReadConnector): client_credentials
 * mot login.microsoftonline.com + applicerade API-anrop mot graph.microsoft.com.
 *
 * Syftet är Ordination (recept) → SharePoint, så att ett godkänt recept kan
 * laddas upp i en dokumentbibliotekmapp och hämtas tillbaka (e-recept).
 *
 * FAIL-SOFT: alla operationella metoder kontrollerar `isConfigured()` först och
 * returnerar `{ ok:false, reason:'not_configured' }` om credentials/site saknas
 * — de kastar ALDRIG för saknad config (det gör de bara när config finns och
 * själva Graph-anropet slår fel). En "lyckad" call falskas aldrig.
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseRetryAfterSeconds(response) {
  const raw =
    normalizeText(response?.headers?.get?.('retry-after')) ||
    normalizeText(response?.headers?.get?.('x-ms-retry-after-ms'));
  if (!raw) return null;
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  if (String(raw).includes('.') || asNumber > 1000) return Math.round(asNumber / 1000);
  return Math.round(asNumber);
}

function parseGraphError(payload = {}, fallback = 'request_failed') {
  const graphError = payload && typeof payload.error === 'object' ? payload.error : {};
  return (
    normalizeText(graphError.message) ||
    normalizeText(payload?.error_description) ||
    normalizeText(payload?.message) ||
    fallback
  );
}

function createGraphError(
  message,
  { code = '', status = 0, retryAfterSeconds = null, details = null } = {}
) {
  const error = new Error(normalizeText(message) || 'graph_request_failed');
  if (code) error.code = code;
  if (Number.isFinite(Number(status)) && Number(status) > 0) error.status = Number(status);
  if (Number.isFinite(Number(retryAfterSeconds)) && Number(retryAfterSeconds) >= 0) {
    error.retryAfterSeconds = Number(retryAfterSeconds);
  }
  if (details && typeof details === 'object') error.details = details;
  return error;
}

function decodeJwtPayload(token = '') {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return {};
  try {
    const encoded = parts[1];
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
  } catch (_error) {
    return {};
  }
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 8000) {
  const safeTimeoutMs = clampInteger(timeoutMs, 500, 120000, 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), safeTimeoutMs);
  if (typeof timer?.unref === 'function') timer.unref();

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createGraphError(`Request timeout after ${safeTimeoutMs}ms`, {
        code: 'GRAPH_TIMEOUT',
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse(response, label = 'request') {
  let payload = {};
  try {
    payload = (await response.json()) || {};
  } catch (_error) {
    payload = {};
  }
  if (response?.ok) return payload;
  const status = Number(response?.status || 0);
  const message = parseGraphError(payload, 'graph_request_failed');
  throw createGraphError(`${label} failed (${status || 'n/a'}): ${message}`, {
    code: 'GRAPH_REQUEST_FAILED',
    status,
    details: payload,
  });
}

/** Encoderar varje sökvägssegment men behåller "/" som separator. */
function encodePathSegments(relPath = '') {
  return String(relPath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .filter(Boolean)
    .join('/');
}

function normalizeUploadContent(content) {
  if (Buffer.isBuffer(content)) return content;
  if (content && typeof content === 'object' && content.buffer) {
    return Buffer.from(content.buffer);
  }
  if (typeof content === 'string') return Buffer.from(content, 'utf8');
  return null;
}

function createMicrosoftGraphSharePointRecept(config = {}) {
  const fetchImpl = typeof config.fetchImpl === 'function' ? config.fetchImpl : global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('MicrosoftGraphSharePointRecept requires fetch implementation.');
  }

  const authorityHost = trimTrailingSlash(
    normalizeText(config.authorityHost) || 'https://login.microsoftonline.com'
  );
  const graphBaseUrl = trimTrailingSlash(
    normalizeText(config.graphBaseUrl) || 'https://graph.microsoft.com/v1.0'
  );
  const scope = normalizeText(config.scope) || 'https://graph.microsoft.com/.default';
  const tokenTimeoutMs = clampInteger(config.tokenTimeoutMs, 1000, 30000, 5000);
  const requestTimeoutMs = clampInteger(config.requestTimeoutMs, 1000, 60000, 12000);

  const tenantId = normalizeText(config.tenantId);
  const clientId = normalizeText(config.clientId);
  const clientSecret = normalizeText(config.clientSecret);
  const siteId = normalizeText(config.siteId);
  const siteUrl = normalizeText(config.siteUrl);
  const driveId = normalizeText(config.driveId);
  const defaultFolderPath = encodePathSegments(normalizeText(config.folderPath) || 'recept');

  /** Du behöver tenant+app-creds och minst en site-identitet för att vara "konfigurerad". */
  function isConfigured() {
    const hasApp = Boolean(tenantId && clientId && clientSecret);
    const hasSite = Boolean(siteId || siteUrl);
    return hasApp && hasSite;
  }

  function notConfiguredResult() {
    return {
      ok: false,
      reason: 'not_configured',
      provider: 'sharepoint_e_recept',
    };
  }

  // In-memory token-cache: client_credentials-token återanvänds tills det är
  // nära utgång (60 s marginal) — annars ett token-anrop per operation.
  let cachedToken = null;
  let cachedTokenExpiresAt = 0;
  const TOKEN_CACHE_MARGIN_MS = 60_000;

  async function fetchAccessToken() {
    if (!tenantId || !clientId || !clientSecret) {
      throw createGraphError(
        'MicrosoftGraphSharePointRecept requires tenantId/clientId/clientSecret.',
        {
          code: 'GRAPH_NOT_CONFIGURED',
        }
      );
    }
    if (cachedToken && Date.now() < cachedTokenExpiresAt - TOKEN_CACHE_MARGIN_MS) {
      return cachedToken;
    }
    const tokenUrl = `${authorityHost}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      grant_type: 'client_credentials',
    });
    const response = await fetchWithTimeout(
      fetchImpl,
      tokenUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
      tokenTimeoutMs
    );
    const payload = await parseJsonResponse(response, 'Microsoft Graph token request');
    const accessToken = normalizeText(payload.access_token);
    if (!accessToken) {
      throw createGraphError(
        'Microsoft Graph token request succeeded but access_token is missing.',
        { code: 'GRAPH_TOKEN_MISSING' }
      );
    }
    const expiresIn = Number(payload.expires_in);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      cachedToken = accessToken;
      cachedTokenExpiresAt = Date.now() + expiresIn * 1000;
    }
    return accessToken;
  }

  async function getAccessToken() {
    return fetchAccessToken();
  }

  function resolveSiteIdFromUrl(fullSiteUrl) {
    const normalized = trimTrailingSlash(normalizeText(fullSiteUrl));
    if (!normalized) return null;
    const parsed = new URL(normalized);
    const host = parsed.host;
    const path = parsed.pathname || '';
    if (!host) return null;
    return `${host}:/${path}`;
  }

  /**
   * Resolverar resurs-identiteten för site:en. Föredrar explicit siteId,
   * annars construerar vi en "site:host:/path" från siteUrl.
   */
  function siteResource() {
    if (siteId) return `sites/${encodeURIComponent(siteId)}`;
    const fromUrl = resolveSiteIdFromUrl(siteUrl);
    if (!fromUrl) return null;
    return `sites/${fromUrl}`;
  }

  function driveResourcePrefix(driveIdValue = driveId) {
    if (driveIdValue) return `drives/${encodeURIComponent(driveIdValue)}/root`;
    const siteRes = siteResource();
    if (!siteRes) return null;
    return `${siteRes}/drive/root`;
  }

  function buildItemUri({
    folderPath = defaultFolderPath,
    fileName = '',
    driveIdValue = null,
  } = {}) {
    const root = driveResourcePrefix(driveIdValue);
    if (!root) return null;
    const folder = encodePathSegments(folderPath);
    const name = encodePathSegments(fileName);
    const pathParts = [folder, name].filter(Boolean);
    const path = pathParts.length ? `:/${pathParts.join('/')}` : '';
    return `${graphBaseUrl}/${root}${path}`;
  }

  async function fetchJson(
    fetchImplInner,
    url,
    {
      method = 'GET',
      headers = {},
      body = null,
      timeoutMs = requestTimeoutMs,
      label = 'request',
    } = {}
  ) {
    const response = await fetchWithTimeout(
      fetchImplInner,
      url,
      {
        method,
        headers,
        body,
      },
      timeoutMs
    );

    if (Number(response?.status || 0) === 429) {
      throw createGraphError(`${label} failed (429): rate_limit_hit`, {
        code: 'GRAPH_RATE_LIMITED',
        status: 429,
        retryAfterSeconds: parseRetryAfterSeconds(response),
      });
    }

    if (!response?.ok) {
      await parseJsonResponse(response, label);
    }
    return response;
  }

  /**
   * Kontrollerar/validerar att appen kan nå site:en och returnerar ett lätt
   * site-objekt (används för "är SharePoint e-recept tillgängligt"-hälsa).
   */
  async function getSharePointSite({ timeoutMs = requestTimeoutMs } = {}) {
    if (!isConfigured()) return notConfiguredResult();
    const siteRes = siteResource();
    if (!siteRes) return notConfiguredResult();
    const accessToken = await fetchAccessToken();
    const response = await fetchJson(fetchImpl, `${graphBaseUrl}/${siteRes}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      label: 'Microsoft Graph getSharePointSite',
      timeoutMs,
    });
    const payload = await parseJsonResponse(response, 'Microsoft Graph getSharePointSite');
    return {
      ok: true,
      provider: 'sharepoint_e_recept',
      siteId: normalizeText(payload?.id) || siteId,
      displayName: normalizeText(payload?.displayName) || null,
      webUrl: normalizeText(payload?.webUrl) || null,
    };
  }

  /**
   * Hämtar dokumentbiblioteket (drive) för site:en. Default drive om driveId
   * inte anges. Returnerar drive-objektet.
   */
  async function getSiteDrive({ timeoutMs = requestTimeoutMs } = {}) {
    if (!isConfigured()) return notConfiguredResult();
    const accessToken = await fetchAccessToken();
    // Explicit driveId slår site-default-drive.
    const driveUrl = driveId
      ? `${graphBaseUrl}/drives/${encodeURIComponent(driveId)}`
      : `${graphBaseUrl}/${siteResource()}/drive`;
    const response = await fetchJson(fetchImpl, driveUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
      label: 'Microsoft Graph getSiteDrive',
      timeoutMs,
    });
    const payload = await parseJsonResponse(response, 'Microsoft Graph getSiteDrive');
    return {
      ok: true,
      provider: 'sharepoint_e_recept',
      driveId: normalizeText(payload?.id) || driveId || null,
      driveType: normalizeText(payload?.driveType) || null,
      name: normalizeText(payload?.name) || null,
      webUrl: normalizeText(payload?.webUrl) || null,
      quota: payload?.quota
        ? {
            total: payload.quota.total,
            used: payload.quota.used,
            remaining: payload.quota.remaining,
          }
        : null,
    };
  }

  /**
   * Hittar (eller skapar) receptmappen i biblioteket.
   * (a) hitta/uppdatera en SharePoint-dokumentbiblioteksmapp för recept.
   */
  async function ensureReceptFolder({
    folderPath = defaultFolderPath,
    timeoutMs = requestTimeoutMs,
  } = {}) {
    if (!isConfigured()) return notConfiguredResult();
    const accessToken = await fetchAccessToken();
    const folder = encodePathSegments(folderPath);
    if (!folder) return { ok: false, reason: 'folder_required', provider: 'sharepoint_e_recept' };

    const rootPrefix = driveResourcePrefix();
    if (!rootPrefix) return notConfiguredResult();
    const itemUrl = `${graphBaseUrl}/${rootPrefix}:/${folder}`;

    const getResponse = await fetchWithTimeout(
      fetchImpl,
      itemUrl,
      { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } },
      timeoutMs
    );

    // Mappen finns redan.
    if (getResponse?.ok) {
      const existing = await parseJsonResponse(getResponse, 'Microsoft Graph getReceptFolder');
      return {
        ok: true,
        provider: 'sharepoint_e_recept',
        folderPath: folder,
        folderId: normalizeText(existing?.id) || null,
        name: normalizeText(existing?.name) || folder,
        created: false,
        webUrl: normalizeText(existing?.webUrl) || null,
      };
    }
    if (getResponse?.status !== 404) {
      await parseJsonResponse(getResponse, 'Microsoft Graph getReceptFolder');
    }

    // Mappen saknas → skapa den. Föräldra-sökvägen är folder minus sista segmentet.
    const segments = folder.split('/');
    const name = segments.pop();
    const parentRel = segments.join('/');
    const childrenUrl = `${graphBaseUrl}/${rootPrefix}:${parentRel ? `/${parentRel}` : ''}/children`;

    const createResponse = await fetchJson(fetchImpl, childrenUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace',
      }),
      label: 'Microsoft Graph createReceptFolder',
      timeoutMs,
    });
    const created = await parseJsonResponse(
      createResponse,
      'Microsoft Graph createReceptFolder response'
    );
    return {
      ok: true,
      provider: 'sharepoint_e_recept',
      folderPath: folder,
      folderId: normalizeText(created?.id) || null,
      name: normalizeText(created?.name) || name,
      created: true,
      webUrl: normalizeText(created?.webUrl) || null,
    };
  }

  /**
   * Laddar upp en recept-PDF (eller annat dokument). PUT till .../content med
   * content-type. Returnerar driveItem-metadatan.
   */
  async function uploadReceptDocument({
    fileName,
    content,
    mimeType = 'application/pdf',
    folderPath = defaultFolderPath,
    driveId: driveIdOverride = '',
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const normalizedFileName = normalizeText(fileName);
    if (!normalizedFileName)
      return { ok: false, reason: 'file_name_required', provider: 'sharepoint_e_recept' };

    const buffer = normalizeUploadContent(content);
    if (!buffer) return { ok: false, reason: 'content_required', provider: 'sharepoint_e_recept' };
    if (!isConfigured()) return notConfiguredResult();

    const accessToken = await fetchAccessToken();
    const itemUri = buildItemUri({
      folderPath,
      fileName: normalizedFileName,
      driveIdValue: normalizeText(driveIdOverride) || null,
    });
    if (!itemUri) return notConfiguredResult();
    const uploadUrl = `${itemUri}:/content`;

    // PUT på .../content returnerar driveItem-metadata som JSON.
    const response = await fetchJson(fetchImpl, uploadUrl, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': normalizeText(mimeType) || 'application/pdf',
      },
      body: buffer,
      label: 'Microsoft Graph uploadReceptDocument',
      timeoutMs,
    });
    // 201 Created med JSON-metadata.
    const payload = await parseJsonResponse(
      response,
      'Microsoft Graph uploadReceptDocument response'
    );
    return {
      ok: true,
      provider: 'sharepoint_e_recept',
      itemId: normalizeText(payload?.id) || null,
      fileName: normalizeText(payload?.name) || normalizedFileName,
      mimeType: normalizeText(payload?.file?.mimeType) || normalizeText(mimeType) || null,
      size: Number(payload?.size) || buffer.length || null,
      webUrl: normalizeText(payload?.webUrl) || null,
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Hämtar metadata för en recept-dokument utan att ladda ner innehållet.
   */
  async function getReceptDocumentMetadata({
    fileName,
    folderPath = defaultFolderPath,
    driveId: driveIdOverride = '',
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const normalizedFileName = normalizeText(fileName);
    if (!normalizedFileName)
      return { ok: false, reason: 'file_name_required', provider: 'sharepoint_e_recept' };
    if (!isConfigured()) return notConfiguredResult();

    const accessToken = await fetchAccessToken();
    const itemUri = buildItemUri({
      folderPath,
      fileName: normalizedFileName,
      driveIdValue: normalizeText(driveIdOverride) || null,
    });
    if (!itemUri) return notConfiguredResult();

    const response = await fetchJson(fetchImpl, itemUri, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
      label: 'Microsoft Graph getReceptDocumentMetadata',
      timeoutMs,
    });
    const payload = await parseJsonResponse(response, 'Microsoft Graph getReceptDocumentMetadata');
    return {
      ok: true,
      provider: 'sharepoint_e_recept',
      itemId: normalizeText(payload?.id) || null,
      fileName: normalizeText(payload?.name) || normalizedFileName,
      mimeType: normalizeText(payload?.file?.mimeType) || null,
      size: Number(payload?.size) || null,
      webUrl: normalizeText(payload?.webUrl) || null,
      lastModifiedDateTime: normalizeText(payload?.lastModifiedDateTime) || null,
      createdDateTime: normalizeText(payload?.createdDateTime) || null,
    };
  }

  /**
   * Laddar ner en recept-PDF som Buffer.
   */
  async function fetchReceptDocument({
    fileName,
    folderPath = defaultFolderPath,
    driveId: driveIdOverride = '',
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const normalizedFileName = normalizeText(fileName);
    if (!normalizedFileName)
      return { ok: false, reason: 'file_name_required', provider: 'sharepoint_e_recept' };
    if (!isConfigured()) return notConfiguredResult();

    const accessToken = await fetchAccessToken();
    const itemUri = buildItemUri({
      folderPath,
      fileName: normalizedFileName,
      driveIdValue: normalizeText(driveIdOverride) || null,
    });
    if (!itemUri) return notConfiguredResult();
    const contentUrl = `${itemUri}:/content`;

    const response = await fetchWithTimeout(
      fetchImpl,
      contentUrl,
      { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } },
      timeoutMs
    );
    if (!response?.ok) {
      await parseJsonResponse(response, 'Microsoft Graph fetchReceptDocument');
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      ok: true,
      provider: 'sharepoint_e_recept',
      fileName: normalizedFileName,
      mimeType: normalizeText(response?.headers?.get?.('content-type')) || 'application/pdf',
      content: buffer,
      size: buffer.length,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Listar recept-dokumenten i en mapp.
   */
  async function listReceptDocuments({
    folderPath = defaultFolderPath,
    driveId: driveIdOverride = '',
    top = 50,
    timeoutMs = requestTimeoutMs,
  } = {}) {
    if (!isConfigured()) return notConfiguredResult();
    const accessToken = await fetchAccessToken();
    const folder = encodePathSegments(folderPath);
    const rootPrefix = driveResourcePrefix(normalizeText(driveIdOverride) || null);
    if (!rootPrefix) return notConfiguredResult();
    const url = `${graphBaseUrl}/${rootPrefix}:${folder ? `/${folder}` : ''}/children?$top=${encodeURIComponent(String(top))}`;

    const response = await fetchJson(fetchImpl, url, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
      label: 'Microsoft Graph listReceptDocuments',
      timeoutMs,
    });
    const payload = await parseJsonResponse(response, 'Microsoft Graph listReceptDocuments');
    const items = (Array.isArray(payload?.value) ? payload.value : []).map((item) => ({
      itemId: normalizeText(item?.id) || null,
      fileName: normalizeText(item?.name) || null,
      mimeType: normalizeText(item?.file?.mimeType) || null,
      size: Number(item?.size) || null,
      webUrl: normalizeText(item?.webUrl) || null,
      lastModifiedDateTime: normalizeText(item?.lastModifiedDateTime) || null,
    }));
    return {
      ok: true,
      provider: 'sharepoint_e_recept',
      folderPath: folder,
      count: items.length,
      items,
    };
  }

  async function inspectPermissions({ timeoutMs = tokenTimeoutMs } = {}) {
    if (!isConfigured()) return notConfiguredResult();
    const accessToken = await fetchAccessToken(timeoutMs);
    const claims = decodeJwtPayload(accessToken);
    const roles = Array.isArray(claims.roles)
      ? claims.roles.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const scopes = normalizeText(claims.scp)
      .split(/\s+/)
      .map((item) => normalizeText(item))
      .filter(Boolean);
    return {
      ok: true,
      provider: 'sharepoint_e_recept',
      aud: normalizeText(claims.aud) || null,
      appId: normalizeText(claims.appid) || null,
      idType: normalizeText(claims.idtyp) || null,
      roles,
      scopes,
      hasSitesReadWriteAll:
        roles.includes('Sites.ReadWrite.All') || scopes.includes('Sites.ReadWrite.All'),
    };
  }

  return {
    isConfigured,
    getAccessToken,
    getSharePointSite,
    getSiteDrive,
    ensureReceptFolder,
    uploadReceptDocument,
    getReceptDocumentMetadata,
    fetchReceptDocument,
    listReceptDocuments,
    inspectPermissions,
  };
}

module.exports = {
  createMicrosoftGraphSharePointRecept,
  encodePathSegments,
  normalizeUploadContent,
};
