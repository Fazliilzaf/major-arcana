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

const SCHEMA_VERSION = '1.1.0';

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
  IMPORTED_TO_CCO: Object.freeze(['VERIFIED_IN_CCO', 'FAILED_IMPORT', 'NEEDS_REVIEW']),
  VERIFIED_IN_CCO: Object.freeze(['VISIBLE_ON_PATIENT_CARD', 'NEEDS_REVIEW']),
  VISIBLE_ON_PATIENT_CARD: Object.freeze(['NEEDS_REVIEW', 'REJECTED']),
  NEEDS_REVIEW: Object.freeze(['VERIFIED_IN_CCO', 'REJECTED', 'DUPLICATE']),
  DUPLICATE: Object.freeze(['REJECTED', 'NEEDS_REVIEW', 'VERIFIED_IN_CCO']),
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
  'drive_import',
  'meridiq',
  'old_cco',
  'cco_camera',
  'upload',
  'aisia_ds3',
  'cco_journal_sign', // P0.J.222 — auto-PDF vid signering av CCO-journal
  'getaccept_import',
  'pipedrive_import',
  'm365_halso',
]);

const VALID_STORAGE_PROVIDERS = Object.freeze(['s3', 'local', 'encrypted-fs']);

const VALID_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Filnamn och sökvägar kommer från Google Drive och macOS, som lagrar å ä ö
 * dekomponerat (NFD: o + U+0308). Samma namn fick därför två representationer
 * beroende på källa, vilket bröt jämförelser och såg trasigt ut i kundkortet.
 * NFC ger en enda kanonisk form. Bara textfält normaliseras — id:n och enums
 * är ASCII och rörs inte.
 */
function normalizeFileText(value) {
  const text = normalizeText(value);
  return text ? text.normalize('NFC') : text;
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

/**
 * Kompakt JSON, inte snyggformaterad.
 *
 * Den här filen läses bara av maskiner, och den är stor: 77 526 assets,
 * 259 MB snyggformaterat mot 196 MB kompakt (mätt 2026-08-04). Skillnaden är
 * ren indentering — 24 % av varje skrivning.
 *
 * Det spelar roll eftersom JSON.stringify bygger HELA utdatan som en
 * sammanhängande sträng i minnet innan något når disk, och varje skrivning
 * serialiserar hela lagret även när en enda asset ändrats. Under bulkkörningar
 * upprepas den allokeringen gång på gång; 2026-08-04 föll produktionen på
 * fjärde omgången av en besökskoppling med tio patienter åt gången.
 *
 * Det här tar inte bort grundproblemet — hela lagret serialiseras fortfarande
 * per skrivning — men det tar bort en fjärdedel av toppen.
 */
async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

/**
 * DELAD PERSISTENS.
 *
 * Lagret hålls HELT i minnet precis som förut — 52 anropsställen skannar alla
 * assets via listItemsForEnrichment, och att ladda shards på begäran skulle
 * tvinga in varenda en ändå. Det är bara skrivningen till disk som delas upp.
 *
 * Före: varje save() serialiserade hela lagret, ~196 MB som en sammanhängande
 * sträng i minnet, även när en enda asset ändrats. 2026-08-04 fällde det
 * produktionen mitt i en bulkkörning.
 *
 * Efter: assets fördelas på SHARD_COUNT filer via en stabil hash av id:t.
 * save() sveper updatedAt, ser vilka shards som berörts, och skriver bara dem.
 * En typisk skrivning rör en shard — ~3 MB i stället för 196.
 */
const SHARD_COUNT = 64;

function shardIndexFor(assetId) {
  // FNV-1a. Stabil över processer och Node-versioner, till skillnad från
  // inbyggda hashar — shard-tillhörigheten måste överleva omstarter.
  const text = String(assetId || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % SHARD_COUNT;
}

function shardFileName(index) {
  return `shard-${String(index).padStart(2, '0')}.json`;
}

function shardDirFor(filePath) {
  return path.join(path.dirname(filePath), `${path.basename(filePath, '.json')}.shards`);
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

  const status = normalizeText(safe.status || ex.status).toUpperCase() || 'DISCOVERED';
  validateEnum('status', status, VALID_STATUSES);

  const confidence = normalizeText(safe.confidence || ex.confidence) || null;
  if (confidence) validateEnum('confidence', confidence, VALID_CONFIDENCE);

  return {
    id: normalizeText(safe.id || ex.id) || crypto.randomUUID(),
    patientId: normalizeText(safe.patientId || ex.patientId),
    encounterId: normalizeText(safe.encounterId || ex.encounterId) || null,
    sourceSystem,
    sourceRecordId: normalizeText(safe.sourceRecordId || ex.sourceRecordId) || null,
    originalDriveFileId: normalizeText(safe.originalDriveFileId || ex.originalDriveFileId) || null,
    originalDrivePath: normalizeFileText(safe.originalDrivePath || ex.originalDrivePath) || null,
    originalFileName: normalizeFileText(safe.originalFileName || ex.originalFileName) || null,
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
    isJournalRelevant: normalizeBoolean(safe.isJournalRelevant, ex.isJournalRelevant ?? false),
    isPatientVisible: normalizeBoolean(safe.isPatientVisible, ex.isPatientVisible ?? false),
    // Display / naming metadata (v1.1) — RBAC-skyddat i UI, aldrig i storageKey
    displayName: normalizeText(safe.displayName || ex.displayName) || null,
    documentTitle: normalizeText(safe.documentTitle || ex.documentTitle) || null,
    treatmentType: normalizeText(safe.treatmentType || ex.treatmentType) || null,
    encounterType: normalizeText(safe.encounterType || ex.encounterType) || null,
    visitLabel: normalizeText(safe.visitLabel || ex.visitLabel) || null,
    subCategory: normalizeText(safe.subCategory || ex.subCategory) || null,
    patientCardSection: normalizeText(safe.patientCardSection || ex.patientCardSection) || null,
    imageStage: normalizeText(safe.imageStage || ex.imageStage) || null,
    imageType: normalizeText(safe.imageType || ex.imageType) || null,
    bodyArea: normalizeText(safe.bodyArea || ex.bodyArea) || null,
    angle: normalizeText(safe.angle || ex.angle) || null,
    sessionNumber: Number.isFinite(Number(safe.sessionNumber))
      ? Math.max(0, Math.round(Number(safe.sessionNumber)))
      : Number.isFinite(Number(ex.sessionNumber))
        ? Math.max(0, Math.round(Number(ex.sessionNumber)))
        : null,
    suggestedCategory: normalizeText(safe.suggestedCategory || ex.suggestedCategory) || null,
    approvedCategory: normalizeText(safe.approvedCategory || ex.approvedCategory) || null,
    captureDate: normalizeText(safe.captureDate || ex.captureDate) || null,
    captureDateTime: normalizeText(safe.captureDateTime || ex.captureDateTime) || null,
    captureDateSource: normalizeText(safe.captureDateSource || ex.captureDateSource) || null,
    captureDateConfidence:
      normalizeText(safe.captureDateConfidence || ex.captureDateConfidence) || null,
    captureDateMismatch: normalizeBoolean(
      safe.captureDateMismatch,
      ex.captureDateMismatch ?? false
    ),
    captureCameraMake: normalizeText(safe.captureCameraMake || ex.captureCameraMake) || null,
    captureCameraModel: normalizeText(safe.captureCameraModel || ex.captureCameraModel) || null,
    captureDateAuditAt: normalizeText(safe.captureDateAuditAt || ex.captureDateAuditAt) || null,
    version: normalizeText(safe.version || ex.version) || null,
    namingConfidence: normalizeText(safe.namingConfidence || ex.namingConfidence) || null,
    namingStatus: normalizeText(safe.namingStatus || ex.namingStatus) || null,
    uiStatus: normalizeText(safe.uiStatus || ex.uiStatus) || null,
    namingBuiltAt: normalizeText(safe.namingBuiltAt || ex.namingBuiltAt) || null,
    reviewedBy: normalizeText(safe.reviewedBy || ex.reviewedBy) || null,
    reviewedAt: normalizeText(safe.reviewedAt || ex.reviewedAt) || null,
    reviewReason: normalizeText(safe.reviewReason || ex.reviewReason) || null,
    encounterMappingStatus:
      normalizeText(safe.encounterMappingStatus || ex.encounterMappingStatus) || null,
    encounterMappingReviewedAt:
      normalizeText(safe.encounterMappingReviewedAt || ex.encounterMappingReviewedAt) || null,
    encounterMappingReviewedBy:
      normalizeText(safe.encounterMappingReviewedBy || ex.encounterMappingReviewedBy) || null,
    encounterMappingReviewReason:
      normalizeText(safe.encounterMappingReviewReason || ex.encounterMappingReviewReason) || null,
    oldCategory: normalizeText(safe.oldCategory || ex.oldCategory) || null,
    technicalInfo:
      safe.technicalInfo && typeof safe.technicalInfo === 'object'
        ? { ...(ex.technicalInfo || {}), ...safe.technicalInfo }
        : ex.technicalInfo || null,
    statusHistory: asArray(ex.statusHistory)
      .slice(-49)
      .concat(
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
    const segments = String(masked.originalDrivePath).split('/').filter(Boolean);
    masked.originalDrivePath_structure = segments
      .map((s) => 'seg-' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 8))
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

/**
 * Läser lagret från shard-katalogen. Finns den inte men monoliten gör det,
 * migreras den en gång: shards skrivs, monoliten lämnas kvar som backup och en
 * markörfil hindrar att migreringen körs om.
 *
 * Returnerar state PLUS en karta assetId -> shard, som save() behöver för att
 * upptäcka raderingar (en borttagen asset syns inte i en updatedAt-svep).
 */
async function loadShardedState(filePath) {
  const shardDir = shardDirFor(filePath);
  const metaPath = path.join(shardDir, 'meta.json');
  const meta = await readJson(metaPath, null);

  const state = emptyState();
  const shardByAssetId = new Map();

  if (meta) {
    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const shard = await readJson(path.join(shardDir, shardFileName(i)), null);
      for (const [id, asset] of Object.entries(shard?.items || {})) {
        state.items[id] = asset;
        shardByAssetId.set(id, i);
      }
    }
    state.schemaVersion = meta.schemaVersion || SCHEMA_VERSION;
    state.createdAt = meta.createdAt || nowIso();
    state.updatedAt = meta.updatedAt || nowIso();
    return { state, shardByAssetId, migrated: false };
  }

  // Ingen shard-katalog än — läs monoliten och migrera.
  const monolith = await readJson(filePath, null);
  if (monolith?.items && typeof monolith.items === 'object') {
    for (const [id, asset] of Object.entries(monolith.items)) {
      state.items[id] = asset;
      shardByAssetId.set(id, shardIndexFor(id));
    }
    state.schemaVersion = monolith.schemaVersion || SCHEMA_VERSION;
    state.createdAt = monolith.createdAt || nowIso();
  }
  if (Array.isArray(monolith?.audit)) state.audit = monolith.audit;

  await writeAllShards(filePath, state);
  return { state, shardByAssetId, migrated: Boolean(monolith) };
}

async function writeAllShards(filePath, state) {
  const shardDir = shardDirFor(filePath);
  await fs.mkdir(shardDir, { recursive: true });
  const buckets = Array.from({ length: SHARD_COUNT }, () => ({}));
  for (const [id, asset] of Object.entries(state.items)) {
    buckets[shardIndexFor(id)][id] = asset;
  }
  for (let i = 0; i < SHARD_COUNT; i += 1) {
    await writeJsonAtomic(path.join(shardDir, shardFileName(i)), { items: buckets[i] });
  }
  await writeJsonAtomic(path.join(shardDir, 'meta.json'), {
    schemaVersion: state.schemaVersion,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    shardCount: SHARD_COUNT,
    audit: state.audit,
  });
}

async function createCcoPatientAssetStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs för ccoPatientAssetStore');
  const loaded = await loadShardedState(filePath);
  const state = loaded.state;
  const shardByAssetId = loaded.shardByAssetId;
  let lastSaveTs = state.updatedAt || nowIso();
  if (!state.items || typeof state.items !== 'object') state.items = {};
  if (!Array.isArray(state.audit)) state.audit = [];
  if (!state.schemaVersion) state.schemaVersion = SCHEMA_VERSION;

  // Batch-persist: skjut upp diskskrivningar under en batch, skriv 1× vid flush.
  // Gör massimport snabb + concurrency säker (ingen skriv-storm av stort index).
  let __batchDepth = 0;
  let __batchDirty = false;
  // Egen flagga: checkpointBatch nollstaller __batchDirty, sa den kan inte
  // anvandas for att avgora om batchen skrev nagot. Utan den har hoppar
  // flushBatch over monolit-regenereringen efter en checkpoint, och de tre
  // tjanster som laser filen direkt ser permanent inaktuella data.
  let __batchWrote = false;

  /**
   * Vilka shards har ändrats sedan förra skrivningen?
   *
   * Två källor. Ändrade och nya assets hittas på updatedAt — varje
   * normalizeAsset sätter den. Raderade hittas på att de finns i
   * shardByAssetId men inte längre i state.items; en updatedAt-svep kan
   * omöjligt se något som är borta.
   *
   * Svepet är O(n) över objektreferenser, inte serialisering. 77 000 assets
   * kostar mikrosekunder mot 196 MB.
   */
  function collectDirtyShards() {
    const dirty = new Set();
    const seen = new Set();
    for (const [id, asset] of Object.entries(state.items)) {
      seen.add(id);
      const index = shardIndexFor(id);
      if (shardByAssetId.get(id) !== index) {
        // Ny asset, eller en som aldrig laddats. Bägge smutsar sin shard.
        if (shardByAssetId.has(id)) dirty.add(shardByAssetId.get(id));
        shardByAssetId.set(id, index);
        dirty.add(index);
        continue;
      }
      if (String(asset?.updatedAt || '') > lastSaveTs) dirty.add(index);
    }
    for (const [id, index] of shardByAssetId) {
      if (!seen.has(id)) {
        dirty.add(index);
        shardByAssetId.delete(id);
      }
    }
    return dirty;
  }

  async function persist() {
    const dirty = collectDirtyShards();
    const shardDir = shardDirFor(filePath);
    await fs.mkdir(shardDir, { recursive: true });

    if (dirty.size) {
      const buckets = new Map();
      for (const index of dirty) buckets.set(index, {});
      for (const [id, asset] of Object.entries(state.items)) {
        const index = shardIndexFor(id);
        if (buckets.has(index)) buckets.get(index)[id] = asset;
      }
      for (const [index, items] of buckets) {
        await writeJsonAtomic(path.join(shardDir, shardFileName(index)), { items });
      }
    }

    await writeJsonAtomic(path.join(shardDir, 'meta.json'), {
      schemaVersion: state.schemaVersion,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      shardCount: SHARD_COUNT,
      audit: state.audit,
    });
    lastSaveTs = state.updatedAt;
  }

  /**
   * Monoliten är inte längre skrivvägen, men den är fortfarande LÄSvägen för
   * tre produktionstjänster — ccoKunderEnrichment, ccoImportReviewReadService,
   * ccoDriveImportReviewReadService — och ett femtiotal skript. De öppnar
   * filen direkt, förbi lagret.
   *
   * Därför regenereras den, men bara när en bulkkörning avslutas eller en
   * ensam skrivning sker. Tolv batchar kostar 12 × ~3 MB plus EN 196
   * MB-skrivning i stället för 12 × 196 MB. Det var upprepningen som fällde
   * processen 2026-08-04, inte den enskilda serialiseringen.
   */
  async function writeCompatMonolith() {
    await writeJsonAtomic(filePath, state);
  }

  async function save() {
    state.updatedAt = nowIso();
    if (__batchDepth > 0) {
      __batchDirty = true;
      __batchWrote = true;
      return;
    }
    await persist();
    await writeCompatMonolith();
  }
  function beginBatch() {
    __batchDepth += 1;
  }
  async function checkpointBatch() {
    if (__batchDepth === 0 || !__batchDirty) return false;
    __batchDirty = false;
    state.updatedAt = nowIso();
    await persist();
    return true;
  }
  async function flushBatch() {
    if (__batchDepth > 0) __batchDepth -= 1;
    if (__batchDepth === 0 && __batchWrote) {
      __batchDirty = false;
      __batchWrote = false;
      state.updatedAt = nowIso();
      await persist();
      await writeCompatMonolith();
    }
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
    logAudit(auditLog, 'asset.read', { patientId: pId, id: null }, actor, 'ok', {
      scope: 'patient',
      count: result.length,
      filters: Object.keys(f),
    });
    return result;
  }

  function listAssetsForEncounter(encounterId, { actor = {} } = {}) {
    const eId = normalizeText(encounterId);
    if (!eId) return [];
    const result = Object.values(state.items)
      .filter((a) => (a.encounterId || '') === eId)
      .map((a) => ({ ...a }));
    logAudit(auditLog, 'asset.read', { encounterId: eId, id: null }, actor, 'ok', {
      scope: 'encounter',
      count: result.length,
    });
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
    if (existing.status !== 'VERIFIED_IN_CCO')
      missing.push(`status=VERIFIED_IN_CCO (was ${existing.status})`);
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
    const merged = normalizeAsset({ ...existing, patientId: pId, confidence: 'medium' }, existing);
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

  /**
   * Kopplar binär till metadata-first import (t.ex. GetAccept legacy).
   * Kräver IMPORTED_TO_CCO + storageKey saknas.
   */
  async function attachImportedBinary(
    assetId,
    {
      storageKey = null,
      checksum = null,
      fileSize = null,
      mimeType = null,
      originalFileName = null,
      storageProvider = 'local',
      clearPdfPending = true,
      actor = {},
      reason = null,
    } = {}
  ) {
    const id = normalizeText(assetId);
    const existing = state.items[id];
    if (!existing) {
      const e = new Error(`asset ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    if (existing.status !== 'IMPORTED_TO_CCO') {
      const e = new Error(
        `attachImportedBinary: kräver status IMPORTED_TO_CCO (var ${existing.status}).`
      );
      e.statusCode = 409;
      throw e;
    }
    if (existing.storageKey && existing.storageKey !== 'pending-no-binary') {
      const e = new Error(`attachImportedBinary: asset ${id} har redan storageKey.`);
      e.statusCode = 409;
      throw e;
    }

    const key = normalizeText(storageKey);
    const hash = normalizeText(checksum);
    const size = Number(fileSize);
    const mime = normalizeText(mimeType);
    if (!key) {
      const e = new Error('storageKey krävs.');
      e.statusCode = 400;
      throw e;
    }
    if (!hash) {
      const e = new Error('checksum krävs.');
      e.statusCode = 400;
      throw e;
    }
    if (!(size > 0)) {
      const e = new Error('fileSize>0 krävs.');
      e.statusCode = 400;
      throw e;
    }
    if (!mime) {
      const e = new Error('mimeType krävs.');
      e.statusCode = 400;
      throw e;
    }

    const technicalInfo =
      clearPdfPending && existing.technicalInfo && typeof existing.technicalInfo === 'object'
        ? {
            ...existing.technicalInfo,
            pdfPending: false,
            attachmentPending: false,
            pdfFetchedAt: nowIso(),
          }
        : existing.technicalInfo || null;

    const merged = normalizeAsset(
      {
        ...existing,
        storageProvider: normalizeText(storageProvider) || 'local',
        storageKey: key,
        checksum: hash,
        fileSize: size,
        mimeType: mime,
        originalFileName: normalizeText(originalFileName) || existing.originalFileName || null,
        technicalInfo,
      },
      existing
    );
    state.items[id] = merged;
    await save();
    logAudit(auditLog, 'asset.import_binary_attached', merged, actor, 'ok', {
      reason: reason || null,
      sourceSystem: merged.sourceSystem || null,
    });
    return { ...merged };
  }

  /**
   * Reparera ghost VISIBLE/VERIFIED: kopiera blob-pekare från sibling med verifierad storage.
   * Sibling lämnas kvar (ofta DUPLICATE, dold i default-lista).
   */
  async function reattachGhostVisibleBlobFromSibling(
    canonicalAssetId,
    siblingAssetId,
    { storage = null, actor = {}, reason = null } = {}
  ) {
    const canonicalId = normalizeText(canonicalAssetId);
    const siblingId = normalizeText(siblingAssetId);
    const canonical = state.items[canonicalId];
    const sibling = state.items[siblingId];

    if (!canonical) {
      const e = new Error(`asset ${canonicalId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    if (!sibling) {
      const e = new Error(`sibling asset ${siblingId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    if (canonicalId === siblingId) {
      const e = new Error('canonical och sibling får inte vara samma asset.');
      e.statusCode = 400;
      throw e;
    }
    if (!['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(normalizeText(canonical.status))) {
      const e = new Error(
        `reattachGhostVisibleBlobFromSibling: kräver VISIBLE_ON_PATIENT_CARD eller VERIFIED_IN_CCO (var ${canonical.status}).`
      );
      e.statusCode = 409;
      throw e;
    }
    if (normalizeText(canonical.patientId) !== normalizeText(sibling.patientId)) {
      const e = new Error('cross-patient sibling repair är inte tillåten.');
      e.statusCode = 409;
      throw e;
    }
    if (
      !['DUPLICATE', 'VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(
        normalizeText(sibling.status)
      )
    ) {
      const e = new Error('ghost visible repair kräver verifierad blob-sibling.');
      e.statusCode = 409;
      throw e;
    }

    const siblingKey = normalizeText(sibling.storageKey);
    const siblingChecksum = normalizeText(sibling.checksum);
    const siblingSize = Number(sibling.fileSize);
    const siblingMime = normalizeText(sibling.mimeType);
    if (!siblingKey || siblingKey === 'pending-no-binary') {
      const e = new Error('sibling saknar storageKey.');
      e.statusCode = 409;
      throw e;
    }
    if (!siblingChecksum) {
      const e = new Error('sibling saknar checksum.');
      e.statusCode = 409;
      throw e;
    }
    if (!(siblingSize > 0)) {
      const e = new Error('sibling saknar fileSize.');
      e.statusCode = 409;
      throw e;
    }
    if (!siblingMime) {
      const e = new Error('sibling saknar mimeType.');
      e.statusCode = 409;
      throw e;
    }

    if (storage && typeof storage.exists === 'function') {
      try {
        const siblingBlobOk = await storage.exists(siblingKey);
        if (!siblingBlobOk) {
          const e = new Error('sibling blob saknas i storage.');
          e.statusCode = 409;
          throw e;
        }
        const canonicalKey = normalizeText(canonical.storageKey);
        if (canonicalKey && canonicalKey !== 'pending-no-binary') {
          const canonicalBlobOk = await storage.exists(canonicalKey);
          if (canonicalBlobOk) {
            const e = new Error('canonical asset har redan verifierad blob.');
            e.statusCode = 409;
            throw e;
          }
        }
      } catch (error) {
        if (error?.statusCode) throw error;
        const e = new Error(`storage.exists misslyckades: ${error.message}`);
        e.statusCode = 500;
        throw e;
      }
    }

    const canonicalChecksum = normalizeText(canonical.checksum);
    if (canonicalChecksum && canonicalChecksum !== siblingChecksum) {
      const e = new Error('canonical checksum matchar inte sibling — manuell review krävs.');
      e.statusCode = 409;
      throw e;
    }

    const merged = normalizeAsset(
      {
        ...canonical,
        storageProvider:
          normalizeText(sibling.storageProvider) || canonical.storageProvider || 'local',
        storageKey: siblingKey,
        checksum: siblingChecksum,
        fileSize: siblingSize,
        mimeType: siblingMime,
        thumbnailKey: sibling.thumbnailKey || canonical.thumbnailKey || null,
        originalDriveFileId:
          normalizeText(canonical.originalDriveFileId) ||
          normalizeText(sibling.originalDriveFileId) ||
          null,
      },
      canonical
    );

    state.items[canonicalId] = merged;
    await save();
    logAudit(auditLog, 'asset.ghost_visible_repaired', merged, actor, 'ok', {
      reason: reason || null,
      siblingAssetId: siblingId,
      previousStorageKey: canonical.storageKey || null,
      previousChecksum: canonical.checksum || null,
    });
    return { ...merged };
  }

  /**
   * A legacy ghost can carry a checksum for an empty/failed historical write.
   * When the exact original Drive file has just been downloaded again, its
   * duplicate import is authoritative even though the old checksum differs.
   */
  async function recoverGhostVisibleBlobFromDriveSource(
    canonicalAssetId,
    sourceAssetId,
    { storage = null, actor = {}, reason = null } = {}
  ) {
    const canonicalId = normalizeText(canonicalAssetId);
    const sourceId = normalizeText(sourceAssetId);
    const canonical = state.items[canonicalId];
    const source = state.items[sourceId];

    if (!canonical || !source) {
      const e = new Error('canonical eller source asset saknas.');
      e.statusCode = 404;
      throw e;
    }
    if (canonicalId === sourceId) {
      const e = new Error('canonical och source får inte vara samma asset.');
      e.statusCode = 400;
      throw e;
    }
    if (!['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(normalizeText(canonical.status))) {
      const e = new Error('Drive-recovery kräver synlig eller verifierad canonical asset.');
      e.statusCode = 409;
      throw e;
    }
    if (normalizeText(source.status) !== 'DUPLICATE') {
      const e = new Error('Drive-recovery kräver en ny DUPLICATE från exakt källfil.');
      e.statusCode = 409;
      throw e;
    }
    if (normalizeText(canonical.patientId) !== normalizeText(source.patientId)) {
      const e = new Error('cross-patient Drive-recovery är inte tillåten.');
      e.statusCode = 409;
      throw e;
    }

    const canonicalDriveId = normalizeText(canonical.originalDriveFileId);
    const sourceDriveId = normalizeText(source.originalDriveFileId);
    if (!canonicalDriveId || canonicalDriveId !== sourceDriveId) {
      const e = new Error(
        'Drive-recovery kräver samma originalDriveFileId på canonical och source.'
      );
      e.statusCode = 409;
      throw e;
    }

    const sourceKey = normalizeText(source.storageKey);
    const sourceChecksum = normalizeText(source.checksum);
    const sourceSize = Number(source.fileSize);
    const sourceMime = normalizeText(source.mimeType);
    if (
      !sourceKey ||
      sourceKey === 'pending-no-binary' ||
      !sourceChecksum ||
      !(sourceSize > 0) ||
      !sourceMime
    ) {
      const e = new Error('Drive-recovery source saknar verifierad binärmetadata.');
      e.statusCode = 409;
      e.code = 'DRIVE_RECOVERY_SOURCE_INVALID';
      throw e;
    }
    if (!storage || typeof storage.exists !== 'function') {
      const e = new Error('Drive-recovery kräver storage.exists.');
      e.statusCode = 503;
      throw e;
    }
    try {
      if (!(await storage.exists(sourceKey))) {
        const e = new Error('Drive-recovery source-blob saknas i storage.');
        e.statusCode = 409;
        e.code = 'DRIVE_RECOVERY_SOURCE_INVALID';
        throw e;
      }
      const canonicalKey = normalizeText(canonical.storageKey);
      if (
        canonicalKey &&
        canonicalKey !== 'pending-no-binary' &&
        (await storage.exists(canonicalKey))
      ) {
        const e = new Error('canonical asset har redan verifierad blob.');
        e.statusCode = 409;
        throw e;
      }
    } catch (error) {
      if (error?.statusCode) throw error;
      const e = new Error(`storage.exists misslyckades: ${error.message}`);
      e.statusCode = 500;
      throw e;
    }

    const merged = normalizeAsset(
      {
        ...canonical,
        storageProvider:
          normalizeText(source.storageProvider) || canonical.storageProvider || 'local',
        storageKey: sourceKey,
        checksum: sourceChecksum,
        fileSize: sourceSize,
        mimeType: sourceMime,
        thumbnailKey: source.thumbnailKey || canonical.thumbnailKey || null,
      },
      canonical
    );
    state.items[canonicalId] = merged;
    await save();
    logAudit(auditLog, 'asset.ghost_visible_recovered_from_drive_source', merged, actor, 'ok', {
      reason: reason || null,
      sourceAssetId: sourceId,
      originalDriveFileId: sourceDriveId,
      previousStorageKey: canonical.storageKey || null,
      previousChecksum: canonical.checksum || null,
    });
    return { ...merged };
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

  async function updateAssetCategory(id, category, { actor = {}, reason = null } = {}) {
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    if (!existing) {
      const e = new Error(`asset ${assetId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const cat = normalizeText(category);
    validateEnum('category', cat, VALID_CATEGORIES);
    const merged = normalizeAsset({ ...existing, category: cat }, existing);
    state.items[assetId] = merged;
    await save();
    logAudit(auditLog, 'asset.category_updated', merged, actor, 'ok', {
      reason: reason || null,
    });
    return { ...merged };
  }

  async function updateAssetThumbnailKey(id, thumbnailKey, { actor = {}, reason = null } = {}) {
    const assetId = normalizeText(id);
    const existing = state.items[assetId];
    if (!existing) {
      const e = new Error(`asset ${assetId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const merged = normalizeAsset(
      {
        ...existing,
        thumbnailKey: normalizeText(thumbnailKey) || null,
      },
      existing
    );
    state.items[assetId] = merged;
    await save();
    logAudit(auditLog, 'asset.thumbnail_generated', merged, actor, 'ok', {
      reason: reason || null,
      hasThumbnailKey: !!merged.thumbnailKey,
    });
    return { ...merged };
  }

  async function patchAssetForReview(assetId, patch = {}, { actor = {}, reason = null } = {}) {
    const id = normalizeText(assetId);
    const existing = state.items[id];
    if (!existing) {
      const e = new Error(`asset ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    if (existing.status !== 'NEEDS_REVIEW') {
      const e = new Error(`patchAssetForReview: bara NEEDS_REVIEW (var ${existing.status}).`);
      e.statusCode = 409;
      throw e;
    }
    const next = { ...existing };
    if (patch.category != null) {
      const cat = normalizeText(patch.category);
      validateEnum('category', cat, VALID_CATEGORIES);
      next.category = cat;
    }
    if (patch.confidence != null) {
      const conf = normalizeText(patch.confidence);
      if (!['high', 'medium', 'low'].includes(conf)) {
        const e = new Error('confidence måste vara high, medium eller low.');
        e.statusCode = 400;
        throw e;
      }
      next.confidence = conf;
    }
    const merged = normalizeAsset(next, existing);
    state.items[id] = merged;
    await save();
    logAudit(auditLog, 'asset.review_metadata_updated', merged, actor, 'ok', {
      reason: reason || null,
      fields: Object.keys(patch),
    });
    return { ...merged };
  }

  async function patchAssetNamingMetadata(assetId, patch = {}, { actor = {}, reason = null } = {}) {
    const id = normalizeText(assetId);
    const existing = state.items[id];
    if (!existing) {
      const e = new Error(`asset ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const allowed = [
      'displayName',
      'documentTitle',
      'treatmentType',
      'encounterType',
      'visitLabel',
      'subCategory',
      'patientCardSection',
      'imageStage',
      'imageType',
      'bodyArea',
      'angle',
      'sessionNumber',
      'suggestedCategory',
      'approvedCategory',
      'captureDate',
      'captureDateTime',
      'captureDateSource',
      'captureDateConfidence',
      'captureDateMismatch',
      'captureCameraMake',
      'captureCameraModel',
      'captureDateAuditAt',
      'version',
      'namingConfidence',
      'namingStatus',
      'uiStatus',
      'namingBuiltAt',
      'reviewedBy',
      'reviewedAt',
      'reviewReason',
      'oldCategory',
      'approvedCategory',
      'technicalInfo',
      'imageType',
      'sessionNumber',
      'encounterType',
      'encounterMappingStatus',
      'encounterMappingReviewedAt',
      'encounterMappingReviewedBy',
      'encounterMappingReviewReason',
    ];
    const next = { ...existing };
    for (const key of allowed) {
      if (patch[key] !== undefined) next[key] = patch[key];
    }
    const merged = normalizeAsset(next, existing);
    state.items[id] = merged;
    await save();
    logAudit(auditLog, 'asset.naming_metadata_updated', merged, actor, 'ok', {
      reason: reason || null,
      fields: Object.keys(patch),
      namingStatus: merged.namingStatus || null,
      displayName_hash: merged.displayName
        ? 'sha256:' +
          crypto.createHash('sha256').update(String(merged.displayName)).digest('hex').slice(0, 16)
        : null,
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
  async function softDeleteAsset(id, { reason = null, actor = {}, target = 'REJECTED' } = {}) {
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
   * Migration-only: återställ REJECTED pipedrive_import och koppla till patient.
   * Bypassar terminal REJECTED-state för kontrollerad datareparation (owner/script).
   */
  async function restoreRejectedAndLinkPatient(
    assetId,
    { patientId = null, actor = {}, reason = null } = {}
  ) {
    const id = normalizeText(assetId);
    const existing = state.items[id];
    if (!existing) {
      const e = new Error(`asset ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    if (existing.status !== 'REJECTED') {
      const e = new Error(
        `restoreRejectedAndLinkPatient: kräver status REJECTED (var ${existing.status}). Asset: ${id}`
      );
      e.statusCode = 409;
      throw e;
    }
    if (existing.sourceSystem !== 'pipedrive_import') {
      const e = new Error(
        `restoreRejectedAndLinkPatient: endast pipedrive_import (var ${existing.sourceSystem}).`
      );
      e.statusCode = 409;
      throw e;
    }
    const pId = normalizeText(patientId);
    if (!pId || pId === 'unknown') {
      const e = new Error(
        'restoreRejectedAndLinkPatient: patientId krävs (får inte vara "unknown").'
      );
      e.statusCode = 400;
      throw e;
    }
    const previousPatientId = existing.patientId || null;
    const merged = normalizeAsset(
      {
        ...existing,
        patientId: pId,
        confidence: 'medium',
        isPatientVisible: true,
        status: 'VISIBLE_ON_PATIENT_CARD',
      },
      existing
    );
    state.items[id] = merged;
    await save();
    logAudit(auditLog, 'asset.migration_restored_from_rejected', merged, actor, 'ok', {
      previousPatientId,
      newPatientId: pId,
      previousStatus: 'REJECTED',
      newStatus: merged.status,
      reason: reason || null,
    });
    return { ...merged };
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
  /** Minimal list for Kunder segment enrichment (server-side only). */
  function listItemsForEnrichment(tenantId = null) {
    let all = Object.values(state.items);
    const tid = normalizeText(tenantId);
    if (tid) {
      all = all.filter((a) => !a.tenantId || a.tenantId === tid);
    }
    return all;
  }

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
    // ORD-43 — thumbnail-täckning (observerbar backfill-progress)
    const IMG_MIMES = new Set([
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif',
      'image/webp',
      'image/gif',
    ]);
    let imageAssetCount = 0;
    let imageWithStorageKeyCount = 0;
    let imageWithThumbnailCount = 0;
    let imageWithoutThumbnailCount = 0;
    let heicAssetCount = 0;
    let heicWithThumbnailCount = 0;
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
      // ORD-43 — bild/thumbnail/HEIC-räkning
      const mime = String(a.mimeType || '').toLowerCase();
      const isImg = IMG_MIMES.has(mime) || String(a.category || '').startsWith('photo_');
      if (isImg) {
        imageAssetCount += 1;
        const hasKey = !!a.storageKey && a.storageKey !== 'pending-no-binary';
        if (hasKey) imageWithStorageKeyCount += 1;
        if (a.thumbnailKey) imageWithThumbnailCount += 1;
        else if (hasKey) imageWithoutThumbnailCount += 1;
        if (mime === 'image/heic' || mime === 'image/heif') {
          heicAssetCount += 1;
          if (a.thumbnailKey) heicWithThumbnailCount += 1;
        }
      }
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
      // ORD-43 — thumbnail-täckning
      imageAssetCount,
      imageWithStorageKeyCount,
      imageWithThumbnailCount,
      imageWithoutThumbnailCount,
      heicAssetCount,
      heicWithThumbnailCount,
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
        message: 'Tom store — pipeline har aldrig körts. Sanity check OK men inte cutover-bevis.',
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
    beginBatch,
    checkpointBatch,
    flushBatch,
    addAsset,
    transitionStatus,
    updateAssetStatus,
    listAssetsForPatient,
    listAssetsForEncounter,
    getAsset,
    markAsLinkOnlyBlocker,
    markAsVisibleOnPatientCard,
    reassignToPatient,
    updateAssetCategory,
    updateAssetThumbnailKey,
    patchAssetForReview,
    patchAssetNamingMetadata,
    attachImportedBinary,
    reattachGhostVisibleBlobFromSibling,
    recoverGhostVisibleBlobFromDriveSource,
    recordChecksumVerified,
    linkAssetToPatient,
    linkAssetToEncounter,
    softDeleteAsset,
    restoreRejectedAndLinkPatient,
    hardDeleteAsset,
    listItemsForEnrichment,
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
