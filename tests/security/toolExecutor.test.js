'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { executeCmoTool } = require('../../src/security/toolExecutor');
const { CMO_TOOLS } = require('../../src/security/cmoToolRegistry');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'toolExecutor-')); }

function ctx(over = {}) {
  return {
    userId: 'anna',
    tenantId: 'hair-tp-clinic',
    role: 'PERSONAL',
    agent: 'CMO',
    hasEntitlement: true,
    isDisabled: false,
    ...over,
  };
}

test('WP-008: READ (cmo.repo.read) → ALLOW + content i kvitto', () => {
  const root = tmpdir();
  const f = path.join(root, 'home.md');
  fs.writeFileSync(f, '# startsida', 'utf8');
  const r = executeCmoTool({ context: ctx(), tool: 'cmo.repo.read', args: { path: 'home.md' }, roots: { readRoot: root } });
  assert.equal(r.result.ok, true);
  assert.equal(r.result.content, '# startsida');
  assert.deepEqual(r.resources_read, [f]);
  assert.equal(r.gate_decisions[0].decision, 'ALLOW');
  assert.deepEqual(r.files_drafted, []);
});

test('WP-008: DRAFT (cmo.content.draft) → skriver endast i scratch, original orört', () => {
  const scratch = tmpdir();
  const canonical = tmpdir();
  const original = path.join(canonical, 'post.md');
  fs.writeFileSync(original, 'ORIGINAL', 'utf8');
  const r = executeCmoTool({
    context: ctx(),
    tool: 'cmo.content.draft',
    args: { path: 'posts/post.md', content: 'NY DRAFT' },
    roots: { readRoot: canonical, scratchRoot: scratch },
  });
  assert.equal(r.result.ok, true);
  assert.equal(r.result.summary, 'Isolerad draft skapad; original orört.');
  assert.deepEqual(r.files_drafted, [path.join(scratch, 'posts', 'post.md')]);
  assert.equal(fs.readFileSync(r.result.draftPath, 'utf8'), 'NY DRAFT');
  assert.equal(fs.readFileSync(original, 'utf8'), 'ORIGINAL');
  assert.ok(!fs.existsSync(path.join(canonical, 'posts', 'post.md')));
});

test('WP-008: PREVIEW (cmo.website.preview) → mock-artifact, ingen fil', () => {
  const r = executeCmoTool({ context: ctx(), tool: 'cmo.website.preview', args: { path: 'posts/post.md' }, roots: {} });
  assert.equal(r.result.ok, true);
  assert.ok(r.result.preview);
  assert.match(r.result.preview.note, /ingen deploy/i);
  assert.deepEqual(r.files_drafted, []);
});

test('WP-008: icke-CMO agent (CCO) → not_cmo', () => {
  const r = executeCmoTool({ context: ctx({ agent: 'CCO' }), tool: 'cmo.repo.read', args: {}, roots: {} });
  assert.deepEqual(r.result, { ok: false, reason: 'not_cmo' });
});

test('WP-008: ingen entitlement → DENY (no_entitlement)', () => {
  const r = executeCmoTool({ context: ctx({ hasEntitlement: false }), tool: 'cmo.repo.read', args: {}, roots: {} });
  assert.equal(r.result.ok, false);
  assert.equal(r.result.reason, 'no_entitlement');
});

test('WP-008: disabled staff → DENY (disabled_staff)', () => {
  const r = executeCmoTool({ context: ctx({ isDisabled: true }), tool: 'cmo.repo.read', args: {}, roots: {} });
  assert.equal(r.result.reason, 'disabled_staff');
});

test('WP-008: tenant mismatch → DENY (tenant_mismatch)', () => {
  const r = executeCmoTool({ context: ctx({ expectedTenant: 'other' }), tool: 'cmo.repo.read', args: {}, roots: {} });
  assert.equal(r.result.reason, 'tenant_mismatch');
});

test('WP-008: okänt tool (shell) → unknown_tool', () => {
  const r = executeCmoTool({ context: ctx(), tool: 'shell.exec', args: { cmd: 'rm -rf /' }, roots: {} });
  assert.deepEqual(r.result, { ok: false, reason: 'unknown_tool' });
});

test('WP-008: git push → unknown_tool (ej i registry)', () => {
  const r = executeCmoTool({ context: ctx(), tool: 'cmo.git.push', args: {}, roots: {} });
  assert.deepEqual(r.result, { ok: false, reason: 'unknown_tool' });
});

test('WP-008: kanonisk write (cmo.content.write) → unknown_tool', () => {
  const r = executeCmoTool({ context: ctx(), tool: 'cmo.content.write', args: { path: 'x', content: 'y' }, roots: {} });
  assert.deepEqual(r.result, { ok: false, reason: 'unknown_tool' });
});

test('WP-008: .env-read → forbidden_path', () => {
  const root = tmpdir();
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1', 'utf8');
  const r = executeCmoTool({ context: ctx(), tool: 'cmo.repo.read', args: { path: '.env' }, roots: { readRoot: root } });
  assert.equal(r.result.ok, false);
  assert.equal(r.result.reason, 'forbidden_path');
});

test('WP-008: path traversal → path_escape', () => {
  const root = tmpdir();
  const r = executeCmoTool({ context: ctx(), tool: 'cmo.repo.read', args: { path: '../etc/passwd' }, roots: { readRoot: root } });
  assert.equal(r.result.reason, 'path_escape');
});

test('WP-008: symlink-escape → symlink_escape', () => {
  const root = tmpdir();
  const outside = tmpdir();
  fs.writeFileSync(path.join(outside, 'data.txt'), 'hemlig', 'utf8');
  fs.symlinkSync(outside, path.join(root, 'leak'));
  const r = executeCmoTool({ context: ctx(), tool: 'cmo.repo.read', args: { path: 'leak/data.txt' }, roots: { readRoot: root } });
  assert.equal(r.result.ok, false);
  assert.equal(r.result.reason, 'symlink_escape');
});

test('WP-008/010: registry — READ/DRAFT/PREVIEW ALLOW; write_candidate REQUIRE_APPROVAL', () => {
  const root = tmpdir();
  fs.writeFileSync(path.join(root, 'a.md'), 'x', 'utf8');
  const scratch = tmpdir();
  for (const tool of Object.keys(CMO_TOOLS)) {
    const r = executeCmoTool({ context: ctx(), tool, args: { path: 'a.md', content: 'x' }, roots: { readRoot: root, scratchRoot: scratch } });
    if (tool === 'cmo.content.write_candidate') {
      assert.equal(r.gate_decisions[0].decision, 'REQUIRE_APPROVAL', tool);
      assert.equal(r.gate_decisions[0].approval, 'OWNER_APPROVAL', tool);
    } else {
      assert.equal(r.gate_decisions[0].decision, 'ALLOW', tool);
      assert.deepEqual(r.approvals_requested, [], tool);
    }
  }
});
