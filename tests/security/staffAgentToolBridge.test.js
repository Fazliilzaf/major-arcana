'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createStaffAgentToolBridgeRouter, membershipIsActive } = require('../../src/routes/staffAgentToolBridge');
const { createStaffAgentEntitlementStore } = require('../../src/security/staffAgentEntitlementStore');
const { createAuthStore } = require('../../src/security/authStore');
const { buildContextToken } = require('../../src/security/staffAgentContext');
const { executeCmoTool } = require('../../src/security/toolExecutor');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'toolBridge-')); }

function makeApp(store, roots, authStore) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createStaffAgentToolBridgeRouter({ store, roots, authStore }));
  return app;
}

async function withServer(store, roots, fn, authStore) {
  const app = makeApp(store, roots, authStore || mockActiveAuth());
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function cmoToken({ userId = 'anna', tenantId = 'hair-tp-clinic', agentId = 'CMO' } = {}) {
  return buildContextToken({ userId, tenantId, staffRole: 'PERSONAL', agentId, portalId: 'cmo' });
}

// Mock-adapter: aktiv medlem för 'hair-tp-clinic' (WP-008b-tester som inte
// testar membership-recheck i sig).
function mockActiveAuth() {
  return {
    getUserById: async (id) => ({ id, status: 'active' }),
    listMembershipsForUser: async () => [
      { userId: 'anna', tenantId: 'hair-tp-clinic', role: 'PERSONAL', status: 'active' },
    ],
  };
}

async function post(base, body, headers = {}) {
  const res = await fetch(`${base}/api/v1/staff/agent-tools/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

test('WP-008b E2E: riktig staff identity → CMO entitlement → READ/DRAFT/PREVIEW → receipt → canonical orört', async () => {
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'entitlements.json') });
  const readRoot = tmpdir();
  const scratchRoot = tmpdir();
  const canonical = path.join(readRoot, 'pilot', 'index.md');
  const original = '# Rubrik X\n\nPilotprojektets nuvarande startsida.\n';
  fs.mkdirSync(path.dirname(canonical), { recursive: true });
  fs.writeFileSync(canonical, original, 'utf8');

  await store.grant({ userId: 'anna', tenantId: 'hair-tp-clinic', agent: 'CMO', actor: { userId: 'owner', role: 'OWNER' } });
  const token = cmoToken();
  assert.ok(token, 'context-token utfärdat');

  await withServer(store, { readRoot, scratchRoot }, async (base) => {
    // 1) READ genom allowlist.
    const read = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: 'pilot/index.md' } });
    assert.equal(read.status, 200);
    assert.equal(read.body.receipt.result.ok, true);
    assert.equal(read.body.receipt.result.content, original);
    assert.deepEqual(read.body.receipt.resources_read, [canonical]);

    // 2) DRAFT endast i scratch; canonical förblir byte-identisk.
    const draft = await post(base, {
      context_token: token,
      tool: 'cmo.content.draft',
      args: { path: 'pilot/index.md', content: '# Rubrik Y\n\nPilotprojektets nya rubrik.\n' },
    });
    assert.equal(draft.status, 200);
    assert.equal(draft.body.receipt.result.ok, true);
    const draftPath = draft.body.receipt.result.draftPath;
    assert.ok(draftPath.startsWith(scratchRoot + path.sep), 'draft i scratch');
    assert.equal(fs.readFileSync(draftPath, 'utf8'), '# Rubrik Y\n\nPilotprojektets nya rubrik.\n');
    assert.equal(fs.readFileSync(canonical, 'utf8'), original, 'canonical byte-identisk');

    // 3) PREVIEW produceras (mock, ingen fil).
    const preview = await post(base, { context_token: token, tool: 'cmo.website.preview', args: { path: 'pilot/index.md' } });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.receipt.result.ok, true);
    assert.ok(preview.body.receipt.result.preview);
    assert.match(preview.body.receipt.result.preview.note, /ingen deploy/i);

    // Receipt-identitet.
    assert.equal(read.body.receipt.requested_by, 'anna');
    assert.equal(read.body.receipt.agent, 'CMO');
  });
});

test('WP-008b: CCO/CFO/CAO/COO → not_cmo (inget tool-mode)', async () => {
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'e.json') });
  await store.grant({ userId: 'anna', tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });
  for (const agent of ['CCO', 'CFO', 'CAO', 'COO', 'CEO']) {
    const token = cmoToken({ agentId: agent });
    await withServer(store, { readRoot: tmpdir(), scratchRoot: tmpdir() }, async (base) => {
      const r = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: 'x.md' } });
      assert.equal(r.status, 403, agent);
      assert.equal(r.body.error, 'not_cmo');
    });
  }
});

test('WP-008b: återkallad entitlement → no_entitlement (token ensamt räcker inte)', async () => {
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'e.json') });
  await store.grant({ userId: 'anna', tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });
  const token = cmoToken();
  await store.revoke({ userId: 'anna', tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });
  await withServer(store, { readRoot: tmpdir(), scratchRoot: tmpdir() }, async (base) => {
    const r = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: 'x.md' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'no_entitlement');
  });
});

test('WP-008b: manipulerad/ogiltig token → 401 invalid_context', async () => {
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'e.json') });
  await withServer(store, { readRoot: tmpdir(), scratchRoot: tmpdir() }, async (base) => {
    const r = await post(base, { context_token: 'fake.token.sig', tool: 'cmo.content.read', args: {} });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'invalid_context');
  });
});

test('WP-008b: shell / oregistrerat tool → unknown_tool (fejkat ALLOW ignoreras)', async () => {
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'e.json') });
  await store.grant({ userId: 'anna', tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });
  const token = cmoToken();
  await withServer(store, { readRoot: tmpdir(), scratchRoot: tmpdir() }, async (base) => {
    for (const tool of ['shell.exec', 'cmo.git.push', 'cmo.content.write', 'cmo.website.deploy']) {
      // Klient försöker fejka gate-beslut — servern ignorerar det.
      const r = await post(base, { context_token: token, tool, args: { cmd: 'rm -rf /' }, gate_decision: 'ALLOW' });
      assert.equal(r.status, 200, tool);
      assert.equal(r.body.receipt.result.ok, false, tool);
      assert.equal(r.body.receipt.result.reason, 'unknown_tool', tool);
    }
  });
});

test('WP-008b: path traversal + .env + patientpath → path_escape/forbidden_path', async () => {
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'e.json') });
  await store.grant({ userId: 'anna', tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });
  const token = cmoToken();
  const readRoot = tmpdir();
  fs.writeFileSync(path.join(readRoot, '.env'), 'SECRET=1', 'utf8');
  await withServer(store, { readRoot, scratchRoot: tmpdir() }, async (base) => {
    const t1 = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: '../etc/passwd' } });
    assert.equal(t1.body.receipt.result.reason, 'path_escape');
    const t2 = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: '.env' } });
    assert.equal(t2.body.receipt.result.reason, 'forbidden_path');
    const t3 = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: '../patient-data-arkiv/journal.json' } });
    assert.equal(t3.body.receipt.result.reason, 'path_escape');
  });
});

test('WP-008b: executor kan inte fejkas — direkt anrop utan verifierad identity → no_identity', () => {
  const r = executeCmoTool({
    context: { agent: 'CMO', userId: '', tenantId: '', role: null, hasEntitlement: true, isDisabled: false },
    tool: 'cmo.content.read',
    args: { path: 'x.md' },
    roots: { readRoot: tmpdir(), scratchRoot: tmpdir() },
  });
  assert.equal(r.result.ok, false);
  assert.equal(r.result.reason, 'no_identity');
});

test('WP-008b: executor kräver CMO + entitlement (cross-agent användning blockerad)', () => {
  const roots = { readRoot: tmpdir(), scratchRoot: tmpdir() };
  // CFO försöker använda CMO-tool i executor → not_cmo (och actionGate nekar).
  const cross = executeCmoTool({
    context: { agent: 'CFO', userId: 'anna', tenantId: 't', role: 'FINANCE', hasEntitlement: true, isDisabled: false },
    tool: 'cmo.content.read',
    args: {},
    roots,
  });
  assert.equal(cross.result.reason, 'not_cmo');
  // CMO utan entitlement → no_entitlement.
  const noEnt = executeCmoTool({
    context: { agent: 'CMO', userId: 'anna', tenantId: 't', role: 'PERSONAL', hasEntitlement: false, isDisabled: false },
    tool: 'cmo.content.read',
    args: {},
    roots,
  });
  assert.equal(noEnt.result.reason, 'no_entitlement');
});

// ── WP-009 DEL A — live membership re-check ────────────────────────────────

test('WP-009 DEL A: membershipIsActive — alla inaktiva statusar → DENY', async () => {
  const mkAuth = ({ userStatus = 'active', membershipStatus = 'active', tenant = 'hair-tp-clinic' } = {}) => ({
    getUserById: async () => ({ id: 'u1', status: userStatus }),
    listMembershipsForUser: async () => [{ userId: 'u1', tenantId: tenant, role: 'PERSONAL', status: membershipStatus }],
  });
  assert.equal((await membershipIsActive(mkAuth(), 'u1', 'hair-tp-clinic')).ok, true);
  for (const s of ['disabled', 'revoked', 'inactive', 'suspended']) {
    assert.deepEqual(await membershipIsActive(mkAuth({ userStatus: s }), 'u1', 'hair-tp-clinic'), { ok: false, reason: 'user_inactive' });
    assert.deepEqual(await membershipIsActive(mkAuth({ membershipStatus: s }), 'u1', 'hair-tp-clinic'), { ok: false, reason: 'membership_inactive' });
  }
  assert.deepEqual(await membershipIsActive(mkAuth({ tenant: 'other' }), 'u1', 'hair-tp-clinic'), { ok: false, reason: 'membership_not_found' });
  assert.deepEqual(await membershipIsActive({ getUserById: async () => null }, 'u1', 't'), { ok: false, reason: 'user_not_found' });
});

test('WP-009 DEL A: aktiv membership + entitlement → ALLOW', async () => {
  const authStore = await createAuthStore({ filePath: path.join(tmpdir(), 'auth.json'), sessionTtlMs: 3600000, loginTicketTtlMs: 3600000 });
  const user = await authStore.createUser({ email: 'anna@clinic.se', password: 'ArcanaPilot!2026' });
  await authStore.ensureMembership({ userId: user.id, tenantId: 'hair-tp-clinic', role: 'PERSONAL' });
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'e.json') });
  await store.grant({ userId: user.id, tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });
  const token = cmoToken({ userId: user.id });
  const readRoot = tmpdir();
  fs.writeFileSync(path.join(readRoot, 'x.md'), 'innehåll', 'utf8');
  await withServer(store, { readRoot, scratchRoot: tmpdir() }, async (base) => {
    const r = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: 'x.md' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.receipt.result.ok, true);
  }, authStore);
});

test('WP-009 DEL A: valid context issued → staff disabled → nästa execution DENY', async () => {
  const authStore = await createAuthStore({ filePath: path.join(tmpdir(), 'auth.json'), sessionTtlMs: 3600000, loginTicketTtlMs: 3600000 });
  const user = await authStore.createUser({ email: 'anna@clinic.se', password: 'ArcanaPilot!2026' });
  const membership = await authStore.ensureMembership({ userId: user.id, tenantId: 'hair-tp-clinic', role: 'PERSONAL' });
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'e.json') });
  await store.grant({ userId: user.id, tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });
  const token = cmoToken({ userId: user.id }); // utfärdas MEDAN aktiv
  await authStore.updateMembership(membership.id, { status: 'disabled' }); // disable EFTER token
  await withServer(store, { readRoot: tmpdir(), scratchRoot: tmpdir() }, async (base) => {
    const r = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: 'x.md' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'membership_inactive');
  }, authStore);
});

test('WP-009 DEL A: revoked CMO entitlement efter token-issue → DENY', async () => {
  const authStore = await createAuthStore({ filePath: path.join(tmpdir(), 'auth.json'), sessionTtlMs: 3600000, loginTicketTtlMs: 3600000 });
  const user = await authStore.createUser({ email: 'anna@clinic.se', password: 'ArcanaPilot!2026' });
  await authStore.ensureMembership({ userId: user.id, tenantId: 'hair-tp-clinic', role: 'PERSONAL' });
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'e.json') });
  await store.grant({ userId: user.id, tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });
  const token = cmoToken({ userId: user.id });
  await store.revoke({ userId: user.id, tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} }); // revoke EFTER token
  await withServer(store, { readRoot: tmpdir(), scratchRoot: tmpdir() }, async (base) => {
    const r = await post(base, { context_token: token, tool: 'cmo.content.read', args: { path: 'x.md' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'no_entitlement');
  }, authStore);
});
