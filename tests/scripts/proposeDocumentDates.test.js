'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const {
  parseArgs,
  extractSessionMarker,
  extractDatesFromText,
  extractUnixTimestamps,
} = require('../../scripts/propose-document-dates');

async function makeDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'arcana-propose-document-dates-'));
}

function runScript(dir) {
  const scriptPath = path.join(__dirname, '../../scripts/propose-document-dates.js');
  const out = execFileSync(
    'node',
    [
      scriptPath,
      '--patient-assets-store',
      path.join(dir, 'cco-patient-assets.json'),
      '--patients-store',
      path.join(dir, 'cco-patient-master.json'),
      '--journal-store',
      path.join(dir, 'cco-journal.json'),
      '--tenant',
      'test-tenant',
      '--output',
      path.join(dir, 'proposals.json'),
    ],
    { encoding: 'utf8' }
  );
  const report = JSON.parse(fsSync.readFileSync(path.join(dir, 'proposals.json'), 'utf8'));
  return { stdout: out, report };
}

test('parseArgs requires all four explicit paths, no silent defaults', () => {
  assert.throws(() => parseArgs(['node', 'script']), /--patient-assets-store/);
  assert.throws(
    () => parseArgs(['node', 'script', '--patient-assets-store', 'x']),
    /--patients-store/
  );
  assert.throws(
    () => parseArgs(['node', 'script', '--patient-assets-store', 'x', '--patients-store', 'y']),
    /--journal-store/
  );
});

// Bugbot-fynd (2026-08-14, PR #1381, Medium): (\d+) fångade även 4-siffriga
// årtal som sessionsmarkör.
test('extractSessionMarker: accepterar 1-99, avvisar årtal och andra långa tal', () => {
  assert.equal(extractSessionMarker('behandling 2'), 2);
  assert.equal(extractSessionMarker('PRP-12'), 12);
  assert.equal(extractSessionMarker('session_7'), 7);
  assert.equal(
    extractSessionMarker('behandling 2026'),
    null,
    'ett årtal ska aldrig tolkas som sessionsnummer'
  );
  assert.equal(extractSessionMarker('session 100'), null, 'tre siffror är utanför 1-99');
  assert.equal(extractSessionMarker('inget här'), null);
});

test('extractDatesFromText/extractUnixTimestamps: grundläggande sanity', () => {
  assert.deepEqual([...extractDatesFromText('foto-2026-03-05-x.jpg')], ['2026-03-05']);
  assert.deepEqual([...extractDatesFromText('IMG_20260305_1.jpg')], ['2026-03-05']);
  assert.deepEqual([...extractUnixTimestamps('export_1775754989.json')], ['2026-04-09']);
  assert.deepEqual(
    [...extractDatesFromText('journal_20260305_1.pdf')],
    ['2026-03-05'],
    'underscore-separerat kompakt datum ska matcha (regression för \\b-buggen)'
  );
});

test('propose-document-dates: kastar på tom patientpopulation (assertPatientsResolved-skydd)', async () => {
  const dir = await makeDir();
  await createCcoPatientMasterStore({ filePath: path.join(dir, 'cco-patient-master.json') });
  await createCcoPatientAssetStore({ filePath: path.join(dir, 'cco-patient-assets.json') });
  await createCcoJournalStore({ filePath: path.join(dir, 'cco-journal.json') });

  assert.throws(() => runScript(dir), /0 patienter|--patients-store/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: eget sökvägsdatum ger high, poolad index-zip nedgraderas till medium (Bugbot High-fynd)', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const patient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Test Patient',
    primaryEmail: 'test@example.test',
  });

  const journalStore = await createCcoJournalStore({
    filePath: path.join(dir, 'cco-journal.json'),
  });
  // Bugbot-fynd (Medium): journalDatum ska läsas via resolveJournalDate,
  // inklusive importMeta.relativePath — inte via [title, fileName, ...].
  await journalStore.upsertEntry({
    tenantId: 'test-tenant',
    patientId: patient.id,
    journalType: 'historical_import',
    status: 'signed',
    title: 'Journalanteckning',
    importMeta: { relativePath: 'Kunder/2026-02-01/journal.pdf' },
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  // Asset A: session-markör 2, OCH ett riktigt datum i sin EGEN sökväg —
  // ska bli 'high' med just det datumet, inte poolens index-zip-gissning.
  const assetA = await assetStore.addAsset({
    patientId: patient.id,
    sourceSystem: 'drive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'application/pdf',
    category: 'journal',
    originalFileName: 'journal-tp-note.pdf',
    originalDrivePath: 'Kunder/2026-03-05 session2/journal-tp-note.pdf',
  });
  // Asset B: samma session-markör 2, men INGET eget datum i sin sökväg —
  // faller tillbaka på index-zip mot poolen, ska bli 'medium' (aldrig 'high').
  const assetB = await assetStore.addAsset({
    patientId: patient.id,
    sourceSystem: 'drive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'application/pdf',
    category: 'journal',
    originalFileName: 'journal-tp-note-b.pdf',
    originalDrivePath: 'Kunder/session2/journal-tp-note-b.pdf',
  });

  const { report } = runScript(dir);
  assert.equal(report.readOnly, true);
  assert.equal(report.zeroWrites, true);

  const allProposals = report.patients.flatMap((p) => p.proposals);
  const propA = allProposals.find((p) => p.assetId === assetA.id);
  const propB = allProposals.find((p) => p.assetId === assetB.id);

  assert.ok(propA, 'asset A ska finnas i förslagen');
  assert.equal(propA.confidence, 'high');
  assert.equal(propA.proposedDocumentDate, '2026-03-05');
  assert.equal(propA.reason, 'own-path-date-session-2');

  assert.ok(propB, 'asset B ska finnas i förslagen');
  assert.notEqual(
    propB.confidence,
    'high',
    'index-zip mot poolad lista är en gissning, aldrig high'
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: sessionsmarkör-regex accepterar inte ett årtal i sökvägen (Bugbot Medium-fynd)', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const patient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Årtals Patient',
    primaryEmail: 'year@example.test',
  });
  await createCcoJournalStore({ filePath: path.join(dir, 'cco-journal.json') });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  const asset = await assetStore.addAsset({
    patientId: patient.id,
    sourceSystem: 'drive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'application/pdf',
    category: 'journal',
    originalFileName: 'journal-tp-note.pdf',
    originalDrivePath: 'Kunder/behandling 2026/journal-tp-note.pdf',
  });

  const { report } = runScript(dir);
  const allProposals = report.patients.flatMap((p) => p.proposals);
  const prop = allProposals.find((p) => p.assetId === asset.id);
  assert.ok(prop);
  assert.equal(prop.reason, 'no-session-marker', 'ett årtal ska inte tolkas som en sessionsmarkör');

  await fs.rm(dir, { recursive: true, force: true });
});
