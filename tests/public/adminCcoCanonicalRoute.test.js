const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ADMIN_HTML = path.join(ROOT, 'public', 'admin.html');
const ADMIN_JS = path.join(ROOT, 'public', 'admin.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('admin#cco embeds canonical konversationer.html surface', () => {
  const html = read(ADMIN_HTML);
  const js = read(ADMIN_JS);

  assert.match(html, /id="ccoPreviewEmbedFrame"/);
  assert.match(html, /data-src="\/konversationer\.html"/);
  assert.doesNotMatch(html, /data-src="\/major-arcana-preview/);

  assert.match(js, /const CCO_PREVIEW_PRIMARY_PATH = '\/konversationer\.html';/);
  assert.match(js, /const CCO_PREVIEW_EMBED_SRC = '\/konversationer\.html';/);
  assert.match(js, /ccoWorkspaceSection:\s*'#cco'/);
});

test('admin CCO embed is ensured whenever ccoWorkspaceSection is active', () => {
  const js = read(ADMIN_JS);
  assert.match(
    js,
    /if \(isCco\) \{\s*ensureCcoPreviewEmbed\(\);\s*\}/,
    'setActiveSectionGroup must load konversationer.html even when CCO was already active'
  );
  assert.doesNotMatch(
    js,
    /if \(enteringCco\) \{\s*ensureCcoPreviewEmbed\(\);\s*\}/,
    'loading only on entering CCO can leave #cco active with a blank/about:blank iframe after auth changes'
  );
});
