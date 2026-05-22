const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INTENTS,
  getOrchestratorRoadmap,
  runAdminOrchestration,
} = require('../../src/orchestrator/adminOrchestrator');

test('getOrchestratorRoadmap returns versioned phase list', () => {
  const r = getOrchestratorRoadmap();
  assert.equal(r.version, '2026-02-25');
  assert.ok(Array.isArray(r.phases));
  assert.ok(r.phases.some((p) => p.id === 'phase_now'));
});

test('runAdminOrchestration infers template intent from Swedish prompt', async () => {
  const out = await runAdminOrchestration({
    prompt: 'Aktivera ny mallversion för konsultation',
    role: 'OWNER',
    tenantId: 't1',
    tenantConfig: { assistantName: 'Helena', riskSensitivityModifier: 0 },
  });
  assert.equal(out.intent, INTENTS.TEMPLATE_LIBRARY);
  assert.ok(out.confidence >= 0.8);
  assert.ok(out.selectedAgents.length > 0);
  assert.ok(out.plan.some((s) => s.step === 'validate_tenant_scope'));
  assert.ok(out.suggestedApiCalls.some((c) => c.includes('/templates')));
  assert.ok(String(out.output.text).includes('Helena'));
});

test('runAdminOrchestration treats blank prompt as empty with low confidence', async () => {
  const out = await runAdminOrchestration({
    prompt: '   ',
    role: 'OWNER',
    tenantId: 't1',
    tenantConfig: {},
  });
  assert.equal(out.intent, INTENTS.GENERAL_ADMIN);
  assert.equal(out.confidence, 0.2);
  assert.ok(out.reasons.includes('empty_prompt'));
});

test('runAdminOrchestration adds owner approval gate for non-owner roles', async () => {
  const out = await runAdminOrchestration({
    prompt: 'Exportera full audit-historik för compliance',
    role: 'STAFF',
    tenantId: 't1',
    tenantConfig: {},
  });
  assert.equal(out.intent, INTENTS.AUDIT_REVIEW);
  assert.ok(
    out.plan.some((s) => s.step === 'owner_approval_required_for_mutations')
  );
});

test('runAdminOrchestration infers risk review intent', async () => {
  const out = await runAdminOrchestration({
    prompt: 'Critical policy breach: escalate and summarize high risk flags',
    role: 'OWNER',
    tenantId: 't1',
    tenantConfig: { assistantName: 'A', riskSensitivityModifier: 0 },
  });
  assert.equal(out.intent, INTENTS.RISK_REVIEW);
  assert.ok(out.reasons.includes('risk_keywords'));
});

test('runAdminOrchestration infers staff admin intent', async () => {
  const out = await runAdminOrchestration({
    prompt: 'Invite staff user and update role permissions',
    role: 'OWNER',
    tenantId: 't1',
    tenantConfig: {},
  });
  assert.equal(out.intent, INTENTS.STAFF_ADMIN);
  assert.ok(out.reasons.includes('staff_keywords'));
});

test('runAdminOrchestration infers finance governance intent', async () => {
  const out = await runAdminOrchestration({
    prompt: 'Review Q1 budget burn runway and revenue forecast',
    role: 'OWNER',
    tenantId: 't1',
    tenantConfig: {},
  });
  assert.equal(out.intent, INTENTS.FINANCE_GOVERNANCE);
  assert.ok(out.reasons.includes('finance_keywords'));
});

test('runAdminOrchestration infers tenant branding intent', async () => {
  const out = await runAdminOrchestration({
    prompt: 'Adjust tenant brand tone and white-label assistant profile',
    role: 'OWNER',
    tenantId: 't1',
    tenantConfig: {},
  });
  assert.equal(out.intent, INTENTS.TENANT_BRANDING);
  assert.ok(out.reasons.includes('tenant_keywords'));
});
