#!/usr/bin/env node
'use strict';

/**
 * Drive history import — DRY-RUN ONLY.
 *
 * Kartlägger Drive-arkiv (migration-index) mot CCO/Cliento-kunder.
 * Ingen import, ingen binärskrivning, ingen patientdata i rapport/GitHub.
 *
 *   node scripts/dry-run-drive-history-import.js
 *   node scripts/dry-run-drive-history-import.js --report-md docs/strategy/CCO-DRIVE-HISTORY-IMPORT-DRY-RUN-2026-05-31.md
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');
const DEFAULT_CSV = path.join(
  process.env.HOME,
  'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cliento-customers-2026-05-29.csv'
);

const { classify, linkPatient } = require('../src/ops/ccoAssetImportPipeline');
const { parseCsv, buildHeaderMap, mapClientoRow } = require('./import-cliento-customers');
const { normalizePersonnummer, nameOverlapScore } = require('./migration/lib/migrationUtils');

const AVG_BYTES_BY_MIME = {
  'image/jpeg': 2_500_000,
  'image/heif': 2_000_000,
  'image/heic': 2_000_000,
  'image/png': 1_800_000,
  'image/x-adobe-dng': 8_000_000,
  'application/pdf': 800_000,
  'video/quicktime': 15_000_000,
  'video/mp4': 12_000_000,
  default: 1_000_000,
};

function parseArgs(argv) {
  const args = {
    reportMd: null,
    reportJson: path.join(DATA, 'reports/drive-history-dry-run-latest.json'),
    clientoCsv: process.env.ARCANA_SCHEDULER_CCO_CLIENTO_BACKFILL_CSV_PATH || DEFAULT_CSV,
    limit: 0,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const f = argv[i];
    if (f === '--report-md') args.reportMd = path.resolve(argv[++i]);
    else if (f === '--report-json') args.reportJson = path.resolve(argv[++i]);
    else if (f === '--csv') args.clientoCsv = path.resolve(argv[++i]);
    else if (f === '--limit') args.limit = Math.max(0, Number(argv[++i]) || 0);
  }
  return args;
}

function estimateBytes(mimeType, fileType) {
  const mime = String(mimeType || '').toLowerCase();
  if (AVG_BYTES_BY_MIME[mime]) return AVG_BYTES_BY_MIME[mime];
  if (fileType === 'journal_pdf' || fileType === 'document_pdf')
    return AVG_BYTES_BY_MIME['application/pdf'];
  if (fileType === 'image') return AVG_BYTES_BY_MIME['image/jpeg'];
  if (fileType === 'video') return AVG_BYTES_BY_MIME['video/quicktime'];
  return AVG_BYTES_BY_MIME.default;
}

function formatGiB(bytes) {
  return +(bytes / 1024 ** 3).toFixed(2);
}

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
      if (clientoId && directory[clientoId])
        return { id: clientoId, name: directory[clientoId].name };
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

function loadDriveMappingConfidence() {
  const high = new Set();
  const review = new Set();
  for (const [file, set] of [
    [path.join(DATA, 'cco-patient-drive-mappings.high-confidence.json'), high],
    [path.join(DATA, 'cco-patient-drive-mappings.review-needed.json'), review],
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
  for (const a of Object.values(assets.items || {})) {
    if (a.originalDriveFileId) driveIds.add(a.originalDriveFileId);
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
  return { byPatient, driveIds };
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
      if (bucket === 'journal' && pc.journal > 0) {
        return { disposition: 'already_in_cco', reason: 'patient_has_journal_assets' };
      }
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

function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date().toISOString();

  const indexPath = path.join(DATA, 'migration-index.json');
  if (!fs.existsSync(indexPath)) {
    console.error(JSON.stringify({ error: 'migration_index_missing', path: indexPath }));
    process.exit(2);
  }

  const migrationIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  let files = migrationIndex.files || [];
  if (args.limit > 0) files = files.slice(0, args.limit);

  const customers = JSON.parse(fs.readFileSync(path.join(DATA, 'cco-customers.json'), 'utf8'));
  const directory = customers.tenants?.hair_tp?.customerState?.directory || {};
  const profilePnr = buildProfilePersonnummerIndex(
    migrationIndex.profilesByPersonnummer,
    directory
  );
  const clientoPnr = buildClientoPersonnummerIndex(args.clientoCsv, directory);
  const customerStore = buildCustomerStore(directory, [profilePnr.pnrToCliento, clientoPnr]);
  const driveMaps = loadDriveMappingConfidence();
  const assets = JSON.parse(fs.readFileSync(path.join(DATA, 'cco-patient-assets.json'), 'utf8'));
  const patientCats = buildPatientCategoryIndex(assets);
  const ccoIndex = buildCcoContentIndex(assets);

  const stats = {
    dryRun: true,
    generatedAt: startedAt,
    source: {
      migrationIndex: indexPath,
      indexStats: migrationIndex.stats || null,
      clientoCsvUsed: fs.existsSync(args.clientoCsv),
      pnrIndexSize: profilePnr.pnrToCliento.size + clientoPnr.size,
      pnrFromProfiles: profilePnr.matched,
      pnrAmbiguousProfiles: profilePnr.ambiguous,
      driveHighMappings: driveMaps.high.size,
      driveReviewMappings: driveMaps.review.size,
    },
    totals: {
      files: 0,
      journals: 0,
      images: 0,
      forms: 0,
      documents: 0,
      videos: 0,
      other: 0,
    },
    classified: {
      journal: 0,
      photo_before: 0,
      photo_during: 0,
      photo_after: 0,
      form: 0,
      consent: 0,
      agreement: 0,
      aisia_report: 0,
      other: 0,
    },
    matching: {
      importCandidate: 0,
      review: 0,
      alreadyInCco: 0,
      partialOverlap: 0,
      duplicate: 0,
      noPatientMatch: 0,
    },
    duplicatesBySource: {},
    reviewReasons: {},
    importCandidatesByBucket: { journal: 0, image: 0, document: 0 },
    storageEstimateBytes: 0,
    storageEstimateGiB: 0,
    importCandidateStorageBytes: 0,
    uniquePatients: {
      importCandidate: new Set(),
      review: new Set(),
      alreadyInCco: new Set(),
    },
  };

  for (const file of files) {
    stats.totals.files += 1;
    const ft = file.fileType || 'other';
    if (ft === 'journal_pdf') stats.totals.journals += 1;
    else if (ft === 'image') stats.totals.images += 1;
    else if (ft === 'video') stats.totals.videos += 1;
    else if (ft === 'document_pdf' || ft === 'document_word') {
      /* räknas via klassificering nedan */
    } else stats.totals.other += 1;

    const bytes = estimateBytes(file.mimeType, ft);
    stats.storageEstimateBytes += bytes;

    const sourceFolder = String(file.relativePath || '')
      .split('/')
      .slice(0, -1)
      .join('/');
    const classification = classify({
      mimeType: file.mimeType,
      fileName: file.fileName,
      sourceFolder,
    });
    if (ft === 'journal_pdf' && classification.category !== 'journal') {
      classification.category = 'journal';
      classification.confidence = 'high';
    }
    stats.classified[classification.category] =
      (stats.classified[classification.category] || 0) + 1;
    if (classification.category === 'form') stats.totals.forms += 1;
    else if (['consent', 'agreement', 'aisia_report'].includes(classification.category)) {
      stats.totals.documents += 1;
    } else if (
      (ft === 'document_pdf' || ft === 'document_word') &&
      classification.category === 'other'
    ) {
      stats.totals.documents += 1;
    } else if (classification.category === 'journal' && ft !== 'journal_pdf') {
      stats.totals.journals += 1;
    }

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

    const pc = link.patientId ? patientCats.get(link.patientId) : null;
    const duplicate = detectDuplicateOverlap({
      link,
      classification,
      ccoIndex,
      driveFileId: file.driveFileId,
    });
    const outcome = resolveMatchOutcome({
      link,
      classification,
      driveMaps,
      patientCats: pc,
      driveFileId: file.driveFileId,
      duplicate,
    });

    const dispositionMap = {
      import_candidate: 'importCandidate',
      review: 'review',
      already_in_cco: 'alreadyInCco',
      partial_overlap: 'partialOverlap',
      duplicate: 'duplicate',
    };
    const statKey = dispositionMap[outcome.disposition] || outcome.disposition;
    stats.matching[statKey] = (stats.matching[statKey] || 0) + 1;

    if (!link.patientId) stats.matching.noPatientMatch += 1;
    if (outcome.disposition === 'review') {
      stats.reviewReasons[outcome.reason] = (stats.reviewReasons[outcome.reason] || 0) + 1;
      if (link.patientId) stats.uniquePatients.review.add(link.patientId);
    }
    if (outcome.disposition === 'duplicate') {
      stats.duplicatesBySource[outcome.reason] =
        (stats.duplicatesBySource[outcome.reason] || 0) + 1;
      if (link.patientId) stats.uniquePatients.alreadyInCco.add(link.patientId);
    }
    if (outcome.disposition === 'import_candidate') {
      stats.importCandidatesByBucket[categoryBucket(classification.category)] += 1;
      stats.importCandidateStorageBytes += bytes;
      if (link.patientId) stats.uniquePatients.importCandidate.add(link.patientId);
    }
    if (outcome.disposition === 'already_in_cco' && link.patientId) {
      stats.uniquePatients.alreadyInCco.add(link.patientId);
    }
    if (outcome.disposition === 'partial_overlap' && link.patientId) {
      stats.uniquePatients.alreadyInCco.add(link.patientId);
    }
  }

  stats.storageEstimateGiB = formatGiB(stats.storageEstimateBytes);
  stats.importCandidateStorageGiB = formatGiB(stats.importCandidateStorageBytes);
  stats.uniquePatients = {
    importCandidate: stats.uniquePatients.importCandidate.size,
    review: stats.uniquePatients.review.size,
    alreadyInCco: stats.uniquePatients.alreadyInCco.size,
  };

  stats.nextBatchSuggestion = {
    batches: [
      {
        id: 'batch-1-journal-canary',
        phase: 'canary_high_confidence_journals',
        patientCount: Math.min(40, stats.uniquePatients.importCandidate),
        fileCountEstimate: stats.importCandidatesByBucket.journal,
        storageGiB: stats.importCandidateStorageGiB,
        goRequired: true,
        note: 'Endast journal-PDF med high PNR + folder mapping. Ingen binär utan separat GO.',
      },
      {
        id: 'batch-2-drive-forms-docs',
        phase: 'forms_documents_review',
        fileCountEstimate:
          (stats.classified.form || 0) +
          (stats.classified.consent || 0) +
          (stats.classified.agreement || 0),
        patientCount: null,
        goRequired: true,
        note: 'Formulär/avtal från Drive — klassificering + dubblett mot halso/GetAccept före import.',
      },
      {
        id: 'batch-3-photos-encounter',
        phase: 'photos_encounter_review',
        fileCountEstimate: stats.totals.images,
        patientCount: stats.uniquePatients.review,
        goRequired: true,
        note: '50k+ bilder kräver encounter/fas-review. Ej import-ready i denna dry-run.',
      },
      {
        id: 'batch-4-folder-mapping-review',
        phase: 'folder_mapping_review',
        patientCount: driveMaps.review.size,
        fileCountEstimate: null,
        goRequired: false,
        note: '849 medium/low folder mappings — manuell godkännande före auto-import.',
      },
    ],
    imageReviewPending: stats.totals.images,
    driveReviewMappings: driveMaps.review.size,
    rationale:
      'Drive = importkälla only. CCO = system of record. Inga Drive-länkar. Säker kundmatch → import candidate; osäker → review queue.',
  };

  fs.mkdirSync(path.dirname(args.reportJson), { recursive: true });
  fs.writeFileSync(args.reportJson, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');

  if (args.reportMd) {
    const md = buildMarkdown(stats);
    fs.mkdirSync(path.dirname(args.reportMd), { recursive: true });
    fs.writeFileSync(args.reportMd, md, 'utf8');
  }

  console.log(JSON.stringify(stats, null, 2));
}

function buildMarkdown(s) {
  const dupTotal = s.matching.duplicate || 0;
  const lines = [];
  lines.push('# CCO Drive History Import — Dry Run');
  lines.push('');
  lines.push(`*Genererad: ${s.generatedAt}*`);
  lines.push('');
  lines.push('**Status:** DRY-RUN ONLY');
  lines.push('');
  lines.push('| Princip | Regel |');
  lines.push('|---|---|');
  lines.push('| Drive | Importkälla / arkiv only — inga Drive-länkar som slutlösning |');
  lines.push('| CCO | System of record |');
  lines.push('| Binär | Ingen skrivning i denna körning |');
  lines.push('| Kunder | Inga nya kunder skapas |');
  lines.push('| Match | Säker → import candidate · osäker → review queue |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Drive-arkiv — volym');
  lines.push('');
  lines.push('| Metric | Antal |');
  lines.push('|---|---:|');
  lines.push(`| **Filer totalt** | **${s.totals.files}** |`);
  lines.push(`| Journal-PDF | ${s.totals.journals} |`);
  lines.push(`| Bilder | ${s.totals.images} |`);
  lines.push(`| Formulär (klassificerade) | ${s.totals.forms} |`);
  lines.push(`| Dokument (avtal/samtycke/övrigt PDF) | ${s.totals.documents} |`);
  lines.push(`| Video | ${s.totals.videos} |`);
  lines.push(`| Övrigt | ${s.totals.other} |`);
  lines.push('');
  lines.push('### Klassificering (filnamn/mime)');
  lines.push('');
  lines.push('| Kategori | Antal |');
  lines.push('|---|---:|');
  for (const [cat, count] of Object.entries(s.classified || {}).sort((a, b) => b[1] - a[1])) {
    if (count > 0) lines.push(`| ${cat} | ${count} |`);
  }
  lines.push('');
  lines.push('## 2. Kundmatchning');
  lines.push('');
  lines.push('| Utfall | Filer | Kunder (unika) |');
  lines.push('|---|---:|---:|');
  lines.push(
    `| **Import candidate** (säker match) | **${s.matching.importCandidate}** | **${s.uniquePatients.importCandidate}** |`
  );
  lines.push(
    `| Review (osäker kund/kategori/fas) | ${s.matching.review} | ${s.uniquePatients.review} |`
  );
  lines.push(
    `| Redan i CCO (kategori finns) | ${s.matching.alreadyInCco} | ${s.uniquePatients.alreadyInCco} |`
  );
  lines.push(`| **Dubblett** (halso/GetAccept/CCO) | **${dupTotal}** | — |`);
  lines.push(`| Delvis överlapp | ${s.matching.partialOverlap} | — |`);
  lines.push(`| Ingen kundmatch | ${s.matching.noPatientMatch} | — |`);
  lines.push('');
  lines.push('### Dubbletter per källa');
  lines.push('');
  if (Object.keys(s.duplicatesBySource || {}).length === 0) {
    lines.push('- *(inga dubbletter detekterade)*');
  } else {
    for (const [src, count] of Object.entries(s.duplicatesBySource).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${src}: ${count}`);
    }
  }
  lines.push('');
  lines.push('### Import candidates per typ');
  lines.push('');
  lines.push(`- Journaler: ${s.importCandidatesByBucket.journal}`);
  lines.push(`- Bilder: ${s.importCandidatesByBucket.image}`);
  lines.push(`- Dokument: ${s.importCandidatesByBucket.document}`);
  lines.push('');
  lines.push('### Review-orsaker (topp)');
  lines.push('');
  for (const [reason, count] of Object.entries(s.reviewReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)) {
    lines.push(`- ${reason}: ${count}`);
  }
  lines.push('');
  lines.push('## 3. Storage-estimat');
  lines.push('');
  lines.push('*Genomsnittsstorlekar per mime — inget binärt nedladdat.*');
  lines.push('');
  lines.push('| Scope | GiB |');
  lines.push('|---|---:|');
  lines.push(`| Alla Drive-filer | ${s.storageEstimateGiB} |`);
  lines.push(`| Import candidates | ${s.importCandidateStorageGiB} |`);
  lines.push('');
  lines.push('## 4. Föreslagna batchar');
  lines.push('');
  lines.push('| Batch | Fas | Kunder | Filer (est.) | GO krävs |');
  lines.push('|---|---|---:|---:|:---:|');
  for (const b of s.nextBatchSuggestion.batches) {
    lines.push(
      `| ${b.id} | ${b.phase} | ${b.patientCount ?? '—'} | ${b.fileCountEstimate ?? '—'} | ${b.goRequired ? 'Ja' : 'Nej'} |`
    );
  }
  lines.push('');
  for (const b of s.nextBatchSuggestion.batches) {
    lines.push(`**${b.id}:** ${b.note}`);
    lines.push('');
  }
  lines.push('## 5. Källor (read-only, ingen patientdata i denna fil)');
  lines.push('');
  lines.push('- `data/migration-index.json` — 57k+ filer från Drive zip-index');
  lines.push('- Cliento CSV PNR/namn-index (lokal iCloud, ej i repo)');
  lines.push('- `data/cco-patient-drive-mappings.*.json` — folder confidence');
  lines.push('- `data/cco-patient-assets.json` — befintligt CCO (halso/GetAccept/journal)');
  lines.push(
    `- PNR-profiler matchade: ${s.source.pnrFromProfiles} (${s.source.pnrAmbiguousProfiles} tvetydiga)`
  );
  lines.push(
    `- High folder mappings: ${s.source.driveHighMappings} · Review mappings: ${s.source.driveReviewMappings}`
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Ingen full import utan separat owner-GO.*');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

main();
