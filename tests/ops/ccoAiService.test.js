'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VALID_TONES,
  DEFAULT_TONE,
  detectIntent,
  draftReply,
  extractFields,
} = require('../../src/ops/ccoAiService');

test('VALID_TONES exporteras som en icke-tom array med förväntade toner', () => {
  assert.ok(Array.isArray(VALID_TONES));
  assert.ok(VALID_TONES.length > 0);
  for (const tone of ['professional', 'friendly', 'formal', 'empathetic', 'concise']) {
    assert.ok(VALID_TONES.includes(tone), `saknar ton: ${tone}`);
  }
  assert.ok(VALID_TONES.includes(DEFAULT_TONE));
});

test('draftReply returnerar ett utkast för en giltig ton', () => {
  const result = draftReply({
    message: 'Jag vill boka en tid nästa vecka.',
    tone: 'friendly',
    customerName: 'Anna',
    agentName: 'Kundteamet',
  });
  assert.equal(result.tone, 'friendly');
  assert.equal(typeof result.draft, 'string');
  assert.ok(result.draft.length > 0);
  assert.ok(result.draft.includes('Anna'));
  assert.ok(result.metadata.wordCount > 0);
  assert.equal(result.metadata.intent, 'booking');
});

test('draftReply använder standardton när ingen ton anges', () => {
  const result = draftReply({ message: 'Hej, hur är det?' });
  assert.equal(result.tone, DEFAULT_TONE);
  assert.ok(result.draft.length > 0);
});

test('draftReply kastar fel med statusCode 400 för ogiltig ton', () => {
  assert.throws(
    () => draftReply({ message: 'test', tone: 'aggressive' }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /ogiltig ton/i);
      return true;
    }
  );
});

test('draftReply hanterar tomt input utan att krascha', () => {
  const result = draftReply();
  assert.equal(result.tone, DEFAULT_TONE);
  assert.equal(typeof result.draft, 'string');
  assert.equal(result.metadata.intent, 'general');
});

test('detectIntent klassar vanliga ärenden', () => {
  assert.equal(detectIntent('Jag vill avboka min tid'), 'booking');
  assert.equal(detectIntent('Vad kostar behandlingen?'), 'pricing');
  assert.equal(detectIntent('Jag är väldigt missnöjd med problemet'), 'complaint');
  assert.equal(detectIntent('Tack så mycket!'), 'gratitude');
  assert.equal(detectIntent(''), 'general');
});

test('extractFields plockar e-post, telefon, datum och namn ur fritext', () => {
  const text =
    'Namn: Erik Svensson. Maila mig på erik.svensson@example.com eller ring +46 70 123 45 67. ' +
    'Jag vill boka 2026-07-15.';
  const result = extractFields({ text });
  assert.equal(result.fields.email, 'erik.svensson@example.com');
  assert.equal(result.fields.date, '2026-07-15');
  assert.equal(result.fields.name, 'Erik Svensson');
  assert.ok(result.fields.phone);
  assert.ok(result.fields.phone.includes('46'));
  assert.ok(result.confidence > 0 && result.confidence <= 1);
  assert.equal(result.metadata.textLength, text.length);
});

test('extractFields plockar svenskt personnummer', () => {
  const result = extractFields({ text: 'Mitt personnummer är 19900101-1234.' });
  assert.equal(result.fields.personnummer, '19900101-1234');
});

test('extractFields accepterar message-alias och tomt input', () => {
  const aliased = extractFields({ message: 'kontakt: kalle@test.se' });
  assert.equal(aliased.fields.email, 'kalle@test.se');

  const empty = extractFields();
  assert.deepEqual(empty.fields, {});
  assert.equal(empty.confidence, 0);
  assert.equal(empty.metadata.textLength, 0);
});

test('extractFields returnerar inga falska fält för text utan struktur', () => {
  const result = extractFields({ text: 'Hej, jag undrar bara lite allmänt.' });
  assert.equal(result.fields.email, undefined);
  assert.equal(result.fields.phone, undefined);
  assert.equal(result.fields.date, undefined);
});
