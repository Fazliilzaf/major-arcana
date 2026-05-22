const test = require('node:test');
const assert = require('node:assert/strict');

const { inputRiskGate, toDecisionFromRiskEvaluation } = require('../../src/gateway/gates/inputRiskGate');
const { outputRiskGate } = require('../../src/gateway/gates/outputRiskGate');
const { policyFloorGate } = require('../../src/gateway/gates/policyFloorGate');

test('inputRiskGate returns allow for low risk', () => {
  const gate = inputRiskGate({
    evaluation: {
      riskLevel: 1,
      riskScore: 9,
      decision: 'allow',
      reasonCodes: [],
    },
  });
  assert.equal(gate.decision, 'allow');
  assert.equal(gate.blocked, false);
});

test('inputRiskGate critical_escalate when blocked at L5', () => {
  const gate = inputRiskGate({
    evaluation: {
      riskLevel: 5,
      riskScore: 99,
      decision: 'blocked',
      reasonCodes: ['X'],
    },
  });
  assert.equal(gate.decision, 'critical_escalate');
  assert.equal(gate.blocked, true);
});

test('inputRiskGate blocked (ej critical_escalate) vid L4', () => {
  const gate = inputRiskGate({
    evaluation: {
      riskLevel: 4,
      decision: 'blocked',
      reasonCodes: ['POLICY'],
    },
  });
  assert.equal(gate.decision, 'blocked');
  assert.equal(gate.blocked, true);
});

test('inputRiskGate review_required maps through', () => {
  const gate = inputRiskGate({
    evaluation: { riskLevel: 2, decision: 'review_required', reasonCodes: ['R1'] },
  });
  assert.equal(gate.decision, 'review_required');
  assert.equal(gate.blocked, false);
  assert.deepEqual(gate.reasonCodes, ['R1']);
});

test('inputRiskGate allow_flag when risk level >= 2', () => {
  const gate = inputRiskGate({
    evaluation: { riskLevel: 3, decision: 'allow', reasonCodes: [] },
  });
  assert.equal(gate.decision, 'allow_flag');
  assert.equal(gate.blocked, false);
});

test('inputRiskGate clamps riskLevel into 1–5', () => {
  const low = inputRiskGate({ evaluation: { riskLevel: 0, decision: 'allow' } });
  assert.equal(low.riskLevel, 1);
  const high = inputRiskGate({ evaluation: { riskLevel: 99, decision: 'allow' } });
  assert.equal(high.riskLevel, 5);
});

test('toDecisionFromRiskEvaluation is case-insensitive on decision', () => {
  assert.equal(
    toDecisionFromRiskEvaluation({ riskLevel: 5, decision: 'BLOCKED' }),
    'critical_escalate'
  );
  assert.equal(toDecisionFromRiskEvaluation({ riskLevel: 1, decision: 'ALLOW' }), 'allow');
});

test('toDecisionFromRiskEvaluation blocked under L5 och review_required med blandad casing', () => {
  assert.equal(toDecisionFromRiskEvaluation({ riskLevel: 4, decision: 'Blocked' }), 'blocked');
  assert.equal(
    toDecisionFromRiskEvaluation({ riskLevel: 3, decision: 'Review_Required' }),
    'review_required'
  );
});

test('toDecisionFromRiskEvaluation default riskLevel 1 när saknas eller ogiltig', () => {
  assert.equal(toDecisionFromRiskEvaluation({ decision: 'allow' }), 'allow');
  assert.equal(toDecisionFromRiskEvaluation({ riskLevel: NaN, decision: 'allow' }), 'allow');
  assert.equal(toDecisionFromRiskEvaluation({ riskLevel: 'x', decision: 'allow' }), 'allow');
});

test('toDecisionFromRiskEvaluation tolererar null evaluation', () => {
  assert.equal(toDecisionFromRiskEvaluation(null), 'allow');
});

test('inputRiskGate och outputRiskGate med explicit null evaluation defaultar säkert', () => {
  const input = inputRiskGate({ evaluation: null });
  assert.equal(input.decision, 'allow');
  assert.equal(input.riskLevel, 1);
  assert.equal(input.riskScore, 0);
  assert.deepEqual(input.reasonCodes, []);

  const output = outputRiskGate({ evaluation: null });
  assert.equal(output.decision, 'allow');
  assert.equal(output.riskLevel, 1);
});

test('policyFloorGate med null evaluation behandlas som ren allow', () => {
  const gate = policyFloorGate({ evaluation: null });
  assert.equal(gate.decision, 'allow');
  assert.equal(gate.blocked, false);
  assert.equal(gate.maxFloor, 1);
  assert.deepEqual(gate.reasonCodes, []);
});

test('inputRiskGate defaultar till allow utan evaluation-argument', () => {
  const gate = inputRiskGate();
  assert.equal(gate.gate, 'inputRisk');
  assert.equal(gate.decision, 'allow');
  assert.equal(gate.blocked, false);
  assert.equal(gate.riskLevel, 1);
  assert.deepEqual(gate.reasonCodes, []);
});

test('inputRiskGate reasonCodes blir tom array nar falt inte ar en array', () => {
  const gate = inputRiskGate({
    evaluation: { riskLevel: 1, decision: 'allow', reasonCodes: 'oops' },
  });
  assert.deepEqual(gate.reasonCodes, []);
});

test('inputRiskGate riskScore blir NaN for icke-numerisk strang', () => {
  const gate = inputRiskGate({
    evaluation: { riskLevel: 2, riskScore: 'x', decision: 'allow', reasonCodes: [] },
  });
  assert.equal(Number.isNaN(gate.riskScore), true);
});

test('inputRiskGate behaller referens till evaluation-objektet', () => {
  const evaluation = { riskLevel: 1, decision: 'allow', reasonCodes: ['K'] };
  const gate = inputRiskGate({ evaluation });
  assert.equal(gate.evaluation, evaluation);
});

test('toDecisionFromRiskEvaluation okand decision foljer riskniva-trappa', () => {
  assert.equal(toDecisionFromRiskEvaluation({ riskLevel: 1, decision: 'quarantine' }), 'allow');
  assert.equal(toDecisionFromRiskEvaluation({ riskLevel: 3, decision: 'quarantine' }), 'allow_flag');
});

test('toDecisionFromRiskEvaluation blocked vinner over allow_flag vid L3', () => {
  assert.equal(toDecisionFromRiskEvaluation({ riskLevel: 3, decision: 'blocked' }), 'blocked');
});

test('toDecisionFromRiskEvaluation risk L5 med decision allow ger allow_flag inte critical_escalate', () => {
  assert.equal(toDecisionFromRiskEvaluation({ riskLevel: 5, decision: 'allow' }), 'allow_flag');
});

test('outputRiskGate returns blocked for blocked evaluation', () => {
  const gate = outputRiskGate({
    evaluation: {
      riskLevel: 4,
      riskScore: 75,
      decision: 'blocked',
      reasonCodes: ['NO_GUARANTEE_POLICY'],
    },
  });
  assert.equal(gate.decision, 'blocked');
  assert.equal(gate.blocked, true);
});

test('outputRiskGate speglar allow, allow_flag och critical_escalate', () => {
  const low = outputRiskGate({
    evaluation: { riskLevel: 1, riskScore: 0, decision: 'allow', reasonCodes: [] },
  });
  assert.equal(low.decision, 'allow');
  assert.equal(low.blocked, false);
  assert.equal(low.riskScore, 0);

  const flagged = outputRiskGate({
    evaluation: { riskLevel: 2, decision: 'allow', reasonCodes: ['H1'] },
  });
  assert.equal(flagged.decision, 'allow_flag');
  assert.equal(flagged.blocked, false);

  const critical = outputRiskGate({
    evaluation: { riskLevel: 5, decision: 'blocked', reasonCodes: ['OUT'] },
  });
  assert.equal(critical.decision, 'critical_escalate');
  assert.equal(critical.blocked, true);
});

test('outputRiskGate review_required är inte blocked', () => {
  const gate = outputRiskGate({
    evaluation: { riskLevel: 2, decision: 'review_required', reasonCodes: ['R'] },
  });
  assert.equal(gate.decision, 'review_required');
  assert.equal(gate.blocked, false);
});

test('outputRiskGate reasonCodes blir tom array när fält saknas', () => {
  const gate = outputRiskGate({
    evaluation: { riskLevel: 1, decision: 'allow' },
  });
  assert.deepEqual(gate.reasonCodes, []);
});

test('outputRiskGate clamps riskLevel to 1..5 and preserves Number() coercion for riskScore', () => {
  const low = outputRiskGate({
    evaluation: { riskLevel: 0, riskScore: 'not-a-number', decision: 'allow' },
  });
  assert.equal(low.riskLevel, 1);
  assert.equal(Number.isNaN(low.riskScore), true);

  const high = outputRiskGate({
    evaluation: { riskLevel: 99, riskScore: 12.5, decision: 'allow' },
  });
  assert.equal(high.riskLevel, 5);
  assert.equal(high.riskScore, 12.5);
});

test('outputRiskGate keeps reference to evaluation payload', () => {
  const evaluation = { riskLevel: 4, decision: 'blocked', reasonCodes: ['X'] };
  const gate = outputRiskGate({ evaluation });
  assert.equal(gate.evaluation, evaluation);
});

test('policyFloorGate blocks when policy floor is blocked', () => {
  const gate = policyFloorGate({
    evaluation: {
      blocked: true,
      maxFloor: 4,
      hits: [{ id: 'NO_DIAGNOSIS_POLICY' }],
    },
  });
  assert.equal(gate.decision, 'blocked');
  assert.equal(gate.blocked, true);
  assert.deepEqual(gate.reasonCodes, ['NO_DIAGNOSIS_POLICY']);
});

test('policyFloorGate critical_escalate when blocked at top floor', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: true, maxFloor: 5, hits: [{ id: 'L5_POLICY' }] },
  });
  assert.equal(gate.decision, 'critical_escalate');
  assert.equal(gate.blocked, true);
  assert.equal(gate.maxFloor, 5);
});

test('policyFloorGate allow_flag when maxFloor >= 3 without block', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: false, maxFloor: 4, hits: [] },
  });
  assert.equal(gate.decision, 'allow_flag');
  assert.equal(gate.blocked, false);
});

test('policyFloorGate allow_flag when reason hits present', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: false, maxFloor: 1, hits: [{ id: '  SOFT_HIT  ' }] },
  });
  assert.equal(gate.decision, 'allow_flag');
  assert.deepEqual(gate.reasonCodes, ['SOFT_HIT']);
});

test('policyFloorGate allow on clean low floor', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: false, maxFloor: 2, hits: [] },
  });
  assert.equal(gate.decision, 'allow');
  assert.equal(gate.blocked, false);
});

test('policyFloorGate clamps invalid maxFloor to 1', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: false, maxFloor: 0, hits: [] },
  });
  assert.equal(gate.maxFloor, 1);
  assert.equal(gate.decision, 'allow');
});

test('policyFloorGate trims reasonCodes and removes empty ids', () => {
  const gate = policyFloorGate({
    evaluation: {
      blocked: false,
      maxFloor: 2,
      hits: [{ id: '  A  ' }, { id: '' }, {}, { id: 'B' }],
    },
  });
  assert.deepEqual(gate.reasonCodes, ['A', 'B']);
  assert.equal(gate.decision, 'allow_flag');
});

test('policyFloorGate blocked true with invalid maxFloor still blocks', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: true, maxFloor: NaN, hits: [] },
  });
  assert.equal(gate.maxFloor, 1);
  assert.equal(gate.decision, 'blocked');
  assert.equal(gate.blocked, true);
});

test('policyFloorGate keeps reference to original evaluation', () => {
  const evaluation = { blocked: false, maxFloor: 3, hits: [] };
  const gate = policyFloorGate({ evaluation });
  assert.equal(gate.evaluation, evaluation);
});

test('outputRiskGate defaultar till allow utan evaluation-argument', () => {
  const gate = outputRiskGate();
  assert.equal(gate.gate, 'outputRisk');
  assert.equal(gate.decision, 'allow');
  assert.equal(gate.blocked, false);
  assert.equal(gate.riskLevel, 1);
  assert.deepEqual(gate.reasonCodes, []);
});

test('policyFloorGate defaultar till allow utan evaluation-argument', () => {
  const gate = policyFloorGate();
  assert.equal(gate.gate, 'policyFloor');
  assert.equal(gate.decision, 'allow');
  assert.equal(gate.blocked, false);
  assert.equal(gate.maxFloor, 1);
  assert.deepEqual(gate.reasonCodes, []);
});

test('policyFloorGate allow_flag nar maxFloor ar 5 men blocked ar false', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: false, maxFloor: 5, hits: [] },
  });
  assert.equal(gate.decision, 'allow_flag');
  assert.equal(gate.blocked, false);
});

test('policyFloorGate behandlar hits som inte ar array som inga traffar', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: false, maxFloor: 2, hits: 'not-array' },
  });
  assert.deepEqual(gate.reasonCodes, []);
  assert.equal(gate.decision, 'allow');
});

test('policyFloorGate clamps maxFloor to maximum 5', () => {
  const gate = policyFloorGate({
    evaluation: { blocked: false, maxFloor: 999, hits: [] },
  });
  assert.equal(gate.maxFloor, 5);
  assert.equal(gate.decision, 'allow_flag');
});

test('outputRiskGate reasonCodes empty when field is not an array', () => {
  const gate = outputRiskGate({
    evaluation: { riskLevel: 2, decision: 'allow', reasonCodes: 'oops' },
  });
  assert.deepEqual(gate.reasonCodes, []);
});

test('toDecisionFromRiskEvaluation treats undefined evaluation as allow', () => {
  assert.equal(toDecisionFromRiskEvaluation(undefined), 'allow');
});
