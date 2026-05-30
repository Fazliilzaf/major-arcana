'use strict';

/**
 * ccoOldCcoAssetAdapter.js — P0.I av CCO Document & Media Import Pipeline.
 *
 * Adapter som läser gamla CCO mappings / file-records och producerar
 * source-records som kan matas till `ccoAssetImportPipeline.importSingleAsset`.
 *
 * Primär källa enligt cursor-regel `cco-no-drive-links-import-only.mdc`:
 *   "Gamla CCO ska användas som primär återanvändningskälla där import/
 *    mapping redan finns."
 *
 * Gamla CCO-källor (per docs/strategy/OLD-CCO-FILE-WORK-INVENTORY-2026-05-30.md):
 *   - data/cco-master-card-drive-coupling.json  — {customerId → predictedFolderId}
 *     (genererad av src/ops/ccoDriveFolderCoupler.js)
 *   - data/cco-journal-photo-store.json         — metadata-store för foton
 *   - data/cco-migration-index.json             — migration-index (om finns)
 *   - src/lib/googleDriveClient.js              — Drive-fetch (kräver SA)
 *   - scripts/migration/lib/googleDriveApi.js   — lågnivå Drive-API
 *
 * Output:
 *   Lista av source-records i shape som
 *   `ccoAssetImportPipeline.importSingleAsset()` förstår:
 *     {
 *       sourceSystem: 'old_cco',
 *       sourceRecordId: <gamla CCO id>,
 *       patientId:     <om känd från mapping>,
 *       originalDriveFileId: <om finns>,
 *       originalDrivePath:   <om finns>,
 *       originalFileName:    <om finns>,
 *       mimeType:            <från fil-metadata, fallback 'application/octet-stream'>,
 *       documentDate:        <från mapping eller fil-modified>,
 *       loadBody:            async () => Buffer | null,   // null = LINK_ONLY_BLOCKER
 *     }
 *
 * Compliance:
 *   - Inga patientnamn / pnr / email — bara opaque IDs och path-strings.
 *   - Om driveClient saknas (no service-account) → loadBody returnerar null,
 *     vilket pipeline tolkar som LINK_ONLY_BLOCKER (aldrig som "klar").
 *   - Hard rule från owner-spec: en patientfil får ALDRIG räknas som
 *     "klar" utan storageKey + checksum. Adaptern är konsekvent med detta.
 */

const fs = require('node:fs');

function loadJsonSafe(p, defaultVal = null) {
  if (!p || !fs.existsSync(p)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return defaultVal;
  }
}

/**
 * Helper: läs både legacy- och modernt couplings-shape.
 *
 * Modern coupler (ccoDriveFolderCoupler) skriver:
 *   { results: { <customerId>: { predictedFolderId, predictedFolderPath, ... } } }
 *
 * Äldre versioner / manuell tolerans:
 *   { couplings: { <customerId>: { driveFolderId, drivePath } } }
 *
 * Eller direkt: { <customerId>: { ... } }
 */
function extractCouplings(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (raw.results && typeof raw.results === 'object') return raw.results;
  if (raw.couplings && typeof raw.couplings === 'object') return raw.couplings;
  // Tolerera direkt id→record om varken results eller couplings finns
  // (filtrera ut metadata-fält som generatedAt/tenantId/stats för säkerhet).
  const META_KEYS = new Set([
    'generatedAt',
    'tenantId',
    'totalPatients',
    'stats',
    'sourceBreakdown',
    'schemaVersion',
  ]);
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (META_KEYS.has(k)) continue;
    if (v && typeof v === 'object') out[k] = v;
  }
  return out;
}

function pickFolderId(coupling) {
  if (!coupling || typeof coupling !== 'object') return null;
  return (
    coupling.driveFolderId ||
    coupling.predictedFolderId ||
    coupling.folderId ||
    null
  );
}

function pickFolderPath(coupling, fallback = null) {
  if (!coupling || typeof coupling !== 'object') return fallback;
  return (
    coupling.predictedFolderPath ||
    coupling.drivePath ||
    coupling.folderPath ||
    fallback
  );
}

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Skapa en adapter-instans.
 *
 * @param {object} opts
 * @param {string} [opts.masterCardCouplingPath]  data/cco-master-card-drive-coupling.json
 * @param {string} [opts.journalPhotoStorePath]   data/cco-journal-photo-store.json (reserverad)
 * @param {string} [opts.migrationIndexPath]      data/cco-migration-index.json (reserverad)
 * @param {object} [opts.driveClient]             { listFilesInFolder, streamFile? }
 * @param {object} [opts.customerStore]           reserverad för patient-existens-check
 */
function createCcoOldCcoAssetAdapter({
  masterCardCouplingPath = null,
  journalPhotoStorePath = null,
  migrationIndexPath = null,
  driveClient = null,
  customerStore = null,
} = {}) {
  // Använd parametrarna så lintern inte klagar; reserverade för framtida wire-up.
  void journalPhotoStorePath;
  void migrationIndexPath;
  void customerStore;

  /**
   * Discover: returnera lista av source-records klara för pipeline-import.
   *
   * Implementation per cursor-regel cco-no-drive-links-import-only.mdc:
   *   1. Läs master-card-drive-coupling: patientId → driveFolderId
   *   2. Om driveClient finns: list filer i varje folder, bygg ett
   *      source-record per fil
   *   3. Bygg source-records med loadBody-closure som streamar via
   *      driveClient.streamFile när pipelinen kallar
   *   4. Om driveClient saknas / fel: returnera link-only-records
   *      (loadBody = null → pipeline sätter LINK_ONLY_BLOCKER)
   *
   * @param {object} opts
   * @param {string} [opts.tenantId='hair_tp']
   * @param {number} [opts.limit=0]  0 = inget tak
   * @returns {Promise<Array<sourceRecord>>}
   */
  async function discover({ tenantId = 'hair_tp', limit = 0 } = {}) {
    void tenantId;
    const raw = loadJsonSafe(masterCardCouplingPath, null);
    if (!raw) return [];
    const couplings = extractCouplings(raw);

    const records = [];
    let count = 0;

    for (const [patientId, coupling] of Object.entries(couplings)) {
      if (limit > 0 && count >= limit) break;
      const folderId = pickFolderId(coupling);
      if (!folderId) continue;
      const folderPath = pickFolderPath(coupling, folderId);

      if (driveClient && typeof driveClient.listFilesInFolder === 'function') {
        // Vi har en Drive-klient — försök lista filer i mappen
        let files = [];
        try {
          files = (await driveClient.listFilesInFolder(folderId)) || [];
        } catch (err) {
          // Drive-fel: registrera EN link-only-blocker per folder så att
          // pipelinen kan visa "denna patient har Drive-mapp men vi kunde
          // inte läsa innehållet".
          records.push({
            sourceSystem: 'old_cco',
            sourceRecordId: `drive-folder-${folderId}`,
            patientId,
            originalDriveFileId: folderId,
            originalDrivePath: folderPath,
            originalFileName: null,
            mimeType: null,
            documentDate: null,
            loadBody: async () => null,
            _driveError: err && err.message ? err.message : String(err),
          });
          count += 1;
          continue;
        }

        for (const f of files) {
          if (limit > 0 && count >= limit) break;
          records.push({
            sourceSystem: 'old_cco',
            sourceRecordId: f.id,
            patientId,
            originalDriveFileId: f.id,
            originalDrivePath: folderPath,
            originalFileName: f.name || null,
            mimeType: f.mimeType || 'application/octet-stream',
            documentDate: f.modifiedTime || f.createdTime || null,
            loadBody: async () => {
              if (!driveClient || typeof driveClient.streamFile !== 'function') {
                return null;
              }
              try {
                const stream = await driveClient.streamFile(f.id);
                if (!stream) return null;
                return streamToBuffer(stream);
              } catch {
                return null;
              }
            },
          });
          count += 1;
        }
      } else {
        // Ingen driveClient → bara provenance, blir LINK_ONLY_BLOCKER när
        // pipelinen kallar (loadBody returnerar null + originalDriveFileId
        // finns = pipelinens guard).
        records.push({
          sourceSystem: 'old_cco',
          sourceRecordId: `no-sa-${folderId}`,
          patientId,
          originalDriveFileId: folderId,
          originalDrivePath: folderPath,
          originalFileName: null,
          mimeType: null,
          documentDate: null,
          loadBody: async () => null,
        });
        count += 1;
      }
    }

    return records;
  }

  /**
   * Snabb statistik för readiness-rapport och dashboards. Counts only,
   * ingen PII.
   */
  function stats() {
    const raw = loadJsonSafe(masterCardCouplingPath, null);
    const couplings = raw ? extractCouplings(raw) : {};
    let withFolderId = 0;
    for (const c of Object.values(couplings)) {
      if (pickFolderId(c)) withFolderId += 1;
    }
    return {
      sourceType: 'old_cco',
      totalCouplings: Object.keys(couplings).length,
      withFolderId,
      driveClientAvailable: !!(
        driveClient && typeof driveClient.listFilesInFolder === 'function'
      ),
      masterCardCouplingPath: masterCardCouplingPath || null,
    };
  }

  return { discover, stats };
}

module.exports = {
  createCcoOldCcoAssetAdapter,
  // exposed for unit-tests
  _internal: { extractCouplings, pickFolderId, pickFolderPath, streamToBuffer },
};
