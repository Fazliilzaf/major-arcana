const test = require('node:test');
const assert = require('node:assert/strict');

const { generateTaskPlanCapability } = require('../../src/capabilities/generateTaskPlan');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

test('GenerateTaskPlan returns max 5 prioritized tasks and valid output schema', async () => {
  const output = await new generateTaskPlanCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-1',
    correlationId: 'corr-1',
    input: {
      maxTasks: 5,
      includeEvidence: true,
    },
    systemStateSnapshot: {
      openReviews: [
        { id: 'rev-1', riskLevel: 5, decision: 'blocked' },
        { id: 'rev-2', riskLevel: 4, decision: 'review_required' },
        { id: 'rev-3', riskLevel: 2, decision: 'allow' },
      ],
      incidents: [
        { id: 'inc-1', severity: 'L5', ownerDecision: 'escalate_to_owner' },
        { id: 'inc-2', severity: 'L4', ownerDecision: 'pending' },
      ],
      kpi: {
        triggeredNoGoCount: 0,
        sloBreaches: 1,
        openUnresolvedIncidents: 2,
        highCriticalOpenReviews: 2,
      },
      latestTemplateChanges: [
        { templateId: 'tpl-1', updatedAt: '2026-02-01T10:00:00.000Z' },
        { templateId: 'tpl-2', updatedAt: '2026-02-25T10:00:00.000Z' },
      ],
    },
  });

  const validation = validateJsonSchema({
    schema: generateTaskPlanCapability.outputSchema,
    value: output,
    rootPath: 'capability.output',
  });

  assert.equal(validation.ok, true, `schema validation errors: ${JSON.stringify(validation.errors)}`);
  assert.equal(Array.isArray(output.data.tasks), true);
  assert.equal(output.data.tasks.length <= 5, true);
  assert.equal(output.data.tasks[0].priority === 'P0' || output.data.tasks[0].priority === 'P1', true);
  assert.equal(
    ['low', 'medium', 'high', 'critical'].includes(String(output.data.riskHighlight?.level || '')),
    true
  );
  assert.equal(Array.isArray(output.data.recommendedActions), true);
  assert.equal(output.data.recommendedActions.length > 0, true);
  assert.equal(output.metadata.capability, 'GenerateTaskPlan');
  assert.equal(Array.isArray(output.warnings), true);
});

test('GenerateTaskPlan creates fallback plan when no urgent signals exist', async () => {
  const output = await new generateTaskPlanCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'staff-a', role: 'STAFF' },
    channel: 'admin',
    requestId: 'req-2',
    correlationId: 'corr-2',
    input: {
      maxTasks: 3,
    },
    systemStateSnapshot: {
      openReviews: [],
      incidents: [],
      kpi: {},
      latestTemplateChanges: [],
    },
  });

  assert.equal(output.data.tasks.length >= 1, true);
  assert.equal(output.data.tasks.length <= 3, true);
  assert.equal(typeof output.data.summary, 'string');
  assert.equal(output.data.summary.length > 0, true);
  assert.ok(output.warnings.some((w) => /Inga öppna reviews/i.test(w)));
});

test('GenerateTaskPlan sätter tom evidence på alla tasks när includeEvidence är false', async () => {
  const output = await new generateTaskPlanCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-ev',
    correlationId: 'corr-ev',
    input: { maxTasks: 5, includeEvidence: false },
    systemStateSnapshot: {
      openReviews: [{ id: 'rev-1', riskLevel: 5, decision: 'blocked' }],
      incidents: [{ id: 'inc-1', severity: 'L5', ownerDecision: 'pending' }],
      kpi: {},
      latestTemplateChanges: [],
    },
  });

  for (const task of output.data.tasks) {
    assert.equal(task.evidence, '');
  }
});

test('GenerateTaskPlan med maxTasks=1 returnerar endast högst prioriterade uppgiften', async () => {
  const output = await new generateTaskPlanCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-m1',
    correlationId: 'corr-m1',
    input: { maxTasks: 1 },
    systemStateSnapshot: {
      openReviews: [],
      incidents: [
        { id: 'inc-1', severity: 'L5', ownerDecision: 'pending' },
        { id: 'inc-2', severity: 'L4', ownerDecision: 'escalate_to_owner' },
      ],
      kpi: { sloBreaches: 1 },
      latestTemplateChanges: [],
    },
  });

  assert.equal(output.data.tasks.length, 1);
  assert.equal(output.data.tasks[0].priority, 'P0');
  assert.equal(output.data.tasks[0].id, 'triage_l5_incidents');
});

test('GenerateTaskPlan varnar när malländringar är äldre än fem dagar', async () => {
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const output = await new generateTaskPlanCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-stale',
    correlationId: 'corr-stale',
    input: { maxTasks: 5 },
    systemStateSnapshot: {
      openReviews: [{ id: 'rev-1', riskLevel: 2, decision: 'allow' }],
      incidents: [],
      kpi: {},
      latestTemplateChanges: [{ templateId: 'tpl-old', updatedAt: old }],
    },
  });

  assert.ok(output.warnings.some((w) => /malländringar/i.test(w)));
});

test('GenerateTaskPlan maxTasks klampas till 1–5', async () => {
  const stale = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const snapshot = {
    openReviews: [{ id: 'r1', riskLevel: 5, decision: 'blocked' }],
    incidents: [
      { id: 'i1', severity: 'L5', ownerDecision: 'pending' },
      { id: 'i2', severity: 'L4', ownerDecision: 'escalate_to_owner' },
    ],
    kpi: {
      sloBreaches: 2,
      triggeredNoGoCount: 1,
      openUnresolvedIncidents: 3,
      highCriticalOpenReviews: 2,
    },
    latestTemplateChanges: [{ templateId: 't1', updatedAt: stale }],
  };

  const one = await new generateTaskPlanCapability().execute({
    tenantId: 't',
    channel: 'admin',
    input: { maxTasks: 0 },
    systemStateSnapshot: snapshot,
  });
  assert.equal(one.data.tasks.length, 1);

  const five = await new generateTaskPlanCapability().execute({
    tenantId: 't',
    channel: 'admin',
    input: { maxTasks: 99 },
    systemStateSnapshot: snapshot,
  });
  assert.equal(five.data.tasks.length, 5);
});

test('GenerateTaskPlan utan systemStateSnapshot ger fallback och varningar', async () => {
  const output = await new generateTaskPlanCapability().execute({
    tenantId: 't',
    channel: 'admin',
    input: { maxTasks: 3 },
  });
  assert.ok(output.warnings.some((w) => /Inga öppna reviews/i.test(w)));
  assert.equal(output.data.tasks.length >= 1, true);
});

test('GenerateTaskPlan saknad tenantId i summary och metadata', async () => {
  const output = await new generateTaskPlanCapability().execute({
    channel: 'admin',
    input: { maxTasks: 2 },
    systemStateSnapshot: {
      openReviews: [],
      incidents: [{ id: 'i', severity: 'L3', ownerDecision: 'pending' }],
      kpi: {},
      latestTemplateChanges: [],
    },
  });
  assert.match(output.data.summary, /tenant unknown/);
  assert.equal(output.metadata.tenantId, 'unknown');
});
