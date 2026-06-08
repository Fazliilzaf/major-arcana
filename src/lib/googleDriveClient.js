'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const {
  getAccessToken,
  loadServiceAccountJson,
  openDriveFileReadStream,
} = require('../../scripts/migration/lib/googleDriveApi');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveServiceAccountSource(rawValue = '') {
  const value = normalizeText(rawValue);
  if (!value) return null;
  if (value.startsWith('{')) {
    return { kind: 'inline', value };
  }
  const resolved = path.resolve(value);
  if (fs.existsSync(resolved)) {
    return { kind: 'file', value: resolved };
  }
  return null;
}

function loadServiceAccountFromEnv(env = process.env) {
  const folderId = normalizeText(
    env.ARCANA_GOOGLE_DRIVE_FOLDER_ID || env.ARCANA_DRIVE_JOURNAL_FOLDER_ID
  );
  const source =
    resolveServiceAccountSource(env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON) ||
    resolveServiceAccountSource(env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!folderId || !source) {
    return { ok: false, folderId, source: null };
  }
  const serviceAccount =
    source.kind === 'inline' ? JSON.parse(source.value) : loadServiceAccountJson(source.value);
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error('Google service account JSON saknar client_email/private_key.');
  }
  return {
    ok: true,
    folderId,
    serviceAccount,
    serviceAccountEmail: serviceAccount.client_email,
  };
}

function isGoogleDriveConfigured(env = process.env) {
  try {
    return loadServiceAccountFromEnv(env).ok;
  } catch {
    return false;
  }
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getConfiguredDriveAccessToken(env = process.env) {
  const config = loadServiceAccountFromEnv(env);
  if (!config.ok) {
    throw new Error('Google Drive API saknar konfiguration på servern.');
  }
  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAt > now + 60_000) {
    return { accessToken: cachedToken, folderId: config.folderId };
  }
  cachedToken = await getAccessToken(config.serviceAccount);
  cachedTokenExpiresAt = now + 55 * 60 * 1000;
  return { accessToken: cachedToken, folderId: config.folderId };
}

async function streamDriveFileToResponse({ driveFileId, res, contentType, fileName = '' }) {
  const { accessToken } = await getConfiguredDriveAccessToken();
  const upstream = await openDriveFileReadStream({ accessToken, driveFileId });
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (fileName) {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(fileName).replace(/"/g, '')}"`
    );
  }
  await pipeline(Readable.fromWeb(upstream.body), res);
}

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const MAX_DRIVE_METADATA_RETRIES = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function driveMetadataRequest(
  url,
  { accessToken, retries = MAX_DRIVE_METADATA_RETRIES } = {}
) {
  let attempt = 0;
  while (attempt <= retries) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 429 && attempt < retries) {
      const retryAfterSec = Number(response.headers.get('Retry-After') || 0);
      const backoffMs = Math.max(retryAfterSec * 1000, 250 * 2 ** attempt);
      await sleep(backoffMs);
      attempt += 1;
      continue;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload.error?.message || `Drive API misslyckades (${response.status}).`,
        payload,
      };
    }
    return { ok: true, status: response.status, payload };
  }
  return { ok: false, status: 429, error: 'Drive rate-limit (429) efter backoff.' };
}

async function getDriveFileMetadata({
  driveFileId,
  fields = 'name',
  env = process.env,
  accessToken = '',
} = {}) {
  const id = normalizeText(driveFileId);
  if (!id) {
    return { ok: false, name: '', error: 'driveFileId saknas.', status: 400 };
  }
  try {
    const token =
      normalizeText(accessToken) || (await getConfiguredDriveAccessToken(env)).accessToken;
    const params = new URLSearchParams({
      fields: normalizeText(fields) || 'name',
      supportsAllDrives: 'true',
    });
    const url = `${DRIVE_FILES_URL}/${encodeURIComponent(id)}?${params}`;
    const result = await driveMetadataRequest(url, { accessToken });
    if (!result.ok) {
      return {
        ok: false,
        name: '',
        error: result.error,
        status: result.status,
      };
    }
    return {
      ok: true,
      name: normalizeText(result.payload?.name),
      metadata: result.payload || {},
      error: null,
      status: result.status,
    };
  } catch (error) {
    return {
      ok: false,
      name: '',
      error: error?.message || 'Drive metadata misslyckades.',
      status: 500,
    };
  }
}

async function getDriveFileName({
  driveFileId,
  env = process.env,
  delayMs = 0,
  accessToken = '',
} = {}) {
  if (Number(delayMs) > 0) {
    await sleep(Number(delayMs));
  }
  const result = await getDriveFileMetadata({
    driveFileId,
    fields: 'name',
    env,
    accessToken,
  });
  return {
    ok: result.ok,
    name: result.name || '',
    error: result.error || null,
    status: result.status,
  };
}

module.exports = {
  DRIVE_FILES_URL,
  driveMetadataRequest,
  getConfiguredDriveAccessToken,
  getDriveFileMetadata,
  getDriveFileName,
  isGoogleDriveConfigured,
  loadServiceAccountFromEnv,
  resolveServiceAccountSource,
  sleep,
  streamDriveFileToResponse,
};
