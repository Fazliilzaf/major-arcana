const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app.js'
);

const RUNTIME_ACTION_ENGINE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-action-engine.js'
);

const RUNTIME_OVERLAY_RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-overlay-renderers.js'
);

const INDEX_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'index.html'
);

const STYLES_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'styles.css'
);

test('app.js kopplar lane- och feed-helpers till dom-live men inte tillbaka in i queue-renderern', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  const queueRendererStart = source.indexOf('PREVIEW_QUEUE_RENDERERS.createQueueRenderers({');
  assert.notEqual(
    queueRendererStart,
    -1,
    'Kunde inte hitta createQueueRenderers-anropet i app.js.'
  );
  const queueRendererEnd = source.indexOf(
    '  const {\n    deleteRuntimeThread,',
    queueRendererStart
  );
  assert.notEqual(
    queueRendererEnd,
    -1,
    'Kunde inte avgränsa createQueueRenderers-anropet i app.js.'
  );
  const queueRendererCall = source.slice(queueRendererStart, queueRendererEnd);

  assert.ok(
    !queueRendererCall.includes('\n      getMailFeedRuntimeThreads,'),
    'Queue-renderern ska inte få tillbaka getMailFeedRuntimeThreads som helper från sin egen retur.'
  );

  const domCompositionStart = source.indexOf(
    'PREVIEW_DOM_LIVE_COMPOSITION.createDomLiveComposition({'
  );
  assert.notEqual(
    domCompositionStart,
    -1,
    'Kunde inte hitta createDomLiveComposition-anropet i app.js.'
  );
  const domCompositionEnd = source.indexOf(
    '\n  function normalizeCustomMailboxDefinition',
    domCompositionStart
  );
  assert.notEqual(
    domCompositionEnd,
    -1,
    'Kunde inte avgränsa createDomLiveComposition-anropet i app.js.'
  );
  const domCompositionCall = source.slice(domCompositionStart, domCompositionEnd);

  assert.ok(
    domCompositionCall.includes('\n      getMailFeedRuntimeThreads,'),
    'DOM live composition måste få getMailFeedRuntimeThreads för feed-klick i vänsterkolumnen.'
  );
  assert.ok(
    domCompositionCall.includes('\n      getQueueScopedRuntimeThreads,'),
    'DOM live composition måste få getQueueScopedRuntimeThreads så debug-pipelinen kan läsa queue-scope utan ReferenceError.'
  );
  assert.ok(
    domCompositionCall.includes('\n      getQueueLaneThreads,'),
    'DOM live composition måste få getQueueLaneThreads för lane-klick i vänsterkolumnen.'
  );
  assert.ok(
    domCompositionCall.includes('\n      captureRuntimeReentrySnapshot,'),
    'DOM live composition måste få captureRuntimeReentrySnapshot så staging-reentry inte blir en tom no-op i live-kedjan.'
  );
  assert.ok(
    domCompositionCall.includes('\n      restoreRuntimeReentrySnapshot,'),
    'DOM live composition måste få restoreRuntimeReentrySnapshot så Historik och vald tråd kan återställas efter reload.'
  );
  assert.ok(
    domCompositionCall.includes('\n      getRuntimeReentrySnapshot,'),
    'DOM live composition måste få getRuntimeReentrySnapshot för att kunna läsa sparat workspace-läge vid återinträde.'
  );
  assert.ok(
    domCompositionCall.includes('\n      getRuntimeReentryOutcome,'),
    'DOM live composition måste få getRuntimeReentryOutcome så reentry-diagnostiken speglar den riktiga restore-kedjan.'
  );
});

test('app.js kopplar buildStudioSelectionSummary till overlay-renderern för den permanenta studio-orienteringen', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  const overlayRendererStart = source.indexOf('PREVIEW_OVERLAY_RENDERERS.createOverlayRenderers({');
  assert.notEqual(
    overlayRendererStart,
    -1,
    'Kunde inte hitta createOverlayRenderers-anropet i app.js.'
  );
  const overlayRendererEnd = source.indexOf(
    '\n  const {\n    updateRuntimeThread,',
    overlayRendererStart
  );
  assert.notEqual(
    overlayRendererEnd,
    -1,
    'Kunde inte avgränsa createOverlayRenderers-anropet i app.js.'
  );
  const overlayRendererCall = source.slice(overlayRendererStart, overlayRendererEnd);

  assert.ok(
    overlayRendererCall.includes('\n      buildStudioSelectionSummary,'),
    'Overlay-renderern måste få buildStudioSelectionSummary så studiots orienteringstext kan visas under actionraden.'
  );
});

test('app.js återställer reentry som hint-only vid bootstrap så gammalt listscope inte får auktoritet över live', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /restoreRuntimeReentrySnapshot\("bootstrap",\s*\{\s*scopeMode:\s*"hint_only"\s*\}\s*\)/,
    'Bootstrap-restore ska vara hint-only så att sparad reentry inte kan låsa vänsterlistans scope före live-load.'
  );
});

test('topbarens Nytt mejl öppnar compose som fristående nytt mejl utan vald live-tråd', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const actionEngineSource = fs.readFileSync(RUNTIME_ACTION_ENGINE_PATH, 'utf8');

  assert.ok(
    appSource.includes('function prepareComposeStudioState(thread = null)'),
    'prepareComposeStudioState ska defaulta till null så Nytt mejl inte ärvt vald kundtråd.'
  );

  assert.ok(
    actionEngineSource.includes('prepareComposeStudioState();'),
    'Runtime action engine ska öppna compose utan att skicka in vald runtime-tråd.'
  );

  assert.ok(
    !actionEngineSource.includes('prepareComposeStudioState(getSelectedRuntimeThread())'),
    'Nytt mejl får inte längre förifyllas från vald runtime-tråd.'
  );

  assert.ok(
    appSource.includes('threadId: ""'),
    'Det fristående compose-state:t ska inte bära med sig ett gammalt conversationId från arbetskön.'
  );
});

test('compose-läget behåller studiovalen men döljer kundkontextspalten', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.ok(
    stylesSource.includes('.studio-shell[data-mode="compose"] .studio-sidebar'),
    'Compose-läget ska ha en separat regel för att dölja vänster kundkontext.'
  );

  assert.ok(
    stylesSource.includes('.studio-shell[data-mode="compose"] .studio-layout {\n  grid-template-columns: minmax(0, 1fr);'),
    'Compose-läget ska använda en enkolumnslayout när kundkontexten är dold.'
  );

  assert.ok(
    !stylesSource.includes('.studio-shell[data-mode="compose"] .studio-template-card,'),
    'Snabbmallar ska inte längre döljas i compose-läget.'
  );

  assert.ok(
    !stylesSource.includes('.studio-shell[data-mode="compose"] .studio-control-card,'),
    'Tonfilter och finjustering ska inte längre döljas i compose-läget.'
  );
});

test('overlay-renderern behandlar compose utan vald thread som fristående nytt mejl', () => {
  const overlaySource = fs.readFileSync(RUNTIME_OVERLAY_RENDERERS_PATH, 'utf8');

  assert.ok(
    overlaySource.includes('const thread = isComposeMode') &&
      overlaySource.includes('? composeThread') &&
      overlaySource.includes(': lockedReplyThreadId') &&
      overlaySource.includes(': runtimeSelectedThread;'),
    'Compose-renderingen ska fortsatt använda composeThread och reply-läget ska nu kunna använda låst threadId i stället för att alltid falla tillbaka till vald arbetskö-tråd.'
  );

  assert.ok(
    overlaySource.includes('const isStandaloneCompose = isComposeMode && !thread;'),
    'Overlay-renderern ska kunna avgöra när Nytt mejl är helt fristående.'
  );
});

test('reply-studio öppnar på aktiv tråd i stället för stale studio-lock och fokusknappen bär explicit thread-id', () => {
  const actionEngineSource = fs.readFileSync(RUNTIME_ACTION_ENGINE_PATH, 'utf8');
  const overlaySource = fs.readFileSync(RUNTIME_OVERLAY_RENDERERS_PATH, 'utf8');
  const focusSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'runtime-focus-intel-renderers.js'
    ),
    'utf8'
  );
  const domCompositionSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'runtime-dom-live-composition.js'
    ),
    'utf8'
  );

  assert.ok(
    actionEngineSource.includes('function openRuntimeStudio(mode = "reply", preferredThreadId = "", options = {})'),
    'Runtime action engine ska kunna ta emot en explicit thread-id när reply-studion öppnas.'
  );
  assert.ok(
    actionEngineSource.includes('state.studio.threadId = lockedThreadId;'),
    'Reply-studion ska låsa om sitt threadId vid öppning så stale studio-lock inte återanvänds.'
  );
  assert.ok(
    actionEngineSource.includes('state.studio.replyContextThreadId = lockedThreadId;'),
    'Reply-studions öppning ska skriva in replyContextThreadId explicit så låset inte blir indirekt.'
  );
  assert.ok(
    actionEngineSource.includes('applyFocusSection("conversation");'),
    'Reply-studion ska återgå till conversation-fokus när den öppnas från queue/focus-handoffen.'
  );
  assert.ok(
    actionEngineSource.includes('state.studio.readOnly = readOnly;'),
    'Reply-studion ska kunna bära med sig ett explicit read-only-lås när fokusytan öppnar offline historik i läsläge.'
  );
  assert.ok(
    overlaySource.includes('if (!isComposeMode && runtimeSelectedThread && (!lockedReplyThreadId || !lockedReplyThread))'),
    'Overlay-renderern ska falla tillbaka till aktuell runtime-tråd när ett gammalt studio-lock inte längre kan resolveas.'
  );
  assert.ok(
    overlaySource.includes(
      'state.studio.threadId = selectedRuntimeThreadId;\n          state.studio.replyContextThreadId = selectedRuntimeThreadId;'
    ),
    'Overlay-renderern ska skriva över stale reply-lås med aktuell selected runtime-tråd så mitten- och högersida håller samma truth.'
  );
  assert.ok(
    focusSource.includes('data-runtime-studio-thread-id="${escapeHtml('),
    'Fokusytans studio-knapp ska bära explicit thread-id för sann handoff till reply-studion.'
  );
  assert.ok(
    domCompositionSource.includes('runtimeActionEngine.openRuntimeStudio("reply", runtimeStudioThreadId, {'),
    'DOM live composition ska öppna reply-studion med explicit thread-id från fokusytan.'
  );
});

test('app.js kopplar runtime capability-helpers till overlay, async och dom-live', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  const overlayRendererStart = source.indexOf('PREVIEW_OVERLAY_RENDERERS.createOverlayRenderers({');
  const overlayRendererEnd = source.indexOf(
    '\n  const {\n    updateRuntimeThread,',
    overlayRendererStart
  );
  const overlayRendererCall = source.slice(overlayRendererStart, overlayRendererEnd);

  const asyncStart = source.indexOf('PREVIEW_ASYNC_ORCHESTRATION.createAsyncOrchestration({');
  const asyncEnd = source.indexOf('\n\n  const runtimeActionEngine =', asyncStart);
  const asyncCall = source.slice(asyncStart, asyncEnd);

  const domCompositionStart = source.indexOf(
    'PREVIEW_DOM_LIVE_COMPOSITION.createDomLiveComposition({'
  );
  const domCompositionEnd = source.indexOf(
    '\n  function normalizeCustomMailboxDefinition',
    domCompositionStart
  );
  const domCompositionCall = source.slice(domCompositionStart, domCompositionEnd);

  assert.ok(
    overlayRendererCall.includes('\n      getRuntimeMailboxCapability,'),
    'Overlay-renderern måste få getRuntimeMailboxCapability för capability-aware studioytor.'
  );
  assert.ok(
    overlayRendererCall.includes('\n      getRuntimeMailboxCapabilityMeta,'),
    'Overlay-renderern måste få getRuntimeMailboxCapabilityMeta för capability-summary i studion.'
  );
  assert.ok(
    overlayRendererCall.includes('\n      getRuntimeThreadById,'),
    'Overlay-renderern måste få getRuntimeThreadById för att kunna låsa reply-studion till öppnad tråd.'
  );
  assert.ok(
    asyncCall.includes('\n      getRuntimeMailboxCapability,'),
    'Async orchestration måste få getRuntimeMailboxCapability för att kunna blockera skick från spärrade mailboxar.'
  );
  assert.ok(
    asyncCall.includes('\n      getRuntimeThreadById,'),
    'Async orchestration måste få getRuntimeThreadById så reply-actions använder studiots låsta tråd i stället för lös selectedThread.'
  );
  assert.ok(
    domCompositionCall.includes('\n      buildRuntimeMailboxCapabilities,'),
    'DOM live composition måste få buildRuntimeMailboxCapabilities för att kunna bygga capability-state från runtime-status.'
  );
  assert.ok(
    domCompositionCall.includes('\n      canonicalizeRuntimeMailboxId,'),
    'DOM live composition måste få canonicalizeRuntimeMailboxId så live-requests alltid använder full mailboxadress.'
  );
  assert.ok(
    domCompositionCall.includes('\n      getAdminToken,'),
    'DOM live composition måste få getAdminToken för auth-säker runtime bootstrap.'
  );
  assert.ok(
    overlayRendererCall.includes('\n      isOfflineHistoryContextThread,'),
    'Overlay-renderern måste få isOfflineHistoryContextThread för read-only studio i offline historik.'
  );
  assert.ok(
    asyncCall.includes('\n      isOfflineHistoryContextThread,'),
    'Async orchestration måste få isOfflineHistoryContextThread för att blockera live-actions i offline historik.'
  );
  assert.ok(
    domCompositionCall.includes('\n      getRuntimeLeftColumnState,'),
    'DOM live composition måste få getRuntimeLeftColumnState för att kunna routa offline historik korrekt.'
  );
  assert.ok(
    domCompositionCall.includes('\n      syncSelectedCustomerIdentityForThread,'),
    'DOM live composition måste få syncSelectedCustomerIdentityForThread så kundpanelen kan följa samma selected thread som mitten.'
  );
  assert.ok(
    domCompositionCall.includes('\n      runtimeConversationIdsMatch,'),
    'DOM live composition måste få runtimeConversationIdsMatch för att matcha historiktrådar stabilt.'
  );
});

test('reply-studion låser thread-kontexten i render och actions även om arbetskö-selection ändras i bakgrunden', () => {
  const overlaySource = fs.readFileSync(RUNTIME_OVERLAY_RENDERERS_PATH, 'utf8');
  const asyncSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'runtime-async-orchestration.js'
    ),
    'utf8'
  );

  assert.ok(
    overlaySource.includes('\n      runtimeConversationIdsMatch,'),
    'Overlay-renderern måste få runtimeConversationIdsMatch så selection-pathen inte kastar och lämnar stale fallback kvar.'
  );
  assert.ok(
    overlaySource.includes(
      'let lockedReplyThreadId = !isComposeMode\n        ? asText(state.studio.replyContextThreadId || state.studio.threadId)\n        : "";'
    ),
    'Overlay-renderern ska läsa reply-studiots replyContextThreadId först i stället för att alltid använda aktuell selection.'
  );
  assert.ok(
    overlaySource.includes('const thread = isComposeMode') &&
      overlaySource.includes(': lockedReplyThreadId') &&
      overlaySource.includes(': runtimeSelectedThread;'),
    'Overlay-renderern ska rendera reply-studion från låst threadId när ett sådant finns.'
  );
  assert.ok(
    asyncSource.includes('function getLockedReplyStudioThread()') &&
      asyncSource.includes('state.studio?.replyContextThreadId || state.studio?.threadId'),
    'Async orchestration ska ha en helper som hämtar studiots låsta reply-tråd via replyContextThreadId först.'
  );
  assert.ok(
    asyncSource.includes('const thread = getLockedReplyStudioThread();'),
    'Studioactions ska använda låst reply-tråd i stället för lös selectedThread vid preview/save/send/delete.'
  );
});

test('fokusrenderern får offline-historikhelpers och studion visar read-only copy i offline-läge', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const overlaySource = fs.readFileSync(RUNTIME_OVERLAY_RENDERERS_PATH, 'utf8');

  const focusRendererStart = appSource.indexOf('PREVIEW_FOCUS_INTEL_RENDERERS.createFocusIntelRenderers({');
  const focusRendererEnd = appSource.indexOf('\n\n  const {', focusRendererStart);
  const focusRendererCall = appSource.slice(focusRendererStart, focusRendererEnd);

  assert.ok(
    focusRendererCall.includes('\n      isOfflineHistoryContextThread,'),
    'Fokusrenderern måste få isOfflineHistoryContextThread för att kunna markera offline läsläge.'
  );
  assert.ok(
    focusRendererCall.includes('\n      isOfflineHistorySelectionActive,'),
    'Fokusrenderern måste få isOfflineHistorySelectionActive för ärliga empty states i offline historik.'
  );
  assert.match(
    overlaySource,
    /Offline historik är läsläge\. Svar, förhandsvisning, senare, klar, radera och anteckningar kräver live-tråd\./,
    'Studion ska visa tydlig read-only copy när den öppnas från offline historik.'
  );
});

test('bara de godkända personsignaturerna finns kvar i appen och i overlay-HTML', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const studioSignatureProfilesBlock = appSource.match(
    /const STUDIO_SIGNATURE_PROFILES = Object\.freeze\(\[(.*?)\]\);/s
  )?.[1] || '';

  assert.match(
    studioSignatureProfilesBlock,
    /id:\s*"fazli"[\s\S]*email:\s*"fazli@hairtpclinic\.com"/,
    'STUDIO_SIGNATURE_PROFILES måste innehålla Fazli som godkänd aktiv signatur.'
  );
  assert.match(
    studioSignatureProfilesBlock,
    /id:\s*"egzona"[\s\S]*email:\s*"egzona@hairtpclinic\.com"/,
    'STUDIO_SIGNATURE_PROFILES måste innehålla Egzona som godkänd aktiv signatur.'
  );
  assert.equal(
    studioSignatureProfilesBlock.includes('kons'),
    false,
    'STUDIO_SIGNATURE_PROFILES får inte innehålla kons längre.'
  );
  assert.equal(
    studioSignatureProfilesBlock.includes('id: "contact"'),
    false,
    'STUDIO_SIGNATURE_PROFILES får inte innehålla contact längre.'
  );
  assert.ok(
    indexSource.includes('data-studio-signature="fazli"'),
    'Svarstudion måste ha en klickbar signaturknapp för Fazli.'
  );
  assert.ok(
    indexSource.includes('data-studio-signature="egzona"'),
    'Svarstudion måste ha en klickbar signaturknapp för Egzona.'
  );
  assert.equal(
    (indexSource.match(/data-studio-signature=/g) || []).length,
    2,
    'Svarstudions signaturval ska bara innehålla de två godkända profilerna.'
  );
});

test('legacy queue-demo är neutraliserad och appen använder en explicit legacy-container i stället för statiska kort', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const legacyContainerMatch = indexSource.match(
    /<div class="thread-stack" data-runtime-legacy-queue hidden aria-hidden="true"><\/div>/
  );

  assert.ok(
    appSource.includes('document.querySelector("[data-runtime-legacy-queue]")'),
    'Appen ska peka på den explicita legacy-containern och inte på allmän .thread-stack-markup.'
  );
  assert.ok(
    indexSource.includes('data-runtime-legacy-queue'),
    'HTML ska exponera en explicit legacy-container för queue-fallback.'
  );
  assert.ok(
    legacyContainerMatch,
    'Den levande queue-markupen ska bara innehålla en tom legacy-container, inte statiska demo-kort.'
  );
});
