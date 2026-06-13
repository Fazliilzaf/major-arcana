'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const {
  extractFieldPairs,
  isHalsoHealthDeclarationMessage,
  isHalsoHealthDeclarationSubject,
  parseHealthDeclarationMessage,
} = require('../../src/ops/ccoHalsoHealthDeclarationParser');
const {
  buildHealthDeclarationDedupKeys,
  createCcoHalsoHealthDeclarationIngest,
  matchPatientFromParsed,
} = require('../../src/ops/ccoHalsoHealthDeclarationIngest');
const {
  createCcoPatientMasterStore,
  buildPatientCardReadout,
} = require('../../src/ops/ccoPatientMasterStore');
const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');
const { processRawMessage } = require('../../src/ops/ccoMailIngestion/pipeline');

const SAMPLE_BODY = `
Personnummer: 19801224-5513
E-post: hd-test@example.com
Telefon: 0701234567
Namn: Test Person
Inkom: 2026-06-03 14:20
Använder du tobak- eller nikotinprodukter: Ja
Är du gravid eller ammar: Nej
Har du diagnostiserat högt blodtryck: Ja
Är du allergisk eller överkänslig mot något läkemedel: Ja Penicillin
Jag bekräftar att jag har besvarat frågorna så korrekt som möjligt: Ja
`;

test('isHalsoHealthDeclarationSubject accepts webb health declaration subjects', () => {
  assert.equal(isHalsoHealthDeclarationSubject('[Hälsodeklaration/Webb] Hair TP'), true);
  assert.equal(isHalsoHealthDeclarationSubject('[Injektions-journal/Webb] Hair TP'), false);
});

test('isHalsoFitnessCertificateSubject accepts webb fitness certificate subjects', () => {
  const {
    isHalsoFitnessCertificateSubject,
    isHalsoFormSubject,
  } = require('../../src/ops/ccoHalsoHealthDeclarationParser');
  assert.equal(isHalsoFitnessCertificateSubject('[Friskförsäkran/Webb] Viktor Lindberg'), true);
  assert.equal(isHalsoFitnessCertificateSubject('[Hälsodeklaration/Webb] Hair TP'), false);
  assert.equal(isHalsoFormSubject('[Friskförsäkran/Webb] Viktor Lindberg'), true);
});

test('isHalsoHealthDeclarationMessage requires halso mailbox', () => {
  assert.equal(
    isHalsoHealthDeclarationMessage(
      {
        mailboxId: 'halso@hairtpclinic.com',
        subject: '[Hälsodeklaration/Webb] Hair TP',
      },
      { ccoHalsoMailboxEmail: 'halso@hairtpclinic.com' }
    ),
    true
  );
  assert.equal(
    isHalsoHealthDeclarationMessage(
      {
        mailboxId: 'contact@hairtpclinic.com',
        subject: '[Hälsodeklaration/Webb] Hair TP',
      },
      { ccoHalsoMailboxEmail: 'halso@hairtpclinic.com' }
    ),
    false
  );
});

test('extractFieldPairs supports PDF multiline label/value rows', () => {
  const fields = extractFieldPairs(`
Namn:
Jens Bengtsson
Personnummer:
750801-3310
E-post:
jensmbengtsson@gmail.com
Telefon:
0705440481
Datum:
5/7-2024
`);
  assert.equal(fields.namn, 'Jens Bengtsson');
  assert.equal(fields.personnummer, '750801-3310');
  assert.equal(fields['e-post'], 'jensmbengtsson@gmail.com');
  assert.equal(fields.telefon, '0705440481');
  assert.equal(fields.datum, '5/7-2024');
});

test('parseHealthDeclarationFromText parses Phase 1 PDF layout', () => {
  const {
    parseHealthDeclarationFromText,
  } = require('../../src/ops/ccoHalsoHealthDeclarationParser');
  const parsed = parseHealthDeclarationFromText(
    `
Namn:
Jens Bengtsson
Personnummer:
750801-3310
E-post:
jensmbengtsson@gmail.com
Telefon:
0705440481
Datum:
5/7-2024
Röker du?
Nej
`,
    { subject: 'CF7-1720166520-7103.pdf' }
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.personnummer, '19750801-3310');
  assert.equal(parsed.email, 'jensmbengtsson@gmail.com');
});

test('parseHealthDeclarationMessage extracts identity, answers and risk flags', () => {
  const parsed = parseHealthDeclarationMessage({
    subject: '[Hälsodeklaration/Webb] Hair TP',
    bodyText: SAMPLE_BODY,
    internetMessageId: '<hd-test@example.com>',
    receivedAt: '2026-06-03T12:20:00.000Z',
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.personnummer, '19801224-5513');
  assert.equal(parsed.email, 'hd-test@example.com');
  assert.ok(parsed.signedAt);
  assert.match(parsed.signedAt, /^2026-06-03/);
  assert.ok(parsed.answers.length >= 4);
  assert.ok(parsed.flags.some((row) => row.key === 'tobacco'));
  assert.ok(parsed.flags.some((row) => row.key === 'hypertension'));
  assert.ok(parsed.allergies.length >= 1);
});

test('buildHealthDeclarationDedupKeys prefers internetMessageId and pnr+signedAt', () => {
  const keys = buildHealthDeclarationDedupKeys(
    {
      personnummer: '19801224-5513',
      signedAt: '2026-06-03T12:20:00.000Z',
      internetMessageId: '<abc@example.com>',
    },
    { id: 'raw-1' }
  );
  assert.ok(keys.some((key) => key.startsWith('internetMessageId:')));
  assert.ok(keys.some((key) => key.startsWith('pnrSignedAt:')));
});

test('matchPatientFromParsed prefers personnummer over email', () => {
  const patients = [
    {
      id: 'p1',
      personnummer: '19801224-5513',
      primaryEmail: 'other@example.com',
      emails: ['other@example.com'],
      phones: [],
    },
    {
      id: 'p2',
      personnummer: '',
      primaryEmail: 'hd-test@example.com',
      emails: ['hd-test@example.com'],
      phones: [],
    },
  ];
  const match = matchPatientFromParsed(
    {
      personnummer: '19801224-5513',
      email: 'hd-test@example.com',
      phoneKey: '',
    },
    patients
  );
  assert.equal(match.status, 'MATCHED');
  assert.equal(match.patientId, 'p1');
  assert.equal(match.method, 'personnummer');
});

test('halso ingest is idempotent on internetMessageId', async () => {
  const tmpDir = os.tmpdir();
  const patientPath = path.join(tmpDir, `cco-patient-hd-${Date.now()}.json`);
  const dedupPath = path.join(tmpDir, `cco-hd-dedup-${Date.now()}.json`);
  const mailPath = path.join(tmpDir, `cco-mail-hd-${Date.now()}.json`);

  const patientStore = await createCcoPatientMasterStore({ filePath: patientPath });
  await patientStore.upsertPatient({
    tenantId: 'hair-tp-clinic',
    id: 'patient-hd-1',
    personnummer: '19801224-5513',
    displayName: 'Test Person',
    primaryEmail: 'hd-test@example.com',
    emails: ['hd-test@example.com'],
    phones: ['0701234567'],
    matchStatus: 'matched',
  });

  const ingest = createCcoHalsoHealthDeclarationIngest({
    config: { defaultTenantId: 'hair-tp-clinic' },
    patientMasterStore: patientStore,
    dedupStorePath: dedupPath,
  });

  const rawMessage = {
    id: 'raw-hd-1',
    mailboxId: 'halso@hairtpclinic.com',
    subject: '[Hälsodeklaration/Webb] Hair TP',
    bodyText: SAMPLE_BODY,
    internetMessageId: '<hd-idempotent@example.com>',
    receivedAt: '2026-06-03T12:20:00.000Z',
    folderType: 'inbox',
  };

  const first = await ingest.processRawMessage({ rawMessage, mode: 'active' });
  const second = await ingest.processRawMessage({ rawMessage, mode: 'active' });

  assert.equal(first.imported, true);
  assert.equal(first.patientId, 'patient-hd-1');
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'duplicate');

  const saved = await patientStore.getPatient({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-hd-1',
  });
  const card = buildPatientCardReadout(saved);
  assert.equal(saved.healthDeclaration.source, 'halso_mailbox');
  assert.ok(card.hasHealthDeclaration);
  assert.equal(card.missingHealthDeclaration, false);
});

test('pipeline routes halso health declaration before non-patient dismiss', async () => {
  const tmpDir = os.tmpdir();
  const patientPath = path.join(tmpDir, `cco-patient-hd-pipe-${Date.now()}.json`);
  const dedupPath = path.join(tmpDir, `cco-hd-dedup-pipe-${Date.now()}.json`);
  const mailPath = path.join(tmpDir, `cco-mail-hd-pipe-${Date.now()}.json`);

  const patientStore = await createCcoPatientMasterStore({ filePath: patientPath });
  await patientStore.upsertPatient({
    tenantId: 'hair-tp-clinic',
    id: 'patient-hd-2',
    personnummer: '19801224-5513',
    displayName: 'Pipeline Person',
    primaryEmail: 'hd-test@example.com',
    emails: ['hd-test@example.com'],
    matchStatus: 'matched',
  });

  const ingest = createCcoHalsoHealthDeclarationIngest({
    config: {
      defaultTenantId: 'hair-tp-clinic',
      ccoHalsoMailboxEmail: 'halso@hairtpclinic.com',
    },
    patientMasterStore: patientStore,
    dedupStorePath: dedupPath,
  });

  const store = await createCcoMailIngestionStore({ filePath: mailPath });
  const account = store.ensureMailAccount({ email: 'halso@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });
  const saved = await store.saveRawMessageFromTruth({
    truthMessage: {
      mailboxId: 'halso@hairtpclinic.com',
      folderType: 'inbox',
      graphMessageId: 'graph-hd-1',
      internetMessageId: '<hd-pipeline@example.com>',
      subject: '[Hälsodeklaration/Webb] Hair TP',
      from: { address: 'noreply@hairtpclinic.com', name: 'Hair TP' },
      bodyPreview: 'Personnummer',
      bodyText: SAMPLE_BODY,
      receivedDateTime: '2026-06-03T12:20:00.000Z',
    },
    mailAccountId: account.id,
    importRunId: run.id,
  });

  const ledger = store.getLedgerByRawMessageId(saved.rawMessage.id);
  const result = await processRawMessage({
    store,
    rawMessage: saved.rawMessage,
    ledger,
    mode: 'active',
    healthDeclarationIngest: ingest,
    tenantId: 'hair-tp-clinic',
  });

  assert.equal(result.imported, true);
  assert.equal(result.classification.mailType, 'health_declaration');
  assert.notEqual(result.reason, 'non_patient_counterparty');
});

test('halso ingest stores fitness certificate separately from health declaration', async () => {
  const tmpDir = os.tmpdir();
  const patientPath = path.join(tmpDir, `cco-patient-fc-${Date.now()}.json`);
  const dedupPath = path.join(tmpDir, `cco-fc-dedup-${Date.now()}.json`);

  const patientStore = await createCcoPatientMasterStore({ filePath: patientPath });
  await patientStore.upsertPatient({
    tenantId: 'hair-tp-clinic',
    id: 'patient-fc-1',
    personnummer: '19801224-5513',
    displayName: 'Test Person',
    primaryEmail: 'hd-test@example.com',
    matchStatus: 'matched',
  });

  const ingest = createCcoHalsoHealthDeclarationIngest({
    config: { defaultTenantId: 'hair-tp-clinic' },
    patientMasterStore: patientStore,
    dedupStorePath: dedupPath,
  });

  const rawMessage = {
    id: 'raw-fc-1',
    mailboxId: 'halso@hairtpclinic.com',
    subject: '[Friskförsäkran/Webb] Viktor Lindberg',
    bodyText: SAMPLE_BODY,
    internetMessageId: '<fc-test@example.com>',
    receivedAt: '2026-06-03T12:20:00.000Z',
  };

  const result = await ingest.processRawMessage({ rawMessage, mode: 'active' });
  assert.equal(result.imported, true);
  assert.equal(result.formType, 'fitness_certificate');

  const saved = await patientStore.getPatient({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-fc-1',
  });
  const card = buildPatientCardReadout(saved);
  assert.equal(saved.fitnessCertificate.source, 'halso_mailbox');
  assert.equal(saved.fitnessCertificate.formType, 'fitness_certificate');
  assert.ok(card.hasFitnessCertificate);
  assert.equal(card.missingFitnessCertificate, false);
  assert.equal(card.missingHealthDeclaration, true);
});
