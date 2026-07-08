'use strict';

/**
 * ccoAssetImportPipeline.js — P0.D av CCO Document & Media Import Pipeline.
 *
 * Orkestrerar 13-stegs-import per asset enligt
 * `.cursor/rules/cco-no-drive-links-import-only.mdc`:
 *
 *   1. Discover       — från source (old_cco / drive / meridiq)
 *   2. Download       — kopiera binär till secure storage
 *   3. Checksum       — SHA-256 (vid putObject)
 *   4. Verify         — re-read + jämför checksum
 *   5. Classify       — mime + filnamn → category
 *   6. Link patient   — heuristik via patient-folder / pnr-match / exif
 *   7. Link encounter — datum-match mot journal-store
 *   8. Index          — patient_assets-record
 *   9. Audit-log      — asset.imported
 *  10. Show           — markera VISIBLE_ON_PATIENT_CARD
 *  11. Timeline       — emit timeline-event på patient
 *  12. Provenance     — bevara originalDriveFileId/Path som metadata
 *  13. Review queue   — osäkra → NEEDS_REVIEW (aldrig auto-merge)
 *
 * Confidence-tröskel:
 *   - >= 0.8 (high)   → auto-link OK
 *   - 0.5–0.8 (medium) → auto-link MED audit-flag
 *   - < 0.5 (low)     → till review-queue, ingen patientId
 *
 * Compliance:
 *   - Bara IDs i audit (no PII)
 *   - Original aldrig raderad
 *   - Auto-merge förbjuden — osäkra till review queue
 *   - storageKey anonymiserar patient (hash i path)
 */

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

const { buildCaptureDateAudit } = require('./ccoAssetCaptureDateAudit');

const HIGH_CONFIDENCE = 0.8;
const MEDIUM_CONFIDENCE = 0.5;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp']);
const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/gif',
]);

const PNR_PATTERNS = [
  /\b(\d{8})[- ]?(\d{4})\b/g, // 19800101-1234, 198001011234
  /\b(\d{6})[- ]?(\d{4})\b/g, // 800101-1234
];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lowerExt(fileName) {
  return path.extname(normalizeText(fileName)).toLowerCase();
}

function pickConfidenceLabel(score) {
  if (score >= HIGH_CONFIDENCE) return 'high';
  if (score >= MEDIUM_CONFIDENCE) return 'medium';
  return 'low';
}

function safeAudit(auditLog, event) {
  if (!auditLog || typeof auditLog.append !== 'function') return;
  try {
    auditLog.append(event);
  } catch {
    /* never break flow */
  }
}

function resolveCaptureDateFields({ sourceRecord = {}, storageKey = '', storageRoot = '' } = {}) {
  const audit = buildCaptureDateAudit({
    asset: {
      storageKey,
      mimeType: sourceRecord.mimeType,
      originalFileName: sourceRecord.originalFileName,
      documentDate: sourceRecord.documentDate,
      originalDrivePath: sourceRecord.originalDrivePath,
    },
    sourceRecord,
    storageRoot,
  });
  if (!audit.captureDate && !audit.captureDateTime) return {};
  return {
    ...audit,
    captureDateAuditAt: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------------
// Classifier (pure)
// -----------------------------------------------------------------------------

function classify({ mimeType = null, fileName = null, sourceFolder = null } = {}) {
  const ext = lowerExt(fileName);
  const name = normalizeText(fileName).toLowerCase();
  const folder = normalizeText(sourceFolder).toLowerCase();
  const mime = normalizeText(mimeType).toLowerCase();

  // PDF-grenarna
  if (ext === '.pdf' || mime === 'application/pdf') {
    if (/aisia/i.test(name)) return { category: 'aisia_report', confidence: 'high' };
    if (/samtycke|consent/i.test(name)) return { category: 'consent', confidence: 'high' };
    if (/avtal|agreement|kontrakt/i.test(name))
      return { category: 'agreement', confidence: 'high' };
    if (/h[aä]lsodekl|fitness|friskf[oö]rs[aä]kran|frisk/i.test(name))
      return { category: 'form', confidence: 'high' };
    if (/journal|anteckning|status|behandling/i.test(name))
      return { category: 'journal', confidence: 'high' };
    // PDF utan tydligt kategori-ord — fall back på "other" med low conf.
    return { category: 'other', confidence: 'low' };
  }

  // Bild-grenarna
  if (IMAGE_EXTS.has(ext) || mime.startsWith('image/')) {
    if (/f[oö]re|before|innan/i.test(name))
      return { category: 'photo_before', confidence: 'medium' };
    if (/efter|after/i.test(name)) return { category: 'photo_after', confidence: 'medium' };
    if (/under|during|op[\W_]|operation/i.test(name))
      return { category: 'photo_during', confidence: 'medium' };
    // sourceFolder med datum / år-mönster → trolig op-foto-katalog
    if (
      /\b\d{4}\b/.test(folder) &&
      /\b(0?[1-9]|1[0-2])\b|jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec/i.test(folder)
    ) {
      return { category: 'photo_during', confidence: 'low' };
    }
    return { category: 'photo_during', confidence: 'low' };
  }

  return { category: 'other', confidence: 'low' };
}

function isPhotoCategory(category) {
  return category === 'photo_before' || category === 'photo_during' || category === 'photo_after';
}

function isImageMime(mimeType = '') {
  return IMAGE_MIMES.has(normalizeText(mimeType).toLowerCase());
}

// -----------------------------------------------------------------------------
// linkPatient
// -----------------------------------------------------------------------------

function extractPnrCandidates(text) {
  const raw = normalizeText(text);
  if (!raw) return [];
  const found = new Set();
  for (const re of PNR_PATTERNS) {
    re.lastIndex = 0;
    let m;

    while ((m = re.exec(raw)) !== null) {
      const yyyymmdd = m[1];
      const last4 = m[2];
      // Bygg båda variants (med + utan sekel)
      if (yyyymmdd.length === 8) {
        found.add(`${yyyymmdd}-${last4}`);
        found.add(`${yyyymmdd.slice(2)}-${last4}`);
      } else {
        found.add(`${yyyymmdd}-${last4}`);
      }
    }
  }
  return [...found];
}

/**
 * @param {object} customerStore  Förväntat interface (alla optional):
 *   - findByPersonnummer(pnr) → { id, ... } | null
 *   - findByName(name) → [{ id, ... }]
 *   - getById(id) → { id, ... } | null
 *   - all() → [{ id, name, personnummer? }]
 */
function linkPatient({
  sourceRecord = {},
  tenantId = null,
  drivePath = null,
  fileName = null,
  customerStore = null,
} = {}) {
  // 1) Explicit patientId i sourceRecord (gamla CCO mapping eller eget meta)
  const directId =
    normalizeText(sourceRecord?.patientId) || normalizeText(sourceRecord?.ccoPatientId);
  if (directId) {
    return {
      patientId: directId,
      confidence: 'high',
      score: 0.95,
      basis: 'old_cco_mapping',
    };
  }

  // 2) Pnr-pattern i filename eller drivePath
  const pnrCandidates = [...extractPnrCandidates(fileName), ...extractPnrCandidates(drivePath)];
  if (pnrCandidates.length && customerStore?.findByPersonnummer) {
    for (const pnr of pnrCandidates) {
      try {
        const hit = customerStore.findByPersonnummer(pnr, tenantId);
        if (hit && hit.id) {
          return {
            patientId: hit.id,
            confidence: 'high',
            score: 0.9,
            basis: 'filename_pnr_match',
          };
        }
      } catch {
        /* ignore — försök nästa */
      }
    }
  }

  // 3) Patient-namn-mapp i drivePath → grep customerStore.all()
  if (drivePath && customerStore?.all) {
    try {
      const all = customerStore.all(tenantId) || [];
      const pathLower = String(drivePath).toLowerCase();
      const matches = [];
      for (const c of all) {
        const name = normalizeText(c?.name || c?.fullName);
        if (!name) continue;
        const tokens = name
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 2);
        if (tokens.length >= 2 && tokens.every((t) => pathLower.includes(t))) {
          matches.push(c);
        }
      }
      if (matches.length === 1) {
        return {
          patientId: matches[0].id,
          confidence: 'medium',
          score: 0.65,
          basis: 'drive_folder_owner',
        };
      }
      if (matches.length > 1) {
        return {
          patientId: null,
          confidence: 'low',
          score: 0.3,
          basis: 'ambiguous_folder_match',
          candidates: matches.map((m) => m.id),
        };
      }
    } catch {
      /* ignore */
    }
  }

  // 4) Default: ingen match → review
  return {
    patientId: null,
    confidence: 'low',
    score: 0,
    basis: 'none',
  };
}

// -----------------------------------------------------------------------------
// linkEncounter
// -----------------------------------------------------------------------------

function linkEncounter({
  patientId = null,
  documentDate = null,
  category = null,
  tenantId = null,
  journalStore = null,
} = {}) {
  if (!patientId || !documentDate || !journalStore) return null;
  let entries = [];
  try {
    if (typeof journalStore.listForPatientOnDate === 'function') {
      entries = journalStore.listForPatientOnDate(patientId, documentDate, tenantId) || [];
    } else if (typeof journalStore.listForPatient === 'function') {
      const all = journalStore.listForPatient(patientId, tenantId) || [];
      const day = String(documentDate).slice(0, 10);
      entries = all.filter((e) => String(e?.encounterDate || e?.date || '').slice(0, 10) === day);
    }
  } catch {
    return null;
  }
  if (entries.length === 1) {
    return {
      encounterId: entries[0].id || entries[0].encounterId || null,
      confidence: 'high',
      score: 0.9,
    };
  }
  if (entries.length > 1) {
    // Multi-match: ta första som best-effort med medium confidence
    return {
      encounterId: entries[0].id || entries[0].encounterId || null,
      confidence: 'medium',
      score: 0.6,
      ambiguous: true,
      candidates: entries.length,
    };
  }
  return null;
}

function sourceRecordEncounterLink(sourceRecord = {}, patientId = null) {
  const encounterId = normalizeText(sourceRecord.encounterId);
  if (!encounterId || !normalizeText(patientId)) return null;
  return {
    encounterId,
    confidence: normalizeText(sourceRecord.encounterConfidence) || 'high',
    score: 0.95,
    basis: 'source_record',
    encounterType: normalizeText(sourceRecord.encounterType) || null,
    visitLabel: normalizeText(sourceRecord.visitLabel) || null,
  };
}

// -----------------------------------------------------------------------------
// Discovery (stubs som kan injekteras / utvidgas)
// -----------------------------------------------------------------------------

async function defaultDiscoverFromDrive({ driveClient, limit = 0 } = {}) {
  if (!driveClient) return [];
  // Pipeline tillåter att projektets driveClient injectas. För default har vi
  // ingen scan-anrop här — den hanteras av scripts/migration/scanGoogleDriveApi.
  // Returnera tom lista; integration ligger i bonus-scriptet.
  return [];
}

async function loadOldCcoIndex(indexPath) {
  if (!indexPath) return null;
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Pipeline factory
// -----------------------------------------------------------------------------

function createCcoAssetImportPipeline({
  assetStore,
  importRunStore,
  reviewQueueStore,
  storage,
  customerStore = null,
  journalStore = null,
  auditLog = null,
  driveClient = null,
  oldCcoIndexPath = null,
  // P0.I: Old-CCO-adapter (optional). Om injekterad, används istället
  // för den legacy `oldCcoIndexPath`-vägen i discoverFromOldCco().
  // Se src/ops/ccoOldCcoAssetAdapter.js.
  oldCcoAdapter = null,
} = {}) {
  if (!assetStore) throw new Error('assetStore krävs');
  if (!importRunStore) throw new Error('importRunStore krävs');
  if (!reviewQueueStore) throw new Error('reviewQueueStore krävs');
  if (!storage) throw new Error('storage krävs (ccoSecureStorageProvider)');

  /**
   * OWNER-SKÄRPNING #5 — kanonisk LINK_ONLY_BLOCKER-skapning.
   *
   * Används både för "no body" och "loadBody failed" + Drive-provenance.
   * Inkrementerar totalLinkOnlyBlockers + emit
   * `asset.link_only_blocker_flagged` audit-event så det syns direkt
   * i audit-loggen utan att joinas mot status_changed-historiken.
   */
  async function makeLinkOnlyBlockerAsset({
    sourceSystem,
    sourceRecord,
    importRunId,
    actor,
    reason,
  }) {
    await importRunStore.incrementCounter(importRunId, 'totalLinkOnlyBlockers', 1);
    const linkOnlyAsset = await assetStore.addAsset(
      {
        patientId: sourceRecord.patientId || 'unknown',
        encounterId: sourceRecord.encounterId || null,
        sourceSystem,
        sourceRecordId: sourceRecord.sourceRecordId || null,
        originalDriveFileId: sourceRecord.originalDriveFileId || null,
        originalDrivePath: sourceRecord.originalDrivePath || null,
        originalFileName: sourceRecord.originalFileName || null,
        storageProvider: storage.provider || 'local',
        storageKey: 'pending-no-binary',
        mimeType: sourceRecord.mimeType || 'application/octet-stream',
        category: 'other',
        documentDate: sourceRecord.documentDate || null,
        importRunId,
        status: 'LINK_ONLY_BLOCKER',
        treatmentType: sourceRecord.treatmentType || null,
        encounterType: sourceRecord.encounterType || null,
        sessionNumber: sourceRecord.sessionNumber || null,
        visitLabel: sourceRecord.visitLabel || null,
      },
      { actor }
    );
    safeAudit(auditLog, {
      action: 'asset.link_only_blocker_flagged',
      actor: { role: actor?.role || 'system', userId: actor?.userId || null },
      target: { kind: 'patient_asset', id: linkOnlyAsset.id, tenantId: actor?.tenantId || null },
      result: 'ok',
      detail: {
        reason: reason || 'no_binary',
        sourceSystem,
        hasDriveProvenance: !!(sourceRecord.originalDriveFileId || sourceRecord.originalDrivePath),
        originalDriveFileId: sourceRecord.originalDriveFileId || null,
        importRunId,
      },
    });
    return { ok: false, status: 'LINK_ONLY_BLOCKER', asset: linkOnlyAsset };
  }

  async function discoverFromDrive({ tenantId = null, runId = null, limit = 0 } = {}) {
    void tenantId;
    void runId;
    return defaultDiscoverFromDrive({ driveClient, limit });
  }

  async function discoverFromOldCco({ tenantId = null, runId = null, limit = 0 } = {}) {
    void runId;
    // P0.I: föredra adapter om injekterad (kanonisk väg framåt).
    if (oldCcoAdapter && typeof oldCcoAdapter.discover === 'function') {
      return oldCcoAdapter.discover({ tenantId: tenantId || undefined, limit });
    }
    const index = await loadOldCcoIndex(oldCcoIndexPath);
    if (!index) return [];
    // index-strukturen är `{patientId: {files: []}}`-aktig (per coupler) —
    // vi mappar till generiska source-records.
    const out = [];
    const root = index.profilesByPersonnummer || index.profiles || index;
    if (root && typeof root === 'object') {
      for (const [pnr, profile] of Object.entries(root)) {
        const files = (profile && profile.files) || [];
        for (const f of files) {
          out.push({
            sourceSystem: 'old_cco',
            sourceRecordId: f.id || f.fileId || `${pnr}:${f.path || f.name || ''}`,
            patientId: f.ccoPatientId || profile.ccoPatientId || null,
            originalDriveFileId: f.driveFileId || f.id || null,
            originalDrivePath: f.path || null,
            originalFileName: f.name || f.fileName || null,
            mimeType: f.mimeType || null,
            documentDate: f.modifiedTime || f.createdTime || null,
            // Old-CCO har sällan binär — placeholder buffer skapas av caller
            // om denna verkligen ska importeras.
          });
          if (limit && out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  async function discoverFromMeridiq({ tenantId = null, runId = null, limit = 0 } = {}) {
    void tenantId;
    void runId;
    void limit;
    // Meridiq-export tas typiskt från CSV/SQL-dump i scripts/migration.
    // Här lämnar vi en stub som kan injektas senare.
    return [];
  }

  /**
   * 13-stegs-import av EN asset. Returnerar persisterat asset-record.
   *
   * @param {object} opts
   * @param {string} opts.sourceSystem
   * @param {object} opts.sourceRecord
   *   Förväntade fält:
   *     - sourceRecordId, originalDriveFileId, originalDrivePath,
   *       originalFileName, mimeType, documentDate, patientId? (om känd),
   *       body (Buffer/string) ELLER body-loader (function async → Buffer).
   * @param {string} opts.importRunId
   * @param {string} opts.tenantId
   */
  async function importSingleAsset({
    sourceSystem,
    sourceRecord = {},
    importRunId,
    tenantId = null,
    actor = { role: 'system', userId: null, tenantId: null },
  } = {}) {
    if (!sourceSystem) throw new Error('sourceSystem krävs');
    if (!importRunId) throw new Error('importRunId krävs');

    // Steg 1: Discover (redan gjort av caller — vi har sourceRecord)
    await importRunStore.incrementCounter(importRunId, 'totalDiscovered', 1);

    // OWNER-SKÄRPNING #6 (P0.D+++) — folder-only record-guard.
    // Adapter (P0.I+) flaggar `_folderOnly: true` när en source-record är
    // ren provenance (predicted folder, inga filbinärer). Pipelinen MÅSTE
    // hantera detta som LINK_ONLY_BLOCKER innan vi ens försöker loadBody —
    // en predicted folder kan ALDRIG bli verified.
    if (sourceRecord._folderOnly) {
      return makeLinkOnlyBlockerAsset({
        sourceSystem,
        sourceRecord,
        importRunId,
        actor,
        reason: 'folder_only_no_binary',
      });
    }

    // OWNER-SKÄRPNING #5: Drive-provenance utan binär = automatisk LINK_ONLY_BLOCKER.
    // En source-record med originalDriveFileId/Path är en "Drive-länk" — om
    // pipelinen inte kan ladda binären (saknad body, saknad loadBody, eller
    // loadBody-fel) får assetet INTE marknadsföras som "importerad" — det är
    // en blocker som måste fixas innan cutover.
    const hasDriveProvenance = !!(
      sourceRecord.originalDriveFileId || sourceRecord.originalDrivePath
    );
    let bodyBuffer = sourceRecord.body || null;
    if (!bodyBuffer && typeof sourceRecord.loadBody === 'function') {
      try {
        bodyBuffer = await sourceRecord.loadBody();
      } catch (err) {
        // loadBody-fel + Drive-provenance → LINK_ONLY_BLOCKER (inte FAILED_IMPORT)
        if (hasDriveProvenance) {
          return makeLinkOnlyBlockerAsset({
            sourceSystem,
            sourceRecord,
            importRunId,
            actor,
            reason: `loadBody failed: ${err.message}`,
          });
        }
        await importRunStore.incrementCounter(importRunId, 'totalFailed', 1);
        return {
          ok: false,
          status: 'FAILED_IMPORT',
          error: `loadBody failed: ${err.message}`,
        };
      }
    }
    if (!bodyBuffer) {
      return makeLinkOnlyBlockerAsset({
        sourceSystem,
        sourceRecord,
        importRunId,
        actor,
        reason: 'no_binary_body',
      });
    }

    // Steg 2 + 3: Download + Checksum (putObject)
    let putResult;
    try {
      putResult = await storage.putObject({
        body: bodyBuffer,
        contentType: sourceRecord.mimeType || null,
        metadata: {
          patientId: sourceRecord.patientId || 'unknown',
          originalFileName: sourceRecord.originalFileName || null,
          documentDate: sourceRecord.documentDate || null,
          importedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      await importRunStore.incrementCounter(importRunId, 'totalFailed', 1);
      return {
        ok: false,
        status: 'FAILED_IMPORT',
        error: `storage.putObject failed: ${err.message}`,
      };
    }

    // Steg 12: Provenance preservation (originalDriveFileId / originalDrivePath)
    // — säkras genom att vi alltid passar dessa in i addAsset.

    // Duplicate detection — om checksum redan finns i storage → mark DUPLICATE
    if (putResult.deduped) {
      const duplicateClassification = classify({
        mimeType: sourceRecord.mimeType,
        fileName: sourceRecord.originalFileName,
        sourceFolder: sourceRecord.originalDrivePath,
      });
      let thumbnailKey = null;
      if (
        typeof storage.generateThumbnailIfImage === 'function' &&
        (isImageMime(sourceRecord.mimeType) || isPhotoCategory(duplicateClassification.category))
      ) {
        thumbnailKey = await storage.generateThumbnailIfImage(
          putResult.storageKey,
          sourceRecord.mimeType
        );
      }
      const dupAsset = await assetStore.addAsset(
        {
          patientId: sourceRecord.patientId || 'unknown',
          encounterId: sourceRecord.encounterId || null,
          sourceSystem,
          sourceRecordId: sourceRecord.sourceRecordId || null,
          originalDriveFileId: sourceRecord.originalDriveFileId || null,
          originalDrivePath: sourceRecord.originalDrivePath || null,
          originalFileName: sourceRecord.originalFileName || null,
          storageProvider: storage.provider || 'local',
          storageKey: putResult.storageKey,
          thumbnailKey,
          checksum: putResult.checksum,
          fileSize: putResult.size,
          mimeType: sourceRecord.mimeType || null,
          category: duplicateClassification.category,
          documentDate: sourceRecord.documentDate || null,
          importRunId,
          status: 'DUPLICATE',
          treatmentType: sourceRecord.treatmentType || null,
          encounterType: sourceRecord.encounterType || null,
          sessionNumber: sourceRecord.sessionNumber || null,
          visitLabel: sourceRecord.visitLabel || null,
        },
        { actor }
      );
      return { ok: true, status: 'DUPLICATE', asset: dupAsset };
    }

    // Steg 4: Verify (re-read + jämför checksum)
    let verified = false;
    try {
      const reread = await storage.getObject(putResult.storageKey);
      verified = reread.checksum === putResult.checksum;
    } catch {
      verified = false;
    }
    if (!verified) {
      await importRunStore.incrementCounter(importRunId, 'totalFailed', 1);
      return {
        ok: false,
        status: 'FAILED_IMPORT',
        error: 'checksum verification failed after putObject',
      };
    }

    // Steg 5: Classify
    const classification = classify({
      mimeType: sourceRecord.mimeType,
      fileName: sourceRecord.originalFileName,
      sourceFolder: sourceRecord.originalDrivePath,
    });

    let thumbnailKey = null;
    if (
      typeof storage.generateThumbnailIfImage === 'function' &&
      (isImageMime(sourceRecord.mimeType) || isPhotoCategory(classification.category))
    ) {
      thumbnailKey = await storage.generateThumbnailIfImage(
        putResult.storageKey,
        sourceRecord.mimeType
      );
    }

    // Steg 6: Link patient
    const patientLink = linkPatient({
      sourceRecord,
      tenantId,
      drivePath: sourceRecord.originalDrivePath,
      fileName: sourceRecord.originalFileName,
      customerStore,
    });

    // Steg 7: Link encounter
    const encounterLink = patientLink.patientId
      ? sourceRecordEncounterLink(sourceRecord, patientLink.patientId) ||
        linkEncounter({
          patientId: patientLink.patientId,
          documentDate: sourceRecord.documentDate,
          category: classification.category,
          tenantId,
          journalStore,
        })
      : null;

    // Combined confidence-score (worst-of patient + classification proxy)
    const patientScore = Number(patientLink.score || 0);
    // OWNER-SKÄRPNING #6 (P0.D+++): adapter-flaggat `_needsPatientReview`
    // tvingar review även om vi har binär — patient kunde inte valideras
    // mot CCO master. Detta är load-bearing: en fil kan ALDRIG bli
    // VERIFIED_IN_CCO utan en master-validerad patientId.
    const adapterRequestedReview = sourceRecord._needsPatientReview === true;
    // Asset-store/Drive-internalize skickar redan validerad patientId — låg
    // klassificeringsconfidence (t.ex. foto i datummapp) ska inte tvinga review.
    const trustedPatientFromSource =
      patientLink.basis === 'old_cco_mapping' &&
      patientLink.confidence === 'high' &&
      Boolean(patientLink.patientId);
    const needsReview =
      adapterRequestedReview ||
      !patientLink.patientId ||
      (!trustedPatientFromSource && patientScore < MEDIUM_CONFIDENCE) ||
      (!trustedPatientFromSource && classification.confidence === 'low');
    // Initial-status: assets börjar alltid på DISCOVERED och vandrar via
    // transitionStatus per state-machine. NEEDS_REVIEW är en giltig direkt
    // DISCOVERED-target (se docs/schema/cco-patient-assets.schema.md §2).
    const initialStatus = needsReview ? 'NEEDS_REVIEW' : 'DISCOVERED';

    const captureFields = resolveCaptureDateFields({
      sourceRecord,
      storageKey: putResult.storageKey,
      storageRoot: storage.rootPath || '',
    });

    // Steg 8 + 12: Index (patient_assets-record m. provenance)
    const asset = await assetStore.addAsset(
      {
        patientId: patientLink.patientId || 'unknown',
        encounterId: encounterLink?.encounterId || null,
        sourceSystem,
        sourceRecordId: sourceRecord.sourceRecordId || null,
        originalDriveFileId: sourceRecord.originalDriveFileId || null,
        originalDrivePath: sourceRecord.originalDrivePath || null,
        originalFileName: sourceRecord.originalFileName || null,
        storageProvider: storage.provider || 'local',
        storageKey: putResult.storageKey,
        thumbnailKey,
        checksum: putResult.checksum,
        fileSize: putResult.size,
        mimeType: sourceRecord.mimeType || null,
        category: classification.category,
        documentDate: sourceRecord.documentDate || null,
        importRunId,
        importedBy: actor?.userId || 'system',
        confidence: patientLink.confidence,
        status: initialStatus,
        auditRequired: needsReview,
        isJournalRelevant: classification.category === 'journal',
        treatmentType: sourceRecord.treatmentType || null,
        encounterType: sourceRecord.encounterType || encounterLink?.encounterType || null,
        sessionNumber: sourceRecord.sessionNumber || null,
        visitLabel: sourceRecord.visitLabel || null,
        ...captureFields,
      },
      { actor }
    );

    // För success-path: walka via state-machine
    //   DISCOVERED -> IMPORTING -> IMPORTED_TO_CCO -> VERIFIED_IN_CCO
    // genom transitionStatus så guards triggas och audit-eventen följer
    // schema §2.
    let finalStatus = initialStatus;
    if (!needsReview) {
      await assetStore.transitionStatus(asset.id, 'IMPORTING', {
        actor,
        reason: 'pipeline_step_2_download',
      });
      await assetStore.transitionStatus(asset.id, 'IMPORTED_TO_CCO', {
        actor,
        reason: 'pipeline_step_3_checksum_persisted',
      });
      await assetStore.transitionStatus(asset.id, 'VERIFIED_IN_CCO', {
        actor,
        reason: 'pipeline_step_4_verify_ok',
      });
      finalStatus = 'VERIFIED_IN_CCO';
    }

    // Steg 9: Audit-log — addAsset emit:ar 'asset.imported' via assetStore.
    // Extra audit för patient/encounter-länkning:
    safeAudit(auditLog, {
      action: 'asset.linked_to_patient',
      actor: { role: actor?.role || 'system', userId: actor?.userId || null },
      target: { kind: 'patient_asset', id: asset.id, tenantId },
      result: 'ok',
      detail: {
        patientId: asset.patientId,
        confidence: asset.confidence,
        basis: patientLink.basis,
        score: patientScore,
      },
    });
    if (encounterLink) {
      safeAudit(auditLog, {
        action: 'asset.linked_to_encounter',
        actor: { role: actor?.role || 'system', userId: actor?.userId || null },
        target: { kind: 'patient_asset', id: asset.id, tenantId },
        result: 'ok',
        detail: {
          encounterId: encounterLink.encounterId,
          confidence: encounterLink.confidence,
        },
      });
    }

    // Steg 13: Review queue om needsReview
    if (needsReview) {
      let reason;
      if (adapterRequestedReview && !patientLink.patientId) {
        // OS#6: adapter kunde inte översätta rawPatientId mot CCO master
        const validation = sourceRecord._patientValidation || {};
        reason =
          validation.reason === 'no_customer_store_configured'
            ? 'patient_id_translation_failed'
            : 'no_patient_match';
      } else if (!patientLink.patientId) {
        reason =
          patientLink.basis === 'ambiguous_folder_match' ? 'ambiguous_patient' : 'no_patient_match';
      } else {
        reason = 'low_confidence';
      }
      await reviewQueueStore.enqueue(
        {
          assetId: asset.id,
          reason,
          suggestedPatientId: patientLink.patientId || null,
          confidence: patientLink.confidence || 'low',
        },
        { actor }
      );
      await importRunStore.incrementCounter(importRunId, 'totalNeedsReview', 1);
    } else {
      await importRunStore.incrementCounter(importRunId, 'totalImported', 1);
      // Steg 10 — VISIBLE_ON_PATIENT_CARD via guarded markAsVisibleOnPatientCard
      // (kräver storageKey + checksum + fileSize + mimeType + patientId +
      // status === VERIFIED_IN_CCO). Pipeline har redan ställt VERIFIED ovan
      // för success-path, så detta är guard-säkrat.
      if (patientLink.confidence === 'high') {
        try {
          await assetStore.markAsVisibleOnPatientCard(asset.id, { actor });
          finalStatus = 'VISIBLE_ON_PATIENT_CARD';
        } catch (err) {
          // Guard-fail loggas via auditLog men breaker inte pipeline-flödet.
          safeAudit(auditLog, {
            action: 'asset.visible_guard_failed',
            actor: { role: actor?.role || 'system', userId: actor?.userId || null },
            target: { kind: 'patient_asset', id: asset.id, tenantId },
            result: 'fail',
            detail: { missing: err.missing || [], message: err.message },
          });
        }
      }
      await importRunStore.incrementCounter(importRunId, 'totalVerified', 1);
    }

    // Steg 11: Timeline — emit best-effort om hook finns
    if (auditLog && typeof auditLog.appendTimelineEvent === 'function') {
      try {
        auditLog.appendTimelineEvent({
          patientId: asset.patientId,
          kind: 'asset_imported',
          assetId: asset.id,
          category: asset.category,
          ts: asset.importedAt,
        });
      } catch {
        /* never break flow */
      }
    }

    return {
      ok: true,
      status: finalStatus,
      asset: assetStore.getAsset(asset.id),
      patientLink,
      encounterLink,
      classification,
    };
  }

  /**
   * Kör en hel import-omgång. Skapar run, discover:ar, importerar varje,
   * stänger run.
   */
  async function fullImportRun({
    tenantId = null,
    sourceSystem,
    mode = 'incremental',
    createdBy = 'system',
    actor = { role: 'system', userId: createdBy, tenantId },
    limit = 0,
  } = {}) {
    const runId = await importRunStore.startRun({ sourceSystem, mode, createdBy }, { actor });

    let records = [];
    if (sourceSystem === 'drive') {
      records = await discoverFromDrive({ tenantId, runId, limit });
    } else if (sourceSystem === 'old_cco') {
      records = await discoverFromOldCco({ tenantId, runId, limit });
    } else if (sourceSystem === 'meridiq') {
      records = await discoverFromMeridiq({ tenantId, runId, limit });
    }

    const results = [];
    for (const rec of records) {
      try {
        const r = await importSingleAsset({
          sourceSystem,
          sourceRecord: rec,
          importRunId: runId,
          tenantId,
          actor,
        });
        results.push(r);
      } catch (err) {
        await importRunStore.incrementCounter(runId, 'totalFailed', 1);
        results.push({ ok: false, status: 'FAILED_IMPORT', error: err.message });
      }
    }

    const finished = await importRunStore.finishRun(runId, { actor });
    return { runId, run: finished, results };
  }

  return {
    discoverFromDrive,
    discoverFromOldCco,
    discoverFromMeridiq,
    importSingleAsset,
    classify,
    linkPatient,
    linkEncounter,
    fullImportRun,
    // exposed for testing
    _constants: { HIGH_CONFIDENCE, MEDIUM_CONFIDENCE },
  };
}

module.exports = {
  createCcoAssetImportPipeline,
  classify,
  isPhotoCategory,
  linkPatient,
  linkEncounter,
  extractPnrCandidates,
  pickConfidenceLabel,
  HIGH_CONFIDENCE,
  MEDIUM_CONFIDENCE,
};
