'use strict';

const fs = require('node:fs');

function normalizeBuildCommit(value) {
  const commit = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(commit) ? commit : '';
}

function resolveBuildCommit({ env = process.env, execFileSync } = {}) {
  const fromEnvironment = normalizeBuildCommit(env.RENDER_GIT_COMMIT || env.GIT_COMMIT);
  if (fromEnvironment) return fromEnvironment;

  if (typeof execFileSync !== 'function') return '';
  try {
    return normalizeBuildCommit(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }));
  } catch (_error) {
    return '';
  }
}

function readPreviewBuildManifest(filePath, { readFileSync = fs.readFileSync } = {}) {
  try {
    const manifest = JSON.parse(readFileSync(filePath, 'utf8'));
    return manifest && typeof manifest === 'object' ? manifest : null;
  } catch (_error) {
    return null;
  }
}

function referencedBundleFiles(html) {
  const files = new Set();
  const source = String(html || '');
  const pattern = /app\.bundle(?:\.(?:staff-core|staff-deferred))?\.[a-f0-9]{6,}\.min\.js/g;
  let match;
  while ((match = pattern.exec(source)) !== null) files.add(match[0]);
  return [...files];
}

function expectedBundleFiles(manifest) {
  const files = [manifest?.filename, manifest?.staffCore?.filename, manifest?.staffDeferred?.filename]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(files)];
}

function verifyPreviewBuildIdentity({ runtimeCommit, manifest, html }) {
  const expectedCommit = normalizeBuildCommit(runtimeCommit);
  if (!expectedCommit) return { ok: true, mode: 'local' };

  const manifestCommit = normalizeBuildCommit(manifest?.buildCommit);
  if (!manifestCommit) return { ok: false, reason: 'manifest_build_commit_missing' };
  if (manifestCommit !== expectedCommit) {
    return { ok: false, reason: 'manifest_runtime_commit_mismatch' };
  }

  const expectedFiles = expectedBundleFiles(manifest);
  if (!expectedFiles.length) return { ok: false, reason: 'manifest_bundle_files_missing' };
  const referencedFiles = referencedBundleFiles(html);
  const missing = expectedFiles.filter((file) => !referencedFiles.includes(file));
  if (missing.length) return { ok: false, reason: 'html_manifest_bundle_mismatch', missing };

  return { ok: true, mode: 'verified', buildCommit: manifestCommit, bundleFiles: expectedFiles };
}

module.exports = {
  expectedBundleFiles,
  normalizeBuildCommit,
  readPreviewBuildManifest,
  referencedBundleFiles,
  resolveBuildCommit,
  verifyPreviewBuildIdentity,
};
