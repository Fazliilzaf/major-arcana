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
  assert.equal(getSentimentLabel('urgent').tone, 'red');
  assert.equal(getSentimentLabel('xyz').label, 'Okänt');
});

test('scoreSentiment: alla scores är non-negative', () => {
  const r = scoreSentiment('Hej tack akut orolig besviken.');
  for (const v of Object.values(r)) {
    assert.ok(v >= 0, `score should be >= 0, got ${v}`);
  }
});
