const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateScenarioEngine } = require('../../src/intelligence/scenarioEngine');

test('evaluateScenarioEngine returns three deterministic scenarios', () => {
  const result = evaluateScenarioEngine({
    usageAnalytics: {
      complaintRate: 0.2,
      volatilityIndex: 0.6,
    },
    monthlyRisk: {
      riskIndex: 0.7,
    },
    businessThreats: {
      strategicFlag: true,
    },
    worklist: [{ needsReplyStatus: 'needs_reply' }, { needsReplyStatus: 'needs_reply' }],
  });

  assert.equal(Array.isArray(result.scenarios), true);
  assert.equal(result.scenarios.length, 3);
  assert.equal(Boolean(result.recommendedScenario?.id), true);
  assert.equal(result.confidence >= 0 && result.confidence <= 1, true);
});

test('evaluateScenarioEngine tolererar null och icke-objekt som inputs', () => {
  const result = evaluateScenarioEngine({
    usageAnalytics: null,
    monthlyRisk: null,
    businessThreats: null,
    forwardOutlook: null,
    worklist: 'not-an-array',
  });
  assert.equal(result.scenarios.length, 3);
  assert.equal(result.scenarios.every((s) => s.probability >= 0 && s.probability <= 1), true);
});

test('evaluateScenarioEngine raknar endast worklist-rader som inte ar handled', () => {
  const low = evaluateScenarioEngine({
    worklist: [
      { needsReplyStatus: 'handled' },
      { needsReplyStatus: 'Handled' },
      { needsReplyStatus: 'needs_reply' },
    ],
  });
  const high = evaluateScenarioEngine({
    worklist: Array.from({ length: 40 }, () => ({ needsReplyStatus: 'needs_reply' })),
  });
  const lowStab = low.scenarios.find((s) => s.id === 'stabilization_48h').probability;
  const highStab = high.scenarios.find((s) => s.id === 'stabilization_48h').probability;
  assert.ok(lowStab < 0.1);
  assert.ok(highStab > lowStab);
});

test('evaluateScenarioEngine tar volatilityIndex fran forwardOutlook om usage saknar den', () => {
  const withOutlook = evaluateScenarioEngine({
    usageAnalytics: {},
    forwardOutlook: { volatilityIndex: 0.9 },
  });
  const without = evaluateScenarioEngine({
    usageAnalytics: {},
    forwardOutlook: {},
  });
  assert.ok(
    withOutlook.scenarios.find((s) => s.id === 'stress_escalation').probability >
      without.scenarios.find((s) => s.id === 'stress_escalation').probability
  );
});

test('evaluateScenarioEngine strategicFlag hojer stress-scenario relativt baseline', () => {
  const flagged = evaluateScenarioEngine({
    usageAnalytics: { complaintRate: 0.1, volatilityIndex: 0.2 },
    monthlyRisk: { riskIndex: 0.5 },
    businessThreats: { strategicFlag: true },
  });
  const plain = evaluateScenarioEngine({
    usageAnalytics: { complaintRate: 0.1, volatilityIndex: 0.2 },
    monthlyRisk: { riskIndex: 0.5 },
    businessThreats: { strategicFlag: false },
  });
  assert.ok(
    flagged.scenarios.find((s) => s.id === 'stress_escalation').probability >
      plain.scenarios.find((s) => s.id === 'stress_escalation').probability
  );
});

test('evaluateScenarioEngine anvander generatedAt nar icke-tom strang', () => {
  const result = evaluateScenarioEngine({ generatedAt: '  2026-05-01T12:00:00.000Z  ' });
  assert.equal(result.generatedAt, '2026-05-01T12:00:00.000Z');
});

test('evaluateScenarioEngine utan argument ger tre scenarier och giltig generatedAt', () => {
  const result = evaluateScenarioEngine();
  assert.equal(result.scenarios.length, 3);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
  assert.equal(Boolean(result.recommendedScenario?.id), true);
});

test('evaluateScenarioEngine filtrerar bort null och primitiver i worklist', () => {
  const result = evaluateScenarioEngine({
    worklist: [null, 'x', 42, { needsReplyStatus: 'needs_reply' }],
  });
  const stab = result.scenarios.find((s) => s.id === 'stabilization_48h');
  assert.ok(stab.probability > 0);
  assert.ok(stab.probability < 0.15);
});

test('evaluateScenarioEngine recommendedScenario har hogst sannolikhet', () => {
  const result = evaluateScenarioEngine({
    usageAnalytics: { complaintRate: 0.9, volatilityIndex: 0.9 },
    monthlyRisk: { riskIndex: 0.95 },
    businessThreats: { strategicFlag: true },
    worklist: [{ needsReplyStatus: 'needs_reply' }],
  });
  const maxProb = Math.max(...result.scenarios.map((s) => s.probability));
  assert.equal(result.recommendedScenario.probability, maxProb);
});

test('evaluateScenarioEngine blankt generatedAt faljer tillbaka till ISO-tidsstampel', () => {
  const result = evaluateScenarioEngine({ generatedAt: '   ' });
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
});

test('evaluateScenarioEngine prefererar usage volatilityIndex over forwardOutlook', () => {
  const mixed = evaluateScenarioEngine({
    usageAnalytics: { volatilityIndex: 0.1, complaintRate: 0 },
    forwardOutlook: { volatilityIndex: 0.95 },
    monthlyRisk: { riskIndex: 0.35 },
  });
  const outlookOnly = evaluateScenarioEngine({
    usageAnalytics: {},
    forwardOutlook: { volatilityIndex: 0.95 },
    monthlyRisk: { riskIndex: 0.35 },
  });
  assert.ok(
    mixed.scenarios.find((s) => s.id === 'stress_escalation').probability <
      outlookOnly.scenarios.find((s) => s.id === 'stress_escalation').probability
  );
});

test('evaluateScenarioEngine strategicFlag bonus only when strictly true', () => {
  const truthyString = evaluateScenarioEngine({
    usageAnalytics: { complaintRate: 0.12, volatilityIndex: 0.25 },
    monthlyRisk: { riskIndex: 0.45 },
    businessThreats: { strategicFlag: 'true' },
  });
  const boolTrue = evaluateScenarioEngine({
    usageAnalytics: { complaintRate: 0.12, volatilityIndex: 0.25 },
    monthlyRisk: { riskIndex: 0.45 },
    businessThreats: { strategicFlag: true },
  });
  assert.ok(
    truthyString.scenarios.find((s) => s.id === 'stress_escalation').probability <
      boolTrue.scenarios.find((s) => s.id === 'stress_escalation').probability
  );
});

test('evaluateScenarioEngine clamps complaintRate above 1 like rate 1', () => {
  const over = evaluateScenarioEngine({
    usageAnalytics: { complaintRate: 3, volatilityIndex: 0.2 },
    monthlyRisk: { riskIndex: 0.2 },
  });
  const cap = evaluateScenarioEngine({
    usageAnalytics: { complaintRate: 1, volatilityIndex: 0.2 },
    monthlyRisk: { riskIndex: 0.2 },
  });
  assert.equal(
    over.scenarios.find((s) => s.id === 'stress_escalation').probability,
    cap.scenarios.find((s) => s.id === 'stress_escalation').probability
  );
  assert.equal(
    over.scenarios.find((s) => s.id === 'baseline_operation').probability,
    cap.scenarios.find((s) => s.id === 'baseline_operation').probability
  );
});

test('evaluateScenarioEngine marks stabilization impact medium near score threshold', () => {
  const result = evaluateScenarioEngine({
    usageAnalytics: { complaintRate: 0, volatilityIndex: 0 },
    monthlyRisk: { riskIndex: 0.8 },
    worklist: Array.from({ length: 8 }, () => ({ needsReplyStatus: 'needs_reply' })),
  });
  const stab = result.scenarios.find((s) => s.id === 'stabilization_48h');
  assert.ok(stab.probability >= 0.4 && stab.probability < 0.65);
  assert.equal(stab.impact, 'medium');
});

