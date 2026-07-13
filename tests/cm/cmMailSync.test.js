'use strict';

// ORD-64 · cmMailSync v2: delta-cursor, dedupe, originalarkiv, bilagor, ledger.
// Fixture-connector — inga nätanrop. OPENAI_API_KEY nollas så extraktion
// fail-closed:ar utan externa anrop.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCmStore } = require('../../src/cm/cmStore');
const { createCmMailSync } = require('../../src/cm/cmMailSync');

delete process.env.OPENAI_API_KEY;

function makeMessage({ id, subject, body = '', hasAttachments = false }) {
  return {
    id,
    internetMessageId: `<${id}@test>`,
    subject,
    from: { emailAddress: { address: 'leverantor@test.se' } },
    receivedDateTime: '2026-07-12T10:00:00Z',
    hasAttachments,
    body: { content: body },
    bodyPreview: body.slice(0, 200),
  };
}

function makeFixtureConnector({ messages, deltaLink = 'https://graph/delta?token=DL1' }) {
  const calls = { deltaPages: [], attachmentContent: [] };
  return {
    calls,
    graphBaseUrl: 'https://graph.test/v1.0',
    async fetchAccessToken() {
      return 'token-123';
    },
    async fetchMailboxTruthFolderDeltaPage({ userId, folderType, cursorUrl }) {
      calls.deltaPages.push({ userId, folderType, cursorUrl });
      return {
        account: { mailboxId: userId },
        folder: { folderType },
        page: { nextPageUrl: null, deltaLink, complete: true },
        changes: messages.map((m) => ({ changeType: 'upsert', message: m })),
      };
    },
    async fetchMessageAttachmentContent({ messageId, attachmentId }) {
      calls.attachmentContent.push({ messageId, attachmentId });
      return {
        attachmentId,
        name: 'faktura.pdf',
        contentType: 'application/pdf',
        size: 13,
        isInline: false,
        buffer: Buffer.from('%PDF-1.4 fake'),
      };
    },
  };
}

function makeFakeSecureStorage() {
  const objects = [];
  return {
    objects,
    async putObject({ key, body, contentType }) {
      objects.push({
        key,
        size: Buffer.isBuffer(body) ? body.length : String(body).length,
        contentType,
      });
      return { storageKey: key, checksum: 'deadbeef', size: 1, deduped: false };
    },
  };
}

async function tmpStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-mailsync-test-'));
  const store = createCmStore({ filePath: path.join(dir, 'cm.json') });
  return store;
}

test('syncFolder: importerar ekonomimail, skippar övrigt, sparar deltaLink + original', async () => {
  const cmStore = await tmpStore();
  const connector = makeFixtureConnector({
    messages: [
      makeMessage({
        id: 'm1',
        subject: 'Faktura 2026-100',
        body: 'Att betala: 1 250 kr. Förfallodatum 2026-08-01. OCR 123456.',
      }),
      makeMessage({ id: 'm2', subject: 'Nyhetsbrev juli', body: 'Hej! Kul saker har hänt.' }),
    ],
  });
  const secureStorage = makeFakeSecureStorage();
  const sync = createCmMailSync({ graphReadConnector: connector, cmStore, secureStorage });

  const result = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.duplicates, 0);

  // deltaLink persisterad
  assert.equal(
    cmStore.getSyncState('kons@test.se', 'inbox').deltaLink,
    'https://graph/delta?token=DL1'
  );
  // original arkiverat (BFN)
  assert.ok(secureStorage.objects.some((o) => o.key.startsWith('cm/raw-mail/')));
  // extraktion körd utan nyckel → fel loggat men importen står
  assert.ok(result.errors.some((e) => /OPENAI_API_KEY saknas/.test(e.error)));
});

test('syncFolder: andra körningen dedupear (samma meddelanden)', async () => {
  const cmStore = await tmpStore();
  const connector = makeFixtureConnector({
    messages: [
      makeMessage({ id: 'm1', subject: 'Kvitto café', body: 'Kvitto på 85 kr betalt med kort.' }),
    ],
  });
  const sync = createCmMailSync({
    graphReadConnector: connector,
    cmStore,
    secureStorage: makeFakeSecureStorage(),
  });

  const first = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(first.imported, 1);
  const second = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(second.imported, 0);
  assert.equal(second.duplicates, 1);
  // cursorn användes i andra körningen
  assert.equal(connector.calls.deltaPages[1].cursorUrl, 'https://graph/delta?token=DL1');
});

test('syncFolder: PDF-bilaga sparas i secure storage + dokument skapas', async () => {
  const cmStore = await tmpStore();
  const connector = makeFixtureConnector({
    messages: [
      makeMessage({
        id: 'm3',
        subject: 'Er faktura',
        hasAttachments: true,
        body: 'Se bifogad faktura.',
      }),
    ],
  });
  const secureStorage = makeFakeSecureStorage();
  const fetchImpl = async (url, init) => {
    assert.match(url, /attachments\?\$select/);
    // ORD-67f: immutable-ID-headern MÅSTE följa med — annars Graph 400 i prod.
    assert.equal(init?.headers?.Prefer, 'IdType="ImmutableId"');
    return {
      ok: true,
      async json() {
        return {
          value: [
            {
              id: 'a1',
              name: 'faktura.pdf',
              contentType: 'application/pdf',
              size: 1234,
              isInline: false,
            },
          ],
        };
      },
    };
  };
  const sync = createCmMailSync({
    graphReadConnector: connector,
    cmStore,
    secureStorage,
    fetchImpl,
  });

  const result = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(result.imported, 1);
  assert.equal(connector.calls.attachmentContent.length, 1);
  assert.ok(
    secureStorage.objects.some(
      (o) => o.key.startsWith('cm/receipts/') && o.key.endsWith('faktura.pdf')
    )
  );

  const dash = cmStore.getDashboard();
  assert.equal(dash.totalDocuments, 1);
});

test('syncFolder: ogiltig delta-token → cursor nollställs + omstart utan cursor', async () => {
  const cmStore = await tmpStore();
  cmStore.setSyncState('kons@test.se', 'inbox', { deltaLink: 'https://graph/delta?token=OLD' });

  let call = 0;
  const connector = {
    graphBaseUrl: 'https://graph.test/v1.0',
    async fetchAccessToken() {
      return 't';
    },
    async fetchMailboxTruthFolderDeltaPage({ cursorUrl }) {
      call++;
      if (call === 1) {
        assert.equal(cursorUrl, 'https://graph/delta?token=OLD');
        const err = new Error('delta token invalid');
        err.code = 'GRAPH_DELTA_TOKEN_INVALID';
        throw err;
      }
      assert.equal(cursorUrl, null);
      return {
        page: { nextPageUrl: null, deltaLink: 'https://graph/delta?token=FRESH', complete: true },
        changes: [],
      };
    },
  };
  const sync = createCmMailSync({ graphReadConnector: connector, cmStore, secureStorage: null });
  const result = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(result.ok, true);
  assert.equal(call, 2);
  assert.equal(
    cmStore.getSyncState('kons@test.se', 'inbox').deltaLink,
    'https://graph/delta?token=FRESH'
  );
});

test('syncFolder utan delta-API → ärligt fel (ingen tyst no-op)', async () => {
  const cmStore = await tmpStore();
  const sync = createCmMailSync({ graphReadConnector: {}, cmStore });
  const result = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(result.ok, false);
  assert.match(result.error, /delta-API/);
});
