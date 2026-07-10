const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ADMIN_HTML = path.join(ROOT, 'public', 'admin.html');
const ADMIN_JS = path.join(ROOT, 'public', 'admin.js');
const SERVER_JS = path.join(ROOT, 'server.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('admin#cco embeds canonical konversationer.html surface', () => {
  const html = read(ADMIN_HTML);
  const js = read(ADMIN_JS);

  assert.match(html, /id="ccoPreviewEmbedFrame"/);
  // Iframe-URL:en bär build-id som query så varje deploy ger en ny URL —
  // annars serverar CDN/browser gammal konversationer.html efter deploy.
  // __ARCANA_UI_BUILD__ ersätts med aktuell build vid rendering av admin.html.
  assert.match(html, /data-src="\/konversationer\.html\?v=__ARCANA_UI_BUILD__&amp;embed=admin"/);
  assert.doesNotMatch(html, /data-src="\/major-arcana-preview/);

  assert.match(js, /const CCO_PREVIEW_PRIMARY_PATH = '\/konversationer\.html';/);
  assert.match(js, /const CCO_PREVIEW_EMBED_SRC = '\/konversationer\.html';/);
  assert.match(js, /ccoWorkspaceSection:\s*'#cco'/);
});

test('admin CCO embed is ensured whenever ccoWorkspaceSection is active', () => {
  const js = read(ADMIN_JS);
  assert.match(
    js,
    /function setActiveSectionGroup[\s\S]*?const isCco = String\(groupId \|\| ''\)\.trim\(\) === 'ccoWorkspaceSection';/,
    'setActiveSectionGroup must define isCco locally before it is used'
  );
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

test('konversationer.html embed is served no-store so deploys are not cached stale', () => {
  const server = read(SERVER_JS);
  // Den inbäddade CCO-ytan får en egen no-store-gren i express.static före den
  // generiska HTML-grenen, annars serveras gammal JS efter en deploy.
  assert.match(
    server,
    /\/\\\/konversationer\\\.html\$\/i\.test\(safe\)[\s\S]*?no-store, no-cache, must-revalidate/,
    'konversationer.html must get a no-store Cache-Control branch'
  );
  const konvBranch = server.indexOf('/\\/konversationer\\.html$/i.test(safe)');
  const genericHtmlBranch = server.indexOf('/\\.html?$/i.test(safe)');
  assert.ok(konvBranch !== -1, 'konversationer.html cache branch must exist');
  assert.ok(
    konvBranch < genericHtmlBranch,
    'konversationer.html branch must precede the generic .html branch to win'
  );
});

test('admin dashboard stops the self-feeding *.read audit refresh loop', () => {
  const js = read(ADMIN_JS);

  // Läs-audits får aldrig trigga en refresh (annars 429-storm).
  assert.match(
    js,
    /function shouldRefreshFromAuditAction[\s\S]*?normalized\.endsWith\('\.read'\)\s*\)\s*return false/,
    'shouldRefreshFromAuditAction måste blockera alla *.read-actions'
  );
  // SSE-backoffen får inte nollställas direkt vid 200 — bara efter ett stabilitetsfönster.
  assert.match(js, /DASHBOARD_STREAM_STABILITY_MS/);
  assert.match(
    js,
    /stabilityTimer = setTimeout\(\(\) => \{[\s\S]*?dashboardStreamRetryMs = DASHBOARD_STREAM_RETRY_MIN_MS/,
    'backoff ska nollställas i ett stabilitetsfönster, inte direkt vid open'
  );
  // Jitter mot thundering herd.
  assert.match(js, /jitteredMs = delayMs \+ Math\.floor\(Math\.random\(\) \* delayMs \* 0\.5\)/);
});

test('admin shell is mounted before static public directory redirects', () => {
  const server = read(SERVER_JS);
  const adminMount = server.indexOf('app.use(createAdminRouter({ sendAdminHtml }))');
  const staticMount = server.indexOf("express.static('public'");

  assert.notEqual(adminMount, -1, 'server must mount createAdminRouter');
  assert.notEqual(staticMount, -1, 'server must mount public static assets');
  assert.ok(
    adminMount < staticMount,
    'admin shell must mount before express.static, otherwise public/admin/ redirects /admin -> /admin/'
  );
});
