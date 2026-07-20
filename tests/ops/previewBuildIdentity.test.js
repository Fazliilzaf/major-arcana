'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveBuildCommit, verifyPreviewBuildIdentity } = require('../../src/ops/previewBuildIdentity');

const COMMIT = 'b7c6825dbf4ad9a6c45592d61f560f222a0cbc2f';
const BUNDLES = {
  filename: 'app.bundle.abcdef1234.min.js',
  staffCore: { filename: 'app.bundle.staff-core.123456abcd.min.js' },
  staffDeferred: { filename: 'app.bundle.staff-deferred.987654fedc.min.js' },
};

function htmlFor(manifest = BUNDLES) {
  return [manifest.filename, manifest.staffCore.filename, manifest.staffDeferred.filename]
    .map((file) => `<script src="./${file}"></script>`)
    .join('\n');
}

test('preview assets are verified only when deployment commit and manifest agree', () => {
  const result = verifyPreviewBuildIdentity({
    runtimeCommit: COMMIT,
    manifest: { ...BUNDLES, buildCommit: COMMIT },
    html: htmlFor(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'verified');
  assert.equal(result.buildCommit, COMMIT);
});

test('stale bundle html fails closed even when its manifest has a current commit', () => {
  const result = verifyPreviewBuildIdentity({
    runtimeCommit: COMMIT,
    manifest: { ...BUNDLES, buildCommit: COMMIT },
    html: '<script src="./app.bundle.deadbeef99.min.js"></script>',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'html_manifest_bundle_mismatch');
  assert.deepEqual(result.missing, [
    BUNDLES.filename,
    BUNDLES.staffCore.filename,
    BUNDLES.staffDeferred.filename,
  ]);
});

test('missing or mismatched manifest identity cannot pass a production deployment', () => {
  const missing = verifyPreviewBuildIdentity({ runtimeCommit: COMMIT, manifest: BUNDLES, html: htmlFor() });
  const stale = verifyPreviewBuildIdentity({
    runtimeCommit: COMMIT,
    manifest: { ...BUNDLES, buildCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    html: htmlFor(),
  });
  assert.deepEqual(missing, { ok: false, reason: 'manifest_build_commit_missing' });
  assert.deepEqual(stale, { ok: false, reason: 'manifest_runtime_commit_mismatch' });
});

test('a manifest without bundle files cannot pass a production deployment', () => {
  const result = verifyPreviewBuildIdentity({
    runtimeCommit: COMMIT,
    manifest: { buildCommit: COMMIT },
    html: '',
  });
  assert.deepEqual(result, { ok: false, reason: 'manifest_bundle_files_missing' });
});

test('build resolves the Render commit before falling back to the local git revision', () => {
  const resolved = resolveBuildCommit({
    env: { RENDER_GIT_COMMIT: COMMIT },
    execFileSync() { throw new Error('must not run git when Render identity is present'); },
  });
  assert.equal(resolved, COMMIT);
});
