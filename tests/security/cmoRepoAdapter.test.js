'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { resolveRepo, isAllowedCommand } = require('../../src/security/cmoRepoRegistry');
const { createCmoRepoAdapter } = require('../../src/security/cmoRepoAdapter');
const {
  ensureCanonicalCheckout,
  createTaskWorktree,
  getHeadSha,
  getChanges,
  isClean,
} = require('../../src/security/repoWorktree');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'repoAdapter-')); }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

function makeFixtureRepo() {
  const dir = tmpdir();
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'index.md'), '# Rubrik X\n\nPilot.\n');
  git(dir, ['add', '.']);
  git(dir, ['-c', 'user.email=test@test.se', '-c', 'user.name=test', 'commit', '-qm', 'init']);
  const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return { dir, branch };
}

const FIXTURE_REPOS = (fixture) => ({
  'pilot-fixture': {
    repoId: 'pilot-fixture',
    gitUrl: fixture.dir,
    defaultBranch: fixture.branch,
    canonicalHead: null,
    buildCommands: [],
    previewCommands: [['node', '-e', "console.log('preview-ok')"]],
  },
});

// ── DEL C/D — registry allowlist ────────────────────────────────────────────

test('WP-009 DEL C/D: hairtpclinic-web är registrerad med verifierad canonical HEAD', () => {
  const repo = resolveRepo('hairtpclinic-web');
  assert.ok(repo);
  assert.equal(repo.gitUrl, 'https://github.com/Fazliilzaf/hairtpclinic-web.git');
  assert.equal(repo.defaultBranch, 'main');
  assert.equal(repo.canonicalHead, 'd8731111f8794959dc134b24e9beeb287163adc7');
  assert.deepEqual(repo.buildCommands[0], ['npm', 'run', 'build']);
});

test('WP-009 DEL D: godtyckligt repo-ID → null (fail-closed)', () => {
  assert.equal(resolveRepo('hairtpclinic-web-2'), null);
  assert.equal(resolveRepo('../etc'), null);
  assert.equal(resolveRepo('hair-ai-doctor'), null);
  assert.equal(resolveRepo(''), null);
});

test('WP-009 DEL F: isAllowedCommand — exakt argv-match, ingen generisk shell', () => {
  const repo = resolveRepo('hairtpclinic-web');
  assert.equal(isAllowedCommand(repo, ['npm', 'run', 'build']), true);
  assert.equal(isAllowedCommand(repo, ['npm', 'run', 'dev']), false);
  assert.equal(isAllowedCommand(repo, ['bash', '-c', 'rm -rf /']), false);
  assert.equal(isAllowedCommand(repo, ['git', 'push']), false);
});

// ── DEL E — worktree isolation ──────────────────────────────────────────────

test('WP-009 DEL E: canonical checkout → worktree → canonical orörd, ändring i worktree', () => {
  const fixture = makeFixtureRepo();
  const canonicalRoot = tmpdir();
  const canonicalDir = path.join(canonicalRoot, 'pilot-fixture');
  const repo = FIXTURE_REPOS(fixture)['pilot-fixture'];

  ensureCanonicalCheckout({ repo, canonicalDir });
  const baseSha = getHeadSha(canonicalDir);
  assert.equal(baseSha, git(fixture.dir, ['rev-parse', 'HEAD']));

  const worktreeDir = createTaskWorktree({ canonicalDir, worktreesRoot: tmpdir(), taskId: 't1', baseSha });
  fs.writeFileSync(path.join(worktreeDir, 'index.md'), '# Rubrik Y\n\nPilot ändrad.\n');

  assert.equal(isClean(canonicalDir), true, 'canonical orörd');
  assert.equal(fs.readFileSync(path.join(canonicalDir, 'index.md'), 'utf8'), '# Rubrik X\n\nPilot.\n');
  const changes = getChanges(worktreeDir, baseSha);
  assert.ok(changes.changedFiles.includes('index.md'));
  assert.match(changes.diffstat, /index\.md/);
});

// ── DEL I — acceptance (READ → DRAFT → PREVIEW, receipt v2) ─────────────────

test('WP-009 DEL I/J: acceptance — READ → DRAFT → PREVIEW i en isolerad worktree', () => {
  const fixture = makeFixtureRepo();
  const repos = FIXTURE_REPOS(fixture);
  const adapter = createCmoRepoAdapter({
    canonicalRoot: tmpdir(),
    worktreesRoot: tmpdir(),
    resolveRepoFn: (id) => repos[id] || null,
  });
  const actor = { userId: 'anna', role: 'PERSONAL' };
  const tenantId = 'hair-tp-clinic';
  const taskId = 'task-accept-1';

  // 1) READ genom allowlist (canonical).
  const read = adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.content.read',
    args: { repo_id: 'pilot-fixture', path: 'index.md' }, actor, tenantId, taskId,
  });
  assert.equal(read.ok, true);
  assert.equal(read.result.content, '# Rubrik X\n\nPilot.\n');
  assert.equal(read.canonicalIntegrity, 'PRISTINE');

  // 2) DRAFT endast i worktree.
  const draft = adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.content.draft',
    args: { repo_id: 'pilot-fixture', path: 'index.md', content: '# Rubrik Y\n\nPilot ändrad.\n' }, actor, tenantId, taskId,
  });
  assert.equal(draft.ok, true);
  assert.equal(draft.canonicalIntegrity, 'PRISTINE');
  assert.equal(fs.readFileSync(path.join(draft.worktree, 'index.md'), 'utf8'), '# Rubrik Y\n\nPilot ändrad.\n');

  // 3) PREVIEW (allowlistat kommando körs i worktreen).
  const preview = adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.website.preview',
    args: { repo_id: 'pilot-fixture', path: 'index.md' }, actor, tenantId, taskId,
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.preview.ok, true);
  assert.match(preview.preview.artifact, /preview-ok/);

  // Receipt v2-fält.
  assert.equal(preview.actor, 'anna');
  assert.equal(preview.tenant, 'hair-tp-clinic');
  assert.equal(preview.agent, 'CMO');
  assert.equal(preview.repo.repoId, 'pilot-fixture');
  assert.ok(preview.repo.baseSha.length >= 40);
  assert.equal(preview.taskId, taskId);
  assert.deepEqual(preview.filesChanged, ['index.md']);
  assert.match(preview.diffstat, /index\.md/);
  assert.equal(preview.canonicalIntegrity, 'PRISTINE');
  assert.equal(preview.status, 'ok');
});

test('WP-009 DEL I: canonical checkout byte-identisk efter hela jobbet', () => {
  const fixture = makeFixtureRepo();
  const repos = FIXTURE_REPOS(fixture);
  const canonicalRoot = tmpdir();
  const adapter = createCmoRepoAdapter({
    canonicalRoot, worktreesRoot: tmpdir(), resolveRepoFn: (id) => repos[id] || null,
  });
  const original = fs.readFileSync(path.join(fixture.dir, 'index.md'), 'utf8');
  adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.content.draft',
    args: { repo_id: 'pilot-fixture', path: 'index.md', content: '# Rubrik Y\n' },
    actor: { userId: 'anna', role: 'PERSONAL' }, tenantId: 't', taskId: 'task-2',
  });
  const canonicalFile = path.join(canonicalRoot, 'pilot-fixture', 'index.md');
  assert.equal(fs.readFileSync(canonicalFile, 'utf8'), original, 'canonical byte-identisk');
});

// ── DEL K — negative ────────────────────────────────────────────────────────

test('WP-009 DEL K: okänt repo → unknown_repo', () => {
  const adapter = createCmoRepoAdapter({ canonicalRoot: tmpdir(), worktreesRoot: tmpdir(), resolveRepoFn: (id) => null });
  const r = adapter.executeRepoTask({ repoId: 'hair-ai-doctor', tool: 'cmo.content.read', args: {}, actor: {}, tenantId: 't' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_repo');
});

test('WP-009 DEL K: path traversal i repo-task → path_escape', () => {
  const fixture = makeFixtureRepo();
  const repos = FIXTURE_REPOS(fixture);
  const adapter = createCmoRepoAdapter({ canonicalRoot: tmpdir(), worktreesRoot: tmpdir(), resolveRepoFn: (id) => repos[id] || null });
  const r = adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.content.read',
    args: { repo_id: 'pilot-fixture', path: '../etc/passwd' }, actor: { userId: 'a', role: 'PERSONAL' }, tenantId: 't',
  });
  assert.equal(r.result.ok, false);
  assert.equal(r.result.reason, 'path_escape');
});

test('WP-009 DEL K: .env i repo-task → forbidden_path', () => {
  const fixture = makeFixtureRepo();
  fs.writeFileSync(path.join(fixture.dir, '.env'), 'SECRET=1');
  git(fixture.dir, ['add', '.env']);
  git(fixture.dir, ['-c', 'user.email=t@t.se', '-c', 'user.name=t', 'commit', '-qm', 'env']);
  const repos = FIXTURE_REPOS(fixture);
  const adapter = createCmoRepoAdapter({ canonicalRoot: tmpdir(), worktreesRoot: tmpdir(), resolveRepoFn: (id) => repos[id] || null });
  const r = adapter.executeRepoTask({
    repoId: 'pilot-fixture', tool: 'cmo.content.read',
    args: { repo_id: 'pilot-fixture', path: '.env' }, actor: { userId: 'a', role: 'PERSONAL' }, tenantId: 't',
  });
  assert.equal(r.result.ok, false);
  assert.equal(r.result.reason, 'forbidden_path');
});

test('WP-009 DEL K: shell/git-push tool → unknown_tool', () => {
  const fixture = makeFixtureRepo();
  const repos = FIXTURE_REPOS(fixture);
  const adapter = createCmoRepoAdapter({ canonicalRoot: tmpdir(), worktreesRoot: tmpdir(), resolveRepoFn: (id) => repos[id] || null });
  for (const tool of ['shell.exec', 'cmo.git.push', 'cmo.content.write']) {
    const r = adapter.executeRepoTask({
      repoId: 'pilot-fixture', tool,
      args: { repo_id: 'pilot-fixture', cmd: 'rm -rf /' }, actor: { userId: 'a', role: 'PERSONAL' }, tenantId: 't',
    });
    assert.equal(r.result.ok, false, tool);
    assert.equal(r.result.reason, 'unknown_tool', tool);
  }
});
