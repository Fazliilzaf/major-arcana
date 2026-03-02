const test = require('node:test');
const assert = require('node:assert/strict');

const { detectTone } = require('../../src/intelligence/toneDetector');
const { computePriorityScore } = require('../../src/intelligence/priorityScoreEngine');

test('Tone detector maps anxious deterministically', async () => {
  const result = await detectTone('Jag är orolig och nervös inför behandlingen.');
  assert.equal(result.tone, 'anxious');
  assert.equal(result.toneConfidence >= 0.6, true);
});

test('Tone detector maps frustrated deterministically', async () => {
  const result = await detectTone('Jag är besviken och missnöjd med återkopplingen.');
  assert.equal(result.tone, 'frustrated');
  assert.equal(result.toneConfidence >= 0.6, true);
});

test('Tone detector maps urgent deterministically', async () => {
  const result = await detectTone('Snälla svara nu direkt, detta är akut!!!');
  assert.equal(result.tone, 'urgent');
  assert.equal(result.toneConfidence >= 0.6, true);
});

test('Tone detector maps stressed deterministically', async () => {
  const result = await detectTone('Jag känner panik och är väldigt stressad.');
  assert.equal(result.tone, 'stressed');
  assert.equal(result.toneConfidence >= 0.6, true);
});

test('Tone detector maps positive deterministically', async () => {
  const result = await detectTone('Tack för fantastisk hjälp, jag uppskattar allt!');
  assert.equal(result.tone, 'positive');
  assert.equal(result.toneConfidence >= 0.6, true);
});

test('Tone detector returns neutral fallback when unknown', async () => {
  const result = await detectTone('zxqv qwepoi asdfgh');
  assert.equal(result.tone, 'neutral');
  assert.equal(result.toneConfidence, 0.4);
});

test('Tone detector semantic fallback can be injected and clamped', async () => {
  const result = await detectTone('Detta saknar tydliga nyckelord', {
    semanticResolver: async () => ({
      tone: 'urgent',
      toneConfidence: 0.72,
    }),
  });
  assert.equal(result.tone, 'urgent');
  assert.equal(result.toneConfidence, 0.72);
});

test('Tone detector keeps high confidence unchanged even with writing profile', async () => {
  const baseline = await detectTone('Snälla svara nu direkt, detta är akut!!!');
  const adjusted = await detectTone('Snälla svara nu direkt, detta är akut!!!', {
    writingProfile: {
      warmthIndex: 10,
      formalityLevel: 10,
    },
  });
  assert.equal(baseline.tone, 'urgent');
  assert.equal(adjusted.tone, 'urgent');
  assert.equal(baseline.toneConfidence >= 0.75, true);
  assert.equal(adjusted.toneConfidence, baseline.toneConfidence);
});

test('Tone detector adjusts low confidence when writing profile exists', async () => {
  const baseline = await detectTone('zxqv qwepoi asdfgh');
  const adjusted = await detectTone('zxqv qwepoi asdfgh', {
    writingProfile: {
      warmthIndex: 10,
      formalityLevel: 10,
    },
  });
  assert.equal(baseline.tone, 'neutral');
  assert.equal(adjusted.tone, 'neutral');
  assert.equal(baseline.toneConfidence, 0.4);
  assert.equal(adjusted.toneConfidence, 0.5);
});

test('Tone detector keeps confidence unchanged when writing profile is missing', async () => {
  const baseline = await detectTone('zxqv qwepoi asdfgh');
  const adjusted = await detectTone('zxqv qwepoi asdfgh', {
    writingProfile: null,
  });
  assert.equal(adjusted.tone, baseline.tone);
  assert.equal(adjusted.toneConfidence, baseline.toneConfidence);
});

test('Tone detector integration increases PriorityScore vs neutral tone', async () => {
  const anxiousTone = await detectTone('Jag är orolig och rädd inför operationen.');
  const neutralTone = await detectTone('Hej, jag återkommer med mer information senare.');

  const anxiousPriority = computePriorityScore({
    hoursSinceInbound: 26,
    intent: 'follow_up',
    tone: anxiousTone.tone,
  });
  const neutralPriority = computePriorityScore({
    hoursSinceInbound: 26,
    intent: 'follow_up',
    tone: neutralTone.tone,
  });

  assert.equal(anxiousPriority.priorityScore > neutralPriority.priorityScore, true);
  assert.equal(anxiousPriority.priorityReasons.includes('TONE_ANXIOUS:+15'), true);
});
