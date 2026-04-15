const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMPOSITION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(
    startIndex,
    -1,
    `Kunde inte hitta ${functionName} i runtime-dom-live-composition.js.`
  );

  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parameterDepth += 1;
    if (character === ')') parameterDepth -= 1;
    if (character === '{' && parameterDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert.notEqual(
    bodyStart,
    -1,
    `Kunde inte hitta funktionskroppen för ${functionName}.`
  );

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(startIndex, index + 1);
    }
  }

  throw new Error(
    `Kunde inte extrahera ${functionName} från runtime-dom-live-composition.js.`
  );
}

function createElementStub() {
  return {
    dataset: {},
    classList: {
      contains() {
        return false;
      },
    },
    addEventListener() {},
    closest() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  };
}

test('bindWorkspaceInteractions kan bindas utan ReferenceError när queueHistoryList finns i domet', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');
  const createDomLiveCompositionSource = extractFunctionSource(
    source,
    'createDomLiveComposition'
  );

  const createDomLiveComposition = new Function(
    `${createDomLiveCompositionSource}; return createDomLiveComposition;`
  )();

  const composition = createDomLiveComposition({
    dom: {
      canvas: createElementStub(),
      queueContent: createElementStub(),
      queueHistoryList: createElementStub(),
    },
    helpers: {
      renderQueueHistorySection() {},
      renderRuntimeConversationShell() {},
      renderMailFeeds() {},
      renderMailFeedUndoState() {},
      renderMailboxOptions() {},
      renderMailboxAdminList() {},
      renderTemplateButtons() {},
      renderThreadContextRows() {},
      renderQuickActionRows() {},
      renderSignalRows() {},
      renderLaterOptions() {},
      applyFocusSection() {},
      applyStudioMode() {},
      buildRuntimeMailboxLoadDiagnostics() {
        return {};
      },
      decorateStaticPills() {},
      ensureRuntimeMailboxSelection() {},
      ensureRuntimeSelection() {},
      getFilteredRuntimeThreads() {
        return [];
      },
      getMailboxScopedRuntimeThreads() {
        return [];
      },
      getOrderedQueueLaneIds() {
        return [];
      },
      getQueueLaneThreads() {
        return [];
      },
      getQueueHistoryScopeKey() {
        return 'scope';
      },
      getRuntimeLeftColumnState() {
        return { mode: 'default', open: false, laneId: 'all', feedKey: '' };
      },
      getRequestedRuntimeMailboxIds() {
        return [];
      },
      getSelectedRuntimeThread() {
        return null;
      },
      reconcileRuntimeSelection() {
        return {};
      },
      normalizeKey(value, fallback = '') {
        if (typeof value === 'string') return value.trim().toLowerCase();
        if (value === undefined || value === null) return fallback;
        return String(value).trim().toLowerCase();
      },
      normalizeMailboxId(value) {
        if (typeof value === 'string') return value.trim().toLowerCase();
        if (value === undefined || value === null) return '';
        return String(value).trim().toLowerCase();
      },
      runtimeConversationIdsMatch(left, right) {
        return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
      },
      normalizeVisibleRuntimeScope() {
        return {};
      },
      loadBootstrap() {
        return Promise.resolve();
      },
      loadLiveRuntime() {
        return Promise.resolve();
      },
      loadQueueHistory() {
        return Promise.resolve();
      },
      runtimeActionEngine: {
        openRuntimeNote() {
          return Promise.resolve();
        },
        openRuntimeSchedule() {
          return Promise.resolve();
        },
        openRuntimeStudio() {},
      },
      setAppView() {},
      setContextCollapsed() {},
      setFeedback() {},
      setLaterOpen() {},
      setMailboxAdminOpen() {},
      setNoteModeOpen() {},
      setNoteOpen() {},
      setScheduleOpen() {},
      setStudioFeedback() {},
      setStudioOpen() {},
      startResize() {},
      syncCurrentNoteDraftFromForm() {},
      syncNoteCount() {},
      workspaceLimits: {},
      workspaceSourceOfTruth: {
        getSelectedThreadId() {
          return '';
        },
        getSelectedMailboxIds() {
          return [];
        },
        setSelectedMailboxIds() {},
        setSelectedOwnerKey() {},
        setActiveLaneId() {},
      },
      workspaceState: {},
      CCO_DEFAULT_REPLY_SENDER: 'contact@hairtpclinic.com',
      CCO_DEFAULT_SIGNATURE_PROFILE: 'contact',
      DEFAULT_WORKSPACE: { left: 320, main: 640, right: 320 },
      FOCUS_ACTIONS: [],
      FOCUS_SIGNALS: [],
      INTEL_ACTIONS: [],
      QUEUE_ACTIONS: [],
      asArray(value) {
        if (Array.isArray(value)) return value;
        if (value === undefined || value === null) return [];
        return [value];
      },
      asText(value, fallback = '') {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return fallback;
        return String(value);
      },
      getStudioSignatureProfile() {
        return { id: 'contact', email: 'contact@hairtpclinic.com', label: 'Contact' };
      },
    },
    state: {
      runtime: {
        queueInlinePanel: { open: false, laneId: '' },
        queueHistory: { open: false, loaded: false, scopeKey: '', items: [] },
        orderedLaneIds: [],
      },
      studio: { mode: 'reply' },
      later: { option: '' },
      customMailboxes: [],
    },
    windowObject: {
      document: {
        querySelectorAll() {
          return [];
        },
      },
    },
  });

  assert.doesNotThrow(() => {
    composition.bindWorkspaceInteractions();
  });
});

test('runtime-dom-live-composition routear offline-historikkort via den gemensamma workspace-clickkedjan', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /function handleQueueHistoryCardSelection\(/,
    'Förväntade en delad history-card-selection helper i runtime-dom-live-composition.'
  );
  assert.match(
    source,
    /handleQueueHistoryCardSelection\(event,\s*\{\s*reloadBootstrap:\s*true,\s*requireHistoryPanel:\s*true,\s*\}\)/,
    'Förväntade att historykort routas via den delade selection-helpen med historikpanelen som krav för riktiga historikkort.'
  );
  assert.match(
    source,
    /if\s*\(\s*handleQueueHistoryCardSelection\(event,\s*\{\s*reloadBootstrap:\s*true,\s*requireHistoryPanel:\s*true,\s*\}\s*\)\s*\)\s*\{\s*return true;/,
    'Förväntade att handleWorkspaceDocumentClick fångar historikkort globalt för robust offline-selection.'
  );
  assert.match(
    source,
    /restoreRuntimeReentrySnapshot\("offline_history_load",\s*\{\s*scopeMode:\s*"hint_only"\s*\}\s*\)/,
    'Förväntade att offline history restore också är hint-only så att stale listscope inte får auktoritet över vänsterkolumnen.'
  );
  assert.match(
    source,
    /scopeMode:\s*"hint_only"/,
    'Förväntade att live-load återställer reentry som hint-only för att inte låsa vänsterkolumnens scope.'
  );
  assert.match(
    source,
    /__MajorArcanaPreviewRuntimeDebug/,
    'Förväntade en debug-hook för pipeline- och reentry-diagnostik i live-compositionen.'
  );
});

test('runtime-dom-live-composition för över explicit thread-id från fokusytan när reply-studion öppnas', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /const runtimeStudioThreadId = asText\(\s*runtimeStudioOpenButton\.dataset\.runtimeStudioThreadId\s*\)/,
    'Förväntade att studio-knappen läser explicit thread-id från fokusytan.'
  );
  assert.match(
    source,
    /if\s*\(runtimeStudioThreadId\s*&&\s*runtimeStudioReadOnly\)\s*\{\s*selectOfflineHistoryConversation\(runtimeStudioThreadId,\s*\{\s*reloadBootstrap:\s*false\s*\}\);\s*\}\s*else if\s*\(runtimeStudioThreadId\)\s*\{\s*selectRuntimeThread\(runtimeStudioThreadId,\s*\{\s*reloadBootstrap:\s*false\s*\}\);\s*\}/,
    'Förväntade att studioöppningen kan återställa rätt runtime-selection innan reply-studion öppnas.'
  );
  assert.match(
    source,
    /runtimeActionEngine\.openRuntimeStudio\("reply", runtimeStudioThreadId,\s*\{\s*readOnly:\s*runtimeStudioReadOnly,\s*\}\);/,
    'Förväntade att reply-studion öppnas med samma thread-id som fokusytan visar.'
  );
});

test('runtime-dom-live-composition bär vidare customerIdentity genom live-threads utan ny härledning', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /function carryRuntimeCustomerIdentity\(/,
    'Förväntade en smal helper som bara bär vidare customerIdentity och reviewbeslut genom runtime/worklist.'
  );
  assert.ok(
    source.includes(
      'const legacyThreads = carryRuntimeCustomerIdentity(\n            buildLiveThreads(liveData, {'
    ),
    'Förväntade att thin-history-refresh bär vidare samma identity-envelope till legacy-trådar.'
  );
  assert.ok(
    source.includes(
      'const threads = carryRuntimeCustomerIdentity(\n            buildLiveThreads(mergedWorklistData, {'
    ),
    'Förväntade att merged worklist threads bär samma envelope utan ny härledning.'
  );
  assert.ok(
    source.includes(
      'const threads = carryRuntimeCustomerIdentity(\n          buildLiveThreads(mergedWorklistData, {\n            historyMessages: [],\n            historyEvents: [],\n          })'
    ),
    'Förväntade att live-load utan historik också behåller identity-envelope om den redan finns i worklist payloaden.'
  );
});

test('loadLiveRuntime canonicaliserar mailboxscope och skyddar mot stale live-loads', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /let liveRuntimeRequestSequence = 0;/,
    'Förväntade en request-sekvens i DOM live composition för att gamla mailboxladdningar inte ska kunna skriva över ett nyare scope.'
  );
  assert.match(
    source,
    /const runtimeRequestSequence = \+\+liveRuntimeRequestSequence;/,
    'Förväntade att varje loadLiveRuntime-körning får ett nytt request-id.'
  );
  assert.match(
    source,
    /const isCurrentRequest = \(\) => runtimeRequestSequence === liveRuntimeRequestSequence;/,
    'Förväntade en hjälpfunktion som känner av stale live-loads.'
  );
  assert.match(
    source,
    /map\(\(value\) =>\s*typeof canonicalizeRuntimeMailboxId === "function"\s*\?\s*canonicalizeRuntimeMailboxId\(value\)\s*:\s*normalizeMailboxId\(value\)\s*\)/,
    'Förväntade att requestedMailboxIds canonicaliseras till full mailboxadress innan AnalyzeInbox/run.'
  );
  assert.match(
    source,
    /if \(!isCurrentRequest\(\)\) return;/,
    'Förväntade att loadLiveRuntime avbryter stale körningar innan de får skriva runtime-state.'
  );
});

test('loadLiveRuntime väntar in admin-token innan runtime-status hämtas', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  const waitTokenIndex = source.indexOf('const adminToken = await waitForRuntimeAuthToken();');
  const runtimeStatusIndex = source.indexOf('const status = await apiRequest("/api/v1/cco/runtime/status");');

  assert.notEqual(waitTokenIndex, -1, 'loadLiveRuntime måste vänta in admin-token före runtime-status.');
  assert.notEqual(runtimeStatusIndex, -1, 'Kunde inte hitta runtime-statusanropet i loadLiveRuntime.');
  assert.ok(
    waitTokenIndex < runtimeStatusIndex,
    'Admin-token måste inväntas innan /api/v1/cco/runtime/status anropas.'
  );
  assert.match(
    source,
    /if\s*\(!adminToken\)\s*\{[\s\S]*authRequired:\s*true[\s\S]*return;/,
    'loadLiveRuntime ska avbryta med authRequired om ingen admin-token finns tillgänglig i tid.'
  );
  assert.match(
    source,
    /function scheduleRuntimeAuthRecovery\(/,
    'loadLiveRuntime ska hålla kvar scope och återstarta live runtime när auth-token kommer tillbaka.'
  );
  assert.match(source, /runtimeAuthRecoveryTimer = windowObject\.setTimeout\(poll, 500\);/);
  assert.match(source, /requestedMailboxIds: runtimeMailboxIds,/);
  assert.match(source, /preferredThreadId: getRuntimeReentryThreadId\(\),/);
  assert.match(source, /resetHistoryOnChange: false,/);
  assert.match(source, /clearRuntimeAuthRecoveryTimer\(\);[\s\S]*scheduleRuntimeAuthRecovery\(\{\s*requestedMailboxIds:\s*runtimeMailboxIds,\s*\}\);/);
});

test('loadLiveRuntime sparar mailboxdiagnostik för loading, auth, offline, live och runtime error', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /state\.runtime\.mailboxDiagnostics\s*=\s*buildRuntimeMailboxLoadDiagnostics\(\{\s*phase:\s*"loading"/,
    'Förväntade att loadLiveRuntime sparar en mailboxdiagnostik-snapshot direkt när loading startar.'
  );
  assert.match(
    source,
    /state\.runtime\.mailboxDiagnostics\s*=\s*buildRuntimeMailboxLoadDiagnostics\(\{\s*phase:\s*"auth_required"/,
    'Förväntade att auth-krav sparas i mailboxdiagnostiken när admin-token saknas eller auth fallerar.'
  );
  assert.match(
    source,
    /state\.runtime\.mailboxDiagnostics\s*=\s*buildRuntimeMailboxLoadDiagnostics\(\{\s*phase:\s*"offline_history"/,
    'Förväntade att offline-historikläget sparar en mailboxdiagnostik-snapshot för det valda mailboxscope.'
  );
  assert.match(
    source,
    /state\.runtime\.mailboxDiagnostics\s*=\s*buildRuntimeMailboxLoadDiagnostics\(\{\s*phase:\s*"live"/,
    'Förväntade att live-laddningen sparar en full mailboxdiagnostik-snapshot efter AnalyzeInbox och historikmerge.'
  );
  assert.match(
    source,
    /state\.runtime\.mailboxDiagnostics\s*=\s*buildRuntimeMailboxLoadDiagnostics\(\{\s*phase:\s*isAuthFailure\(statusCode,\s*message\)\s*\?\s*"auth_required"\s*:\s*"runtime_error"/,
    'Förväntade att runtime errors också skrivs till mailboxdiagnostiken med korrekt fas.'
  );
});

test('loadLiveRuntime öppnar live-listan först och värmer sedan tunn/rik historik i bakgrunden', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');
  const loadLiveRuntimeSource = extractFunctionSource(source, 'loadLiveRuntime');

  assert.match(
    source,
    /function scheduleRuntimeThinHistoryRefresh\(/,
    'Förväntade en separat helper som laddar tunn mailboxhistorik i bakgrunden efter att live-listan redan har öppnats.'
  );
  assert.match(
    source,
    /historyParams\.set\("includeBodyHtml",\s*"0"\);/,
    'Förväntade att den bakgrundsladdade mailboxhistoriken uttryckligen begär tunn historik utan bodyHtml.'
  );
  assert.match(
    source,
    /function scheduleRuntimeHistoryCoverageWarmup\(/,
    'Förväntade en separat helper som värmer historikstatus\\/backfill i bakgrunden efter initial live-load.'
  );
  assert.match(
    source,
    /function scheduleRuntimeLiveRefresh\(/,
    'Förväntade en separat helper som håller livekö och inbox-ytan färsk utan manuell reload.'
  );
  assert.match(
    source,
    /scheduleRuntimeLiveRefresh\(\{\s*requestedMailboxIds:\s*runtimeMailboxIds,\s*preferredThreadId,\s*\}\);/,
    'Förväntade att loadLiveRuntime schemalägger en ny live-refresh efter lyckad live-load.'
  );
  assert.match(
    source,
    /\/api\/v1\/cco\/runtime\/history\/status\?\$\{historyStatusParams\.toString\(\)\}/,
    'Förväntade att bakgrundsvärmningen fortfarande läser runtime history status när live-listan väl är uppe.'
  );
  assert.match(
    source,
    /\/api\/v1\/cco\/runtime\/history\/backfill/,
    'Förväntade att bakgrundsvärmningen fortfarande kan trigga mailbox history backfill vid behov.'
  );
  assert.match(
    source,
    /function hydrateRuntimeThreadHistory\(/,
    'Förväntade en separat helper som kan hydrera vald live-tråd med rik historik efter att listan redan har öppnats.'
  );
  assert.match(
    source,
    /function fetchRuntimeThreadHistoryPayload\(/,
    'Förväntade en separat helper som hämtar full history-payload för trådhydrering med bodyHtml aktiverat.'
  );
  assert.match(
    source,
    /params\.set\("conversationId",\s*targetConversationId\);[\s\S]*params\.set\("includeBodyHtml",\s*"1"\);/,
    'Förväntade att history-payload-helpers fortfarande hämtar conversation-specifik historik med bodyHtml aktiverat.'
  );
  assert.match(
    source,
    /function hasRuntimeHistoryPayloadContent\(/,
    'Förväntade att live-trådhydreringen först verifierar att historikpayload faktiskt innehåller canonical data.'
  );
  assert.match(
    source,
    /if\s*\(!hasRuntimeHistoryPayloadContent\(historyPayload\)\)\s*\{\s*return false;\s*\}/,
    'Förväntade att tom historikpayload inte längre räknas som en lyckad hydrering.'
  );
  assert.match(
    source,
    /function resolveRuntimeHistoryHydrationConversationId\(/,
    'Förväntade en separat helper som kan slå upp rikare history-conversation när live-trådens id inte matchar canonical history direkt.'
  );
  assert.match(
    source,
    /\/api\/v1\/cco\/runtime\/history\/search\?\$\{searchParams\.toString\(\)\}/,
    'Förväntade att live-hydreringen kan använda history\\/search som en smal fallback när direct conversationId missar canonical historik.'
  );
  assert.match(
    source,
    /const matchedConversationId = await resolveRuntimeHistoryHydrationConversationId\([\s\S]*!runtimeConversationIdsMatch\(matchedConversationId,\s*targetConversationId\)[\s\S]*applyHydratedRuntimeThreadHistory\(targetConversationId,\s*historyPayload\);/,
    'Förväntade att live-hydreringen kan grafta rikare canonical historik tillbaka in i den öppnade tunna tråden även när history använder ett annat conversationId.'
  );
  assert.match(
    source,
    /matchedConversationId &&[\s\S]*!runtimeConversationIdsMatch\(matchedConversationId,\s*targetConversationId\)[\s\S]*\|\|[\s\S]*!hasRuntimeHistoryPayloadContent\(historyPayload\)/,
    'Förväntade att canonical history-träffen fortfarande fetchas när direct conversationId-payloaden är tom, även om search-träffen bara skiljer i casing från den valda trådens id.'
  );
  assert.match(
    loadLiveRuntimeSource,
    /const analysisPayload = await apiRequest\("\/api\/v1\/capabilities\/AnalyzeInbox\/run"/,
    'Förväntade att loadLiveRuntime fortfarande bygger worklisten via AnalyzeInbox.'
  );
  assert.match(
    loadLiveRuntimeSource,
    /buildLiveThreads\(liveData,\s*\{\s*historyMessages:\s*\[\],\s*historyEvents:\s*\[\],\s*\}\)/,
    'Förväntade att initial live-render kan byggas utan att vänta på full tunn historik.'
  );
  assert.match(
    loadLiveRuntimeSource,
    /await finalizeRuntimeLoad\(\{[\s\S]*scheduleRuntimeThinHistoryRefresh\(\{[\s\S]*scheduleRuntimeHistoryCoverageWarmup\(runtimeMailboxIds,\s*\{[\s\S]*await requestRuntimeThreadHydration\(preferredThreadId,\s*\{\s*mailboxIds:\s*runtimeMailboxIds,\s*\}\);/,
    'Förväntade att tunn historik, historikvärmning och rik trådhydrering nu triggas efter att initial live-load har finaliserats, även om selection-to-hydration-handoffen behöver ett smalt retry-spår.'
  );
  assert.match(
    source,
    /await requestRuntimeThreadHydration\(preferredThreadId,\s*\{\s*mailboxIds:\s*runtimeMailboxIds,\s*\}\);/,
    'Förväntade att loadLiveRuntime hydrera vald tråd via det smala request-spåret direkt efter den tunna initiala mailboxladdningen.'
  );
  assert.match(
    source,
    /requestRuntimeThreadHydration\(threadId\)\.catch\(\(error\) => \{/,
    'Förväntade att manuell thread-selection också triggar rik trådhydrering i livevyn via det smala handoff-spåret.'
  );
  assert.match(
    source,
    /function recordRuntimeHydrationSkip\(/,
    'Förväntade read-only diagnostik som fångar varför hydrering hoppar av innan den ens börjar för svaga live-fall.'
  );
  assert.match(
    source,
    /const retryableReasons = new Set\(\[\s*"hydrate_skipped_not_live",\s*"hydrate_skipped_thread_not_found",\s*"hydrate_skipped_no_mailbox_scope",\s*\]\)/,
    'Förväntade att selection-to-hydration request-spåret bara retryar de tidiga, handoff-relaterade skip-fallen.'
  );
  assert.match(
    source,
    /recordRuntimeOpenFlowEvent\("hydrate_retry_scheduled"/,
    'Förväntade att retry-spåret lämnar ett tydligt open-flow-diagnostikspår när en vald live-tråd ännu inte är redo för hydrering.'
  );
  assert.match(
    source,
    /function hasCanonicalRuntimeThreadContent\(/,
    'Förväntade en smal helper som kan avgöra när en runtime-tråd redan bär tillräckligt rik canonical source och därför inte behöver graftas igen i offline-läget.'
  );
  assert.match(
    source,
    /async function hydrateOfflineHistoryThread\(/,
    'Förväntade ett separat offline history-graft-spår för öppnade trådar som körs i offline_history i stället för live-hydrering.'
  );
  assert.match(
    source,
    /state\.runtime\.offline === true[\s\S]*normalizeKey\(state\.runtime\.mode \|\| ""\) === "offline_history"[\s\S]*return hydrateOfflineHistoryThread\(targetConversationId,\s*\{\s*mailboxIds,\s*\}\);/,
    'Förväntade att requestRuntimeThreadHydration routar offline_history-val till ett separat canonical graft-spår i stället för att bara stanna i hydrate_skipped_not_live.'
  );
  assert.match(
    source,
    /requestRuntimeThreadHydration\(nextConversationId,\s*\{[\s\S]*mailboxIds:[\s\S]*\}\)\.catch\(\(error\) => \{/,
    'Förväntade att selectOfflineHistoryConversation kan bära mailboxscope in i samma smala canonical graft-spår för offline-valda historiktrådar.'
  );
  assert.match(
    source,
    /offline_canonical_direct_fetch[\s\S]*offline_canonical_search_match[\s\S]*offline_canonical_finish/,
    'Förväntade tydlig open-flow-diagnostik för direct fetch, search-match och avslut i offline canonical graft-spåret.'
  );
});

test('loadOfflineHistoryRuntime faller tillbaka till lokal historiksokning innan offline working set markeras som tom', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /function buildOfflineWorkingSetMessagesFromSearchResults\(/,
    'Förväntade en helper som mappar history\\/search-resultat till offline working set-meddelanden.'
  );
  assert.match(
    source,
    /\/api\/v1\/cco\/runtime\/history\/search\?\$\{searchParams\.toString\(\)\}/,
    'Förväntade att loadOfflineHistoryRuntime provar lokal history\\/search-fallback när full historikroute faller.'
  );
  assert.match(
    source,
    /offlineWorkingSetSource = "search_partial";/,
    'Förväntade att offline runtime markerar när working set bygger på partiell lokal historik.'
  );
  assert.match(
    source,
    /offlineWorkingSetSource = "search_empty";/,
    'Förväntade att offline runtime markerar när inget lokalt working set finns i valt mailboxscope.'
  );
  assert.match(
    source,
    /state\.runtime\.offlineWorkingSetMeta = offlineWorkingSetMeta;/,
    'Förväntade att offline working set-meta sparas i runtime-state för sann queue-summary.'
  );
  assert.match(
    source,
    /setRuntimeModeState\("offline_history", \{[\s\S]*error: resolvedOfflineMessage,[\s\S]*\}\);/,
    'Förväntade att offline fallback stannar i offline_history i stället för att falla tillbaka till generiskt runtime_error.'
  );
});

test('offline historikval hanteras via data-history-conversation och separat selectOfflineHistoryConversation-path', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /event\??\.target instanceof windowObject\.Element[\s\S]*closest\("\[data-runtime-thread\], \[data-history-conversation\]"\)/,
    'Queue history-klick måste robust kunna läsa data-history-conversation även när browsern rapporterar en textnod som click-target.'
  );

  assert.match(
    source,
    /selectOfflineHistoryConversation\(conversationId,\s*\{\s*reloadBootstrap:\s*true\s*\}\);/,
    'Offline historikkort ska routas via selectOfflineHistoryConversation i stället för vanlig live-selection.'
  );

  assert.match(
    source,
    /selectedConversationId:\s*nextConversationId/,
    'selectOfflineHistoryConversation måste skriva valt conversationId till queueHistory.selectedConversationId.'
  );

  assert.match(
    source,
    /function selectOfflineHistoryConversation\(\s*conversationId,\s*\{\s*reloadBootstrap = true,\s*mailboxIds = \[\],\s*hydrate = true\s*\} = \{\}\s*\)/,
    'Förväntade att offline historikvalet nu kan ta explicit mailboxscope och styra om graften ska väntas in separat.'
  );
  assert.match(
    source,
    /function syncRuntimeMailboxSelectionForThread\(thread, fallbackMailboxIds = \[\]\)/,
    'Förväntade en smal helper som kan hålla selectedMailboxIds i synk med vald tråd innan offline-historiken hydreras.'
  );
  assert.match(
    source,
    /syncRuntimeMailboxSelectionForThread\(getSelectedRuntimeThread\(\), mailboxIds\);/,
    'selectOfflineHistoryConversation måste använda samma mailboxscope-helper innan den startar offline-hydreringen.'
  );

  assert.match(
    source,
    /if \(hydrate !== false\) \{[\s\S]*requestRuntimeThreadHydration\(nextConversationId,\s*\{[\s\S]*mailboxIds:/,
    'Förväntade att offline history-valet kan låta samma graft-path köras antingen internt eller externt beroende på helpern som använder den.'
  );

  assert.match(
    source,
    /card\.hasAttribute\("data-history-conversation"\)[\s\S]*!card\.hasAttribute\("data-runtime-thread"\)/,
    'Queue history-klick måste först skilja riktiga historikkort från vanliga runtime-kort.'
  );

  assert.match(
    source,
    /isHistoryConversationCard && \(!mailboxScopedTarget \|\| state\.runtime\.live !== true\)/,
    'Historikval ska gå via offline-kontext när ett historikkort saknar matchande live-tråd eller när live-runtime inte är aktiv.'
  );
});

test('summarizeRuntimeOpenFlowThread bevarar canonical foundation även när foundationState saknas på tråden', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /const existingFoundationState =[\s\S]*thread\?\.foundationState[\s\S]*let foundationState = existingFoundationState;[\s\S]*if \([\s\S]*threadDocument[\s\S]*mailDocument/,
    'Förväntade att open-flow-sammanfattningen kan härleda foundation från threadDocument eller mailDocument när foundationState saknas.'
  );
  assert.match(
    source,
    /label:\s*"Mail foundation"/,
    'Förväntade att open-flow-sammanfattningen fortsatt kan markera canonical mail foundation när den finns.'
  );
});

test('selectRuntimeThread håller queue history-markeringen i synk med livevalet', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /function selectRuntimeThread\([\s\S]*state\.runtime\.queueHistory = \{[\s\S]*selectedConversationId:\s*asText\(threadId\),[\s\S]*\};/,
    'När en live-tråd väljs ska queueHistory.selectedConversationId uppdateras till samma threadId så queue och history fortsätter peka på samma operativa tråd.'
  );
});

test('queue lane och feed håller history selection ren när panelen öppnas och stängs', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /function openQueueInlineLane\(laneId\)/,
    'Förväntade en separat helper för att öppna/stänga en queue lane i inlinepanelen.'
  );
  assert.match(
    source,
    /reconcileRuntimeSelection\(getQueueLaneThreads\(normalizedLaneId\),\s*\{\s*[\s\S]*preferredThreadId:\s*workspaceSourceOfTruth\.getSelectedThreadId\(\),[\s\S]*resetHistoryOnChange:\s*true,[\s\S]*\}\);/,
    'Öppning av queue lane ska fortsätta använda samma selection-sanning och nollställa historik vid change.'
  );
  assert.match(
    source,
    /selectedConversationId:\s*"",/,
    'Queue lane open/close ska rensa vald historikconversation så panelerna inte pekar på stale history selection.'
  );
  assert.match(
    source,
    /function openQueueInlineFeed\(feedKey\)/,
    'Förväntade en separat helper för att öppna/stänga en queue feed i inlinepanelen.'
  );
  assert.match(
    source,
    /reconcileRuntimeSelection\(getMailFeedRuntimeThreads\(normalizedFeedKey\),\s*\{\s*[\s\S]*preferredThreadId:\s*workspaceSourceOfTruth\.getSelectedThreadId\(\),[\s\S]*resetHistoryOnChange:\s*true,[\s\S]*\}\);/,
    'Öppning av queue feed ska fortsätta använda samma selection-sanning och nollställa historik vid change.'
  );
});

test('queueHistoryToggle öppnar historikpanelen med den redan valda tråden som aktiv markering', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /const selectedRuntimeThread =[\s\S]*typeof getSelectedRuntimeThread === "function" \? getSelectedRuntimeThread\(\) : null;[\s\S]*const selectedRuntimeThreadId = asText\([\s\S]*selectedRuntimeThread\?\.id \|\| previousThreadId[\s\S]*\);[\s\S]*selectedConversationId:\s*nextOpen\s*\?\s*asText\(state\.runtime\.queueHistory\.selectedConversationId \|\| selectedRuntimeThreadId\)\s*:\s*""/,
    'När historikpanelen öppnas ska den seedas från den redan valda runtime-tråden så att rätt history-card kan markeras direkt.'
  );
});

test('runtime-dom-live-composition blockerar bara riktiga historikkort när historikpanelen är stängd', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /if\s*\(\s*requireHistoryPanel\s*&&\s*isHistoryConversationCard\s*&&\s*!state\.runtime\.queueHistory\?\.open\s*\)\s*\{\s*return false;\s*\}/,
    'Historikgatingen ska bara gälla data-history-conversation-kort. Vanliga runtime-trådar i arbetskön måste kunna väljas även när historikpanelen är stängd.'
  );
});

test('runtime-dom-live-composition kan seeda offline-history graft från vald historiktrad nar ingen runtime-trad finns att patcha', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /const selectedThread =\s*typeof getSelectedRuntimeThread === "function" \? getSelectedRuntimeThread\(\) : null;/,
    'Förväntade att offline-hydreringen kan falla tillbaka till den valda historiktråden som seed när conversationId ännu inte finns i runtime-listan.'
  );
  assert.match(
    source,
    /const hydratedSelectedThread = hydrateRuntimeThreadWithHistoryPayload\(\s*selectedThread,\s*historyPayload\s*\);[\s\S]*state\.runtime\.threads = \[\s*hydratedSelectedThread,/,
    'Förväntade att canonical history-payload kan skapa en runtime-tråd från vald historikrad i stället för att hydreringen bara returnerar not_applied.'
  );
});

test('runtime-dom-live-composition hanterar focusytans bilageactions via authad blob-fetch', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /function buildRuntimeMailAssetContentHref\(/,
    'Förväntade en smal helper som bygger runtime-vägen för öppna\/ladda-ner-bilagor från fokusytan.'
  );
  assert.match(
    source,
    /\/api\/v1\/cco\/runtime\/mail-asset\/content\?/,
    'Förväntade att bilageactions går via en read-only runtime-route i stället för direkt Graph-länk i klienten.'
  );
  assert.match(
    source,
    /async function handleRuntimeMailAssetAction\(/,
    'Förväntade en kontrollerad focus-handler som hämtar blobben med auth och öppnar eller laddar ner den.'
  );
  assert.match(
    source,
    /\[data-mail-asset-action\]/,
    'Förväntade att workspace-clickkedjan lyssnar på asset-actions från focusytans bilagesektion.'
  );
});

test('runtime-dom-live-composition bär selectedThreadTruth genom open-flow-diagnostiken', () => {
  const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /function summarizeSelectedRuntimeThreadTruthForDiagnostics\(/,
    'Open-flow-lagret ska ha en dedikerad summering av selected thread truth så att selection-handoff inte längre bara loggas som rå trådinstans.'
  );

  assert.match(
    source,
    /selectedThreadTruth:\s*summarizeSelectedRuntimeThreadTruthForDiagnostics\(\)/,
    'Assignment- och hydrationdiagnostiken ska bära samma selected-thread truth i stället för att olika lager loggar olika selected thread-antaganden.'
  );

  assert.match(
    source,
    /selectedThreadTruthBefore,[\s\S]*selectedThreadTruthAfter:\s*summarizeSelectedRuntimeThreadTruthForDiagnostics\(\)/,
    'Selection-eventet ska få before\/after-provenance så att vi kan se om open-flowet skiftar källa mellan runtime-, offline- och focus-spår.'
  );
});
