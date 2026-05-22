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

function createOpenAiStub(replyText) {
  return {
    chat: {
      completions: {
        async create() {
          return {
            choices: [
              {
                message: {
                  content: replyText,
                },
              },
            ],
          };
        },
      },
    },
  };
}

test('generate draft runs eval before persist and blocks unsafe output', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-template-order-'));
  const templateStore = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
    maxEvaluations: 200,
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
    name: 'Unsafe Gate Test',
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
      openai: createOpenAiStub('Du har diagnos och vi garanterar resultat.'),
      model: 'test-model',
      requireAuth: mockAuth.requireAuth,
      requireRole: mockAuth.requireRole,
    })
  );

  await withServer(app, async (baseUrl) => {
    const blockedRes = await fetch(
      `${baseUrl}/api/v1/templates/${template.id}/drafts/generate`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          instruction: 'Skapa ett utkast',
        }),
      }
    );
    assert.equal(blockedRes.status, 403);
  });

  const versionsAfterBlocked = await templateStore.listTemplateVersions(template.id);
  assert.equal(Array.isArray(versionsAfterBlocked), true);
  assert.equal(versionsAfterBlocked.length, 0);
});

test('patch update runs eval before persist and keeps old content on blocked update', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-template-update-order-'));
  const templateStore = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
    maxEvaluations: 200,
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
    name: 'Update Gate Test',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: 'owner-a',
  });
  const draft = await templateStore.createDraftVersion({
    templateId: template.id,
    title: 'Draft',
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
    const blockedRes = await fetch(
      `${baseUrl}/api/v1/templates/${template.id}/versions/${draft.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: 'Du har diagnos och vi garanterar resultat.',
        }),
      }
    );
    assert.equal(blockedRes.status, 403);
  });

  const after = await templateStore.getTemplateVersion(template.id, draft.id);
  assert.equal(after.content, 'Hej {{first_name}}');
});

test('generate draft blocks unknown template variables before persist', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-template-unknown-var-'));
  const templateStore = await createTemplateStore({
    filePath: path.join(tempDir, 'templates.json'),
    maxEvaluations: 200,
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
    name: 'Unknown Variable Gate Test',
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
      openai: createOpenAiStub('Hej {{totally_unknown_variable}}'),
      model: 'test-model',
      requireAuth: mockAuth.requireAuth,
      requireRole: mockAuth.requireRole,
    })
  );

  await withServer(app, async (baseUrl) => {
    const blockedRes = await fetch(
      `${baseUrl}/api/v1/templates/${template.id}/drafts/generate`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          instruction: 'Skapa ett utkast',
        }),
      }
    );
    assert.equal(blockedRes.status, 403);
  });

  const versionsAfterBlocked = await templateStore.listTemplateVersions(template.id);
  assert.equal(Array.isArray(versionsAfterBlocked), true);
  assert.equal(versionsAfterBlocked.length, 0);
});
