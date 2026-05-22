const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTemplateStore } = require('../../src/templates/store');
const { buildIncidentFromEvaluation } = require('../../src/incidents/fromEvaluation');

test('autoAssignOpenIncidentOwners stamps assign_owner on open unowned L5 incidents', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auto-assign-'));
  const filePath = path.join(tempDir, 'templates.json');
  const store = await createTemplateStore({ filePath, maxEvaluations: 500 });

  const template = await store.createTemplate({
    tenantId: 'tenant-own',
    category: 'CONSULTATION',
    name: 'Owner assign fixture',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'creator',
  });
  const draft = await store.createDraftVersion({
    templateId: template.id,
    title: 'Draft',
    content: 'Hej',
    source: 'manual',
    variablesUsed: [],
    createdBy: 'creator',
  });

  const outputEval = {
    scope: 'output',
    category: 'CONSULTATION',
    tenantRiskModifier: 0,
    riskLevel: 5,
    riskColor: 'red',
    riskScore: 90,
    semanticScore: 10,
    ruleScore: 80,
    decision: 'blocked',
    reasonCodes: ['fixture_owner'],
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
    inputEvaluation: { ...outputEval, scope: 'input', riskLevel: 1 },
    outputEvaluation: outputEval,
  });

  const store2 = await createTemplateStore({ filePath, maxEvaluations: 500 });
  const ownerUserId = 'owner-user-99';
  const out = await store2.autoAssignOpenIncidentOwners({
    tenantId: 'tenant-own',
    ownerUserId,
    actorUserId: 'scheduler-test',
    limit: 10,
  });

  assert.equal(out.assignedCount, 1);
  assert.equal(out.eligibleOpenUnowned >= 1, true);
  assert.equal(out.assigned[0]?.assignedOwnerUserId, ownerUserId);
  assert.ok(out.assigned[0]?.slaDeadline);

  const evaluations = await store2.listEvaluations({ tenantId: 'tenant-own', limit: 5 });
  const latest = evaluations[0];
  const actions = Array.isArray(latest.ownerActions) ? latest.ownerActions : [];
  const assign = actions.find((a) => String(a.action || '') === 'assign_owner');
  assert.ok(assign);
  assert.equal(assign.actorUserId, ownerUserId);

  const rawEval = (await store2.listEvaluations({ tenantId: 'tenant-own', limit: 1 }))[0];
  const incident = buildIncidentFromEvaluation(rawEval);
  assert.ok(incident);
  assert.equal(incident.owner?.userId, ownerUserId);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('autoAssignOpenIncidentOwners returns skipped when ownerUserId missing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auto-assign-skip-'));
  const filePath = path.join(tempDir, 'templates.json');
  const store = await createTemplateStore({ filePath, maxEvaluations: 500 });

  const out = await store.autoAssignOpenIncidentOwners({
    tenantId: 'tenant-x',
    ownerUserId: '',
    limit: 10,
  });

  assert.equal(out.skipped, true);
  assert.equal(out.assignedCount, 0);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('autoAssignOpenIncidentOwners clamps high limit and maps zero limit to default 100', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auto-assign-limit-'));
  const filePath = path.join(tempDir, 'templates.json');
  try {
    const store = await createTemplateStore({ filePath, maxEvaluations: 500 });
    const high = await store.autoAssignOpenIncidentOwners({
      tenantId: 'tenant-x',
      ownerUserId: 'owner-1',
      limit: 9999,
    });
    assert.equal(high.limit, 500);
    const zeroish = await store.autoAssignOpenIncidentOwners({
      tenantId: 'tenant-x',
      ownerUserId: 'owner-1',
      limit: 0,
    });
    assert.equal(zeroish.limit, 100);
    const negative = await store.autoAssignOpenIncidentOwners({
      tenantId: 'tenant-x',
      ownerUserId: 'owner-1',
      limit: -40,
    });
    assert.equal(negative.limit, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('autoAssignOpenIncidentOwners uses default limit 100 when limit is NaN', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auto-assign-limit-nan-'));
  const filePath = path.join(tempDir, 'templates.json');
  try {
    const store = await createTemplateStore({ filePath, maxEvaluations: 500 });
    const out = await store.autoAssignOpenIncidentOwners({
      tenantId: 'tenant-x',
      ownerUserId: 'owner-1',
      limit: Number.NaN,
    });
    assert.equal(out.limit, 100);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('autoAssignOpenIncidentOwners skips when ownerUserId is whitespace only', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auto-assign-ws-'));
  const filePath = path.join(tempDir, 'templates.json');
  try {
    const store = await createTemplateStore({ filePath, maxEvaluations: 500 });
    const out = await store.autoAssignOpenIncidentOwners({
      tenantId: 'tenant-x',
      ownerUserId: '   \t  ',
      limit: 10,
    });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, 'owner_user_id_missing');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
