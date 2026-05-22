const test = require('node:test');
const assert = require('node:assert/strict');

const { createExecutionGateway } = require('../../src/gateway/executionGateway');

test('ExecutionGateway enforces immutable pipeline order', async () => {
  const gateway = createExecutionGateway({ buildVersion: 'test-build' });
  const steps = [];
  const audits = [];

  const result = await gateway.run({
    context: {
      tenant_id: 'tenant-a',
      actor: { id: 'u1', role: 'OWNER' },
      channel: 'template',
      intent: 'generate_draft',
      payload: { instruction: 'hej' },
      correlation_id: 'corr-1',
      idempotency_key: 'idem-1',
    },
    handlers: {
      audit: async (event) => {
        audits.push(event.action);
      },
      inputRisk: async () => {
        steps.push('inputRisk');
        return { decision: 'allow', riskLevel: 1, riskScore: 10, reasonCodes: [] };
      },
      agentRun: async () => {
        steps.push('agentRun');
        return { text: 'safe output' };
      },
      outputRisk: async () => {
        steps.push('outputRisk');
        return { decision: 'allow', riskLevel: 1, riskScore: 12, reasonCodes: [] };
      },
      policyFloor: async () => {
        steps.push('policyFloor');
        return { blocked: false, maxFloor: 1, hits: [] };
      },
      persist: async () => {
        steps.push('persist');
        return { artifact_refs: { draft_id: 'd1' } };
      },
      response: async () => {
        steps.push('response');
        return { ok: true };
      },
    },
  });

  assert.equal(result.decision, 'allow');
  assert.deepEqual(steps, ['inputRisk', 'agentRun', 'outputRisk', 'policyFloor', 'persist', 'response']);
  assert.deepEqual(audits, [
    'gateway.run.start',
    'gateway.run.decision',
    'gateway.run.persist',
    'gateway.run.response',
  ]);
});

test('ExecutionGateway is fail-closed when risk gate throws', async () => {
  const gateway = createExecutionGateway({ buildVersion: 'test-build' });
  const steps = [];

  const result = await gateway.run({
    context: {
      tenant_id: 'tenant-a',
      actor: { id: 'u1', role: 'OWNER' },
      channel: 'patient',
      intent: 'chat_response',
      payload: { message: 'hej' },
      correlation_id: 'corr-2',
      idempotency_key: 'idem-2',
    },
    handlers: {
      inputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 5 }),
      agentRun: async () => ({ text: 'unsafe output' }),
      outputRisk: async () => {
        throw new Error('risk-timeout');
      },
      policyFloor: async () => {
        steps.push('policyFloor');
        return { blocked: false, maxFloor: 1, hits: [] };
      },
      persist: async () => {
        steps.push('persist');
        return { artifact_refs: { x: 'y' } };
      },
    },
  });

  assert.equal(result.decision, 'blocked');
  assert.equal(result.safe_response.message.length > 0, true);
  assert.deepEqual(steps, []);
});

test('ExecutionGateway serializes concurrent runs per tenant', async () => {
  const gateway = createExecutionGateway({ buildVersion: 'test-build' });
  let activeRuns = 0;
  let maxActiveRuns = 0;
  const runOrder = [];

  function createContext(intent, idempotencyKey) {
    return {
      tenant_id: 'tenant-a',
      channel: 'template',
      intent,
      payload: { instruction: intent },
      idempotency_key: idempotencyKey,
    };
  }

  const handlers = {
    inputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
    agentRun: async ({ context }) => {
      runOrder.push(`start:${context.intent}`);
      activeRuns += 1;
      maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
      await new Promise((resolve) => setTimeout(resolve, 25));
      activeRuns -= 1;
      runOrder.push(`end:${context.intent}`);
      return { text: `ok:${context.intent}` };
    },
    outputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
    policyFloor: async () => ({ blocked: false, maxFloor: 1, hits: [] }),
  };

  const [first, second] = await Promise.all([
    gateway.run({
      context: createContext('first_run', 'tenant-order-1'),
      handlers,
    }),
    gateway.run({
      context: createContext('second_run', 'tenant-order-2'),
      handlers,
    }),
  ]);

  assert.equal(first.decision, 'allow');
  assert.equal(second.decision, 'allow');
  assert.equal(maxActiveRuns, 1);
  assert.deepEqual(runOrder, [
    'start:first_run',
    'end:first_run',
    'start:second_run',
    'end:second_run',
  ]);
});

test('ExecutionGateway replays idempotent result for duplicate key', async () => {
  const gateway = createExecutionGateway({ buildVersion: 'test-build' });
  let agentCalls = 0;

  const context = {
    tenant_id: 'tenant-a',
    channel: 'template',
    intent: 'generate_draft',
    payload: { instruction: 'hej' },
    idempotency_key: 'idem-same-key',
  };

  const handlers = {
    inputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
    agentRun: async () => {
      agentCalls += 1;
      return { text: 'generated-once' };
    },
    outputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
    policyFloor: async () => ({ blocked: false, maxFloor: 1, hits: [] }),
  };

  const first = await gateway.run({ context, handlers });
  const second = await gateway.run({ context, handlers });

  assert.equal(agentCalls, 1);
  assert.equal(first.run_id, second.run_id);
  assert.equal(first.idempotency.replayed, false);
  assert.equal(second.idempotency.replayed, true);
  assert.equal(second.idempotency.source_run_id, first.run_id);
});

test('ExecutionGateway dedupes concurrent in-flight idempotent runs', async () => {
  const gateway = createExecutionGateway({ buildVersion: 'test-build' });
  let agentCalls = 0;

  const context = {
    tenant_id: 'tenant-a',
    channel: 'template',
    intent: 'generate_draft',
    payload: { instruction: 'hej' },
    idempotency_key: 'idem-concurrent-key',
  };

  const handlers = {
    inputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
    agentRun: async () => {
      agentCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { text: 'generated-concurrent' };
    },
    outputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
    policyFloor: async () => ({ blocked: false, maxFloor: 1, hits: [] }),
  };

  const [first, second] = await Promise.all([
    gateway.run({ context, handlers }),
    gateway.run({ context, handlers }),
  ]);

  assert.equal(agentCalls, 1);
  assert.equal(first.run_id, second.run_id);
  assert.equal(first.idempotency.replayed === true || second.idempotency.replayed === true, true);
});

test('ExecutionGateway retries agentRun and succeeds before dead-letter', async () => {
  const gateway = createExecutionGateway({
    buildVersion: 'test-build',
    agentRetryMaxAttempts: 3,
    agentRetryBaseDelayMs: 1,
    agentRetryBackoffFactor: 1,
  });
  let attempts = 0;

  const result = await gateway.run({
    context: {
      tenant_id: 'tenant-a',
      channel: 'template',
      intent: 'generate_draft',
      payload: { instruction: 'hej' },
      idempotency_key: 'retry-success-key',
    },
    handlers: {
      inputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
      agentRun: async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error('transient agent failure');
        }
        return { text: 'retry ok' };
      },
      outputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
      policyFloor: async () => ({ blocked: false, maxFloor: 1, hits: [] }),
    },
  });

  assert.equal(result.decision, 'allow');
  assert.equal(attempts, 2);
  assert.equal(gateway.listDeadLetters({ tenantId: 'tenant-a', limit: 10 }).length, 0);
});

test('ExecutionGateway writes dead-letter when retries are exhausted', async () => {
  const gateway = createExecutionGateway({
    buildVersion: 'test-build',
    agentRetryMaxAttempts: 2,
    agentRetryBaseDelayMs: 1,
    agentRetryBackoffFactor: 1,
  });

  const result = await gateway.run({
    context: {
      tenant_id: 'tenant-z',
      channel: 'template',
      intent: 'generate_draft',
      payload: { instruction: 'hej' },
      correlation_id: 'corr-dead-letter',
      idempotency_key: 'retry-fail-key',
    },
    handlers: {
      inputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
      agentRun: async () => {
        throw new Error('hard agent failure');
      },
      outputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
      policyFloor: async () => ({ blocked: false, maxFloor: 1, hits: [] }),
    },
  });

  assert.equal(result.decision, 'blocked');

  const letters = gateway.listDeadLetters({ tenantId: 'tenant-z', limit: 10 });
  assert.equal(letters.length > 0, true);
  const latest = letters[letters.length - 1];
  assert.equal(latest.stage, 'agentRun');
  assert.equal(latest.reasonCode, 'AGENT_RUN_FAILED_RETRY_EXHAUSTED');
  assert.equal(latest.correlationId, 'corr-dead-letter');
  assert.equal(latest.attempts, 2);

  const runtime = gateway.getRuntimeStats();
  assert.equal(runtime.deadLetters.entries >= 1, true);
  assert.equal(runtime.retries.agentMaxAttempts, 2);
});

test('ExecutionGateway can use distributed runtime backend for idempotency replay', async () => {
  const distributedResolved = new Map();
  let serializedCalls = 0;

  const runtimeBackend = {
    async runSerialized({ task }) {
      serializedCalls += 1;
      return task();
    },
    async getResolvedIdempotency({ tenantId, idempotencyKey }) {
      return (
        distributedResolved.get(`${tenantId}:${idempotencyKey}`) || null
      );
    },
    async setResolvedIdempotency({ tenantId, idempotencyKey, result }) {
      distributedResolved.set(`${tenantId}:${idempotencyKey}`, result);
    },
    getStats() {
      return {
        backend: 'redis',
      };
    },
  };

  const gateway = createExecutionGateway({
    buildVersion: 'test-build',
    runtimeBackend,
  });
  let agentCalls = 0;

  const context = {
    tenant_id: 'tenant-dist',
    channel: 'template',
    intent: 'generate_draft',
    payload: { instruction: 'hej' },
    idempotency_key: 'idem-dist-key',
  };

  const handlers = {
    inputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
    agentRun: async () => {
      agentCalls += 1;
      return { text: 'distributed-result' };
    },
    outputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
    policyFloor: async () => ({ blocked: false, maxFloor: 1, hits: [] }),
  };

  const first = await gateway.run({ context, handlers });
  const second = await gateway.run({
    context: {
      ...context,
    },
    handlers,
  });

  assert.equal(first.decision, 'allow');
  assert.equal(second.decision, 'allow');
  assert.equal(agentCalls, 1);
  assert.equal(second.idempotency?.replayed, true);
  assert.equal(serializedCalls >= 1, true);
  assert.equal(gateway.getRuntimeStats().mode, 'redis');
});
