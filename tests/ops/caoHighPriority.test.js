const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTemplateStore } = require('../../src/templates/store');
const { ensureAdminTemplateDrafts, ADMIN_TEMPLATE_SEEDS } = require('../../src/ops/adminTemplateSeeds');
const { buildCaoReadinessSnapshot } = require('../../src/ops/readinessEvaluator');
const { notifyOwnerIfNeeded } = require('../../src/ops/caoSchedulerJobs');
const { GenerateAdminWeeklyBriefCapability } = require('../../src/capabilities/caoCapabilityKit');

test('ensureAdminTemplateDrafts creates INTERNAL admin draft templates idempotently', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cao-seed-'));
  const store = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
  });

  const first = await ensureAdminTemplateDrafts({ templateStore: store, tenantId: 'default' });
  assert.equal(first.created.length, ADMIN_TEMPLATE_SEEDS.length);
  assert.equal(first.skipped.length, 0);

  const second = await ensureAdminTemplateDrafts({ templateStore: store, tenantId: 'default' });
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped.length, ADMIN_TEMPLATE_SEEDS.length);

  const templates = await store.listTemplates({ tenantId: 'default', category: 'INTERNAL', includeVersions: true });
  assert.equal(templates.length, ADMIN_TEMPLATE_SEEDS.length);
  assert.ok(templates.every((item) => item.name.startsWith('Admin —')));
});

test('buildCaoReadinessSnapshot returns score and blockers', async () => {
  const snapshot = await buildCaoReadinessSnapshot({
    tenantId: 'default',
    templateStore: {
      async summarizeIncidents() {
        return { totals: { breachedOpen: 1, openUnresolved: 2 } };
      },
      async listIncidents() {
        return [{ id: 'i1', status: 'open', owner: null }];
      },
      async summarizeRisk() {
        return { totals: { highCriticalOpen: 1 } };
      },
    },
    adminTasksStore: {
      async listTasks() {
        return [{ id: 't1', status: 'open', owner: '', dod: '', nextStep: '' }];
      },
    },
    scheduler: { getStatus: () => ({ enabled: true, started: true }) },
    config: { authOwnerMfaRequired: false },
  });

  assert.equal(typeof snapshot.score, 'number');
  assert.ok(snapshot.score >= 0 && snapshot.score <= 100);
  assert.ok(Array.isArray(snapshot.blockers));
  assert.ok(snapshot.blockers.length >= 1);
});

test('GenerateAdminWeeklyBrief uses readiness in weekly output', async () => {
  const capability = new GenerateAdminWeeklyBriefCapability();
  const result = await capability.execute({
    input: { windowDays: 7 },
    systemStateSnapshot: {
      adminTasks: [{ id: 't1', status: 'open', title: 'Task', owner: '', deadline: '2020-01-01' }],
      incidents: [{ id: 'i1', status: 'open' }],
      auditEvents: [],
      readiness: { score: 82, band: 'limited_beta', blockers: [{ id: 'test' }] },
    },
  });
  assert.equal(result.data.outputType, 'AdminWeeklyBrief');
  assert.equal(result.data.trends.readinessScore, 82);
  assert.ok(Array.isArray(result.data.recommendations));
});

test('notifyOwnerIfNeeded skips below L4 unless severity high', async () => {
  const calls = [];
  const result = await notifyOwnerIfNeeded({
    sendAlertNotification: async (payload) => {
      calls.push(payload);
      return { ok: true };
    },
    tenantId: 'default',
    eventType: 'test',
    severity: 'warn',
    riskLevel: 'L2',
    minRiskLevel: 'L4',
    payload: { sample: true },
  });
  assert.equal(result.skipped, true);
  assert.equal(calls.length, 0);
});
