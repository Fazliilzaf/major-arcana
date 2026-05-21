const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTemplateStore } = require('../../src/templates/store');
const {
  ensureAdminTemplateDrafts,
  ADMIN_TEMPLATE_SEEDS,
  listAdminChecklistSeedsForRole,
  resolveAdminChecklistsForRole,
} = require('../../src/ops/adminTemplateSeeds');
const {
  buildCaoReadinessSnapshot,
  buildCaoSchedulerObservability,
  CAO_LIGHT_READINESS_DISCLAIMER,
} = require('../../src/ops/readinessEvaluator');
const {
  GenerateGoNoGoBriefCapability,
  ExplainReadinessScoreCapability,
} = require('../../src/capabilities/caoCapabilityKit');

test('buildCaoReadinessSnapshot exposes shared operational core metadata', async () => {
  const snapshot = await buildCaoReadinessSnapshot({
    tenantId: 'default',
    scheduler: { getStatus: () => ({ enabled: true, started: true, jobs: [] }) },
    config: { authOwnerMfaRequired: false },
  });

  assert.equal(snapshot.source, 'shared_operational_core');
  assert.equal(snapshot.monitorParity, 'evidence_aligned');
  assert.equal(snapshot.monitorEndpoint, '/api/v1/monitor/readiness');
  assert.equal(snapshot.disclaimer, CAO_LIGHT_READINESS_DISCLAIMER);
  assert.equal(snapshot.caoSchedulerObservability.affectsReadinessScore, false);
  assert.ok(snapshot.alignment);
  assert.equal(snapshot.alignment.monitorAuthoritative, true);
});

test('buildCaoSchedulerObservability flags stale CAO jobs without blocking readiness', () => {
  const observability = buildCaoSchedulerObservability({
    jobs: [
      { id: 'cao_daily_quality_gate', enabled: true, lastSuccessAt: new Date().toISOString() },
      { id: 'cao_sla_risk_scan', enabled: true },
      { id: 'cao_missing_dod_scan', enabled: false },
    ],
  });

  assert.equal(observability.affectsReadinessScore, false);
  assert.equal(observability.allHealthy, false);
  assert.ok(['yellow', 'red'].includes(observability.status));
});

test('GenerateGoNoGoBrief returns dedicated GoNoGo output', async () => {
  const capability = new GenerateGoNoGoBriefCapability();
  const result = await capability.execute({
    systemStateSnapshot: {
      readiness: {
        score: 78,
        band: 'limited_beta',
        goAllowed: false,
        blockers: [{ id: 'incidents_unowned', severity: 'high', label: 'Unowned incidents' }],
        source: 'shared_operational_core',
        monitorEndpoint: '/api/v1/monitor/readiness',
        disclaimer: CAO_LIGHT_READINESS_DISCLAIMER,
      },
      adminTasks: [{ id: 't1', status: 'open', owner: '', dod: '', nextStep: '' }],
      incidents: [{ id: 'i1', status: 'open' }],
    },
  });

  assert.equal(result.data.outputType, 'GoNoGoBrief');
  assert.equal(result.data.goRecommendation, 'no_go_pending_owner');
  assert.equal(result.data.ownerDecisionRequired, true);
  assert.ok(Array.isArray(result.data.recommendations));
  assert.equal(result.data.authoritativeEndpoint, '/api/v1/monitor/readiness');
});

test('ExplainReadinessScore uses ReadinessExplanation output type', async () => {
  const capability = new ExplainReadinessScoreCapability();
  const result = await capability.execute({
    systemStateSnapshot: {
      readiness: { score: 90, band: 'controlled_go', blockers: [] },
    },
  });

  assert.equal(result.data.outputType, 'ReadinessExplanation');
});

test('role checklist sets map to seeded templates', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cao-checklist-'));
  const store = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
  });
  await ensureAdminTemplateDrafts({ templateStore: store, tenantId: 'default' });

  const ownerSeeds = listAdminChecklistSeedsForRole('OWNER');
  assert.ok(ownerSeeds.length >= 2);
  assert.ok(ownerSeeds.some((seed) => seed.seedKey === 'admin-owner-weekly-checklist'));

  const resolved = await resolveAdminChecklistsForRole({
    templateStore: store,
    tenantId: 'default',
    role: 'OWNER',
  });
  assert.equal(resolved.role, 'OWNER');
  assert.equal(resolved.summary.total, ownerSeeds.length);
  assert.equal(resolved.summary.seeded, ownerSeeds.length);
  assert.equal(resolved.items.every((item) => item.seeded), true);
  assert.equal(ADMIN_TEMPLATE_SEEDS.length, 9);
});
