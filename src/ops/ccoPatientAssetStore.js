'use strict';

/**
 * ccoPatientAssetStore.js — P0.B av Document & Media Import Pipeline.
 *
 * Kanonisk metadata-store per patient-asset (alla fil-typer: journal-PDF,
 * foton, samtycken, signerade avtal, hälsodeklarationer, Aisia-rapporter,
 * historiska Meridiq/Drive-dokument).
 *
 * Schema och status-state-machine kommer från
 * `.cursor/rules/cco-no-drive-links-import-only.mdc` och
 * `docs/schema/cco-patient-assets.schema.md`. Inga Drive-länkar i
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
 *   - Hard-delete-guard för kliniskt verifierat material.
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

/**
 * Tillåtna state-machine-övergångar. Owner-spec — endast dessa
 * övergångar accepteras av `transitionStatus()`.
 *
 * Se docs/schema/cco-patient-assets.schema.md §2.
 */
const STATUS_TRANSITIONS = Object.freeze({
  DISCOVERED: Object.freeze([
    'IMPORTING',
    'NEEDS_REVIEW',
    'DUPLICATE',
    'FAILED_IMPORT',
    'LINK_ONLY_BLOCKER',
  ]),
  IMPORTING: Object.freeze(['IMPORTED_TO_CCO', 'FAILED_IMPORT']),
  IMPORTED_TO_CCO: Object.freeze(['VERIFIED_IN_CCO', 'FAILED_IMPORT']),
  VERIFIED_IN_CCO: Object.freeze(['VISIBLE_ON_PATIENT_CARD', 'NEEDS_REVIEW']),
  VISIBLE_ON_PATIENT_CARD: Object.freeze(['NEEDS_REVIEW', 'REJECTED']),
  NEEDS_REVIEW: Object.freeze(['VERIFIED_IN_CCO', 'REJECTED']),
  DUPLICATE: Object.freeze(['REJECTED']),
  REJECTED: Object.freeze([]), // terminal
  FAILED_IMPORT: Object.freeze(['DISCOVERED', 'IMPORTING']), // retry
  LINK_ONLY_BLOCKER: Object.freeze(['DISCOVERED', 'IMPORTING']), // unblock by import
});

const SOFT_DELETE_TARGETS = Object.freeze(['REJECTED', 'DUPLICATE', 'NEEDS_REVIEW']);

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
    statusHistory: asArray(ex.statusHistory).slice(-49).concat(
      ex.status && ex.status !== status
        ? [{ ts: nowIso(), from: ex.status, to: status, reason: safe.statusChangeReason || null }]
        : []
    ),
    createdAt: normalizeText(ex.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

/**
 * OWNER-SKÄRPNING P0.B++++ — PII-mask för audit-payload.
 *
 * Hard-delete-audit får ALDRIG innehålla rå PII i form av:
 *   - originalFileName (kan innehålla pnr, fullt patient-namn, etc.)
 *   - originalDrivePath (mapp-namn kan vara patient-namn / pnr)
 *
 * Vi bevarar dock STRUKTUREN så att forensik kan rekonstruera djup
 * och file-name-fingerprint utan att exponera rå PII.
 *
 *   - originalFileName     -> originalFileName_hash       (sha256:16-tecken)
 *   - originalDrivePath    -> originalDrivePath_structure (seg-<hash16>/seg-<hash16>/...)
 *                          -> originalDrivePath_depth     (heltal, antal segment)
 *   - originalDriveFileId  bevaras (opaque Drive-ID, ingen PII)
 *
 * Alla övriga fält bevaras oförändrade. Returnerar en NY plain object —
 * muterar inte input.
 */
function maskPiiInAuditPayload(asset = {}) {
  const masked = { ...asset };
  if (masked.originalFileName) {
    masked.originalFileName_hash =
      'sha256:' +
      crypto
        .createHash('sha256')
        .update(String(masked.originalFileName))
        .digest('hex')
        .slice(0, 16);
    delete masked.originalFileName;
  }
  if (masked.originalDrivePath) {
    const segments = String(masked.originalDrivePath)
      .split('/')
      .filter(Boolean);
    masked.originalDrivePath_structure = segments
      .map(
        (s) =>
          'seg-' +
          crypto.createHash('sha256').update(s).digest('hex').slice(0, 8)
      )
      .join('/');
    masked.originalDrivePath_depth = segments.length;
    delete masked.originalDrivePath;
  }
  // originalDriveFileId behålls — Drive-API:s opaque file-ID utan PII.
  return masked;
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
   * Guarded state-machine-transition. Verifierar att (currentStatus -> newStatus)
   * finns i STATUS_TRANSITIONS — annars kastas 409. Emittar
   * `asset.status_changed` audit. Atomic write.
   *
   * Detta är den kanoniska vägen att ändra status. `updateAssetStatus()` finns
   * kvar som bakåtkompatibelt alias men delegerar hit.
   */
  async function transitionStatus(assetId, newStatus, { actor = {}, reason = null } = {}) {
    const id = normalizeText(assetId);
    const existing = state.items[id];
    if (!existing) {
      const e = new Error(`asset ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const next = normalizeText(newStatus).toUpperCase();
    validateEnum('status', next, VALID_STATUSES);
    const current = existing.status;
    if (current === next) {
      // No-op — return current
      return { ...existing };
    }
    const allowed = STATUS_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      const e = new Error(
        `forbidden transition ${current} -> ${next} for asset ${id}. ` +
          `Allowed from ${current}: [${allowed.join(', ') || '(terminal)'}].`
      );
      e.statusCode = 409;
      throw e;
    }
    const merged = normalizeAsset(
      { ...existing, status: next, statusChangeReason: reason },
      existing
    );
    state.items[id] = merged;
    await save();
    logAudit(auditLog, 'asset.status_changed', merged, actor, 'ok', {
      from: current,
      to: next,
      reason: reason || null,
    });
    return { ...merged };
  }

  /**
   * Bakåtkompatibel wrapper. Delegerar till `transitionStatus`.
   */
  async function updateAssetStatus(id, status, reason = null, { actor = {} } = {}) {
    return transitionStatus(id, status, { actor, reason });
  }

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

  async function markAsLinkOnlyBlocker(id, reason, { actor = {} } = {}) {
    const updated = await transitionStatus(id, 'LINK_ONLY_BLOCKER', { actor, reason });
    logAudit(auditLog, 'asset.link_only_blocker_flagged', updated, actor, 'ok', { reason });
    return updated;
  }

  /**
   * Lyft asset till VISIBLE_ON_PATIENT_CARD. Validerar guard-krav per
   * docs/schema/cco-patient-assets.schema.md §3 + OWNER-SKÄRPNING #1:
   *
   *   patientId ÄR ALLTID OBLIGATORISKT — det finns ingen review-bypass.
   *   Review-approval är vägen TILL patientId (via reassignToPatient()),
   *   inte ett sätt att kringgå patientId-kravet på visningssidan.
   *
   * Krav:
   *   - storageKey, checksum, fileSize > 0, mimeType (truthy)
   *   - patientId truthy (HARD — ingen reviewApproved-bypass)
   *   - patientId får INTE vara 'unknown' (sentinel för "okänd patient")
   *   - status === 'VERIFIED_IN_CCO'
   *
   * Om något saknas kastas en tydlig 409 med lista över saknade fält.
   * Emittar både `asset.status_changed` (via transitionStatus) och
   * `asset.linked_to_patient` audit.
   */
  async function markAsVisibleOnPatientCard(id, { actor = {} } = {}) {
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    if (!existing) {
      const e = new Error(`asset ${assetId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    // OWNER-SKÄRPNING #1: patientId ALLTID krävs. Ingen review-bypass.
    if (!existing.patientId || existing.patientId === 'unknown') {
      const e = new Error(
        'markAsVisibleOnPatientCard: patientId krävs ALLTID. ' +
          'Review-approval måste först koppla asset till en patient via ' +
          'reassignToPatient(), som sätter patientId och flyttar status till ' +
          `VERIFIED_IN_CCO. Asset: ${assetId}`
      );
      e.statusCode = 409;
      e.missing = ['patientId'];
      throw e;
    }
    const missing = [];
    if (!existing.storageKey) missing.push('storageKey');
    if (!existing.checksum) missing.push('checksum');
    if (!(Number(existing.fileSize) > 0)) missing.push('fileSize>0');
    if (!existing.mimeType) missing.push('mimeType');
    if (existing.status !== 'VERIFIED_IN_CCO') missing.push(`status=VERIFIED_IN_CCO (was ${existing.status})`);
    if (missing.length) {
      const e = new Error(
        `markAsVisibleOnPatientCard: kan inte lyfta asset ${assetId} till VISIBLE_ON_PATIENT_CARD. ` +
          `Saknade krav: [${missing.join(', ')}].`
      );
      e.statusCode = 409;
      e.missing = missing;
      throw e;
    }
    const updated = await transitionStatus(assetId, 'VISIBLE_ON_PATIENT_CARD', {
      actor,
      reason: 'verified_in_ui',
    });
    logAudit(auditLog, 'asset.linked_to_patient', updated, actor, 'ok', {
      via: 'markAsVisibleOnPatientCard',
    });
    return updated;
  }

  /**
   * OWNER-SKÄRPNING #1 — hjälp-funktion för review-flödet.
   *
   * Bara körbar för asset i status === NEEDS_REVIEW.
   * Sätter patientId, sätter confidence='medium' (manuellt review),
   * och övergår till VERIFIED_IN_CCO. Emit `asset.reassigned_to_patient`
   * audit-event (med reviewItemId och actor).
   *
   * Detta är den kanoniska vägen att lyfta en NEEDS_REVIEW-asset till
   * VISIBLE_ON_PATIENT_CARD: först `reassignToPatient()`, sedan
   * `markAsVisibleOnPatientCard()`. INGEN bypass av patientId-kravet
   * existerar.
   */
  async function reassignToPatient(
    assetId,
    { patientId = null, reviewItemId = null, actor = {}, reason = null } = {}
  ) {
    const id = normalizeText(assetId);
    const existing = state.items[id];
    if (!existing) {
      const e = new Error(`asset ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const pId = normalizeText(patientId);
    if (!pId || pId === 'unknown') {
      const e = new Error('reassignToPatient: patientId krävs (får inte vara "unknown").');
      e.statusCode = 400;
      throw e;
    }
    if (existing.status !== 'NEEDS_REVIEW') {
      const e = new Error(
        `reassignToPatient: bara körbar för status=NEEDS_REVIEW (var ${existing.status}). ` +
          `Asset: ${id}`
      );
      e.statusCode = 409;
      throw e;
    }
    // Sätt patientId + confidence='medium' (manuellt review)
    const previousPatientId = existing.patientId || null;
    const merged = normalizeAsset(
      { ...existing, patientId: pId, confidence: 'medium' },
      existing
    );
    state.items[id] = merged;
    await save();
    // Audit: asset.reassigned_to_patient
    logAudit(auditLog, 'asset.reassigned_to_patient', merged, actor, 'ok', {
      reviewItemId: reviewItemId || null,
      previousPatientId,
      newPatientId: pId,
      reason: reason || null,
    });
    // Övergå NEEDS_REVIEW → VERIFIED_IN_CCO via state-machine
    const verified = await transitionStatus(id, 'VERIFIED_IN_CCO', {
      actor,
      reason: reason || 'review_approved',
    });
    return verified;
  }

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
   * Soft-delete via state-machine. Target måste vara REJECTED / DUPLICATE /
   * NEEDS_REVIEW. Default = REJECTED. Filen raderas INTE från store.
   *
   * OWNER-SKÄRPNING #2: emit dedikerat `asset.soft_deleted`-event UTÖVER
   * `asset.status_changed` så att soft-delete kan ärendegranskas direkt
   * från audit-loggen utan att joina med status-changed-historiken.
   */
  async function softDeleteAsset(
    id,
    { reason = null, actor = {}, target = 'REJECTED' } = {}
  ) {
    if (!SOFT_DELETE_TARGETS.includes(target)) {
      const e = new Error(
        `softDeleteAsset: target måste vara REJECTED, DUPLICATE eller NEEDS_REVIEW (fick "${target}").`
      );
      e.statusCode = 400;
      throw e;
    }
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    const previousStatus = existing ? existing.status : null;
    const updated = await transitionStatus(id, target, { actor, reason });
    logAudit(auditLog, 'asset.soft_deleted', updated, actor, 'ok', {
      previousStatus,
      newStatus: updated.status,
      reason: reason || null,
      target,
    });
    return updated;
  }

  /**
   * Hard-delete — endast för icke-kliniskt-verifierade tekniska fel.
   * Guards:
   *   - `technicalReason` + `actor.userId` krävs (audit-spår)
   *   - asset med `isJournalRelevant === true` och status in {VERIFIED_IN_CCO,
   *     VISIBLE_ON_PATIENT_CARD} får INTE hard-deletas — använd softDelete.
   *
   * Emittar `asset.hard_deleted` audit med fullt audit-record.
   * Returnerar `{ deletedAssetId, technicalReason, actor, deletedAt }`
   * eller `null` om asset inte fanns.
   */
  async function hardDeleteAsset(id, { technicalReason = null, actor = {} } = {}) {
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    if (!existing) return null;
    if (!normalizeText(technicalReason)) {
      const e = new Error('hardDeleteAsset: technicalReason krävs.');
      e.statusCode = 400;
      throw e;
    }
    if (!actor || !normalizeText(actor.userId)) {
      const e = new Error('hardDeleteAsset: actor.userId krävs.');
      e.statusCode = 400;
      throw e;
    }
    // OWNER-SKÄRPNING #2: hard-delete utan audit-log är förbjudet.
    // Vi måste alltid kunna re-construct vem som raderade och varför.
    if (!auditLog || typeof auditLog.append !== 'function') {
      const e = new Error(
        'hardDeleteAsset: auditLog krävs för hard-delete. ' +
          'Hard-delete utan audit-trail är förbjudet — använd softDeleteAsset om ' +
          'ingen audit finns konfigurerad.'
      );
      e.statusCode = 500;
      throw e;
    }
    if (
      existing.isJournalRelevant === true &&
      ['VERIFIED_IN_CCO', 'VISIBLE_ON_PATIENT_CARD'].includes(existing.status)
    ) {
      const e = new Error(
        `hardDeleteAsset: kan inte hard-delete journalrelevant asset ${assetId} ` +
          `som är ${existing.status}. Använd softDeleteAsset istället.`
      );
      e.statusCode = 409;
      throw e;
    }
    const deletedAt = nowIso();
    // OWNER-SKÄRPNING #2 + P0.B++++: emit fullAssetSnapshot MEN
    // PII-maskad. Vi behöver snapshot i audit-loggen eftersom metadata
    // raderas, men originalFileName / originalDrivePath kan innehålla
    // patientnamn / pnr och får INTE skrivas rått till audit-trail.
    // maskPiiInAuditPayload hashar dessa fält och bevarar struktur
    // (depth + per-segment-hash) så att forensik fortfarande funkar.
    const fullAssetSnapshot = maskPiiInAuditPayload(existing);
    logAudit(auditLog, 'asset.hard_deleted', existing, actor, 'ok', {
      technicalReason,
      previousStatus: existing.status,
      hadStorageKey: Boolean(existing.storageKey),
      hadChecksum: Boolean(existing.checksum),
      isJournalRelevant: existing.isJournalRelevant === true,
      deletedAt,
      fullAssetSnapshot,
    });
    delete state.items[assetId];
    await save();
    return {
      deletedAssetId: assetId,
      technicalReason: normalizeText(technicalReason),
      actor: { userId: normalizeText(actor.userId), role: actor.role || 'unknown' },
      deletedAt,
    };
  }

  /**
   * Counts per status, per category, plus link-only / duplicate / review /
   * visible / verified-but-not-visible / imported-but-not-verified /
   * needs-review / failed-import / missing-checksum / missing-storage-key /
   * missing-patient-id-räknare. Inga payloads — counts only.
   */
  function stats(tenantId = null) {
    const all = Object.values(state.items);
    const byStatus = {};
    const byCategory = {};
    const bySourceSystem = {};
    let linkOnlyBlockerCount = 0;
    let duplicateCount = 0;
    let needsReviewCount = 0;
    let visibleOnPatientCardCount = 0;
    let verifiedButNotVisibleCount = 0;
    let importedButNotVerifiedCount = 0;
    let failedImportCount = 0;
    let assetsWithoutChecksumCount = 0;
    let assetsWithoutStorageKeyCount = 0;
    let assetsWithoutPatientIdCount = 0;
    let withChecksum = 0;
    let totalBytes = 0;
    for (const a of all) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      if (a.category) byCategory[a.category] = (byCategory[a.category] || 0) + 1;
      if (a.sourceSystem)
        bySourceSystem[a.sourceSystem] = (bySourceSystem[a.sourceSystem] || 0) + 1;
      // OWNER-SKÄRPNING #5: räkna assets som ÄR link-only-blocker, även
      // om status-fältet av någon anledning är annat. Drive-provenance
      // + saknad binär = blocker oavsett vad status säger.
      const hasDriveProvenance = !!(a.originalDriveFileId || a.originalDrivePath);
      const missingBinary = !a.storageKey || a.storageKey === 'pending-no-binary' || !a.checksum;
      const isLinkOnlyByCriteria = hasDriveProvenance && missingBinary;
      if (a.status === 'LINK_ONLY_BLOCKER' || isLinkOnlyByCriteria) {
        linkOnlyBlockerCount += 1;
      }
      if (a.status === 'DUPLICATE') duplicateCount += 1;
      if (a.status === 'NEEDS_REVIEW') needsReviewCount += 1;
      if (a.status === 'VISIBLE_ON_PATIENT_CARD') visibleOnPatientCardCount += 1;
      if (a.status === 'VERIFIED_IN_CCO') verifiedButNotVisibleCount += 1;
      if (a.status === 'IMPORTED_TO_CCO') importedButNotVerifiedCount += 1;
      if (a.status === 'FAILED_IMPORT') failedImportCount += 1;
      if (!a.checksum) assetsWithoutChecksumCount += 1;
      if (!a.storageKey || a.storageKey === 'pending-no-binary') assetsWithoutStorageKeyCount += 1;
      if ((!a.patientId || a.patientId === 'unknown') && a.status !== 'REJECTED')
        assetsWithoutPatientIdCount += 1;
      if (a.checksum) withChecksum += 1;
      totalBytes += Number(a.fileSize || 0);
    }
    const result = {
      tenantId: tenantId || null,
      schemaVersion: state.schemaVersion,
      total: all.length,
      byStatus,
      byCategory,
      bySourceSystem,
      // Legacy aliases (behålls för bakåtkompatibilitet med ccoJournalQaDashboardStore)
      linkOnlyCount: linkOnlyBlockerCount,
      duplicateCount,
      needsReviewCount,
      visibleOnPatientCardCount,
      withChecksumCount: withChecksum,
      withoutChecksumCount: all.length - withChecksum,
      totalBytes,
      // Owner-spec P0.B++ — 9 nya counters
      linkOnlyBlockerCount,
      verifiedButNotVisibleCount,
      importedButNotVerifiedCount,
      failedImportCount,
      assetsWithoutChecksumCount,
      assetsWithoutStorageKeyCount,
      assetsWithoutPatientIdCount,
    };
    // OWNER-SKÄRPNING #3: cutover-readiness — tom store ≠ bevis.
    result.cutoverReadiness = computeCutoverReadiness(result);
    return result;
  }

  /**
   * OWNER-SKÄRPNING #3 — Cutover-readiness är ALDRIG "ready" på en tom store.
   *
   * Tom store betyder att pipeline aldrig har körts mot riktig source-data.
   * Sanity-check på modulen passerar, men det är INTE samma sak som bevis
   * för att alla patienter kan se sina filer direkt i CCO utan Drive.
   *
   * Ordningen är bevarad (worst-blocker först):
   *   1. empty_store               — pipeline har inte körts
   *   2. link_only_blockers_remain — Drive-länk-only-filer kvarstår
   *   3. orphan_assets             — assets utan patientId
   *   4. missing_checksums         — assets utan SHA-256
   *   5. all_imported_and_verified — cutover-ready
   */
  function computeCutoverReadiness(s) {
    const hasImportRun = s.total > 0;
    if (!hasImportRun) {
      return {
        ready: false,
        reason: 'empty_store',
        message:
          'Tom store — pipeline har aldrig körts. Sanity check OK men inte cutover-bevis.',
      };
    }
    if (s.linkOnlyBlockerCount > 0) {
      return {
        ready: false,
        reason: 'link_only_blockers_remain',
        message: `${s.linkOnlyBlockerCount} LINK_ONLY_BLOCKER kvar — måste importeras eller flyttas till review med owner-beslut.`,
      };
    }
    if (s.assetsWithoutPatientIdCount > 0) {
      return {
        ready: false,
        reason: 'orphan_assets',
        message: `${s.assetsWithoutPatientIdCount} assets saknar patientId.`,
      };
    }
    if (s.assetsWithoutChecksumCount > 0) {
      return {
        ready: false,
        reason: 'missing_checksums',
        message: `${s.assetsWithoutChecksumCount} assets saknar checksum.`,
      };
    }
    return {
      ready: true,
      reason: 'all_imported_and_verified',
      message: `Cutover-ready: ${s.total} assets, ${s.visibleOnPatientCardCount} synliga på patientkort.`,
    };
  }

  return {
    addAsset,
    transitionStatus,
    updateAssetStatus,
    listAssetsForPatient,
    listAssetsForEncounter,
    getAsset,
    markAsLinkOnlyBlocker,
    markAsVisibleOnPatientCard,
    reassignToPatient,
    recordChecksumVerified,
    linkAssetToPatient,
    linkAssetToEncounter,
    softDeleteAsset,
    hardDeleteAsset,
    stats,
    // exposed for testing / health
    _state: () => state,
  };
}

module.exports = {
  createCcoPatientAssetStore,
  maskPiiInAuditPayload,
  VALID_STATUSES,
  VALID_CATEGORIES,
  VALID_SOURCE_SYSTEMS,
  VALID_STORAGE_PROVIDERS,
  VALID_CONFIDENCE,
  STATUS_TRANSITIONS,
  SOFT_DELETE_TARGETS,
  SCHEMA_VERSION,
};
