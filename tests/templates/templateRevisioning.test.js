const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createTemplateStore } = require('../../src/templates/store');
const { createTemplateRouter } = require('../../src/routes/templates');
const { createAuthStore } = require('../../src/security/authStore');

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

function createMockAuth() {
  function requireAuth(req, _res, next) {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role: 'OWNER',
    };
    next();
  }
  function requireRole(...roles) {
    const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
    return (req, res, next) => {
      if (!allowed.has(String(req.auth?.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

test('template store tracks revisions + diff + rollback', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-template-revision-store-'));
  const store = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
    maxEvaluations: 200,
  });

  const template = await store.createTemplate({
    tenantId: 'tenant-a',
    category: 'CONSULTATION',
    name: 'Revision Mall',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'owner-a',
  });
  const draft = await store.createDraftVersion({
    templateId: template.id,
    title: 'V1',
    content: 'Hej {{first_name}}',
    source: 'manual',
    variablesUsed: ['first_name'],
    createdBy: 'owner-a',
  });

  assert.equal(draft.revision, 1);
  assert.equal(draft.revisionCount, 1);

  const updated = await store.updateDraftVersion({
    templateId: template.id,
    versionId: draft.id,
    content: 'Hej {{first_name}} uppdaterad',
    title: 'V2',
    variablesUsed: ['first_name'],
    updatedBy: 'owner-a',
    expectedRevision: 1,
  });

  assert.equal(updated.revision, 2);
  assert.equal(updated.revisionCount, 2);

  const revisions = await store.listVersionRevisions({
    templateId: template.id,
    versionId: draft.id,
    limit: 10,
  });
  assert.equal(revisions.length, 2);
  assert.equal(revisions[0].revision, 1);
  assert.equal(revisions[1].revision, 2);

  const diff = await store.diffVersionRevisions({
    templateId: template.id,
    versionId: draft.id,
    fromRevision: 1,
    toRevision: 2,
  });
  assert.equal(Array.isArray(diff.diff), true);
  assert.equal(diff.diff.some((item) => item.field === 'content'), true);

  const rolled = await store.rollbackDraftVersion({
    templateId: template.id,
    versionId: draft.id,
    targetRevision: 1,
    updatedBy: 'owner-a',
    expectedRevision: 2,
    note: 'rollback-test',
  });
  assert.equal(rolled.version.revision, 3);

  const final = await store.getTemplateVersion(template.id, draft.id);
  assert.equal(final.content, 'Hej {{first_name}}');
});

test('template store returns version conflict on stale expectedRevision', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-template-revision-conflict-'));
  const store = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
    maxEvaluations: 200,
  });

  const template = await store.createTemplate({
    tenantId: 'tenant-a',
    category: 'CONSULTATION',
    name: 'Conflict Mall',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'owner-a',
  });
  const draft = await store.createDraftVersion({
    templateId: template.id,
    title: 'V1',
    content: 'Hej {{first_name}}',
    source: 'manual',
    variablesUsed: ['first_name'],
    createdBy: 'owner-a',
  });

  await assert.rejects(
    () =>
      store.updateDraftVersion({
        templateId: template.id,
        versionId: draft.id,
        content: 'Ny text',
        updatedBy: 'owner-a',
        expectedRevision: 99,
      }),
    (error) => error && error.code === 'VERSION_CONFLICT'
  );
});

test('template PATCH route returns 409 on stale If-Match revision', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-template-revision-route-'));
  const templateStore = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
    maxEvaluations: 300,
  });
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const template = await templateStore.createTemplate({
    tenantId: 'tenant-a',
    category: 'CONSULTATION',
    name: 'Route Conflict Mall',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'owner-a',
  });
  const draft = await templateStore.createDraftVersion({
    templateId: template.id,
    title: 'V1',
    content: 'Hej {{first_name}}',
    source: 'manual',
    variablesUsed: ['first_name'],
    createdBy: 'owner-a',
  });

  const app = express();
  app.use(express.json());
  const mockAuth = createMockAuth();
  app.use(
    '/api/v1',
    createTemplateRouter({
      templateStore,
      authStore,
      tenantConfigStore: {
        async getTenantConfig() {
          return {};
        },
      },
      openai: null,
      model: '',
      requireAuth: mockAuth.requireAuth,
      requireRole: mockAuth.requireRole,
    })
  );

  await withServer(app, async (baseUrl) => {
    const versionRes = await fetch(
      `${baseUrl}/api/v1/templates/${template.id}/versions/${draft.id}`
    );
    assert.equal(versionRes.status, 200);
    const etag = versionRes.headers.get('etag');
    assert.equal(Boolean(etag), true);

    const firstPatch = await fetch(
      `${baseUrl}/api/v1/templates/${template.id}/versions/${draft.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'if-match': etag,
        },
        body: JSON.stringify({
          content: 'Hej {{first_name}} från {{clinic_name}} uppdatering 1',
        }),
      }
    );
    assert.equal(firstPatch.status, 200);

    const stalePatch = await fetch(
      `${baseUrl}/api/v1/templates/${template.id}/versions/${draft.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'if-match': etag,
        },
        body: JSON.stringify({
          content: 'Hej {{first_name}} från {{clinic_name}} uppdatering stale',
        }),
      }
    );
    assert.equal(stalePatch.status, 409);
    const payload = await stalePatch.json();
    assert.equal(payload.code, 'version_conflict');
  });
});

test('template manual draft route creates a real draft version with etag', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-template-manual-draft-route-'));
  const templateStore = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
    maxEvaluations: 300,
  });
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const template = await templateStore.createTemplate({
    tenantId: 'tenant-a',
    category: 'CONSULTATION',
    name: 'Manual Draft Mall',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'owner-a',
  });

  const app = express();
  app.use(express.json());
  const mockAuth = createMockAuth();
  app.use(
    '/api/v1',
    createTemplateRouter({
      templateStore,
      authStore,
      tenantConfigStore: {
        async getTenantConfig() {
          return {};
        },
      },
      openai: null,
      model: '',
      requireAuth: mockAuth.requireAuth,
      requireRole: mockAuth.requireRole,
    })
  );

  await withServer(app, async (baseUrl) => {
    const createRes = await fetch(`${baseUrl}/api/v1/templates/${template.id}/drafts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Operator Draft',
        content: 'Hej {{first_name}}, detta ar ett manuellt utkast.',
        source: 'manual',
        variablesUsed: ['first_name'],
      }),
    });

    assert.equal(createRes.status, 201);
    assert.equal(Boolean(createRes.headers.get('etag')), true);
    const payload = await createRes.json();
    assert.equal(payload.templateId, template.id);
    assert.equal(payload.version.state, 'draft');
    assert.equal(payload.version.source, 'manual');
    assert.equal(payload.version.title, 'Operator Draft');
    assert.equal(payload.version.content, 'Hej {{first_name}}, detta ar ett manuellt utkast.');
    assert.deepEqual(payload.version.variablesUsed, ['first_name']);
    assert.equal(payload.version.revision, 1);

    const stored = await templateStore.getTemplateVersion(template.id, payload.version.id);
    assert.equal(stored.state, 'draft');
    assert.equal(stored.title, 'Operator Draft');
    assert.equal(stored.source, 'manual');
  });
});
