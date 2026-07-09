const express = require('express');
const path = require('node:path');
const fsp = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const {
  contentTypeForPath,
  openZipEntryStream,
  resolveZipPath,
} = require('../../scripts/migration/lib/migrationZipReader');
const {
  isGoogleDriveConfigured,
  getConfiguredDriveAccessToken,
  getDriveFileMetadata,
  streamDriveFileToResponse,
  getDriveFileName,
  loadServiceAccountFromEnv,
} = require('../lib/googleDriveClient');
const {
  getAccessToken,
  openDriveFileReadStream,
} = require('../../scripts/migration/lib/googleDriveApi');
const { createCcoAssetImportPipeline } = require('../ops/ccoAssetImportPipeline');
const {
  collectDriveRowsForInternalization,
  internalizeDriveAssets,
  previewInternalizeCandidates,
  PILOT_STRONG_DOCUMENT_DATE_SOURCES,
} = require('../ops/ccoDriveAssetInternalization');
const {
  diagnoseGhostVisibleAssets,
  summarizeChecksumInventoryCoverage,
} = require('../ops/ccoGhostVisibleAssetDiagnosis');
const {
  startInternalizeJob,
  getInternalizeJobState,
  isInternalizeJobRunning,
} = require('../ops/ccoDriveInternalizeAsyncJob');
const {
  buildOccasionTimeline,
  extractFileOccasionContext,
} = require('../../scripts/migration/lib/migrationUtils');
const {
  buildCommercialPaymentReadout,
  buildPatientPaymentHistory,
} = require('../ops/ccoPatientPaymentHistory');
const {
  resolvePilotConfig,
  applyNativeJournalFilesForPilot,
  pilotSummary,
} = require('../ops/ccoDriveJournalNativePilot');
const {
  applyBookingToReadout,
  getBookingSignals,
  loadKunderBookingIndex,
} = require('../ops/ccoKunderBookingEnrichment');
const {
  buildActiveVisitPayload,
  resolveScheduledTodayBooking,
  resolveTodayEncounter,
} = require('../ops/ccoActiveVisit');
const {
  enrichPatientCardPreTreatmentForms,
  loadAssetSignalsIndex,
} = require('../ops/ccoKunderEnrichment');
const {
  applyFasAReadoutFields,
  loadFasAContextForPatients,
} = require('../ops/ccoKunderFasAReadiness');
const { enrichJournalEntriesWithMetadata } = require('../ops/ccoJournalMetadataEnrichment');
const { assetToPatientFile, resolvePatientAssetIds } = require('../ops/ccoPatientAssetIdentity');
const { gateMigrationIndexFiles } = require('../ops/ccoPatientMasterMigrationIndexGate');
const { buildVisitSegments } = require('../ops/ccoPatientVisitSegments');
const { hydratePatientHealthProjection } = require('../ops/ccoPatientMasterStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIncludeDriveFiles(value) {
  const normalized = String(value ?? '1')
    .trim()
    .toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

function parseDryRun(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  return defaultValue;
}

function parseAsyncCommit(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off', 'sync'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on', 'async'].includes(normalized)) return true;
  return defaultValue;
}

function clampBatchSize(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function clampOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function clampInternalizeLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function clampPreviewLimit(value, fallback = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function parseExcludeUnknownMonth(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  return defaultValue;
}

function parseAllowedDocumentDateSources(value, requireDocumentDateSource = false) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  if (parseExcludeUnknownMonth(requireDocumentDateSource, false)) {
    return [...PILOT_STRONG_DOCUMENT_DATE_SOURCES];
  }
  return null;
}

function parseInternalizeDateGateOptions(body = {}) {
  const hasDateGate =
    body.allowedDocumentDateSources !== undefined ||
    body.requireDocumentDateSource !== undefined ||
    body.excludeUnknownMonth !== undefined;
  if (!hasDateGate) {
    return {
      active: false,
      excludeUnknownMonth: false,
      requireDocumentDateSource: false,
      allowedDocumentDateSources: null,
    };
  }
  const requireDocumentDateSource = parseExcludeUnknownMonth(body.requireDocumentDateSource, true);
  return {
    active: true,
    excludeUnknownMonth: parseExcludeUnknownMonth(body.excludeUnknownMonth, true),
    requireDocumentDateSource,
    allowedDocumentDateSources: parseAllowedDocumentDateSources(
      body.allowedDocumentDateSources,
      requireDocumentDateSource
    ),
  };
}

async function responseToBuffer(response) {
  if (typeof response?.arrayBuffer === 'function') {
    return Buffer.from(await response.arrayBuffer());
  }
  const chunks = [];
  for await (const chunk of response.body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function createDriveInternalizationClientFromEnv() {
  const driveConfig = loadServiceAccountFromEnv();
  if (!driveConfig.ok) {
    const error = new Error('Google Drive service account saknas på servern.');
    error.statusCode = 503;
    throw error;
  }
  let token = '';
  let tokenFetchedAt = 0;
  async function accessToken() {
    if (token && Date.now() - tokenFetchedAt < 50 * 60 * 1000) return token;
    token = await getAccessToken(driveConfig.serviceAccount);
    tokenFetchedAt = Date.now();
    return token;
  }
  return {
    serviceAccountEmail: driveConfig.serviceAccountEmail,
    async getFileMetadata(driveFileId) {
      const result = await getDriveFileMetadata({
        driveFileId,
        fields: 'id,name,mimeType,size,modifiedTime,createdTime',
        accessToken: await accessToken(),
      });
      if (!result.ok) {
        const error = new Error(result.error || 'Drive metadata misslyckades.');
        error.statusCode = result.status || 502;
        throw error;
      }
      return result.metadata;
    },
    async downloadBuffer(driveFileId) {
      const response = await openDriveFileReadStream({
        accessToken: await accessToken(),
        driveFileId,
      });
      return responseToBuffer(response);
    },
  };
}

async function loadPatientMasterStateFromConfig(config = {}) {
  const filePath = normalizeText(config.ccoPatientMasterStorePath);
  if (!filePath) return null;
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function redactInternalizeReport(report = {}) {
  const safe = { ...report };
  if (Array.isArray(safe.remainingRows)) {
    safe.remaining = { count: safe.remainingRows.length, rowsRedacted: true };
    delete safe.remainingRows;
  }
  return safe;
}

async function prepareInternalizeExecution({
  actor,
  dryRun,
  limit,
  offset,
  dateGate = null,
  resolveAssetStores,
  resolvePatientAssetStore,
  loadPatientMasterState,
  config,
  createDriveInternalizationClient,
  customerStore,
  journalStore,
  req,
} = {}) {
  const stores = typeof resolveAssetStores === 'function' ? await resolveAssetStores() : {};
  const assetStore =
    stores.assetStore ||
    (typeof resolvePatientAssetStore === 'function' ? await resolvePatientAssetStore() : null);
  const storage = stores.secureStorage || stores.storage || null;
  if (!assetStore) {
    const error = new Error('Asset store saknas på servern.');
    error.statusCode = 503;
    throw error;
  }
  if (!dryRun && (!stores.importRunStore || !stores.reviewQueueStore || !storage)) {
    const error = new Error('Import-run store, review queue och secure storage krävs för commit.');
    error.statusCode = 503;
    throw error;
  }

  const patientMasterState =
    typeof loadPatientMasterState === 'function'
      ? await loadPatientMasterState({ tenantId: actor.tenantId })
      : await loadPatientMasterStateFromConfig(config);
  const { rows, rowSources } = await collectDriveRowsForInternalization({
    patientMasterState,
    assetStore,
    storage,
    tenantId: actor.tenantId,
  });

  const driveClient = dryRun
    ? null
    : await (typeof createDriveInternalizationClient === 'function'
        ? createDriveInternalizationClient({ actor, req })
        : createDriveInternalizationClientFromEnv());
  const pipeline = dryRun
    ? null
    : createCcoAssetImportPipeline({
        assetStore,
        importRunStore: stores.importRunStore,
        reviewQueueStore: stores.reviewQueueStore,
        storage,
        customerStore,
        journalStore,
      });
  const importActor = {
    role: actor.role || ROLE_OWNER,
    userId: actor.userId || 'cco-patient-master-internalize-endpoint',
    tenantId: actor.tenantId,
  };

  return {
    rows,
    rowSources,
    assetStore,
    storage,
    driveClient,
    pipeline,
    importRunStore: stores.importRunStore,
    reviewQueueStore: stores.reviewQueueStore,
    importActor,
    internalizeParams: {
      rows,
      assetStore,
      importRunStore: stores.importRunStore,
      reviewQueueStore: stores.reviewQueueStore,
      pipeline,
      storage,
      driveClient,
      dryRun,
      go: !dryRun,
      limit,
      offset,
      sampleSize: 5,
      driveThrottleMs: 75,
      tenantId: actor.tenantId,
      actor: importActor,
      dateGateActive: Boolean(dateGate?.active),
      excludeUnknownMonth: dateGate?.excludeUnknownMonth ?? true,
      requireDocumentDateSource: dateGate?.requireDocumentDateSource ?? false,
      allowedDocumentDateSources: dateGate?.allowedDocumentDateSources ?? null,
    },
  };
}

async function auditInternalizeOutcome({
  authStore,
  actor,
  dryRun,
  limit,
  offset,
  rowsCollected,
  rowSources,
  safeReport,
  asyncMode = false,
  jobError = null,
} = {}) {
  await authStore.addAuditEvent({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: 'cco.patient_master.assets_internalize',
    outcome: jobError ? 'error' : 'success',
    targetType: 'cco_patient_assets',
    targetId: dryRun ? 'dry_run' : safeReport?.runId || (asyncMode ? 'async_commit' : 'commit'),
    metadata: {
      dryRun,
      asyncMode,
      limit,
      offset,
      rowsCollected,
      rowSources,
      stats: safeReport?.stats || {},
      lastError: jobError || null,
    },
  });
}

function resolveStoredFileName(file) {
  return normalizeText(file?.fileName || file?.relativePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isTodayIso(value) {
  return normalizeText(value).slice(0, 10) === isoToday();
}

function isPreviewableImageMime(mime) {
  return [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/tiff',
    'image/x-adobe-dng',
  ].includes(normalizeText(mime).toLowerCase());
}

function inferImageMime(buffer, fallback = '') {
  if (Buffer.isBuffer(buffer)) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return 'image/png';
    if (buffer.slice(0, 12).toString('ascii').startsWith('RIFF')) return 'image/webp';
    if (buffer.slice(4, 12).toString('ascii').includes('ftyp')) return 'image/heic';
  }
  return normalizeText(fallback).toLowerCase();
}

async function bufferFromNodeStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readDriveFileBuffer(driveFileId) {
  const { accessToken } = await getConfiguredDriveAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    driveFileId
  )}?alt=media&supportsAllDrives=true`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const error = new Error(`Drive media misslyckades (${response.status}).`);
    error.statusCode = Number(response.status) === 404 ? 404 : 502;
    throw error;
  }
  return Buffer.from(await response.arrayBuffer());
}

async function readMigrationFileBuffer({ file, config }) {
  if (file.source === 'folder' && file.folderRoot) {
    return fsp.readFile(path.join(file.folderRoot, file.relativePath));
  }

  if (normalizeText(file.driveFileId) && isGoogleDriveConfigured()) {
    try {
      return await readDriveFileBuffer(file.driveFileId);
    } catch (error) {
      if (!file.zipName) throw error;
    }
  }

  const zipPath = resolveZipPath(config.migrationDataRoot, file.zipName);
  const child = openZipEntryStream({ zipPath, relativePath: file.relativePath });
  const stderrChunks = [];
  child.stderr?.on('data', (chunk) => stderrChunks.push(chunk));
  const exitCodePromise = new Promise((resolve, reject) => {
    child.once('close', resolve);
    child.once('error', reject);
  });
  const buffer = await bufferFromNodeStream(child.stdout);
  const exitCode = await exitCodePromise;
  if (Number(exitCode) !== 0) {
    const error = new Error(
      stderrChunks.length
        ? Buffer.concat(stderrChunks).toString('utf8').trim()
        : 'Kunde inte läsa filen från zip.'
    );
    error.statusCode = 404;
    throw error;
  }
  return buffer;
}

async function resolveRepairScopeFiles({
  scope,
  patientMasterStore,
  migrationIndexStore,
  tenantId,
  patientId = '',
  personnummer = '',
}) {
  const normalizedScope = normalizeText(scope).toLowerCase() || 'patient';
  if (normalizedScope === 'all') {
    return { files: migrationIndexStore.listAllFiles(), scope: 'all' };
  }
  if (normalizedScope !== 'patient') {
    const error = new Error('scope måste vara "patient" eller "all".');
    error.statusCode = 400;
    throw error;
  }

  let pnr = normalizeText(personnummer);
  if (!pnr && patientId) {
    const patient = await patientMasterStore.getPatient({ tenantId, patientId });
    if (!patient) {
      const error = new Error('Patienten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    pnr = normalizeText(patient.personnummer);
  }
  if (!pnr) {
    const error = new Error('patientId eller personnummer krävs för scope=patient.');
    error.statusCode = 400;
    throw error;
  }
  const files = await migrationIndexStore.getFilesForPersonnummer(pnr);
  return { files, scope: 'patient', personnummer: pnr };
}

async function repairFilenamesBatch({
  files,
  dryRun = true,
  batchSize = 50,
  startOffset = 0,
  driveDelayMs = 75,
  env = process.env,
}) {
  const eligible = asArray(files).filter((file) => normalizeText(file?.driveFileId));
  const skippedNoDriveId = asArray(files).length - eligible.length;
  const offset = clampOffset(startOffset);
  const limit = clampBatchSize(batchSize);
  const slice = eligible.slice(offset, offset + limit);
  const items = [];
  const applyDeltas = [];
  let changed = 0;
  let unchanged = 0;
  let driveErrors = 0;

  for (let index = 0; index < slice.length; index += 1) {
    const file = slice[index];
    const oldName = resolveStoredFileName(file);
    const driveFileId = normalizeText(file.driveFileId);
    if (index > 0 && driveDelayMs > 0) {
      await sleep(driveDelayMs);
    }
    const driveResult = await getDriveFileName({
      driveFileId,
      env,
      delayMs: 0,
    });
    if (!driveResult.ok) {
      driveErrors += 1;
      items.push({
        id: file.id,
        driveFileId,
        old: oldName,
        new: oldName,
        changed: false,
        error: driveResult.error || 'Drive metadata misslyckades.',
        status: driveResult.status || null,
      });
      continue;
    }
    const newName = normalizeText(driveResult.name);
    const nameChanged = Boolean(newName) && newName !== oldName;
    if (nameChanged) changed += 1;
    else unchanged += 1;
    if (nameChanged && !dryRun) {
      applyDeltas.push({ fileId: file.id, name: newName });
    }
    items.push({
      id: file.id,
      driveFileId,
      old: oldName,
      new: newName || oldName,
      changed: nameChanged,
      error: null,
      status: driveResult.status || null,
    });
  }

  return {
    items,
    applyDeltas,
    summary: {
      changed,
      unchanged,
      skippedNoDriveId,
      driveErrors,
    },
    pagination: {
      batchSize: limit,
      startOffset: offset,
      processed: slice.length,
      totalEligible: eligible.length,
      nextOffset: offset + slice.length < eligible.length ? offset + slice.length : null,
      hasMore: offset + slice.length < eligible.length,
    },
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isImageLikeFile(file) {
  const mime = normalizeText(file?.mimeType || file?.contentType).toLowerCase();
  const type = normalizeText(file?.fileType).toLowerCase();
  const name = normalizeText(file?.fileName || file?.originalFileName || file?.name).toLowerCase();
  return (
    type === 'image' || mime.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/.test(name)
  );
}

function createCcoPatientMasterRouter({
  patientMasterStore,
  customerStore = null,
  journalStore = null,
  treatmentEncounterStore = null,
  migrationIndexStore = null,
  patientSystemStore = null,
  documentInstanceStore = null,
  buildPatientDocumentBundle = null,
  readCache = null,
  resolvePatientAssetStore = null,
  resolveAssetStores = null,
  createDriveInternalizationClient = null,
  loadPatientMasterState = null,
  mailIngestionStore = null,
  swishStore = null,
  commercialStore = null,
  fortnoxInvoiceLister = null,
  fortnoxStore = null,
  authStore,
  config,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  async function auditRead(req, actor, targetId, action) {
    await authStore.addAuditEvent({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      outcome: 'success',
      targetType: 'cco_patient_master',
      targetId: targetId || actor.tenantId,
    });
  }

  async function handle(req, res, run) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      return await run(actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res
          .status(statusCode)
          .json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hantera patientmaster.' });
    }
  }

  router.get(
    '/cco-patient-master/stats',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const cacheKey = readCache ? readCache.buildKey('patient-stats', actor.tenantId) : '';
        const load = async () => patientMasterStore.getTenantStats({ tenantId: actor.tenantId });
        const stats =
          readCache && cacheKey
            ? (await readCache.wrap(cacheKey, 60_000, load)).value
            : await load();
        await auditRead(req, actor, actor.tenantId, 'cco.patient_master.stats.read');
        return res.json({ stats });
      })
  );

  router.get(
    '/cco-patient-master/patients',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      // Diagnostic: localize where slow (>1.5s) list responses spend their time.
      // Only logs slow requests, so fast/cached calls stay silent. See PR for the
      // 9.4s prod list-latency investigation.
      const requestStart = process.hrtime.bigint();
      const timing = { loadMs: 0, auditMs: 0, cardMs: 0, rows: 0, cached: false };
      const elapsedMs = (from) => Number(process.hrtime.bigint() - from) / 1e6;
      res.on('finish', () => {
        const totalMs = elapsedMs(requestStart);
        if (totalMs > 1500) {
          console.warn(
            `[patient-list-timing] total=${totalMs.toFixed(0)}ms ` +
              `load=${timing.loadMs.toFixed(0)}ms audit=${timing.auditMs.toFixed(0)}ms ` +
              `card=${timing.cardMs.toFixed(0)}ms rows=${timing.rows} cached=${timing.cached}`
          );
        }
      });
      return handle(req, res, async (actor) => {
        const query = normalizeText(req.query.q || req.query.query);
        const flags = String(req.query.flags || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        const limit = req.query.limit;
        const offset = req.query.offset;
        const cacheKey = readCache
          ? readCache.buildKey(
              'patient-list',
              actor.tenantId,
              JSON.stringify({ query, flags, limit, offset })
            )
          : '';
        const load = async () =>
          patientMasterStore.listPatients({
            tenantId: actor.tenantId,
            query,
            flags,
            limit,
            offset,
          });
        const loadStart = process.hrtime.bigint();
        let result;
        if (readCache && cacheKey) {
          const wrapped = await readCache.wrap(cacheKey, 30_000, load);
          result = wrapped.value;
          timing.cached = Boolean(wrapped.cacheHit);
        } else {
          result = await load();
        }
        timing.loadMs = elapsedMs(loadStart);
        timing.rows = Number(result.total) || 0;

        const auditStart = process.hrtime.bigint();
        await auditRead(req, actor, actor.tenantId, 'cco.patient_master.list.read');
        timing.auditMs = elapsedMs(auditStart);

        const cardStart = process.hrtime.bigint();
        const patients = result.patients.map((patient) =>
          patientMasterStore.buildPatientCardReadout(patient)
        );
        timing.cardMs = elapsedMs(cardStart);

        return res.json({ ...result, patients });
      });
    }
  );

  async function buildPatientPayload(
    actor,
    patient,
    { includeJournal = true, includeDriveFiles = true } = {}
  ) {
    let card = patientMasterStore.buildPatientCardReadout(patient);
    let bookingContext = {
      upcomingBookings: [],
      historyBookings: [],
      coverage: 'missing',
      sources: {},
    };
    try {
      const bookingIndex = await loadKunderBookingIndex(config, actor.tenantId, [patient]);
      const signals = getBookingSignals(bookingIndex.index, patient.id);
      card = applyBookingToReadout(card, signals);
      bookingContext = {
        upcomingBookings: signals.upcomingBookings || [],
        historyBookings: signals.historyBookings || [],
        coverage: bookingIndex.coverage,
        sources: bookingIndex.sources || {},
      };
    } catch {
      bookingContext = {
        upcomingBookings: [],
        historyBookings: [],
        coverage: 'error',
        sources: {},
      };
    }

    let journalEntries = [];
    if (includeJournal && journalStore) {
      journalEntries = await journalStore.listEntries({
        tenantId: actor.tenantId,
        patientId: patient.id,
      });
    }

    let visitEncounters = [];
    if (treatmentEncounterStore?.listByPatient) {
      visitEncounters = await treatmentEncounterStore.listByPatient({
        tenantId: actor.tenantId,
        patientId: patient.id,
        limit: 20,
      });
    }

    let driveFiles = [];
    if (includeDriveFiles && migrationIndexStore && patient.personnummer) {
      driveFiles = await migrationIndexStore.getFilesForPersonnummer(patient.personnummer);
    }
    const enrichedDriveFiles = driveFiles.map((file) => {
      const occasionContext = extractFileOccasionContext(file);
      return {
        ...file,
        occasionContext,
        viewUrl: `/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(file.id)}`,
      };
    });
    let nativeAssetFiles = [];
    const nativeAssets = [];
    if (includeDriveFiles && typeof resolvePatientAssetStore === 'function') {
      const assetStore = await resolvePatientAssetStore();
      if (assetStore?.listAssetsForPatient) {
        const patientIds = await resolvePatientAssetIds({
          patientId: patient.id,
          patient,
          tenantId: actor.tenantId,
          customerStore,
          assetStore,
        });
        const seen = new Set();
        for (const id of patientIds) {
          const rows = assetStore.listAssetsForPatient(id, {}, { actor: { role: 'system' } }) || [];
          for (const row of rows) {
            if (!row?.id || seen.has(row.id)) continue;
            seen.add(row.id);
            nativeAssets.push(row);
          }
        }
        nativeAssetFiles = nativeAssets
          .filter((asset) => ['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset.status))
          .map(assetToPatientFile);
      }
    }

    const gatedIndex = gateMigrationIndexFiles({
      indexFiles: enrichedDriveFiles,
      nativeAssets,
    });
    const pilotConfig = resolvePilotConfig(config || {});
    let filesForUi = [...nativeAssetFiles, ...gatedIndex.files];
    let nativePilotMeta = null;
    if (pilotConfig.enabled && typeof resolvePatientAssetStore === 'function') {
      const assetStore = await resolvePatientAssetStore();
      if (assetStore) {
        const merged = applyNativeJournalFilesForPilot({
          driveFiles: filesForUi,
          patientId: patient.id,
          assetStore,
          pilotConfig,
        });
        filesForUi = merged.files;
        if (merged.nativeCount > 0 || merged.replacedCount > 0) {
          nativePilotMeta = {
            nativeAssetCount: merged.nativeCount,
            replacedIndexCount: merged.replacedCount,
          };
        }
      }
    }

    const journalReadouts = journalStore
      ? journalEntries.map((entry) => journalStore.buildJournalReadout(entry))
      : [];
    const enrichedJournalReadouts = enrichJournalEntriesWithMetadata({
      journalEntries: journalReadouts,
      bookings: [...bookingContext.upcomingBookings, ...bookingContext.historyBookings],
    });

    try {
      const assetIndex = await loadAssetSignalsIndex(config, actor.tenantId);
      card = enrichPatientCardPreTreatmentForms(card, patient, assetIndex);
    } catch {
      card = enrichPatientCardPreTreatmentForms(card, patient, null);
    }

    try {
      const fasAMap = await loadFasAContextForPatients({
        config,
        tenantId: actor.tenantId,
        patients: [patient],
        patientMasterStore,
      });
      const fasA = fasAMap.get(patient.id);
      if (fasA) {
        card = applyFasAReadoutFields(card, fasA, null);
      }
    } catch {
      /* keep card without Fas A identity fields */
    }

    return {
      patient: hydratePatientHealthProjection(patient),
      card,
      activeVisit: buildActiveVisitPayload({
        card,
        bookingContext,
        journalEntries: enrichedJournalReadouts,
        encounter: resolveTodayEncounter(visitEncounters, {
          scheduledBooking: resolveScheduledTodayBooking(bookingContext),
          cardEncounterId: card.encounterId,
        }),
      }),
      journalEntries: enrichedJournalReadouts,
      driveFiles: filesForUi,
      occasionTimeline: buildOccasionTimeline(filesForUi),
      bookings: {
        upcoming: bookingContext.upcomingBookings,
        history: bookingContext.historyBookings,
        coverage: bookingContext.coverage,
        sources: bookingContext.sources,
      },
      upcomingBookings: bookingContext.upcomingBookings,
      historyBookings: bookingContext.historyBookings,
      driveJournalNativePilot: nativePilotMeta,
      communicationMessages: buildCommunicationMessages(patient),
      ...(await buildPaymentContext(actor, patient)),
    };
  }

  // Per-patient kommunikation ur mail-ingestion-storen (RIKTIGA matchade
  // mejl med snippet/body). Storen är cred-gatad (Graph) — saknas den eller är
  // den tom returneras []. Display-only, ingen write. Ingen fejk.
  function buildCommunicationMessages(patient) {
    if (!mailIngestionStore || typeof mailIngestionStore.listPatientMessages !== 'function') {
      return [];
    }
    let rows = [];
    try {
      rows = mailIngestionStore.listPatientMessages({ patientId: patient.id, limit: 50 }) || [];
    } catch {
      return [];
    }
    return rows
      .map((m) => {
        if (!m) return null;
        const subject = String(m.subject || '').trim();
        const preview = String(m.snippet || (m.bodyText || '').slice(0, 160) || '').trim();
        const folder = String(m.folderType || '').toLowerCase();
        const direction = /sent|outbox|skickat/.test(folder) ? 'out' : 'in';
        return {
          id: m.id || m.rawMessageId || null,
          type: 'mail',
          direction,
          subject: subject || '(utan ämne)',
          from: m.fromAddress || null,
          preview,
          occurredAt: m.receivedAt || m.sortIso || '',
        };
      })
      .filter(Boolean);
  }

  async function buildPaymentContext(actor, patient) {
    const card = patientMasterStore.buildPatientCardReadout(patient);
    const commercialCase = commercialStore?.getPatientRegisterCase
      ? await commercialStore.getPatientRegisterCase({
          tenantId: actor.tenantId,
          patientId: patient.id,
        })
      : null;
    const paymentReadout = buildCommercialPaymentReadout(commercialCase);
    const paymentHistoryResult = await buildPatientPaymentHistory({
      tenantId: actor.tenantId,
      patientId: patient.id,
      patientCard: card,
      swishStore,
      fortnoxInvoiceLister,
      fortnoxStore,
    });
    return {
      commercialCase,
      paymentStatus: paymentReadout.paymentStatus,
      quotedAmount: paymentReadout.quotedAmount,
      depositAmount: paymentReadout.depositAmount,
      paymentHistory: paymentHistoryResult.items,
      paymentHistoryMeta: paymentHistoryResult.meta,
    };
  }

  router.get(
    '/cco/drive-journal-native-pilot/summary',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async () => {
        return res.json(pilotSummary(resolvePilotConfig(config || {})));
      })
  );

  router.get(
    '/cco-patient-master/patient/summary',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId: normalizeText(req.query.patientId),
          personnummer: normalizeText(req.query.personnummer),
        });
        if (!patient) {
          return res.status(404).json({ error: 'Patienten hittades inte.' });
        }
        const includeDriveFiles = parseIncludeDriveFiles(req.query.includeDriveFiles);
        void auditRead(req, actor, patient.id, 'cco.patient_master.patient.summary.read').catch(
          (error) => {
            console.error('[cco.patient_master] audit summary read failed', error);
          }
        );
        const payload = await buildPatientPayload(actor, patient, {
          includeJournal: false,
          includeDriveFiles,
        });
        return res.json(payload);
      })
  );

  router.get(
    '/cco-patient-master/patient/visit-segments',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId: normalizeText(req.query.patientId),
          personnummer: normalizeText(req.query.personnummer),
        });
        if (!patient) {
          return res.status(404).json({ error: 'Patienten hittades inte.' });
        }

        void auditRead(
          req,
          actor,
          patient.id,
          'cco.patient_master.patient.visit_segments.read'
        ).catch((error) => {
          console.error('[cco.patient_master] audit visit-segments read failed', error);
        });

        const payload = await buildPatientPayload(actor, patient, {
          includeJournal: false,
          includeDriveFiles: parseIncludeDriveFiles(req.query.includeDriveFiles),
        });
        const visitPayload = buildVisitSegments({
          customerId: patient.id,
          driveFiles: payload.driveFiles || [],
        });
        return res.json({
          patientId: patient.id,
          ...visitPayload,
        });
      })
  );

  router.get(
    '/cco-patient-master/patient',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId: normalizeText(req.query.patientId),
          personnummer: normalizeText(req.query.personnummer),
        });
        if (!patient) {
          return res.status(404).json({ error: 'Patienten hittades inte.' });
        }

        const includeJournal = !['0', 'false', 'no', 'off'].includes(
          String(req.query.includeJournal ?? '1')
            .trim()
            .toLowerCase()
        );
        const includeDriveFiles = parseIncludeDriveFiles(req.query.includeDriveFiles);

        void auditRead(req, actor, patient.id, 'cco.patient_master.patient.read').catch((error) => {
          console.error('[cco.patient_master] audit read failed', error);
        });

        const payload = await buildPatientPayload(actor, patient, {
          includeJournal,
          includeDriveFiles,
        });
        return res.json(payload);
      })
  );

  async function buildDocumentBundlePayload(actor, patient, { journalEntries = [] } = {}) {
    if (!buildPatientDocumentBundle) {
      return { ready: false, documents: null, error: 'document_bundle_unavailable' };
    }
    const card = patientMasterStore.buildPatientCardReadout(patient);
    const bundle = await buildPatientDocumentBundle({
      tenantId: actor.tenantId,
      patientId: patient.id,
      card,
      journalEntries,
      documentInstanceStore,
    });
    return bundle;
  }

  router.get(
    '/cco-patient-master/patient/document-bundle',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId: normalizeText(req.query.patientId),
          personnummer: normalizeText(req.query.personnummer),
        });
        if (!patient) {
          return res.status(404).json({ error: 'Patienten hittades inte.' });
        }
        let journalEntries = [];
        if (journalStore) {
          journalEntries = await journalStore.listEntries({
            tenantId: actor.tenantId,
            patientId: patient.id,
          });
        }
        const bundle = await buildDocumentBundlePayload(actor, patient, { journalEntries });
        void auditRead(req, actor, patient.id, 'cco.patient_master.document_bundle.read').catch(
          (error) => {
            console.error('[cco.patient_master] audit document bundle read failed', error);
          }
        );
        return res.json({
          patientId: patient.id,
          ...bundle,
        });
      })
  );

  router.get(
    '/cco-patient-master/patient/dossier-bundle',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId: normalizeText(req.query.patientId),
          personnummer: normalizeText(req.query.personnummer),
        });
        if (!patient) {
          return res.status(404).json({ error: 'Patienten hittades inte.' });
        }
        const includeJournal = !['0', 'false', 'no', 'off'].includes(
          String(req.query.includeJournal ?? '1')
            .trim()
            .toLowerCase()
        );
        const payload = await buildPatientPayload(actor, patient, {
          includeJournal,
          includeDriveFiles: true,
        });
        const documentBundle = await buildDocumentBundlePayload(actor, patient, {
          journalEntries: payload.journalEntries,
        });
        void auditRead(req, actor, patient.id, 'cco.patient_master.dossier_bundle.read').catch(
          (error) => {
            console.error('[cco.patient_master] audit dossier bundle read failed', error);
          }
        );
        return res.json({
          patientId: patient.id,
          card: payload.card,
          activeVisit: payload.activeVisit || null,
          journalEntries: payload.journalEntries,
          bookings: payload.bookings,
          upcomingBookings: payload.upcomingBookings || [],
          historyBookings: payload.historyBookings || [],
          commercialCase: payload.commercialCase || null,
          paymentStatus: payload.paymentStatus || null,
          quotedAmount: payload.quotedAmount || null,
          depositAmount: payload.depositAmount || null,
          paymentHistory: payload.paymentHistory || [],
          paymentHistoryMeta: payload.paymentHistoryMeta || null,
          driveFiles: payload.driveFiles || [],
          occasionTimeline: payload.occasionTimeline || [],
          communicationMessages: payload.communicationMessages || [],
          driveJournalNativePilot: payload.driveJournalNativePilot || null,
          ready: true,
          documents: documentBundle.documents,
          documentBundle,
        });
      })
  );

  router.get(
    '/cco-patient-master/file',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const fileId = normalizeText(req.query.fileId);
        if (!fileId || !migrationIndexStore) {
          return res.status(400).json({ error: 'fileId saknas.' });
        }
        const file = await migrationIndexStore.getFileById(fileId);
        if (!file) {
          return res.status(404).json({ error: 'Filen hittades inte i migration-index.' });
        }
        if (file.source === 'folder' && file.folderRoot) {
          const absPath = path.join(file.folderRoot, file.relativePath);
          await auditRead(req, actor, fileId, 'cco.patient_master.file.read');
          res.type(contentTypeForPath(file.relativePath));
          res.setHeader('Cache-Control', 'private, max-age=3600');
          return res.sendFile(absPath);
        }

        if (normalizeText(file.driveFileId) && isGoogleDriveConfigured()) {
          await auditRead(req, actor, fileId, 'cco.patient_master.file.read');
          try {
            await streamDriveFileToResponse({
              driveFileId: file.driveFileId,
              res,
              contentType: contentTypeForPath(file.relativePath),
              fileName: path.basename(file.relativePath),
            });
            return;
          } catch (error) {
            if (!res.headersSent) {
              const status = Number(error?.status) === 404 ? 404 : 502;
              return res.status(status).json({
                error:
                  status === 404
                    ? 'Filen hittades inte i Google Drive.'
                    : 'Kunde inte streama från Drive.',
              });
            }
            return;
          }
        }

        const zipPath = resolveZipPath(config.migrationDataRoot, file.zipName);
        const stream = openZipEntryStream({ zipPath, relativePath: file.relativePath });
        res.setHeader('Content-Type', contentTypeForPath(file.relativePath));
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${path.basename(file.relativePath).replace(/"/g, '')}"`
        );
        void auditRead(req, actor, fileId, 'cco.patient_master.file.read');
        const exitCodePromise = new Promise((resolve, reject) => {
          stream.once('close', resolve);
          stream.once('error', reject);
        });
        try {
          await pipeline(stream.stdout, res);
        } catch (error) {
          if (!res.headersSent) {
            return res.status(500).json({ error: 'Kunde inte streama filen.' });
          }
          return;
        }
        const exitCode = await exitCodePromise;
        if (Number(exitCode) !== 0 && !res.headersSent) {
          if (normalizeText(file.driveFileId) && isGoogleDriveConfigured()) {
            await auditRead(req, actor, fileId, 'cco.patient_master.file.read');
            try {
              await streamDriveFileToResponse({
                driveFileId: file.driveFileId,
                res,
                contentType: contentTypeForPath(file.relativePath),
                fileName: path.basename(file.relativePath),
              });
              return;
            } catch {
              /* fall through */
            }
          }
          return res.status(404).json({ error: 'Kunde inte läsa filen från zip.' });
        }
      })
  );

  router.get(
    '/cco-patient-master/file-preview',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const fileId = normalizeText(req.query.fileId);
        if (!fileId || !migrationIndexStore) {
          return res.status(400).json({ error: 'fileId saknas.' });
        }
        const file = await migrationIndexStore.getFileById(fileId);
        if (!file) {
          return res.status(404).json({ error: 'Filen hittades inte i migration-index.' });
        }

        const declaredMime = contentTypeForPath(file.relativePath);
        if (!isPreviewableImageMime(declaredMime)) {
          return res.status(415).json({ error: 'Filen är inte en bild som kan förhandsvisas.' });
        }

        let sharp;
        try {
          sharp = require('sharp');
        } catch {
          return res.status(503).json({ error: 'Bildförhandsvisning saknar sharp på servern.' });
        }

        const original = await readMigrationFileBuffer({ file, config });
        const mime = inferImageMime(original, declaredMime);
        if (!isPreviewableImageMime(mime)) {
          return res.status(415).json({ error: 'Filen är inte en bild som kan förhandsvisas.' });
        }

        let input = original;
        if (mime === 'image/heic' || mime === 'image/heif') {
          try {
            const { decodeHeicToJpeg } = require('../ops/heicDecodePool');
            input = await decodeHeicToJpeg(original);
          } catch (error) {
            return res.status(415).json({ error: 'Kunde inte avkoda HEIC-bilden.' });
          }
        }

        const width = Math.max(160, Math.min(960, Number(req.query.width) || 480));
        const preview = await sharp(input, { failOn: 'none' })
          .rotate()
          .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 72 })
          .toBuffer();
        await auditRead(req, actor, fileId, 'cco.patient_master.file.preview');
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Length', preview.length);
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.send(preview);
      })
  );

  router.get(
    '/cco-patient-master/review-groups',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const result = await patientMasterStore.listMergeReviewGroups({
          tenantId: actor.tenantId,
          limit: req.query.limit,
        });
        await auditRead(req, actor, actor.tenantId, 'cco.patient_master.review_groups.read');
        return res.json(result);
      })
  );

  router.post(
    '/cco-patient-master/review-groups/dismiss',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const result = await patientMasterStore.dismissMergeReviewGroup({
          tenantId: actor.tenantId,
          groupId: normalizeText(body.groupId),
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.review_groups.dismiss',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: result.groupId,
        });
        return res.json(result);
      })
  );

  router.get(
    '/cco-patient-master/patient/gdpr-export',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.query.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });
        const payload = await patientMasterStore.buildGdprExportPackage({
          tenantId: actor.tenantId,
          patientId,
          journalStore,
          migrationIndexStore,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.gdpr_export',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patientId,
        });
        const fileName = `gdpr-${patientId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(JSON.stringify(payload, null, 2));
      })
  );

  router.put(
    '/cco-patient-master/patient/demographics',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });
        const existing = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!existing) return res.status(404).json({ error: 'Patient hittades inte.' });
        const patient = await patientMasterStore.upsertPatient({
          ...existing,
          tenantId: actor.tenantId,
          id: patientId,
          demographics: body.demographics || {},
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.demographics.update',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patientId,
        });
        return res.json({
          patient: hydratePatientHealthProjection(patient),
          card: patientMasterStore.buildPatientCardReadout(patient),
        });
      })
  );

  router.put(
    '/cco-patient-master/patient/access',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });
        const result = await patientMasterStore.setPatientAccess({
          tenantId: actor.tenantId,
          patientId,
          journalBlocked: Boolean(body.journalBlocked),
          journalBlockReason: normalizeText(body.journalBlockReason),
          actorUserId: actor.userId,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: body.journalBlocked
            ? 'cco.patient_master.journal.block'
            : 'cco.patient_master.journal.unblock',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patientId,
        });
        return res.json(result);
      })
  );

  router.post(
    '/cco-patient-master/merge',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const primaryPatientId = normalizeText(body.primaryPatientId);
        const secondaryPatientIds = Array.isArray(body.secondaryPatientIds)
          ? body.secondaryPatientIds
          : [];
        let journalMoved = 0;
        if (journalStore) {
          for (const secondaryId of secondaryPatientIds) {
            const moved = await journalStore.transferEntriesToPatient({
              tenantId: actor.tenantId,
              fromPatientId: secondaryId,
              toPatientId: primaryPatientId,
              actor,
            });
            journalMoved += Number(moved.moved) || 0;
          }
        }
        const result = await patientMasterStore.mergePatients({
          tenantId: actor.tenantId,
          primaryPatientId,
          secondaryPatientIds,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.patient.merge',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: primaryPatientId,
        });
        return res.json({
          ...result,
          journalMoved,
          card: patientMasterStore.buildPatientCardReadout(result.patient),
        });
      })
  );

  router.put(
    '/cco-patient-master/patient',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patient = await patientMasterStore.upsertPatient({
          ...body,
          tenantId: actor.tenantId,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.patient.write',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patient.id,
        });
        return res.json({
          patient: hydratePatientHealthProjection(patient),
          card: patientMasterStore.buildPatientCardReadout(patient),
        });
      })
  );

  router.post(
    '/cco-patient-master/patient/attendance',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.body?.patientId);
        const status = normalizeText(req.body?.status);
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });
        const actorName =
          normalizeText(req.currentUser?.displayName) ||
          normalizeText(req.currentUser?.email) ||
          'reception';
        const result = await patientMasterStore.setAttendance({
          tenantId: actor.tenantId,
          patientId,
          status,
          actorName,
        });
        if (!result.ok) {
          return res.status(result.error === 'not_found' ? 404 : 400).json({ error: result.error });
        }
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.attendance',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patientId,
          metadata: { status: result.attendance.status },
        });
        return res.json({ ok: true, attendance: result.attendance });
      })
  );

  router.post(
    '/cco-patient-master/drive-attach/bulk-apply',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const deltas = Array.isArray(req.body?.deltas) ? req.body.deltas : [];
        if (!deltas.length) return res.status(400).json({ error: 'deltas krävs.' });
        if (deltas.length > 500) {
          return res.status(400).json({ error: 'Max 500 deltas per anrop.' });
        }
        const confirmText = normalizeText(req.body?.confirmText);
        if (confirmText !== 'APPLY DRIVE ATTACH') {
          return res.status(400).json({ error: 'Bekräfta med confirmText: "APPLY DRIVE ATTACH"' });
        }
        const result = await patientMasterStore.bulkApplyDriveAttachDeltas({
          tenantId: actor.tenantId,
          deltas,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.drive_attach_bulk_apply',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: `${result.updated.length} patienter`,
          metadata: {
            updatedCount: result.updated.length,
            skippedNotFound: result.skippedNotFound,
          },
        });
        return res.json({
          ok: true,
          updatedCount: result.updated.length,
          skippedNotFound: result.skippedNotFound,
          rollback: result.rollback,
        });
      })
  );

  router.post(
    '/cco-patient-master/assets/internalize',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const dryRun = parseDryRun(req.body?.dryRun, true);
        const asyncCommit = !dryRun && parseAsyncCommit(req.body?.async, true);
        const limit = clampInternalizeLimit(req.body?.limit, 50);
        const offset = clampOffset(req.body?.offset);
        const dateGate = parseInternalizeDateGateOptions(req.body);

        if (!dryRun) {
          const confirmText = normalizeText(req.body?.confirmText);
          if (confirmText !== 'INTERNALIZE ASSETS') {
            return res.status(400).json({
              error: 'Bekräfta med confirmText: "INTERNALIZE ASSETS"',
            });
          }
        }

        let prepared;
        try {
          prepared = await prepareInternalizeExecution({
            actor,
            dryRun,
            limit,
            offset,
            dateGate,
            resolveAssetStores,
            resolvePatientAssetStore,
            loadPatientMasterState,
            config,
            createDriveInternalizationClient,
            customerStore,
            journalStore,
            req,
          });
        } catch (error) {
          return res.status(error.statusCode || 500).json({ error: error.message });
        }

        const { rows, rowSources, driveClient, internalizeParams } = prepared;

        if (asyncCommit) {
          const started = startInternalizeJob({
            ...internalizeParams,
            limit,
            offset,
            tenantId: actor.tenantId,
            redactReport: redactInternalizeReport,
            onComplete: async (_state, report) => {
              await auditInternalizeOutcome({
                authStore,
                actor,
                dryRun: false,
                limit,
                offset,
                rowsCollected: rows.length,
                rowSources,
                safeReport: redactInternalizeReport(report),
                asyncMode: true,
              });
            },
            onError: async (error) => {
              await auditInternalizeOutcome({
                authStore,
                actor,
                dryRun: false,
                limit,
                offset,
                rowsCollected: rows.length,
                rowSources,
                safeReport: null,
                asyncMode: true,
                jobError: error?.message || String(error),
              });
            },
          });
          if (started.already) {
            return res.status(409).json({
              ok: false,
              error: 'internalize_job_running',
              state: started.state,
              pollUrl: '/api/v1/cco-patient-master/assets/internalize/job',
            });
          }
          return res.status(202).json({
            ok: true,
            dryRun: false,
            async: true,
            accepted: true,
            limit,
            offset,
            dateGate: dateGate.active
              ? {
                  excludeUnknownMonth: dateGate.excludeUnknownMonth,
                  requireDocumentDateSource: dateGate.requireDocumentDateSource,
                  allowedDocumentDateSources: dateGate.allowedDocumentDateSources,
                }
              : null,
            rowsCollected: rows.length,
            rowSources: { ...rowSources, mergedUnique: rows.length },
            drive: {
              used: true,
              serviceAccountEmail: driveClient?.serviceAccountEmail || null,
            },
            pollUrl: '/api/v1/cco-patient-master/assets/internalize/job',
            state: started.state,
          });
        }

        const report = await internalizeDriveAssets(internalizeParams);
        const safeReport = redactInternalizeReport(report);

        await auditInternalizeOutcome({
          authStore,
          actor,
          dryRun,
          limit,
          offset,
          rowsCollected: rows.length,
          rowSources,
          safeReport,
        });

        return res.json({
          ok: true,
          dryRun,
          async: false,
          limit,
          offset,
          dateGate: dateGate.active
            ? {
                excludeUnknownMonth: dateGate.excludeUnknownMonth,
                requireDocumentDateSource: dateGate.requireDocumentDateSource,
                allowedDocumentDateSources: dateGate.allowedDocumentDateSources,
              }
            : null,
          rowsCollected: rows.length,
          rowSources: { ...rowSources, mergedUnique: rows.length },
          drive: dryRun
            ? { used: false, serviceAccountEmail: null }
            : {
                used: true,
                serviceAccountEmail: driveClient?.serviceAccountEmail || null,
              },
          report: safeReport,
        });
      })
  );

  router.get(
    '/cco-patient-master/assets/internalize/job',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async () => {
        const state = getInternalizeJobState();
        const payload = {
          ok: true,
          zeroWrites: true,
          running: state.running,
          pollUrl: '/api/v1/cco-patient-master/assets/internalize/job',
          state,
        };
        if (state.running) return res.status(200).json(payload);
        if (state.lastError) {
          return res.status(200).json({
            ...payload,
            failed: true,
            error: state.lastError,
          });
        }
        return res.json({
          ...payload,
          completed: Boolean(state.finishedAt),
          report: state.report || null,
        });
      })
  );

  router.post(
    '/cco-patient-master/assets/internalize/runs/:runId/reconcile',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const runId = normalizeText(req.params.runId);
        if (!runId) return res.status(400).json({ error: 'runId saknas.' });
        const stores = typeof resolveAssetStores === 'function' ? await resolveAssetStores() : {};
        const assetStore =
          stores.assetStore ||
          (typeof resolvePatientAssetStore === 'function'
            ? await resolvePatientAssetStore()
            : null);
        if (!stores.importRunStore || !assetStore) {
          return res.status(503).json({ error: 'Import-run store eller asset store saknas.' });
        }
        const importActor = {
          role: actor.role || ROLE_OWNER,
          userId: actor.userId || 'cco-patient-master-internalize-reconcile',
          tenantId: actor.tenantId,
        };
        let run;
        try {
          run = await stores.importRunStore.reconcileFromAssets(runId, assetStore, {
            actor: importActor,
          });
        } catch (error) {
          return res.status(error.statusCode || 500).json({ error: error.message });
        }
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.assets_internalize_reconcile',
          outcome: 'success',
          targetType: 'cco_patient_assets',
          targetId: runId,
          metadata: {
            reconciled: run.reconciled,
            assetCount: run.assetCount,
            finishedAt: run.finishedAt,
          },
        });
        return res.json({ ok: true, runId, run });
      })
  );

  router.post(
    '/cco-patient-master/assets/diagnose-ghost-visible',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const stores = typeof resolveAssetStores === 'function' ? await resolveAssetStores() : {};
        const assetStore =
          stores.assetStore ||
          (typeof resolvePatientAssetStore === 'function'
            ? await resolvePatientAssetStore()
            : null);
        const storage = stores.secureStorage || stores.storage || null;
        if (!assetStore) {
          return res.status(503).json({ error: 'Asset store saknas på servern.' });
        }

        const importRunId = normalizeText(req.body?.importRunId);
        const patientIds = Array.isArray(req.body?.patientIds)
          ? req.body.patientIds.map(normalizeText).filter(Boolean)
          : null;
        const limit = clampPreviewLimit(req.body?.limit, 500);
        const sampleSize = clampPreviewLimit(req.body?.sampleSize, 25);
        const includeInventory = parseExcludeUnknownMonth(
          req.body?.includeInventoryCoverage,
          false
        );

        let report;
        try {
          report = await diagnoseGhostVisibleAssets({
            assetStore,
            storage,
            tenantId: actor.tenantId,
            importRunId: importRunId || null,
            patientIds,
            limit,
            sampleSize,
            maskSamples: true,
          });
        } catch (error) {
          return res.status(error.statusCode || 500).json({ error: error.message });
        }

        if (includeInventory) {
          report.inventoryCoverage = await summarizeChecksumInventoryCoverage({
            assetStore,
            storage,
            tenantId: actor.tenantId,
          });
        }

        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.assets_diagnose_ghost_visible',
          outcome: 'success',
          targetType: 'cco_patient_assets',
          targetId: importRunId || 'all',
          metadata: {
            zeroWrites: true,
            ghostRenderCandidates: report.stats?.ghostRenderCandidates ?? 0,
            withBlobSibling: report.stats?.withBlobSibling ?? 0,
            importRunId: importRunId || null,
          },
        });

        return res.json(report);
      })
  );

  router.post(
    '/cco-patient-master/assets/internalize/preview-candidates',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const limit = clampPreviewLimit(req.body?.limit, 10);
        const offset = clampOffset(req.body?.offset);
        const excludeUnknownMonth = parseExcludeUnknownMonth(req.body?.excludeUnknownMonth, true);
        const requireDocumentDateSource = parseExcludeUnknownMonth(
          req.body?.requireDocumentDateSource,
          true
        );
        const allowedDocumentDateSources = parseAllowedDocumentDateSources(
          req.body?.allowedDocumentDateSources,
          requireDocumentDateSource
        );
        const includePilotWindow = parseExcludeUnknownMonth(req.body?.includePilotWindow, true);
        const pilotWindowSize = clampPreviewLimit(req.body?.pilotWindowSize, 10);
        const maxPilotWindowSkipSamples = clampPreviewLimit(
          req.body?.maxPilotWindowSkipSamples,
          20
        );

        const stores = typeof resolveAssetStores === 'function' ? await resolveAssetStores() : {};
        const assetStore =
          stores.assetStore ||
          (typeof resolvePatientAssetStore === 'function'
            ? await resolvePatientAssetStore()
            : null);
        const storage = stores.secureStorage || stores.storage || null;
        if (!assetStore) {
          return res.status(503).json({ error: 'Asset store saknas på servern.' });
        }

        const patientMasterState =
          typeof loadPatientMasterState === 'function'
            ? await loadPatientMasterState({ tenantId: actor.tenantId })
            : await loadPatientMasterStateFromConfig(config);
        const { rows, rowSources } = await collectDriveRowsForInternalization({
          patientMasterState,
          assetStore,
          storage,
          tenantId: actor.tenantId,
        });

        const preview = await previewInternalizeCandidates({
          rows,
          assetStore,
          storage,
          offset,
          limit,
          excludeUnknownMonth,
          requireDocumentDateSource,
          allowedDocumentDateSources,
          pilotWindowSize,
          includePilotWindow,
          maxPilotWindowSkipSamples,
        });

        return res.json({
          ok: true,
          zeroWrites: true,
          dryRun: true,
          rowsCollected: rows.length,
          rowSources: { ...rowSources, mergedUnique: rows.length },
          preview,
        });
      })
  );

  router.post(
    '/cco-patient-master/repair-filenames',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!migrationIndexStore) {
          return res.status(503).json({ error: 'Migration-index saknas på servern.' });
        }
        if (!isGoogleDriveConfigured()) {
          return res.status(503).json({ error: 'Google Drive API är inte konfigurerad.' });
        }

        const dryRun = parseDryRun(req.body?.dryRun, true);
        const batchSize = clampBatchSize(req.body?.batchSize, 50);
        const startOffset = clampOffset(req.body?.startOffset);
        const scopeInput = normalizeText(req.body?.scope) || 'patient';

        let scopeResult;
        try {
          scopeResult = await resolveRepairScopeFiles({
            scope: scopeInput,
            patientMasterStore,
            migrationIndexStore,
            tenantId: actor.tenantId,
            patientId: normalizeText(req.body?.patientId),
            personnummer: normalizeText(req.body?.personnummer),
          });
        } catch (error) {
          const statusCode = Number(error?.statusCode || 500);
          return res.status(statusCode).json({ error: error.message });
        }

        if (!dryRun) {
          const confirmText = normalizeText(req.body?.confirmText);
          if (confirmText !== 'REPAIR FILENAMES') {
            return res.status(400).json({
              error: 'Bekräfta med confirmText: "REPAIR FILENAMES"',
            });
          }
        }

        const batch = await repairFilenamesBatch({
          files: scopeResult.files,
          dryRun,
          batchSize,
          startOffset,
        });

        let applied = { changed: 0, skipped: 0, rollback: [] };
        if (!dryRun && batch.applyDeltas.length) {
          applied = await migrationIndexStore.bulkUpdateFileNames(batch.applyDeltas);
        }

        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.repair_filenames',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: scopeResult.scope === 'patient' ? scopeResult.personnummer || 'patient' : 'all',
          metadata: {
            scope: scopeResult.scope,
            dryRun,
            batchSize,
            startOffset,
            processed: batch.pagination.processed,
            changed: dryRun ? batch.summary.changed : applied.changed,
            driveErrors: batch.summary.driveErrors,
            skippedNoDriveId: batch.summary.skippedNoDriveId,
          },
        });

        return res.json({
          ok: true,
          dryRun,
          scope: scopeResult.scope,
          personnummer: scopeResult.personnummer || null,
          batchSize,
          startOffset,
          nextOffset: batch.pagination.nextOffset,
          totalEligible: batch.pagination.totalEligible,
          processed: batch.pagination.processed,
          hasMore: batch.pagination.hasMore,
          summary: batch.summary,
          items: batch.items,
          appliedCount: dryRun ? 0 : applied.changed,
          rollback: dryRun ? [] : applied.rollback,
        });
      })
  );

  router.post(
    '/cco-patient-master/stub-patients/hard-delete',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientIds = Array.isArray(req.body?.patientIds) ? req.body.patientIds : [];
        if (!patientIds.length) return res.status(400).json({ error: 'patientIds krävs.' });
        const confirmText = normalizeText(req.body?.confirmText);
        if (confirmText !== 'DELETE STUBS') {
          return res.status(400).json({ error: 'Bekräfta med confirmText: "DELETE STUBS"' });
        }

        // Journal-spärr: patient med journalanteckningar får aldrig hård-raderas.
        const eligible = [];
        const blockedByJournal = [];
        for (const patientId of patientIds) {
          const entries = journalStore?.listEntries
            ? await journalStore.listEntries({ tenantId: actor.tenantId, patientId })
            : [];
          if (Array.isArray(entries) && entries.length) blockedByJournal.push(patientId);
          else eligible.push(patientId);
        }

        const result = await patientMasterStore.hardDeleteStubPatients({
          tenantId: actor.tenantId,
          patientIds: eligible,
        });

        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.stub_hard_delete',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: `${result.removed.length} stubbar`,
          metadata: {
            removed: result.removed,
            skippedNotStub: result.skipped,
            blockedByJournal,
          },
        });

        return res.json({
          ok: true,
          removedCount: result.removed.length,
          removed: result.removed,
          skippedNotStub: result.skipped,
          blockedByJournal,
        });
      })
  );

  router.post(
    '/cco-patient-master/patient/gdpr-anonymize',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.body?.patientId || req.query?.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });
        const confirmText = normalizeText(req.body?.confirmText);
        if (confirmText !== `ANONYMIZE ${patientId}`) {
          return res.status(400).json({
            error: `Bekräfta med confirmText: "ANONYMIZE ${patientId}"`,
          });
        }

        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!patient) return res.status(404).json({ error: 'Patient hittades inte.' });

        const anonymizedData = {
          displayName: '[Anonymiserad]',
          fullName: '[Anonymiserad]',
          firstName: '[Anonymiserad]',
          lastName: '[Anonymiserad]',
          personalNumber: null,
          primaryEmail: null,
          primaryPhone: null,
          address: null,
          notes: null,
          flags: [],
          anonymizedAt: new Date().toISOString(),
          anonymizedBy: actor.userId,
        };

        await patientMasterStore.updatePatient({
          tenantId: actor.tenantId,
          patientId,
          patch: anonymizedData,
          actorUserId: actor.userId,
        });

        if (journalStore?.anonymizePatientEntries) {
          await journalStore.anonymizePatientEntries({ tenantId: actor.tenantId, patientId });
        }

        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.gdpr_anonymize',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patientId,
          metadata: { anonymizedFields: Object.keys(anonymizedData) },
        });

        return res.json({
          ok: true,
          patientId,
          anonymized: true,
          anonymizedAt: anonymizedData.anonymizedAt,
        });
      })
  );

  return router;
}

module.exports = {
  createCcoPatientMasterRouter,
  repairFilenamesBatch,
  resolveRepairScopeFiles,
  parseDryRun,
  redactInternalizeReport,
};
