const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALLOWED_TONES,
  adjustToneConfidenceWithWritingProfile,
  detectTone,
  runDeterministicTone,
} = require('../../src/intelligence/toneDetector');
const { computePriorityScore } = require('../../src/intelligence/priorityScoreEngine');

test('ALLOWED_TONES ar en komplett lista utan dubbletter', () => {
  assert.equal(ALLOWED_TONES.length, 6);
  assert.equal(new Set(ALLOWED_TONES).size, 6);
});

test('runDeterministicTone returnerar neutral for tom eller icke-strang', () => {
  const empty = runDeterministicTone('');
  assert.equal(empty.tone, 'neutral');
  assert.equal(empty.toneConfidence, 0.4);
  assert.equal(empty.source, 'deterministic');

  const onlyWs = runDeterministicTone('   \n\t  ');
  assert.equal(onlyWs.tone, 'neutral');

  const nonString = runDeterministicTone(null);
  assert.equal(nonString.tone, 'neutral');
});

test('runDeterministicTone matchar nyckelord med diakritik normaliserad', () => {
  const r = runDeterministicTone('Jag känner mig nervös inför besöket.');
  assert.equal(r.tone, 'anxious');
  assert.equal(r.source, 'deterministic');
});

test('runDeterministicTone matchar svenskt rädd efter diakritik-borttagning', () => {
  const r = runDeterministicTone('Jag är rädd inför behandlingen.');
  assert.equal(r.tone, 'anxious');
  assert.equal(r.source, 'deterministic');
});

test('runDeterministicTone fångar urgent via upprepade utropstecken', () => {
  const r = runDeterministicTone('Hej!!');
  assert.equal(r.tone, 'urgent');
});

test('runDeterministicTone ger separationBonus nar runner-up ar svag', () => {
  const r = runDeterministicTone('Snälla svara idag.');
  assert.equal(r.tone, 'urgent');
  assert.ok(Math.abs(r.toneConfidence - 0.8) < 1e-9);
});

test('detectTone clampar semantic toneConfidence over 1', async () => {
  const result = await detectTone('zzz-semantic-over-one-unique-888', {
    semanticResolver: async () => ({
      tone: 'stressed',
      toneConfidence: 9,
    }),
  });
  assert.equal(result.tone, 'stressed');
  assert.equal(result.toneConfidence, 1);
  assert.equal(result.source, 'semantic');
});

test('adjustToneConfidenceWithWritingProfile respekterar explicit formalityAdjustment', () => {
  const adjusted = adjustToneConfidenceWithWritingProfile(0.5, {
    warmthIndex: 0,
    formalityLevel: 5,
    formalityAdjustment: 1,
  });
  assert.ok(adjusted > 0.5 && adjusted <= 1);
  assert.ok(Math.abs(adjusted - 0.53) < 1e-9);
});

test('adjustToneConfidenceWithWritingProfile ignorerar ogiltig writingProfile-typ', () => {
  assert.equal(adjustToneConfidenceWithWritingProfile(0.55, 'not-an-object'), 0.55);
});

test('adjustToneConfidenceWithWritingProfile ignorerar array-profil', () => {
  assert.equal(adjustToneConfidenceWithWritingProfile(0.5, []), 0.5);
});

test('adjustToneConfidenceWithWritingProfile hoppar delta nar grundconfidence ar minst 0.75', () => {
  const adjusted = adjustToneConfidenceWithWritingProfile(0.76, {
    warmthIndex: 10,
    formalityLevel: 0,
    formalityAdjustment: 1,
  });
  assert.equal(adjusted, 0.76);
});

test('adjustToneConfidenceWithWritingProfile anvander formality-niva nar adjustment saknas', () => {
  const low = adjustToneConfidenceWithWritingProfile(0.5, { formalityLevel: 0 });
  const high = adjustToneConfidenceWithWritingProfile(0.5, { formalityLevel: 10 });
  assert.equal(low < 0.5, true);
  assert.equal(high > 0.5, true);
});

test('detectTone faller tillbaka nar semanticResolver kastar', async () => {
  const result = await detectTone('zzz-no-keywords-here', {
    semanticResolver: async () => {
      throw new Error('resolver boom');
    },
  });
  assert.equal(result.tone, 'neutral');
  assert.equal(result.toneConfidence, 0.4);
  assert.equal(result.source, 'fallback');
});

test('detectTone normaliserar okand ton fran semanticResolver till neutral med bibehallen confidence', async () => {
  const result = await detectTone('zzz-no-keywords-here', {
    semanticResolver: async () => ({
      tone: 'not-a-valid-tone',
      toneConfidence: 0.88,
    }),
  });
  assert.equal(result.tone, 'neutral');
  assert.equal(result.toneConfidence, 0.88);
  assert.equal(result.source, 'semantic');
});

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

test('runDeterministicTone omits separationBonus when runner-up is within eight points', () => {
  const r = runDeterministicTone('Jag ar bade orolig och besviken pa hur det gick.');
  assert.equal(r.tone, 'frustrated');
  assert.equal(r.toneConfidence, 0.72);
});

test('runDeterministicTone maps English worried to anxious', () => {
  const r = runDeterministicTone('I am worried about the appointment.');
  assert.equal(r.tone, 'anxious');
  assert.equal(r.source, 'deterministic');
});

test('detectTone does not call semanticResolver when deterministic tone matches', async () => {
  let called = false;
  const result = await detectTone('Jag är besviken på servicen.', {
    semanticResolver: async () => {
      called = true;
      return { tone: 'positive', toneConfidence: 0.99 };
    },
  });
  assert.equal(called, false);
  assert.equal(result.tone, 'frustrated');
  assert.equal(result.source, 'deterministic');
});
