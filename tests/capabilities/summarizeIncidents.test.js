const test = require('node:test');
const assert = require('node:assert/strict');

const { summarizeIncidentsCapability } = require('../../src/capabilities/summarizeIncidents');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

test('SummarizeIncidents returns schema-valid structured output with max 5 recommendations', async () => {
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inc-1',
    correlationId: 'corr-inc-1',
    input: {
      includeClosed: false,
      timeframeDays: 14,
    },
    systemStateSnapshot: {
      incidents: [
        {
          id: 'inc-1',
          category: 'CONSULTATION',
          reasonCodes: ['DISCLOSURE_MISSING', 'DISCLOSURE_MISSING'],
          severity: 'L5',
          riskLevel: 5,
          status: 'open',
          ownerDecision: 'pending',
          updatedAt: new Date().toISOString(),
          sla: { state: 'critical', breached: false },
        },
        {
          id: 'inc-2',
          category: 'CONSULTATION',
          reasonCodes: ['DISCLOSURE_MISSING'],
          severity: 'L4',
          riskLevel: 4,
          status: 'escalated',
          ownerDecision: 'escalated',
          updatedAt: new Date().toISOString(),
          sla: { state: 'breached', breached: true },
        },
        {
          id: 'inc-3',
          category: 'AFTERCARE',
          reasonCodes: ['DISCLAIMERS_MISSING'],
          severity: 'L3',
          riskLevel: 3,
          status: 'open',
          ownerDecision: 'pending',
          updatedAt: new Date().toISOString(),
          sla: { state: 'warn', breached: false },
        },
      ],
      slaStatus: { critical: 1, breached: 1 },
      timestamps: { capturedAt: new Date().toISOString() },
    },
  });

  const validation = validateJsonSchema({
    schema: summarizeIncidentsCapability.outputSchema,
    value: output,
    rootPath: 'capability.output',
  });

  assert.equal(validation.ok, true, `schema validation errors: ${JSON.stringify(validation.errors)}`);
  assert.equal(typeof output.data.summary, 'string');
  assert.equal(typeof output.data.severityBreakdown, 'object');
  assert.equal(Array.isArray(output.data.recurringPatterns), true);
  assert.equal(typeof output.data.escalationRisk, 'string');
  assert.equal(Array.isArray(output.data.recommendations), true);
  assert.equal(output.data.recommendations.length > 0, true);
  assert.equal(output.data.recommendations.length <= 5, true);
  assert.equal(output.metadata.capability, 'SummarizeIncidents');
  assert.equal(Array.isArray(output.warnings), true);
});

test('SummarizeIncidents creates fallback recommendation when incident list is empty', async () => {
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'staff-a', role: 'STAFF' },
    channel: 'admin',
    requestId: 'req-inc-2',
    correlationId: 'corr-inc-2',
    input: {
      includeClosed: true,
      timeframeDays: 30,
    },
    systemStateSnapshot: {
      incidents: [],
      slaStatus: {},
      timestamps: {},
    },
  });

  assert.equal(output.data.recommendations.length, 1);
  assert.equal(output.data.recommendations[0].includes('daglig incidenttriage'), true);
  assert.equal(output.data.severityBreakdown.L3, 0);
  assert.equal(output.data.severityBreakdown.L4, 0);
  assert.equal(output.data.severityBreakdown.L5, 0);
});

test('SummarizeIncidents filtrerar bort incidenter utanför timeframeDays', async () => {
  const capturedAt = new Date().toISOString();
  const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inc-time',
    correlationId: 'corr-inc-time',
    input: { includeClosed: true, timeframeDays: 14 },
    systemStateSnapshot: {
      incidents: [
        {
          id: 'inc-stale',
          category: 'CONSULTATION',
          severity: 'L5',
          riskLevel: 5,
          status: 'open',
          updatedAt: stale,
        },
      ],
      slaStatus: {},
      timestamps: { capturedAt },
    },
  });

  assert.match(output.data.summary, /Totalt i underlag: 0/);
  assert.ok(output.warnings.some((w) => /Inga incidenter/i.test(w)));
});

test('SummarizeIncidents med includeClosed false hoppar över stängda', async () => {
  const now = new Date().toISOString();
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inc-closed',
    correlationId: 'corr-inc-closed',
    input: { includeClosed: false, timeframeDays: 30 },
    systemStateSnapshot: {
      incidents: [
        {
          id: 'inc-closed',
          category: 'AFTERCARE',
          severity: 'L4',
          status: 'closed',
          updatedAt: now,
        },
        {
          id: 'inc-open',
          category: 'AFTERCARE',
          severity: 'L3',
          status: 'open',
          updatedAt: now,
        },
      ],
      slaStatus: {},
      timestamps: { capturedAt: now },
    },
  });

  assert.match(output.data.summary, /Totalt i underlag: 1/);
  assert.equal(output.data.severityBreakdown.L3, 1);
  assert.equal(output.data.severityBreakdown.L4, 0);
});

test('SummarizeIncidents härleder L4 från riskLevel när severity saknas', async () => {
  const now = new Date().toISOString();
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inc-rl',
    correlationId: 'corr-inc-rl',
    input: { includeClosed: false, timeframeDays: 30 },
    systemStateSnapshot: {
      incidents: [
        {
          id: 'inc-rl',
          category: 'CONSULTATION',
          riskLevel: 4,
          status: 'open',
          updatedAt: now,
        },
      ],
      slaStatus: {},
      timestamps: { capturedAt: now },
    },
  });

  assert.equal(output.data.severityBreakdown.L4, 1);
  assert.equal(output.data.severityBreakdown.L5, 0);
});

test('SummarizeIncidents varnar när capturedAt saknas trots incidenter', async () => {
  const now = new Date().toISOString();
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inc-cap',
    correlationId: 'corr-inc-cap',
    input: { includeClosed: false, timeframeDays: 14 },
    systemStateSnapshot: {
      incidents: [
        {
          id: 'inc-x',
          category: 'CONSULTATION',
          severity: 'L3',
          status: 'open',
          updatedAt: now,
        },
      ],
      slaStatus: {},
      timestamps: {},
    },
  });

  assert.ok(output.warnings.some((w) => /capturedAt/i.test(w)));
  assert.equal(
    output.warnings.some((w) => /Inga incidenter/i.test(w)),
    false
  );
});

test('SummarizeIncidents timeframeDays klampas till 1–90', async () => {
  const now = new Date().toISOString();
  const empty = { incidents: [], slaStatus: {}, timestamps: { capturedAt: now } };
  const low = await new summarizeIncidentsCapability().execute({
    tenantId: 't',
    channel: 'admin',
    input: { timeframeDays: 0 },
    systemStateSnapshot: empty,
  });
  assert.match(low.data.summary, /Incidentanalys for 1 dagar/);

  const high = await new summarizeIncidentsCapability().execute({
    tenantId: 't',
    channel: 'admin',
    input: { timeframeDays: 500 },
    systemStateSnapshot: empty,
  });
  assert.match(high.data.summary, /Incidentanalys for 90 dagar/);
});

test('SummarizeIncidents includeClosed false excludes closed status', async () => {
  const now = new Date().toISOString();
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 't',
    channel: 'admin',
    input: { includeClosed: false, timeframeDays: 30 },
    systemStateSnapshot: {
      incidents: [
        { id: 'c1', category: 'X', severity: 'L3', status: 'closed', updatedAt: now },
        { id: 'o1', category: 'X', severity: 'L3', status: 'open', updatedAt: now },
      ],
      slaStatus: {},
      timestamps: { capturedAt: now },
    },
  });
  assert.match(output.data.summary, /Totalt i underlag: 1/);
});

test('SummarizeIncidents includeClosed true counts closed incidents', async () => {
  const now = new Date().toISOString();
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 't',
    channel: 'admin',
    input: { includeClosed: true, timeframeDays: 30 },
    systemStateSnapshot: {
      incidents: [
        { id: 'c1', category: 'X', severity: 'L3', status: 'closed', updatedAt: now },
        { id: 'o1', category: 'X', severity: 'L3', status: 'open', updatedAt: now },
      ],
      slaStatus: {},
      timestamps: { capturedAt: now },
    },
  });
  assert.match(output.data.summary, /Totalt i underlag: 2/);
  assert.match(output.data.summary, /inklusive stangda/);
});

test('SummarizeIncidents filters incidents older than timeframe', async () => {
  const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();
  const output = await new summarizeIncidentsCapability().execute({
    tenantId: 't',
    channel: 'admin',
    input: { includeClosed: true, timeframeDays: 14 },
    systemStateSnapshot: {
      incidents: [
        { id: 'old', category: 'X', severity: 'L3', status: 'closed', updatedAt: old },
        { id: 'new', category: 'X', severity: 'L3', status: 'open', updatedAt: now },
      ],
      slaStatus: {},
      timestamps: { capturedAt: now },
    },
  });
  assert.match(output.data.summary, /Totalt i underlag: 1/);
});

test('SummarizeIncidents saknad tenantId ger metadata unknown', async () => {
  const now = new Date().toISOString();
  const output = await new summarizeIncidentsCapability().execute({
    channel: 'admin',
    systemStateSnapshot: { incidents: [], slaStatus: {}, timestamps: { capturedAt: now } },
  });
  assert.equal(output.metadata.tenantId, 'unknown');
});
