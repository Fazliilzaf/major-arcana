const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTemplateStore } = require('../../src/templates/store');

test('template evaluations persist risk version metadata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-risk-version-store-'));
  const filePath = path.join(tempDir, 'templates.json');
  const store = await createTemplateStore({
    filePath,
    maxEvaluations: 100,
  });

  const template = await store.createTemplate({
    tenantId: 'tenant-a',
    category: 'CONSULTATION',
    name: 'Versioned Template',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'owner-a',
  });
  const draft = await store.createDraftVersion({
    templateId: template.id,
    title: 'Draft v1',
    content: 'Hej {{first_name}}',
    source: 'manual',
    variablesUsed: ['first_name'],
    createdBy: 'owner-a',
  });

  const inputEvaluation = {
    scope: 'input',
    category: 'CONSULTATION',
    tenantRiskModifier: 0,
    riskLevel: 1,
    riskColor: 'green',
    riskScore: 5,
    semanticScore: 5,
    ruleScore: 0,
    decision: 'allow',
    reasonCodes: [],
    ruleHits: [],
    policyHits: [],
    policyAdjustments: [],
    versions: {
      ruleSetVersion: 'rules.v1',
      thresholdVersion: 'threshold.v3',
      semanticModelVersion: 'semantic.heuristic.v1',
      fusionVersion: 'fusion.weighted.v1',
      buildVersion: 'build.v3',
    },
    evaluatedAt: new Date().toISOString(),
  };
  const outputEvaluation = {
    ...inputEvaluation,
    scope: 'output',
  };

  await store.evaluateVersion({
    templateId: template.id,
    versionId: draft.id,
    inputEvaluation,
    outputEvaluation,
  });

  const evaluations = await store.listEvaluations({
    tenantId: 'tenant-a',
    limit: 10,
  });
  assert.equal(evaluations.length >= 1, true);
  const latest = evaluations[0];

  assert.equal(typeof latest.versions, 'object');
  assert.equal(latest.versions.ruleSetVersion, 'rules.v1');
  assert.equal(latest.versions.thresholdVersion, 'threshold.v3');
  assert.equal(latest.versions.semanticModelVersion, 'semantic.heuristic.v1');
  assert.equal(latest.versions.fusionVersion, 'fusion.weighted.v1');
  assert.equal(latest.versions.buildVersion, 'build.v3');
});
