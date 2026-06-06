'use strict';

/**
 * Lokal PDF-läsning från CCO secure storage (Phase 1 — ingen prod asset-download).
 */
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_LOCAL_ROOT = path.join(
  os.homedir(),
  'Library',
  'Mobile Documents',
  'com~apple~CloudDocs',
  '_ARKIV-iCloud-Major-Arcana-2.0',
  'Migration-data',
  'cco-secure-storage'
);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveSecureStorageRoot(explicitRoot = '') {
  if (explicitRoot) return path.resolve(explicitRoot);
  if (process.env.ARCANA_CCO_SECURE_STORAGE_ROOT) {
    return path.resolve(process.env.ARCANA_CCO_SECURE_STORAGE_ROOT);
  }
  return DEFAULT_LOCAL_ROOT;
}

async function readLocalPdfBuffer(storageKey = '', { storageRoot = '' } = {}) {
  const key = normalizeText(storageKey);
  if (!key || key === 'pending-no-binary') {
    return { ok: false, reason: 'missing_storage_key', buffer: null };
  }
  const root = resolveSecureStorageRoot(storageRoot);
  const filePath = path.join(root, key);
  try {
    const buffer = await fs.readFile(filePath);
    if (!buffer?.length) return { ok: false, reason: 'empty_file', buffer: null, filePath };
    return { ok: true, buffer, filePath, storageRoot: root };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: false, reason: 'local_file_not_found', buffer: null, filePath };
    }
    return {
      ok: false,
      reason: 'local_read_error',
      buffer: null,
      filePath,
      error: error.message || String(error),
    };
  }
}

module.exports = {
  DEFAULT_LOCAL_ROOT,
  resolveSecureStorageRoot,
  readLocalPdfBuffer,
};
