#!/usr/bin/env node
'use strict';

/**
 * smoke-test-journal-sign-to-asset.js — verifierar P0.J.222 end-to-end.
 *
 * Kör utan att starta full HTTP-server: hookar in stores direkt och
 * simulerar en journal-signering. Förväntat utfall:
 *   1. Journal-entry signeras + locked=true
 *   2. PDF genereras (eller skippas om Chromium saknas — testar då hooks-flowet)
 *   3. PDF sparas i secure storage med storageKey + checksum
 *   4. patient_asset skapas med category=journal
 *   5. Asset når status=VISIBLE_ON_PATIENT_CARD
 *   6. Asset har storageKey, checksum, fileSize, mimeType, patientId, encounterId
 *
 * Använder ANON test-data — INGEN rå patientdata.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REPO = '/Users/fazlikrasniqi/Code/major-arcana';

const { createCcoJournalStore } = require(path.join(REPO, 'src/ops/ccoJournalStore'));
const { createCcoPatientAssetStore } = require(path.join(REPO, 'src/ops/ccoPatientAssetStore'));
const { createSecureStorageProvider } = require(path.join(REPO, 'src/ops/ccoSecureStorageProvider'));

// Sandbox-paths under /tmp så vi aldrig rör prod-state
const SANDBOX = path.join(os.tmpdir(), 'cco-smoke-' + Date.now());
fs.mkdirSync(SANDBOX, { recursive: true });

const STATE = {
  journalPath: path.join(SANDBOX, 'cco-journal-entries.json'),
  assetPath: path.join(SANDBOX, 'cco-patient-assets.json'),
  storageRoot: path.join(SANDBOX, 'cco-secure-storage'),
  pdfDir: path.join(SANDBOX, 'cco-journal-pdfs'),
};
fs.mkdirSync(STATE.pdfDir, { recursive: true });

function log(label, data) {
  console.log('[' + label + ']', JSON.stringify(data, null, 2));
}

async function main() {
  console.log('=== Smoke-test #222: Journal-sign → asset-creation ===');
  console.log('Sandbox:', SANDBOX);
  console.log('');

  // Setup stores
  const secure = createSecureStorageProvider({ provider: 'local', rootPath: STATE.storageRoot });
  const assetStore = await createCcoPatientAssetStore({ filePath: STATE.assetPath });

  // Hook som speglar prod-onAfterSign (förenklad: skapa fake PDF istället för Chromium)
  const journalStore = await createCcoJournalStore({
    filePath: STATE.journalPath,
    onAfterSign: async (signedEntry, { actor } = {}) => {
      // Fake PDF (testar wiring, inte PDF-rendering)
      const pdfBody = Buffer.from(
        '%PDF-1.4\n% Anon journal — entry=' + signedEntry.entryId +
        '\n% signed=' + signedEntry.signedAt + '\n%%EOF',
        'utf8'
      );
      const tamperHash = 'sha256:' + crypto.createHash('sha256').update(pdfBody).digest('hex');

      // applyPdfArtifact
      const pdfPath = path.join(STATE.pdfDir, signedEntry.entryId + '.pdf');
      fs.writeFileSync(pdfPath, pdfBody);
      await journalStore.applyPdfArtifact({
        tenantId: signedEntry.tenantId,
        patientId: signedEntry.patientId,
        entryId: signedEntry.entryId,
        pdfPath,
        pdfTamperHash: tamperHash,
        pdfSizeBytes: pdfBody.length,
      });

      // Save in secure storage
      const safeIso = String(signedEntry.signedAt || '').slice(0, 10);
      const fileName = 'journal-' + signedEntry.entryId + '-' + safeIso + '.pdf';
      const putResult = await secure.putObject({
        body: pdfBody,
        contentType: 'application/pdf',
        metadata: {
          patientId: signedEntry.patientId,
          originalFileName: fileName,
          documentDate: signedEntry.signedAt,
          entryId: signedEntry.entryId,
          tenantId: signedEntry.tenantId,
          signedAt: signedEntry.signedAt,
          tamperHash,
        },
      });

      // Create asset
      const created = await assetStore.addAsset({
        patientId: signedEntry.patientId,
        encounterId: signedEntry.treatmentEncounterId || signedEntry.encounterId || null,
        sourceSystem: 'cco_journal_sign',
        sourceRecordId: signedEntry.entryId,
        originalFileName: fileName,
        storageProvider: 'local',
        storageKey: putResult.storageKey,
        checksum: 'sha256:' + putResult.checksum,
        fileSize: pdfBody.length,
        mimeType: 'application/pdf',
        category: 'journal',
        documentDate: signedEntry.signedAt,
        importedBy: actor?.userId || 'smoke_test',
        isJournalRelevant: true,
        auditRequired: true,
        status: 'IMPORTED_TO_CCO',
      }, { actor });

      await assetStore.transitionStatus(created.id, 'VERIFIED_IN_CCO', { actor, reason: 'self_verified' });
      await assetStore.markAsVisibleOnPatientCard(created.id, { actor });

      console.log('[hook] asset created + transitioned to VISIBLE: ' + created.id);
    },
  });

  // Step 1: Create draft entry
  const tenantId = 'hairtpclinic';
  const patientId = 'anon-patient-001';
  const encounterId = 'anon-encounter-' + Date.now();
  console.log('Step 1: skapar journal-entry för', patientId);
  const draft = await journalStore.upsertEntry({
    tenantId,
    patientId,
    treatmentEncounterId: encounterId,
    journalType: 'consultation_plan',
    title: 'Anon konsultation (smoke-test)',
    fields: { note: 'Anon test — INGEN patient-PII.' },
    actor: { userId: 'test-doctor', displayName: 'Dr Anon', role: 'doctor' },
  });
  console.log('  entryId:', draft.entryId, '· locked:', draft.locked, '· status:', draft.status);
  console.log('');

  // Step 2: Sign → triggers hook → creates asset
  console.log('Step 2: signerar entry → onAfterSign hookas → asset skapas');
  const signed = await journalStore.signEntry({
    tenantId, patientId, entryId: draft.entryId,
    actor: { userId: 'test-doctor', displayName: 'Dr Anon', role: 'doctor' },
  });
  console.log('  locked:', signed.locked, '· status:', signed.status, '· pdfPath:', !!signed.pdfPath);
  console.log('');

  // Step 3: Verify asset
  console.log('Step 3: hämta assets för patient');
  const assets = assetStore.listAssetsForPatient(patientId, {}, { actor: { role: 'system' } });
  console.log('  Antal assets:', assets.length);

  if (assets.length === 0) {
    console.error('FAIL: Inga assets skapades.');
    process.exit(1);
  }

  const a = assets[0];
  const checks = {
    'category=journal': a.category === 'journal',
    'sourceSystem=cco_journal_sign': a.sourceSystem === 'cco_journal_sign',
    'status=VISIBLE_ON_PATIENT_CARD': a.status === 'VISIBLE_ON_PATIENT_CARD',
    'storageKey set': !!a.storageKey,
    'checksum (sha256:) set': a.checksum && a.checksum.startsWith('sha256:'),
    'fileSize > 0': a.fileSize > 0,
    'mimeType=application/pdf': a.mimeType === 'application/pdf',
    'patientId matches': a.patientId === patientId,
    'encounterId matches': a.encounterId === encounterId,
    'isJournalRelevant=true': a.isJournalRelevant === true,
    'auditRequired=true': a.auditRequired === true,
    'originalDriveFileId is null (no Drive)': a.originalDriveFileId === null,
    'originalDrivePath is null (no Drive)': a.originalDrivePath === null,
  };

  console.log('');
  console.log('=== Asset-verifiering ===');
  let pass = 0, fail = 0;
  for (const [k, v] of Object.entries(checks)) {
    console.log((v ? '  ✅' : '  ❌') + ' ' + k);
    if (v) pass += 1; else fail += 1;
  }
  console.log('');
  console.log(pass + '/' + (pass + fail) + ' kontroller passerade.');

  // Step 4: Verifiera storage-roundtrip (checksum bekräftad vid read)
  console.log('');
  console.log('Step 4: verifiera storage roundtrip (read + checksum)');
  try {
    const got = await secure.getObject(a.storageKey);
    const computed = 'sha256:' + got.checksum;
    if (computed !== a.checksum) throw new Error('checksum mismatch: ' + computed + ' vs ' + a.checksum);
    console.log('  ✅ getObject OK · ' + got.buffer.length + ' bytes · checksum verifierad (' + computed.slice(0,20) + '...)');
  } catch (err) {
    console.error('  ❌ getObject FAIL:', err.message);
    fail += 1;
  }

  // Step 5: Verifiera tyst-edit-skydd
  console.log('');
  console.log('Step 5: signerad journal får inte ändras tyst (försök re-sign)');
  try {
    await journalStore.signEntry({ tenantId, patientId, entryId: draft.entryId, actor: { role: 'doctor' } });
    console.error('  ❌ FAIL: re-sign av låst entry tilläts!');
    fail += 1;
  } catch (err) {
    console.log('  ✅ re-sign blockerades:', err.message);
  }

  // Cleanup
  console.log('');
  console.log('=== Cleanup ===');
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); console.log('Sandbox raderad:', SANDBOX); } catch {}

  console.log('');
  console.log(fail === 0 ? '🎉 ALL CHECKS PASS' : '❌ ' + fail + ' check(s) failed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error('FEL:', err); process.exit(2); });
