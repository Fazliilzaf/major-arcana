const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');

function readHtml() {
  return fs.readFileSync(htmlPath, 'utf8');
}

function liveScript(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1]
  );
  const script = scripts.find((source) => source.includes('function liveWorklistUrl('));
  assert.ok(script, 'konversationer.html should contain the live inbox script');
  return script;
}

function liveRollupHelpers() {
  const script = liveScript(readHtml());
  const sliceBetween = (startMarker, endMarker) => {
    const start = script.indexOf(startMarker);
    const end = script.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `live helper ${startMarker} must exist`);
    return script.slice(start, end);
  };
  const source = [
    sliceBetween('function canonicalMailboxIds(', 'function threadMatchesMailboxScope('),
    sliceBetween('function threadMatchesMailboxScope(', 'function threadForMailboxScope('),
    sliceBetween('function threadForMailboxScope(', 'const AVATAR_BACKGROUNDS'),
    sliceBetween('function mergeWorklistThreads(', 'async function loadLiveInbox('),
  ].join('\n');
  const context = {
    normalizeText: (value) => String(value || '').trim(),
    canonicalHairTpMailbox: (value) => String(value || '').trim().toLowerCase(),
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

function patientThread({ mailboxAddress, patientId, patientMatch, latestAtMs = 0 }) {
  return {
    id: `${mailboxAddress}:${patientId || 'unknown'}`,
    conversationKey: `${mailboxAddress}:conversation`,
    mailboxAddress,
    mailboxId: mailboxAddress,
    mailboxTrail: [mailboxAddress],
    patientId,
    patientMatch,
    latestAtMs,
    memberKeys: [`${mailboxAddress}:member`],
    messageLookupKeys: [`${mailboxAddress}:message`],
    tags: [],
    unread: false,
    needsReply: false,
  };
}

test('konversationer live inbox safely fans out all mailboxes while selected mailboxes stay as the visible scope', () => {
  const html = readHtml();

  for (const mailbox of [
    'kons@hairtpclinic.com',
    'contact@hairtpclinic.com',
    'egzona@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'marknad@hairtpclinic.com',
    'kvitto@hairtpclinic.com',
    'halso@hairtpclinic.com',
  ]) assert.match(html, new RegExp("'" + mailbox.replace('@', '@') + "'"));
  assert.match(html, /const WORKLIST_MAX_MAILBOXES_PER_REQUEST = 2/);
  assert.match(html, /function chunkMailboxIds\(/);
  assert.match(html, /for \(const mailboxChunk of chunkMailboxIds\(requestMailboxIds\)\)/);
  assert.match(
    html,
    /const requestMailboxIds = canonicalMailboxIds\(LIVE_MAILBOX_IDS\)/,
    'the selected mailbox is an anchor filter, not a customer-history boundary'
  );
  assert.match(html, /const selectedScopeMailboxIds = canonicalMailboxIds\(selectedMailboxIds\)/);
  assert.match(
    html,
    /currentThreads = mergeWorklistThreads\(normalizedThreads\)\s*\.map\(\(thread\) => threadForMailboxScope\(thread, selectedScopeMailboxIds\)\)\s*\.filter\(Boolean\)/
  );
  assert.match(html, /function threadMatchesMailboxScope\(thread = \{\}, mailboxIds = \[\]\)/);
  assert.match(html, /function threadForMailboxScope\(thread = \{\}, mailboxIds = \[\]\)/);
  const mergeHelper = html.match(
    /function mergeWorklistThreads\(threads\) \{([\s\S]*?)\n      \}\n\n      async function loadLiveInbox/
  );
  assert.ok(mergeHelper, 'multi-mailbox merge helper must exist');
  assert.match(mergeHelper[1], /thread\.conversationKey/);
  assert.match(mergeHelper[1], /thread\.patientId/);
  assert.match(mergeHelper[1], /patientMatchStatus === 'matched'/);
  assert.doesNotMatch(
    mergeHelper[1],
    /thread\.customerEmail/,
    'email alone must never merge customer histories across mailboxes'
  );
  assert.match(html, /params\.set\('mailboxId', mailboxHints\.join\(','\)\)/);
  assert.match(html, /\/api\/v1\/cco\/runtime\/worklist\/consumer\?mailboxIds=/);
  assert.match(html, /'&limit=500'/);
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

test('a mailbox view keeps the verified customer timeline from the other mailbox', () => {
  const { mergeWorklistThreads, threadForMailboxScope } = liveRollupHelpers();
  const merged = mergeWorklistThreads([
    patientThread({
      mailboxAddress: 'contact@hairtpclinic.com',
      patientId: 'patient-1',
      patientMatch: { status: 'matched' },
      latestAtMs: 10,
    }),
    patientThread({
      mailboxAddress: 'fazli@hairtpclinic.com',
      patientId: 'patient-1',
      patientMatch: { status: 'matched' },
      latestAtMs: 20,
    }),
  ]);

  assert.equal(merged.length, 1, 'the same verified patient gets one customer row');
  const fazliView = threadForMailboxScope(merged[0], ['fazli@hairtpclinic.com']);
  assert.equal(fazliView.mailboxAddress, 'fazli@hairtpclinic.com');
  assert.deepEqual([...fazliView.mailboxTrail], [
    'fazli@hairtpclinic.com',
    'contact@hairtpclinic.com',
  ]);
  assert.equal(fazliView.memberKeys.length, 2, 'both mailbox message keys remain available');

  const contactView = threadForMailboxScope(merged[0], ['contact@hairtpclinic.com']);
  assert.equal(contactView.mailboxAddress, 'contact@hairtpclinic.com');
  assert.deepEqual([...contactView.mailboxTrail], [
    'contact@hairtpclinic.com',
    'fazli@hairtpclinic.com',
  ]);
});

test('ambiguous patient matches remain separate across mailbox views', () => {
  const { mergeWorklistThreads } = liveRollupHelpers();
  const merged = mergeWorklistThreads([
    patientThread({
      mailboxAddress: 'contact@hairtpclinic.com',
      patientId: '',
      patientMatch: { status: 'ambiguous' },
      latestAtMs: 10,
    }),
    patientThread({
      mailboxAddress: 'fazli@hairtpclinic.com',
      patientId: '',
      patientMatch: { status: 'ambiguous' },
      latestAtMs: 20,
    }),
  ]);

  assert.equal(merged.length, 2, 'uncertain identity must never combine customer histories');
});

test('konversationer initializes live inbox state before the first status render', () => {
  const script = liveScript(readHtml());
  const stateDeclaration = script.indexOf('let liveInboxMessageCount = null;');
  const statusFunction = script.indexOf('function renderLiveInboxStatus(');
  const initialStatusRender = script.indexOf('renderLiveInboxStatus(', statusFunction);

  assert.ok(stateDeclaration >= 0, 'live inbox message state must be declared');
  assert.ok(statusFunction >= 0, 'live inbox status renderer must exist');
  assert.ok(initialStatusRender >= 0, 'initial live status render must exist');
  assert.ok(
    stateDeclaration < initialStatusRender,
    'liveInboxMessageCount must be initialized before the initial status render'
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

test('konversationer removes Gmail safety notices without hiding the customer preview', () => {
  const html = readHtml();

  assert.match(html, /function stripMailboxSafetyNotice\(value = ''\)/);
  assert.match(html, /Du\\s\+får\\s\+inte\\s\+e-post\\s\+ofta\\s\+från/);
  assert.match(html, /You\\s\+don't\\s\+often\\s\+get\\s\+email\\s\+from/);
  assert.match(html, /const cleanPreview = stripMailboxSafetyNotice\(/);
  assert.match(html, /return stripMailboxSafetyNotice\(\[/);
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
  assert.match(
    html,
    /liveInboxRetryTimer = setTimeout\(\(\) => loadLiveInbox\(\{ background \}\), waitMs\)/
  );
  // Admin-skalet skriver token i ett annat dokument — iframe:n lyssnar och
  // laddar om utan sidladdning.
  assert.match(
    html,
    /window\.addEventListener\('storage', \(event\) => \{[\s\S]*event\.key === 'ARCANA_ADMIN_TOKEN'[\s\S]*loadLiveInbox\(\)/
  );
});

test('konversationer refreshes the local KONS worklist without disrupting the selected thread', () => {
  const html = readHtml();

  assert.match(html, /const LIVE_INBOX_REFRESH_MS = 10 \* 1000/);
  assert.match(html, /new EventSource\('\/api\/v1\/cco\/runtime\/stream'\)/);
  assert.match(html, /liveInboxStream\.addEventListener\('worklist_updated'/);
  assert.match(html, /async function loadLiveInbox\(\{ background = false \} = \{\}\)/);
  assert.match(html, /const previousSelection = selectedLiveThread/);
  assert.match(html, /const selectedThread = currentThreads\.find\(/);
  assert.match(html, /thread\.active = thread === nextThread/);
  assert.match(html, /if \(background && currentThreads\.length\) return/);
  assert.match(html, /setTimeout\(\(\) => loadLiveInbox\(\{ background \}\), waitMs\)/);
  assert.match(html, /document\.visibilityState === 'visible'/);
  assert.match(html, /loadLiveInbox\(\{ background: true \}\)/);
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

test('konversationer derives booking chips from the local worklist booking context', () => {
  const html = readHtml();

  assert.match(html, /function formatBookingTag\(nextAt\)/);
  assert.match(html, /timeZone:\s*'Europe\/Stockholm'/);
  assert.match(html, /return 'Bok idag'/);
  assert.match(html, /return 'Bok imorgon'/);
  assert.match(html, /const bookingTag = formatBookingTag\(row\.booking\?\.nextAt\)/);
  assert.match(html, /row\.booking\?\.nextAt \|\| String\(row\.lane \|\| ''\)\.includes\('book'\)/);
  assert.match(
    html,
    /tags\.push\(\{ kind: 'vip', label: 'VIP' \}\);[\s\S]*tags\.push\(\{ kind: 'booking', label: bookingTag \}\);/
  );
});

test('konversationer maps verified worklist enrichment to smart inbox chips', () => {
  const html = readHtml();

  assert.match(html, /function buildWorklistEnrichmentLookup\(enrichment\)/);
  assert.match(
    html,
    /enrichment = enrichment && typeof enrichment === 'object' \? enrichment : \{\};/
  );
  assert.match(html, /rows\.filter\(\(row\) => row && typeof row === 'object'\)\.forEach/);
  assert.match(html, /function findWorklistEnrichment\(row = \{\}, lookup = new Map\(\)\)/);
  assert.match(html, /intentConfidence/);
  assert.match(html, /confidence >= 0\.6/);
  assert.match(html, /booking_request:\s*\{ kind: 'booking', label: 'Bokningsförfrågan' \}/);
  assert.match(html, /pricing_question:\s*\{ kind: 'ai', label: 'Prisfråga' \}/);
  assert.match(html, /anxiety_pre_op:\s*\{ kind: 'warning', label: 'Orolig inför behandling' \}/);
  assert.match(html, /complaint:\s*\{ kind: 'urgent', label: 'Klagomål' \}/);
  assert.match(html, /cancellation:\s*\{ kind: 'warning', label: 'Av-\/ombokning' \}/);
  assert.match(html, /follow_up:\s*\{ kind: 'ai', label: 'Uppföljning' \}/);
  assert.match(html, /priority === 'critical'.*'Kritisk'/);
  assert.match(html, /priority === 'high'.*'Hög prioritet'/);
  assert.match(html, /followUpSuggested === true \|\| enrichment\.stagnated === true/);
  assert.match(
    html,
    /normalizeLiveThread\([\s\S]*?row,[\s\S]*?normalizedThreads\.length,[\s\S]*?findWorklistEnrichment\(row, enrichmentLookup\)[\s\S]*?\)/
  );
});

test('konversationer keeps uncertain or unclear enrichment out of inbox chips', () => {
  const html = readHtml();

  assert.doesNotMatch(html, /unclear:\s*\{\s*kind:/);
  assert.match(html, /return tags\.slice\(0, 3\)/);
  assert.match(html, /tags\.some\(\(existing\) => existing\.label === tag\.label\)/);
});

test('konversationer inbox cards preserve smart subjects without showing the mailbox chip', () => {
  const html = readHtml();

  assert.match(html, /const subjectStartsWithName\s*=/);
  assert.match(
    html,
    /normalizeText\(rawSubject\.slice\(threadName\.length\)\.replace\(\/\^\[\\s:–—-\]\+\//,
    'a subject such as "Amer Putes Kontaktformulär" must keep "Kontaktformulär"'
  );
  assert.match(html, /const previewWithoutName\s*=/);
  assert.match(html, /previewWithoutName\.replace\(/);
  assert.doesNotMatch(
    html,
    /<span class="thread-tag thread-tag--booking">\$\{escapeHtml\(t\.mailboxAddress \|\| t\.source\)\}<\/span>/,
    'mailbox address must not consume a smart-info chip in the inbox card'
  );
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

test('konversationstråden visar senaste mailet överst utan att mutera API-ordningen', () => {
  const html = readHtml();
  assert.match(html, /const newestFirst = messages\.slice\(\)\.sort/);
  assert.match(html, /return bMs - aMs/);
  assert.match(html, /mount\.innerHTML = newestFirst/);
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
  assert.match(html, /sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"/);
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
  assert.match(html, /function attachmentUrl\(attachment\)/);
  assert.match(html, /attachment\?\.inlineUrl/);
  assert.match(html, /attachment\?\.openUrl/);
  assert.match(html, /attachment\?\.downloadUrl/);
  assert.match(html, /const url = attachmentUrl\(item\)/);
  assert.match(html, /msg-attachment-preview/);
  assert.match(html, /data-mail-preview-url/);
  assert.match(html, /msg-bubble--html msg-bubble-rich/);
  assert.match(
    html,
    /\$\{renderMessageBubbleInner\(message\)\}[\s\S]*\$\{renderMessageAttachments\(message\)\}/
  );
  assert.match(html, /msg-attachments/);
});

test('bilagor öppnas i en intern modal utan ny flik', () => {
  const html = readHtml();

  assert.match(html, /function openMailAttachmentPreview\(trigger\)/);
  assert.match(html, /class="mail-preview-dialog" role="dialog" aria-modal="true"/);
  assert.match(html, /class="mail-preview-stage"/);
  assert.match(html, /class="mail-preview-close"/);
  assert.match(html, /class="mail-preview-download"/);
  assert.match(html, /authorizedMailAssetUrl\(url\)/);
  assert.match(html, /import\('\/vendor\/pdfjs\/pdf\.min\.mjs'\)/);
  assert.match(html, /pdf\.worker\.min\.mjs/);
  assert.match(html, /function loadMailPdfJs\(\)/);
  assert.match(html, /const pdfjs = await loadMailPdfJs\(\)/);
  assert.match(html, /function authorizedMailAssetBlob\(value\)/);
  assert.match(html, /const blob = await authorizedMailAssetBlob\(sourceUrl\)/);
  assert.match(html, /pdfjs\.getDocument\(\{ data: await blob\.arrayBuffer\(\) \}\)/);
  assert.match(html, /class="mail-preview-pdf-canvas-wrap"><canvas/);
  assert.match(html, /data-pdf-action="previous"/);
  assert.match(html, /data-pdf-action="next"/);
  assert.match(html, /data-pdf-action="zoom-in"/);
  assert.match(html, /event\.key === 'Escape'/);
  assert.doesNotMatch(
    html,
    /class="msg-attachment(?:-preview)?"[^>]*target="_blank"/,
    'Bilagekorten får inte längre öppna en ny flik.'
  );
});

test('CSP tillåter authade PDF-blobbar i den interna dokumentmodalen', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
  assert.match(server, /"frame-src 'self' blob:"/);
});

test('konversationer hydrates authenticated local mail assets in HTML and attachments', () => {
  const html = readHtml();

  assert.match(html, /function isLocalMailAssetUrl\(value\)/);
  assert.match(html, /function authorizedMailAssetUrl\(value\)/);
  assert.match(
    html,
    /localMailAsset[\s\S]*credentials:\s*'include',[\s\S]*withAdminAuthHeaders\(\{ Accept: '\*\/\*' \}\)/
  );
  assert.match(html, /URL\.createObjectURL\(blob\)/);
  assert.match(html, /function hydrateMailAssetRoot\(root\)/);
  assert.match(html, /hydrateMailAssetRoot\(frame\.contentDocument\)/);
  assert.match(html, /hydrateMailAssetUrls\(\);/);
});

test('konversationer hydrates embedded company-template images before iframe display', () => {
  const html = readHtml();

  assert.match(html, /function isEmbeddedMailImageUrl\(value\)/);
  assert.match(html, /data:image\\\/\(\?:png\|jpe\?g\|gif\|webp\|svg\\\+xml\)/);
  assert.match(
    html,
    /if \(!isLocalMailAssetUrl\(source\) && !isEmbeddedMailImageUrl\(source\)\) return;/,
    'Mallbilder ska gå genom samma blob-hydrering som lokala mail-assets.'
  );
  assert.match(
    html,
    /function createEmbeddedMailImageBlob\(value\)[\s\S]*decodeURIComponent\(payload\)/,
    'Mallbilder ska avkodas lokalt utan ett CSP-blockerat fetch(data:)-anrop.'
  );
  assert.match(
    html,
    /embeddedMailImage[\s\S]*Promise\.resolve\(createEmbeddedMailImageBlob\(url\)\)[\s\S]*authorizedMailAssetBlob\(url\)\.then\(\(blob\) => URL\.createObjectURL\(blob\)\)/,
    'Inbäddade SVG-/bildsymboler ska bli renderbara blob-URL:er.'
  );
  assert.match(html, /function replaceEmbeddedMailSvgImage\(element\)/);
  assert.match(
    html,
    /svg\.querySelectorAll\('script,foreignObject,iframe,object,embed'\)/,
    'SVG-symboler måste saneras innan de infogas i maildokumentet.'
  );
  assert.match(html, /element\.replaceWith\(imported\)/);
  assert.match(html, /if \(replaceEmbeddedMailSvgImage\(element\)\) return;/);
  assert.match(
    html,
    /querySelectorAll\('img\[src\^="data:image\/svg\+xml"\]'\)[\s\S]*replaceEmbeddedMailSvgImage\(image\)/,
    'SVG-symbolerna ska ersättas under sanering, innan sandbox-iframen skapas.'
  );
  assert.match(html, /function replaceKnownMailTemplateIcon\(element\)/);
  assert.match(html, /\['webb', 'visit website'\]/);
  assert.match(html, /\['instagram', 'visit instagram'\]/);
  assert.match(html, /\['facebook', 'visit facebook'\]/);
  assert.match(html, /replaceKnownMailTemplateIcon\(image\)/);
});

test('konversationer skiljer olästa mail från trådar som behöver svar', () => {
  const html = readHtml();

  assert.match(html, /unread: state\.hasUnreadInbound === true/);
  assert.match(
    html,
    /const needsReply = threads\.filter\(\(thread\) => thread\.needsReply\)\.length/
  );
  assert.match(html, /\$\{unread\} oläst · \$\{needsReply\} behöver svar · \$\{all\} trådar/);
  assert.match(html, /truthCoverage\?\.metadata\?\.messageCount/);
  assert.match(html, /actNowCount\) actNowCount\.textContent = String\(needsReply\)/);
});

test('konversationer keeps the bottom action bar visible for long mail threads', () => {
  const html = readHtml();

  assert.match(
    html,
    /\.thread-shell\s*\{[\s\S]*height:\s*calc\(100vh - 80px\);[\s\S]*min-height:\s*0;/,
    'trådpanelen måste vara höjdbegränsad så att meddelandelistan, inte panelen, scrollar'
  );
  assert.match(
    html,
    /\.messages\s*\{[\s\S]*flex:\s*1;[\s\S]*overflow-y:\s*auto;/,
    'meddelandelistan måste vara den interna scrollcontainern'
  );
  assert.match(
    html,
    /\.thread-bottom-actions\s*\{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*14px;/,
    'befintlig action-rad ska ligga kvar som synlig nederkant i trådpanelen'
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

test('konversationer wires the customer context panel to the selected live thread', () => {
  const html = readHtml();
  const script = liveScript(html);

  // Panelen fylls med RIKTIG tråd-data, inte statisk demo (Anna Karlsson).
  assert.match(script, /function renderThreadContextPanel\(thread, messageCount = null\)/);
  assert.match(script, /\.ctx-name/);
  assert.match(script, /normalizeText\(thread\.from\) \|\| 'Okänd kund'/);
  assert.match(script, /renderThreadContextPanel\(thread, messages\.length\)/);
  assert.match(script, /renderThreadContextPanel\(thread, null\)/);
  // Fabricerade demo-fält utan livekälla döljs (ingen påhittad klinisk/ekonomisk data).
  assert.match(html, /id="ctxAiRecommendation"/);
  assert.match(script, /getElementById\('ctxAiRecommendation'\)[\s\S]*display = 'none'/);
  assert.match(script, /\.quick-pill--ai'\)[\s\S]*display = 'none'/);
  // Utan tråd (init/tom/fel) rensas fälten helt istället för att visa demo.
  assert.match(script, /if \(!thread\) \{[\s\S]*chips\.innerHTML = ''[\s\S]*return;/);
  assert.match(script, /renderThreadContextPanel\(null\)/);
});

test('konversationer deep-links only canonical matched patientIds to the customer workspace', () => {
  const html = readHtml();
  const script = liveScript(html);
  assert.match(script, /patientId: normalizeText\(row\.patientId\)/);
  assert.match(script, /patientMatch:\s*row\.patientMatch/);
  assert.match(html, /data-action="open-patient-dossier"/);
  assert.match(
    html,
    /window\.location\.assign\(`\/staff\?\$\{params\.toString\(\)\}`\)/,
    'kunddossier ska oppnas i samma flik sa admin-sessionen bevaras'
  );
  assert.doesNotMatch(
    html,
    /window\.open\(`\/staff\?\$\{params\.toString\(\)\}`/,
    'kunddossier far inte oppnas i en ny noopener-flik'
  );
  assert.match(script, /hasCanonicalPatientMatch = Boolean\(patientId && patientMatchStatus === 'matched'\)/);
  assert.match(script, /dossierButton\.disabled = !hasCanonicalPatientMatch/);
  assert.match(script, /status !== 'matched'/);
  assert.match(script, /view: 'customers'/);
  assert.match(script, /demo: 'off'/);
  assert.match(script, /embed: 'admin'/);
  assert.match(script, /v11rail: 'on'/);
  assert.match(script, /v12workspace: 'on'/);
  assert.doesNotMatch(script, /patientId:\s*normalizeText\(row\.customerId\)/);
});

test('konversationer live inbox script parses', () => {
  const html = readHtml();
  assert.doesNotThrow(() => new Function(liveScript(html)));
});
