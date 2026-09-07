'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { execFileSync } = require('node:child_process');

const { createApprovalRequestStore, STATUSES } = require('../../src/security/approvalRequestStore');
const { evaluateAction, classifyAction } = require('../../src/security/actionGate');
const { resolveTool } = require('../../src/security/cmoToolRegistry');
const { createCmoRepoAdapter } = require('../../src/security/cmoRepoAdapter');
const { createStaffApprovalsRouter } = require('../../src/routes/staffApprovals');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'wp010-')); }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

function makeFixtureRepo() {
  const dir = tmpdir();
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'index.md'), '# Rubrik X\n\nPilot.\n');
  git(dir, ['add', '.']);
  git(dir, ['-c', 'user.email=t@t.se', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return { dir, branch: git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) };
}

function fixtureRepos(fixture) {
  return {
    'pilot-fixture': {
      repoId: 'pilot-fixture', gitUrl: fixture.dir, defaultBranch: fixture.branch,
      canonicalHead: null, buildCommands: [], previewCommands: [['node', '-e', "console.log('ok')"]],
    },
  };
}

function makeAdapter(fixture, opts = {}) {
  const repos = fixtureRepos(fixture);
  return createCmoRepoAdapter({
    canonicalRoot: opts.canonicalRoot || tmpdir(),
    worktreesRoot: opts.worktreesRoot || tmpdir(),
    resolveRepoFn: (id) => repos[id] || null,
  });
}

const ACTOR = { userId: 'anna', role: 'PERSONAL' };

// ── DEL A — approval store state machine ────────────────────────────────────

test('WP-010 DEL A: statusflöde PENDING → APPROVED → EXECUTED', async () => {
  const s = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const rec = await s.create({ tenant: 't', agent: 'CMO', action: 'cmo.content.write_candidate', snapshotHash: 'h1' });
  assert.equal(rec.status, 'PENDING');
  const approved = await s.approve(rec.id, { approver: 'owner' });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedBy, 'owner');
  const executed = await s.execute(rec.id);
  assert.equal(executed.status, 'EXECUTED');
  assert.ok(executed.executedAt);
});

test('WP-010 DEL A: reject behåller historik', async () => {
  const s = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const rec = await s.create({ tenant: 't', agent: 'CMO', action: 'cmo.content.write_candidate' });
  await s.reject(rec.id, { approver: 'owner', reason: 'nej' });
  const got = s.get(rec.id);
  assert.equal(got.status, 'REJECTED');
  assert.equal(got.rejectedBy, 'owner');
  assert.equal(got.rejectReason, 'nej');
});

test('WP-010 DEL A: approve twice → null (idempotent-safe), execute efter reject → null', async () => {
  const s = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const rec = await s.create({ tenant: 't', agent: 'CMO', action: 'cmo.content.write_candidate' });
  await s.approve(rec.id, { approver: 'owner' });
  assert.equal(await s.approve(rec.id, { approver: 'owner2' }), null); // ej PENDING längre
  const r2 = await s.create({ tenant: 't', agent: 'CMO', action: 'cmo.content.write_candidate' });
  await s.reject(r2.id, { approver: 'owner' });
  assert.equal(await s.execute(r2.id), null); // REJECTED kan ej exekveras
});

test('WP-010 DEL A: expirePending markerar utgångna PENDING', async () => {
  const s = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json'), ttlMs: 1 });
  const rec = await s.create({ tenant: 't', agent: 'CMO', action: 'cmo.content.write_candidate' });
  await new Promise((r) => setTimeout(r, 10));
  const n = await s.expirePending();
  assert.equal(n, 1);
  assert.equal(s.get(rec.id).status, 'EXPIRED');
});

// ── DEL E — policy: write_candidate → WRITE → REQUIRE_APPROVAL ──────────────

test('WP-010 DEL E: cmo.content.write_candidate → REQUIRE_APPROVAL (OWNER_APPROVAL)', () => {
  assert.equal(classifyAction('cmo.content.write_candidate'), 'WRITE');
  assert.ok(resolveTool('cmo.content.write_candidate'));
  const g = evaluateAction({ userId: 'anna', tenantId: 't', role: 'PERSONAL', agent: 'CMO', action: 'cmo.content.write_candidate', resource: 'x', hasEntitlement: true, isDisabled: false });
  assert.equal(g.decision, 'REQUIRE_APPROVAL');
  assert.equal(g.approval, 'OWNER_APPROVAL');
  assert.equal(g.level, 'WRITE');
});

test('WP-010 DEL E: canonical write (.write) förblir DENY', () => {
  const g = evaluateAction({ userId: 'anna', tenantId: 't', role: 'PERSONAL', agent: 'CMO', action: 'cmo.content.write', resource: 'x', hasEntitlement: true, isDisabled: false });
  assert.equal(g.decision, 'DENY');
  assert.equal(g.reason, 'write_not_allowed_in_v1');
});

// ── DEL D/F — write-candidate propose → execute (receipt v3) ────────────────

async function propose(adapter, approvalStore, taskId = 'task-w1', tenantId = 'hair-tp-clinic') {
  await adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.content.draft',
    args: { repo_id: 'pilot-fixture', path: 'index.md', content: '# Rubrik Y\n' },
    actor: ACTOR, tenantId, taskId,
  });
  return adapter.proposeWriteCandidate({
    repoId: 'pilot-fixture', taskId, args: { repo_id: 'pilot-fixture', path: 'index.md' },
    actor: ACTOR, tenantId, approvalStore,
  });
}

test('WP-010 DEL D/F: propose → pending approval; approve → execute → receipt v3', async () => {
  const fixture = makeFixtureRepo();
  const adapter = makeAdapter(fixture);
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const prop = await propose(adapter, approvalStore);
  assert.equal(prop.status, 'pending_approval');
  assert.ok(prop.approvalId);
  assert.deepEqual(prop.changedFiles, ['index.md']);
  assert.ok(prop.snapshotHash);

  const approval = approvalStore.get(prop.approvalId);
  assert.equal(approval.status, 'PENDING');
  assert.equal(approval.approvalClass, 'OWNER_APPROVAL');
  assert.equal(approval.baseSha, prop.repo.baseSha);

  await approvalStore.approve(approval.id, { approver: 'owner' });
  const receipt = await adapter.executeApprovedWrite({ approvalId: approval.id, approvalStore });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, 'executed');
  assert.equal(receipt.approvalId, approval.id);
  assert.equal(receipt.approver, 'owner');
  assert.equal(receipt.approvedSnapshotHash, approval.snapshotHash);
  assert.equal(receipt.executedAction, 'cmo.content.write_candidate');
  assert.ok(receipt.candidateCommit);
  assert.equal(receipt.canonicalIntegrity, 'PRISTINE');
  assert.equal(approvalStore.get(approval.id).status, 'EXECUTED');
});

test('WP-010 DEL G: TOCTOU — diff ändrad efter proposal → execute DENY', async () => {
  const fixture = makeFixtureRepo();
  const worktreesRoot = tmpdir();
  const adapter = makeAdapter(fixture, { worktreesRoot });
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const prop = await propose(adapter, approvalStore, 'task-toctou');
  await approvalStore.approve(prop.approvalId, { approver: 'owner' });
  // Ändra worktreen EFTER proposal (nya filer → snapshot mismatch).
  const wt = path.join(worktreesRoot, 'task-toctou');
  fs.writeFileSync(path.join(wt, 'extra.md'), 'ny fil');
  const receipt = await adapter.executeApprovedWrite({ approvalId: prop.approvalId, approvalStore });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.reason, 'snapshot_mismatch');
});

test('WP-010 DEL G: base SHA drift → base_sha_changed', async () => {
  const fixture = makeFixtureRepo();
  const adapter = makeAdapter(fixture);
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const prop = await propose(adapter, approvalStore);
  const approval = { ...approvalStore.get(prop.approvalId), baseSha: '0000000000000000000000000000000000000000' };
  const check = adapter.checkCandidateSnapshot(approval);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'base_sha_changed');
});

test('WP-010 DEL G: rejected/expired kan inte exekveras', async () => {
  const fixture = makeFixtureRepo();
  const adapter = makeAdapter(fixture);
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json'), ttlMs: 1 });
  const prop = await propose(adapter, approvalStore, 'task-rej');
  await approvalStore.reject(prop.approvalId, { approver: 'owner' });
  const r = await adapter.executeApprovedWrite({ approvalId: prop.approvalId, approvalStore });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'approval_status_rejected');
});

// ── DEL C — approvals router (server-side authority) ────────────────────────

function makeApp(approvalStore, adapter, role = 'OWNER', tenantId = 'hair-tp-clinic') {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createStaffApprovalsRouter({
    requireAuth: (req, _res, next) => { req.auth = { userId: 'owner', tenantId, role }; next(); },
    approvalStore,
    repoAdapter: adapter,
  }));
  return app;
}

async function withServer(store, adapter, fn, auth) {
  const app = makeApp(store, adapter, auth?.role, auth?.tenantId);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); } finally { await new Promise((r) => server.close(r)); }
}

test('WP-010 DEL C: OWNER approve kör write; forged approved=true ignoreras', async () => {
  const fixture = makeFixtureRepo();
  const adapter = makeAdapter(fixture);
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const prop = await propose(adapter, approvalStore, 'task-route');
  await withServer(approvalStore, adapter, async (base) => {
    // Klient skickar approved=true — servern ignorerar och verifierar själv.
    const res = await fetch(`${base}/api/v1/staff/approvals/${prop.approvalId}/approve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: true }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.receipt.ok, true);
    assert.equal(body.receipt.status, 'executed');
    assert.equal(approvalStore.get(prop.approvalId).status, 'EXECUTED');
  });
});

test('WP-010 DEL C/L: non-owner approve OWNER_APPROVAL → DENY (403)', async () => {
  const fixture = makeFixtureRepo();
  const adapter = makeAdapter(fixture);
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const prop = await propose(adapter, approvalStore, 'task-nonowner');
  await withServer(approvalStore, adapter, async (base) => {
    const res = await fetch(`${base}/api/v1/staff/approvals/${prop.approvalId}/approve`, { method: 'POST' });
    assert.equal(res.status, 403); // role=PERSONAL (default makeApp role=OWNER; använd override nedan)
  }, { role: 'PERSONAL' });
});

test('WP-010 DEL C/L: cross-tenant approve → 403', async () => {
  const fixture = makeFixtureRepo();
  const adapter = makeAdapter(fixture);
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const prop = await propose(adapter, approvalStore, 'task-x');
  await withServer(approvalStore, adapter, async (base) => {
    const res = await fetch(`${base}/api/v1/staff/approvals/${prop.approvalId}/approve`, { method: 'POST' });
    assert.equal(res.status, 403);
  }, { role: 'OWNER', tenantId: 'other-tenant' });
});

test('WP-010 DEL C/L: approve nonexistent → 404', async () => {
  const fixture = makeFixtureRepo();
  const adapter = makeAdapter(fixture);
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  await withServer(approvalStore, adapter, async (base) => {
    const res = await fetch(`${base}/api/v1/staff/approvals/nope/approve`, { method: 'POST' });
    assert.equal(res.status, 404);
  });
});

test('WP-010 DEL C: reject → REJECTED (historik kvar)', async () => {
  const fixture = makeFixtureRepo();
  const adapter = makeAdapter(fixture);
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'a.json') });
  const prop = await propose(adapter, approvalStore, 'task-rej2');
  await withServer(approvalStore, adapter, async (base) => {
    const res = await fetch(`${base}/api/v1/staff/approvals/${prop.approvalId}/reject`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'nej tack' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'REJECTED');
    assert.equal(approvalStore.get(prop.approvalId).status, 'REJECTED');
  });
});
