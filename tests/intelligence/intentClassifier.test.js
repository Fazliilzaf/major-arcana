const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyIntent } = require('../../src/intelligence/intentClassifier');

test('Intent classifier maps booking request deterministically', async () => {
  const result = await classifyIntent('Hej, jag vill boka en appointment nästa vecka.');
  assert.equal(result.intent, 'booking_request');
  assert.equal(result.confidence >= 0.6, true);
});

test('Intent classifier maps pricing question deterministically', async () => {
  const result = await classifyIntent('Vad kostar behandlingen, price och paket?');
  assert.equal(result.intent, 'pricing_question');
  assert.equal(result.confidence >= 0.6, true);
});

test('Intent classifier maps anxiety pre-op deterministically', async () => {
  const result = await classifyIntent('Jag ar orolig och nervos infor behandling.');
  assert.equal(result.intent, 'anxiety_pre_op');
  assert.equal(result.confidence >= 0.6, true);
});

test('Intent classifier maps complaint deterministically', async () => {
  const result = await classifyIntent('Jag ar missnojd och vill lamna ett klagomal.');
  assert.equal(result.intent, 'complaint');
  assert.equal(result.confidence >= 0.6, true);
});

test('Intent classifier maps cancellation deterministically', async () => {
  const result = await classifyIntent('Jag behover avboka min tid, cancel please.');
  assert.equal(result.intent, 'cancellation');
  assert.equal(result.confidence >= 0.6, true);
});

test('Intent classifier maps follow-up deterministically', async () => {
  const result = await classifyIntent('Kan ni aterkoppla med en follow up om status?');
  assert.equal(result.intent, 'follow_up');
  assert.equal(result.confidence >= 0.6, true);
});

test('Intent classifier handles mixed-signal edge case with deterministic priority', async () => {
  const result = await classifyIntent('Jag vill avboka men ar missnojd med upplevelsen.');
  assert.equal(result.intent, 'complaint');
  assert.equal(result.confidence >= 0.6, true);
});

test('Intent classifier semantic fallback can be injected and schema-clamped', async () => {
  const result = await classifyIntent('Detta saknar tydliga keywords', {
    semanticResolver: async () => ({
      intent: 'follow_up',
      confidence: 0.66,
    }),
  });
  assert.equal(result.intent, 'follow_up');
  assert.equal(result.confidence, 0.66);
});

test('Intent classifier returns unclear fail-safe for unknown input', async () => {
  const result = await classifyIntent('zxqv qwepoi asdfgh');
  assert.deepEqual(result, {
    intent: 'unclear',
    confidence: 0.3,
    source: 'fallback',
  });
});
