const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildIncidentFromEvaluation,
  compareIncidents,
  INCIDENT_SEVERITY,
  INCIDENT_STATUS,
  INCIDENT_SLA_TARGET_MS,
  isIncidentOpenStatus,
  normalizeIncidentSeverity,
  normalizeIncidentStatus,
} = require('../../src/incidents/fromEvaluation');

test('riskLevel below 4 yields no incident', () => {
  assert.equal(
    buildIncidentFromEvaluation({
      id: 'ev-1',
      tenantId: 't1',
      riskLevel: 3,
      evaluatedAt: '2026-01-01T00:00:00.000Z',
    }),
    null
  );
});

test('buildIncidentFromEvaluation returns null for non-object evaluation', () => {
  assert.equal(buildIncidentFromEvaluation(null), null);
  assert.equal(buildIncidentFromEvaluation(undefined), null);
  assert.equal(buildIncidentFromEvaluation('x'), null);
});

test('buildIncidentFromEvaluation returns null when id is only whitespace', () => {
  assert.equal(
    buildIncidentFromEvaluation({
      id: '   ',
      tenantId: 't1',
      riskLevel: 4,
      evaluatedAt: '2026-01-01T00:00:00.000Z',
    }),
    null
  );
});

test('buildIncidentFromEvaluation returns null when evaluation id missing', () => {
  assert.equal(
    buildIncidentFromEvaluation({
      tenantId: 't1',
      riskLevel: 5,
      evaluatedAt: '2026-01-01T00:00:00.000Z',
    }),
    null
  );
});

test('INCIDENT_SLA_TARGET_MS matches L4/L5 windows', () => {
  assert.equal(INCIDENT_SLA_TARGET_MS[INCIDENT_SEVERITY.L4], 4 * 60 * 60 * 1000);
  assert.equal(INCIDENT_SLA_TARGET_MS[INCIDENT_SEVERITY.L5], 30 * 60 * 1000);
});

test('normalizeIncident helpers and open-status predicate', () => {
  assert.equal(normalizeIncidentSeverity('l5'), INCIDENT_SEVERITY.L5);
  assert.equal(normalizeIncidentSeverity('x'), '');
  assert.equal(normalizeIncidentStatus('OPEN'), INCIDENT_STATUS.OPEN);
  assert.equal(normalizeIncidentStatus('unknown'), '');
  assert.equal(isIncidentOpenStatus(INCIDENT_STATUS.OPEN), true);
  assert.equal(isIncidentOpenStatus(INCIDENT_STATUS.ESCALATED), true);
  assert.equal(isIncidentOpenStatus(INCIDENT_STATUS.RESOLVED), false);
});

test('normalizeIncidentStatus trimmar och accepterar alla statusvärden', () => {
  assert.equal(normalizeIncidentStatus('  ALL  '), INCIDENT_STATUS.ALL);
  assert.equal(normalizeIncidentStatus('Escalated'), INCIDENT_STATUS.ESCALATED);
  assert.equal(normalizeIncidentStatus('RESOLVED '), INCIDENT_STATUS.RESOLVED);
});

test('normalizeIncidentSeverity trimmar L4 och L5', () => {
  assert.equal(normalizeIncidentSeverity('  l4  '), INCIDENT_SEVERITY.L4);
  assert.equal(normalizeIncidentSeverity('L5\n'), INCIDENT_SEVERITY.L5);
});

test('normalizeIncidentSeverity och status returnerar tom sträng för icke-sträng', () => {
  assert.equal(normalizeIncidentSeverity(null), '');
  assert.equal(normalizeIncidentSeverity(undefined), '');
  assert.equal(normalizeIncidentStatus(42), '');
  assert.equal(normalizeIncidentStatus({}), '');
});

test('buildIncidentFromEvaluation returnerar null när id inte är en trimmad sträng', () => {
  assert.equal(
    buildIncidentFromEvaluation({
      id: 12345,
      tenantId: 't1',
      riskLevel: 4,
      evaluatedAt: '2026-01-01T00:00:00.000Z',
    }),
    null
  );
});

test('compareIncidents ranks open before closed then SLA urgency', () => {
  const openBreached = {
    id: 'a',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L4,
    sla: { state: 'breached', deadline: '2026-01-10T00:00:00.000Z' },
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  const openOk = {
    id: 'b',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L4,
    sla: { state: 'ok', deadline: '2026-01-20T00:00:00.000Z' },
    openedAt: '2026-01-02T00:00:00.000Z',
  };
  const resolved = {
    id: 'c',
    status: INCIDENT_STATUS.RESOLVED,
    severity: INCIDENT_SEVERITY.L5,
    sla: { state: 'resolved', deadline: '2026-01-05T00:00:00.000Z' },
    openedAt: '2026-01-03T00:00:00.000Z',
  };
  const list = [resolved, openOk, openBreached].sort(compareIncidents);
  assert.deepEqual(
    list.map((i) => i.id),
    ['a', 'b', 'c']
  );
});

test('compareIncidents prefers L5 over L4 when SLA rank ties', () => {
  const l4 = {
    id: 'l4',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L4,
    sla: { state: 'ok', deadline: '2026-01-10T00:00:00.000Z' },
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  const l5 = {
    id: 'l5',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L5,
    sla: { state: 'ok', deadline: '2026-01-10T00:00:00.000Z' },
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(compareIncidents(l4, l5), 1);
  assert.equal(compareIncidents(l5, l4), -1);
});

test('compareIncidents okänd sla.state sorteras efter kända tillstånd med samma övriga fält', () => {
  const weird = {
    id: 'w',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L4,
    sla: { state: 'future_unknown', deadline: '2026-01-10T00:00:00.000Z' },
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  const ok = {
    id: 'o',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L4,
    sla: { state: 'ok', deadline: '2026-01-10T00:00:00.000Z' },
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  assert.ok(compareIncidents(weird, ok) > 0);
  const sorted = [weird, ok].sort(compareIncidents);
  assert.deepEqual(sorted.map((i) => i.id), ['o', 'w']);
});

test('L5 evaluation maps to L5 severity and 30m SLA window', () => {
  const openedAt = '2026-01-01T12:00:00.000Z';
  const incident = buildIncidentFromEvaluation(
    {
      id: 'ev-l5',
      tenantId: 't1',
      templateId: 'tpl',
      riskLevel: 5,
      decision: 'blocked',
      ownerDecision: 'pending',
      evaluatedAt: openedAt,
      updatedAt: openedAt,
    },
    { nowMs: Date.parse('2026-01-01T12:10:00.000Z') }
  );

  assert.ok(incident);
  assert.equal(incident.severity, INCIDENT_SEVERITY.L5);
  assert.equal(incident.status, INCIDENT_STATUS.OPEN);
  assert.equal(incident.sla.targetMinutes, 30);
  assert.equal(incident.slaDeadline, incident.sla.deadline);
  assert.match(incident.slaDeadline, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(incident.ownerUserId, null);
  assert.equal(incident.resolutionTs, null);
});

test('ownerActions yields ownerUserId and owner object', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-own',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: '2026-01-02T00:00:00.000Z',
    ownerDecision: 'pending',
    ownerActions: [{ actorUserId: 'user-a', action: 'note', createdAt: '2026-01-02T00:01:00.000Z' }],
  });

  assert.ok(incident);
  assert.equal(incident.ownerUserId, 'user-a');
  assert.equal(incident.owner.userId, 'user-a');
});

test('approved_exception resolves incident with resolutionTs', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-res',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T01:00:00.000Z',
    ownerDecision: 'approved_exception',
  });

  assert.equal(incident.status, INCIDENT_STATUS.RESOLVED);
  assert.equal(incident.resolutionTs, '2026-01-03T01:00:00.000Z');
  assert.equal(incident.sla.state, 'resolved');
});

test('false_positive resolves like approved_exception', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-fp',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: '2026-01-04T00:00:00.000Z',
    updatedAt: '2026-01-04T02:00:00.000Z',
    ownerDecision: 'FALSE_POSITIVE',
  });
  assert.equal(incident.status, INCIDENT_STATUS.RESOLVED);
  assert.equal(incident.sla.state, 'resolved');
});

test('ownerActions picks last non-empty actorUserId scanning backwards', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-actors',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: '2026-01-02T00:00:00.000Z',
    ownerActions: [
      { actorUserId: 'older', action: 'x' },
      { actorUserId: 'newer', action: 'y' },
      { actorUserId: '', action: 'z' },
    ],
  });
  assert.equal(incident.ownerUserId, 'newer');
});

test('ownerActions med bara tomma actorUserId ger null owner', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-no-owner',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: '2026-01-02T00:00:00.000Z',
    ownerActions: [{ actorUserId: '' }, { actorUserId: '   ' }],
  });
  assert.equal(incident.ownerUserId, null);
  assert.equal(incident.owner, null);
});

test('escalated ownerDecision maps status escalated and remains open-status', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-esc',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: '2026-01-03T00:00:00.000Z',
    ownerDecision: 'escalated',
  });
  assert.equal(incident.status, INCIDENT_STATUS.ESCALATED);
  assert.equal(isIncidentOpenStatus(incident.status), true);
  assert.equal(incident.resolutionTs, null);
});

test('buildIncidentFromEvaluation falls back to now when timestamps are invalid', () => {
  const nowMs = Date.parse('2026-01-05T10:00:00.000Z');
  const incident = buildIncidentFromEvaluation(
    {
      id: 'ev-now',
      tenantId: 't1',
      riskLevel: 4,
      evaluatedAt: 'invalid-date',
      updatedAt: 'also-invalid',
    },
    { nowMs }
  );
  assert.ok(incident);
  assert.equal(incident.openedAt, '2026-01-05T10:00:00.000Z');
  assert.equal(incident.updatedAt, incident.openedAt);
});

test('compareIncidents falls back to id sort when ranking fields tie', () => {
  const a = {
    id: 'a-id',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L4,
    sla: { state: 'ok', deadline: '2026-01-10T00:00:00.000Z' },
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  const b = {
    id: 'b-id',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L4,
    sla: { state: 'ok', deadline: '2026-01-10T00:00:00.000Z' },
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  const sorted = [b, a].sort(compareIncidents);
  assert.deepEqual(sorted.map((x) => x.id), ['a-id', 'b-id']);
});

test('open incident SLA states warn and critical by remaining window share', () => {
  const openedAt = '2026-01-01T12:00:00.000Z';
  const openedMs = Date.parse(openedAt);
  const targetMs = INCIDENT_SLA_TARGET_MS[INCIDENT_SEVERITY.L4];

  const warn = buildIncidentFromEvaluation(
    {
      id: 'ev-warn',
      tenantId: 't1',
      riskLevel: 4,
      evaluatedAt: openedAt,
      updatedAt: openedAt,
      ownerDecision: 'pending',
    },
    { nowMs: openedMs + Math.floor(targetMs * 0.65) }
  );
  assert.equal(warn.sla.state, 'warn');

  const critical = buildIncidentFromEvaluation(
    {
      id: 'ev-crit',
      tenantId: 't1',
      riskLevel: 4,
      evaluatedAt: openedAt,
      updatedAt: openedAt,
      ownerDecision: 'pending',
    },
    { nowMs: openedMs + Math.floor(targetMs * 0.82) }
  );
  assert.equal(critical.sla.state, 'critical');
});

test('resolved incident sla.breached true when resolution after SLA deadline', () => {
  const openedAt = '2026-01-01T00:00:00.000Z';
  const incident = buildIncidentFromEvaluation({
    id: 'ev-late',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: openedAt,
    updatedAt: '2026-01-01T06:00:00.000Z',
    ownerDecision: 'approved_exception',
  });
  assert.equal(incident.sla.state, 'resolved');
  assert.equal(incident.sla.breached, true);
});

test('resolved incident sla.breached false när resolution före deadline', () => {
  const openedAt = '2026-01-01T12:00:00.000Z';
  const incident = buildIncidentFromEvaluation(
    {
      id: 'ev-ontime',
      tenantId: 't1',
      riskLevel: 4,
      evaluatedAt: openedAt,
      updatedAt: '2026-01-01T12:30:00.000Z',
      ownerDecision: 'approved_exception',
    },
    { nowMs: Date.parse('2026-01-01T13:00:00.000Z') }
  );
  assert.equal(incident.sla.state, 'resolved');
  assert.equal(incident.sla.breached, false);
});

test('reasonCodes defaults to empty array when not an array', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-rc',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    reasonCodes: 'not-array',
  });
  assert.deepEqual(incident.reasonCodes, []);
});

test('compareIncidents ranks nullish entries after open incidents', () => {
  const open = {
    id: 'open-1',
    status: INCIDENT_STATUS.OPEN,
    severity: INCIDENT_SEVERITY.L4,
    sla: { state: 'ok', deadline: '2026-01-10T00:00:00.000Z' },
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(compareIncidents(open, null), -1);
  assert.equal(compareIncidents(null, open), 1);
  assert.equal(compareIncidents(undefined, open), 1);
});

test('compareIncidents null mot null ger likhet', () => {
  assert.equal(compareIncidents(null, null), 0);
  assert.equal(compareIncidents(undefined, undefined), 0);
});

test('buildIncidentFromEvaluation använder updatedAt som openedAt när evaluatedAt saknas', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-updated-only',
    tenantId: 't1',
    riskLevel: 4,
    updatedAt: '2026-02-01T08:00:00.000Z',
    ownerDecision: 'pending',
  });
  assert.ok(incident);
  assert.equal(incident.openedAt, '2026-02-01T08:00:00.000Z');
  assert.equal(incident.updatedAt, '2026-02-01T08:00:00.000Z');
});

test('buildIncidentFromEvaluation open incident får sla breached när now passerat deadline', () => {
  const openedAt = '2026-01-01T12:00:00.000Z';
  const openedMs = Date.parse(openedAt);
  const targetMs = INCIDENT_SLA_TARGET_MS[INCIDENT_SEVERITY.L4];
  const incident = buildIncidentFromEvaluation(
    {
      id: 'ev-open-breach',
      tenantId: 't1',
      riskLevel: 4,
      evaluatedAt: openedAt,
      ownerDecision: 'pending',
    },
    { nowMs: openedMs + targetMs + 60_000 }
  );
  assert.equal(incident.sla.state, 'breached');
  assert.equal(incident.sla.breached, true);
});

test('buildIncidentFromEvaluation defaultar decision till blocked när fält saknas', () => {
  const incident = buildIncidentFromEvaluation({
    id: 'ev-default-decision',
    tenantId: 't1',
    riskLevel: 4,
    evaluatedAt: '2026-01-10T10:00:00.000Z',
  });
  assert.ok(incident);
  assert.equal(incident.decision, 'blocked');
});
