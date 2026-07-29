'use strict';

/**
 * ORD-89 steg 2 — vakt för migreringen.
 *
 * Det här skriver i kunddata i drift. Testerna nedan handlar därför inte om
 * att migreringen fungerar när allt går rätt, utan om att den STANNAR när
 * något går fel — och att den stannar innan sharden är rörd.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { migrateMailboxBodies, decodedCharsOf } = require('../../src/ops/ccoMailboxTruthBodyMigration');
const bodyStore = require('../../src/ops/ccoMailboxTruthBodyStore');

function setup(messages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ord89-mig-'));
  const shardDir = path.join(root, 'mailboxes');
  fs.mkdirSync(shardDir, { recursive: true });
  const shardPath = path.join(shardDir, 'a_b_se.json');
  fs.writeFileSync(shardPath, JSON.stringify({ version: 1, messages }), 'utf8');
  return { config: { ccoMailboxTruthShardDir: root }, shardPath, root };
}

const SAMPLE = {
  'a@b.se:m1': { id: 'm1', bodyText: 'Hej åäö', bodyHtml: '<p>Hej 🙂</p>', bodyPreview: 'Hej' },
  'a@b.se:m2': { id: 'm2', bodyText: 'Andra', bodyPreview: 'Andra' },
  'a@b.se:m3': { id: 'm3', bodyPreview: 'utan brödtext' },
};

test('torrkörning skriver sidofiler men rör inte sharden', async () => {
  const { config, shardPath } = setup(structuredClone(SAMPLE));
  const before = fs.readFileSync(shardPath, 'utf8');
  const report = await migrateMailboxBodies({ config, mailboxId: 'a@b.se', shardPath });
  assert.equal(report.stoppedBecause, 'torrkorning');
  assert.equal(report.written, 2, 'meddelandet utan brödtext ska hoppas över');
  assert.equal(fs.readFileSync(shardPath, 'utf8'), before, 'sharden får inte röras');
});

test('backup tas innan något skrivs', async () => {
  const { config, shardPath } = setup(structuredClone(SAMPLE));
  const report = await migrateMailboxBodies({ config, mailboxId: 'a@b.se', shardPath });
  assert.ok(report.backupPath, 'backup måste finnas');
  assert.ok(fs.existsSync(report.backupPath));
});

test('apply tar bort fälten ur sharden men behåller bodyPreview', async () => {
  // bodyPreview är villkoret för att bodyText alls skrivs, och den är det
  // worklisten och historiksöket läser. Flyttas den ändras VILKA meddelanden
  // som har en brödtext, inte bara var den ligger.
  const { config, shardPath } = setup(structuredClone(SAMPLE));
  const report = await migrateMailboxBodies({ config, mailboxId: 'a@b.se', shardPath, apply: true });
  assert.equal(report.stoppedBecause, '');
  const after = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  assert.equal(after.messages['a@b.se:m1'].bodyText, undefined);
  assert.equal(after.messages['a@b.se:m1'].bodyHtml, undefined);
  assert.equal(after.messages['a@b.se:m1'].bodyPreview, 'Hej');
  assert.ok(report.fileBytesAfter < report.fileBytesBefore);
});

test('texten kommer tillbaka exakt genom hydreringen', async () => {
  const { config, shardPath } = setup(structuredClone(SAMPLE));
  await migrateMailboxBodies({ config, mailboxId: 'a@b.se', shardPath, apply: true });
  const after = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  const hydrated = await bodyStore.hydrateMessageBody(after.messages['a@b.se:m1'], {
    bodyRoot: bodyStore.resolveBodyRoot(config),
    mailboxId: 'a@b.se',
    messageKey: 'a@b.se:m1',
  });
  assert.equal(hydrated.bodyText, SAMPLE['a@b.se:m1'].bodyText);
  assert.equal(hydrated.bodyHtml, SAMPLE['a@b.se:m1'].bodyHtml);
});

test('verifieringen jämför decodedChars, inte byte', async () => {
  // Sidofilen får sin egen escaping och objekt-omslutning, så byteantalet KAN
  // inte vara lika. Jämförde vi byte skulle varje migrering larma falskt.
  const { config, shardPath } = setup(structuredClone(SAMPLE));
  const report = await migrateMailboxBodies({ config, mailboxId: 'a@b.se', shardPath });
  assert.equal(report.verifiedDecodedChars, report.expectedDecodedChars);
  const bodyRoot = bodyStore.resolveBodyRoot(config);
  const filePath = bodyStore.bodyFilePath({ bodyRoot, mailboxId: 'a@b.se', messageKey: 'a@b.se:m1' });
  const rawBytes = fs.statSync(filePath).size;
  const chars = decodedCharsOf(SAMPLE['a@b.se:m1']);
  assert.notEqual(rawBytes, chars, 'byte och tecken är olika tal — det är hela poängen');
});

test('otillräckligt diskutrymme stoppar innan backup tas', async () => {
  const { config, shardPath } = setup(structuredClone(SAMPLE));
  const report = await migrateMailboxBodies({
    config,
    mailboxId: 'a@b.se',
    shardPath,
    apply: true,
    marginRatio: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(report.stoppedBecause, 'otillrackligt_diskutrymme');
  assert.equal(report.backupPath, undefined, 'inget får skrivas när spärren fäller');
  const after = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  assert.equal(after.messages['a@b.se:m1'].bodyText, 'Hej åäö');
});

test('en förlorad sidofil stoppar migreringen med sharden intakt', async () => {
  // Det här är hela skälet till att verifieringen ligger FÖRE omskrivningen.
  const { config, shardPath } = setup(structuredClone(SAMPLE));
  let calls = 0;
  const report = await migrateMailboxBodies({
    config,
    mailboxId: 'a@b.se',
    shardPath,
    apply: true,
    deps: {
      writeBody: async (filePath, body) => {
        calls += 1;
        // Andra skrivningen "lyckas" utan att lämna någon fil efter sig.
        if (calls === 2) return {};
        return bodyStore.writeBody(filePath, body);
      },
      readBody: bodyStore.readBody,
    },
  });
  assert.equal(report.stoppedBecause, 'sidofil_saknas_efter_skrivning');
  const after = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  assert.equal(after.messages['a@b.se:m1'].bodyText, 'Hej åäö', 'sharden ska vara orörd');
  assert.equal(after.messages['a@b.se:m2'].bodyText, 'Andra', 'ingen text får ha tappats');
});

test('en text som kommer tillbaka förkortad stoppar migreringen', async () => {
  // decodedChars-kontrollen är det som skiljer "skrev filerna" från "texten
  // kom fram". En trunkerad skrivning ser ut som en lyckad skrivning.
  const { config, shardPath } = setup(structuredClone(SAMPLE));
  const report = await migrateMailboxBodies({
    config,
    mailboxId: 'a@b.se',
    shardPath,
    apply: true,
    deps: {
      writeBody: bodyStore.writeBody,
      readBody: async (filePath) => {
        const stored = await bodyStore.readBody(filePath);
        if (!stored) return stored;
        return { ...stored, bodyText: String(stored.bodyText || '').slice(0, 2) };
      },
    },
  });
  assert.equal(report.stoppedBecause, 'decoded_chars_stammer_inte');
  assert.ok(report.verifiedDecodedChars < report.expectedDecodedChars);
  const after = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  assert.equal(after.messages['a@b.se:m1'].bodyText, 'Hej åäö', 'sharden ska vara orörd');
});
