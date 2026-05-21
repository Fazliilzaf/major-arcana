const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAdminTasksStore } = require('../../src/ops/adminTasksStore');
const { createAdminWorkspaceRouter } = require('../../src/routes/adminWorkspace');
const {
  buildCaoReadinessSnapshot,
  evaluateTenantOperationalReadiness,
  buildReadinessAlignment,
  computeOperationalReadinessFromEvidence,
  gatherOperationalReadinessEvidence,
} = require('../../src/ops/readinessEvaluator');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function createRequireAuth(role = 'OWNER') {
  return (req, _res, next) => {
    req.auth = {
      tenantId: 'default',
      userId: 'owner-1',
      role,
    };
    next();
  };
}

function createRequireRole(...roles) {
  const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
  return (req, res, next) => {
    const role = String(req.auth?.role || '').toUpperCase();
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
    }
    return next();
  };
}

test('shared operational readiness core scores evidence consistently', async () => {
  const evidence = await gatherOperationalReadinessEvidence({
    tenantId: 'default',
    templateStore: {
      async summarizeIncidents() {
        return { totals: { breachedOpen: 2 } };
      },
      async listIncidents() {
        return [
          { id: 'i1', status: 'open', owner: null },
          { id: 'i2', status: 'open', owner: null },
        ];
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
    scheduler: { getStatus: () => ({ enabled: true, started: true, jobs: [] }) },
    config: { authOwnerMfaRequired: false },
  });

  const computed = computeOperationalReadinessFromEvidence(evidence);
  const evaluated = await evaluateTenantOperationalReadiness({
    tenantId: 'default',
    templateStore: {
      async summarizeIncidents() {
        return { totals: { breachedOpen: 2 } };
      },
      async listIncidents() {
        return [
          { id: 'i1', status: 'open', owner: null },
          { id: 'i2', status: 'open', owner: null },
        ];
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
    scheduler: { getStatus: () => ({ enabled: true, started: true, jobs: [] }) },
    config: { authOwnerMfaRequired: false },
  });

  assert.equal(computed.score, evaluated.score);
  assert.equal(computed.band, evaluated.band);
  assert.ok(evaluated.blockers.length >= 2);
});

test('buildReadinessAlignment compares monitor and operational scores', () => {
  const alignment = buildReadinessAlignment({
    monitorScore: 88,
    operationalScore: 82,
    monitorGoAllowed: true,
    operationalGoAllowed: false,
  });

  assert.equal(alignment.scoreDelta, 6);
  assert.equal(alignment.goAllowedDelta, 'diverged');
  assert.equal(alignment.monitorAuthoritative, true);
});

test('buildCaoReadinessSnapshot uses shared_operational_core source', async () => {
  const snapshot = await buildCaoReadinessSnapshot({
    tenantId: 'default',
    scheduler: { getStatus: () => ({ enabled: true, started: true, jobs: [] }) },
    config: { authOwnerMfaRequired: false },
  });

  assert.equal(snapshot.source, 'shared_operational_core');
  assert.equal(snapshot.monitorParity, 'evidence_aligned');
});

test('PATCH /admin/tasks/:taskId assigns owner with audit', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cao-task-patch-'));
  const adminTasksStore = await createAdminTasksStore({
    filePath: path.join(tempDir, 'admin-tasks.json'),
  });
  await adminTasksStore.upsertTask({
    id: 'task-42',
    tenantId: 'default',
    title: 'Unowned task',
    owner: '',
    status: 'open',
  });

  const auditEvents = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createAdminWorkspaceRouter({
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return event;
        },
      },
      templateStore: {},
      adminTasksStore,
      requireAuth: createRequireAuth('STAFF'),
      requireRole: createRequireRole,
      config: { authOwnerMfaRequired: false },
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/admin/tasks/task-42`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ owner: 'OWNER', nextStep: 'Verifiera DoD' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.item.owner, 'OWNER');
    assert.equal(body.item.nextStep, 'Verifiera DoD');
    assert.deepEqual(body.updatedFields, ['owner', 'nextStep']);

    const tasks = await adminTasksStore.listTasks({ tenantId: 'default' });
    assert.equal(tasks[0].owner, 'OWNER');
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, 'admin.task.update');
    assert.equal(auditEvents[0].targetId, 'task-42');
  });
});

test('PATCH /admin/tasks/:taskId returns 404 for unknown task', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cao-task-404-'));
  const adminTasksStore = await createAdminTasksStore({
    filePath: path.join(tempDir, 'admin-tasks.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createAdminWorkspaceRouter({
      authStore: { async addAuditEvent() {} },
      templateStore: {},
      adminTasksStore,
      requireAuth: createRequireAuth(),
      requireRole: createRequireRole,
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/admin/tasks/missing`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: 'OWNER' }),
    });
    assert.equal(res.status, 404);
  });
});
