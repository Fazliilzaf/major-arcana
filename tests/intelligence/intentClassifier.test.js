const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALLOWED_INTENTS,
  classifyIntent,
  runDeterministicIntent,
} = require('../../src/intelligence/intentClassifier');

test('ALLOWED_INTENTS innehaller forvantade intents utan dubbletter', () => {
  assert.equal(ALLOWED_INTENTS.length, 7);
  assert.equal(new Set(ALLOWED_INTENTS).size, 7);
});

test('runDeterministicIntent returnerar unclear for tom/icke-strang', () => {
  const empty = runDeterministicIntent('');
  assert.equal(empty.intent, 'unclear');
  assert.equal(empty.confidence, 0.3);
  assert.equal(empty.source, 'deterministic');

  const nonString = runDeterministicIntent(null);
  assert.equal(nonString.intent, 'unclear');
});

test('runDeterministicIntent hanterar diakritiska tecken via normalisering', () => {
  const result = runDeterministicIntent('Jag är orolig inför operation.');
  assert.equal(result.intent, 'anxiety_pre_op');
  assert.equal(result.source, 'deterministic');
});

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

test('Intent classifier clamps semantic confidence och satter min icke-unclear-confidence', async () => {
  const result = await classifyIntent('oklar text utan match', {
    semanticResolver: async () => ({
      intent: 'follow_up',
      confidence: -4,
    }),
  });
  assert.equal(result.intent, 'follow_up');
  assert.equal(result.confidence, 0.31);
  assert.equal(result.source, 'semantic');
});

test('Intent classifier normaliserar okand semantic intent till unclear med min-confidence', async () => {
  const result = await classifyIntent('oklar text utan match', {
    semanticResolver: async () => ({
      intent: 'something_else',
      confidence: 0.2,
    }),
  });
  assert.equal(result.intent, 'unclear');
  assert.equal(result.confidence, 0.3);
  assert.equal(result.source, 'semantic');
});

test('Intent classifier faller tillbaka nar semanticResolver kastar fel', async () => {
  const result = await classifyIntent('oklar text utan match', {
    semanticResolver: async () => {
      throw new Error('resolver failure');
    },
  });
  assert.deepEqual(result, {
    intent: 'unclear',
    confidence: 0.3,
    source: 'fallback',
  });
});

test('runDeterministicIntent blanksteg och whitespace ger unclear', () => {
  const r = runDeterministicIntent('   \n\t  ');
  assert.equal(r.intent, 'unclear');
  assert.equal(r.confidence, 0.3);
});

test('runDeterministicIntent ger separationBonus nar runner-up ar svag', () => {
  const result = runDeterministicIntent('Jag vill boka tid hos er nästa vecka.');
  assert.equal(result.intent, 'booking_request');
  assert.equal(result.source, 'deterministic');
  assert.equal(result.confidence, 0.82);
});

test('Intent classifier clampar semantic confidence over 1', async () => {
  const result = await classifyIntent('zxqv qwepoi asdfgh unique-no-keywords-xyz', {
    semanticResolver: async () => ({
      intent: 'follow_up',
      confidence: 9,
    }),
  });
  assert.equal(result.intent, 'follow_up');
  assert.equal(result.confidence, 1);
  assert.equal(result.source, 'semantic');
});

test('Intent classifier returns unclear fail-safe for unknown input', async () => {
  const result = await classifyIntent('zxqv qwepoi asdfgh');
  assert.deepEqual(result, {
    intent: 'unclear',
    confidence: 0.3,
    source: 'fallback',
  });
});

test('classifyIntent tom sträng ger unclear med fallback-källa', async () => {
  const result = await classifyIntent('');
  assert.deepEqual(result, {
    intent: 'unclear',
    confidence: 0.3,
    source: 'fallback',
  });
});

test('classifyIntent unclear från semanticResolver bibehåller confidence över fallback-minimum', async () => {
  const result = await classifyIntent('z-no-det-match-888', {
    semanticResolver: async () => ({ intent: 'unclear', confidence: 0.55 }),
  });
  assert.equal(result.intent, 'unclear');
  assert.equal(result.confidence, 0.55);
  assert.equal(result.source, 'semantic');
});

test('runDeterministicIntent matchar svenskt rädd inför behandling', () => {
  const r = runDeterministicIntent('Jag är rädd inför behandlingen imorgon.');
  assert.equal(r.intent, 'anxiety_pre_op');
  assert.equal(r.source, 'deterministic');
});

test('runDeterministicIntent omits separationBonus when runner-up is within eight points', () => {
  const result = runDeterministicIntent('Jag vill avboka och lamna ett klagomal.');
  assert.equal(result.intent, 'complaint');
  assert.equal(result.confidence, 0.74);
});

test('runDeterministicIntent maps complaint after diacritic strip on klagomål', () => {
  const r = runDeterministicIntent('Jag vill lämna ett klagomål om servicen.');
  assert.equal(r.intent, 'complaint');
  assert.equal(r.source, 'deterministic');
});

test('runDeterministicIntent maps English not happy to complaint', () => {
  const r = runDeterministicIntent('I am not happy with my visit yesterday.');
  assert.equal(r.intent, 'complaint');
});

test('classifyIntent does not call semanticResolver when deterministic matches', async () => {
  let called = false;
  const result = await classifyIntent('Jag vill boka appointment imorgon.', {
    semanticResolver: async () => {
      called = true;
      return { intent: 'complaint', confidence: 0.99 };
    },
  });
  assert.equal(called, false);
  assert.equal(result.intent, 'booking_request');
  assert.equal(result.source, 'deterministic');
});
