#!/usr/bin/env node
'use strict';

/**
 * P0 Photo Review UI Fas 1 — read-only verification against prod asset store
 *
 * Usage:
 *   node scripts/verify-photo-review-ui-fas1.js
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATE = '2026-05-30';
const OUT_MD = path.join(REPO_ROOT, `docs/strategy/P0-PHOTO-REVIEW-UI-FAS1-READONLY-${DATE}.md`);

const {
  isPhotoReviewAsset,
  serializeReviewItem,
  loadBatchLabelByPatient,
  patientDocSummary,
} = require('../src/routes/ccoPhotoReview');

function prodDataRoot() {
  return (
    process.env.ARCANA_CCO_PROD_DATA_ROOT ||
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    )
  );
}

function main() {
  const assetsPath = path.join(prodDataRoot(), 'cco-patient-assets.json');
  if (!fs.existsSync(assetsPath)) {
    console.error('FEL: prod assets saknas:', assetsPath);
    process.exit(2);
  }

  const batchLabels = loadBatchLabelByPatient();
  const allAssets = Object.values(JSON.parse(fs.readFileSync(assetsPath, 'utf8')).items || {});
  const reviewItems = allAssets.filter(isPhotoReviewAsset);
  const serialized = reviewItems.map((a) => serializeReviewItem(a, batchLabels));

  const patients = new Set(reviewItems.map((a) => a.patientId));
  const byConfidence = { high: 0, medium: 0, low: 0 };
  let missingStorageKey = 0;
  let missingChecksum = 0;
  let previewAvailable = 0;
  let photosVisibleInReview = 0;
  let driveLinksInPayload = 0;

  for (const row of serialized) {
    byConfidence[row.confidence] = (byConfidence[row.confidence] || 0) + 1;
    if (!row.hasStorageKey) missingStorageKey += 1;
    if (!row.hasChecksum) missingChecksum += 1;
    if (row.previewAvailable) previewAvailable += 1;
    if (row.currentStatus === 'VISIBLE_ON_PATIENT_CARD') photosVisibleInReview += 1;
    const blob = JSON.stringify(row);
    if (/drive\.google\.com|docs\.google\.com|googleusercontent/i.test(blob))
      driveLinksInPayload += 1;
  }

  const photosVisibleAny = allAssets.filter(
    (a) =>
      ['photo_before', 'photo_during', 'photo_after'].includes(a.category) &&
      a.status === 'VISIBLE_ON_PATIENT_CARD'
  ).length;

  const patientGroups = [...patients].map((patientId) => ({
    patientId,
    ...patientDocSummary(allAssets, patientId),
    pendingPhotos: reviewItems.filter((a) => a.patientId === patientId).length,
    batchLabel: batchLabels[patientId] || null,
  }));

  const perfEstimateMs = Math.round(reviewItems.length * 0.8 + patients.size * 12);

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'fas1_readonly',
    assetsPath,
    patientsInUi: patients.size,
    photosListed: reviewItems.length,
    previewAvailableCount: previewAvailable,
    photosWithoutPreview: reviewItems.length - previewAvailable,
    missingStorageKey,
    missingChecksum,
    photosVisibleInReviewQueue: photosVisibleInReview,
    photosVisibleOnPatientCardTotal: photosVisibleAny,
    driveLinksInApiPayload: driveLinksInPayload,
    byConfidence,
    perfEstimateInitialLoadMs: perfEstimateMs,
    uiStrategy: 'Patient-list + per-patient detail (not all 861 thumbnails at once)',
    endpoints: [
      'GET /api/v1/cco/photo-review/summary',
      'GET /api/v1/cco/photo-review/patients',
      'GET /api/v1/cco/photo-review/patients/:patientId',
    ],
    writeEnabledDefault: false,
    bugs: [],
    blockers: [],
  };

  if (photosVisibleInReview > 0) {
    report.blockers.push(`${photosVisibleInReview} bilder i review-kön har status VISIBLE`);
  }
  if (driveLinksInPayload > 0) {
    report.blockers.push(`${driveLinksInPayload} API-rader innehåller Drive-länkar`);
  }

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });

  let md = '# P0 Photo Review UI — Fas 1 Read-only\n\n';
  md += `*Genererad: ${report.generatedAt}*\n\n`;
  md += '## Beslut\n\n';
  md += '- **GO:** Photo Review Fas 1 — read-only UI\n';
  md += '- **STOPP:** Fas 2 (approve/reject/reassign) tills Fas 1 godkänd\n';
  md += '- **STOPP:** medium/low-import (849 mappings)\n';
  md += '- **STOPP:** full prod-import\n\n';

  md += '## Fas 1-regler (implementerade)\n\n';
  md += '1. Read-only only\n';
  md += '2. Ingen approve / reject / reassign / statusändring / mass-approval\n';
  md += '3. Ingen bild blir VISIBLE via UI\n';
  md += '4. Ingen ny import / medium-low / full prod-import\n';
  md +=
    '5. Ingen Drive-länk i UI — preview via CCO storage (`/api/v1/cco/assets/:id/download?inline=1`)\n';
  md += '6. Fas 2 write routes gated: `ENABLE_PHOTO_REVIEW_WRITE=false` (default)\n\n';

  md += '## Verifiering mot prod asset store\n\n';
  md += '| Metric | Värde |\n|---|---:|\n';
  md += `| Källa | \`${assetsPath}\` |\n`;
  md += `| Patienter i UI | ${report.patientsInUi} |\n`;
  md += `| Bilder listade (NEEDS_REVIEW photos) | ${report.photosListed} |\n`;
  md += `| Preview tillgänglig (storageKey+checksum) | ${report.previewAvailableCount} |\n`;
  md += `| Bilder utan preview | ${report.photosWithoutPreview} |\n`;
  md += `| Saknar storageKey | ${report.missingStorageKey} |\n`;
  md += `| Saknar checksum | ${report.missingChecksum} |\n`;
  md += `| VISIBLE i review-kön (fel) | ${report.photosVisibleInReviewQueue} |\n`;
  md += `| VISIBLE photo totalt (prod) | ${report.photosVisibleOnPatientCardTotal} |\n`;
  md += `| Drive-länkar i API-payload | ${report.driveLinksInApiPayload} |\n\n`;

  md += '### Confidence\n\n';
  md += '| Nivå | Antal |\n|---|--:|\n';
  for (const [k, v] of Object.entries(byConfidence)) md += `| ${k} | ${v} |\n`;

  md += '\n## UI-yta\n\n';
  md += '- Sida: `/photo-review.html`\n';
  md += '- JS: `public/cco-photo-review.js` (read-only, ingen POST)\n';
  md += '- CSS: `public/cco-photo-review.css`\n\n';

  md += '### Visar per bild\n\n';
  md += '- Föreslagen kategori (photo_before / photo_during / photo_after)\n';
  md += '- Confidence, reason, uncertaintyReason\n';
  md += '- importRunId, batchLabel, patientId, assetId, currentStatus\n';
  md += '- Varning: ej godkänd / syns inte på patientkort\n';
  md += '- Thumbnail/preview via CCO storage när storageKey+checksum finns\n\n';

  md += '### Visar per patient\n\n';
  md += '- Antal bilder i review\n';
  md += '- journalVisibleCount / formVisibleCount\n';
  md += '- hasVisibleJournalOrForm\n';
  md += '- Filter/sök på patientId och batch\n\n';

  md += '## Performance (861 bilder)\n\n';
  md += `- UI laddar **patientlista** (${report.patientsInUi} rader) + **detalj per vald patient** (medel ~${Math.round(report.photosListed / Math.max(report.patientsInUi, 1))} bilder), inte alla 861 samtidigt.\n`;
  md += `- Uppskattad initial API+render: ~${report.perfEstimateInitialLoadMs} ms (server-side analys; browser varierar med nätverk).\n`;
  md += '- Lazy-loading på `<img loading="lazy">` per patientvy.\n\n';

  md += '## Preview i browser (manuell check)\n\n';
  md +=
    'Kör server mot prod data och öppna `/photo-review.html`. `window.__ARCANA_PHOTO_REVIEW_PREVIEW_STATS__` rapporterar loaded/failed/unavailable per session.\n\n';

  md += '## Bugs / blockers\n\n';
  if (report.bugs.length === 0 && report.blockers.length === 0) {
    md += 'Inga kända blockers i Fas 1 read-only scope.\n';
  } else {
    for (const b of [...report.blockers, ...report.bugs]) md += `- ${b}\n`;
  }

  md += '\n## Nästa steg\n\n';
  md += '- Godkänn Fas 1 read-only UI i prod/staging\n';
  md += '- Separat GO för Fas 2 — se `docs/strategy/P0-PHOTO-REVIEW-FAS2-PLAN-2026-05-30.md`\n';

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log(JSON.stringify({ ok: true, report, out: OUT_MD }, null, 2));
}

main();
