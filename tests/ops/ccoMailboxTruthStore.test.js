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
  // Ren text (ingen img/table) → ingen tung bodyHtml lagras (grinden oförändrad).
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
