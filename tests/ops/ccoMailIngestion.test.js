const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { buildDedupeKey, buildDedupeKeyFromTruthMessage } = require('../../src/ops/ccoMailIngestion/dedupe');
const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');
const { processRawMessage, evaluateSourceFilter } = require('../../src/ops/ccoMailIngestion/pipeline');
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
