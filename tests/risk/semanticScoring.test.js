const test = require('node:test');
const assert = require('node:assert/strict');

const { computeSemanticRiskScore, normalizeSemanticMode } = require('../../src/risk/semanticScoring');

test('normalizeSemanticMode defaults unknown values to heuristic', () => {
  assert.equal(normalizeSemanticMode(''), 'heuristic');
  assert.equal(normalizeSemanticMode('unknown-mode'), 'heuristic');
  assert.equal(normalizeSemanticMode('LINEAR'), 'linear');
  assert.equal(normalizeSemanticMode('hybrid'), 'hybrid');
});

test('computeSemanticRiskScore heuristic returns low score for empty content', () => {
  const r = computeSemanticRiskScore({ content: '   ', category: 'general', mode: 'heuristic' });
  assert.equal(r.score, 0);
  assert.equal(r.modelVersion, 'semantic.heuristic.v1');
  assert.equal(r.meta.mode, 'heuristic');
});

test('computeSemanticRiskScore heuristic elevates on medical risk keywords', () => {
  const base = computeSemanticRiskScore({
    content: 'Kort info om tidbokning.',
    category: 'general',
    mode: 'heuristic',
  });
  const risky = computeSemanticRiskScore({
    content:
      'Vi ger diagnos och garanterar omedelbart resultat utan risk. Du måste alltid följa vår behandling.',
    category: 'general',
    mode: 'heuristic',
  });
  assert.ok(risky.score > base.score);
  assert.ok(risky.score >= 20);
});

test('computeSemanticRiskScore linear mode exposes feature meta', () => {
  const r = computeSemanticRiskScore({
    content: 'Akut smärta utan vägledning.',
    category: 'CONSULTATION',
    mode: 'linear',
  });
  assert.equal(r.modelVersion, 'semantic.linear.v1');
  assert.equal(r.meta.mode, 'linear');
  assert.equal(typeof r.meta.features.acuteNoEscalation, 'number');
});

test('computeSemanticRiskScore hybrid blends heuristic and linear', () => {
  const r = computeSemanticRiskScore({
    content: 'Blandad text med måste och symtom efter behandling.',
    category: 'AFTERCARE',
    mode: 'hybrid',
  });
  assert.equal(r.modelVersion, 'semantic.hybrid.v1');
  assert.equal(r.meta.mode, 'hybrid');
  assert.ok(typeof r.meta.components.heuristic === 'number');
  assert.ok(typeof r.meta.components.linear === 'number');
  assert.ok(r.score > 0);
});

test('computeSemanticRiskScore heuristic rewards long aftercare symptom copy', () => {
  const short = computeSemanticRiskScore({
    content: 'Hej.',
    category: 'AFTERCARE',
    mode: 'heuristic',
  });
  const longSymptom = computeSemanticRiskScore({
    content: `${'Patienten beskriver tryck och obehag. '.repeat(25)}symtom efter behandling.`,
    category: 'AFTERCARE',
    mode: 'heuristic',
  });
  assert.ok(longSymptom.score > short.score);
});

test('computeSemanticRiskScore linear acuteNoEscalation clears when 112 guidance present', () => {
  const acute = computeSemanticRiskScore({
    content: 'Patient med akut huvudvärk.',
    category: 'general',
    mode: 'linear',
  });
  const guided = computeSemanticRiskScore({
    content: 'Vid akut huvudvärk ring 112.',
    category: 'general',
    mode: 'linear',
  });
  assert.equal(acute.meta.features.acuteNoEscalation, 1);
  assert.equal(guided.meta.features.acuteNoEscalation, 0);
});

test('computeSemanticRiskScore treats null content as empty', () => {
  const r = computeSemanticRiskScore({ content: null, category: 'general', mode: 'heuristic' });
  assert.equal(r.score, 0);
});

test('normalizeSemanticMode handles casing and nullish input', () => {
  assert.equal(normalizeSemanticMode('  HYBRID  '), 'hybrid');
  assert.equal(normalizeSemanticMode(null), 'heuristic');
  assert.equal(normalizeSemanticMode(undefined), 'heuristic');
});

test('computeSemanticRiskScore falls back to heuristic on invalid mode', () => {
  const r = computeSemanticRiskScore({
    content: 'Vi måste agera omedelbart med garanti.',
    category: 'general',
    mode: 'invalid-mode',
  });
  assert.equal(r.modelVersion, 'semantic.heuristic.v1');
  assert.equal(r.meta.mode, 'heuristic');
});

test('linear mode raises consultationContext for consultation-result wording', () => {
  const neutral = computeSemanticRiskScore({
    content: 'Kort text om uppföljning.',
    category: 'CONSULTATION',
    mode: 'linear',
  });
  const consultation = computeSemanticRiskScore({
    content: 'Vi diskuterar resultat och utfall efter konsultationen.',
    category: 'CONSULTATION',
    mode: 'linear',
  });
  assert.ok(consultation.meta.features.consultationContext >= 1);
  assert.ok(consultation.score >= neutral.score);
});

test('computeSemanticRiskScore heuristic ger akut-bonus utan ring 112', () => {
  const med112 = computeSemanticRiskScore({
    content: 'Vid akut smärta ring 112.',
    category: 'general',
    mode: 'heuristic',
  });
  const utan112 = computeSemanticRiskScore({
    content: 'Du har akut smärta som kräver snabb uppföljning.',
    category: 'general',
    mode: 'heuristic',
  });
  assert.ok(utan112.score > med112.score);
});

test('computeSemanticRiskScore heuristic CONSULTATION bonus for resultat-ord', () => {
  const internal = computeSemanticRiskScore({
    content: 'Vi följer upp resultat och utfall.',
    category: 'INTERNAL',
    mode: 'heuristic',
  });
  const consultation = computeSemanticRiskScore({
    content: 'Vi följer upp resultat och utfall.',
    category: 'CONSULTATION',
    mode: 'heuristic',
  });
  assert.ok(consultation.score > internal.score);
});

test('computeSemanticRiskScore default tom payload ger heuristic noll', () => {
  const r = computeSemanticRiskScore();
  assert.equal(r.score, 0);
  assert.equal(r.meta.mode, 'heuristic');
});

test('computeSemanticRiskScore undefined content behandlas som tom heuristic', () => {
  const r = computeSemanticRiskScore({ content: undefined, mode: 'heuristic' });
  assert.equal(r.score, 0);
  assert.equal(r.meta.mode, 'heuristic');
});

test('linear mode sätter aftercareSymptoms bara för AFTERCARE', () => {
  const body = 'Rapportera symtom eller biverkning efter behandlingen.';
  const aftercare = computeSemanticRiskScore({ content: body, category: 'AFTERCARE', mode: 'linear' });
  const consultation = computeSemanticRiskScore({ content: body, category: 'CONSULTATION', mode: 'linear' });
  assert.equal(aftercare.meta.features.aftercareSymptoms, 1);
  assert.equal(consultation.meta.features.aftercareSymptoms, 0);
});

test('linear mode höjer piiIntensity vid personnummer och bankid', () => {
  const r = computeSemanticRiskScore({
    content: 'Skicka personnummer och bankid så återkommer vi.',
    category: 'general',
    mode: 'linear',
  });
  assert.ok(r.meta.features.piiIntensity > 0);
});

test('linear acuteNoEscalation nollställs vid kontakta akut', () => {
  const r = computeSemanticRiskScore({
    content: 'Vid svår smärta kontakta akut vård direkt.',
    category: 'general',
    mode: 'linear',
  });
  assert.equal(r.meta.features.acuteNoEscalation, 0);
});

test('hybrid score matchar avrundad 45/55 blandning av komponenter', () => {
  const r = computeSemanticRiskScore({
    content: 'Måste garantera diagnos och symtom utan att ringa 112.',
    category: 'AFTERCARE',
    mode: 'hybrid',
  });
  const { heuristic: h, linear: l } = r.meta.components;
  const expected = Math.max(0, Math.min(100, Math.round(h * 0.45 + l * 0.55)));
  assert.equal(r.score, expected);
});

test('normalizeSemanticMode icke-sträng faller tillbaka till heuristic', () => {
  assert.equal(normalizeSemanticMode(123), 'heuristic');
  assert.equal(normalizeSemanticMode({}), 'heuristic');
  assert.equal(normalizeSemanticMode([]), 'heuristic');
});

test('computeSemanticRiskScore accepterar icke-sträng category utan krasch', () => {
  const body = 'symtom efter behandling enligt instruktion';
  const generic = computeSemanticRiskScore({
    content: body,
    category: null,
    mode: 'heuristic',
  });
  const aftercare = computeSemanticRiskScore({
    content: body,
    category: 'AFTERCARE',
    mode: 'heuristic',
  });
  assert.equal(generic.modelVersion, 'semantic.heuristic.v1');
  assert.ok(aftercare.score >= generic.score);
});
