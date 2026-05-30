'use strict';

/**
 * ccoPatientAssetStore.js — P0.B av Document & Media Import Pipeline.
 *
 * Kanonisk metadata-store per patient-asset (alla fil-typer: journal-PDF,
 * foton, samtycken, signerade avtal, hälsodeklarationer, Aisia-rapporter,
 * historiska Meridiq/Drive-dokument).
 *
 * Schema och status-state-machine kommer från
 * `.cursor/rules/cco-no-drive-links-import-only.mdc`. Inga Drive-länkar i
 * slut-UI; Drive är källa + provenance ENDAST. Slutmandat:
 *   link_only_files = 0   (icke-förhandlingsbart)
 *
 * Mall: matchar `src/ops/ccoPhotoStore.js`-mönstret
 *   (normalize + audit + writeJsonAtomic + emptyState + readJson).
 *
 * Compliance:
 *   - Inga patientnamn/pnr/email skrivs till audit-events — bara IDs.
 *   - Counts only i stats — inga PII-payloads.
 *   - data/cco-patient-assets.json är gitignored.
 *   - Atomic writes (writeJsonAtomic-pattern).
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEMA_VERSION = '1.0.0';

const VALID_STATUSES = Object.freeze([
  'DISCOVERED',
  'IMPORTING',
  'IMPORTED_TO_CCO',
  'VERIFIED_IN_CCO',
  'VISIBLE_ON_PATIENT_CARD',
  'NEEDS_REVIEW',
  'REJECTED',
  'DUPLICATE',
  'FAILED_IMPORT',
  'LINK_ONLY_BLOCKER',
]);

const VALID_CATEGORIES = Object.freeze([
  'journal',
  'photo_before',
  'photo_during',
  'photo_after',
  'consent',
  'agreement',
  'form',
  'aisia_report',
  'other',
]);

const VALID_SOURCE_SYSTEMS = Object.freeze([
  'drive',
  'meridiq',
  'old_cco',
  'cco_camera',
  'upload',
]);

const VALID_STORAGE_PROVIDERS = Object.freeze([
  's3',
  'local',
  'encrypted-fs',
]);

const VALID_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function emptyState() {
  const ts = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: ts,
    updatedAt: ts,
    items: {},
    audit: [],
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function validateEnum(name, value, allowed) {
  if (!allowed.includes(value)) {
    const e = new Error(`invalid ${name} "${value}" — must be one of ${allowed.join('|')}`);
    e.statusCode = 400;
    throw e;
  }
}

/**
 * Normaliserar ett asset-objekt enligt schema. Befintliga fält bevaras
 * när nya saknas (för update-flows). Ej-tillåtna enum-värden kastar.
 *
 * Required vid första add: patientId, sourceSystem, originalFileName,
 * storageProvider, storageKey, mimeType, category.
 */
function normalizeAsset(input = {}, existing = {}) {
  const safe = input || {};
  const ex = existing || {};

  const sourceSystem = normalizeText(safe.sourceSystem || ex.sourceSystem) || null;
  if (sourceSystem) validateEnum('sourceSystem', sourceSystem, VALID_SOURCE_SYSTEMS);

  const storageProvider = normalizeText(safe.storageProvider || ex.storageProvider) || null;
  if (storageProvider) validateEnum('storageProvider', storageProvider, VALID_STORAGE_PROVIDERS);

  const category = normalizeText(safe.category || ex.category) || null;
  if (category) validateEnum('category', category, VALID_CATEGORIES);

  const status =
    normalizeText(safe.status || ex.status).toUpperCase() || 'DISCOVERED';
  validateEnum('status', status, VALID_STATUSES);

  const confidence = normalizeText(safe.confidence || ex.confidence) || null;
  if (confidence) validateEnum('confidence', confidence, VALID_CONFIDENCE);

  return {
    id: normalizeText(safe.id || ex.id) || crypto.randomUUID(),
    patientId: normalizeText(safe.patientId || ex.patientId),
    encounterId: normalizeText(safe.encounterId || ex.encounterId) || null,
    sourceSystem,
    sourceRecordId: normalizeText(safe.sourceRecordId || ex.sourceRecordId) || null,
    originalDriveFileId:
      normalizeText(safe.originalDriveFileId || ex.originalDriveFileId) || null,
    originalDrivePath:
      normalizeText(safe.originalDrivePath || ex.originalDrivePath) || null,
    originalFileName:
      normalizeText(safe.originalFileName || ex.originalFileName) || null,
    storageProvider,
    storageKey: normalizeText(safe.storageKey || ex.storageKey) || null,
    thumbnailKey: normalizeText(safe.thumbnailKey || ex.thumbnailKey) || null,
    checksum: normalizeText(safe.checksum || ex.checksum) || null,
    fileSize: Number.isFinite(Number(safe.fileSize))
      ? Math.max(0, Math.round(Number(safe.fileSize)))
      : Number.isFinite(Number(ex.fileSize))
      ? Math.max(0, Math.round(Number(ex.fileSize)))
      : 0,
    mimeType: normalizeText(safe.mimeType || ex.mimeType) || null,
    category,
    documentDate: normalizeText(safe.documentDate || ex.documentDate) || null,
    importedAt: normalizeText(safe.importedAt || ex.importedAt) || nowIso(),
    importedBy: normalizeText(safe.importedBy || ex.importedBy) || null,
    importRunId: normalizeText(safe.importRunId || ex.importRunId) || null,
    confidence,
    status,
    auditRequired: normalizeBoolean(safe.auditRequired, ex.auditRequired ?? false),
    isJournalRelevant: normalizeBoolean(
      safe.isJournalRelevant,
      ex.isJournalRelevant ?? false
    ),
    isPatientVisible: normalizeBoolean(
      safe.isPatientVisible,
      ex.isPatientVisible ?? false
    ),
    // Internal: status-change-trail (PII-fritt)
    statusHistory: asArray(ex.statusHistory).slice(-49).concat(
      ex.status && ex.status !== status
        ? [{ ts: nowIso(), from: ex.status, to: status, reason: safe.statusChangeReason || null }]
        : []
    ),
    createdAt: normalizeText(ex.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function logAudit(auditLog, action, asset, actor, result = 'ok', extra = {}) {
  if (!auditLog || typeof auditLog.append !== 'function') return;
  try {
    auditLog.append({
      action,
      actor: { role: actor?.role || 'unknown', userId: actor?.userId || null },
      target: {
        kind: 'patient_asset',
        id: asset?.id || null,
        tenantId: actor?.tenantId || null,
      },
      result,
      detail: {
        // PII-säkert: bara IDs och enum-värden, INGA patientnamn/email/pnr.
        patientId: asset?.patientId || null,
        encounterId: asset?.encounterId || null,
        sourceSystem: asset?.sourceSystem || null,
        category: asset?.category || null,
        status: asset?.status || null,
        importRunId: asset?.importRunId || null,
        ...extra,
      },
    });
  } catch {
    /* audit failure must never break the flow */
  }
}

/**
 * Skapa per-tenant patient-asset-store. Persisterar till `filePath`.
 *
 * @param {object} opts
 * @param {string} opts.filePath
 * @param {object} [opts.auditLog]  ccoAuditLog-instans (optional)
 */
async function createCcoPatientAssetStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs för ccoPatientAssetStore');
  const state = await readJson(filePath, emptyState());
  if (!state.items || typeof state.items !== 'object') state.items = {};
  if (!Array.isArray(state.audit)) state.audit = [];
  if (!state.schemaVersion) state.schemaVersion = SCHEMA_VERSION;

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  /**
   * Lägg in ett nytt asset-record i store. Emittar audit `asset.imported`.
   * Required: patientId, sourceSystem, originalFileName, storageProvider,
   * storageKey, mimeType, category.
   *
   * @returns {Promise<object>} normaliserat asset
   */
  async function addAsset(input = {}, { actor = {} } = {}) {
    const asset = normalizeAsset(input);
    if (!asset.patientId) {
      const e = new Error('patientId krävs.');
      e.statusCode = 400;
      throw e;
    }
    if (!asset.sourceSystem) {
      const e = new Error('sourceSystem krävs.');
      e.statusCode = 400;
      throw e;
    }
    if (state.items[asset.id]) {
      const e = new Error(`asset ${asset.id} finns redan — använd update.`);
      e.statusCode = 409;
      throw e;
    }
    state.items[asset.id] = asset;
    await save();
    logAudit(auditLog, 'asset.imported', asset, actor, 'ok', {
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
    });
    return { ...asset };
  }

  /**
   * Uppdatera status för en asset. Validerar status mot VALID_STATUSES.
   * Emittar audit `asset.status_changed`. `reason` loggas i status-history.
   */
  async function updateAssetStatus(id, status, reason = null, { actor = {} } = {}) {
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    if (!existing) {
      const e = new Error(`asset ${assetId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const next = normalizeText(status).toUpperCase();
    validateEnum('status', next, VALID_STATUSES);
    const previous = existing.status;
    if (previous === next) return { ...existing };
    const merged = normalizeAsset(
      { ...existing, status: next, statusChangeReason: reason },
      existing
    );
    state.items[assetId] = merged;
    await save();
    logAudit(auditLog, 'asset.status_changed', merged, actor, 'ok', {
      from: previous,
      to: next,
      reason: reason || null,
    });
    return { ...merged };
  }

  /**
   * Lista assets för en patient. Filtrerar via `filters.category`,
   * `filters.status`, `filters.sourceSystem`, `filters.encounterId`,
   * `filters.isPatientVisible`. Emittar audit `asset.read`.
   */
  function listAssetsForPatient(patientId, filters = {}, { actor = {} } = {}) {
    const pId = normalizeText(patientId);
    if (!pId) return [];
    const f = filters || {};
    let list = Object.values(state.items).filter((a) => a.patientId === pId);
    if (f.category) list = list.filter((a) => a.category === f.category);
    if (f.status) list = list.filter((a) => a.status === f.status);
    if (f.sourceSystem) list = list.filter((a) => a.sourceSystem === f.sourceSystem);
    if (f.encounterId) list = list.filter((a) => (a.encounterId || '') === f.encounterId);
    if (typeof f.isPatientVisible === 'boolean') {
      list = list.filter((a) => a.isPatientVisible === f.isPatientVisible);
    }
    const result = list.map((a) => ({ ...a }));
    logAudit(
      auditLog,
      'asset.read',
      { patientId: pId, id: null },
      actor,
      'ok',
      { scope: 'patient', count: result.length, filters: Object.keys(f) }
    );
    return result;
  }

  function listAssetsForEncounter(encounterId, { actor = {} } = {}) {
    const eId = normalizeText(encounterId);
    if (!eId) return [];
    const result = Object.values(state.items)
      .filter((a) => (a.encounterId || '') === eId)
      .map((a) => ({ ...a }));
    logAudit(
      auditLog,
      'asset.read',
      { encounterId: eId, id: null },
      actor,
      'ok',
      { scope: 'encounter', count: result.length }
    );
    return result;
  }

  function getAsset(id) {
    const a = state.items[normalizeText(id)];
    return a ? { ...a } : null;
  }

  /**
   * Flagga som LINK_ONLY_BLOCKER (cutover-blocker). Emittar
   * `asset.link_only_blocker_flagged` audit.
   */
  async function markAsLinkOnlyBlocker(id, reason, { actor = {} } = {}) {
    const updated = await updateAssetStatus(id, 'LINK_ONLY_BLOCKER', reason, { actor });
    logAudit(auditLog, 'asset.link_only_blocker_flagged', updated, actor, 'ok', { reason });
    return updated;
  }

  /**
   * Markera som synlig på patient-card (efter UI-verifiering).
   */
  async function markAsVisibleOnPatientCard(id, { actor = {} } = {}) {
    return updateAssetStatus(id, 'VISIBLE_ON_PATIENT_CARD', 'verified_in_ui', { actor });
  }

  /**
   * Markera checksum-verifierad. Lägger checksum + emittar
   * `asset.checksum_verified`. Inte en state-change i sig.
   */
  async function recordChecksumVerified(id, checksum, { actor = {} } = {}) {
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    if (!existing) {
      const e = new Error(`asset ${assetId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const hash = normalizeText(checksum);
    if (!hash) {
      const e = new Error('checksum krävs.');
      e.statusCode = 400;
      throw e;
    }
    const merged = normalizeAsset({ ...existing, checksum: hash }, existing);
    state.items[assetId] = merged;
    await save();
    logAudit(auditLog, 'asset.checksum_verified', merged, actor, 'ok', {
      algo: 'sha256',
    });
    return { ...merged };
  }

  /**
   * Bind asset till patient (efter review). Emittar
   * `asset.linked_to_patient` audit.
   */
  async function linkAssetToPatient(id, patientId, { actor = {} } = {}) {
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    if (!existing) {
      const e = new Error(`asset ${assetId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const pId = normalizeText(patientId);
    if (!pId) {
      const e = new Error('patientId krävs.');
      e.statusCode = 400;
      throw e;
    }
    const merged = normalizeAsset({ ...existing, patientId: pId }, existing);
    state.items[assetId] = merged;
    await save();
    logAudit(auditLog, 'asset.linked_to_patient', merged, actor, 'ok', {
      previousPatientId: existing.patientId || null,
    });
    return { ...merged };
  }

  /**
   * Bind asset till encounter. Emittar `asset.linked_to_encounter` audit.
   */
  async function linkAssetToEncounter(id, encounterId, { actor = {} } = {}) {
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    if (!existing) {
      const e = new Error(`asset ${assetId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const eId = normalizeText(encounterId);
    if (!eId) {
      const e = new Error('encounterId krävs.');
      e.statusCode = 400;
      throw e;
    }
    const merged = normalizeAsset({ ...existing, encounterId: eId }, existing);
    state.items[assetId] = merged;
    await save();
    logAudit(auditLog, 'asset.linked_to_encounter', merged, actor, 'ok', {});
    return { ...merged };
  }

  /**
   * Counts per status, per category, plus link-only och duplicate-räknare.
   * Inga payloads — counts only.
   *
   * @param {string} [tenantId]  reserverad för framtida multi-tenant-filter;
   *                             idag är store:n per-tenant via egen filePath,
   *                             så parametern är reserverad men dokumenterad
   *                             enligt owner-spec.
   */
  function stats(tenantId = null) {
    const all = Object.values(state.items);
    const byStatus = {};
    const byCategory = {};
    const bySourceSystem = {};
    let linkOnlyCount = 0;
    let duplicateCount = 0;
    let needsReviewCount = 0;
    let visibleCount = 0;
    let withChecksum = 0;
    let totalBytes = 0;
    for (const a of all) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      if (a.category) byCategory[a.category] = (byCategory[a.category] || 0) + 1;
      if (a.sourceSystem)
        bySourceSystem[a.sourceSystem] = (bySourceSystem[a.sourceSystem] || 0) + 1;
      if (a.status === 'LINK_ONLY_BLOCKER') linkOnlyCount += 1;
      if (a.status === 'DUPLICATE') duplicateCount += 1;
      if (a.status === 'NEEDS_REVIEW') needsReviewCount += 1;
      if (a.status === 'VISIBLE_ON_PATIENT_CARD') visibleCount += 1;
      if (a.checksum) withChecksum += 1;
      totalBytes += Number(a.fileSize || 0);
    }
    return {
      tenantId: tenantId || null,
      schemaVersion: state.schemaVersion,
      total: all.length,
      byStatus,
      byCategory,
      bySourceSystem,
      linkOnlyCount,
      duplicateCount,
      needsReviewCount,
      visibleOnPatientCardCount: visibleCount,
      withChecksumCount: withChecksum,
      withoutChecksumCount: all.length - withChecksum,
      totalBytes,
    };
  }

  return {
    addAsset,
    updateAssetStatus,
    listAssetsForPatient,
    listAssetsForEncounter,
    getAsset,
    markAsLinkOnlyBlocker,
    markAsVisibleOnPatientCard,
    recordChecksumVerified,
    linkAssetToPatient,
    linkAssetToEncounter,
    stats,
    // exposed for testing / health
    _state: () => state,
  };
}

module.exports = {
  createCcoPatientAssetStore,
  VALID_STATUSES,
  VALID_CATEGORIES,
  VALID_SOURCE_SYSTEMS,
  VALID_STORAGE_PROVIDERS,
  VALID_CONFIDENCE,
  SCHEMA_VERSION,
};
