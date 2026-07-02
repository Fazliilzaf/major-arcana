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

test('konversationer live row opens real conversation messages endpoint', () => {
  const html = readHtml();

  assert.match(html, /function openConversationThread\(thread\)/);
  assert.match(
    html,
    /\/api\/v1\/cco\/runtime\/conversation\/\$\{encodeURIComponent\(thread\.conversationKey\)\}\/messages/
  );
  assert.match(html, /function renderThreadMessages\(thread, messages\)/);
  assert.match(html, /data-thread-id="\$\{escapeHtml\(t\.id\)\}"/);
  assert.match(html, /Mailbox-spår:/);
  assert.match(
    html,
    /const firstThread = currentThreads\.find\(\(thread\) => thread\.conversationKey\)/
  );
});

test('konversationer exposes selected live thread as Svarstudio context', () => {
  const html = readHtml();

  assert.match(html, /window\.CCOLiveConversationContext\s*=/);
  assert.match(html, /getContext\(\)\s*\{/);
  assert.match(html, /function buildSvarstudioLiveContext\(thread, messages\)/);
  assert.match(html, /selectedLiveThread/);
  assert.match(html, /selectedLiveMessages/);
  assert.match(html, /latestMessages:\s*normalizedMessages\.slice\(-6\)/);
  assert.match(html, /conversationKey:\s*thread\.conversationKey/);
  assert.match(html, /mailboxTrail/);
  assert.match(html, /window\.dispatchEvent\(new CustomEvent\('cco:live-conversation-context'/);
  assert.match(html, /setSvarstudioLiveContext\(thread, messages\)/);
});

test('top Svarstudio button uses same action hook as bottom bar', () => {
  const html = readHtml();

  assert.match(html, /<button class="nav-btn nav-btn--ai" type="button" data-action="svarstudio">/);
  assert.match(html, /\.nav-btn:not\(\[data-action\]\)/);
});

test('konversationer live inbox script parses', () => {
  const html = readHtml();
  assert.doesNotThrow(() => new Function(liveScript(html)));
});
