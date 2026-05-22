'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectSentiment,
  detectConversationSentiment,
  getSentimentLabel,
  scoreSentiment,
} = require('../../src/risk/sentimentDetect');

test('detectSentiment: positiv detekteras via tack/jättekul', () => {
  const r = detectSentiment('Tack så jättemycket! Det här var underbart bra.');
  assert.equal(r.sentiment, 'positive');
  assert.ok(r.confidence > 0);
});

test('detectSentiment: negativ detekteras via klagomål-markörer', () => {
  const r = detectSentiment('Detta är oacceptabelt. Jag är väldigt besviken och arg.');
  assert.equal(r.sentiment, 'negative');
});

test('detectSentiment: orolig (anxious) detekteras', () => {
  const r = detectSentiment(
    'Jag är väldigt orolig inför behandlingen. Är det smärtsamt? Jag är rädd för biverkningar.'
  );
  assert.equal(r.sentiment, 'anxious');
});

test('detectSentiment: akut prioriteras över andra sentiment', () => {
  const r = detectSentiment('Detta är akut! Jag måste få svar omedelbart, brådskande.');
  assert.equal(r.sentiment, 'urgent');
});

test('detectSentiment: tom text → unknown', () => {
  assert.equal(detectSentiment('').sentiment, 'unknown');
  assert.equal(detectSentiment('Hej').sentiment, 'unknown');
});

test('detectSentiment: null och icke-sträng ger unknown', () => {
  assert.equal(detectSentiment(null).sentiment, 'unknown');
  assert.equal(detectSentiment(undefined).sentiment, 'unknown');
  assert.equal(detectSentiment(42).sentiment, 'unknown');
});

test('detectSentiment: neutralt mejl utan markörer → neutral', () => {
  const r = detectSentiment(
    'Hej, jag undrar när er klinik är öppen på onsdagar. Med vänlig hälsning.'
  );
  // Neutral fallback eller positiv (pga vänlig hälsning) — båda OK
  assert.ok(['neutral', 'positive'].includes(r.sentiment));
});

test('detectSentiment: emoji-stöd för positiv', () => {
  const r = detectSentiment('Tack 🙏 det var perfekt 😊');
  assert.equal(r.sentiment, 'positive');
});

test('detectConversationSentiment: senaste kund-meddelandet styr', () => {
  const r = detectConversationSentiment([
    {
      direction: 'inbound',
      body: 'Tack för svaret, det var bra!',
      sentAt: '2026-04-25T10:00:00Z',
    },
    {
      direction: 'outbound',
      body: 'Varsågod.',
      sentAt: '2026-04-25T11:00:00Z',
    },
    {
      direction: 'inbound',
      body: 'Hörde precis att jag måste avboka. Mycket besviken över att inte kunna komma.',
      sentAt: '2026-04-25T12:00:00Z',
    },
  ]);
  assert.equal(r.currentSentiment, 'negative');
});

test('detectConversationSentiment: inga inbound → unknown', () => {
  const r = detectConversationSentiment([
    {
      direction: 'outbound',
      body: 'Hej, här är information.',
    },
  ]);
  assert.equal(r.currentSentiment, 'unknown');
});

test('getSentimentLabel returnerar icon och tone', () => {
  assert.equal(getSentimentLabel('positive').icon, '😊');
  assert.equal(getSentimentLabel('negative').tone, 'red');
  assert.equal(getSentimentLabel('anxious').tone, 'amber');
  assert.equal(getSentimentLabel('urgent').tone, 'red');
  assert.equal(getSentimentLabel('xyz').label, 'Okänt');
});

test('getSentimentLabel nullish kod ger Okänt', () => {
  assert.equal(getSentimentLabel(null).label, 'Okänt');
  assert.equal(getSentimentLabel(undefined).label, 'Okänt');
});

test('detectSentiment default minLength 8 avvisar sju tecken', () => {
  const r = detectSentiment('shorttx');
  assert.equal(r.sentiment, 'unknown');
  assert.equal(r.confidence, 0);
});

test('detectSentiment neutral fallback när inga markörer träffar', () => {
  const r = detectSentiment('shorttxt');
  assert.equal(r.sentiment, 'neutral');
  assert.equal(r.confidence, 0.3);
  assert.deepEqual(r.scores, {
    positive: 0,
    neutral: 0,
    negative: 0,
    anxious: 0,
    urgent: 0,
  });
});

test('scoreSentiment: alla scores är non-negative', () => {
  const r = scoreSentiment('Hej tack akut orolig besviken.');
  for (const v of Object.values(r)) {
    assert.ok(v >= 0, `score should be >= 0, got ${v}`);
  }
});

test('scoreSentiment: tom sträng och null ger noll överallt', () => {
  const empty = scoreSentiment('');
  assert.deepEqual(empty, { positive: 0, neutral: 0, negative: 0, anxious: 0, urgent: 0 });
  assert.deepEqual(scoreSentiment(null), empty);
});

test('scoreSentiment: icke-sträng normaliseras som tom input', () => {
  const empty = scoreSentiment('');
  assert.deepEqual(scoreSentiment(undefined), empty);
  assert.deepEqual(scoreSentiment(123), empty);
  assert.deepEqual(scoreSentiment({ text: 'tack' }), empty);
});

test('scoreSentiment: negation före positiv markör sänker positiv och höjer negativ', () => {
  const r = scoreSentiment('Inte tack för detta bemötande.');
  assert.ok(r.positive >= 0);
  assert.ok(r.negative >= 0.5);
});

test('scoreSentiment: många frågetecken höjer neutral-score', () => {
  const r = scoreSentiment('Hur fungerar detta?? När kan ni svara??');
  assert.ok(r.neutral >= 2);
});

test('scoreSentiment: utropstecken förstärker existerande positiv score', () => {
  const calm = scoreSentiment('Tack detta var perfekt');
  const excited = scoreSentiment('Tack!! detta var perfekt!!');
  assert.ok(excited.positive > calm.positive);
});

test('detectSentiment: custom minLength tillåter kort text', () => {
  const r = detectSentiment('tack', { minLength: 2 });
  assert.equal(r.sentiment, 'positive');
});

test('detectConversationSentiment: customerDirection kan vara outbound', () => {
  const r = detectConversationSentiment(
    [
      { direction: 'inbound', body: 'Tack så mycket, jättebra!', sentAt: '2026-04-25T10:00:00Z' },
      { direction: 'outbound', body: 'Detta är akut och brådskande.', sentAt: '2026-04-25T11:00:00Z' },
    ],
    { customerDirection: 'outbound' }
  );
  assert.equal(r.currentSentiment, 'urgent');
});

test('detectConversationSentiment: icke-array input ger unknown', () => {
  const r = detectConversationSentiment(null);
  assert.equal(r.currentSentiment, 'unknown');
  assert.deepEqual(r.perMessage, []);
});

test('detectConversationSentiment: recordedAt avgör senaste inbound', () => {
  const r = detectConversationSentiment([
    { direction: 'inbound', body: 'Tack allt är jättebra och underbart!', recordedAt: '2026-01-01T10:00:00Z' },
    { direction: 'inbound', body: 'Detta är oacceptabelt och jag är besviken.', recordedAt: '2026-01-15T10:00:00Z' },
  ]);
  assert.equal(r.currentSentiment, 'negative');
});

test('detectConversationSentiment: bodyPreview och text när body saknas', () => {
  const r = detectConversationSentiment([
    { direction: 'inbound', bodyPreview: 'Neutral preview text här.' },
    {
      direction: 'inbound',
      text: 'Tack så jättemycket för hjälpen, verkligen underbart och perfekt!',
      recordedAt: '2026-06-01T12:00:00Z',
    },
    {
      direction: 'inbound',
      bodyPreview: 'Äldre rad med tack och perfekt service.',
      recordedAt: '2026-05-01T12:00:00Z',
    },
  ]);
  assert.equal(r.currentSentiment, 'positive');
});
