const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const INDEX_PATH = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');
const { validateHtmlStructure } = require(
  path.join(ROOT, 'scripts', 'check-major-arcana-preview-html.js')
);

test('major arcana preview HTML har balanserad struktur för kritiska containrar', () => {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');
  const errors = validateHtmlStructure(source, 'public/major-arcana-preview/index.html');

  assert.deepEqual(errors, [], 'Previewens statiska HTML ska inte ha oavslutade panelcontainrar.');
});

test('major arcana preview HTML-gate fångar saknad stängning innan pre-commit', () => {
  const brokenHtml = [
    '<main class="preview-shell">',
    '  <section class="focus-conversation-layout">',
    '    <div class="focus-conversation">',
    '  </section>',
    '</main>',
  ].join('\n');

  const errors = validateHtmlStructure(brokenHtml, 'broken.html');

  assert.ok(
    errors.some((error) => error.includes('closing </section> does not match <div>')),
    'HTML-gaten ska fånga fel nästlad stängning i previewens work surface-struktur.'
  );
});

test('check:syntax kör major arcana preview HTML-gaten', () => {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));

  assert.match(
    packageJson.scripts['check:syntax'],
    /node \.\/scripts\/check-major-arcana-preview-html\.js/,
    'check:syntax ska köra previewens HTML-strukturgate utöver JS-syntax.'
  );
});
