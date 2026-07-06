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
  assert.match(html, /headers:\s*withAdminAuthHeaders\(\{\s*Accept:\s*'application\/json'\s*\}\)/);
  assert.doesNotMatch(html, /const THREADS\s*=/, 'old demo THREADS primary source must not remain');
  assert.match(
    html,
    /const DEMO_THREADS\s*=/,
    'demo data can remain for explicit local preview only'
  );
  assert.match(html, /const STATIC_DEMO_PREVIEW\s*=/);
  assert.match(html, /window\.location\.protocol === 'file:'/);
  assert.match(html, /get\('demo'\) === '1'/);
  assert.match(
    html,
    /let currentThreads = STATIC_DEMO_PREVIEW \? DEMO_THREADS : \[\]/,
    'web/admin must start from live-only state, not demo threads'
  );
  assert.doesNotMatch(
    html,
    /visar demo tills inloggning\/data finns/,
    'web/admin must not silently fall back to demo when live fetch fails'
  );
});

test('konversationer live inbox reuses admin Bearer token for CCO API calls', () => {
  const html = readHtml();

  assert.match(html, /function adminAuthToken\(\)/);
  assert.match(html, /getItem\('ARCANA_ADMIN_TOKEN'\)/);
  assert.match(html, /function withAdminAuthHeaders\(headers = \{\}\)/);
  assert.match(html, /next\.Authorization = 'Bearer ' \+ token/);
  assert.match(html, /window\.CCOConversationAuth = \{/);
  assert.match(html, /headers:\s*withAdminAuthHeaders\(\{\s*Accept:\s*'application\/json'\s*\}\)/);
});

test('konversationer web/admin shows explicit live STOP states instead of demo fallback', () => {
  const html = readHtml();

  assert.match(html, /function renderLiveInboxStatus\(title, message, tone = 'info'\)/);
  assert.match(html, /function renderLivePaneStatus\(title, message, tone = 'info'\)/);
  assert.match(html, /Demo visas inte i admin\/webb/);
  assert.match(html, /Detta är ett STOP-läge, inte demo/);
  assert.match(html, /demo är avstängd i webb\/admin/);
});

test('konversationer inbox surfaces the exact worklist failure status instead of a generic error', () => {
  const html = readHtml();

  assert.match(html, /function describeWorklistFailure\(status\)/);
  // Varje statuskod pekar på ett eget spår (auth / roll / data / server) och
  // måste synas i UI:t så fel kan diagnosticeras utan DevTools.
  assert.match(html, /HTTP 401/);
  assert.match(html, /HTTP 403/);
  assert.match(html, /HTTP 503/);
  assert.match(html, /HTTP 500/);
  assert.match(html, /Nätverksfel — nådde inte CCO-worklist/);
  assert.match(html, /const detail = failureReason \|\| describeWorklistFailure\(failureStatus\)/);
  // STOP-strängarna får inte tappas bort av diagnostiken.
  assert.match(html, /Demo visas inte i admin\/webb/);
  assert.match(html, /Detta är ett STOP-läge, inte demo/);
  assert.match(html, /demo är avstängd i webb\/admin/);
});

test('konversationer inbox retries transient failures and recovers when the admin token arrives', () => {
  const html = readHtml();

  // Övergående lägen (token ej satt än / pipeline ej redo / nätverksglapp)
  // ska försökas igen med backoff; permanenta (403/500) visas direkt.
  assert.match(html, /const LIVE_INBOX_MAX_ATTEMPTS = 5/);
  assert.match(
    html,
    /const retriable =\s*failureStatus === 0 \|\| failureStatus === 401 \|\| failureStatus === 503/
  );
  assert.match(html, /const waitMs = Math\.min\(4000, 400 \* 2 \*\* \(liveInboxAttempt - 1\)\)/);
  assert.match(html, /liveInboxRetryTimer = setTimeout\(loadLiveInbox, waitMs\)/);
  // Admin-skalet skriver token i ett annat dokument — iframe:n lyssnar och
  // laddar om utan sidladdning.
  assert.match(
    html,
    /window\.addEventListener\('storage', \(event\) => \{[\s\S]*event\.key === 'ARCANA_ADMIN_TOKEN'[\s\S]*loadLiveInbox\(\)/
  );
});

test('konversationer inbox distinguishes a true network failure from a non-JSON 2xx response', () => {
  const html = readHtml();

  // Status 0 kan betyda två helt olika saker — vi måste kunna skilja dem.
  assert.match(html, /let failureReason = ''/);
  // (a) fetch kastar: bevara browserns felnamn/-meddelande.
  assert.match(html, /Nätverksfel — nådde inte CCO-worklist \(\$\{/);
  assert.match(html, /networkError\?\.name \|\| 'NetworkError'/);
  // (b) 2xx utan giltig JSON: fånga status + content-type.
  assert.match(html, /Servern svarade utan giltig JSON \(HTTP \$\{/);
  assert.match(html, /response\.headers\.get\('content-type'\)/);
  // felReason vinner över den generiska statustexten.
  assert.match(html, /const detail = failureReason \|\| describeWorklistFailure\(failureStatus\)/);
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
  assert.match(html, /function parseScopedContactFormKey\(value\)/);
  assert.match(html, /function scopedMemberKeysForThread\(primaryKey, keys = \[\]\)/);
  assert.match(html, /function scopedLookupKeysForOpenThread\(thread, keys = \[\]\)/);
  assert.match(html, /::contact-form-ref:/);
  assert.match(html, /function toContactFormScopedKey\(baseKey = '', email = ''\)/);
  assert.match(html, /if \(memberScope\.scoped\) \{/);
  assert.match(html, /memberScope\.email === primaryScope\.email/);
  assert.match(html, /memberScope\.reference === primaryScope\.reference/);
  assert.match(html, /return toContactFormScopedKey\(item, primaryScope\.email\)/);
  assert.match(html, /return toContactFormReferenceScopedKey\(item, primaryScope\.reference\)/);
  assert.match(
    html,
    /const baseConversationKey = normalizeText\(\s*threadScope\.baseKey \|\| safeThread\.conversationKey\s*\)/
  );
  assert.match(
    html,
    /toContactFormScopedKey\(\s*baseConversationKey,\s*scopedCustomerEmail \|\| threadScope\.email\s*\)/
  );
  assert.match(
    html,
    /toContactFormReferenceScopedKey\(baseConversationKey, scopedContactReference\)/
  );
  assert.match(html, /messageLookupKeys/);
  assert.match(html, /const messageIdentityKeys = \[/);
  assert.match(html, /conversation\.underlyingMessageIds/);
  assert.match(html, /conversation\.underlyingGraphMessageIds/);
  assert.match(html, /rollup\.underlyingMessageIds/);
  assert.match(html, /rollup\.underlyingGraphMessageIds/);
  assert.match(html, /rollup\.underlyingConversationKeys/);
  assert.match(html, /rollup\.underlyingConversationIds/);
  assert.match(html, /const scopedPrimaryConversationKey\s*=/);
  assert.match(html, /const contactFormThread = looksLikeContactFormThread\(row\)/);
  assert.match(html, /const primaryConversationKeyBase\s*=/);
  assert.match(
    html,
    /\(contactFormThread \? normalizeText\(messageIdentityKeys\[0\]\) : ''\)/,
    'kontaktformulär ska öppnas via exakt message-id innan rå conversationKey används'
  );
  assert.match(html, /function normalizeContactFormReference\(value = ''\)/);
  assert.match(html, /function toContactFormReferenceScopedKey\(baseKey = '', reference = ''\)/);
  assert.match(
    html,
    /toContactFormReferenceScopedKey\(primaryConversationKeyBase, contactReference\)/
  );
  assert.match(html, /const primaryConversationKey\s*=/);
  assert.match(
    html,
    /memberKeys:\s*scopedMemberKeysForThread\(primaryConversationKey,\s*messageLookupKeys\)\.slice\(\s*0,\s*50\s*\)/
  );
  assert.match(html, /const params = new URLSearchParams\(\)/);
  assert.match(html, /const rawLookupKeys = \(/);
  assert.match(
    html,
    /const lookupKeys = scopedLookupKeysForOpenThread\(thread, rawLookupKeys\)\.slice\(0, 50\)/
  );
  assert.match(html, /params\.set\('memberKeys', lookupKeys\.join\(','\)\)/);
  assert.match(html, /const scopedCustomerEmail = firstCustomerEmailValue\(/);
  assert.match(html, /params\.set\('customerEmail', scopedCustomerEmail\)/);
  assert.match(html, /function looksLikeContactFormThread\(row = \{\}\)/);
  assert.match(
    html,
    /function contactFormReferenceForThread\(\s*row = \{\},\s*name = '',\s*customerEmail = '',\s*primaryScope = \{\}\s*\)/
  );
  assert.match(html, /const contactReference = contactFormReferenceForThread\(/);
  assert.match(html, /contactReference,/);
  assert.match(html, /const scopedContactReference = normalizeText\(/);
  assert.match(html, /params\.set\('contactReference', scopedContactReference\)/);
  assert.match(
    html,
    /const queryString = params\.toString\(\) \? `\?\$\{params\.toString\(\)\}` : ''/
  );
  assert.match(
    html,
    /\/api\/v1\/cco\/runtime\/conversation\/\$\{encodeURIComponent\(thread\.conversationKey\)\}\/messages\$\{queryString\}/
  );
  assert.match(html, /function renderThreadMessages\(thread, messages\)/);
  assert.match(html, /data-thread-id="\$\{escapeHtml\(t\.id\)\}"/);
  assert.match(html, /Mailbox-spår:/);
  assert.match(
    html,
    /const firstThread = currentThreads\.find\(\(thread\) => thread\.conversationKey\)/
  );
});

test('kontaktformulär utan kundmail scopas från formulärtexten, inte generisk rubrik', () => {
  const html = readHtml();

  assert.match(html, /function contactFormTextSources\(row = \{\}, name = ''\)/);
  assert.match(html, /function extractContactFormNameFromText\(value = ''\)/);
  assert.match(html, /function extractContactFormPhoneFromText\(value = ''\)/);
  assert.match(html, /function contactFormReferenceFromText\(value = ''\)/);
  assert.match(
    html,
    /const safeName = normalizeContactFormReference\(name\);[\s\S]*const safePhone = normalizeContactFormReference\(phone\);[\s\S]*\.join\('--'\)/,
    'frontend scope måste matcha backendens namn--telefon-format'
  );
  assert.match(
    html,
    /row\.preview,[\s\S]*row\.bodyPreview,[\s\S]*row\.queueExplanatoryLine/,
    'kontaktformulär måste läsa preview/bodyPreview före fallback-rubrik'
  );
  assert.match(
    html,
    /\(\?:från\|from\)\\s\*\[:：\]\\s\*\(\.\{2,90\}\?\)/,
    'namnet ska kunna hämtas ur "Från: Namn E-post: ..."'
  );
  assert.match(
    html,
    /kontaktformul\[aä\]r\|contact\\s\*form\|ok\[aä\]nd kund/,
    'generiska kontaktformulär-rubriker ska inte bli scope'
  );
});

test('konversationer renders full mail html and attachments safely', () => {
  const html = readHtml();

  assert.match(html, /function sanitizeMailHtmlForDisplay\(html\)/);
  assert.match(
    html,
    /querySelectorAll\('script,style,iframe,object,embed,form,meta,link,base,input,button'\)/
  );
  assert.match(html, /function messageBodyHtml\(message\)/);
  assert.match(html, /function messageBodyText\(message\)/);
  assert.match(
    html,
    /function chooseRicherMailText\(existing = '', candidate = '', preview = ''\)/
  );
  assert.match(html, /function renderMessageBubbleInner\(message\)/);
  assert.match(html, /const html = sanitizeMailHtmlForDisplay\(messageBodyHtml\(message\)\);/);
  assert.match(html, /iframe/);
  assert.match(html, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.match(html, /srcdoc="\$\{escapeHtml\(doc\)\}"/);
  assert.match(html, /message\?\.bodyHtml/);
  assert.match(html, /message\?\.body_html/);
  assert.match(html, /message\?\.html/);
  assert.match(html, /mailDocument\?\.primaryBodyText/);
  assert.match(html, /mailDocument\?\.primaryBodyHtml/);
  assert.match(html, /rawJson\?\.bodyText/);
  assert.match(html, /rawJson\?\.bodyHtml/);
  assert.match(html, /rawBody/);
  assert.match(html, /rawUniqueBody/);
  assert.match(html, /message\?\.body_text/);
  assert.match(html, /message\?\.bodyPreview/);
  assert.match(html, /messageBodyText\(message\)\)\.replace\(\/\\n\/g, '<br>'\)/);
  assert.match(html, /body: messageBodyText\(message\)/);
  assert.match(html, /function renderMessageAttachments\(message\)/);
  assert.match(html, /attachment\.inlineUrl/);
  assert.match(html, /attachment\.openUrl/);
  assert.match(html, /attachment\.downloadUrl/);
  assert.match(html, /msg-attachment-preview/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /msg-bubble--html msg-bubble-rich/);
  assert.match(
    html,
    /\$\{renderMessageBubbleInner\(message\)\}[\s\S]*\$\{renderMessageAttachments\(message\)\}/
  );
  assert.match(html, /msg-attachments/);
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

test('konversationer defines every helper used by the live worklist render path', () => {
  const html = readHtml();
  const script = liveScript(html);
  // Regression: normalizeEmail anropades i toContactFormScopedKey men var aldrig
  // definierad → ReferenceError krossade inkorgen så fort worklisten gav rader.
  // Parse-testet fångar inte runtime-ReferenceError, så vi låser definitionen.
  assert.match(script, /function normalizeEmail\(/, 'normalizeEmail måste vara definierad');
  // Varje lokalt anropad hjälpfunktion i scope-nyckel-bygget måste finnas.
  for (const fn of [
    'normalizeText',
    'normalizeEmail',
    'normalizeContactFormReference',
    'isHairTpMailboxEmail',
    'parseScopedContactFormKey',
    'toContactFormScopedKey',
    'toContactFormReferenceScopedKey',
    'scopedMemberKeysForThread',
  ]) {
    assert.match(
      script,
      new RegExp(`function ${fn}\\(`),
      `${fn} måste vara definierad (annars ReferenceError vid rendering av rader)`
    );
  }
});

test('konversationer live inbox script parses', () => {
  const html = readHtml();
  assert.doesNotThrow(() => new Function(liveScript(html)));
});
