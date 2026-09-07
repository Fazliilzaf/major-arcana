'use strict';

/**
 * WP-010 B-1 + B-2 — narrow blocker remediation tests.
 *
 * B-1: approval snapshot binds EXACT candidate CONTENT (SHA-256 per file), inte
 *      bara changedFiles/diffstat. Två materiellt olika kandidat-tillstånd får
 *      aldrig samma snapshot-hash.
 * B-2: task_id är en identifierare, inte en sökväg. Strikt validering +
 *      realpath-containment + canonical-protection. CANONICAL MUST NEVER MUTATE.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createCmoRepoAdapter } = require('../../src/security/cmoRepoAdapter');
const { createApprovalRequestStore } = require('../../src/security/approvalRequestStore');
const {
  isValidTaskId,
  resolveTaskWorktreeDir,
  ensureCanonicalCheckout,
  getHeadSha,
  getContentSnapshotEntries,
} = require('../../src/security/repoWorktree');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'wp010b1b2-')); }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function sha256(buf) { return require('node:crypto').createHash('sha256').update(buf).digest('hex'); }

function makeFixtureRepo() {
  const dir = tmpdir();
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'index.md'), '# Rubrik X\n\nPilot.\n');
  git(dir, ['add', '.']);
  git(dir, ['-c', 'user.email=t@t.se', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return { dir, branch: git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) };
}

const FIXTURE_REPOS = (fixture) => ({
  'pilot-fixture': {
    repoId: 'pilot-fixture', gitUrl: fixture.dir, defaultBranch: fixture.branch,
    canonicalHead: null, buildCommands: [], previewCommands: [['node', '-e', "console.log('ok')"]],
  },
});

const ACTOR = { userId: 'anna', role: 'PERSONAL' };
const TENANT = 'hair-tp-clinic';

/**
 * DRAFT en ändring, föreslå write_candidate och returnera kontexten (adapter,
 * approvalStore, approval, worktreeDir, canonicalDir) för mutation/check.
 */
async function proposeCandidate({ content = '# Rubrik Y\n', taskId = 'task-b1', extra = [] } = {}) {
  const fixture = makeFixtureRepo();
  const canonicalRoot = tmpdir();
  const worktreesRoot = tmpdir();
  const repos = FIXTURE_REPOS(fixture);
  const adapter = createCmoRepoAdapter({ canonicalRoot, worktreesRoot, resolveRepoFn: (id) => repos[id] || null });
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'approvals.json') });

  const draft = adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.content.draft',
    args: { repo_id: 'pilot-fixture', path: 'index.md', content }, actor: ACTOR, tenantId: TENANT, taskId,
  });
  assert.equal(draft.ok, true);
  const worktreeDir = draft.worktree;
  for (const f of extra) fs.writeFileSync(path.join(worktreeDir, f.path), f.content);

  const proposal = await adapter.proposeWriteCandidate({
    repoId: 'pilot-fixture', taskId, args: { path: 'index.md' }, actor: ACTOR, tenantId: TENANT, approvalStore,
  });
  assert.equal(proposal.status, 'pending_approval');
  const approval = approvalStore.get(proposal.approvalId);
  return { fixture, canonicalRoot, worktreesRoot, adapter, approvalStore, approval, worktreeDir, canonicalDir: path.join(canonicalRoot, 'pilot-fixture'), taskId };
}

// ══════════════════════════════════════════════════════════════════════════
// B-1 — content-bound snapshot
// ══════════════════════════════════════════════════════════════════════════

test('B1-T1: godkänd tracked-kandidat → oförändrad kandidat exekveras', async () => {
  const ctx = await proposeCandidate();
  await ctx.approvalStore.approve(ctx.approval.id, { approver: 'owner' });
  const receipt = await ctx.adapter.executeApprovedWrite({ approvalId: ctx.approval.id, approvalStore: ctx.approvalStore });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, 'executed');
  assert.ok(receipt.candidateCommit);
});

test('B1-T2: tracked fil ändrad efter proposal (samma radantal) → DENY', async () => {
  const ctx = await proposeCandidate({ content: '# Rubrik Y\n\nPilot ändrad.\n' });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'index.md'), '# Rubrik Z\n\nPilot ändrad.\n');
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'snapshot_mismatch');
});

test('B1-T3: tracked fil ändrad men samma diffstat → DENY', async () => {
  const ctx = await proposeCandidate({ content: 'AAAA\nBBBB\n' });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'index.md'), 'CCCC\nDDDD\n');
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'snapshot_mismatch');
});

test('B1-T4: untracked fil överskriven efter proposal → DENY', async () => {
  const ctx = await proposeCandidate({ extra: [{ path: 'new.txt', content: 'AAA' }] });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'new.txt'), 'BBB');
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'snapshot_mismatch');
});

test('B1-T5: extra untracked fil tillagd efter proposal → DENY', async () => {
  const ctx = await proposeCandidate();
  fs.writeFileSync(path.join(ctx.worktreeDir, 'extra.txt'), 'NEW');
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, false);
});

test('B1-T6: fil borttagen efter proposal → DENY', async () => {
  const ctx = await proposeCandidate({ extra: [{ path: 'new.txt', content: 'AAA' }] });
  fs.rmSync(path.join(ctx.worktreeDir, 'new.txt'));
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, false);
});

test('B1-T7: ändrad fil omdöpt efter proposal → DENY', async () => {
  const ctx = await proposeCandidate();
  fs.renameSync(path.join(ctx.worktreeDir, 'index.md'), path.join(ctx.worktreeDir, 'renamed.md'));
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, false);
});

test('B1-T8: kandidat får extra commit efter approval → DENY', async () => {
  const ctx = await proposeCandidate();
  fs.writeFileSync(path.join(ctx.worktreeDir, 'index.md'), '# Rubrik W\n');
  git(ctx.worktreeDir, ['add', '-A']);
  git(ctx.worktreeDir, ['-c', 'user.email=t@t.se', '-c', 'user.name=t', 'commit', '-qm', 'extra']);
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, false);
});

test('B1-T9: base SHA ändras → DENY (base_sha_changed)', async () => {
  const ctx = await proposeCandidate();
  fs.writeFileSync(path.join(ctx.canonicalDir, 'other.md'), 'drift');
  git(ctx.canonicalDir, ['add', '-A']);
  git(ctx.canonicalDir, ['-c', 'user.email=t@t.se', '-c', 'user.name=t', 'commit', '-qm', 'drift']);
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'base_sha_changed');
});

test('B1-T10: samma exakta innehåll förblir exekverbart', async () => {
  const ctx = await proposeCandidate({ content: '# Rubrik Y\n' });
  const check = ctx.adapter.checkCandidateSnapshot(ctx.approval);
  assert.equal(check.ok, true);
  await ctx.approvalStore.approve(ctx.approval.id, { approver: 'owner' });
  const receipt = await ctx.adapter.executeApprovedWrite({ approvalId: ctx.approval.id, approvalStore: ctx.approvalStore });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, 'executed');
});

test('B1-T11: approval kan inte exekveras från annan worktree (worktreeTaskId-bindning)', async () => {
  const ctx = await proposeCandidate({ taskId: 'task-a' });
  const tampered = { ...ctx.approval, worktreeTaskId: 'task-other' };
  const check = ctx.adapter.checkCandidateSnapshot(tampered);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'snapshot_mismatch');
});

test('B1-T12: receipt approvedSnapshotHash = exakt content-snapshot', async () => {
  const ctx = await proposeCandidate({ content: '# Rubrik Y\n' });
  await ctx.approvalStore.approve(ctx.approval.id, { approver: 'owner' });
  const receipt = await ctx.adapter.executeApprovedWrite({ approvalId: ctx.approval.id, approvalStore: ctx.approvalStore });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.approvedSnapshotHash, ctx.approval.snapshotHash);
  assert.equal(ctx.approvalStore.get(ctx.approval.id).snapshotHash, ctx.approval.snapshotHash);
});

// ══════════════════════════════════════════════════════════════════════════
// B-2 — task_id path traversal / canonical worktree escape
// ══════════════════════════════════════════════════════════════════════════

test('B2-T1: giltig genererad task_id → worktree fungerar', () => {
  assert.equal(isValidTaskId(require('node:crypto').randomUUID()), true);
  assert.equal(isValidTaskId('task-1'), true);
  assert.equal(isValidTaskId('t1'), true);
});

test('B2-T2..T7: traversal/absolut/separator/encoded/malformed → invalid_task_id', () => {
  const bad = [
    '../canonical', '../../..', '..', '.', '/abs/path', 'a/b', 'a\\b',
    '..%2fcanonical', '%2e%2e', 'file:x', 'a:b', '', '   ', 'a b',
  ];
  for (const t of bad) {
    assert.equal(isValidTaskId(t), false, `förväntades ogiltig: ${JSON.stringify(t)}`);
    const r = resolveTaskWorktreeDir({ worktreesRoot: tmpdir(), canonicalDir: tmpdir(), taskId: t });
    assert.equal(r.ok, false, `förväntades DENY: ${JSON.stringify(t)}`);
    assert.equal(r.reason, 'invalid_task_id', `fel reason för ${JSON.stringify(t)}`);
  }
});

test('B2-T8: symlink i worktreesRoot pekar utanför → DENY', () => {
  const root = tmpdir();
  const outside = tmpdir();
  const link = path.join(root, 'escape');
  fs.symlinkSync(outside, link);
  const r = resolveTaskWorktreeDir({ worktreesRoot: root, canonicalDir: tmpdir(), taskId: 'escape' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'symlink_escape');
});

test('B2-T9: symlink till canonical → DENY', () => {
  const root = tmpdir();
  const canonicalRoot = tmpdir();
  const canonicalDir = path.join(canonicalRoot, 'pilot-fixture');
  fs.mkdirSync(canonicalDir, { recursive: true });
  const link = path.join(root, 'evil');
  fs.symlinkSync(canonicalDir, link);
  const r = resolveTaskWorktreeDir({ worktreesRoot: root, canonicalDir, taskId: 'evil' });
  assert.equal(r.ok, false);
  // Symlink till canonical ligger utanför root → symlink_escape (fail closed);
  // canonical-skyddet ger worktree_is_canonical när canonical ligger i root.
  assert.ok(['symlink_escape', 'worktree_is_canonical'].includes(r.reason), `oväntad reason: ${r.reason}`);
});

test('B2-T10: task path lika med canonical → DENY', () => {
  const canonicalRoot = tmpdir();
  const canonicalDir = path.join(canonicalRoot, 'pilot-fixture');
  fs.mkdirSync(canonicalDir, { recursive: true });
  // worktreesRoot = canonicalRoot, taskId = 'pilot-fixture' → candidate == canonicalDir.
  const r = resolveTaskWorktreeDir({ worktreesRoot: canonicalRoot, canonicalDir, taskId: 'pilot-fixture' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'worktree_is_canonical');
});

test('B2-T11/T12/T14: DRAFT/PREVIEW/WRITE med invalid task_id → DENY, zero mutation', async () => {
  const fixture = makeFixtureRepo();
  const canonicalRoot = tmpdir();
  const canonicalDir = path.join(canonicalRoot, 'pilot-fixture');
  const repos = FIXTURE_REPOS(fixture);
  const adapter = createCmoRepoAdapter({ canonicalRoot, worktreesRoot: tmpdir(), resolveRepoFn: (id) => repos[id] || null });
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'approvals.json') });

  // Canonical checkout måste INTE ens skapas av en invalid task_id (validation
  // körs före ensureCanonicalCheckout) → zero mutation.
  const draft = adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.content.draft',
    args: { repo_id: 'pilot-fixture', path: 'index.md', content: 'x' }, actor: ACTOR, tenantId: TENANT,
    taskId: '../canonical',
  });
  assert.equal(draft.ok, false);
  assert.equal(draft.reason, 'invalid_task_id');
  assert.equal(fs.existsSync(canonicalDir), false, 'canonical checkout får inte skapas av invalid task_id');

  const proposal = await adapter.proposeWriteCandidate({
    repoId: 'pilot-fixture', taskId: '../canonical', args: { path: 'index.md' }, actor: ACTOR, tenantId: TENANT, approvalStore,
  });
  assert.equal(proposal.ok, false);
  assert.equal(proposal.reason, 'invalid_task_id');
  assert.equal(approvalStore.listAll().length, 0, 'ingen approval-request skapas av invalid task_id');
});

test('B2-T13: WRITE proposal med invalid task_id → ingen approval-request', async () => {
  const fixture = makeFixtureRepo();
  const repos = FIXTURE_REPOS(fixture);
  const adapter = createCmoRepoAdapter({ canonicalRoot: tmpdir(), worktreesRoot: tmpdir(), resolveRepoFn: (id) => repos[id] || null });
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'approvals.json') });
  const proposal = await adapter.proposeWriteCandidate({
    repoId: 'pilot-fixture', taskId: '/etc/passwd', args: { path: 'index.md' }, actor: ACTOR, tenantId: TENANT, approvalStore,
  });
  assert.equal(proposal.ok, false);
  assert.equal(proposal.reason, 'invalid_task_id');
  assert.equal(approvalStore.listAll().length, 0);
});

test('B2-T15 + canonical integrity: canonical förblir PRISTINE efter alla attacker', async () => {
  const fixture = makeFixtureRepo();
  const canonicalRoot = tmpdir();
  const canonicalDir = path.join(canonicalRoot, 'pilot-fixture');
  const repos = FIXTURE_REPOS(fixture);
  ensureCanonicalCheckout({ repo: repos['pilot-fixture'], canonicalDir });

  const headBefore = getHeadSha(canonicalDir);
  const filesBefore = { 'index.md': fs.readFileSync(path.join(canonicalDir, 'index.md'), 'utf8') };

  const adapter = createCmoRepoAdapter({ canonicalRoot, worktreesRoot: tmpdir(), resolveRepoFn: (id) => repos[id] || null });
  const approvalStore = await createApprovalRequestStore({ filePath: path.join(tmpdir(), 'approvals.json') });

  const attacks = ['../canonical', '../../..', '/abs', 'a/b', 'a\\b', '..%2fcanonical', '..'];
  for (const taskId of attacks) {
    adapter.executeRepoTask({
      repoId: 'pilot-fixture', tool: 'cmo.content.draft',
      args: { repo_id: 'pilot-fixture', path: 'index.md', content: 'evil' }, actor: ACTOR, tenantId: TENANT, taskId,
    });
    await adapter.proposeWriteCandidate({
      repoId: 'pilot-fixture', taskId, args: { path: 'index.md' }, actor: ACTOR, tenantId: TENANT, approvalStore,
    });
  }

  assert.equal(getHeadSha(canonicalDir), headBefore, 'canonical HEAD oförändrad');
  assert.equal(fs.readFileSync(path.join(canonicalDir, 'index.md'), 'utf8'), filesBefore['index.md'], 'canonical fil oförändrad');
  assert.equal(git(canonicalDir, ['status', '--porcelain']), '', 'canonical working tree orört');
  assert.equal(approvalStore.listAll().length, 0, 'inga approval-requests från attacker');
});

// ══════════════════════════════════════════════════════════════════════════
// B-1 determinism: content-fingerprints är stabila och innehållsbundna
// ══════════════════════════════════════════════════════════════════════════

test('B1 content-fingerprint: ändrat innehåll ger olika SHA, sortering deterministisk', () => {
  const fixture = makeFixtureRepo();
  const canonicalRoot = tmpdir();
  const canonicalDir = path.join(canonicalRoot, 'pilot-fixture');
  const repos = FIXTURE_REPOS(fixture);
  ensureCanonicalCheckout({ repo: repos['pilot-fixture'], canonicalDir });
  const baseSha = getHeadSha(canonicalDir);

  const { createTaskWorktree } = require('../../src/security/repoWorktree');
  const wt = createTaskWorktree({ canonicalDir, worktreesRoot: tmpdir(), taskId: 't-det', baseSha });

  fs.writeFileSync(path.join(wt, 'index.md'), '# A\n');
  fs.writeFileSync(path.join(wt, 'z.txt'), 'zzz');
  const entriesA = getContentSnapshotEntries(wt);

  fs.writeFileSync(path.join(wt, 'index.md'), '# B\n');
  const entriesB = getContentSnapshotEntries(wt);

  assert.notDeepEqual(entriesA, entriesB, 'olika innehåll → olika fingerprints');
  const aHash = sha256(JSON.stringify(entriesA));
  const bHash = sha256(JSON.stringify(entriesB));
  assert.notEqual(aHash, bHash);
  // Determinism: samma tillstånd → identiska entries (inkl. sortering).
  assert.deepEqual(entriesB, getContentSnapshotEntries(wt));
  // Båda filerna (index.md + z.txt) ska vara representerade och sorterade.
  assert.equal(entriesA.map((e) => e.path).join(','), 'index.md,z.txt');
});
