#!/usr/bin/env node
'use strict';

/**
 * smoke-test-journal-correction-flow.js — verifierar #223 end-to-end.
 *
 * Verifierar:
 *   1. Original journal-entry signeras + locked=true
 *   2. addCorrection skapar NY entry (inte mutate original)
 *   3. Original FÖRBLIR locked
 *   4. Correction har correctionOfEntryId pekande på original
 *   5. Correction har correctionReason, correctionCreatedBy, correctionCreatedAt
 *   6. Correction startar som status=draft (kan signeras separat)
 *   7. Försök edit av låst original → blockeras
 *   8. Signering av correction → ny PDF + ny asset (samma hook som #222)
 *
 * Anon test-data only.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REPO = '/Users/fazlikrasniqi/Code/major-arcana';

const { createCcoJournalStore } = require(path.join(REPO, 'src/ops/ccoJournalStore'));
const { createCcoPatientAssetStore } = require(path.join(REPO, 'src/ops/ccoPatientAssetStore'));
const { createSecureStorageProvider } = require(path.join(REPO, 'src/ops/ccoSecureStorageProvider'));

const SANDBOX = path.join(os.tmpdir(), 'cco-corr-' + Date.now());
fs.mkdirSync(SANDBOX, { recursive: true });

async function main() {
  console.log('=== Smoke-test #223: Rättelse-flow (ny entry, ej edit) ===');
  console.log('Sandbox:', SANDBOX);

  const secure = createSecureStorageProvider({ provider: 'local', rootPath: path.join(SANDBOX, 'secure') });
  const assetStore = await createCcoPatientAssetStore({ filePath: path.join(SANDBOX, 'assets.json') });

  let pdfCount = 0;
  const journalStore = await createCcoJournalStore({
    filePath: path.join(SANDBOX, 'journal.json'),
    onAfterSign: async (signedEntry, { actor } = {}) => {
      // Mock PDF + asset (samma logik som server.js)
      const body = Buffer.from('%PDF-1.4\n% ' + signedEntry.entryId + ' ' + (signedEntry.correctionOfEntryId || 'original') + '\n%%EOF');
      const putResult = await secure.putObject({
        body, contentType: 'application/pdf',
        metadata: { patientId: signedEntry.patientId, originalFileName: 'journal-' + signedEntry.entryId + '.pdf' },
      });
      await assetStore.addAsset({
        patientId: signedEntry.patientId,
        encounterId: signedEntry.treatmentEncounterId || null,
        sourceSystem: 'cco_journal_sign',
        sourceRecordId: signedEntry.entryId,
        originalFileName: 'journal-' + signedEntry.entryId + '.pdf',
        storageProvider: 'local',
        storageKey: putResult.storageKey,
        checksum: 'sha256:' + putResult.checksum,
        fileSize: body.length,
        mimeType: 'application/pdf',
        category: 'journal',
        documentDate: signedEntry.signedAt,
        isJournalRelevant: true,
        auditRequired: true,
        status: 'IMPORTED_TO_CCO',
      }, { actor });
      pdfCount += 1;
    },
  });

  const tenantId = 'hairtpclinic';
  const patientId = 'anon-patient-001';

  // Step 1: skapa + signera original
  console.log('\nStep 1: skapa + signera ORIGINAL');
  const original = await journalStore.upsertEntry({
    tenantId, patientId,
    journalType: 'consultation_plan',
    title: 'Konsultation (smoke)',
    fields: { note: 'Originalanteckning' },
    actor: { userId: 'dr-anon', displayName: 'Dr Anon', role: 'doctor' },
  });
  const signedOrig = await journalStore.signEntry({
    tenantId, patientId, entryId: original.entryId,
    actor: { userId: 'dr-anon', displayName: 'Dr Anon', role: 'doctor' },
  });
  console.log('  original.entryId:', signedOrig.entryId, '· locked:', signedOrig.locked);

  // Step 2: försök edit (måste blockeras)
  console.log('\nStep 2: försök upsert/edit på låst original');
  let editBlocked = false;
  try {
    await journalStore.upsertEntry({
      tenantId, patientId, entryId: original.entryId,
      journalType: 'consultation_plan',
      title: 'Försöker ändra...',
      fields: { note: 'TYST ÄNDRING — får inte gå igenom' },
      actor: { userId: 'dr-anon', displayName: 'Dr Anon', role: 'doctor' },
    });
  } catch (err) {
    editBlocked = true;
    console.log('  ✅ edit blockerades:', err.message);
  }
  if (!editBlocked) {
    console.log('  ❌ edit tilläts!');
  }

  // Step 3: addCorrection (ny entry, ej edit)
  console.log('\nStep 3: skapa rättelse via addCorrection()');
  const correction = await journalStore.addCorrection({
    tenantId, patientId, entryId: original.entryId,
    fields: { note: 'Rättad anteckning' },
    reason: 'Felaktig dosering noterad i punkt 3 — rättas till korrekt värde.',
    actor: { userId: 'dr-anon', displayName: 'Dr Anon', role: 'doctor' },
  });
  console.log('  correction.entryId:', correction.entryId);
  console.log('  correction.correctionOfEntryId:', correction.correctionOfEntryId);
  console.log('  correction.correctionReason:', correction.correctionReason);
  console.log('  correction.correctionCreatedBy:', correction.correctionCreatedBy);
  console.log('  correction.locked:', correction.locked);
  console.log('  correction.status:', correction.status);

  // Step 4: signera rättelsen → ny PDF + asset
  console.log('\nStep 4: signera rättelsen → ny PDF + asset');
  const signedCorr = await journalStore.signEntry({
    tenantId, patientId, entryId: correction.entryId,
    actor: { userId: 'dr-anon', displayName: 'Dr Anon', role: 'doctor' },
  });
  console.log('  correction locked:', signedCorr.locked, '· status:', signedCorr.status);

  // Step 5: verifiera båda finns + båda har egna assets
  console.log('\nStep 5: verifiera assets och original-state');
  const assets = assetStore.listAssetsForPatient(patientId, {}, { actor: { role: 'system' } });
  console.log('  total assets:', assets.length, '(förväntat 2)');
  console.log('  pdf-hook körd:', pdfCount, 'ggr (förväntat 2)');

  const allEntries = await journalStore.listEntries({ tenantId, patientId });
  console.log('  total journal-entries:', allEntries.length, '(förväntat 2)');
  const origReloaded = allEntries.find(e => e.entryId === original.entryId);
  console.log('  original.locked efter allt:', origReloaded.locked, '(måste vara true)');
  console.log('  original.fields.note:', origReloaded.fields.note, '(måste vara "Originalanteckning")');

  // Checks
  const checks = {
    'edit av låst original blockerades': editBlocked,
    'correction skapades som ny entry (annan entryId)': correction.entryId !== original.entryId,
    'correction.correctionOfEntryId pekar på original': correction.correctionOfEntryId === original.entryId,
    'correction.correctionReason satt (>10 chars)': (correction.correctionReason || '').length >= 10,
    'correction.correctionCreatedBy satt': !!correction.correctionCreatedBy,
    'correction.correctionCreatedAt satt': !!correction.correctionCreatedAt,
    'correction startade som draft': correction.status === 'draft' && !correction.locked,
    'correction kunde signeras': signedCorr.locked === true,
    'original FÖRBLIR locked': origReloaded.locked === true,
    'original behåller sin ursprungliga note': origReloaded.fields.note === 'Originalanteckning',
    '2 journal-entries finns': allEntries.length === 2,
    '2 assets skapade (1 per signerad)': assets.length === 2,
    'PDF-hook kördes 2 ggr': pdfCount === 2,
    'båda assets har category=journal': assets.every(a => a.category === 'journal'),
    'båda assets har storageKey + checksum': assets.every(a => a.storageKey && a.checksum),
  };

  console.log('\n=== Verifiering ===');
  let pass = 0, fail = 0;
  for (const [k, v] of Object.entries(checks)) {
    console.log((v ? '  ✅' : '  ❌') + ' ' + k);
    if (v) pass += 1; else fail += 1;
  }
  console.log('\n' + pass + '/' + (pass + fail) + ' kontroller passerade.');

  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
  console.log(fail === 0 ? '\n🎉 ALL CHECKS PASS' : '\n❌ ' + fail + ' check(s) failed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error('FEL:', err); process.exit(2); });
