const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');

test('truth store bevarar hela ren-text-brödtexten (capad) — inte bara ~255-preview', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-body-'));
  const filePath = path.join(tempDir, 'mailbox.json');
  const store = await createCcoMailboxTruthStore({ filePath, deferConversationRebuild: true });

  // Inkommande kontaktformulär: ren text, ingen <img>/<table>. Graph ger en kapad
  // ~255-teckens bodyPreview + hela texten i body.content (här som bodyHtml).
  const preview =
    'Från: Sudarshan E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hi, I am a foreigner residing in Umea, Sweden. I recently have had a hair transpl';
  const fullBody = `${preview} ant abroad. Its been about 5 months now. I am experiencing redness and would like advice about aftercare. GDPR: Jag godkänner att mina personuppgifter behandlas.`;

  await store.recordFolderPage({
    runId: 'run-body-1',
    account: { mailboxId: 'kons@hairtpclinic.com', mailboxAddress: 'kons@hairtpclinic.com' },
    folder: { folderType: 'inbox', totalItemCount: 1, messageCollectionCount: 1 },
    messages: [
      {
        mailboxId: 'kons@hairtpclinic.com',
        graphMessageId: 'cf-sudarshan-1',
        folderType: 'inbox',
        conversationId: 'contact-form',
        subject: 'Sudarshan Kontaktformulär',
        bodyPreview: preview,
        bodyHtml: fullBody,
      },
    ],
    nextPageUrl: null,
    complete: true,
  });

  const [stored] = store.listMessages({ mailboxIds: ['kons@hairtpclinic.com'] });
  assert.ok(stored, 'meddelandet ska ha lagrats');
  // Hela texten ska finnas i bodyText — inte bara den kapade previewen.
  assert.match(stored.bodyText, /Its been about 5 months now/);
  assert.match(stored.bodyText, /personuppgifter behandlas/);
  assert.ok(stored.bodyText.length > preview.length, 'bodyText ska vara längre än previewen');
  // Ren text lagras fortsatt bara som bodyText; HTML är reserverat för faktisk
  // mailsignatur/layout.
  assert.equal(stored.bodyHtml, undefined);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('truth store cap:ar lagrad bodyText så shard-filerna inte växer okontrollerat', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-cap-'));
  const filePath = path.join(tempDir, 'mailbox.json');
  const store = await createCcoMailboxTruthStore({ filePath, deferConversationRebuild: true });

  const hugeBody = 'A'.repeat(50000);
  await store.recordFolderPage({
    runId: 'run-cap-1',
    account: { mailboxId: 'kons@hairtpclinic.com', mailboxAddress: 'kons@hairtpclinic.com' },
    folder: { folderType: 'inbox', totalItemCount: 1, messageCollectionCount: 1 },
    messages: [
      {
        mailboxId: 'kons@hairtpclinic.com',
        graphMessageId: 'cf-huge-1',
        folderType: 'inbox',
        conversationId: 'contact-form',
        subject: 'Långt mail',
        bodyPreview: 'Kort preview',
        bodyHtml: hugeBody,
      },
    ],
    nextPageUrl: null,
    complete: true,
  });

  const [stored] = store.listMessages({ mailboxIds: ['kons@hairtpclinic.com'] });
  assert.ok(stored.bodyText.length <= 16000, 'bodyText ska cap:as till 16000 tecken');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('truth store bevarar liten HTML-signatur men aldrig inbäddade bildbytes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-html-'));
  const filePath = path.join(tempDir, 'mailbox.json');
  const store = await createCcoMailboxTruthStore({ filePath, deferConversationRebuild: true });

  await store.recordFolderPage({
    runId: 'run-html-1',
    account: { mailboxId: 'kons@hairtpclinic.com', mailboxAddress: 'kons@hairtpclinic.com' },
    folder: { folderType: 'sent', totalItemCount: 1, messageCollectionCount: 1 },
    messages: [
      {
        mailboxId: 'kons@hairtpclinic.com',
        graphMessageId: 'signature-1',
        folderType: 'sent',
        conversationId: 'signature-thread',
        subject: 'Svar med signatur',
        bodyPreview: 'Bästa hälsningar',
        bodyHtml:
          '<div>Hej!</div><table><tr><td>Bästa hälsningar,<br>Hair TP Clinic</td></tr></table><img src="data:image/png;base64,QUJDRA==">',
        hasAttachments: true,
        attachments: [{ id: 'logo-1', name: 'logo.png', contentType: 'image/png', isInline: true }],
      },
    ],
    nextPageUrl: null,
    complete: true,
  });

  const [stored] = store.listMessages({ mailboxIds: ['kons@hairtpclinic.com'] });
  assert.match(stored.bodyHtml, /Bästa hälsningar/);
  assert.equal(stored.bodyHtml.includes('data:image'), false);
  assert.equal(stored.attachments[0]?.id, 'logo-1');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('mailbox truth store preserves small SVG template icons but strips base64 photos', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-svg-'));
  const filePath = path.join(tempDir, 'mailbox.json');
  const store = await createCcoMailboxTruthStore({ filePath, deferConversationRebuild: true });
  const svg =
    'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%228%22%2F%3E%3C%2Fsvg%3E';

  await store.recordFolderPage({
    runId: 'run-svg-1',
    account: { mailboxId: 'fazli@hairtpclinic.com', mailboxAddress: 'fazli@hairtpclinic.com' },
    folder: { folderType: 'sent', totalItemCount: 1, messageCollectionCount: 1 },
    messages: [
      {
        mailboxId: 'fazli@hairtpclinic.com',
        graphMessageId: 'signature-svg-1',
        folderType: 'sent',
        conversationId: 'signature-svg-thread',
        subject: 'SVG-signatur',
        bodyHtml: `<img src="${svg}" alt="Webb"><img src="data:image/png;base64,QUJDRA==">`,
      },
    ],
    complete: true,
  });

  const [stored] = store.listMessages({ mailboxIds: ['fazli@hairtpclinic.com'] });
  assert.equal(stored.bodyHtml.includes(svg), true);
  assert.equal(stored.bodyHtml.includes('data:image/png'), false);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('worklist-läsningen behåller kontaktformsidentitet men lämnar rik maildata i trådvägen', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-worklist-summary-'));
  const filePath = path.join(tempDir, 'mailbox.json');
  const store = await createCcoMailboxTruthStore({ filePath, deferConversationRebuild: true });

  await store.recordFolderPage({
    runId: 'run-worklist-summary-1',
    account: { mailboxId: 'kons@hairtpclinic.com', mailboxAddress: 'kons@hairtpclinic.com' },
    folder: { folderType: 'inbox', totalItemCount: 1, messageCollectionCount: 1 },
    messages: [
      {
        mailboxId: 'kons@hairtpclinic.com',
        graphMessageId: 'worklist-summary-1',
        folderType: 'inbox',
        conversationId: 'contact-form',
        subject: 'Sudarshan Kontaktformulär',
        bodyPreview: 'Från: Sudarshan E-post: sudarshan@example.com Telefon: 0701112233',
        bodyHtml:
          '<p>Från: Sudarshan E-post: sudarshan@example.com Telefon: 0701112233 Hur kan vi hjälpa dig? Jag behöver hjälp inför min behandling.</p><img src="cid:logo-1">',
        attachments: [{ id: 'logo-1', name: 'logo.png', contentType: 'image/png' }],
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
    ],
    nextPageUrl: null,
    complete: true,
  });

  const [summary] = store.listWorklistMessages({ mailboxIds: ['kons@hairtpclinic.com'] });
  assert.equal(summary.bodyText.includes('sudarshan@example.com'), true);
  assert.deepEqual(summary.from, { address: 'wordpress@hairtpclinic.se', name: 'WordPress' });
  assert.equal(Object.hasOwn(summary, 'bodyHtml'), false);
  assert.equal(Object.hasOwn(summary, 'attachments'), false);

  const [richMessage] = store.listMessages({ mailboxIds: ['kons@hairtpclinic.com'] });
  assert.match(richMessage.bodyHtml, /cid:logo-1/);
  assert.equal(richMessage.attachments[0]?.id, 'logo-1');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('mailbox truth store self-heals a corrupt JSON state file at startup', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-store-'));
  const filePath = path.join(tempDir, 'cco-mailbox-truth.json');
  await fs.writeFile(filePath, '{"version":1,"accounts":', 'utf8');

  const store = await createCcoMailboxTruthStore({ filePath });

  assert.equal(typeof store.getCompletenessReport, 'function');

  const repairedRaw = await fs.readFile(filePath, 'utf8');
  const repaired = JSON.parse(repairedRaw);
  assert.equal(repaired.version, 1);
  assert.deepEqual(repaired.accounts, {});
  assert.deepEqual(repaired.folders, {});
  assert.deepEqual(repaired.messages, {});
  assert.deepEqual(repaired.conversations, {});
  assert.deepEqual(repaired.syncCheckpoints, {});
  assert.deepEqual(repaired.syncRuns, []);

  const entries = await fs.readdir(tempDir);
  const backupName =
    entries.find((entry) => entry === 'cco-mailbox-truth.json.corrupt.bak') ||
    entries.find(
      (entry) => entry.startsWith('cco-mailbox-truth.json.') && entry.endsWith('.corrupt.bak')
    );
  assert.equal(Boolean(backupName), true);

  const backupRaw = await fs.readFile(path.join(tempDir, backupName), 'utf8');
  assert.equal(backupRaw, '{"version":1,"accounts":');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('deferConversationRebuild skips eager rebuild on load but keeps completeness conversationCount', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-defer-cold-'));
  const filePath = path.join(tempDir, 'mailbox.json');

  // Persist a shard the same way sharded cold loads see it: messages present,
  // conversations emptied by toPersistedState.
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        accounts: {
          'contact@hairtpclinic.com': {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
          },
        },
        folders: {},
        messages: {
          'contact@hairtpclinic.com:msg-1': {
            mailboxId: 'contact@hairtpclinic.com',
            graphMessageId: 'msg-1',
            folderType: 'inbox',
            conversationId: 'thread-a',
            mailboxConversationId: 'contact@hairtpclinic.com:thread-a',
            subject: 'A',
            receivedDateTime: '2026-01-02T10:00:00.000Z',
          },
          'contact@hairtpclinic.com:msg-2': {
            mailboxId: 'contact@hairtpclinic.com',
            graphMessageId: 'msg-2',
            folderType: 'inbox',
            conversationId: 'thread-a',
            mailboxConversationId: 'contact@hairtpclinic.com:thread-a',
            subject: 'A reply',
            receivedDateTime: '2026-01-02T11:00:00.000Z',
          },
          'contact@hairtpclinic.com:msg-3': {
            mailboxId: 'contact@hairtpclinic.com',
            graphMessageId: 'msg-3',
            folderType: 'inbox',
            conversationId: 'thread-b',
            mailboxConversationId: 'contact@hairtpclinic.com:thread-b',
            subject: 'B',
            receivedDateTime: '2026-01-03T10:00:00.000Z',
          },
        },
        conversations: {},
        syncCheckpoints: {},
        syncRuns: [],
      },
      null,
      2
    ),
    'utf8'
  );

  const deferred = await createCcoMailboxTruthStore({
    filePath,
    deferConversationRebuild: true,
    deferInitialSave: true,
  });
  const deferredReport = deferred.getCompletenessReport({
    mailboxIds: ['contact@hairtpclinic.com'],
  });
  // Eager rebuild would have filled state.conversations; deferred cold load must
  // still report the unique conversation count for consumer truthCoverage.
  assert.equal(deferredReport.metadata.conversationCount, 2);
  assert.equal(deferredReport.metadata.messageCount, 3);
  assert.equal(
    deferred.listWorklistMessages({ mailboxIds: ['contact@hairtpclinic.com'] }).length,
    3
  );

  const eager = await createCcoMailboxTruthStore({
    filePath,
    deferConversationRebuild: false,
    deferInitialSave: true,
  });
  const eagerReport = eager.getCompletenessReport({
    mailboxIds: ['contact@hairtpclinic.com'],
  });
  assert.equal(eagerReport.metadata.conversationCount, 2);

  await fs.rm(tempDir, { recursive: true, force: true });
});
