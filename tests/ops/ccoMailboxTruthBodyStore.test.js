'use strict';

/**
 * ORD-89 steg 2 — vakt för sidofilslagret.
 *
 * Det som kan gå fel här syns inte i en logg. Det syns som att en operatör
 * öppnar en kundtråd och ser tom text, eller gammal text, eller texten från
 * fel meddelande. Testerna nedan är skrivna mot de utfallen, inte mot API:t.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const store = require('../../src/ops/ccoMailboxTruthBodyStore');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ord89-body-'));
}

test('sökvägen härleds ur nyckeln — ingen index behövs', () => {
  const args = { bodyRoot: '/data/bodies', mailboxId: 'fazli@hairtpclinic.com', messageKey: 'abc' };
  assert.equal(store.bodyFilePath(args), store.bodyFilePath({ ...args }));
  assert.match(store.bodyFilePath(args), /^\/data\/bodies\/fazli@hairtpclinic\.com\/[0-9a-f]{2}\/abc\.json$/);
});

test('två olika nycklar delar aldrig fil', () => {
  const base = { bodyRoot: '/d', mailboxId: 'a@b.se' };
  assert.notEqual(
    store.bodyFilePath({ ...base, messageKey: 'nyckel-1' }),
    store.bodyFilePath({ ...base, messageKey: 'nyckel-2' })
  );
});

test('en nyckel med ../ kan inte skriva utanför datakatalogen', () => {
  // Meddelandenycklar innehåller mailadresser och Graph-id:n. Utan städningen
  // skulle en nyckel kunna peka var som helst på disken.
  const filePath = store.bodyFilePath({
    bodyRoot: '/data/bodies',
    mailboxId: '../../etc',
    messageKey: '../../../passwd',
  });
  assert.ok(filePath.startsWith('/data/bodies/'), filePath);
  assert.ok(!filePath.includes('..'), filePath);
});

test('hash-prefixet sprider nycklarna över katalogerna', () => {
  // contact@ har 10 615 meddelanden. En platt katalog med så många filer är
  // långsam att lista; poängen med prefixet är just att undvika det.
  const prefixes = new Set();
  for (let index = 0; index < 400; index += 1) prefixes.add(store.shardPrefix(`m-${index}`));
  assert.ok(prefixes.size > 100, `för få prefix: ${prefixes.size}`);
});

test('skriv och läs tillbaka bevarar brödtexten exakt', async () => {
  const root = tmpRoot();
  const filePath = store.bodyFilePath({ bodyRoot: root, mailboxId: 'a@b.se', messageKey: 'k1' });
  const body = { bodyText: 'Hej åäö\n"citat"', bodyHtml: '<p>Hej 🙂</p>' };
  await store.writeBody(filePath, body);
  assert.deepEqual(await store.readBody(filePath), body);
});

test('bodyPreview flyttas aldrig ut', async () => {
  // Den är capad till 500 tecken och är det worklisten och historiksöket läser.
  // Flyttas den ut blir varje historiksök en filläsning per träff.
  const root = tmpRoot();
  const filePath = store.bodyFilePath({ bodyRoot: root, mailboxId: 'a@b.se', messageKey: 'k2' });
  await store.writeBody(filePath, { bodyText: 'x', bodyPreview: 'FÅR INTE SKRIVAS' });
  const written = await store.readBody(filePath);
  assert.deepEqual(Object.keys(written), ['bodyText']);
});

test('saknad sidofil är inte ett fel — meddelandet lämnas orört', async () => {
  const root = tmpRoot();
  const message = { id: 'm', bodyText: 'inline kvar', bodyHtml: '<p>inline</p>' };
  const result = await store.hydrateMessageBody(message, {
    bodyRoot: root,
    mailboxId: 'a@b.se',
    messageKey: 'finns-inte',
  });
  assert.deepEqual(result, message);
});

test('sidofilen vinner över shardens inline-fält när den finns', async () => {
  const root = tmpRoot();
  const filePath = store.bodyFilePath({ bodyRoot: root, mailboxId: 'a@b.se', messageKey: 'k3' });
  await store.writeBody(filePath, { bodyText: 'ur sidofilen' });
  const result = await store.hydrateMessageBody(
    { id: 'm', bodyText: 'gammal inline', bodyHtml: '<p>inline html</p>' },
    { bodyRoot: root, mailboxId: 'a@b.se', messageKey: 'k3' }
  );
  assert.equal(result.bodyText, 'ur sidofilen');
  // Ett fält som INTE ligger i sidofilen får inte tappas.
  assert.equal(result.bodyHtml, '<p>inline html</p>');
});

test('en trasig sidofil döljer inte shardens inline-fält', async () => {
  // Tom text i läsytan är värre än gammal text. Faller vi tillbaka ser
  // operatören något; kastar vi ser hen ingenting.
  const root = tmpRoot();
  const filePath = store.bodyFilePath({ bodyRoot: root, mailboxId: 'a@b.se', messageKey: 'k4' });
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, '{ detta är inte json', 'utf8');
  const result = await store.hydrateMessageBody(
    { bodyText: 'inline överlever' },
    { bodyRoot: root, mailboxId: 'a@b.se', messageKey: 'k4' }
  );
  assert.equal(result.bodyText, 'inline överlever');
});

test('diskspärren kräver marginal, inte bara utrymme', async () => {
  const root = tmpRoot();
  const tight = await store.checkFreeSpace(root, 1024, { marginRatio: 1.5 });
  assert.equal(tight.neededBytes, 1536, 'marginalen ska räknas in i kravet');
  assert.equal(typeof tight.freeBytes, 'number');
  assert.ok(tight.freeBytes > 0);

  const absurd = await store.checkFreeSpace(root, Number.MAX_SAFE_INTEGER, { marginRatio: 1.5 });
  assert.equal(absurd.ok, false, 'ett orimligt krav måste falla, annars är spärren dekoration');
});
