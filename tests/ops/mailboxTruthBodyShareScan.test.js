'use strict';

/**
 * ORD-89 steg 1 — vakt för brödtextskannern.
 *
 * Skannern ersätter `JSON.parse` för att mätningen inte ska orsaka felet den
 * mäter. Priset är att escape-hanteringen blir vår egen, och en tyst
 * felräkning här skulle ge ett trovärdigt men falskt tal som hela steg 2 vilar
 * på. Sanningen i de flesta testerna nedan är därför `JSON.parse` självt:
 * skannern jämförs mot språket, inte mot mina förväntningar.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createBodyShareScanner } = require('../../src/ops/mailboxTruthBodyShareScan');

/** Kör skannern över en text, uppdelad i chunkar om `chunkSize` tecken. */
function scan(text, chunkSize = Infinity) {
  const scanner = createBodyShareScanner();
  if (chunkSize === Infinity) {
    scanner.write(text);
  } else {
    for (let index = 0; index < text.length; index += chunkSize) {
      scanner.write(text.slice(index, index + chunkSize));
    }
  }
  return scanner.finish();
}

/** Sanningen: vad `JSON.parse` säger att fälten är långa. */
function truthDecodedChars(text) {
  const parsed = JSON.parse(text);
  const messages = Array.isArray(parsed.messages)
    ? parsed.messages
    : Object.values(parsed.messages || {});
  return messages.reduce(
    (total, message) => total + (message.bodyText || '').length + (message.bodyHtml || '').length,
    0
  );
}

function shard(messages) {
  return JSON.stringify({ version: 1, messages });
}

test('summerar bodyText och bodyHtml och matchar JSON.parse', () => {
  const text = shard([
    { id: 'a', bodyText: 'Hej Fazli', bodyHtml: '<p>Hej Fazli</p>', subject: 'ignoreras' },
    { id: 'b', bodyText: 'Andra mailet', bodyHtml: '' },
  ]);
  const result = scan(text);
  assert.equal(result.decodedChars, truthDecodedChars(text));
  assert.equal(result.bodyText.values, 2);
  assert.equal(result.bodyHtml.values, 2);
});

test('ett escapat citattecken avslutar inte värdet i förtid', () => {
  // Utan korrekt escape-hantering skulle strängen sluta mitt i och resten av
  // filen läsas i fel tillstånd — talet skulle bli för lågt, utan felmeddelande.
  const body = 'Hon sa "hej" och gick';
  const text = shard([{ bodyText: body, bodyHtml: '' }]);
  assert.ok(text.includes('\\"'), 'fixturen måste faktiskt innehålla en escapad citat');
  assert.equal(scan(text).decodedChars, truthDecodedChars(text));
  assert.equal(scan(text).bodyText.decodedChars, body.length);
});

test('ett avslutande omvänt snedstreck räknas som ett tecken, inte som escape', () => {
  const body = 'sökväg\\';
  const text = shard([{ bodyText: body, bodyHtml: '' }]);
  assert.equal(scan(text).bodyText.decodedChars, body.length);
  assert.equal(scan(text).decodedChars, truthDecodedChars(text));
});

test('radbrytningar räknas som ETT tecken avkodat', () => {
  const body = 'rad1\nrad2 slut';
  const text = shard([{ bodyText: body, bodyHtml: '' }]);
  assert.equal(scan(text).bodyText.decodedChars, body.length);
  assert.equal(scan(text).decodedChars, truthDecodedChars(text));
});

test('svenska tecken är ett tecken avkodat men två byte i filen', () => {
  const body = 'åäö';
  const text = shard([{ bodyText: body, bodyHtml: '' }]);
  const result = scan(text);
  assert.equal(result.bodyText.decodedChars, 3);
  assert.equal(result.bodyText.rawBytes, 6);
  // Det är precis den skillnaden som gör att bara rawBytes får jämföras med
  // filstorleken. Blandas de ihop underskattas andelen systematiskt.
  assert.notEqual(result.bodyText.decodedChars, result.bodyText.rawBytes);
});

test('en sträng vars VÄRDE är "bodyText" räknar inte nästa sträng', () => {
  // Nyckel eller värde avgörs av kolonet. Utan den regeln skulle ett mail som
  // NÄMNER fältnamnet i sin egen text förgifta mätningen.
  const text = JSON.stringify({
    messages: [{ subject: 'bodyText', from: 'DETTA SKA INTE RÄKNAS', bodyText: 'räknas' }],
  });
  const result = scan(text);
  assert.equal(result.bodyText.decodedChars, 'räknas'.length);
  assert.equal(result.bodyText.values, 1);
});

test('resultatet är identiskt oavsett var chunkgränserna hamnar', () => {
  // Strömmande läsning delar filen på godtyckliga byte. Faller skannern på en
  // gräns mitt i en escape-sekvens eller mitt i ett nyckelnamn syns det inte
  // förrän på 179 MB riktig data.
  const text = shard([
    { bodyText: 'Hon sa "hej"\noch gick åt höger', bodyHtml: '<p>åäö\\</p>' },
    { bodyText: 'x'.repeat(200), bodyHtml: 'y z' },
  ]);
  const whole = scan(text);
  for (const chunkSize of [1, 2, 3, 5, 7, 13, 64]) {
    const chunked = scan(text, chunkSize);
    assert.deepEqual(chunked, whole, `chunkstorlek ${chunkSize} gav ett annat resultat`);
  }
  assert.equal(whole.decodedChars, truthDecodedChars(text));
});

test('en nyckel längre än taket kan aldrig räknas som brödtextfält', () => {
  const longKey = 'b'.repeat(200);
  const text = JSON.stringify({ [longKey]: 'ignoreras', bodyText: 'räknas' });
  assert.equal(scan(text).bodyText.decodedChars, 'räknas'.length);
});

test('tomma shardar ger noll, inte NaN', () => {
  const result = scan(JSON.stringify({ version: 1, messages: [] }));
  assert.equal(result.decodedChars, 0);
  assert.equal(result.rawBytes, 0);
});

test('\\uXXXX är ett tecken avkodat och sex byte i filen', () => {
  // JSON.stringify skriver inte \\uXXXX för vanliga tecken, så fixturen är rå.
  const text = '{"messages":[{"bodyText":"a\\u00e5b","bodyHtml":""}]}';
  const result = scan(text);
  assert.equal(JSON.parse(text).messages[0].bodyText.length, 3);
  assert.equal(result.bodyText.decodedChars, 3);
  assert.equal(result.bodyText.rawBytes, 8, 'a + sex byte escape + b');
  assert.equal(result.decodedChars, truthDecodedChars(text));
});

test('emoji är TVÅ kodenheter men FYRA byte — inte sex', () => {
  // Loopen itererar UTF-16-kodenheter. Ett tecken utanför BMP är ett
  // surrogatpar, och Buffer.byteLength på en ensam surrogat ger 3 byte
  // (ersättningstecknet) — 3+3=6 där filen har 4. Felet går åt det håll som
  // ÖVERSKATTAR brödtextandelen, alltså åt det håll som talar för migreringen.
  // Ett mätverktyg vars enda värde är att talet går att lita på får inte ha en
  // systematisk skevhet åt den sida slutsatsen lutar.
  //
  // decodedChars är däremot rätt av samma skäl: JS .length räknar också paret
  // som två.
  for (const body of ['a🙂b', '🙂', 'åäö🙂', 'a🙂🙂b']) {
    const text = shard([{ bodyText: body, bodyHtml: '' }]);
    const result = scan(text);
    assert.equal(result.bodyText.rawBytes, Buffer.byteLength(body, 'utf8'), `rawBytes för ${body}`);
    assert.equal(result.bodyText.decodedChars, body.length, `decodedChars för ${body}`);
  }
});

test('ett surrogatpar som delas av en chunkgräns räknas likadant', () => {
  // Node delar aldrig ett par i en utf8-ström, men skannern får inte förlita
  // sig på det — den regeln är inte vår att garantera.
  const text = shard([{ bodyText: 'x🙂y', bodyHtml: '<p>🙂</p>' }]);
  const whole = scan(text);
  for (const chunkSize of [1, 2, 3, 5, 7, 13, 64]) {
    assert.deepEqual(scan(text, chunkSize), whole, `chunkstorlek ${chunkSize}`);
  }
});

test('brödtext kapad mitt i ett surrogatpar räknas rätt och kastar inte', () => {
  // Caparna i ccoMailboxTruthStore.js:21,25 klipper på KODENHET, inte på
  // kodpunkt. Ett mail med ett emoji exakt vid capen lagras därför med en halv
  // surrogat — inte hypotetiskt i 8 939 meddelanden.
  //
  // Två former, och den FÖRSTA är den som faktiskt hamnar i sharden: filen
  // skrivs med JSON.stringify, som serialiserar en ensam surrogat som en
  // \uXXXX-escape. Den går genom escape-vägen och rörde aldrig
  // surrogathanteringen. Den andra formen — en rå litteral halva i strömmen —
  // går genom surrogatvägen och ska ge 3 byte, inte ett kast.
  const halvEmoji = 'hej\uD83D';

  const serialized = shard([{ bodyText: halvEmoji, bodyHtml: '' }]);
  assert.ok(serialized.includes('\\ud83d'), 'fixturen ska faktiskt bli en escape');
  const fromFile = scan(serialized);
  assert.equal(fromFile.bodyText.decodedChars, halvEmoji.length);
  assert.equal(fromFile.bodyText.rawBytes, 9, 'hej + sex byte escape');

  const literal = '{"messages":[{"bodyText":"hej\uD83D","bodyHtml":""}]}';
  const fromStream = scan(literal);
  assert.equal(fromStream.bodyText.decodedChars, 4);
  assert.equal(fromStream.bodyText.rawBytes, 6, 'ensam surrogat kodas som tre byte');
  for (const chunkSize of [1, 2, 3, 7]) {
    assert.deepEqual(scan(literal, chunkSize), fromStream, `chunkstorlek ${chunkSize}`);
  }
});
