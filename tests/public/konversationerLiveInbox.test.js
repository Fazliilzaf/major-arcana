const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');

function readHtml() {
  return fs.readFileSync(htmlPath, 'utf8');
}

function liveScript(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1]
  );
  const script = scripts.find((source) => source.includes('LIVE_WORKLIST_URL'));
  assert.ok(script, 'konversationer.html should contain the live inbox script');
  return script;
}

test('konversationer live inbox uses kons worklist consumer as first real data source', () => {
  const html = readHtml();

  assert.match(html, /const LIVE_MAILBOX_IDS = \['kons@hairtpclinic\.com'\]/);
  assert.match(html, /\/api\/v1\/cco\/runtime\/worklist\/consumer\?mailboxIds=/);
  assert.match(html, /credentials:\s*'include'/);
  assert.match(html, /headers:\s*\{\s*Accept:\s*'application\/json'\s*\}/);
  assert.doesNotMatch(html, /const THREADS\s*=/, 'old demo THREADS primary source must not remain');
  assert.match(html, /const DEMO_THREADS\s*=/, 'demo fallback can remain for file preview only');
});

test('konversationer inbox tabs are explicit filters for live rows', () => {
  const html = readHtml();

  for (const tab of ['alla', 'olasta', 'bokning', 'vip']) {
    assert.match(html, new RegExp(`class="inbox-tab[^"]*" data-tab="${tab}"`));
  }
  assert.match(html, /function threadMatchesTab\(thread, tabId\)/);
  assert.match(html, /function threadMatchesLane\(thread, laneId\)/);
  assert.match(html, /activeTab:\s*currentInboxTab/);
  assert.match(html, /activeLane:\s*currentLane/);
});

test('konversationer live inbox script parses', () => {
  const html = readHtml();
  assert.doesNotThrow(() => new Function(liveScript(html)));
});
