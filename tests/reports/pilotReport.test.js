const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePilotReportDays,
  requiresOwnerAction,
  buildPilotReport,
} = require('../../src/reports/pilotReport');

test('parsePilotReportDays clamps to 1–90 and honors fallback', () => {
  assert.equal(parsePilotReportDays('7', 14), 7);
  assert.equal(parsePilotReportDays('0', 14), 1);
  assert.equal(parsePilotReportDays('200', 14), 90);
  assert.equal(parsePilotReportDays('x', 9), 9);
  assert.equal(parsePilotReportDays('-3', 5), 1);
  assert.equal(parsePilotReportDays('1', 14), 1);
  assert.equal(parsePilotReportDays('90', 14), 90);
});

test('parsePilotReportDays nullish använder fallback', () => {
  assert.equal(parsePilotReportDays(null, 21), 21);
  assert.equal(parsePilotReportDays(undefined, 8), 8);
});

test('parsePilotReportDays tom sträng eller bara whitespace använder fallback', () => {
  assert.equal(parsePilotReportDays('', 14), 14);
  assert.equal(parsePilotReportDays('   \n\t  ', 14), 14);
});

test('parsePilotReportDays trunkar decimalstrang med parseInt fore clamp', () => {
  assert.equal(parsePilotReportDays('12.7', 14), 12);
});

test('parsePilotReportDays trimmar whitespace kring heltal', () => {
  assert.equal(parsePilotReportDays('  45  ', 14), 45);
});

test('requiresOwnerAction flags review and blocked decisions', () => {
  assert.equal(requiresOwnerAction({ decision: 'review_required' }), true);
  assert.equal(requiresOwnerAction({ decision: 'BLOCKED' }), true);
  assert.equal(requiresOwnerAction({ decision: 'allow' }), false);
  assert.equal(requiresOwnerAction({}), false);
});

test('requiresOwnerAction behandlar null och blandad casing', () => {
  assert.equal(requiresOwnerAction(null), false);
  assert.equal(requiresOwnerAction({ decision: 'Review_Required' }), true);
});

test('requiresOwnerAction returnerar false for critical_escalate och allow_flag', () => {
  assert.equal(requiresOwnerAction({ decision: 'critical_escalate' }), false);
  assert.equal(requiresOwnerAction({ decision: 'ALLOW_FLAG' }), false);
});

test('requiresOwnerAction returnerar false for icke-sträng decision', () => {
  assert.equal(requiresOwnerAction({ decision: 123 }), false);
  assert.equal(requiresOwnerAction({ decision: true }), false);
  assert.equal(requiresOwnerAction({ decision: ['x', 'y'] }), false);
});

test('requiresOwnerAction tom decision-sträng faller tillbaka till allow', () => {
  assert.equal(requiresOwnerAction({ decision: '' }), false);
  assert.equal(requiresOwnerAction({ decision: '   ' }), false);
});

test('buildPilotReport aggregates window KPIs from mocked stores', async () => {
  const anchor = new Date('2026-03-01T12:00:00.000Z');
  const templateStore = {
    async listTemplates() {
      return [
        {
          currentActiveVersionId: 'v-active',
          versions: [
            { state: 'draft' },
            { state: 'archived' },
            { state: 'active' },
          ],
        },
        { currentActiveVersionId: null, versions: [] },
      ];
    },
    async listEvaluations() {
      return [
        {
          evaluatedAt: '2026-02-28T10:00:00.000Z',
          riskLevel: 4,
          decision: 'review_required',
          ownerDecision: 'pending',
        },
        {
          evaluatedAt: '2026-02-27T10:00:00.000Z',
          riskLevel: 2,
          decision: 'allow',
          policyAdjustments: ['x'],
        },
        {
          evaluatedAt: '2020-01-01T00:00:00.000Z',
          riskLevel: 5,
          decision: 'blocked',
        },
      ];
    },
    async summarizeRisk() {
      return { highCriticalOpen: [{ id: 'open-1' }] };
    },
  };
  const authStore = {
    async listTenantMembers() {
      return [
        { membership: { role: 'STAFF', status: 'active' } },
        { membership: { role: 'STAFF', status: 'disabled' } },
        { membership: { role: 'OWNER', status: 'active' } },
      ];
    },
    async listAuditEvents() {
      return [
        { ts: '2026-02-28T08:00:00.000Z', action: 'templates.activate_version' },
        { ts: '2026-02-28T09:00:00.000Z', action: 'auth.login' },
        { ts: '2019-01-01T00:00:00.000Z', action: 'templates.activate_version' },
      ];
    },
  };

  const report = await buildPilotReport({
    templateStore,
    authStore,
    tenantId: 'tenant-a',
    days: 7,
    generatedAt: anchor,
  });

  assert.equal(report.tenantId, 'tenant-a');
  assert.equal(report.windowDays, 7);
  assert.equal(report.kpis.templatesTotal, 2);
  assert.equal(report.kpis.templatesWithActiveVersion, 1);
  assert.equal(report.kpis.draftsCount, 1);
  assert.equal(report.kpis.archivedCount, 1);
  assert.equal(report.kpis.evaluationsTotal, 2);
  assert.equal(report.kpis.highCriticalTotal, 1);
  assert.equal(report.kpis.ownerActionRequired, 1);
  assert.equal(report.kpis.ownerDecisionPending, 1);
  assert.equal(report.kpis.staffActive, 1);
  assert.equal(report.kpis.staffDisabled, 1);
  assert.equal(report.kpis.auditEventsCount, 2);
  assert.equal(report.kpis.activationEvents, 1);
  assert.equal(report.quality.ownerActionCoveragePct, 0);
  assert.equal(report.quality.policyAdjustedCount, 1);
  assert.deepEqual(report.risk.highCriticalOpen, [{ id: 'open-1' }]);
  assert.equal(report.operational.recentAuditEvents.length, 2);
});

test('buildPilotReport hanterar tomma stores och sätter ownerActionCoveragePct till 100 utan ärenden', async () => {
  const emptyStores = {
    async listTemplates() {
      return [];
    },
    async listEvaluations() {
      return [];
    },
    async summarizeRisk() {
      return null;
    },
  };
  const emptyAuth = {
    async listTenantMembers() {
      return [];
    },
    async listAuditEvents() {
      return [];
    },
  };
  const report = await buildPilotReport({
    templateStore: emptyStores,
    authStore: emptyAuth,
    tenantId: 't-empty',
    days: 14,
    generatedAt: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.equal(report.kpis.templatesTotal, 0);
  assert.equal(report.kpis.evaluationsTotal, 0);
  assert.equal(report.quality.ownerActionCoveragePct, 100);
  assert.deepEqual(report.risk.highCriticalOpen, []);
});

test('buildPilotReport satter ownerActionCoveragePct till 100 nar inga owner decisions pending', async () => {
  const anchor = new Date('2026-04-01T12:00:00.000Z');
  const templateStore = {
    async listTemplates() {
      return [];
    },
    async listEvaluations() {
      return [
        {
          evaluatedAt: '2026-03-31T10:00:00.000Z',
          riskLevel: 4,
          decision: 'blocked',
          ownerDecision: 'approved_exception',
        },
      ];
    },
    async summarizeRisk() {
      return {};
    },
  };
  const authStore = {
    async listTenantMembers() {
      return [];
    },
    async listAuditEvents() {
      return [];
    },
  };
  const report = await buildPilotReport({
    templateStore,
    authStore,
    tenantId: 't-resolved',
    days: 30,
    generatedAt: anchor,
  });
  assert.equal(report.kpis.ownerActionRequired, 1);
  assert.equal(report.kpis.ownerDecisionPending, 0);
  assert.equal(report.quality.ownerActionCoveragePct, 100);
});

test('buildPilotReport accepterar ISO-sträng som generatedAt', async () => {
  const templateStore = {
    async listTemplates() {
      return [];
    },
    async listEvaluations() {
      return [];
    },
    async summarizeRisk() {
      return {};
    },
  };
  const authStore = {
    async listTenantMembers() {
      return [];
    },
    async listAuditEvents() {
      return [];
    },
  };
  const report = await buildPilotReport({
    templateStore,
    authStore,
    tenantId: 't-iso',
    days: 1,
    generatedAt: '2026-05-10T15:00:00.000Z',
  });
  assert.equal(report.generatedAt, '2026-05-10T15:00:00.000Z');
  assert.ok(typeof report.since === 'string');
});

test('buildPilotReport ignorerar icke-objekt från summarizeRisk', async () => {
  const templateStore = {
    async listTemplates() {
      return [];
    },
    async listEvaluations() {
      return [];
    },
    async summarizeRisk() {
      return 'not-an-object';
    },
  };
  const authStore = {
    async listTenantMembers() {
      return [];
    },
    async listAuditEvents() {
      return [];
    },
  };
  const report = await buildPilotReport({
    templateStore,
    authStore,
    tenantId: 't-risk',
    generatedAt: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.deepEqual(report.risk.highCriticalOpen, []);
});

test('buildPilotReport tolererar icke-array listTemplates via asArray', async () => {
  const templateStore = {
    async listTemplates() {
      return null;
    },
    async listEvaluations() {
      return [];
    },
    async summarizeRisk() {
      return {};
    },
  };
  const authStore = {
    async listTenantMembers() {
      return [];
    },
    async listAuditEvents() {
      return [];
    },
  };
  const report = await buildPilotReport({
    templateStore,
    authStore,
    tenantId: 't-null-templates',
    generatedAt: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.equal(report.kpis.templatesTotal, 0);
});

test('buildPilotReport vidarebefordrar evaluationLimit och auditLimit till store-anrop', async () => {
  let evalLimit;
  let auditLimit;
  const templateStore = {
    async listTemplates() {
      return [];
    },
    async listEvaluations(opts) {
      evalLimit = opts?.limit;
      return [];
    },
    async summarizeRisk() {
      return {};
    },
  };
  const authStore = {
    async listTenantMembers() {
      return [];
    },
    async listAuditEvents(opts) {
      auditLimit = opts?.limit;
      return [];
    },
  };
  await buildPilotReport({
    templateStore,
    authStore,
    tenantId: 't-limits',
    evaluationLimit: 123,
    auditLimit: 456,
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(evalLimit, 123);
  assert.equal(auditLimit, 456);
});
