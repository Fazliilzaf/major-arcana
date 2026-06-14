#!/usr/bin/env node
'use strict';

/**
 * Bildstudio UAT — patched filter logic against prod dossier data + one save flow.
 *
 *   node scripts/run-bildstudio-uat.js
 *   node scripts/run-bildstudio-uat.js --write-test   # creates one annotated asset (Albert)
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { getProdToken, BASE } = require('./lib/halsoHdProdClient');

const ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'data/reports/bildstudio-uat-report.json');

const UAT_PATIENTS = [
  {
    key: 'many_photos',
    patientId: 'fd223812-684e-4511-a9dc-bee0872a9c73',
    label: 'Adam W…',
    writeTest: false,
  },
  {
    key: 'few_photos',
    patientId: '2726bc83-308a-4661-8b37-1d1647a2d76a',
    label: 'Albert…',
    writeTest: true,
  },
  {
    key: 'existing_offer_ready',
    patientId: '50b39b3c-6b6c-46b1-990b-72e2aeead59e',
    label: 'Abdirahman H…',
    writeTest: false,
  },
];

function maskId(id = '') {
  const s = String(id || '');
  return s.length < 12 ? `${s.slice(0, 4)}…` : `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function driveDedupeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isReferensImageFile(file) {
  const mime = driveDedupeText(file && (file.mimeType || file.contentType));
  const type = driveDedupeText(file && file.fileType);
  const category = driveDedupeText(file && file.category);
  const name = driveDedupeText(
    file &&
      (file.fileName ||
        file.originalFileName ||
        file.relativePath ||
        file.name ||
        file.title ||
        file.displayName)
  );
  const isPhotoCategory =
    /^(photo|image)_(before|during|after|overview|donor|hairline|crown)$/.test(category);
  const isPhotoLabel = /(^|\s·\s)(foto|photo)(\s·|$)/.test(name) && !/samtycke|consent/.test(name);
  const isTreatmentPhotoLabel =
    /^\d{4}-\d{2}-\d{2}\s·\s/.test(name) &&
    /\s·\s(före|fore|before|under|efter|after|översikt|oversikt|overview|donator|donor|hårlinje|harlinje|hairline|krona|crown|fue operation|prp)(\s·|$)/.test(
      name
    ) &&
    !/\.(pdf|docx?|rtf|odt|xlsx?|csv|txt)$/.test(name);
  return (
    type === 'image' ||
    mime.indexOf('image/') === 0 ||
    isPhotoCategory ||
    isPhotoLabel ||
    isTreatmentPhotoLabel ||
    /\.(heic|heif|jpe?g|png|webp|gif)$/.test(name)
  );
}

function isReferensVideoFile(file) {
  const mime = driveDedupeText(file && (file.mimeType || file.contentType));
  const type = driveDedupeText(file && file.fileType);
  const name = driveDedupeText(
    file && (file.fileName || file.originalFileName || file.relativePath || file.name || file.title)
  );
  return type === 'video' || mime.indexOf('video/') === 0 || /\.(mp4|mov|m4v|webm)$/i.test(name);
}

function isReferensMediaFile(file) {
  return isReferensImageFile(file) || isReferensVideoFile(file);
}

function looksLikeReferensMediaLabel(value) {
  const name = driveDedupeText(value);
  return (
    /(^|\s·\s)(foto|photo|film|video)(\s·|$)/.test(name) ||
    (/^\d{4}-\d{2}-\d{2}\s·\s/.test(name) &&
      /\s·\s(före|fore|before|under|efter|after|översikt|oversikt|overview|donator|donor|hårlinje|harlinje|hairline|krona|crown|fue operation|prp)(\s·|$)/.test(
        name
      ) &&
      !/\.(pdf|docx?|rtf|odt|xlsx?|csv|txt)$/.test(name))
  );
}

function isReferensDocumentFile(file) {
  const label =
    file &&
    (file.fileName ||
      file.originalFileName ||
      file.relativePath ||
      file.name ||
      file.title ||
      file.displayName);
  return !isReferensMediaFile(file) && !looksLikeReferensMediaLabel(label);
}

function gkSelectedForFromFile(file) {
  const tech = (file && file.technicalInfo) || {};
  const meta = (file && (file.meta || file.metadata)) || {};
  const raw = (file && file.selectedFor) || tech.selectedFor || meta.selectedFor || [];
  return (Array.isArray(raw) ? raw : []).map((v) => String(v || '').trim()).filter(Boolean);
}

function gkIsAnnotatedFile(file) {
  if (String((file && file.imageStage) || '').toLowerCase() === 'annotated') return true;
  if (file && file.sourceAnnotationId) return true;
  const tech = (file && file.technicalInfo) || {};
  if (tech.sourceAnnotationId) return true;
  if (String((file && file.version) || '').toLowerCase() === 'annotated-v1') return true;
  const name = driveDedupeText(
    file && (file.fileName || file.originalFileName || file.displayName || file.name || file.title)
  );
  return /markerad bild|annotated/i.test(name);
}

function gkIsOfferReadyFile(file) {
  const selectedFor = gkSelectedForFromFile(file);
  const stage = String((file && file.imageStage) || '').toLowerCase();
  return (
    stage === 'annotated' &&
    (selectedFor.includes('offer') || selectedFor.includes('treatment_plan'))
  );
}

function gkIsOriginalVisitMediaFile(file) {
  return isReferensMediaFile(file) && !gkIsAnnotatedFile(file);
}

function fileLabel(file) {
  return (
    file?.fileName || file?.originalFileName || file?.name || file?.title || file?.displayName || ''
  );
}

function dateKey(file) {
  const d = String(file?.documentDate || file?.captureDate || file?.visitDate || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : 'odaterat';
}

function sortKeyOf(file) {
  return String(
    file?.timelineSortKey ||
      file?.captureDateTime ||
      (file?.documentDate ? `${file.documentDate}T12:00:00` : '') ||
      file?.importedAt ||
      ''
  );
}

function auditDriveFiles(driveFiles = []) {
  const originals = driveFiles.filter(gkIsOriginalVisitMediaFile);
  const offerReady = driveFiles.filter(gkIsOfferReadyFile);
  const annotated = driveFiles.filter(gkIsAnnotatedFile);
  const annotatedInBesok = originals.filter(gkIsAnnotatedFile);
  const offerInBesok = originals.filter(gkIsOfferReadyFile);
  const dokument = driveFiles
    .filter(isReferensDocumentFile)
    .filter((f) => !looksLikeReferensMediaLabel(fileLabel(f)))
    .filter((f) => !gkIsAnnotatedFile(f) && !gkIsOfferReadyFile(f));
  const dokumentMediaLeak = dokument.filter(
    (f) => isReferensMediaFile(f) || /\.(jpe?g|png|heic|webp|gif)$/i.test(fileLabel(f))
  );

  const groups = {};
  for (const f of driveFiles) {
    if (gkIsAnnotatedFile(f)) continue;
    const k = dateKey(f);
    if (!groups[k]) groups[k] = { originals: [], sortKey: '' };
    if (gkIsOriginalVisitMediaFile(f)) groups[k].originals.push(f);
    const sk = sortKeyOf(f);
    if (sk > groups[k].sortKey) groups[k].sortKey = sk;
  }
  const visitKeys = Object.keys(groups)
    .filter((k) => groups[k].originals.length > 0)
    .sort((a, b) => {
      if (a === 'odaterat') return 1;
      if (b === 'odaterat') return -1;
      return String(b).localeCompare(String(a));
    });
  let visitOrderOk = visitKeys.length <= 1;
  if (visitKeys.length > 1) {
    visitOrderOk = visitKeys.every((k, i) => {
      if (i === 0) return true;
      const prev = visitKeys[i - 1] === 'odaterat' ? '' : visitKeys[i - 1];
      const cur = k === 'odaterat' ? '' : k;
      return String(prev).localeCompare(String(cur)) >= 0;
    });
  }

  return {
    besokOriginalCount: originals.length,
    fotoOfferReadyCount: offerReady.length,
    annotatedCount: annotated.length,
    visitDateGroups: visitKeys.length,
    visitOrderNewestFirst: visitOrderOk,
    leaks: {
      annotatedInBesok: annotatedInBesok.length,
      offerReadyInBesok: offerInBesok.length,
      dokumentMediaLeak: dokumentMediaLeak.length,
    },
    pass:
      annotatedInBesok.length === 0 &&
      offerInBesok.length === 0 &&
      dokumentMediaLeak.length === 0 &&
      visitOrderOk,
  };
}

function buildOfferAutoItems(plan = {}, items = null) {
  const areaItems = (plan.areaSpecs || []).map((s) => ({
    label: `${s.area} (${s.technique || plan.technique || 'fue'})`,
    estimatedGrafts: s.estimatedGrafts || null,
    sessionCount: s.sessionCount || 1,
    note: s.note || '',
  }));
  const imageItems = (plan.selectedImages || []).map((img) => ({
    label: img.label || img.zone || 'Markerad bild',
    assetId: img.assetId || img.id || null,
    annotationId: img.annotationId || null,
    note: [img.date, img.zone].filter(Boolean).join(' · ') || 'Offertklar bild',
  }));
  if (items && items.length) return items;
  if (areaItems.length) return areaItems.concat(imageItems);
  if (imageItems.length) return imageItems;
  return areaItems;
}

function tinyPngDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

async function fetchDossier(token, patientId) {
  const res = await fetch(
    `${BASE}/api/v1/cco-patient-master/patient/dossier-bundle?patientId=${encodeURIComponent(patientId)}&includeJournal=0`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'x-arcana-client': 'major_arcana_admin',
      },
    }
  );
  if (!res.ok) throw new Error(`dossier ${patientId} HTTP ${res.status}`);
  return res.json();
}

function tokenHeaders(json = false) {
  const token = getProdToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'x-arcana-client': 'major_arcana_admin',
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function runWriteTest(patientId, sourceAssetId, beforeAudit) {
  const docDate = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${BASE}/api/v1/cco-photo-annotations`, {
    method: 'POST',
    headers: tokenHeaders(true),
    body: JSON.stringify({
      customerId: patientId,
      patientId,
      sourceAssetId,
      documentDate: docDate,
      captureDate: docDate,
      imageName: 'UAT bildstudio test',
      zone: 'Hårlinje',
      selectedFor: ['photo', 'consent', 'treatment_plan', 'offer'],
      drawingData: {
        strokes: [
          {
            color: '#d45b4f',
            points: [
              { x: 10, y: 10 },
              { x: 80, y: 80 },
            ],
          },
        ],
      },
      previewDataUrl: tinyPngDataUrl(),
      note: 'UAT bildstudio GO — auto test stroke',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `annotation HTTP ${res.status}`);

  const afterDossier = await fetchDossier(getProdToken(), patientId);
  const afterAudit = auditDriveFiles(afterDossier.driveFiles || []);
  const newAssetId = body.asset?.id || body.derivedAssetId || null;

  let planResult = null;
  let offerItems = null;
  if (newAssetId) {
    const planRes = await fetch(`${BASE}/api/v1/cco-treatment-plans`, {
      method: 'POST',
      headers: tokenHeaders(true),
      body: JSON.stringify({
        customerId: patientId,
        patientId,
        title: 'UAT bildstudio behandlingsplan',
        annotationId: body.annotation?.id || null,
        assetId: newAssetId,
        selectedImages: [
          {
            id: newAssetId,
            assetId: newAssetId,
            annotationId: body.annotation?.id || null,
            date: docDate,
            zone: 'Hårlinje',
            label: 'UAT bildstudio test',
            selectedFor: ['photo', 'consent', 'treatment_plan', 'offer'],
          },
        ],
        providerComment: 'UAT bildstudio selectedImages test',
        offerIntent: { status: 'ready_for_offer_draft', source: 'bildstudio_uat' },
      }),
    });
    const planBody = await planRes.json().catch(() => ({}));
    planResult = { status: planRes.status, planId: planBody.plan?.id || planBody.id || null };
    if (planRes.ok && planBody.plan) {
      offerItems = buildOfferAutoItems(planBody.plan);
    } else if (planRes.ok) {
      offerItems = buildOfferAutoItems(planBody);
    }
  }

  const originalStillPresent =
    beforeAudit.besokOriginalCount <= afterAudit.besokOriginalCount &&
    afterAudit.besokOriginalCount >= beforeAudit.besokOriginalCount;
  const fotoIncreased = afterAudit.fotoOfferReadyCount > beforeAudit.fotoOfferReadyCount;
  const annotatedOk = Boolean(
    newAssetId &&
    (afterDossier.driveFiles || []).some(
      (f) => (f.id === newAssetId || f.assetId === newAssetId) && gkIsOfferReadyFile(f)
    )
  );

  return {
    newAssetId: maskId(newAssetId),
    newAssetIdRaw: newAssetId,
    before: beforeAudit,
    after: afterAudit,
    originalStillPresent,
    fotoIncreased,
    annotatedOfferReady: annotatedOk,
    planResult,
    offerItemsIncludeImage: Boolean(
      offerItems && offerItems.some((it) => it.assetId === newAssetId)
    ),
    offerItemCount: offerItems ? offerItems.length : 0,
    pass:
      originalStillPresent &&
      fotoIncreased &&
      annotatedOk &&
      afterAudit.leaks.annotatedInBesok === 0 &&
      afterAudit.leaks.dokumentMediaLeak === 0 &&
      Boolean(planResult?.planId) &&
      Boolean(offerItems && offerItems.some((it) => it.assetId === newAssetId)),
  };
}

async function main() {
  const writeTest = process.argv.includes('--write-test');
  const token = getProdToken();
  const results = [];
  let hardFail = false;

  for (const row of UAT_PATIENTS) {
    const dossier = await fetchDossier(token, row.patientId);
    const driveFiles = dossier.driveFiles || [];
    const before = auditDriveFiles(driveFiles);
    const entry = {
      key: row.key,
      patientId: maskId(row.patientId),
      label: row.label,
      before,
      after: null,
      writeTest: null,
      pass: before.pass,
    };

    if (row.writeTest && writeTest) {
      const source = driveFiles.find(
        (f) => gkIsOriginalVisitMediaFile(f) && !gkIsOfferReadyFile(f) && (f.id || f.assetId)
      );
      if (!source) {
        entry.writeTest = { error: 'no_source_original' };
        entry.pass = false;
        hardFail = true;
      } else {
        try {
          entry.writeTest = await runWriteTest(row.patientId, source.id || source.assetId, before);
          entry.after = entry.writeTest.after;
          entry.pass = before.pass && entry.writeTest.pass;
          if (!entry.pass) hardFail = true;
        } catch (error) {
          entry.writeTest = { error: error.message || String(error) };
          entry.pass = false;
          hardFail = true;
        }
      }
    }

    if (!entry.pass) hardFail = true;
    results.push(entry);
  }

  const report = {
    ok: !hardFail,
    phase: 'bildstudio_uat',
    generatedAt: new Date().toISOString(),
    prodUrl: BASE,
    filterSource: 'patched logic (cco-kundkort-referens.js equivalent)',
    note: writeTest
      ? 'Write test created one annotated asset on Albert (few photos). UI screenshots require deploy of client bundle.'
      : 'Read-only audit. Re-run with --write-test for save flow.',
    results,
    screenshots: {
      before: null,
      after: null,
      note: 'Client bundle not deployed — API/filter UAT only. Capture UI after deploy.',
    },
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(hardFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
