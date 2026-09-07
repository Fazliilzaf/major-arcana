'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { execFileSync } = require('node:child_process');

const { createStaffAgentToolBridgeRouter } = require('../../src/routes/staffAgentToolBridge');
const { createStaffApprovalsRouter } = require('../../src/routes/staffApprovals');
const { createCmoRepoAdapter } = require('../../src/security/cmoRepoAdapter');
const { createApprovalRequestStore } = require('../../src/security/approvalRequestStore');
const { createStaffAgentEntitlementStore } = require('../../src/security/staffAgentEntitlementStore');
const { createAuthStore } = require('../../src/security/authStore');
const { buildContextToken } = require('../../src/security/staffAgentContext');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'wp010e2e-')); }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

function makeFixtureRepo() {
  const dir = tmpdir();
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'index.md'), '# Rubrik X\n\nPilot.\n');
  git(dir, ['add', '.']);
  git(dir, ['-c', 'user.email=t@t.se', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return { dir, branch: git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) };
}

test('WP-010 DEL K: full acceptance — READ→DRAFT→WRITE proposed→approve→execute→canonical orörd', async () => {
  const fixture = makeFixtureRepo();
  const original = fs.readFileSync(path.join(fixture.dir, 'index.md'), 'utf8');
  const canonicalRoot = tmpdir();

  const authStore = await createAuthStore({ filePath: path.join(tmpdir(), 'auth.json'), sessionTtlMs: 3600000, loginTicketTtlMs: 3600000 });
  const user = await authStore.createUser({ email: 'anna@clinic.se', password: 'ArcanaPilot!2026' });
  await authStore.ensureMembership({ userId: user.id, tenantId: 'hair-tp-clinic', role: 'PERSONAL' });

  const entStore = await createStaffAgentEntitlementStore({ filePath: path.join(tmpdir(), 'ent.json') });
  await entStore.grant({ userId: user.id, tenantId: 'hair-tp-clinic', agent: 'CMO', actor: {} });

  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'approvals.json') });

  const repos = {
    'pilot-fixture': {
      repoId: 'pilot-fixture', gitUrl: fixture.dir, defaultBranch: fixture.branch,
      canonicalHead: null, buildCommands: [], previewCommands: [['node', '-e', "console.log('ok')"]],
    },
  };
  const adapter = createCmoRepoAdapter({
    canonicalRoot, worktreesRoot: tmpdir(), resolveRepoFn: (id) => repos[id] || null,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1', createStaffAgentToolBridgeRouter({
    store: entStore, authStore, repoAdapter: adapter, approvalStore,
    roots: { readRoot: tmpdir(), scratchRoot: tmpdir() },
  }));
  app.use('/api/v1', createStaffApprovalsRouter({
    requireAuth: (req, _res, next) => { req.auth = { userId: 'owner', tenantId: 'hair-tp-clinic', role: 'OWNER' }; next(); },
    approvalStore, repoAdapter: adapter,
  }));

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = buildContextToken({ userId: user.id, tenantId: 'hair-tp-clinic', staffRole: 'PERSONAL', agentId: 'CMO', portalId: 'cmo' });

  const exec = (tool, args) => fetch(`${base}/api/v1/staff/agent-tools/execute`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ context_token: token, tool, args }),
  }).then((r) => r.json());

  try {
    // 1) READ
    const read = await exec('cmo.content.read', { repo_id: 'pilot-fixture', task_id: 't1', path: 'index.md' });
    assert.equal(read.receipt.ok, true);

    // 2) DRAFT
    const draft = await exec('cmo.content.draft', { repo_id: 'pilot-fixture', task_id: 't1', path: 'index.md', content: '# Rubrik Y\n' });
    assert.equal(draft.receipt.ok, true);

    // 3) PREVIEW
    const preview = await exec('cmo.website.preview', { repo_id: 'pilot-fixture', task_id: 't1', path: 'index.md' });
    assert.equal(preview.receipt.preview.ok, true);

    // 4) WRITE proposed → REQUIRE_APPROVAL → pending approval
    const write = await exec('cmo.content.write_candidate', { repo_id: 'pilot-fixture', task_id: 't1', path: 'index.md' });
    assert.equal(write.receipt.status, 'pending_approval');
    assert.ok(write.receipt.approvalId);
    assert.equal(write.receipt.approvalClass, 'OWNER_APPROVAL');

    // 5) Owner ser approval
    const listRes = await fetch(`${base}/api/v1/staff/approvals`, { headers: {} }).then((r) => r.json());
    assert.ok(listRes.approvals.some((a) => a.id === write.receipt.approvalId));

    // 6) Owner godkänner → exakt candidate-WRITE körs
    const approveRes = await fetch(`${base}/api/v1/staff/approvals/${write.receipt.approvalId}/approve`, { method: 'POST' });
    const approveBody = await approveRes.json();
    assert.equal(approveRes.status, 200);
    assert.equal(approveBody.receipt.ok, true);
    assert.equal(approveBody.receipt.status, 'executed');
    assert.equal(approveBody.receipt.approver, 'owner');
    assert.equal(approveBody.receipt.canonicalIntegrity, 'PRISTINE');
    assert.ok(approveBody.receipt.candidateCommit);

    // 7) canonical checkout orörd (byte-identisk)
    assert.equal(fs.readFileSync(path.join(canonicalRoot, 'pilot-fixture', 'index.md'), 'utf8'), original);
    assert.equal(approvalStore.get(write.receipt.approvalId).status, 'EXECUTED');
  } finally {
    await new Promise((r) => server.close(r));
  }
});
