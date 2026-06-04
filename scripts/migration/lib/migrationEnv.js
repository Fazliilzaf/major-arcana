'use strict';

const fs = require('node:fs');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveMigrationPaths(options = {}) {
  const cwd = options.cwd || process.cwd();
  return {
    tenantId: normalizeText(options.tenantId) || process.env.CCO_DEFAULT_TENANT_ID || 'hair-tp-clinic',
    migrationRoot:
      normalizeText(options.migrationRoot) ||
      process.env.ARCANA_MIGRATION_ROOT ||
      path.resolve(cwd, '..'),
    indexPath:
      normalizeText(options.indexPath) ||
      process.env.ARCANA_MIGRATION_INDEX_PATH ||
      path.join(cwd, 'data', 'migration-index.json'),
    patientMasterPath:
      normalizeText(options.patientMasterPath) ||
      process.env.ARCANA_CCO_PATIENT_MASTER_STORE_PATH ||
      path.join(cwd, 'data', 'cco-patient-master.json'),
    journalPath:
      normalizeText(options.journalPath) ||
      process.env.ARCANA_CCO_JOURNAL_STORE_PATH ||
      path.join(cwd, 'data', 'cco-journal.json'),
    driveFolderId:
      normalizeText(options.folderId) ||
      process.env.ARCANA_GOOGLE_DRIVE_FOLDER_ID ||
      process.env.ARCANA_DRIVE_JOURNAL_FOLDER_ID ||
      '',
    serviceAccountPath:
      normalizeText(options.serviceAccountPath) ||
      process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      '',
    driveMirrorRoot:
      normalizeText(options.driveMirrorRoot) ||
      process.env.ARCANA_DRIVE_MIRROR_ROOT ||
      process.env.ARCANA_MIGRATION_DRIVE_ROOT ||
      '',
  };
}

function resolveDriveCredentials(paths = {}) {
  const folderId = paths.driveFolderId;
  const rawSa = paths.serviceAccountPath;
  const missing = [];
  if (!folderId) missing.push('ARCANA_GOOGLE_DRIVE_FOLDER_ID');
  if (!rawSa) missing.push('ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON');

  if (missing.length) {
    return {
      ok: false,
      missing,
      folderId,
      serviceAccountPath: rawSa,
    };
  }

  if (String(rawSa).trim().startsWith('{')) {
    return { ok: true, folderId, serviceAccountPath: rawSa, inlineJson: true };
  }

  const resolved = path.resolve(rawSa);
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      missing: [`service account file saknas: ${resolved}`],
      folderId,
      serviceAccountPath: rawSa,
    };
  }
  return { ok: true, folderId, serviceAccountPath: resolved, inlineJson: false };
}

function loadServiceAccountFromCreds(creds) {
  if (creds.inlineJson) {
    const parsed = JSON.parse(String(creds.serviceAccountPath));
    if (!parsed?.client_email || !parsed?.private_key) {
      throw new Error('Service account JSON saknar client_email eller private_key.');
    }
    return parsed;
  }
  return require('./googleDriveApi').loadServiceAccountJson(creds.serviceAccountPath);
}

module.exports = {
  normalizeText,
  loadServiceAccountFromCreds,
  resolveDriveCredentials,
  resolveMigrationPaths,
};
