const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateTemplateRisk,
  decisionForLevel,
  toRiskLevel,
  RISK_ENGINE_VERSION_BASE,
} = require('../../src/risk/templateRisk');

test('toRiskLevel maps fused score bands to levels 1-5', () => {
  assert.equal(toRiskLevel(10), 1);
  assert.equal(toRiskLevel(30), 2);
  assert.equal(toRiskLevel(50), 3);
  assert.equal(toRiskLevel(70), 4);
  assert.equal(toRiskLevel(90), 5);
});

test('toRiskLevel gransvarden mellan band', () => {
  assert.equal(toRiskLevel(24), 1);
  assert.equal(toRiskLevel(25), 2);
  assert.equal(toRiskLevel(44), 2);
  assert.equal(toRiskLevel(45), 3);
  assert.equal(toRiskLevel(64), 3);
  assert.equal(toRiskLevel(65), 4);
  assert.equal(toRiskLevel(84), 4);
  assert.equal(toRiskLevel(85), 5);
});

test('decisionForLevel gates allow review and block', () => {
  assert.equal(decisionForLevel(1), 'allow');
  assert.equal(decisionForLevel(2), 'allow');
  assert.equal(decisionForLevel(3), 'review_required');
  assert.equal(decisionForLevel(4), 'blocked');
  assert.equal(decisionForLevel(5), 'blocked');
});

test('decisionForLevel behandlar niva 0 som allow och hoga nivaer som blocked', () => {
  assert.equal(decisionForLevel(0), 'allow');
  assert.equal(decisionForLevel(6), 'blocked');
});

test('evaluateTemplateRisk allows neutral operational copy', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande. Vi återkommer inom 24 timmar.',
    category: 'general',
    tenantRiskModifier: 0,
  });
  assert.ok(r.riskLevel <= 3, `unexpected level ${r.riskLevel}`);
  assert.ok(['allow', 'review_required'].includes(r.decision));
  assert.equal(r.versions.ruleSetVersion, RISK_ENGINE_VERSION_BASE.ruleSetVersion);
});

test('evaluateTemplateRisk klämmer tenantRiskModifier till -10..10', () => {
  const high = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: 'general',
    tenantRiskModifier: 25,
  });
  assert.equal(high.tenantRiskModifier, 10);

  const low = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: 'general',
    tenantRiskModifier: -99,
  });
  assert.equal(low.tenantRiskModifier, -10);

  const nan = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: 'general',
    tenantRiskModifier: NaN,
  });
  assert.equal(nan.tenantRiskModifier, 0);
});

test('evaluateTemplateRisk escalates on guarantee language and policy floor', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Vi garanterar 100% permanent resultat utan komplikationer.',
    category: 'patient_response',
    tenantRiskModifier: 0,
  });
  assert.ok(r.riskLevel >= 4);
  assert.equal(r.decision, 'blocked');
  assert.ok(r.reasonCodes.includes('NO_GUARANTEE_POLICY'));
  assert.ok(r.policyHits.length > 0);
});

test('evaluateTemplateRisk captures diagnosis phrasing in rule layer', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Vi kan inte säga att du har sjukdomen baserat på ett mejl.',
    category: 'general',
    tenantRiskModifier: 0,
  });
  assert.ok(r.ruleHits.some((h) => h.id === 'NO_DIAGNOSIS_POLICY'));
  assert.ok(r.reasonCodes.includes('NO_DIAGNOSIS_POLICY'));
});

test('evaluateTemplateRisk captures unsafe medical claim phrasing', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Vi botar detta riskfritt utan biverkningar och med läkande garanti.',
    category: 'general',
    tenantRiskModifier: 0,
  });
  assert.ok(r.ruleHits.some((h) => h.id === 'UNSAFE_MEDICAL_CLAIM'));
  assert.ok(r.reasonCodes.includes('UNSAFE_MEDICAL_CLAIM'));
});

test('evaluateTemplateRisk applies strict template variable floor', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Hej {{customerName}}, tack för ditt meddelande.',
    category: 'general',
    tenantRiskModifier: 0,
    variableValidation: { unknownVariables: ['{{customFoo}}'] },
    enforceStrictTemplateVariables: true,
  });
  assert.ok(r.riskLevel >= 4);
  assert.ok(r.reasonCodes.includes('UNAPPROVED_TEMPLATE_VARIABLE'));
  assert.ok(r.policyAdjustments.some((a) => a.reasonCode === 'STRICT_TEMPLATE_VARIABLE_POLICY'));
});

test('evaluateTemplateRisk lowers acute rule weight when escalation phrase present', () => {
  const without = evaluateTemplateRisk({
    scope: 'output',
    content: 'Akut buksmärta utan förbättring.',
    category: 'patient_response',
    tenantRiskModifier: 0,
  });
  const withPhrase = evaluateTemplateRisk({
    scope: 'output',
    content: 'Vid akut buksmärta: ring 112.',
    category: 'patient_response',
    tenantRiskModifier: 0,
  });
  const w1 = without.ruleHits.find((h) => h.id === 'ACUTE_ESCALATION_REQUIRED')?.weight ?? 0;
  const w2 = withPhrase.ruleHits.find((h) => h.id === 'ACUTE_ESCALATION_REQUIRED')?.weight ?? 0;
  assert.ok(w2 < w1);
});

test('evaluateTemplateRisk lowers acute rule weight when kontakta akut present', () => {
  const without = evaluateTemplateRisk({
    scope: 'output',
    content: 'Svår smärta som blir värre.',
    category: 'patient_response',
    tenantRiskModifier: 0,
  });
  const withKontakta = evaluateTemplateRisk({
    scope: 'output',
    content: 'Vid svår smärta kontakta akut vård omedelbart.',
    category: 'patient_response',
    tenantRiskModifier: 0,
  });
  const w1 = without.ruleHits.find((h) => h.id === 'ACUTE_ESCALATION_REQUIRED')?.weight ?? 0;
  const w2 = withKontakta.ruleHits.find((h) => h.id === 'ACUTE_ESCALATION_REQUIRED')?.weight ?? 0;
  assert.ok(w2 < w1);
});

test('evaluateTemplateRisk normaliserar thresholdVersion till minst v1', () => {
  const invalid = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: 'general',
    riskThresholdVersion: 0,
  });
  assert.equal(invalid.versions.thresholdVersion, 'threshold.v1');

  const custom = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: 'general',
    riskThresholdVersion: 7,
  });
  assert.equal(custom.versions.thresholdVersion, 'threshold.v7');
});

test('evaluateTemplateRisk använder strict floor även för missingRequiredVariables', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Neutral text utan riskmarkörer.',
    category: 'general',
    variableValidation: { missingRequiredVariables: ['{{disclaimer.medical}}'] },
    enforceStrictTemplateVariables: true,
  });
  assert.ok(r.reasonCodes.includes('MISSING_REQUIRED_DISCLAIMER'));
  assert.ok(r.riskLevel >= 4);
  assert.ok(r.policyAdjustments.some((a) => a.reasonCode === 'STRICT_TEMPLATE_VARIABLE_POLICY'));
});

test('evaluateTemplateRisk läser buildVersion från env med fallback-kedja', () => {
  const prevNpm = process.env.npm_package_version;
  const prevBuild = process.env.ARCANA_BUILD_VERSION;
  try {
    delete process.env.npm_package_version;
    process.env.ARCANA_BUILD_VERSION = 'build-abc123';
    const fromBuildEnv = evaluateTemplateRisk({
      scope: 'output',
      content: 'Tack för ditt meddelande.',
      category: 'general',
    });
    assert.equal(fromBuildEnv.versions.buildVersion, 'build-abc123');

    delete process.env.ARCANA_BUILD_VERSION;
    const fallbackDev = evaluateTemplateRisk({
      scope: 'output',
      content: 'Tack för ditt meddelande.',
      category: 'general',
    });
    assert.equal(fallbackDev.versions.buildVersion, 'dev');
  } finally {
    if (prevNpm === undefined) delete process.env.npm_package_version;
    else process.env.npm_package_version = prevNpm;
    if (prevBuild === undefined) delete process.env.ARCANA_BUILD_VERSION;
    else process.env.ARCANA_BUILD_VERSION = prevBuild;
  }
});

test('evaluateTemplateRisk behandlar icke-sträng content som tom', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: null,
    category: 'general',
    tenantRiskModifier: 0,
  });
  assert.ok(r.riskLevel <= 3);
  assert.ok(['allow', 'review_required'].includes(r.decision));
});

test('evaluateTemplateRisk acute-regeln kraver akut symptom inte bara ring 112', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Om du undrar kan du ring 112.',
    category: 'patient_response',
    tenantRiskModifier: 0,
  });
  assert.equal(
    r.ruleHits.some((h) => h.id === 'ACUTE_ESCALATION_REQUIRED'),
    false
  );
});

test('evaluateTemplateRisk adderar penalties for bade unknown och missing variables', () => {
  const baseline = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: 'general',
    tenantRiskModifier: 0,
  });
  const penalized = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: 'general',
    tenantRiskModifier: 0,
    variableValidation: {
      unknownVariables: ['{{foo}}'],
      missingRequiredVariables: ['{{bar}}'],
    },
  });
  assert.ok(penalized.riskScore > baseline.riskScore);
  assert.ok(penalized.reasonCodes.includes('UNAPPROVED_TEMPLATE_VARIABLE'));
  assert.ok(penalized.reasonCodes.includes('MISSING_REQUIRED_DISCLAIMER'));
});

test('evaluateTemplateRisk tomma variabel-arrayer ger ingen variable penalty', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: 'general',
    tenantRiskModifier: 0,
    variableValidation: { unknownVariables: [], missingRequiredVariables: [] },
  });
  assert.ok(!r.reasonCodes.includes('UNAPPROVED_TEMPLATE_VARIABLE'));
  assert.ok(!r.reasonCodes.includes('MISSING_REQUIRED_DISCLAIMER'));
});

test('evaluateTemplateRisk riskThresholdVersion ogiltig sträng faller tillbaka till v1', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack.',
    category: 'general',
    riskThresholdVersion: 'not-a-number',
  });
  assert.equal(r.versions.thresholdVersion, 'threshold.v1');
});

test('evaluateTemplateRisk riskThresholdVersion som flyttal trunkeras med parseInt', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack.',
    category: 'general',
    riskThresholdVersion: 3.99,
  });
  assert.equal(r.versions.thresholdVersion, 'threshold.v3');
});

test('evaluateTemplateRisk icke-sträng category normaliseras till tom', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Tack för ditt meddelande.',
    category: null,
    tenantRiskModifier: 0,
  });
  assert.equal(r.category, '');
});

test('evaluateTemplateRisk bevarar scope från argument', () => {
  const r = evaluateTemplateRisk({
    scope: 'draft_preview',
    content: 'Hej.',
    category: 'INTERNAL',
  });
  assert.equal(r.scope, 'draft_preview');
});

test('evaluateTemplateRisk normaliserar category med trim och versaler', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Hej.',
    category: '  lead  ',
  });
  assert.equal(r.category, 'LEAD');
});

test('evaluateTemplateRisk variableValidation unknownVariables som icke-array ger ingen penalty', () => {
  const r = evaluateTemplateRisk({
    scope: 'output',
    content: 'Hej.',
    category: 'general',
    variableValidation: { unknownVariables: '{{not-array}}' },
    enforceStrictTemplateVariables: true,
  });
  assert.equal(r.reasonCodes.includes('UNAPPROVED_TEMPLATE_VARIABLE'), false);
  assert.ok(!r.policyAdjustments.some((a) => a.reasonCode === 'STRICT_TEMPLATE_VARIABLE_POLICY'));
});
