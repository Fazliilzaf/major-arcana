const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCommDraftRouter } = require('../../src/routes/ccoCommDraft');
const { roleHasPermission } = require('../../src/security/ccoRbac');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-comm-draft-'));
  const app = express();
  app.use(
    '/api/v1',
    createCcoCommDraftRouter({
      config: {
        ccoCommDraftStorePath: path.join(tempDir, 'cco-comm-draft.json'),
        buildVersion: 'test',
      },
      // Injicerad auth: roll styrs av x-role-header (RBAC läser req.auth.role).
      requireAuth: (req, _res, next) => {
        req.auth = {
          tenantId: 'hairtpclinic',
          userId: 'u1',
          role: req.headers['x-role'] || 'operator',
        };
        next();
      },
      commDraftStore: null, // lat-skapas mot tempfil
      executionGateway: null, // routern skapar en riktig gateway
      openai: null, // deterministisk fallback — inga externa AI-anrop i test
      auditLog: null,
    })
  );
  return { app, tempDir };
}

function call(baseUrl, method, route, { role = 'operator', body } = {}) {
  return fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-role': role },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

test('mail.live_send är owner-only i RBAC', () => {
  assert.equal(roleHasPermission('owner', 'mail.live_send'), true);
  assert.equal(roleHasPermission('operator', 'mail.live_send'), false);
  assert.equal(roleHasPermission('konsult', 'mail.live_send'), false);
});

test('AI-generering går genom gateway och skapar ett utkast (deterministisk fallback)', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const gen = await call(baseUrl, 'POST', '/cco-comm/drafts/generate-reply', {
      role: 'operator',
      body: {
        customerId: 'cust-1',
        tone: 'warm',
        customerName: 'Anna Karlsson',
        threadSnippet: 'Hej, jag vill boka PRP.',
      },
    });
    assert.equal(gen.status, 200);
    assert.equal(gen.json.decision, 'allow');
    assert.ok(gen.json.draftId);
    assert.ok(gen.json.body.length > 0);
    assert.equal(gen.json.status, 'draft');
  });
});

test('journalliknande input flaggas review_required men persisteras', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const jr = await call(baseUrl, 'POST', '/cco-comm/drafts/generate-reply', {
      role: 'operator',
      body: {
        customerId: 'cust-2',
        tone: 'professional',
        threadSnippet: 'Min hälsodeklaration och journalpost.',
      },
    });
    assert.equal(jr.status, 200);
    assert.equal(jr.json.decision, 'review_required');
    assert.ok(jr.json.draftId);
  });
});

test('utkast: skapa → patch → needs_approval → approved → queued', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const created = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      role: 'operator',
      body: { customerId: 'cust-3', subject: 'Svar', body: 'Hej!' },
    });
    assert.equal(created.status, 201);
    const id = created.json.draft.draftId;

    const patched = await call(baseUrl, 'PATCH', `/cco-comm/drafts/${id}`, {
      role: 'operator',
      body: { body: 'Hej Anna, tack för ditt meddelande.' },
    });
    assert.equal(patched.status, 200);
    assert.match(patched.json.draft.body, /tack för ditt/);

    for (const status of ['needs_approval', 'approved', 'queued']) {
      const t = await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
        role: 'operator',
        body: { status },
      });
      assert.equal(t.status, 200);
      assert.equal(t.json.draft.status, status);
    }
  });
});

test('LIVE-utskick (→ sent) är hårt blockerat — owner-mandat', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const created = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      role: 'operator',
      body: { customerId: 'c', body: 'x' },
    });
    const id = created.json.draft.draftId;
    for (const status of ['needs_approval', 'approved', 'queued']) {
      await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
        role: 'operator',
        body: { status },
      });
    }
    // operator saknar mail.live_send
    const sendOp = await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'operator',
      body: { status: 'sent' },
    });
    assert.equal(sendOp.status, 403);
    assert.match(sendOp.json.error, /live_send/i);
    // owner har permission men sändning är ändå hårt avstängd
    const sendOwner = await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'owner',
      body: { status: 'sent' },
    });
    assert.equal(sendOwner.status, 403);
    assert.equal(sendOwner.json.decision, 'blocked');
    // utkastet får ALDRIG nå sent
    const after = await call(baseUrl, 'GET', `/cco-comm/drafts/${id}`, { role: 'operator' });
    assert.equal(after.json.draft.status, 'queued');
  });
});

test('RBAC: revisor saknar mail.send och kan inte skapa utkast', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      role: 'revisor',
      body: { customerId: 'x' },
    });
    assert.equal(res.status, 403);
  });
});
