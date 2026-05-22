const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COO_AGENT_NAME,
  COO_DAILY_BRIEF_CAPABILITY_REF,
  composeCooDailyBrief,
} = require('../../src/agents/cooDailyBriefAgent');

test('composeCooDailyBrief tom input ger Low-prioritet och defaulttexter', () => {
  const out = composeCooDailyBrief({});
  assert.equal(out.data.priorityLevel, 'Low');
  assert.match(out.data.executiveSummary, /Daily brief priority Low/);
  assert.equal(out.data.incidentSummary.escalationRisk, 'Lag');
  assert.equal(out.metadata.agent, COO_AGENT_NAME);
  assert.equal(out.metadata.tenantId, 'unknown');
  assert.deepEqual(out.warnings, []);
});

test('composeCooDailyBrief kritisk incidentrisk ger High', () => {
  const out = composeCooDailyBrief({
    incidentOutput: {
      data: {
        summary: 'Test',
        escalationRisk: 'kritisk',
        severityBreakdown: { L3: 1, L4: 0, L5: 2 },
        recommendations: [],
        generatedAt: '2026-05-01T00:00:00.000Z',
      },
      warnings: [],
    },
    taskPlanOutput: {
      data: {
        tasks: [],
        riskHighlight: {},
        recommendedActions: [],
        summary: 'Plan',
        generatedAt: '2026-05-01T00:00:00.000Z',
      },
      warnings: [],
    },
    tenantId: 'tenant-x',
    correlationId: 'corr-1',
  });
  assert.equal(out.data.priorityLevel, 'High');
  assert.equal(out.metadata.tenantId, 'tenant-x');
  assert.equal(out.metadata.correlationId, 'corr-1');
});

test('composeCooDailyBrief P0-task ger High aven vid lag incidentrisk', () => {
  const out = composeCooDailyBrief({
    incidentOutput: {
      data: {
        summary: 'Lugn',
        escalationRisk: 'Lag',
        severityBreakdown: {},
        recommendations: [],
        generatedAt: '2026-05-01T00:00:00.000Z',
      },
      warnings: [],
    },
    taskPlanOutput: {
      data: {
        tasks: [{ priority: 'p0', title: 'Stoppa utläckan' }],
        riskHighlight: { level: 'low' },
        recommendedActions: [],
        summary: 'Akut',
        generatedAt: '2026-05-01T00:00:00.000Z',
      },
      warnings: [],
    },
  });
  assert.equal(out.data.priorityLevel, 'High');
  assert.match(out.data.executiveSummary, /Stoppa utläckan/);
});

test('composeCooDailyBrief sammanslår och deduplicerar varningar', () => {
  const out = composeCooDailyBrief({
    incidentOutput: {
      data: {
        summary: 'S',
        escalationRisk: 'medel',
        severityBreakdown: {},
        recommendations: [],
        generatedAt: '2026-05-01T00:00:00.000Z',
      },
      warnings: ['  samma  ', 'samma', 'annan'],
    },
    taskPlanOutput: {
      data: {
        tasks: [],
        riskHighlight: {},
        recommendedActions: [],
        summary: 'P',
        generatedAt: '2026-05-01T00:00:00.000Z',
      },
      warnings: ['samma'],
    },
  });
  assert.equal(out.data.priorityLevel, 'Medium');
  assert.deepEqual(out.warnings, ['samma', 'annan']);
});

test('COO capability ref ar stabil', () => {
  assert.equal(COO_DAILY_BRIEF_CAPABILITY_REF, 'COO.DailyBrief');
});
