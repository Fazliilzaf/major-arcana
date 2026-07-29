'use strict';

/**
 * ORD-89 steg 2 — vakt för den strömmande transformen.
 *
 * Sanningen är `JSON.parse` av resultatet, inte mina förväntningar. En
 * transform som producerar ogiltig JSON eller tappar ett fält skulle annars se
 * korrekt ut i varje enskild assertion och ändå ha förstört en 179 MB-shard.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createBodyStreamTransform } = require('../../src/ops/ccoMailboxTruthBodyStreamTransform');

async function run(text, chunkSize = Infinity) {
  const captured = [];
  let output = '';
  const transform = createBodyStreamTransform({
    onBody: async (messageKey, field, value) => {
      captured.push({ messageKey, field, value });
    },
    emit: (chunk) => {
      output += chunk;
    },
  });
  if (chunkSize === Infinity) transform.write(text);
  else {
    for (let i = 0; i < text.length; i += chunkSize) transform.write(text.slice(i, i + chunkSize));
  }
  const stats = await transform.finish();
  return { output, captured, stats };
}

const SHARD = {
  version: 1,
  accounts: { 'a@b.se': { mailboxId: 'a@b.se', displayName: 'A "B" å' } },
  messages: {
    'a@b.se:m1': {
      id: 'm1',
      subject: 'Ämne med "citat" och \\ tecken',
      bodyText: 'Rad ett\nRad två med å, ä, ö och 🙂',
      bodyHtml: '<p style="color:red">Hej &amp; hej</p>',
      bodyPreview: 'Rad ett',
    },
    'a@b.se:m2': { id: 'm2', bodyText: 'Kort', bodyPreview: 'Kort' },
    'a@b.se:m3': { id: 'm3', bodyPreview: 'ingen brödtext' },
  },
};

test('resultatet är giltig JSON och allt utom brödtexten är oförändrat', async () => {
  const text = JSON.stringify(SHARD);
  const { output, captured } = await run(text);
  const parsed = JSON.parse(output);

  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.accounts, SHARD.accounts, 'allt utanför messages ska passera orört');
  assert.equal(parsed.messages['a@b.se:m1'].subject, SHARD.messages['a@b.se:m1'].subject);
  assert.equal(parsed.messages['a@b.se:m1'].bodyPreview, 'Rad ett');
  assert.equal(parsed.messages['a@b.se:m3'].bodyPreview, 'ingen brödtext');
  assert.equal(captured.length, 3, 'tre brödtextvärden ska styras om');
});

test('brödtextfälten blir tomma i sharden, inte borttagna', async () => {
  // Att klippa bort ett nyckel/värde-par ur en ström kräver komma-kirurgi, och
  // ett felplacerat komma gör hela sharden oläsbar. Tomt fält är samma sak för
  // läsvägen och kan inte gå sönder.
  const { output } = await run(JSON.stringify(SHARD));
  const parsed = JSON.parse(output);
  assert.equal(parsed.messages['a@b.se:m1'].bodyText, '');
  assert.equal(parsed.messages['a@b.se:m1'].bodyHtml, '');
  assert.ok('bodyText' in parsed.messages['a@b.se:m1']);
});

test('de omstyrda värdena är exakt originaltexten', async () => {
  const { captured } = await run(JSON.stringify(SHARD));
  const byKey = Object.fromEntries(captured.map((item) => [`${item.messageKey}|${item.field}`, item.value]));
  assert.equal(byKey['a@b.se:m1|bodyText'], SHARD.messages['a@b.se:m1'].bodyText);
  assert.equal(byKey['a@b.se:m1|bodyHtml'], SHARD.messages['a@b.se:m1'].bodyHtml);
  assert.equal(byKey['a@b.se:m2|bodyText'], 'Kort');
});

test('\\uXXXX avkodas till rätt tecken i sidofilen', async () => {
  const text = '{"messages":{"k1":{"bodyText":"a\\u00e5b\\u00e4"}}}';
  const { captured, output } = await run(text);
  assert.equal(captured[0].value, 'aåbä');
  assert.equal(JSON.parse(output).messages.k1.bodyText, '');
});

test('ett fält som HETER bodyText utanför messages styrs inte om', async () => {
  // Djup och föräldranyckel avgör, inte fältnamnet. Annars skulle ett
  // konfigurationsobjekt med samma fältnamn tömmas tyst.
  const text = JSON.stringify({
    settings: { bodyText: 'FÅR INTE RÖRAS' },
    messages: { k1: { bodyText: 'ska styras om' } },
  });
  const { output, captured } = await run(text);
  const parsed = JSON.parse(output);
  assert.equal(parsed.settings.bodyText, 'FÅR INTE RÖRAS');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].value, 'ska styras om');
});

test('ett nästlat bodyText djupare ner rörs inte', async () => {
  const text = JSON.stringify({
    messages: { k1: { bodyText: 'styrs om', meta: { bodyText: 'djupare, rörs inte' } } },
  });
  const { output, captured } = await run(text);
  assert.equal(JSON.parse(output).messages.k1.meta.bodyText, 'djupare, rörs inte');
  assert.equal(captured.length, 1);
});

test('chunkgränser ändrar ingenting', async () => {
  // Strömmande läsning delar filen på godtyckliga byte. Faller transformen på
  // en gräns mitt i en escape-sekvens eller mitt i ett nyckelnamn syns det
  // först på 179 MB riktig data.
  const text = JSON.stringify(SHARD);
  const whole = await run(text);
  for (const chunkSize of [1, 2, 3, 7, 13, 64, 1024]) {
    const chunked = await run(text, chunkSize);
    assert.equal(chunked.output, whole.output, `chunkstorlek ${chunkSize} gav annan utdata`);
    assert.deepEqual(chunked.captured, whole.captured, `chunkstorlek ${chunkSize} gav andra värden`);
  }
});

test('en tom shard passerar oförändrad', async () => {
  const text = JSON.stringify({ version: 1, messages: {} });
  const { output, captured } = await run(text);
  assert.equal(output, text);
  assert.equal(captured.length, 0);
});

test('balansen går ihop — depth är noll när filen är slut', async () => {
  // Går den inte ihop har tillståndsmaskinen tappat en klammer, och då är
  // djupvillkoret för omstyrning inte att lita på någonstans i filen.
  const { stats } = await run(JSON.stringify(SHARD));
  assert.equal(stats.depthAtEnd, 0);
  assert.equal(stats.redirected, 3);
});

test('VERKLIGA meddelandenycklar med Graph-id håller isär meddelandena', async () => {
  // PRODFYND 2026-07-29, torrkörning av kons@: 409 brödtexter skrevs till EN
  // fil. Meddelandenyckeln är `${mailboxId}:${graphMessageId}` och Graph-id:n
  // är 140–200 tecken, alltså långt över det gamla taket på 64. Nyckeln
  // kastades som "för lång", och kvar på samma djup stod konto-id:t ur
  // `accounts` — kort nog att vara giltigt. Varje brödtext attribuerades till
  // det. Ingen krasch, inget larm; verifieringen fångade det.
  const graphId = `AAMkAD${'x'.repeat(160)}`;
  const shard = {
    version: 1,
    accounts: { 'kons@hairtpclinic.com': { mailboxId: 'kons@hairtpclinic.com' } },
    messages: {
      [`kons@hairtpclinic.com:${graphId}1`]: { bodyText: 'ett', bodyHtml: '<p>ett</p>' },
      [`kons@hairtpclinic.com:${graphId}2`]: { bodyText: 'två', bodyHtml: '<p>två</p>' },
    },
  };
  const { captured, stats } = await run(JSON.stringify(shard));
  assert.equal(stats.redirected, 4);
  const keys = new Set(captured.map((item) => item.messageKey));
  assert.equal(keys.size, 2, 'varje meddelande ska få sin egen nyckel');
  for (const key of keys) {
    assert.ok(key.startsWith('kons@hairtpclinic.com:AAMkAD'), `nyckeln ser fel ut: ${key}`);
  }
});

test('en nyckel ärvs aldrig från ett syskonobjekt', async () => {
  // Fail closed: hellre ingen omstyrning alls än en omstyrning till fel
  // meddelande. En brödtext på fel nyckel är tyst dataförlust vid migrering.
  const text = JSON.stringify({
    accounts: { kort: { x: 1 } },
    messages: [{ bodyText: 'ligger i en ARRAY, har ingen egen nyckel' }],
  });
  const { captured } = await run(text);
  assert.deepEqual(captured, [], 'utan egen nyckel ska ingenting styras om');
});

test('en ogiltig nyckel NOLLAR platsen — den ärver aldrig syskonets', async () => {
  // MEKANISMEN bakom prodfyndet, inte symtomet.
  //
  // Klammer-rensningen hjälper mellan objekt. Den hjälper inte mellan syskon i
  // SAMMA objekt: är nyckel 1 giltig och nyckel 2 för lång, skulle värde 2
  // ärva nyckel 1. Samma bugg, bara med ett högre tak.
  //
  // Fixen är att en ogiltig nyckel nollar platsen. Då spelar taket ingen roll
  // för korrektheten — det avgör bara hur mycket som migreras, inte om det
  // migreras rätt.
  const tooLong = 'k'.repeat(600);
  const text = JSON.stringify({
    messages: {
      giltig: { bodyText: 'hör till giltig' },
      [tooLong]: { bodyText: 'FÅR ALDRIG HAMNA PÅ giltig' },
    },
  });
  const { captured } = await run(text);
  const forValid = captured.filter((item) => item.messageKey === 'giltig');
  assert.equal(forValid.length, 1, 'den giltiga nyckeln ska få exakt sin egen brödtext');
  assert.equal(forValid[0].value, 'hör till giltig');
  assert.ok(
    !captured.some((item) => item.value.includes('FÅR ALDRIG')),
    'värdet under en ogiltig nyckel ska inte styras om alls — fail closed'
  );
});

test('maxKeyChars rapporterar VERKLIG nyckellängd, inte den capade', async () => {
  // 512 är valt med marginal mot en uppskattning om ett externt system.
  // Räknades talet på den capade kandidaten vore det begränsat av just det vi
  // vill kunna kontrollera — och skulle aldrig kunna varna för att taket nås.
  const key = `kons@hairtpclinic.com:AAMkAD${'x'.repeat(600)}`;
  const { stats } = await run(JSON.stringify({ messages: { [key]: { bodyText: 'x' } } }));
  assert.equal(stats.maxKeyChars, key.length);
  assert.ok(stats.maxKeyChars > 512, 'talet ska kunna överstiga taket');
});
