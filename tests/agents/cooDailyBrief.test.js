const test = require('node:test');
const assert = require('node:assert/strict');

const {
  composeCooDailyBrief,
  cooDailyBriefOutputSchema,
} = require('../../src/agents/cooDailyBriefAgent');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

test('COO daily brief aggregates incident + task outputs and respects max 5 tasks', () => {
  const output = composeCooDailyBrief({
    incidentOutput: {
      data: {
        summary: 'Incident trend visar okande L4/L5 i konsultation.',
        severityBreakdown: { L3: 2, L4: 3, L5: 1 },
        recurringPatterns: [
          'Upprepade incidenter i kategori CONSULTATION (3)',
          'Aterkommande reason code DISCLOSURE_MISSING (3)',
          'SLA-status critical aterkommer (2)',
          'Extra pattern som ska kapas bort',
        ],
        escalationRisk: 'Hog',
        recommendations: [
          'Eskalera L5 till OWNER.',
          'Forstark disclaimerkontroll.',
          'Granska konsultationsmallar.',
        ],
        generatedAt: new Date().toISOString(),
      },
      warnings: [],
    },
    taskPlanOutput: {
      data: {
        tasks: [
          { id: 't1', title: 'Task 1', priority: 'P0' },
          { id: 't2', title: 'Task 2', priority: 'P1' },
          { id: 't3', title: 'Task 3', priority: 'P2' },
          { id: 't4', title: 'Task 4', priority: 'P2' },
          { id: 't5', title: 'Task 5', priority: 'P3' },
          { id: 't6', title: 'Task 6', priority: 'P3' },
        ],
        riskHighlight: { level: 'high', score: 82 },
        recommendedActions: ['Atgard 1', 'Atgard 2', 'Atgard 3'],
        summary: 'Taskplan for dagens operativa risker.',
        generatedAt: new Date().toISOString(),
      },
      warnings: ['Task warning'],
    },
    channel: 'admin',
    tenantId: 'tenant-a',
    correlationId: 'corr-daily-1',
  });

  const validation = validateJsonSchema({
    schema: cooDailyBriefOutputSchema,
    value: output,
    rootPath: 'agent.output',
  });

  assert.equal(validation.ok, true, `schema validation errors: ${JSON.stringify(validation.errors)}`);
  assert.equal(output.data.priorityLevel, 'High');
  assert.equal(Array.isArray(output.data.taskPlan.tasks), true);
  assert.equal(output.data.taskPlan.tasks.length <= 5, true);
  assert.equal(typeof output.data.executiveSummary, 'string');
  assert.equal(output.data.executiveSummary.length > 0, true);
  assert.equal(output.metadata.agent, 'COO');
});
