#!/usr/bin/env node
'use strict';

/**
 * Read-only aggregate: index-journal vs storage-journal vs review queue.
 * Outputs counts only — no patient names, PNR or IDs in stdout/report.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  buildAssetSignalsIndex,
  loadAssetSignalsIndex,
  computeSegmentStats,
} = require('../src/ops/ccoKunderEnrichment');
const { loadKunderBookingIndex } = require('../src/ops/ccoKunderBookingEnrichment');

const RENDERABLE = new Set(['verified_in_cco', 'visible_on_patient_card']);
const ATTENTION = new Set([
  'needs_review',
  'link_only_blocker',
  'imported_to_cco',
  'failed_import',
  'duplicate',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function hasPersonnummer(patient) {
  const pnr = String(patient?.personnummer || '').replace(/\D/g, '');
  return pnr.length >= 10;
}

function indexJournalCount(patient) {
  return Number(patient?.fileSummary?.journalPdfs) || 0;
}

function hasIndexJournal(patient) {
  return indexJournalCount(patient) > 0;
}

function summarizeJournalAssets(assets = []) {
  let renderable = 0;
  let attention = 0;
  let driveImport = 0;
  let withBinary = 0;
  for (const asset of assets) {
    if (normalizeKey(asset.category) !== 'journal') continue;
    if (normalizeKey(asset.sourceSystem) === 'drive_import') driveImport += 1;
    if (asset.storageKey && asset.checksum) withBinary += 1;
    if (RENDERABLE.has(normalizeKey(asset.status))) renderable += 1;
    if (ATTENTION.has(normalizeKey(asset.status))) attention += 1;
  }
  return { renderable, attention, driveImport, withBinary, total: assets.length };
}

function buildJournalAssetIndex(items = [], tenantId = null) {
  const byPatient = new Map();
  for (const asset of asArray(items)) {
    if (tenantId && asset.tenantId && asset.tenantId !== tenantId) continue;
    const patientId = String(asset.patientId || '').trim();
    if (!patientId || patientId === 'unknown') continue;
    if (normalizeKey(asset.category) !== 'journal') continue;
    if (!byPatient.has(patientId)) byPatient.set(patientId, []);
    byPatient.get(patientId).push(asset);
  }
  return byPatient;
}

function buildImportReviewPatientSet(queueState) {
  const patientIds = new Set();
  const reasons = {};
  const items = queueState?.items || {};
  for (const item of Object.values(items)) {
    if (normalizeKey(item.status) !== 'pending') continue;
    const pid = String(item.patientId || item.resolvedPatientId || '').trim();
    if (pid) patientIds.add(pid);
    for (const sid of asArray(item.suggestedPatientIds)) {
      if (sid) patientIds.add(String(sid));
    }
    const reason = normalizeKey(item.reason) || 'unknown';
    reasons[reason] = (reasons[reason] || 0) + 1;
  }
  return {
    patientIds,
    pendingItems: Object.values(items).filter((i) => i.status === 'pending').length,
    reasons,
  };
}

function isMvpTierA(patient, journalAssets, importReviewPatients) {
  if (normalizeKey(patient.matchStatus) !== 'matched') return false;
  if (!hasPersonnummer(patient)) return false;
  if (Number(patient.matchConfidence) < 0.95) return false;
  if (!patient.cliento) return false;
  if (importReviewPatients.has(patient.id)) return false;

  const sum = summarizeJournalAssets(journalAssets);
  if (sum.renderable < 1) return false;
  if (sum.driveImport < 1) return false;
  if (sum.attention > 0) return false;
  if (sum.withBinary < sum.renderable) return false;
  return true;
}

function isMvpTierB(patient, journalAssets, importReviewPatients) {
  const status = normalizeKey(patient.matchStatus);
  if (status === 'needs_review' || status === 'unmatched') return false;
  if (importReviewPatients.has(patient.id)) return false;

  const sum = summarizeJournalAssets(journalAssets);
  if (sum.renderable < 1) return false;
  if (sum.driveImport < 1) return false;
  return true;
}

function isMvpTierC(patient, journalAssets, importReviewPatients) {
  if (!hasIndexJournal(patient)) return false;
  if (normalizeKey(patient.matchStatus) === 'needs_review') return false;
  if (importReviewPatients.has(patient.id)) return false;
  if (!hasPersonnummer(patient)) return false;

  const sum = summarizeJournalAssets(journalAssets);
  return sum.renderable >= 1 && sum.driveImport >= 1;
}

function overlapAssetPatientIdsWithMaster(patients, assetItems) {
  const masterIds = new Set(patients.map((p) => p.id));
  const assetPatientIds = new Set(
    assetItems.map((a) => String(a.patientId || '').trim()).filter(Boolean)
  );
  let overlap = 0;
  for (const pid of assetPatientIds) {
    if (masterIds.has(pid)) overlap += 1;
  }
  return {
    masterPatients: masterIds.size,
    assetPatientIds: assetPatientIds.size,
    overlappingPatientIds: overlap,
  };
}

function computeIndexAggregate(patients) {
  const out = {
    indexJournalPatients: 0,
    indexJournalFiles: 0,
    indexMatchedPatients: 0,
    indexTierAProfilePatients: 0,
    indexDriveOnlyPatients: 0,
    indexClientoOnlyPatients: 0,
    filesWithoutJournalIndex: 0,
  };
  for (const patient of patients) {
    const idx = hasIndexJournal(patient);
    const idxCount = indexJournalCount(patient);
    if (idx) {
      out.indexJournalPatients += 1;
      out.indexJournalFiles += idxCount;
      if (normalizeKey(patient.matchStatus) === 'matched') out.indexMatchedPatients += 1;
      if (normalizeKey(patient.matchStatus) === 'drive_only') out.indexDriveOnlyPatients += 1;
      if (normalizeKey(patient.matchStatus) === 'cliento_only') out.indexClientoOnlyPatients += 1;
      if (
        normalizeKey(patient.matchStatus) === 'matched' &&
        hasPersonnummer(patient) &&
        Number(patient.matchConfidence) >= 0.95 &&
        patient.cliento
      ) {
        out.indexTierAProfilePatients += 1;
      }
    } else if (Number(patient?.fileSummary?.totalFiles) > 0) {
      out.filesWithoutJournalIndex += 1;
    }
  }
  return out;
}

function computeAssetAggregate(assetItems) {
  const patients = {
    anyJournal: new Set(),
    renderableDriveImportJournal: new Set(),
    visibleDriveImportJournal: new Set(),
  };
  const counts = {
    journalAssetsTotal: 0,
    driveImportJournalAssets: 0,
    renderableDriveImportJournalAssets: 0,
    visibleDriveImportJournalAssets: 0,
    attentionDriveImportJournalAssets: 0,
    byStatus: {},
    bySourceSystem: {},
  };
  for (const asset of assetItems) {
    const cat = normalizeKey(asset.category);
    const source = normalizeKey(asset.sourceSystem);
    const status = normalizeKey(asset.status) || 'unknown';
    if (cat === 'journal') {
      counts.journalAssetsTotal += 1;
      counts.byStatus[status] = (counts.byStatus[status] || 0) + 1;
      if (source) counts.bySourceSystem[source] = (counts.bySourceSystem[source] || 0) + 1;
      if (asset.patientId) patients.anyJournal.add(asset.patientId);
    }
    if (cat !== 'journal' || source !== 'drive_import') continue;
    counts.driveImportJournalAssets += 1;
    if (RENDERABLE.has(status)) {
      counts.renderableDriveImportJournalAssets += 1;
      if (asset.patientId) patients.renderableDriveImportJournal.add(asset.patientId);
    }
    if (status === 'visible_on_patient_card') {
      counts.visibleDriveImportJournalAssets += 1;
      if (asset.patientId) patients.visibleDriveImportJournal.add(asset.patientId);
    }
    if (ATTENTION.has(status)) counts.attentionDriveImportJournalAssets += 1;
  }
  return {
    ...counts,
    patientsWithAnyJournalAsset: patients.anyJournal.size,
    patientsWithRenderableDriveImportJournal: patients.renderableDriveImportJournal.size,
    patientsWithVisibleDriveImportJournal: patients.visibleDriveImportJournal.size,
  };
}

function buildMvpRecommendation(buckets, patients, assetItems) {
  const index = computeIndexAggregate(patients);
  const assets = computeAssetAggregate(assetItems);
  const overlap = overlapAssetPatientIdsWithMaster(patients, assetItems);
  const joinedTierA = buckets.mvpTierA;
  const conservativeBatch1Documented = 247;
  const optimisticStoragePatients = assets.patientsWithVisibleDriveImportJournal;
  const indexTierA = index.indexTierAProfilePatients;

  let maxSafeMvp = joinedTierA;
  let confidence = 'high';
  if (overlap.overlappingPatientIds === 0) {
    maxSafeMvp = Math.min(conservativeBatch1Documented, optimisticStoragePatients);
    confidence = 'estimated_local_split_brain';
  }

  return {
    tierA_joined_patient_level: joinedTierA,
    tierB_joined: buckets.mvpTierB,
    tierC_joined: buckets.mvpTierC,
    indexTierAProfilePatients: indexTierA,
    documentedBatch1Patients: conservativeBatch1Documented,
    assetVisibleDriveImportPatients: optimisticStoragePatients,
    maxSafeMvpRollout: maxSafeMvp,
    suggestedPilotCanary: Math.min(50, Math.max(10, maxSafeMvp > 0 ? 50 : 0)),
    confidence,
    rules: {
      tierA:
        'matched + PNR + confidence>=0.95 + Cliento + renderable drive_import journal + no attention assets + not in import review queue',
      conservative:
        'Use min(batch1 documented 247, visible drive_import patients in asset store) when local IDs diverge',
      optimistic:
        'All patients with visible drive_import journal in CCO storage (~584 local asset store)',
    },
  };
}

async function main() {
  const tenantId = process.argv.includes('--tenant')
    ? process.argv[process.argv.indexOf('--tenant') + 1]
    : 'hair-tp-clinic';

  const masterPath = path.join(process.cwd(), 'data', 'cco-patient-master.json');
  const assetsPath = path.join(process.cwd(), 'data', 'cco-patient-assets.json');
  const reviewPath = path.join(process.cwd(), 'data', 'cco-import-review-queue.json');

  const master = readJson(masterPath);
  const patients = asArray(master?.tenants?.[tenantId]?.patients).filter(
    (p) => normalizeKey(p.matchStatus) !== 'merged'
  );

  const assetState = readJson(assetsPath);
  const rawItems = assetState?.items;
  const assetItems = Array.isArray(rawItems)
    ? rawItems
    : rawItems && typeof rawItems === 'object'
      ? Object.values(rawItems)
      : asArray(assetState?.assets || Object.values(assetState?.byId || {}));
  const journalByPatient = buildJournalAssetIndex(assetItems, tenantId);
  const assetIndex = buildAssetSignalsIndex(assetItems, tenantId);

  let reviewMeta = { patientIds: new Set(), pendingItems: 0, reasons: {} };
  try {
    reviewMeta = buildImportReviewPatientSet(readJson(reviewPath));
  } catch {
    /* optional */
  }

  const buckets = {
    totalPatients: patients.length,
    indexJournalPatients: 0,
    indexJournalFiles: 0,
    storageJournalPatients: 0,
    storageJournalRenderablePatients: 0,
    storageJournalDriveImportPatients: 0,
    bothIndexAndStorageRenderable: 0,
    indexOnlyNoStorageRenderable: 0,
    storageRenderableNoIndex: 0,
    neitherJournalSignal: 0,
    matchStatus: {},
    mvpTierA: 0,
    mvpTierB: 0,
    mvpTierC: 0,
    mvpTierAWithIndexJournal: 0,
    patientsInImportReviewQueue: 0,
    patientsNeedsReviewMatch: 0,
    driveOnlyWithIndexJournal: 0,
    clientoOnlyWithIndexJournal: 0,
    assetJournalByStatus: {},
    assetJournalDriveImportByStatus: {},
  };

  for (const patient of patients) {
    const ms = normalizeKey(patient.matchStatus) || 'unknown';
    buckets.matchStatus[ms] = (buckets.matchStatus[ms] || 0) + 1;

    if (normalizeKey(patient.matchStatus) === 'needs_review') buckets.patientsNeedsReviewMatch += 1;
    if (reviewMeta.patientIds.has(patient.id)) buckets.patientsInImportReviewQueue += 1;

    const idx = hasIndexJournal(patient);
    const idxCount = indexJournalCount(patient);
    const journalAssets = journalByPatient.get(patient.id) || [];
    const sum = summarizeJournalAssets(journalAssets);

    if (idx) {
      buckets.indexJournalPatients += 1;
      buckets.indexJournalFiles += idxCount;
      if (ms === 'drive_only') buckets.driveOnlyWithIndexJournal += 1;
      if (ms === 'cliento_only') buckets.clientoOnlyWithIndexJournal += 1;
    }
    if (sum.total > 0) buckets.storageJournalPatients += 1;
    if (sum.renderable > 0) buckets.storageJournalRenderablePatients += 1;
    if (sum.driveImport > 0) buckets.storageJournalDriveImportPatients += 1;

    for (const asset of journalAssets) {
      const st = normalizeKey(asset.status) || 'unknown';
      buckets.assetJournalByStatus[st] = (buckets.assetJournalByStatus[st] || 0) + 1;
      if (normalizeKey(asset.sourceSystem) === 'drive_import') {
        buckets.assetJournalDriveImportByStatus[st] =
          (buckets.assetJournalDriveImportByStatus[st] || 0) + 1;
      }
    }

    if (idx && sum.renderable > 0) buckets.bothIndexAndStorageRenderable += 1;
    else if (idx && sum.renderable === 0) buckets.indexOnlyNoStorageRenderable += 1;
    else if (!idx && sum.renderable > 0) buckets.storageRenderableNoIndex += 1;
    else buckets.neitherJournalSignal += 1;

    if (isMvpTierA(patient, journalAssets, reviewMeta.patientIds)) {
      buckets.mvpTierA += 1;
      if (idx) buckets.mvpTierAWithIndexJournal += 1;
    }
    if (isMvpTierB(patient, journalAssets, reviewMeta.patientIds)) buckets.mvpTierB += 1;
    if (isMvpTierC(patient, journalAssets, reviewMeta.patientIds)) buckets.mvpTierC += 1;
  }

  const bookingBundle = await loadKunderBookingIndex({}, tenantId, patients);
  const segmentStats = computeSegmentStats(
    patients,
    assetIndex,
    bookingBundle.index,
    bookingBundle.coverage,
    bookingBundle
  );

  const report = {
    generatedAt: new Date().toISOString(),
    tenantId,
    dataQuality: {
      assetPatientIdOverlapWithMaster: overlapAssetPatientIdsWithMaster(patients, assetItems),
      note: 'If overlap=0, patient-level storage buckets are unreliable locally — use assetAggregate + indexAggregate.',
    },
    indexAggregate: computeIndexAggregate(patients),
    assetAggregate: computeAssetAggregate(assetItems),
    buckets,
    segmentStatsCounts: segmentStats.counts || {},
    importReviewQueue: {
      pendingItems: reviewMeta.pendingItems,
      topReasons: Object.entries(reviewMeta.reasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([reason, count]) => ({ reason, count })),
    },
    mvpRecommendation: buildMvpRecommendation(buckets, patients, assetItems),
  };

  const outPath = path.join(
    process.cwd(),
    'data',
    'reports',
    'drive-journal-segment-readiness-latest.json'
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log('=== Drive journal segment readiness (counts only) ===');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Patients (non-merged): ${buckets.totalPatients}`);
  console.log('');
  console.log('--- Journal signals per patient ---');
  console.log(
    `Index journal (fileSummary.journalPdfs>0):     ${buckets.indexJournalPatients} patients, ${buckets.indexJournalFiles} indexed PDFs`
  );
  console.log(`Storage journal (any asset):                   ${buckets.storageJournalPatients}`);
  console.log(
    `Storage journal renderable (VERIFIED/VISIBLE): ${buckets.storageJournalRenderablePatients}`
  );
  console.log(
    `Storage drive_import journal:                  ${buckets.storageJournalDriveImportPatients}`
  );
  console.log(
    `Both index + renderable storage:               ${buckets.bothIndexAndStorageRenderable}`
  );
  console.log(
    `Index only (no renderable storage):            ${buckets.indexOnlyNoStorageRenderable}`
  );
  console.log(`Storage renderable, index count 0:             ${buckets.storageRenderableNoIndex}`);
  console.log(`Neither index nor storage journal:             ${buckets.neitherJournalSignal}`);
  console.log('');
  console.log('--- Match / review ---');
  console.log(`matchStatus needs_review:                      ${buckets.patientsNeedsReviewMatch}`);
  console.log(
    `Patients touched by import review queue:       ${buckets.patientsInImportReviewQueue}`
  );
  console.log(`Import review pending items:                   ${reviewMeta.pendingItems}`);
  console.log('Match status:', JSON.stringify(buckets.matchStatus));
  console.log('');
  console.log('--- Segment stats (enrichment) ---');
  console.log(
    `has_drive_journal segment:                     ${segmentStats.counts?.has_drive_journal ?? '—'}`
  );
  console.log(
    `has_drive_document segment:                    ${segmentStats.counts?.has_drive_document ?? '—'}`
  );
  console.log(
    `needs_review segment:                          ${segmentStats.counts?.needs_review ?? '—'}`
  );
  console.log('');
  console.log('--- Journal assets by status ---');
  console.log('All journal assets:', JSON.stringify(buckets.assetJournalByStatus));
  console.log('drive_import journal:', JSON.stringify(buckets.assetJournalDriveImportByStatus));
  console.log('');
  console.log('--- Asset store aggregate (patient join may diverge locally) ---');
  const assetAgg = report.assetAggregate;
  console.log(`drive_import journal assets:                 ${assetAgg.driveImportJournalAssets}`);
  console.log(
    `renderable drive_import journal assets:      ${assetAgg.renderableDriveImportJournalAssets}`
  );
  console.log(
    `Patients w/ visible drive_import journal:    ${assetAgg.patientsWithVisibleDriveImportJournal}`
  );
  console.log(
    `Journal assets by source:                    ${JSON.stringify(assetAgg.bySourceSystem)}`
  );
  console.log('');
  console.log('--- Index aggregate (patient master) ---');
  const idxAgg = report.indexAggregate;
  console.log(
    `Index journal patients:                      ${idxAgg.indexJournalPatients} (${idxAgg.indexJournalFiles} PDFs)`
  );
  console.log(`Index + matched:                             ${idxAgg.indexMatchedPatients}`);
  console.log(`Index tier-A profile (matched+PNR+conf):     ${idxAgg.indexTierAProfilePatients}`);
  console.log(`Index + drive_only:                          ${idxAgg.indexDriveOnlyPatients}`);
  console.log('');
  console.log(`Tier A strict (max safe rollout):              ${buckets.mvpTierA}`);
  console.log(`  └ with index journal too:                    ${buckets.mvpTierAWithIndexJournal}`);
  console.log(`Tier B matched + renderable drive_import:      ${buckets.mvpTierB}`);
  console.log(`Tier C index + renderable drive_import:        ${buckets.mvpTierC}`);
  console.log('');
  console.log(`Suggested pilot: ${report.mvpRecommendation.suggestedPilotCanary} patients`);
  console.log(
    `Max safe MVP rollout (Tier A): ${report.mvpRecommendation.maxSafeMvpRollout} patients (${report.mvpRecommendation.confidence})`
  );
  console.log(`  batch1 documented: ${report.mvpRecommendation.documentedBatch1Patients}`);
  console.log(
    `  asset visible drive_import patients: ${report.mvpRecommendation.assetVisibleDriveImportPatients}`
  );
  console.log(
    `  index tier-A profile (matched+PNR+conf): ${report.mvpRecommendation.indexTierAProfilePatients}`
  );
  console.log(
    `Asset/master patientId overlap: ${report.dataQuality.assetPatientIdOverlapWithMaster.overlappingPatientIds}/${report.dataQuality.assetPatientIdOverlapWithMaster.assetPatientIds}`
  );
  console.log(`Report: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
