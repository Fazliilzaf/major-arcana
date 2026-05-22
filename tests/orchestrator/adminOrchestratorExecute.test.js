const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildExecutableSteps,
  INTENTS,
  runAdminOrchestration,
} = require('../../src/orchestrator/adminOrchestrator');

test('buildExecutableSteps filters auto-execute allowed plan steps', () => {
  const plan = [
    { step: 'validate_tenant_scope', owner: 'ARCANA' },
    { step: 'inspect_template_status', owner: 'CAO' },
    { step: 'request_owner_action_if_needed', owner: 'ARCANA' },
  ];
  const executable = buildExecutableSteps(plan);
  assert.equal(executable.length, 1);
  assert.equal(executable[0].capability, 'AssessTemplateLibraryHealth');
});

test('runAdminOrchestration execute mode runs capability steps', async () => {
  const calls = [];
  const result = await runAdminOrchestration({
    prompt: 'Granska mallbibliotek och template disclaimers för konsultation',
    role: 'OWNER',
    tenantId: 'tenant-a',
    tenantConfig: {},
    mode: 'execute',
    executeContext: {
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      correlationId: 'corr-exec-1',
      hydrateSnapshot: async () => ({ templates: [], adminTasks: [], incidents: [], auditEvents: [] }),
      runCapability: async (payload) => {
        calls.push(payload.capabilityName);
        return { gatewayResult: { decision: 'allow' }, output: { data: { summary: 'ok' } } };
      },
    },
  });

  assert.equal(result.intent, INTENTS.TEMPLATE_LIBRARY);
  assert.equal(result.mode, 'execute');
  assert.ok(Array.isArray(result.executedSteps));
  assert.ok(result.executedSteps.length >= 1);
  assert.ok(calls.includes('AssessTemplateLibraryHealth'));
});

test('runAdminOrchestration execute mode runs CAO agent for primary intents', async () => {
  const agentCalls = [];
  const result = await runAdminOrchestration({
    prompt: 'Granska mallbibliotek och template disclaimers för konsultation',
    role: 'OWNER',
    tenantId: 'tenant-a',
    tenantConfig: {},
    mode: 'execute',
    executeContext: {
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      correlationId: 'corr-agent-1',
      hydrateSnapshot: async () => ({ templates: [], adminTasks: [] }),
      runAgent: async (payload) => {
        agentCalls.push(payload);
        return { gatewayResult: { decision: 'allow' }, output: { data: { executiveSummary: 'ok' } } };
      },
      runCapability: async () => {
        throw new Error('capability should not run when agent path is available');
      },
    },
  });

  assert.equal(result.intent, INTENTS.TEMPLATE_LIBRARY);
  assert.equal(result.mode, 'execute');
  assert.equal(agentCalls.length, 1);
  assert.equal(agentCalls[0].agentName, 'CAO');
  assert.equal(agentCalls[0].input.orchestratorIntent, INTENTS.TEMPLATE_LIBRARY);
  assert.ok(result.executedSteps.some((step) => step.step === 'cao_admin_operator_run'));
  assert.ok(result.executePreview?.recommendedAgentRun?.agent === 'CAO');
});
