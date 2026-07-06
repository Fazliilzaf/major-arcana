const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoMailboxTruthStore,
  hydrateStoredMessage,
} = require('../../src/ops/ccoMailboxTruthStore');

test('truth store keeps the full mail body locally (Mac Mail-modell, ingen 500-slim)', () => {
  const longText = `Hej! ${'x'.repeat(2000)}`;

  // Ren text-mail (kontaktformulär): hela texten ska sparas, inte kapas.
  const storedText = hydrateStoredMessage({
    mailboxId: 'kons@hairtpclinic.com',
    graphMessageId: 'AAA',
    body: { contentType: 'text', content: longText },
    bodyPreview: longText.slice(0, 255),
  });
  assert.equal(storedText.bodyText, longText, 'full plain-text body ska lagras');
  assert.ok(storedText.bodyText.length > 500, 'kroppen får inte slimmas till 500 tecken');
  assert.ok(
    typeof storedText.bodyPreview === 'string' && storedText.bodyPreview.length <= 500,
    'bodyPreview hålls kort för worklist-listan'
  );

  // HTML-mail med bild/signatur: full HTML behålls (loggor/bilder renderas).
  const htmlBody = '<div><img src="cid:logo"><p>Signatur med logga</p></div>';
  const storedHtml = hydrateStoredMessage({
    mailboxId: 'kons@hairtpclinic.com',
    graphMessageId: 'BBB',
    bodyHtml: htmlBody,
  });
  assert.equal(storedHtml.bodyHtml, htmlBody, 'full bodyHtml ska lagras');

  // Text-HTML utan bild/tabell fick förr kastas — nu behålls den.
  const storedPlainHtml = hydrateStoredMessage({
    mailboxId: 'kons@hairtpclinic.com',
    graphMessageId: 'CCC',
    bodyHtml: '<p>Bara text, ingen bild</p>',
  });
  assert.equal(
    storedPlainHtml.bodyHtml,
    '<p>Bara text, ingen bild</p>',
    'text-HTML får inte längre slimmas bort'
  );

  // Full HTML kan även extraheras ur Graph-body-objektet.
  const storedGraphHtml = hydrateStoredMessage({
    mailboxId: 'kons@hairtpclinic.com',
    graphMessageId: 'DDD',
    body: { contentType: 'html', content: '<p>Från Graph-body</p>' },
  });
  assert.equal(storedGraphHtml.bodyHtml, '<p>Från Graph-body</p>', 'html-body ska extraheras');
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
