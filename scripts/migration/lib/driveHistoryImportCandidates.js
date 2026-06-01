'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { classify, linkPatient } = require('../../../src/ops/ccoAssetImportPipeline');
const { loadDriveImportAliasIndex, mergeAliasIntoCcoIndex } = require('./driveImportAliasIndex');
const { parseCsv, buildHeaderMap, mapClientoRow } = require('../../import-cliento-customers');
const { normalizePersonnummer, nameOverlapScore } = require('./migrationUtils');

const DEFAULT_CSV = path.join(
  process.env.HOME,
  'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cliento-customers-2026-05-29.csv'
);

function buildProfilePersonnummerIndex(profilesByPersonnummer, directory) {
  const pnrToCliento = new Map();
  let ambiguous = 0;
  let matched = 0;
  for (const [pnr, profile] of Object.entries(profilesByPersonnummer || {})) {
    const norm = normalizePersonnummer(pnr);
    if (!norm) continue;
    const displayName = profile?.displayName || '';
    if (!displayName || /journal|\.pdf/i.test(displayName)) continue;
    const hits = [];
    for (const [id, rec] of Object.entries(directory)) {
      const score = nameOverlapScore(displayName, rec?.name || rec?.customerName || '');
      if (score >= 0.85) hits.push(id);
    }
    if (hits.length === 1) {
      pnrToCliento.set(norm, hits[0]);
      matched += 1;
    } else if (hits.length > 1) {
      ambiguous += 1;
    }
  }
  return { pnrToCliento, matched, ambiguous };
}

function buildClientoPersonnummerIndex(csvPath, directory) {
  const pnrToCliento = new Map();
  if (!csvPath || !fs.existsSync(csvPath)) return pnrToCliento;
  const { headers, rows } = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const headerMap = buildHeaderMap(headers);
  for (let i = 0; i < rows.length; i += 1) {
    const mapped = mapClientoRow(rows[i], headerMap, i + 2);
    const pnr = normalizePersonnummer(mapped.personnummer);
    if (!pnr || !mapped.name) continue;
    const hits = [];
    for (const [id, rec] of Object.entries(directory)) {
      const score = nameOverlapScore(mapped.name, rec?.name || rec?.customerName || '');
      if (score >= 0.85) hits.push(id);
    }
    if (hits.length === 1) pnrToCliento.set(pnr, hits[0]);
  }
  return pnrToCliento;
}

function buildCustomerStore(directory, pnrMaps) {
  const merged = new Map();
  for (const m of pnrMaps) {
    for (const [pnr, id] of m.entries()) {
      if (!merged.has(pnr)) merged.set(pnr, id);
    }
  }
  const byName = [];
  for (const [id, rec] of Object.entries(directory)) {
    const name = rec?.name || rec?.customerName || '';
    if (name) byName.push({ id, name });
  }
  return {
    findByPersonnummer(pnr) {
      const norm = normalizePersonnummer(pnr);
      if (!norm) return null;
      const clientoId = merged.get(norm);
      if (clientoId && directory[clientoId]) {
        return { id: clientoId, name: directory[clientoId].name };
      }
      return null;
    },
    getById(id) {
      const rec = directory[id];
      return rec ? { id, name: rec.name || '' } : null;
    },
    all() {
      return byName;
    },
  };
}

function loadDriveMappingConfidence(dataDir) {
  const high = new Set();
  const review = new Set();
  for (const [file, set] of [
    [path.join(dataDir, 'cco-patient-drive-mappings.high-confidence.json'), high],
    [path.join(dataDir, 'cco-patient-drive-mappings.review-needed.json'), review],
  ]) {
    if (!fs.existsSync(file)) continue;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const id of Object.keys(raw.mappings || {})) set.add(id);
  }
  return { high, review };
}

function buildCcoContentIndex(assets) {
  const byPatient = new Map();
  const driveIds = new Set();
  const sourceRecordIds = new Set();
  for (const a of Object.values(assets.items || {})) {
    if (a.originalDriveFileId) driveIds.add(a.originalDriveFileId);
    if (a.sourceSystem === 'drive' && a.sourceRecordId) sourceRecordIds.add(a.sourceRecordId);
    if (a.sourceSystem === 'drive_import' && a.sourceRecordId)
      sourceRecordIds.add(a.sourceRecordId);
    if (!a.patientId) continue;
    if (!byPatient.has(a.patientId)) {
      byPatient.set(a.patientId, {
        journal: 0,
        form: 0,
        agreement: 0,
        consent: 0,
        photos: 0,
        halso: 0,
        getaccept: 0,
        visible: 0,
      });
    }
    const row = byPatient.get(a.patientId);
    if (a.status === 'VISIBLE_ON_PATIENT_CARD') row.visible += 1;
    if (a.sourceSystem === 'm365_halso') row.halso += 1;
    if (a.sourceSystem === 'getaccept_import') row.getaccept += 1;
    const cat = a.category || 'other';
    if (cat === 'journal') row.journal += 1;
    else if (cat === 'form') row.form += 1;
    else if (cat === 'agreement') row.agreement += 1;
    else if (cat === 'consent') row.consent += 1;
    else if (String(cat).startsWith('photo_')) row.photos += 1;
  }
  return { byPatient, driveIds, sourceRecordIds };
}

function buildPatientCategoryIndex(assets) {
  const byPatient = new Map();
  for (const a of Object.values(assets.items || {})) {
    if (!a.patientId) continue;
    const key = a.patientId;
    if (!byPatient.has(key)) {
      byPatient.set(key, {
        journal: 0,
        form: 0,
        agreement: 0,
        photos: 0,
        other: 0,
        visible: 0,
        driveIds: new Set(),
      });
    }
    const row = byPatient.get(key);
    if (a.originalDriveFileId) row.driveIds.add(a.originalDriveFileId);
    if (a.status === 'VISIBLE_ON_PATIENT_CARD') row.visible += 1;
    const cat = a.category || 'other';
    if (cat === 'journal') row.journal += 1;
    else if (cat === 'form') row.form += 1;
    else if (cat === 'agreement' || cat === 'consent') row.agreement += 1;
    else if (String(cat).startsWith('photo_')) row.photos += 1;
    else row.other += 1;
  }
  return byPatient;
}

function detectDuplicateOverlap({ link, classification, ccoIndex, driveFileId }) {
  if (driveFileId && ccoIndex.driveIds.has(driveFileId)) {
    return { isDuplicate: true, duplicateSource: 'cco_drive_file_id' };
  }
  const pc = link.patientId ? ccoIndex.byPatient.get(link.patientId) : null;
  if (!pc) return { isDuplicate: false, duplicateSource: null };

  const cat = classification.category;
  if (cat === 'journal' && pc.journal > 0) {
    return {
      isDuplicate: true,
      duplicateSource: pc.halso > 0 ? 'halso_journal' : 'cco_journal',
    };
  }
  if (cat === 'form' && pc.form > 0) {
    return {
      isDuplicate: true,
      duplicateSource: pc.halso > 0 ? 'halso_form' : 'cco_form',
    };
  }
  if ((cat === 'agreement' || cat === 'consent') && (pc.agreement > 0 || pc.consent > 0)) {
    if (pc.getaccept > 0) return { isDuplicate: true, duplicateSource: 'getaccept_agreement' };
    return { isDuplicate: true, duplicateSource: 'cco_agreement' };
  }
  return { isDuplicate: false, duplicateSource: null };
}

function categoryBucket(category) {
  if (category === 'journal') return 'journal';
  if (String(category).startsWith('photo_')) return 'image';
  if (['form', 'consent', 'agreement', 'aisia_report', 'other'].includes(category))
    return 'document';
  return 'other';
}

function resolveMatchOutcome({
  link,
  classification,
  driveMaps,
  patientCats,
  driveFileId,
  duplicate,
}) {
  const cat = classification.category;
  const bucket = categoryBucket(cat);

  if (duplicate?.isDuplicate) {
    return { disposition: 'duplicate', reason: duplicate.duplicateSource };
  }

  if (driveFileId && patientCats?.driveIds?.has(driveFileId)) {
    return { disposition: 'already_in_cco', reason: 'drive_file_id_match' };
  }

  if (!link.patientId) {
    return { disposition: 'review', reason: link.basis || 'no_patient_match' };
  }

  if (link.confidence === 'low' || link.basis === 'ambiguous_folder_match') {
    return { disposition: 'review', reason: 'ambiguous_patient' };
  }

  if (classification.confidence === 'low' && bucket === 'image') {
    return { disposition: 'review', reason: 'unknown_image_phase' };
  }

  if (classification.confidence === 'low' && bucket === 'document') {
    return { disposition: 'review', reason: 'unknown_document_type' };
  }

  const hasFolderHigh = driveMaps.high.has(link.patientId);
  const hasFolderReview = driveMaps.review.has(link.patientId);

  if (link.confidence === 'high' || hasFolderHigh) {
    const pc = patientCats;
    if (pc) {
      // Flera journal-PDF per patient tillåts — filnivå avgörs via driveFileId/dubblett ovan.
      if (bucket === 'document' && (pc.form > 0 || pc.agreement > 0)) {
        return { disposition: 'partial_overlap', reason: 'patient_has_document_assets' };
      }
      if (bucket === 'image' && pc.photos > 0) {
        return { disposition: 'partial_overlap', reason: 'patient_has_photo_assets' };
      }
    }
    return {
      disposition: 'import_candidate',
      reason: hasFolderHigh ? 'high_folder_mapping' : link.basis,
    };
  }

  if (link.confidence === 'medium' || hasFolderReview) {
    return { disposition: 'review', reason: 'medium_confidence_match' };
  }

  return { disposition: 'review', reason: 'uncertain_match' };
}

function extractDocumentDate(file) {
  const fromPath = String(file.relativePath || '').match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (fromPath) {
    const [, y, m, d] = fromPath;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (file.modifiedTime) return String(file.modifiedTime).slice(0, 10);
  return null;
}

function linkFileToPatient(file, customerStore) {
  let link = linkPatient({
    sourceRecord: { personnummer: file.personnummer },
    drivePath: file.relativePath,
    fileName: file.fileName,
    customerStore,
  });
  if (!link.patientId && file.personnummer) {
    const hit = customerStore.findByPersonnummer(file.personnummer);
    if (hit?.id) {
      link = {
        patientId: hit.id,
        confidence: 'high',
        score: 0.92,
        basis: 'index_personnummer',
      };
    }
  }
  return link;
}

function evaluateDriveFile(file, ctx) {
  const sourceFolder = String(file.relativePath || '')
    .split('/')
    .slice(0, -1)
    .join('/');
  const classification = classify({
    mimeType: file.mimeType,
    fileName: file.fileName,
    sourceFolder,
  });
  if (file.fileType === 'journal_pdf') {
    classification.category = 'journal';
    classification.confidence = 'high';
  }

  const link = linkFileToPatient(file, ctx.customerStore);
  const pc = link.patientId ? ctx.patientCats.get(link.patientId) : null;
  const duplicate = detectDuplicateOverlap({
    link,
    classification,
    ccoIndex: ctx.ccoIndex,
    driveFileId: file.driveFileId,
  });
  const outcome = resolveMatchOutcome({
    link,
    classification,
    driveMaps: ctx.driveMaps,
    patientCats: pc,
    driveFileId: file.driveFileId,
    duplicate,
  });

  return {
    file,
    link,
    classification,
    outcome,
    patientId: link.patientId || null,
    documentDate: extractDocumentDate(file),
  };
}

function loadDriveImportContext({
  repoRoot,
  dataDir = path.join(repoRoot, 'data'),
  clientoCsv = process.env.ARCANA_SCHEDULER_CCO_CLIENTO_BACKFILL_CSV_PATH || DEFAULT_CSV,
} = {}) {
  const indexPath = path.join(dataDir, 'migration-index.json');
  const assetsPath = path.join(dataDir, 'cco-patient-assets.json');
  const customersPath = path.join(dataDir, 'cco-customers.json');

  const migrationIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const customers = JSON.parse(fs.readFileSync(customersPath, 'utf8'));
  const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
  const directory = customers.tenants?.hair_tp?.customerState?.directory || {};

  const profilePnr = buildProfilePersonnummerIndex(
    migrationIndex.profilesByPersonnummer,
    directory
  );
  const clientoPnr = buildClientoPersonnummerIndex(clientoCsv, directory);
  const customerStore = buildCustomerStore(directory, [profilePnr.pnrToCliento, clientoPnr]);
  const driveMaps = loadDriveMappingConfidence(dataDir);
  const patientCats = buildPatientCategoryIndex(assets);
  const ccoIndex = buildCcoContentIndex(assets);
  const aliasPath = path.join(dataDir, 'drive-import-alias-index.json');
  mergeAliasIntoCcoIndex(ccoIndex, loadDriveImportAliasIndex(aliasPath));

  return {
    migrationIndex,
    files: migrationIndex.files || [],
    customerStore,
    directory,
    driveMaps,
    patientCats,
    ccoIndex,
    assetsPath,
    aliasPath,
  };
}

function listJournalImportCandidates(ctx) {
  const out = [];
  for (const file of ctx.files) {
    if (file.fileType !== 'journal_pdf') continue;
    const row = evaluateDriveFile(file, ctx);
    if (row.outcome.disposition !== 'import_candidate') continue;
    if (!row.patientId) continue;
    if (ctx.driveMaps.review.has(row.patientId)) continue;
    out.push(row);
  }
  out.sort((a, b) => {
    const pc = String(a.patientId).localeCompare(String(b.patientId));
    if (pc !== 0) return pc;
    return String(a.file.relativePath || '').localeCompare(String(b.file.relativePath || ''));
  });
  return out;
}

function sliceCandidatesByPatients(candidates, patientIdSet) {
  return candidates.filter((c) => patientIdSet.has(c.patientId));
}

function uniquePatientIds(candidates) {
  const ids = [];
  const seen = new Set();
  for (const c of candidates) {
    if (!seen.has(c.patientId)) {
      seen.add(c.patientId);
      ids.push(c.patientId);
    }
  }
  return ids;
}

function isSafeCustomerMatch(link, driveMaps) {
  if (!link?.patientId) return false;
  if (link.confidence === 'low' || link.basis === 'ambiguous_folder_match') return false;
  if (link.confidence === 'high') return true;
  if (driveMaps.high.has(link.patientId)) return true;
  return false;
}

function detectDuplicateFileLevel({ ccoIndex, driveFileId, sourceRecordId }) {
  if (driveFileId && ccoIndex.driveIds.has(driveFileId)) {
    return { isDuplicate: true, duplicateSource: 'cco_drive_file_id' };
  }
  if (sourceRecordId && ccoIndex.sourceRecordIds.has(sourceRecordId)) {
    return { isDuplicate: true, duplicateSource: 'cco_source_record_id' };
  }
  return { isDuplicate: false, duplicateSource: null };
}

function isDocumentFileType(fileType) {
  return ['journal_pdf', 'document_pdf', 'document_word'].includes(fileType || '');
}

function isImageFileType(fileType) {
  return fileType === 'image';
}

function evaluateDriveFileForFullImport(file, ctx) {
  const sourceFolder = String(file.relativePath || '')
    .split('/')
    .slice(0, -1)
    .join('/');
  const classification = classify({
    mimeType: file.mimeType,
    fileName: file.fileName,
    sourceFolder,
  });
  if (file.fileType === 'journal_pdf') {
    classification.category = 'journal';
    classification.confidence = 'high';
  }

  const link = linkFileToPatient(file, ctx.customerStore);
  const duplicate = detectDuplicateFileLevel({
    ccoIndex: ctx.ccoIndex,
    driveFileId: file.driveFileId,
    sourceRecordId: file.id,
  });

  if (duplicate.isDuplicate) {
    return {
      file,
      link,
      classification,
      outcome: { disposition: 'duplicate', reason: duplicate.duplicateSource },
      patientId: link.patientId || null,
      documentDate: extractDocumentDate(file),
    };
  }

  if (!isSafeCustomerMatch(link, ctx.driveMaps)) {
    const reason = !link.patientId
      ? link.basis || 'no_patient_match'
      : link.confidence === 'medium'
        ? 'medium_confidence_match'
        : 'uncertain_match';
    return {
      file,
      link,
      classification,
      outcome: { disposition: 'customer_review', reason },
      patientId: link.patientId || null,
      documentDate: extractDocumentDate(file),
    };
  }

  return {
    file,
    link,
    classification,
    outcome: { disposition: 'import_candidate', reason: link.basis || 'high_confidence' },
    patientId: link.patientId,
    documentDate: extractDocumentDate(file),
  };
}

function listFullImportCandidates(ctx, { phase = 'documents' } = {}) {
  const out = [];
  for (const file of ctx.files) {
    const ft = file.fileType || '';
    if (phase === 'documents' && !isDocumentFileType(ft)) continue;
    if (phase === 'images' && !isImageFileType(ft)) continue;
    if (phase === 'customer_review') continue;

    const row = evaluateDriveFileForFullImport(file, ctx);
    if (row.outcome.disposition !== 'import_candidate') continue;
    if (!row.patientId || !file.driveFileId) continue;
    out.push(row);
  }
  out.sort((a, b) => {
    const pc = String(a.patientId).localeCompare(String(b.patientId));
    if (pc !== 0) return pc;
    return String(a.file.relativePath || '').localeCompare(String(b.file.relativePath || ''));
  });
  return out;
}

function listCustomerReviewCandidates(ctx) {
  const out = [];
  for (const file of ctx.files) {
    const row = evaluateDriveFileForFullImport(file, ctx);
    if (row.outcome.disposition !== 'customer_review') continue;
    out.push(row);
  }
  return out;
}

function refreshImportIndexes(ctx) {
  const assets = JSON.parse(fs.readFileSync(ctx.assetsPath, 'utf8'));
  ctx.patientCats = buildPatientCategoryIndex(assets);
  ctx.ccoIndex = buildCcoContentIndex(assets);
  if (ctx.aliasPath) mergeAliasIntoCcoIndex(ctx.ccoIndex, loadDriveImportAliasIndex(ctx.aliasPath));
  return ctx;
}

module.exports = {
  loadDriveImportContext,
  listJournalImportCandidates,
  evaluateDriveFile,
  evaluateDriveFileForFullImport,
  listFullImportCandidates,
  listCustomerReviewCandidates,
  isSafeCustomerMatch,
  isDocumentFileType,
  isImageFileType,
  refreshImportIndexes,
  sliceCandidatesByPatients,
  uniquePatientIds,
  extractDocumentDate,
};
