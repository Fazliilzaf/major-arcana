const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const {
  buildDedupeKey,
  buildDedupeKeyFromTruthMessage,
} = require('../../src/ops/ccoMailIngestion/dedupe');
const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');
const {
  processRawMessage,
  evaluateSourceFilter,
  matchPatientOrEntity,
} = require('../../src/ops/ccoMailIngestion/pipeline');
const {
  validateClientState,
  parseNotificationMailboxEmail,
} = require('../../src/infra/microsoftGraphChangeNotifications');

test('buildDedupeKey is stable for immutable graph ids', () => {
  const keyA = buildDedupeKey({
    mailboxId: 'contact@hairtpclinic.com',
    folderId: 'inbox',
    immutableGraphId: 'AAMkADExample',
  });
  const keyB = buildDedupeKey({
    mailboxId: 'contact@hairtpclinic.com',
    folderId: 'inbox',
    immutableGraphId: 'AAMkADExample',
  });
  assert.equal(keyA, keyB);
  assert.match(keyA, /^contact@hairtpclinic.com:inbox:aamkadexample$/);
});

test('buildDedupeKeyFromTruthMessage prefers internetMessageId', () => {
  const key = buildDedupeKeyFromTruthMessage({
    mailboxId: 'contact@hairtpclinic.com',
    folderId: 'abc',
    internetMessageId: '<msg-123@example.com>',
    graphMessageId: 'graph-1',
    subject: 'Hej',
    from: { address: 'patient@example.com' },
  });
  assert.match(key, /msg-123@example.com/);
});

test('ingestion store dedupes raw messages by dedupeKey', async () => {
  const filePath = path.join(os.tmpdir(), `cco-mail-ingestion-${Date.now()}.json`);
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'contact@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });

  const truthMessage = {
    mailboxId: 'contact@hairtpclinic.com',
    folderType: 'inbox',
    graphMessageId: 'graph-msg-1',
    internetMessageId: '<dup@example.com>',
    subject: 'Bokningsfråga',
    bodyPreview: 'Hej, kan jag boka tid?',
    from: { address: 'patient@example.com', name: 'Patient' },
    receivedAt: '2026-05-26T10:00:00.000Z',
  };

  const first = await store.saveRawMessageFromTruth({
    truthMessage,
    mailAccountId: account.id,
    importRunId: run.id,
  });
  const second = await store.saveRawMessageFromTruth({
    truthMessage,
    mailAccountId: account.id,
    importRunId: run.id,
  });

  assert.equal(first.created, true);
  assert.equal(second.duplicate, true);
  await fs.unlink(filePath).catch(() => {});
});

test('saveRawMessageFromTruth derives full body text from Graph bodyHtml', async () => {
  const filePath = path.join(os.tmpdir(), `cco-mail-ingestion-body-${Date.now()}.json`);
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });

  const saved = await store.saveRawMessageFromTruth({
    truthMessage: {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'inbox',
      graphMessageId: 'graph-full-body-1',
      internetMessageId: '<full-body-1@example.com>',
      subject: 'Kontaktformulär',
      bodyPreview: 'Kort preview som Graph kapar...',
      bodyHtml:
        '<div>Första raden från kontaktformuläret.</div><div>Andra raden med fler detaljer &amp; samtycke.</div>',
      from: { address: 'patient@example.com', name: 'Patient' },
      receivedAt: '2026-05-26T10:00:00.000Z',
    },
    mailAccountId: account.id,
    importRunId: run.id,
  });

  assert.equal(saved.created, true);
  assert.match(saved.rawMessage.bodyText, /Första raden från kontaktformuläret/);
  assert.match(saved.rawMessage.bodyText, /Andra raden med fler detaljer & samtycke/);
  assert.notEqual(saved.rawMessage.bodyText, saved.rawMessage.bodyPreview);
  assert.equal(saved.rawMessage.bodyHtmlStored, true);
  await fs.unlink(filePath).catch(() => {});
});

test('duplicate truth import upgrades preview-only raw body when full body arrives later', async () => {
  const filePath = path.join(os.tmpdir(), `cco-mail-ingestion-body-upgrade-${Date.now()}.json`);
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });

  const previewOnly = {
    mailboxId: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    graphMessageId: 'graph-full-body-2',
    internetMessageId: '<full-body-2@example.com>',
    subject: 'Kontaktformulär',
    bodyPreview: 'Kort preview...',
    from: { address: 'patient@example.com', name: 'Patient' },
    receivedAt: '2026-05-26T10:00:00.000Z',
  };
  const first = await store.saveRawMessageFromTruth({
    truthMessage: previewOnly,
    mailAccountId: account.id,
    importRunId: run.id,
  });
  assert.equal(first.rawMessage.bodyText, 'Kort preview...');

  const second = await store.saveRawMessageFromTruth({
    truthMessage: {
      ...previewOnly,
      bodyHtml:
        '<p>Kort preview.</p><p>Här finns resten av mailet som saknades i första körningen.</p>',
    },
    mailAccountId: account.id,
    importRunId: run.id,
  });

  assert.equal(second.duplicate, true);
  assert.equal(second.rawMessage.id, first.rawMessage.id);
  assert.match(second.rawMessage.bodyText, /resten av mailet som saknades/);
  assert.notEqual(second.rawMessage.bodyText, 'Kort preview...');
  assert.equal(store.getRawMessage(first.rawMessage.id).bodyHtmlStored, true);
  await fs.unlink(filePath).catch(() => {});
});

test('processRawMessage is idempotent for completed ledger versions', async () => {
  const filePath = path.join(os.tmpdir(), `cco-mail-ingestion-pipeline-${Date.now()}.json`);
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'contact@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id });
  const saved = await store.saveRawMessageFromTruth({
    truthMessage: {
      mailboxId: 'contact@hairtpclinic.com',
      folderType: 'inbox',
      graphMessageId: 'graph-msg-2',
      internetMessageId: '<process@example.com>',
      subject: 'Kan jag boka konsultation?',
      bodyPreview: 'Hej, jag vill boka en konsultation.',
      from: { address: 'patient@example.com' },
      receivedAt: '2026-05-26T11:00:00.000Z',
    },
    mailAccountId: account.id,
    importRunId: run.id,
  });

  const first = await processRawMessage({
    store,
    rawMessage: saved.rawMessage,
    ledger: saved.ledger,
    mode: 'read_only',
  });
  const second = await processRawMessage({
    store,
    rawMessage: saved.rawMessage,
    ledger: store.getLedgerByRawMessageId(saved.rawMessage.id),
    mode: 'read_only',
  });

  assert.equal(first.skipped, false);
  assert.equal(second.skipped, true);
  await fs.unlink(filePath).catch(() => {});
});

test('evaluateSourceFilter allows standard mailbox folders', () => {
  assert.equal(evaluateSourceFilter({ folderType: 'sent' }).allowed, true);
  assert.equal(evaluateSourceFilter({ folderType: 'inbox' }).allowed, true);
  assert.equal(evaluateSourceFilter({ folderType: 'unknown' }).allowed, false);
});

test('matchPatientOrEntity matches sent-mail counterparty recipient', () => {
  const result = matchPatientOrEntity(
    {
      mailboxId: 'contact@hairtpclinic.com',
      folderType: 'sent',
      fromEmail: 'contact@hairtpclinic.com',
      toEmails: ['patient@example.com'],
    },
    {
      patientDirectory: [
        {
          id: 'patient-1',
          primaryEmail: 'patient@example.com',
          emails: ['patient@example.com'],
        },
      ],
    }
  );
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.patientId, 'patient-1');
  assert.equal(result.counterpartyEmail, 'patient@example.com');
});

test('linkPatientToMessage marks UNMATCHED ledger as MATCHED', async () => {
  const filePath = path.join(os.tmpdir(), `cco-mail-ingestion-link-${Date.now()}.json`);
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'contact@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id });
  const saved = await store.saveRawMessageFromTruth({
    truthMessage: {
      mailboxId: 'contact@hairtpclinic.com',
      folderType: 'inbox',
      graphMessageId: 'graph-msg-link',
      internetMessageId: '<link@example.com>',
      subject: 'Omatchat',
      bodyPreview: 'Hej',
      from: { address: 'unknown@example.com' },
      receivedAt: '2026-05-26T12:00:00.000Z',
    },
    mailAccountId: account.id,
    importRunId: run.id,
  });
  await store.updateLedger(saved.ledger.id, {
    status: 'UNMATCHED',
    patientMatchStatus: 'UNMATCHED',
    completedAt: new Date().toISOString(),
  });

  const linked = await store.linkPatientToMessage({
    rawMessageId: saved.rawMessage.id,
    patientId: 'patient-99',
    actorUserId: 'owner@test',
  });
  assert.equal(linked.ledger.status, 'MATCHED');
  assert.equal(linked.ledger.patientId, 'patient-99');
  assert.equal(linked.patientMatch.reason, 'manual_link');
  await fs.unlink(filePath).catch(() => {});
});

test('listReviewQueue returns unmatched rows', async () => {
  const filePath = path.join(os.tmpdir(), `cco-mail-ingestion-review-${Date.now()}.json`);
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'contact@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id });
  const saved = await store.saveRawMessageFromTruth({
    truthMessage: {
      mailboxId: 'contact@hairtpclinic.com',
      folderType: 'inbox',
      graphMessageId: 'graph-msg-review',
      internetMessageId: '<review@example.com>',
      subject: 'Review',
      bodyPreview: 'Hej',
      from: { address: 'unknown@example.com' },
      receivedAt: '2026-05-26T13:00:00.000Z',
    },
    mailAccountId: account.id,
    importRunId: run.id,
  });
  await store.updateLedger(saved.ledger.id, {
    status: 'UNMATCHED',
    patientMatchStatus: 'UNMATCHED',
    completedAt: new Date().toISOString(),
  });
  const rows = store.listReviewQueue({
    mailboxEmail: 'contact@hairtpclinic.com',
    statuses: ['UNMATCHED'],
    limit: 10,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ledger.status, 'UNMATCHED');
  await fs.unlink(filePath).catch(() => {});
});

test('graph webhook clientState validation', () => {
  assert.equal(validateClientState('secret', 'secret'), true);
  assert.equal(validateClientState('wrong', 'secret'), false);
});

test('parseNotificationMailboxEmail extracts mailbox from resource path', () => {
  assert.equal(
    parseNotificationMailboxEmail({
      resource: "users('contact@hairtpclinic.com')/mailFolders('Inbox')/messages",
    }),
    'contact@hairtpclinic.com'
  );
});
