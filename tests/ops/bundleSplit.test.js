const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PREVIEW_DIR = path.join(ROOT, 'public', 'major-arcana-preview');
const FULL_MANIFEST = path.join(ROOT, 'bin', 'bundle-manifest.json');
const DEFERRED_MANIFEST = path.join(ROOT, 'bin', 'bundle-manifest-staff-deferred.json');

function readSources(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.sources || [];
}

test('staff-deferred manifest är delmängd av full manifest och filer finns', () => {
  const fullSources = readSources(FULL_MANIFEST);
  const deferredSources = readSources(DEFERRED_MANIFEST);
  const fullSet = new Set(fullSources);

  assert.ok(deferredSources.length > 0, 'deferred manifest ska ha minst en fil');
  assert.ok(
    deferredSources.every((src) => fullSet.has(src)),
    'alla deferred-filer ska finnas i full manifest'
  );

  const missingOnDisk = deferredSources.filter((src) => !fs.existsSync(path.join(PREVIEW_DIR, src)));
  assert.deepEqual(missingOnDisk, [], 'deferred source-filer ska finnas på disk');
});

test('deferred-filer kommer efter app.js i full manifest-ordning', () => {
  const fullSources = readSources(FULL_MANIFEST);
  const deferredSources = readSources(DEFERRED_MANIFEST);
  const appJsIndex = fullSources.indexOf('app.js');

  assert.ok(appJsIndex >= 0, 'full manifest ska innehålla app.js');

  for (const src of deferredSources) {
    const idx = fullSources.indexOf(src);
    assert.ok(idx > appJsIndex, `${src} ska komma efter app.js i full manifest`);
  }

  const deferredInFullOrder = fullSources.filter((src) => deferredSources.includes(src));
  assert.deepEqual(
    deferredInFullOrder,
    deferredSources,
    'deferred manifest ska behålla samma relativa ordning som i full manifest'
  );
});

test('staff-core + deferred täcker full manifest utan överlapp', () => {
  const fullSources = readSources(FULL_MANIFEST);
  const deferredSources = readSources(DEFERRED_MANIFEST);
  const deferredSet = new Set(deferredSources);
  const coreSources = fullSources.filter((src) => !deferredSet.has(src));

  assert.equal(
    coreSources.length + deferredSources.length,
    fullSources.length,
    'core + deferred ska summera till full manifest'
  );
});
