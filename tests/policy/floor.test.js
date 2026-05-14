const test = require('node:test');
const assert = require('node:assert/strict');

const { getPolicyFloorDefinition, evaluatePolicyFloorText } = require('../../src/policy/floor');

test('getPolicyFloorDefinition exposes version and rule metadata', () => {
  const def = getPolicyFloorDefinition();
  assert.equal(def.version, '1.0.0');
  assert.equal(def.immutable, true);
  assert.ok(Array.isArray(def.rules));
  assert.ok(def.rules.some((r) => r.id === 'NO_GUARANTEE_POLICY'));
  assert.ok(def.rules.every((r) => Array.isArray(r.appliesTo)));
  assert.ok(def.rules.every((r) => Object.prototype.hasOwnProperty.call(r, 'requiresEscalationPhrase')));
});

test('evaluatePolicyFloorText returns no hits for benign copy in patient_response', () => {
  const r = evaluatePolicyFloorText({
    text: 'Hej! Tack för ditt meddelande. Vi återkommer inom kort.',
    context: 'patient_response',
  });
  assert.equal(r.hits.length, 0);
  assert.equal(r.blocked, false);
  assert.equal(r.maxFloor, 1);
});

test('evaluatePolicyFloorText blocks medical guarantee language', () => {
  const r = evaluatePolicyFloorText({
    text: 'Vi garanterar 100 % håravvikelse utan risk.',
    context: 'patient_response',
  });
  assert.ok(r.hits.some((h) => h.id === 'NO_GUARANTEE_POLICY'));
  assert.equal(r.blocked, true);
  assert.ok(r.maxFloor >= 4);
});

test('evaluatePolicyFloorText skips all rules when context does not match appliesTo', () => {
  const r = evaluatePolicyFloorText({
    text: 'Vi garanterar perfekt resultat.',
    context: 'internal_notes_only',
  });
  assert.equal(r.hits.length, 0);
  assert.equal(r.blocked, false);
});

test('acute rule triggers only when escalation phrase missing', () => {
  const missing = evaluatePolicyFloorText({
    text: 'Patient har akut svår smärta i hårbotten.',
    context: 'patient_response',
  });
  assert.ok(missing.hits.some((h) => h.id === 'ACUTE_ESCALATION_REQUIRED'));

  const ok = evaluatePolicyFloorText({
    text: 'Vid akut läge: ring 112 eller kontakta akutmottagning.',
    context: 'patient_response',
  });
  assert.ok(!ok.hits.some((h) => h.id === 'ACUTE_ESCALATION_REQUIRED'));
});

test('acute rule cleared by kontakta akut without ring 112', () => {
  const r = evaluatePolicyFloorText({
    text: 'Vid svår smärta kontakta akut vård direkt.',
    context: 'patient_response',
  });
  assert.ok(!r.hits.some((h) => h.id === 'ACUTE_ESCALATION_REQUIRED'));
});

test('acute rule not triggered when only ring 112 without symptom phrase', () => {
  const r = evaluatePolicyFloorText({
    text: 'Om du undrar kan du ring 112 för vägledning.',
    context: 'patient_response',
  });
  assert.ok(!r.hits.some((h) => h.id === 'ACUTE_ESCALATION_REQUIRED'));
});

test('evaluatePolicyFloorText flags diagnosis language', () => {
  const r = evaluatePolicyFloorText({
    text: 'Du har en diagnos som kräver uppföljning.',
    context: 'patient_response',
  });
  assert.ok(r.hits.some((h) => h.id === 'NO_DIAGNOSIS_POLICY'));
  assert.equal(r.blocked, true);
});

test('evaluatePolicyFloorText flags unsafe medical outcome claims', () => {
  const r = evaluatePolicyFloorText({
    text: 'Behandlingen botar helt utan biverkningar.',
    context: 'patient_response',
  });
  assert.ok(r.hits.some((h) => h.id === 'UNSAFE_MEDICAL_CLAIM'));
  assert.equal(r.blocked, true);
});

test('evaluatePolicyFloorText returns no hits for blank text', () => {
  const r = evaluatePolicyFloorText({ text: '   \n', context: 'patient_response' });
  assert.equal(r.hits.length, 0);
  assert.equal(r.blocked, false);
  assert.equal(r.maxFloor, 1);
});

test('evaluatePolicyFloorText default empty invocation yields no hits', () => {
  const r = evaluatePolicyFloorText();
  assert.equal(r.hits.length, 0);
  assert.equal(r.blocked, false);
  assert.equal(r.maxFloor, 1);
  assert.equal(r.immutable, true);
});

test('evaluatePolicyFloorText behandlar icke-sträng text som tom', () => {
  const r = evaluatePolicyFloorText({ text: null, context: 'patient_response' });
  assert.equal(r.hits.length, 0);
  assert.equal(r.policyVersion, '1.0.0');
});

test('evaluatePolicyFloorText med tom context kör alla regler som matchar text', () => {
  const r = evaluatePolicyFloorText({
    text: 'Vi garanterar utfall utan komplikationer.',
    context: '',
  });
  assert.ok(r.hits.some((h) => h.id === 'NO_GUARANTEE_POLICY'));
  assert.equal(r.blocked, true);
});

test('evaluatePolicyFloorText trimmar context och matchar templates', () => {
  const r = evaluatePolicyFloorText({
    text: 'Vi garanterar perfekt utfall.',
    context: '  TEMPLATES ',
  });
  assert.ok(r.hits.some((h) => h.id === 'NO_GUARANTEE_POLICY'));
});

test('evaluatePolicyFloorText sätter maxFloor till högsta träff vid flera regler', () => {
  const r = evaluatePolicyFloorText({
    text: 'Du har en diagnos. Patient har akut svår smärta utan förbättring.',
    context: 'patient_response',
  });
  assert.ok(r.hits.some((h) => h.id === 'NO_DIAGNOSIS_POLICY'));
  assert.ok(r.hits.some((h) => h.id === 'ACUTE_ESCALATION_REQUIRED'));
  assert.equal(r.maxFloor, 5);
  assert.equal(r.blocked, true);
});

test('getPolicyFloorDefinition returns detached rule copies', () => {
  const a = getPolicyFloorDefinition();
  const b = getPolicyFloorDefinition();
  assert.notEqual(a, b);
  assert.notEqual(a.rules, b.rules);
  assert.notEqual(a.rules[0], b.rules[0]);
  assert.notEqual(a.rules[0].appliesTo, b.rules[0].appliesTo);
});

test('evaluatePolicyFloorText ignores acute rule when no acute phrase present', () => {
  const r = evaluatePolicyFloorText({
    text: 'Vi rekommenderar uppföljning nästa vecka.',
    context: 'patient_response',
  });
  assert.equal(r.hits.some((h) => h.id === 'ACUTE_ESCALATION_REQUIRED'), false);
});

test('evaluatePolicyFloorText context matching is case-insensitive with trimming', () => {
  const r = evaluatePolicyFloorText({
    text: 'Du har sjukdomen enligt detta utlåtande.',
    context: '   ORCHESTRATOR  ',
  });
  assert.ok(r.hits.some((h) => h.id === 'NO_DIAGNOSIS_POLICY'));
  assert.equal(r.blocked, true);
});
