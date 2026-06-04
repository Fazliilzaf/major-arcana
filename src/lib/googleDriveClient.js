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
  const folderId = normalizeText(env.ARCANA_GOOGLE_DRIVE_FOLDER_ID || env.ARCANA_DRIVE_JOURNAL_FOLDER_ID);
  const source =
    resolveServiceAccountSource(env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON) ||
    resolveServiceAccountSource(env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!folderId || !source) {
    return { ok: false, folderId, source: null };
  }
  const serviceAccount =
    source.kind === 'inline'
      ? JSON.parse(source.value)
      : loadServiceAccountJson(source.value);
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

module.exports = {
  getConfiguredDriveAccessToken,
  isGoogleDriveConfigured,
  loadServiceAccountFromEnv,
  resolveServiceAccountSource,
  streamDriveFileToResponse,
};
