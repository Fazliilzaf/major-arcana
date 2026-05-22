const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateTemplateRisk } = require('../../src/risk/templateRisk');
const { createExecutionGateway } = require('../../src/gateway/executionGateway');

test('evaluateTemplateRisk includes risk engine versions', () => {
  const evaluation = evaluateTemplateRisk({
    scope: 'output',
    category: 'CONSULTATION',
    content: 'Hej {{first_name}}',
    tenantRiskModifier: 0,
    riskThresholdVersion: 7,
  });

  assert.equal(typeof evaluation.versions, 'object');
  assert.equal(evaluation.versions.ruleSetVersion, 'rules.v1');
  assert.equal(evaluation.versions.thresholdVersion, 'threshold.v7');
  assert.equal(evaluation.versions.semanticModelVersion, 'semantic.heuristic.v1');
  assert.equal(evaluation.versions.fusionVersion, 'fusion.weighted.v1');
  assert.equal(typeof evaluation.versions.buildVersion, 'string');
  assert.equal(evaluation.versions.buildVersion.length > 0, true);
});

test('ExecutionGateway exposes derived risk summary versions', async () => {
  const gateway = createExecutionGateway({ buildVersion: 'test-build-vx' });
  const result = await gateway.run({
    context: {
      tenant_id: 'tenant-a',
      actor: { id: 'u1', role: 'OWNER' },
      channel: 'template',
      intent: 'version-test',
      payload: {},
      correlation_id: 'corr-risk-versions',
      idempotency_key: 'idem-risk-versions',
    },
    handlers: {
      inputRisk: async () => ({
        decision: 'allow',
        riskLevel: 1,
        riskScore: 5,
        versions: {
          ruleSetVersion: 'rules.v1',
          thresholdVersion: 'threshold.v9',
          semanticModelVersion: 'semantic.heuristic.v1',
          fusionVersion: 'fusion.weighted.v1',
          buildVersion: 'build-risk-v9',
        },
      }),
      agentRun: async () => ({ text: 'ok' }),
      outputRisk: async () => ({
        decision: 'allow',
        riskLevel: 1,
        riskScore: 6,
        versions: {
          ruleSetVersion: 'rules.v1',
          thresholdVersion: 'threshold.v9',
          semanticModelVersion: 'semantic.heuristic.v1',
          fusionVersion: 'fusion.weighted.v1',
          buildVersion: 'build-risk-v9',
        },
      }),
      policyFloor: async () => ({ blocked: false, maxFloor: 1, hits: [] }),
    },
  });

  assert.equal(result.decision, 'allow');
  assert.deepEqual(result.risk_summary.versions, {
    ruleSet: 'rules.v1',
    threshold: 'threshold.v9',
    model: 'semantic.heuristic.v1',
    fusion: 'fusion.weighted.v1',
    build: 'build-risk-v9',
  });
});

test('strict template variable mode blocks unapproved variables', () => {
  const evaluation = evaluateTemplateRisk({
    scope: 'output',
    category: 'CONSULTATION',
    content: 'Hej {{unknown_var}}',
    tenantRiskModifier: 0,
    riskThresholdVersion: 2,
    variableValidation: {
      unknownVariables: ['unknown_var'],
      missingRequiredVariables: [],
    },
    enforceStrictTemplateVariables: true,
  });

  assert.equal(evaluation.riskLevel >= 4, true);
  assert.equal(evaluation.decision, 'blocked');
  assert.equal(evaluation.reasonCodes.includes('UNAPPROVED_TEMPLATE_VARIABLE'), true);
});

test('evaluateTemplateRisk can switch semantic model mode to linear', () => {
  const prevMode = process.env.ARCANA_SEMANTIC_MODEL_MODE;
  process.env.ARCANA_SEMANTIC_MODEL_MODE = 'linear';
  try {
    const evaluation = evaluateTemplateRisk({
      scope: 'output',
      category: 'CONSULTATION',
      content: 'Vi garanterar resultat och detta är en diagnos.',
      tenantRiskModifier: 0,
      riskThresholdVersion: 2,
    });

    assert.equal(evaluation.versions.semanticModelVersion, 'semantic.linear.v1');
    assert.equal(evaluation.semanticScore >= 0, true);
  } finally {
    if (prevMode === undefined) {
      delete process.env.ARCANA_SEMANTIC_MODEL_MODE;
    } else {
      process.env.ARCANA_SEMANTIC_MODEL_MODE = prevMode;
    }
  }
});
