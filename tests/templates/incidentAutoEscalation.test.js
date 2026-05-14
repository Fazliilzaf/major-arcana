const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTemplateStore } = require('../../src/templates/store');
const { OWNER_ACTIONS } = require('../../src/templates/ownerActions');

async function rewindLatestEvaluationClock({ filePath, hoursAgo = 2 }) {
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const list = Array.isArray(raw.evaluations) ? raw.evaluations : [];
  if (!list.length) throw new Error('expected evaluations in store file');
  const ev = list[list.length - 1];
  const ts = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  ev.evaluatedAt = ts;
  ev.updatedAt = ts;
  await fs.writeFile(filePath, JSON.stringify(raw, null, 2), 'utf8');
}

test('autoEscalateBreachedIncidents adds escalate action when SLA is breached', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auto-escalate-'));
  const filePath = path.join(tempDir, 'templates.json');
  const store = await createTemplateStore({ filePath, maxEvaluations: 500 });

  const template = await store.createTemplate({
    tenantId: 'tenant-a',
    category: 'CONSULTATION',
    name: 'Escalation fixture',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'owner-a',
  });
  const draft = await store.createDraftVersion({
    templateId: template.id,
    title: 'Draft',
    content: 'Hej',
    source: 'manual',
    variablesUsed: [],
    createdBy: 'owner-a',
  });

  const baseEval = {
    scope: 'output',
    category: 'CONSULTATION',
    tenantRiskModifier: 0,
    riskLevel: 5,
    riskColor: 'red',
    riskScore: 99,
    semanticScore: 10,
    ruleScore: 90,
    decision: 'blocked',
    reasonCodes: ['fixture_breach'],
    ruleHits: [],
    policyHits: [],
    policyAdjustments: [],
    versions: {
      ruleSetVersion: 'rules.v1',
      thresholdVersion: 'threshold.v1',
      semanticModelVersion: 'semantic.v1',
      fusionVersion: 'fusion.v1',
      buildVersion: 'build.v1',
    },
  };

  await store.evaluateVersion({
    templateId: template.id,
    versionId: draft.id,
    inputEvaluation: { ...baseEval, scope: 'input', riskLevel: 1 },
    outputEvaluation: baseEval,
  });

  await rewindLatestEvaluationClock({ filePath, hoursAgo: 2 });

  const store2 = await createTemplateStore({ filePath, maxEvaluations: 500 });
  const out = await store2.autoEscalateBreachedIncidents({
    tenantId: 'tenant-a',
    actorUserId: 'test-runner',
    limit: 10,
  });

  assert.equal(out.escalatedCount, 1);
  assert.equal(out.eligibleBreachedOpen >= 1, true);
  assert.ok(out.escalated[0]?.slaDeadline);

  const evaluations = await store2.listEvaluations({ tenantId: 'tenant-a', limit: 5 });
  const latest = evaluations[0];
  assert.equal(String(latest.ownerDecision || '').toLowerCase(), 'escalated');
  const actions = Array.isArray(latest.ownerActions) ? latest.ownerActions : [];
  assert.ok(actions.some((a) => String(a.action || '').toLowerCase() === OWNER_ACTIONS.ESCALATE));

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('autoEscalateBreachedIncidents skips non-breached open incidents', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auto-escalate-skip-'));
  const filePath = path.join(tempDir, 'templates.json');
  const store = await createTemplateStore({ filePath, maxEvaluations: 500 });

  const template = await store.createTemplate({
    tenantId: 'tenant-b',
    category: 'CONSULTATION',
    name: 'No breach',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'owner-b',
  });
  const draft = await store.createDraftVersion({
    templateId: template.id,
    title: 'Draft',
    content: 'Hej',
    source: 'manual',
    variablesUsed: [],
    createdBy: 'owner-b',
  });

  const baseEval = {
    scope: 'output',
    category: 'CONSULTATION',
    tenantRiskModifier: 0,
    riskLevel: 5,
    riskColor: 'red',
    riskScore: 80,
    semanticScore: 10,
    ruleScore: 70,
    decision: 'blocked',
    reasonCodes: ['fixture_ok'],
    ruleHits: [],
    policyHits: [],
    policyAdjustments: [],
    versions: {
      ruleSetVersion: 'rules.v1',
      thresholdVersion: 'threshold.v1',
      semanticModelVersion: 'semantic.v1',
      fusionVersion: 'fusion.v1',
      buildVersion: 'build.v1',
    },
  };

  await store.evaluateVersion({
    templateId: template.id,
    versionId: draft.id,
    inputEvaluation: { ...baseEval, scope: 'input', riskLevel: 1 },
    outputEvaluation: baseEval,
  });

  const store2 = await createTemplateStore({ filePath, maxEvaluations: 500 });
  const out = await store2.autoEscalateBreachedIncidents({
    tenantId: 'tenant-b',
    actorUserId: 'test-runner',
    limit: 10,
  });

  assert.equal(out.escalatedCount, 0);
  assert.equal(out.eligibleBreachedOpen, 0);

  await fs.rm(tempDir, { recursive: true, force: true });
});
