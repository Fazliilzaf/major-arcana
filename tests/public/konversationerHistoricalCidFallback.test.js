const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer.html'),
  'utf8'
);

function fallbackSource() {
  const start = source.indexOf('      function replaceUnresolvableInlineMailAssetsForDisplay(doc)');
  const end = source.indexOf('\n      function ', start + 20);
  return source.slice(start, end);
}

test('historiska CID-luckor degraderas ärligt utan trasiga bildikoner', () => {
  const fallback = fallbackSource();

  assert.match(fallback, /doc\.body\.querySelectorAll\('img\[src\]'\)/);
  assert.match(fallback, /\^cid:/i);
  assert.match(fallback, /\^about:blank/);
  assert.match(fallback, /image\.remove\(\);/);
  assert.match(fallback, /En inlinebild saknas i det här äldre mailet\./);
  assert.match(fallback, /inlinebilder saknas i det här äldre mailet\./);
  assert.match(source, /replaceUnresolvableInlineMailAssetsForDisplay\(doc\);/);
});

test('CID-bakgrundsbilder använder samma ärliga fallback', () => {
  const fallback = fallbackSource();

  assert.match(fallback, /doc\.body\.querySelectorAll\('\[style\]'\)/);
  assert.match(fallback, /cid:/);
  assert.match(fallback, /return 'none';/);
  assert.match(source, /mail-inline-asset-missing/);
});
