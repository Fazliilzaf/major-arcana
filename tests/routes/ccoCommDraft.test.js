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
      // Injicerad auth: roll/användare/tenant styrs av headers så enskilda
      // anrop kan agera olika aktörer/tenants (RBAC läser req.auth.role).
      requireAuth: (req, _res, next) => {
        req.auth = {
          tenantId: req.headers['x-tenant'] || 'hairtpclinic',
          userId: req.headers['x-user'] || 'u1',
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

function call(baseUrl, method, route, { role = 'operator', user, tenant, body } = {}) {
  const headers = { 'content-type': 'application/json', 'x-role': role };
  if (user) headers['x-user'] = user;
  if (tenant) headers['x-tenant'] = tenant;
  return fetch(`${baseUrl}${route}`, {
    method,
    headers,
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
      user: 'author-1',
      body: { customerId: 'cust-3', subject: 'Svar', body: 'Hej!' },
    });
    assert.equal(created.status, 201);
    const id = created.json.draft.draftId;

    const patched = await call(baseUrl, 'PATCH', `/cco-comm/drafts/${id}`, {
      role: 'operator',
      user: 'author-1',
      body: { body: 'Hej Anna, tack för ditt meddelande.' },
    });
    assert.equal(patched.status, 200);
    assert.match(patched.json.draft.body, /tack för ditt/);

    // needs_approval av författaren, men approved av EN ANNAN aktör
    // (segregation of duties), sedan queued.
    const transitions = [
      { status: 'needs_approval', user: 'author-1' },
      { status: 'approved', user: 'approver-2' },
      { status: 'queued', user: 'approver-2' },
    ];
    for (const { status, user } of transitions) {
      const t = await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
        role: 'operator',
        user,
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
      user: 'author-1',
      body: { customerId: 'c', body: 'x' },
    });
    const id = created.json.draft.draftId;
    const chain = [
      { status: 'needs_approval', user: 'author-1' },
      { status: 'approved', user: 'approver-2' },
      { status: 'queued', user: 'approver-2' },
    ];
    for (const { status, user } of chain) {
      await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
        role: 'operator',
        user,
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

// ── Härdning (#258) ────────────────────────────────────────────────────────

test('#258 segregation of duties: författare kan inte godkänna eget utkast', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const created = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      role: 'operator',
      user: 'author-x',
      body: { customerId: 'c-sod', body: 'utkast' },
    });
    const id = created.json.draft.draftId;
    await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'operator',
      user: 'author-x',
      body: { status: 'needs_approval' },
    });
    // Samma operator försöker godkänna sitt eget → 403
    const selfApprove = await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'operator',
      user: 'author-x',
      body: { status: 'approved' },
    });
    assert.equal(selfApprove.status, 403);
    assert.match(selfApprove.json.error, /segregation of duties|approve own/i);
    // Annan operator får godkänna → 200
    const otherApprove = await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'operator',
      user: 'reviewer-y',
      body: { status: 'approved' },
    });
    assert.equal(otherApprove.status, 200);
    assert.equal(otherApprove.json.draft.status, 'approved');
    assert.equal(otherApprove.json.draft.approvedBy, 'reviewer-y');
  });
});

test('#258 owner får godkänna eget utkast (mail.live_send-undantag)', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const created = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      role: 'owner',
      user: 'owner-o',
      body: { customerId: 'c-owner', body: 'utkast' },
    });
    const id = created.json.draft.draftId;
    await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'owner',
      user: 'owner-o',
      body: { status: 'needs_approval' },
    });
    const approve = await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'owner',
      user: 'owner-o',
      body: { status: 'approved' },
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.json.draft.status, 'approved');
  });
});

test('#258 tenant-isolering: annan tenant kan inte läsa/ändra/transitionera draft', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    // Skapa som tenant A
    const created = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      role: 'operator',
      user: 'a-user',
      tenant: 'tenant-a',
      body: { customerId: 'c-iso', body: 'hemligt för A' },
    });
    assert.equal(created.status, 201);
    const id = created.json.draft.draftId;

    // Tenant B: GET → 404
    const getB = await call(baseUrl, 'GET', `/cco-comm/drafts/${id}`, {
      role: 'operator',
      user: 'b-user',
      tenant: 'tenant-b',
    });
    assert.equal(getB.status, 404);

    // Tenant B: PATCH → 404
    const patchB = await call(baseUrl, 'PATCH', `/cco-comm/drafts/${id}`, {
      role: 'operator',
      user: 'b-user',
      tenant: 'tenant-b',
      body: { body: 'kapad' },
    });
    assert.equal(patchB.status, 404);

    // Tenant B: transition → 404
    const transB = await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'operator',
      user: 'b-user',
      tenant: 'tenant-b',
      body: { status: 'needs_approval' },
    });
    assert.equal(transB.status, 404);

    // Tenant A: GET → 200 (oförändrad)
    const getA = await call(baseUrl, 'GET', `/cco-comm/drafts/${id}`, {
      role: 'operator',
      user: 'a-user',
      tenant: 'tenant-a',
    });
    assert.equal(getA.status, 200);
    assert.match(getA.json.draft.body, /hemligt för A/);
  });
});

test('#258 race: samtidiga transition-anrop på samma draft ger exakt en vinnare', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const created = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      role: 'operator',
      user: 'author-r',
      body: { customerId: 'c-race', body: 'x' },
    });
    const id = created.json.draft.draftId;
    await call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
      role: 'operator',
      user: 'author-r',
      body: { status: 'needs_approval' },
    });
    // Två samtidiga approve från samma (distinkta) godkännare. Med per-draft-lås
    // ska exakt EN lyckas (needs_approval→approved); den andra ser approved och
    // får 409 (approved→approved är ingen tillåten övergång).
    const [r1, r2] = await Promise.all([
      call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
        role: 'operator',
        user: 'rev-r',
        body: { status: 'approved' },
      }),
      call(baseUrl, 'POST', `/cco-comm/drafts/${id}/transition`, {
        role: 'operator',
        user: 'rev-r',
        body: { status: 'approved' },
      }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    // statusHistory ska ha exakt en approved-post (ingen dubbelskrivning)
    const after = await call(baseUrl, 'GET', `/cco-comm/drafts/${id}`, {
      role: 'operator',
      user: 'a-user',
    });
    const approvedEntries = after.json.draft.statusHistory.filter((h) => h.to === 'approved');
    assert.equal(approvedEntries.length, 1);
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
