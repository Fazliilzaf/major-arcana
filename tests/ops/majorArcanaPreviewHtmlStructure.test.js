const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const ADMIN_PATH = path.join(ROOT, 'public', 'admin.html');
const INDEX_PATH = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');
const V2_CSS_PATH = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-conversations-v2.css');
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

test('admin och V2-preview har inga externa fontresurser och behåller systemfont-fallback', () => {
  const adminSource = fs.readFileSync(ADMIN_PATH, 'utf8');
  const previewSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const v2Css = fs.readFileSync(V2_CSS_PATH, 'utf8');

  [adminSource, previewSource].forEach((source) => {
    assert.doesNotMatch(
      source,
      /https:\/\/fonts\.(?:googleapis|gstatic)\.com/i,
      'Admin/V2-preview får inte vara beroende av externa Google Fonts under laddning eller handoff.'
    );
  });
  assert.match(
    adminSource,
    /font-family:\s*["']Jost["'],\s*Inter,\s*-apple-system,\s*BlinkMacSystemFont,/m,
    'Admin ska behålla sin befintliga systemfont-fallback när externa fonts är borttagna.'
  );
  assert.match(
    v2Css,
    /font-family:\s*Inter,\s*-apple-system,\s*system-ui,\s*sans-serif;/m,
    'V2 ska behålla en lokal systemfont-fallback när externa fonts är borttagna.'
  );
});
