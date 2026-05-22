const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createTemplateStore } = require('../../src/templates/store');
const { createTemplateRouter } = require('../../src/routes/templates');
const { createAuthStore } = require('../../src/security/authStore');
const { createAuthMiddleware } = require('../../src/security/authMiddleware');

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
      tenantId: String(req.get('x-tenant-id') || '').trim() || 'tenant-a',
      userId: String(req.get('x-user-id') || '').trim() || 'test-user',
      role: String(req.get('x-role') || '').trim().toUpperCase() || 'OWNER',
    };
    next();
  }

  function requireRole(...roles) {
    const allowed = new Set(roles.map((value) => String(value || '').toUpperCase()));
    return (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Inloggning krävs.' });
      if (!allowed.has(String(req.auth.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
      }
      return next();
    };
  }

  return {
    requireAuth,
    requireRole,
  };
}

test('cross-tenant routes are denied and audit logged', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cross-tenant-'));
  const templateStorePath = path.join(tempDir, 'templates.json');
  const authStorePath = path.join(tempDir, 'auth.json');

  const templateStore = await createTemplateStore({
    filePath: templateStorePath,
    maxEvaluations: 200,
  });
  const authStore = await createAuthStore({
    filePath: authStorePath,
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditMaxEntries: 10000,
    auditAppendOnly: true,
  });

  const ownerA = await authStore.createUser({
    email: 'owner-a@example.com',
    password: 'StrongPass!123',
    mfaRequired: false,
  });
  await authStore.ensureMembership({
    userId: ownerA.id,
    tenantId: 'tenant-a',
    role: 'OWNER',
    createdBy: null,
  });

  const createdTemplate = await templateStore.createTemplate({
    tenantId: 'tenant-a',
    category: 'CONSULTATION',
    name: 'Tenant A template',
    channel: 'email',
    locale: 'sv-SE',
    createdBy: ownerA.id,
  });
  const draft = await templateStore.createDraftVersion({
    templateId: createdTemplate.id,
    title: 'Version 1',
    content: 'Hej {{first_name}}',
    source: 'manual',
    variablesUsed: ['first_name'],
    createdBy: ownerA.id,
  });
  await templateStore.evaluateVersion({
    templateId: createdTemplate.id,
    versionId: draft.id,
    inputEvaluation: {
      scope: 'input',
      category: 'CONSULTATION',
      tenantRiskModifier: 0,
      riskLevel: 1,
      riskColor: 'green',
      riskScore: 10,
      semanticScore: 10,
      ruleScore: 0,
      decision: 'allow',
      reasonCodes: [],
      ruleHits: [],
      policyHits: [],
      policyAdjustments: [],
      evaluatedAt: new Date().toISOString(),
    },
    outputEvaluation: {
      scope: 'output',
      category: 'CONSULTATION',
      tenantRiskModifier: 0,
      riskLevel: 1,
      riskColor: 'green',
      riskScore: 10,
      semanticScore: 10,
      ruleScore: 0,
      decision: 'allow',
      reasonCodes: [],
      ruleHits: [],
      policyHits: [],
      policyAdjustments: [],
      evaluatedAt: new Date().toISOString(),
    },
  });

  const mockAuth = createMockAuth();
  const tenantConfigStore = {
    async getTenantConfig() {
      return {
        riskSensitivityModifier: 0,
        templateVariableAllowlistByCategory: {},
        templateRequiredVariablesByCategory: {},
        templateSignaturesByChannel: {},
      };
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createTemplateRouter({
      templateStore,
      authStore,
      tenantConfigStore,
      openai: null,
      model: '',
      requireAuth: mockAuth.requireAuth,
      requireRole: mockAuth.requireRole,
    })
  );

  const auth = createAuthMiddleware({ authStore });
  app.get(
    '/api/v1/auth/audit/events',
    mockAuth.requireAuth,
    auth.requireTenantScope({ queryKey: 'tenantId', optional: false }),
    async (req, res) => {
      const events = await authStore.listAuditEvents({
        tenantId: String(req.query.tenantId || ''),
        limit: 50,
      });
      return res.json({ events });
    }
  );

  await withServer(app, async (baseUrl) => {
    const headers = {
      'x-tenant-id': 'tenant-b',
      'x-user-id': crypto.randomUUID(),
      'x-role': 'OWNER',
      'content-type': 'application/json',
    };

    const readRes = await fetch(`${baseUrl}/api/v1/templates/${createdTemplate.id}/versions`, {
      headers,
    });
    assert.equal(readRes.status, 403);

    const writeRes = await fetch(
      `${baseUrl}/api/v1/templates/${createdTemplate.id}/drafts/generate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          instruction: 'Skriv en hälsning',
        }),
      }
    );
    assert.equal(writeRes.status, 403);

    const evalRes = await fetch(
      `${baseUrl}/api/v1/templates/${createdTemplate.id}/versions/${draft.id}/evaluate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ instruction: 'Utvärdera' }),
      }
    );
    assert.equal(evalRes.status, 403);

    const activateRes = await fetch(
      `${baseUrl}/api/v1/templates/${createdTemplate.id}/versions/${draft.id}/activate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      }
    );
    assert.equal(activateRes.status, 403);

    const auditQueryRes = await fetch(
      `${baseUrl}/api/v1/auth/audit/events?tenantId=tenant-a`,
      {
        headers,
      }
    );
    assert.equal(auditQueryRes.status, 403);
  });

  const tenantBAudit = await authStore.listAuditEvents({
    tenantId: 'tenant-b',
    limit: 500,
  });
  const actions = new Set(tenantBAudit.map((event) => event.action));
  assert.equal(actions.has('templates.versions.read'), true);
  assert.equal(actions.has('templates.generate_draft'), true);
  assert.equal(actions.has('templates.evaluate'), true);
  assert.equal(actions.has('templates.activate'), true);
  assert.equal(actions.has('tenant.scope.denied'), true);
});
