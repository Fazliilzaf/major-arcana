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

const DOM_LIVE_COMPOSITION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);

const FOCUS_RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-focus-intel-renderers.js'
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

const CAPTURE_LIVE_THREAD_SAMPLES_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.tmp',
  'diagnostics',
  'capture-live-thread-samples.js'
);

test('app.js routar fokusytan via selectedFocusThread och focusReadState utan att blanda in studio-logik', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /const selectedFocusThread = getSelectedRuntimeFocusThread\(\);/,
    'Förväntade att fokusytan väljer ett separat selectedFocusThread.'
  );
  assert.match(
    source,
    /const focusReadState = getRuntimeFocusReadState\(selectedFocusThread\);/,
    'Förväntade att fokusytan bygger ett separat focusReadState för truth\/legacy-proveniens.'
  );
  assert.match(
    source,
    /renderRuntimeFocusConversation\(selectedFocusThread,\s*focusReadState\);/,
    'Förväntade att fokuskonversationen renderas från den separata focus-tråden.'
  );
  assert.match(
    source,
    /renderRuntimeCustomerPanel\(selectedFocusThread,\s*focusReadState\);/,
    'Förväntade att kundpanelen följer samma focus-read-state.'
  );
  assert.match(
    source,
    /renderFocusHistorySection\(selectedFocusThread,\s*focusReadState\);/,
    'Förväntade att historiken följer samma focus-read-state.'
  );
  assert.match(
    source,
    /renderRuntimeIntel\(selectedFocusThread,\s*focusReadState\);/,
    'Förväntade att operativt stöd läser från samma focus-tråd i det här passet.'
  );
  assert.ok(
    source.includes('renderStudioShell();\n    renderWorkspaceRuntimeContext();\n    renderAnalyticsRuntime();\n    renderRuntimeIntel(selectedFocusThread, focusReadState);'),
    'Förväntade att fokusintelligensen renderas en sista gång efter övriga shell-renders så selectedFocusThread får sista ordet.'
  );
});

test('runtime-dom-live-composition sparar legacythreads parallellt och håller separat focus-truth-state för rollback', () => {
  const source = fs.readFileSync(DOM_LIVE_COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /const legacyThreads = carryRuntimeCustomerIdentity\(\s*buildLiveThreads\(liveData,/,
    'Förväntade att live-composition bär vidare identity när legacythreads byggs för focus-rollback.'
  );
  assert.match(
    source,
    /state\.runtime\.truthPrimaryLegacyThreads = legacyThreads;/,
    'Förväntade att focus-pass sparar legacythreads separat för rollback.'
  );
  assert.match(
    source,
    /const configuredFocusTruthMailboxIds =[\s\S]*getTruthPrimaryFocusMailboxIds\(\{ mailboxIds: runtimeMailboxIds \}\)/,
    'Förväntade att focus-pass använder egen mailboxallowlist för truth-read.'
  );
  assert.match(
    source,
    /state\.runtime\.focusTruthPrimary = \{[\s\S]*configuredMailboxIds: configuredFocusTruthMailboxIds,[\s\S]*activeMailboxIds: activeFocusTruthMailboxIds,[\s\S]*readOnly: true,/,
    'Förväntade att focus-pass håller en separat read-only truth-state i runtime.'
  );
});

test('focus renderers låser truth-driven focus i read-only gren utan studio-knappar och med tydlig provenance', () => {
  const source = fs.readFileSync(FOCUS_RENDERERS_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /const isTruthDrivenReadOnly =\s*focusReadState\?\.truthDriven === true && focusReadState\?\.readOnly === true;/,
    'Förväntade att focus-renderern uttryckligen känner igen truth-driven read-only-läget.'
  );
  assert.match(
    source,
    /setRuntimeActionRowsVisibility\(\s*"\[data-focus-actions\]",\s*!isOfflineHistoryThread && !isTruthDrivenReadOnly\s*\);/,
    'Förväntade att focus actionraden döljs i truth-driven read-only-läget.'
  );
  assert.match(
    source,
    /Truth-driven läsläge i fokusytan för wave 1\. Reply- och studioflödet ligger kvar utanför detta pass\./,
    'Förväntade tydlig provenancecopy för truth-driven focus.'
  );

  const conversationNextActionsStart = source.indexOf('const conversationNextActionsMarkup =');
  assert.notEqual(
    conversationNextActionsStart,
    -1,
    'Förväntade att focus-renderern bygger en conversationNextActionsMarkup-gren.'
  );
  const conversationNextActionsSource = source.slice(
    conversationNextActionsStart,
    source.indexOf('focusConversationSection.innerHTML =', conversationNextActionsStart)
  );
  const truthReadOnlyBranch = conversationNextActionsSource.match(
    /: isTruthDrivenReadOnly[\s\S]*?conversation-state-pill[\s\S]*?<\/div>`\s*: `<div class="conversation-next-actions">/
  );
  assert.ok(
    truthReadOnlyBranch,
    'Förväntade en separat truth-driven read-only-gren i conversation next actions.'
  );
  assert.doesNotMatch(
    truthReadOnlyBranch[0],
    /data-runtime-studio-open/,
    'Truth-driven read-only-grenen får inte öppna studio från fokusytan.'
  );
  assert.match(
    source,
    /mailbox truth historik/,
    'Förväntade att historiken märker ut mailbox truth-proveniens i focusytan.'
  );
  assert.match(
    source,
    /focusReadState\?\.foundationDriven/,
    'Förväntade att focus-renderern kan visa canonical mail foundation-proveniens i statusraden.'
  );
  assert.match(
    source,
    /focusReadState\?\.fallbackDriven/,
    'Förväntade att focus-renderern kan visa nar fokusytan kör legacy fallback i stället för canonical foundation.'
  );
  assert.match(
    source,
    /label:\s*isOfflineHistoryThread \? "Vald historik" : "Aktiv tråd"/,
    'Förväntade att fokusstatusraden tydligt visar om den valda konversationen är aktiv tråd eller vald historik.'
  );
  assert.match(
    source,
    /focus-customer-chip--green[\s\S]*isOfflineHistoryThread \? "Vald historik" : "Aktiv tråd"/,
    'Förväntade att kundpanelen också visar den valda tråden som en tydlig hero-chip.'
  );
  assert.match(
    appSource,
    /const focusCustomerHistoryState = document\.querySelector\("\[data-focus-customer-history-state\]"\);/,
    'Förväntade att app.js binder ett särskilt state-chip för kundhistorikrubriken.'
  );
  assert.match(
    appSource,
    /const focusCustomerHistoryListState = document\.querySelector\([\s\S]*\[data-focus-customer-history-list-state\][\s\S]*\);/,
    'Förväntade att app.js binder ett state-chip i kundhistoriklistans headerstripp.'
  );
  assert.match(
    appSource,
    /const focusCustomerHistoryListStateCopy = document\.querySelector\([\s\S]*\[data-focus-customer-history-list-state-copy\][\s\S]*\);/,
    'Förväntade att app.js binder listans förklarande state-copy.'
  );
  assert.match(
    appSource,
    /data-focus-customer-history-state/,
    'Förväntade att kundhistorikblocket exponerar en state-pill i shellen.'
  );
  assert.match(
    appSource,
    /data-focus-customer-history-list-state/,
    'Förväntade att kundhistoriklistan exponerar en egen state-pill i shellen.'
  );
  assert.match(
    appSource,
    /leadState = null/,
    'Förväntade att history-list-renderern kan ta ett separat leadState för första listkortet.'
  );
  assert.match(
    appSource,
    /focus-history-entry--state/,
    'Förväntade att listan kan rendera en tydlig state-entré före historikhändelserna.'
  );
  assert.match(
    source,
    /setCustomerHistoryState\(isOfflineHistoryThread \? "Vald historik" : "Aktiv tråd"\);/,
    'Förväntade att kundhistorikens state-pill följer samma aktiva tråd eller valda historik som resten av focusytan.'
  );
  assert.match(
    source,
    /setCustomerHistoryListState\([\s\S]*isOfflineHistoryThread \? "Vald historik" : "Aktiv tråd"/,
    'Förväntade att kundhistoriklistans state-pill följer samma aktiva tråd eller valda historik.'
  );
  assert.match(
    source,
    /label: isOfflineHistoryThread \? "Vald historik" : "Aktiv tråd"/,
    'Förväntade att första historikkortet i listan följer samma live-/historik-signal.'
  );
  assert.match(
    source,
    /Legacy fallback/,
    'Förväntade tydlig copy för legacy fallback-proveniens i focusytan.'
  );
});

test('app.js skickar in no-thread-shell-noder till focus/intel-renderern för exklusivt väntläge', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /const focusTabs = document\.querySelector\("\.focus-tabs"\);/,
    'Förväntade att focus-tabs binds i app.js för no-thread-läget.'
  );
  assert.match(
    source,
    /const focusSignals = document\.querySelector\("\[data-focus-signals\]"\);/,
    'Förväntade att focus-signals binds i app.js för no-thread-läget.'
  );
  assert.match(
    source,
    /const focusConversationLayout = document\.querySelector\("\[data-focus-conversation-layout\]"\);/,
    'Förväntade att focus-conversation-layout binds i app.js för no-thread-läget.'
  );
  assert.match(
    source,
    /const focusIntelPrimaryBody = document\.querySelector\("\[data-intel-primary-body\]"\);/,
    'Förväntade att intel primary body binds i app.js för no-thread-läget.'
  );
  assert.match(
    source,
    /const focusIntelReason = document\.querySelector\("\.focus-intel-reason"\);/,
    'Förväntade att intel-reason binds i app.js för no-thread-läget.'
  );
  assert.match(
    source,
    /const focusIntelPanels = document\.querySelector\("\.focus-intel-panels"\);/,
    'Förväntade att intel-panels binds i app.js för no-thread-läget.'
  );
  assert.match(
    source,
    /dom:\s*\{[\s\S]*focusTabs,[\s\S]*focusConversationLayout,[\s\S]*focusSignals,[\s\S]*focusIntelPrimaryBody,[\s\S]*focusIntelReason,[\s\S]*focusIntelPanels,[\s\S]*focusIntelTabs,/,
    'Förväntade att app.js skickar in focus- och intel-shellnoderna till renderern.'
  );
  assert.match(
    source,
    /function renderRuntimeFocusSignals\(\)\s*\{\s*renderSignalRows\(focusSignalRows,\s*\[\]\);\s*\}/,
    'Förväntade att den separata fokus-signalraden nu stängs helt så att Mail foundation\/Svar krävs\/Behöver åtgärd\/Hög risk inte dupliceras som bubblor.'
  );
  assert.match(
    source,
    /const declaredHasAttachments =[\s\S]*message\?\.hasAttachments === true[\s\S]*mailDocument\?\.hasAttachments === true;/,
    'Förväntade att client-fokuskedjan skiljer deklarerad attachment-flagga från faktisk attachment-truth.'
  );
  assert.match(
    source,
    /hasAttachments:\s*hasAttachmentMetadata,/,
    'Förväntade att client mailDocument bara markerar hasAttachments nar faktisk attachment-metadata finns.'
  );
  assert.match(
    source,
    /row\.hidden = !items\.length;/,
    'Förväntade att tomma signalrader döljs helt i stället för att lämna kvar luft i fokusytan.'
  );
});

test('app.js exponerar en diagnostisk history-open-hjalp som kan oppna kand conversationId via history search', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /async function openRuntimeHistoryConversationForDiagnostics\(\s*\{\s*conversationId = "",\s*mailboxIds = \[\],\s*\} = \{\}\s*\)/,
    'Förväntade en smal diagnostisk open-by-id-hjalp for history/open-flow-passet.'
  );
  assert.match(
    source,
    /\/api\/v1\/cco\/runtime\/history\/search\?\$\{params\.toString\(\)\}/,
    'Förväntade att open-by-id-hjalpen använder samma history-search-kedja for att hitta kand conversationId utanför topplistan.'
  );
  assert.match(
    source,
    /selectOfflineHistoryConversation\(nextConversationId,\s*\{[\s\S]*reloadBootstrap:\s*false,[\s\S]*mailboxIds:\s*scopedMailboxIds,[\s\S]*hydrate:\s*false,[\s\S]*\}\);/,
    'Förväntade att history-open-hjalpen routar vidare via den kapslade offline-history-pathen med mailboxscope.'
  );
  assert.match(
    source,
    /selectOfflineHistoryConversation\(nextConversationId,\s*\{[\s\S]*hydrate:\s*false,[\s\S]*\}\);[\s\S]*await requestRuntimeThreadHydration\(nextConversationId,\s*\{\s*mailboxIds:\s*scopedMailboxIds,\s*\}\)/,
    'Förväntade att den diagnostiska history-open-hjalpen väntar in samma canonical graft-spår innan vi läser fokusdiagnostiken.'
  );
  assert.match(
    source,
    /window\.MajorArcanaPreviewDiagnostics = Object\.freeze\(\{[\s\S]*openRuntimeHistoryConversationForDiagnostics,/,
    'Förväntade att den diagnostiska history-open-hjalpen exponeras via preview-diagnostiken.'
  );
});

test('focus/intel-renderers låser no-thread till en enda synlig ägare utan bakgrundslager', () => {
  const source = fs.readFileSync(FOCUS_RENDERERS_PATH, 'utf8');

  assert.match(
    source,
    /function applyFocusWaitingState\(waiting\)\s*\{[\s\S]*setElementVisibility\(focusTabs,\s*showPrimaryShell\);[\s\S]*setElementVisibility\(focusSignals,\s*showPrimaryShell\);[\s\S]*setElementVisibility\(focusBadgeRow,\s*showPrimaryShell\);[\s\S]*setElementVisibility\(focusWorkrail,\s*showPrimaryShell\);[\s\S]*focusConversationLayout\.classList\.toggle\("is-runtime-empty",\s*waiting === true\);[\s\S]*\}/,
    'Förväntade att focusytans no-thread-state döljer tabs, signaler, badges och workrail.'
  );
  assert.match(
    source,
    /if \(!thread\) \{[\s\S]*applyFocusWaitingState\(true\);[\s\S]*focusConversationSection\.innerHTML = `[\s\S]*conversation-entry-empty/,
    'Förväntade att no-thread-grenen i focusytan aktiverar exklusivt väntläge före empty-kortet renderas.'
  );
  assert.match(
    source,
    /\n\s*applyFocusWaitingState\(false\);\n\s*setRuntimeActionRowsVisibility\(\s*"\[data-focus-actions\]"/,
    'Förväntade att focusytan återöppnar shell-lagren när en riktig tråd finns.'
  );
  assert.match(
    source,
    /function applyIntelWaitingState\(waiting\)\s*\{[\s\S]*setElementVisibility\(intelGrid,\s*showIntelDetails\);[\s\S]*setElementVisibility\(focusIntelReason,\s*showIntelDetails\);[\s\S]*setElementVisibility\(focusIntelTabs,\s*showIntelDetails\);[\s\S]*setElementVisibility\(focusIntelPanels,\s*showIntelDetails\);[\s\S]*focusIntelPrimaryBody\.classList\.toggle\("is-runtime-empty",\s*waiting === true\);[\s\S]*\}/,
    'Förväntade att intel no-thread-state döljer grid, reason, tabs och paneler.'
  );
  assert.match(
    source,
    /if \(!thread\) \{[\s\S]*applyIntelWaitingState\(true\);[\s\S]*renderIntelCardGroup\(intelPanelCustomer,\s*\[\]\);[\s\S]*renderIntelCardGroup\(intelPanelActions,\s*\[\]\);/,
    'Förväntade att no-thread-grenen i operativt stöd lämnar en enda primär väntyta i stället för bakgrundskort.'
  );
  assert.match(
    source,
    /\n\s*applyIntelWaitingState\(false\);\n\s*focusIntelTitle\.textContent =/,
    'Förväntade att intel-shellen återöppnas när en riktig live-tråd finns.'
  );
  assert.match(
    source,
    /const latestConversationBodyRaw = asText\(latestMessage\.conversationBody\)\.trim\(\);[\s\S]*const latestMessageBodyRaw = asText\(latestMessage\.body\)\.trim\(\);[\s\S]*latestConversationLooksNoisy[\s\S]*Ingen förhandsvisning tillgänglig[\s\S]*thread\.preview[\s\S]*buildConversationDocumentMarkup\(/,
    'Förväntade att fokusytan kan falla tillbaka till renare bodytext och samtidigt rendera öppnade mail via den canonical document-renderern.'
  );
});

test('app.js skickar in sanitizeConversationHtmlForDisplay till focus-renderern sa att fokusytan kan bevara html-signaturer kontrollerat', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /function sanitizeConversationHtmlForDisplay\(html = ""\)\s*\{/,
    'Förväntade en dedikerad sanitizer för HTML-signatur/body fidelity i fokusytan.'
  );
  assert.match(
    source,
    /helpers:\s*\{[\s\S]*resetRuntimeHistoryFilters,[\s\S]*sanitizeConversationHtmlForDisplay,[\s\S]*setButtonBusy,/,
    'Förväntade att app.js skickar in HTML-sanitizern till focus-renderern.'
  );
  assert.match(
    source,
    /const hasStructuredBodyCue =[\s\S]*sanitizedText\.length >= 180[\s\S]*richBlockCount >= 6[\s\S]*if \(!hasRichMarkupCue \|\| \(!hasIdentityCue && !hasStructuredBodyCue\)\) return "";/,
    'Förväntade att HTML-sanitizern tillåter säker, strukturerad body-html även när mailet saknar klassiska signaturmarkörer.'
  );
  assert.match(
    source,
    /const normalizeConversationStyleValue = \(property = "", value = ""\) =>[\s\S]*case "font-size":[\s\S]*case "line-height":[\s\S]*case "width":[\s\S]*case "max-width":[\s\S]*case "height":[\s\S]*case "max-height":[\s\S]*conversation-html-structured-block[\s\S]*conversation-html-footer-fragment/,
    'Förväntade att HTML-sanitizern nu kompakterar aggressiva inline-stilar och markerar strukturerade/footer-bärande block för en mer kontrollerad fokusrendering.'
  );
  assert.ok(
    source.includes('const convertConversationLengthToPx = (value = 0, unit = "px") =>') &&
      source.includes("return `${serializedValue}px`;"),
    'Förväntade att HTML-sanitizern normaliserar aggressiva rem/em/pt-längder till px så att rich-html-mail inte kan blåsa upp text till gigantiska storlekar i document mode.'
  );
  assert.match(
    source,
    /const shouldDropConversationImage = \(node\) =>[\s\S]*looksSpacerRatio[\s\S]*looksTrackingPixel[\s\S]*Array\.from\(template\.content\.querySelectorAll\("p,div,td,span,li"\)\)\.forEach\(\(node\) => \{[\s\S]*trimConversationBreakEdges\(node\);[\s\S]*const maxBreaks =[\s\S]*node\.tagName === "TD" \|\| node\.tagName === "DIV"[\s\S]*collapseConversationBreakRuns\(node,\s*maxBreaks\);/,
    'Förväntade att HTML-sanitizern tar bort spacer-/trackingbilder och trimmar tomma break-runs mer aggressivt i tabell- och containerblock så att tabellmail inte drar med stora tomma ytor in i fokusytan.'
  );
  assert.match(
    source,
    /const looksConversationHiddenPreheaderNode = \(node\) =>[\s\S]*isConversationZeroWidthStyle\(style\)[\s\S]*looksConversationNearWhite\(color\)/,
    'Förväntade att HTML-sanitizern kan droppa zero-width-preheaders och ghost-block i rich-html-mail.'
  );
  assert.ok(
    source.includes('const resolveConversationDisplayUrl = (value = "") =>') &&
      source.includes('safelinks\\.protection\\.outlook\\.com') &&
      source.includes('const buildConversationCompactLinkLabel = (href = "", text = "") =>') &&
      source.includes('Öppna länk'),
    'Förväntade att HTML-sanitizern kan lösa upp SafeLinks och komprimera råa URL-texter till en kontrollerad länketikett.'
  );
  assert.ok(
    source.includes('const isHairTpSignatureHtml =') &&
      source.includes('node.getAttribute("width")') &&
      source.includes('node.getAttribute("height")') &&
      source.includes('CCO_HAIR_TP_SIGNATURE_LOGO_URL'),
    'Förväntade att HTML-sanitizern kan byta ut den gamla Hair TP-loggan till den nya i äldre signatur-html utan att skriva om rå historikdata.'
  );
  assert.match(
    source,
    /node\.classList\.add\("conversation-html-link-fallback"\)/,
    'Förväntade att komprimerade raw-url-fallbacklänkar märks upp explicit i rich-html-kedjan.'
  );
  assert.ok(
    source.includes('const compactConversationRawUrlTextNode = (node) =>') &&
      source.includes('node.replaceChildren(fragment);'),
    'Förväntade att HTML-sanitizern kan komprimera verkliga råa URL-textnoder, inte bara länkar med href-attribut.'
  );
  assert.ok(
    source.includes('const mergedSignatureTruth = {') &&
      source.includes('const mergedSignatureBlock =') &&
      source.includes('signatureBlock: mergedSignatureBlock,'),
    'Förväntade att app-lagret bär vidare canonical signatur-truth när legacy- och derived-threaddata mergas ihop.'
  );
});

test('capture-live-thread-samples bygger en tydlig regression summary for foundation-vs-fallback', () => {
  const source = fs.readFileSync(CAPTURE_LIVE_THREAD_SAMPLES_PATH, 'utf8');

  assert.ok(
    source.includes("suite: 'mail_fidelity_regression_guard'") &&
      source.includes('accountsChecked') &&
      source.includes('familiesChecked') &&
      source.includes('foundationDrivenCount') &&
      source.includes('fallbackDrivenCount') &&
      source.includes("overallVerdict"),
    'Förväntade att regression-capturen sammanfattar vilka konton/familjer som kördes och hur många fall som öppnades foundation-vs-fallback.'
  );
  assert.ok(
    source.includes("const markdownPath = path.join(OUT_ROOT, 'summary.md');") &&
      source.includes('buildMarkdownSummary(summary, manifest)'),
    'Förväntade att regression-capturen skriver en lättläst markdown-summary utöver JSON-artifacten.'
  );
});

test('focus-renderern anvander sanitiserad rich html i conversation-bubblan innan den faller tillbaka till text', () => {
  const source = fs.readFileSync(FOCUS_RENDERERS_PATH, 'utf8');

  assert.match(
    source,
    /function buildConversationContentMarkup\(message,\s*\{ history = false \} = \{\}\)\s*\{[\s\S]*sanitizeConversationHtmlForDisplay[\s\S]*conversation-history-text conversation-history-text-rich[\s\S]*conversation-mail-body conversation-mail-body-rich conversation-mail-body-document conversation-mail-body-plain[\s\S]*conversation-mail-body conversation-mail-body-rich conversation-mail-body-document[\s\S]*conversation-mail-body conversation-mail-body-document conversation-mail-body-plain[\s\S]*escapeHtml\(bodyText\)/,
    'Förväntade att fokus-renderern använder document mail-body som huvudkontrakt för öppnade mail i stället för bubble-/conversation-containern.'
  );
  assert.match(
    source,
    /const deriveConversationRichContract = \(value = "",\s*\{ history = false \} = \{\}\) =>[\s\S]*conversation-rich-compact[\s\S]*conversation-rich-identity[\s\S]*conversation-rich-tabular[\s\S]*conversation-mail-body conversation-mail-body-rich conversation-mail-body-document[\s\S]*variantClass/,
    'Förväntade att fokus-renderern låser öppnade mail till document-läget i stället för att växla tillbaka till bubble-/conversation-containern.'
  );
  assert.ok(
    source.includes('function buildConversationDocumentMarkup(message, { history = false } = {})'),
    'Förväntade att Phase 4 introducerar en canonical document-renderer för öppnade mail.'
  );
  assert.ok(
    source.includes('function buildConversationStructuredSections(message, mailThreadMessage)') &&
      source.includes('const structuredSections = buildConversationStructuredSections(message, mailThreadMessage);'),
    'Förväntade att focus-renderern nu sektionerar mail-html innan document-renderingen så att body, signatur och quoted-content kan bära olika struktur.'
  );
  assert.ok(
    source.includes('function buildConversationSignatureDisplay(message, structuredSections = {})') &&
      source.includes('function deriveConversationSignatureTruth({ text = "", html = "" } = {})') &&
      source.includes('function normalizeConversationSignatureTruth(signatureBlock = null)') &&
      source.includes('signatureTruth.visibleInReadSurface !== true'),
    'Förväntade att focus-renderern nu konsumerar canonical signatur-truth först och bara faller tillbaka till lokal bedömning när truth saknas.'
  );
  assert.ok(
    source.includes("const canonicalSectionMode = normalizeKey(mailThreadMessage?.contentSections?.mode);") &&
      source.includes("canonicalSectionMode === \"html_structured\""),
    'Förväntade att focus-renderern nu prioriterar canonical html-sektioner från hydratorn före lokal fallback-gissning.'
  );
  assert.ok(
    source.includes('function getMimePreferredConversationBody(message)') &&
      source.includes('mailDocument?.mime?.parsed?.body') &&
      source.includes('mailDocument?.fidelity?.mimePreferredBodyKind') &&
      source.includes('mimePreferredBody?.kind === "html" ? mimePreferredBody.html : ""'),
    'Förväntade att focus-renderern i Phase C kan konsumera MIME-backed canonical body direkt när hydrator- eller previewfälten fortfarande är tunna.'
  );
  assert.ok(
    source.includes('mailThreadMessage?.contentSections?.mimePreferredBodyKind') &&
      source.includes('canonicalMimePreferredKind'),
    'Förväntade att focus-renderern uttryckligen kan föredra MIME-backed body-kind i canonical sektioneringen.'
  );
  assert.ok(
    source.includes('buildConversationSecondarySectionMarkup') &&
      source.includes('Providerinfo') &&
      source.includes('Signatur') &&
      source.includes('Tidigare i tråden'),
    'Förväntade att document-renderern delar upp öppnade mail i providerinfo, signatur och tidigare tråd.'
  );
  assert.ok(
    source.includes('function summarizeConversationSecondaryCopy(value = "", fallback = "Visa mer", limit = 72)') &&
      source.includes('const systemSummary =') &&
      source.includes('collapsible: true,') &&
      source.includes('summary: systemSummary'),
    'Förväntade att providerinfo nu sammanfattas till en enda kompakt summary-first-sektion i stället för flera öppna block.'
  );
  assert.ok(
    source.includes('summary:\n                signatureDisplay.summary ||') &&
      source.includes('Visa avsändarfooter'),
    'Förväntade att signaturdelen nu hålls summary-first även när den visas, så att läsvyn inte blåser upp sekundärinnehåll.'
  );
  assert.ok(
    source.includes('const lifecycleSummary = [thread.lifecycleLabel, thread.followUpLabel || thread.lastActivityLabel]') &&
      source.includes('function buildFocusStatusTokenMarkup({ label = "", tone = "neutral", icon = "" } = {})') &&
      source.includes('const focusStatusItems = [') &&
      source.includes('data-pill-icon="${escapeHtml(normalizedIcon)}"') &&
      source.includes('const focusStatusMarkup = buildFocusStatusRowMarkup(focusStatusItems);') &&
      source.includes('focusBadgeRow.innerHTML = "";') &&
      source.includes('focusBadgeRow.hidden = true;'),
    'Förväntade att fokusytan nu samlar status, foundation, livscykel och risk i en enda rad med semantiska ikoner/färger och stänger badge-raden helt.'
  );
  assert.ok(
    source.includes('html: signatureHtml') &&
      source.includes('mailThreadMessage?.signatureBlock?.truth') &&
      source.includes('html: asText(block?.html)') &&
      source.includes('html: quotedHtml') &&
      source.includes('structuredSections?.primaryBody?.html'),
    'Förväntade att öppnade mail bär vidare primary-, signature-, system- och quoted-html samt canonical signatur-truth när sektionerna redan finns.'
  );
  assert.ok(
    source.includes('function buildConversationAssetSectionMarkup(message, { history = false } = {})') &&
      source.includes('return "";'),
    'Förväntade att bodyns Bilagor & tillgångar-sektion nu är borttagen så att assets bara lever i headerinteraktionen.'
  );
  assert.ok(
    source.includes('function buildConversationAssetActionsMarkup(asset, { history = false, mailboxId = "", messageId = "" } = {})') &&
      source.includes('data-mail-asset-action="${escapeHtml(') &&
      source.includes('data-mail-asset-attachment-id="${escapeHtml(') &&
      source.includes('const label = action === "open" ? "Öppna" : "Ladda ner";'),
    'Förväntade att focus-renderern nu bygger riktiga Öppna/Ladda ner-actions ovanpå foundationens downloadable assets.'
  );
  assert.ok(
    source.includes('const assetMarkup = buildConversationAssetSectionMarkup(message, { history });') &&
      source.includes('${assetMarkup}') &&
      source.includes('buildConversationHeaderAssetStripMarkup(latestMessage, {'),
    'Förväntade att assets nu flyttas till headerinteraktionen medan document-renderern fortfarande kan bära samma flöde för body, signatur och quoted content.'
  );
  assert.ok(
    source.includes('Öppna Svarstudio'),
    'Förväntade att arbetsraden åter använder Öppna Svarstudio som tydlig primär knappetikett.'
  );
  assert.ok(
    source.includes('function buildConversationHeaderAssetStripMarkup(message, { history = false } = {})') &&
      source.includes('data-conversation-header-assets-toggle') &&
      source.includes('buildConversationHeaderAssetStripMarkup(latestMessage, {') &&
      source.includes('buildConversationHeaderAssetStripMarkup(message, { history: true })'),
    'Förväntade att fokusytan nu kan visa en kompakt tillgångsrad direkt i message-headern för både senaste mailet och äldre historik.'
  );
  assert.ok(
    source.includes('conversation-header-assets-popover') &&
      source.includes('buildConversationAssetItemMarkup(asset'),
    'Förväntade att assets nu öppnas via headerns popover i stället för som textblock i konversationsytan.'
  );
  assert.ok(
    source.includes('const hairTpSignatureProfilesByMailbox = Object.freeze({') &&
      source.includes('const hairTpSignatureProfilesByIdentity = Object.freeze({') &&
      source.includes('function extractConversationHairTpProfileHint(message = {}, signatureBlock = {})') &&
      source.includes('function extractConversationHairTpSignatureFromPrimaryBody(') &&
      source.includes('function normalizeConversationHairTpSignaturePresentation(message = {}, signatureBlock = {})') &&
      source.includes('function trimConversationPrimaryBodyBeforeSignature(') &&
      source.includes('img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png') &&
      source.includes('data:image/svg+xml;charset=utf-8') &&
      source.includes('Egzona Krasniqi') &&
      source.includes('Fazli Krasniqi'),
    'Förväntade att focus-renderern canonicaliserar Hair TP-signaturer till den godkända kandidatmarkuppen med personnamn, beige logo och ikonrad samt trimmar dubbla avslut före signaturen.'
  );
  assert.ok(
    source.includes('buildConversationDocumentMarkup(message, { history: true })'),
    'Förväntade att även äldre meddelanden i historiken använder samma document-renderer i stället för att gå runt hydratorn.'
  );
  assert.ok(
    source.includes('conversationBody: latestConversationBody') &&
      source.includes('buildConversationDocumentMarkup('),
    'Förväntade att senaste öppnade mailet renderas via document-renderern i fokusytan.'
  );
});

test('styles.css tvingar dolda focus/intel-shelllager att verkligen försvinna i väntlägen', () => {
  const source = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    source,
    /\.focus-tabs\[hidden\],[\s\S]*\.focus-badge-row\[hidden\],[\s\S]*\.focus-workrail\[hidden\],[\s\S]*\.focus-intel-grid\[hidden\],[\s\S]*\.focus-intel-reason\[hidden\],[\s\S]*\.focus-intel-tabs\[hidden\],[\s\S]*\.focus-intel-panels\[hidden\],[\s\S]*display:\s*none\s*!important;/,
    'Förväntade att dolda focus/intel-shelllager forceras bort med display:none !important i väntläge.'
  );
});

test('styles.css ger rich-html i fokusytan ett kompakt renderkontrakt utan att ta bort identitetsbärande footerfragment', () => {
  const source = fs.readFileSync(STYLES_PATH, 'utf8');
  const focusRendererSource = fs.readFileSync(FOCUS_RENDERERS_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /\.conversation-bubble-rich,[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*gap:\s*10px;[\s\S]*overflow-wrap:\s*anywhere;/,
    'Förväntade att rich-html-bubblor följer en gemensam vertikal blockstruktur i fokusytan.'
  );
  assert.match(
    source,
    /\.conversation-body,[\s\S]*\.conversation-history-body \{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*box-sizing:\s*border-box;/,
    'Förväntade att body- och history-wrappers delar en gemensam strukturell grund i fokusytan.'
  );
  assert.match(
    source,
    /\.conversation-body \{[\s\S]*gap:\s*14px;[\s\S]*padding:\s*0;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/,
    'Förväntade att öppnad mailbody nu ligger som fri dokumentyta utan rundad kortcontainer.'
  );
  assert.match(
    source,
    /\.conversation-history-body \{[\s\S]*padding:\s*12px 14px 14px;[\s\S]*border-radius:\s*16px;[\s\S]*border:\s*1px solid rgba\(221, 209, 199, 0\.64\);[\s\S]*background:/,
    'Förväntade att äldre historikmeddelanden kan behålla en lättare sekundär container utan att senaste öppnade mailet gör det.'
  );
  assert.match(
    source,
    /\.conversation-mail-body \{[\s\S]*width:\s*100%;[\s\S]*padding:\s*0;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*overflow:\s*visible;/,
    'Förväntade att själva mailkroppen inte längre renderas som en egen bubbelsurface inne i dokumentytan.'
  );
  assert.match(
    source,
    /\.conversation-mail-document \{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*gap:\s*10px;[\s\S]*width:\s*100%;/,
    'Förväntade att Phase 4 ger öppnade mail en egen documentyta i stället för att allt pressas in i samma bubbelyta.'
  );
  assert.match(
    source,
    /\.conversation-mail-section \{[\s\S]*gap:\s*3px;[\s\S]*padding:\s*6px 0 0;[\s\S]*border:\s*0;[\s\S]*border-top:\s*1px solid rgba\(214, 203, 194, 0\.64\);[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/,
    'Förväntade att sekundärsektionerna nu är plattare och mindre kortlika i läsvyn.'
  );
  assert.ok(
    source.includes('.conversation-mail-section-label,') &&
      source.includes('.conversation-mail-section-summary') &&
      source.includes('text-transform: uppercase;'),
    'Förväntade att document-renderern har tydliga sektionstitlar.'
  );
  assert.ok(
    source.includes('.conversation-mail-section-copy {') &&
      source.includes('white-space: pre-line;'),
    'Förväntade att sekundärsektionerna behåller läsbar multiline-copy.'
  );
  assert.ok(
    source.includes('.conversation-mail-section-copy-rich {') &&
      source.includes('white-space: normal;'),
    'Förväntade att sektioner som bär rik html kan rendera verklig mailstruktur i stället för att plattas till som text.'
  );
  assert.ok(
    source.includes('.conversation-mail-section-system {') &&
      source.includes('.conversation-mail-section-signature {') &&
      source.includes('.conversation-mail-section-quoted {'),
    'Förväntade att providerinfo får en egen dämpad sektionston i document-läget.'
  );
  assert.ok(
    source.includes('.conversation-mail-section-assets {') &&
      source.includes('.conversation-mail-section-assets-compact {') &&
      source.includes('.conversation-mail-asset-header {') &&
      source.includes('.conversation-mail-asset-list {'),
    'Förväntade att Phase 2-foundation nu får en egen kontrollerad assetsektion i fokusytans document-läge.'
  );
  assert.ok(
    source.includes('.conversation-mail-asset-pill {') &&
      source.includes('.conversation-mail-asset-item {') &&
      source.includes('.conversation-mail-asset-state {'),
    'Förväntade att attachment- och inline-tillgångar renderas som tydliga CCO-element, inte som rå mailklient-output.'
  );
  assert.ok(
    source.includes('.conversation-mail-asset-actions {') &&
      source.includes('.conversation-mail-asset-action {') &&
      source.includes('.conversation-mail-asset-side {'),
    'Förväntade att assetsektionen nu har en egen actionsrad för Öppna/Ladda ner utan att bryta den lugna dokumentytan.'
  );
  assert.ok(
    source.includes('.conversation-header-assets {') &&
      source.includes('.conversation-header-assets-summary {') &&
      source.includes('.conversation-header-asset-token {') &&
      source.includes('.conversation-header-asset-token-label {') &&
      source.includes('.conversation-header-assets-popover {'),
    'Förväntade att fokusytan nu har en kompakt assetrad i message-headern med egen klickbar detaljvy.'
  );
  assert.ok(
    source.includes('.conversation-header-assets[open] {') &&
      source.includes('flex-basis: 100%;') &&
      source.includes('.conversation-header-assets-popover {') &&
      source.includes('position: static;') &&
      source.includes('background: transparent;') &&
      source.includes('box-shadow: none;'),
    'Förväntade att headerns assetdetaljer öppnas inline i flödet utan flytande popover-kort eller extra inramning.'
  );
  assert.ok(
    source.includes('.conversation-header-asset-token {') &&
      source.includes('border: 0;') &&
      source.includes('.conversation-mail-asset-action {') &&
      source.includes('text-decoration: underline;') &&
      source.includes('background: transparent;'),
    'Förväntade att assetindikatorer och actions är platta och utan bubbla-/chip-styling i det här passet.'
  );
  assert.ok(
    source.includes('.conversation-mail-asset-item:first-child {') &&
      source.includes('border-top: 0;'),
    'Förväntade att enstaka assetrader inte längre presenteras som egna små kort i läsvyn.'
  );
  assert.match(
    source,
    /\.conversation-mail-body-plain,[\s\S]*\.conversation-mail-body-conversation \{[\s\S]*max-width:\s*none;[\s\S]*\.conversation-mail-body-document \{[\s\S]*max-width:\s*none;[\s\S]*padding:\s*0;[\s\S]*border-radius:\s*0;/,
    'Förväntade att öppnade mail inte längre begränsas av bubble-liknande kroppsbredder eller inre bubbelform i fokusytan.'
  );
  assert.match(
    source,
    /\.conversation-rich-compact \.conversation-html-structured-block,[\s\S]*\.conversation-rich-compact table \{[\s\S]*max-width:\s*min\(100%, 520px\) !important;/,
    'Förväntade att tyngre rich-html-block kompakteras till en kontrollerad bredd i stället för att dominera fokusytan slumpmässigt.'
  );
  assert.match(
    source,
    /\.conversation-rich-tabular \.conversation-html-structured-block,[\s\S]*\.conversation-rich-tabular table \{[\s\S]*display:\s*inline-table;[\s\S]*max-width:\s*min\(100%, 460px\) !important;[\s\S]*table-layout:\s*auto;[\s\S]*margin:\s*0 !important;/,
    'Förväntade att tabell-tung inkommande html får ett stramare tabular-läge så att stora boknings- och servicemail inte stretchar ut till råa tomytor.'
  );
  assert.match(
    source,
    /\.conversation-rich-tabular tbody,[\s\S]*\.conversation-rich-tabular tr \{[\s\S]*display:\s*block;[\s\S]*\.conversation-rich-tabular td:only-child,[\s\S]*\.conversation-rich-tabular th:only-child \{[\s\S]*display:\s*block;[\s\S]*width:\s*auto !important;/,
    'Förväntade att en-kolumniga booking/service-tabeller flattenas försiktigt i tabular-läget så att wrapper-rader inte lämnar kvar stora vertikala scaffold-ytor.'
  );
  assert.match(
    source,
    /\.conversation-mail-body-rich img,[\s\S]*max-width:\s*min\(220px,\s*100%\);[\s\S]*\.conversation-mail-document-primary \.conversation-mail-body-rich img \{[\s\S]*max-width:\s*min\(380px,\s*100%\);[\s\S]*\.conversation-mail-section-signature \.conversation-mail-body-rich img \{[\s\S]*max-width:\s*min\(220px,\s*100%\);/,
    'Förväntade att primary body och signatur nu får olika, mer rimliga bildregler så att inlinebilder och signaturloggor inte plattas till samma lilla standardstorlek.'
  );
  assert.match(
    source,
    /\.conversation-mail-body\.conversation-rich-tabular \{[\s\S]*overflow-x:\s*auto;[\s\S]*padding:\s*0 0 2px;[\s\S]*border-radius:\s*0;[\s\S]*\.conversation-mail-body\.conversation-rich-tabular \.conversation-html-structured-block,[\s\S]*\.conversation-mail-body\.conversation-rich-tabular table \{[\s\S]*display:\s*table;[\s\S]*width:\s*auto !important;[\s\S]*min-width:\s*min\(100%, 360px\);[\s\S]*table-layout:\s*auto;[\s\S]*\.conversation-mail-body\.conversation-rich-tabular tbody \{[\s\S]*display:\s*table-row-group;[\s\S]*\.conversation-mail-body\.conversation-rich-tabular tr \{[\s\S]*display:\s*table-row;[\s\S]*\.conversation-mail-body\.conversation-rich-tabular td,[\s\S]*\.conversation-mail-body\.conversation-rich-tabular th \{[\s\S]*display:\s*table-cell;[\s\S]*width:\s*auto !important;[\s\S]*padding-right:\s*10px !important;[\s\S]*vertical-align:\s*top !important;/,
    'Förväntade att dokumentläget bevarar tabellsemantik lugnare i MIME-backed booking- och servicemail i stället för att bryta upp allt till block.'
  );
  assert.match(
    source,
    /\.conversation-header-asset-token-label \{[\s\S]*font-size:\s*12px;[\s\S]*line-height:\s*14px;[\s\S]*\.conversation-header-asset-token-icon \{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;[\s\S]*\.conversation-header-asset-token-icon svg \{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;[\s\S]*\.conversation-header-asset-token-count \{[\s\S]*font-size:\s*15px;/,
    'Förväntade att tillgångssymbolerna i message-headern får tydliga etiketter i samma färgton utan att förlora sin kompakta rad.'
  );
  assert.match(
    source,
    /\.conversation-header-asset-token-neutral \{[\s\S]*color:\s*var\(--accent-violet\);[\s\S]*\.conversation-header-asset-token-available \{[\s\S]*color:\s*var\(--accent-cyan\);[\s\S]*\.conversation-header-asset-token-attention \{[\s\S]*color:\s*var\(--accent-indigo\);/,
    'Förväntade att Bilaga, Bild och Extern använder CCO:s egna accentfärger i header-raden i stället för fristående specialtoner.'
  );
  assert.ok(
    focusRendererSource.includes('function getConversationAssetFamily(asset = {}) {') &&
      focusRendererSource.includes('const canonicalFamily = normalizeKey(asset?.family);') &&
      focusRendererSource.includes('return canonicalFamily;') &&
      focusRendererSource.includes(
        'if (renderState === "external_https" || renderMode === "external_url") {'
      ) &&
      focusRendererSource.includes('return "external";') &&
      focusRendererSource.includes('if (disposition === "attachment") return "attachment";') &&
      focusRendererSource.includes(
        'if (disposition === "inline" && (kind === "image" || contentType.startsWith("image/"))) {'
      ) &&
      focusRendererSource.includes('if (disposition === "inline") return "inline";') &&
      focusRendererSource.includes('if (kind === "attachment") return "attachment";'),
    'Förväntade att asset-typen nu härleds via en gemensam familjefunktion så att CCO håller isär extern länk, bilaga och bild i mailet konsekvent.'
  );
  assert.ok(
    focusRendererSource.includes('asArray(mailDocument?.assets).length') &&
      focusRendererSource.includes('allAssets.filter((asset) => getConversationAssetFamily(asset) === "attachment")') &&
      focusRendererSource.includes('allAssets.filter((asset) => getConversationAssetFamily(asset) === "external")'),
    'Förväntade att fokusrendern nu konsumerar canonical assetlistan när den finns i stället för att bara räkna på sena attachments/inline-fallbacks.'
  );
  assert.ok(
    focusRendererSource.includes('if (family === "external") return "Extern länk";') &&
      focusRendererSource.includes('if (family === "attachment") return "Bilaga";') &&
      focusRendererSource.includes('return "Bild i mailet";'),
    'Förväntade att etiketteringen nu använder tydliga CCO-termer: Extern länk, Bilaga och Bild i mailet.'
  );
  assert.ok(
    appSource.includes('function ensureClientMailDocumentAssetTruth(') &&
      appSource.includes('const synthesizedAttachmentAssets = asArray(message?.attachments)') &&
      appSource.includes('buildClientAttachmentAssetFromMetadata(') &&
      appSource.includes('family: isInline ? "inline" : "attachment"'),
    'Förväntade att client preview-pathen nu kan bära rå attachmentmetadata från live-entryn in i mailDocument i stället för att tappa Bilaga när focus öppnas på legacy-banan.'
  );
  assert.ok(
    appSource.includes('const getMailDocument = (entry = {}) =>') &&
      appSource.includes('typeof ensureClientMailDocumentAssetTruth === "function"') &&
      appSource.includes('ensureClientMailDocumentAssetTruth(entry, {') &&
      appSource.includes('ensureClientMailDocumentAssetTruth(message, { sourceStore })'),
    'Förväntade att både preview-byggaren och client mailThreadMessage nu läser samma augmenterade mailDocument-truth i attachment-passet.'
  );
  assert.ok(
    focusRendererSource.includes('return downloadAvailable ? "Bifogad fil" : "Bilagemetadata";') &&
      focusRendererSource.includes('if (family === "external") {') &&
      focusRendererSource.includes('return "Extern länk";'),
    'Förväntade att detaljvyn nu använder sannare statuscopy för riktiga bilagor respektive externa länkar.'
  );
  assert.ok(
    focusRendererSource.includes('data-mail-asset-family="${escapeHtml(family)}"') &&
      focusRendererSource.includes('data-mail-asset-family="${escapeHtml(\n        kind\n      )}"'),
    'Förväntade att både header-tokens och detaljrader bär explicit assetfamilj så att CCO kan hålla isär typerna konsekvent.'
  );
  assert.match(
    source,
    /\.conversation-state-pill \{[\s\S]*min-height:\s*28px;[\s\S]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.82\);[\s\S]*background:[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.9\)[\s\S]*rgba\(244,\s*238,\s*232,\s*0\.86\)[\s\S]*color:\s*rgba\(183,\s*120,\s*34,\s*0\.98\);/,
    'Förväntade att Senaste-pillens ton nu följer samma bubbelfamilj som actions ovanför men med en gladare accent.'
  );
  assert.match(
    source,
    /\.conversation-rich-identity \.conversation-html-footer-fragment \{[\s\S]*font-size:\s*12px;[\s\S]*line-height:\s*18px;/,
    'Förväntade att footer-/signaturfragment hålls synliga men lugnare än huvudinnehållet.'
  );
  assert.match(
    source,
    /\.focus-badge-row \{[\s\S]*display:\s*none !important;/,
    'Förväntade att den separata badge-raden i konversationsytan nu är helt borttagen.'
  );
  assert.ok(
    source.includes('.focus-status-token {') &&
      source.includes('.focus-status-token-status {') &&
      source.includes('.focus-status-token-waiting {') &&
      source.includes('.focus-status-token-foundation {') &&
      source.includes('.focus-status-token-lifecycle {') &&
      source.includes('.focus-status-token-risk {') &&
      source.includes('.focus-status-separator {'),
    'Förväntade att den samlade fokusstatusraden återfår semantiska färger och symboltoner utan att gå tillbaka till bubblor.'
  );
  assert.match(
    source,
    /\.conversation-next-button \{[\s\S]*min-height:\s*44px;[\s\S]*padding:\s*0 22px;[\s\S]*border:\s*1px solid rgba\(178,\s*91,\s*126,\s*0\.72\);[\s\S]*color:\s*rgba\(255,\s*248,\s*251,\s*0\.98\);[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*800;[\s\S]*text-decoration:\s*none;/,
    'Förväntade att Svarstudio-sektionen nu följer den större magenta primärknappen från referensen.'
  );
  assert.match(
    source,
    /\.conversation-next-icon-button \{[\s\S]*width:\s*38px;[\s\S]*height:\s*38px;[\s\S]*border:\s*1px solid rgba\(231,\s*220,\s*214,\s*0\.92\);[\s\S]*border-radius:\s*999px;[\s\S]*background:/,
    'Förväntade att snabbikonerna bredvid Svarstudio nu renderas som separata ljusa cirklar i samma sektion.'
  );
  assert.match(
    source,
    /\.conversation-header-assets-popover \{[\s\S]*position:\s*absolute;[\s\S]*top:\s*calc\(100% \+ 8px\);[\s\S]*min-width:\s*260px;[\s\S]*border:\s*1px solid rgba\(214,\s*201,\s*191,\s*0\.78\);/,
    'Förväntade att tillgångarna nu öppnas som en header-popover i stället för att expandera som text i konversationsytan.'
  );
  assert.match(
    source,
    /\.conversation-html-link-fallback \{[\s\S]*display:\s*inline-flex;[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/,
    'Förväntade att komprimerade raw-url-fallbacklänkar får en egen kontrollerad rich-html-stil.'
  );
});

test('kundintelligens-fallbacken har fyra lugnare kategorier i stället för sex texttunga flikar', () => {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.match(
    source,
    /for="intel-view-actions"[^>]*>Nu<\/label>[\s\S]*for="intel-view-customer"[^>]*>Kund<\/label>[\s\S]*for="intel-view-history"[^>]*>Historik<\/label>[\s\S]*for="intel-view-team"[^>]*>Team<\/label>/,
    'Förväntade att fallback-shellen visar fyra huvudkategorier: Nu, Kund, Historik och Team.'
  );
  assert.doesNotMatch(
    source,
    /for="intel-view-signals"|for="intel-view-medicine"/,
    'Förväntade att Signaler och Medicinskt inte längre exponeras som egna tunga flikar i fallback-shellen.'
  );
});

test('runtime focus-intel komprimerar högerkolumnen genom att slå ihop signaler och medicinskt in i Nu', () => {
  const source = fs.readFileSync(FOCUS_RENDERERS_PATH, 'utf8');

  assert.match(
    source,
    /actions:\s*normalizeIntelDisplayCards\([\s\S]*buildIntelMedicalNowCard\(thread\),[\s\S]*\.\.\.asArray\(baseCards\.actions\),[\s\S]*\.\.\.asArray\(baseCards\.signals\),[\s\S]*\.\.\.asArray\(baseCards\.medicine\),/,
    'Förväntade att högerkolumnens Nu-grupp nu börjar med medicinskt nu och låter arbetsplan och signaler komma via de nedre korten i stället för en dubbel toppruta.'
  );
  assert.match(
    source,
    /signals:\s*\[\],[\s\S]*medicine:\s*\[\]/,
    'Förväntade att separata signals- och medicine-paneler lämnas tomma när högerkolumnen förenklas.'
  );
});

test('högerkolumnens runtimekort följer summary facts implication-formatet', () => {
  const source = fs.readFileSync(FOCUS_RENDERERS_PATH, 'utf8');

  assert.match(
    source,
    /<div class="intel-card-meta-row">[\s\S]*<div class="intel-card-summary">[\s\S]*<dl class="intel-card-lines">[\s\S]*<div class="intel-card-implication">/,
    'Förväntade att runtimekort i högerkolumnen renderas som meta + summary + facts + implication.'
  );
  assert.match(
    source,
    /const implicationLabel =[\s\S]*normalizeKey\(safeCard\.chip\) === "nu"[\s\S]*"Gör så här"/,
    'Förväntade att runtimekort kan anpassa implication-label efter kategori i stället för att bara stapla fri text.'
  );
});

test('högerkolumnen lämnar bubbel-språket i panelinnehåll men kan behålla utility-bubblor', () => {
  const source = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    source,
    /\.intel-panel-group \{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/,
    'Förväntade att varje högerkategori ritas som en öppen signal-rail i stället för en stor bubbelyta.'
  );
  assert.match(
    source,
    /\.focus-intel-action-row \.quick-action-pill \{[\s\S]*min-height:\s*23px;[\s\S]*padding:\s*0 7px;[\s\S]*border-radius:\s*999px;[\s\S]*rgba\(255, 255, 255, 0\.9\) 0%[\s\S]*rgba\(244, 238, 232, 0\.88\) 100%[\s\S]*0 2px 6px rgba\(56, 40, 28, 0\.06\),[\s\S]*inset 0 1px 0 rgba\(255, 255, 255, 0\.88\);/,
    'Förväntade att verktygsraden i högerkolumnen återanvänder samma bubbelgeometri som arbetsköns filterchips.'
  );
  assert.match(
    source,
    /\.intel-card-chip::before \{[\s\S]*width:\s*2px;[\s\S]*height:\s*11px;[\s\S]*box-shadow:\s*none;/,
    'Förväntade att intel-chipen markeras med en tunn linjekicker i stället för bubbeldot.'
  );
  assert.match(
    source,
    /\.intel-card-provenance-label::before \{[\s\S]*width:\s*2px;[\s\S]*height:\s*10px;/,
    'Förväntade att proveniensetiketter följer samma no-bubbles-språk.'
  );
  assert.match(
    source,
    /\.intel-card-badge::before \{[\s\S]*width:\s*2px;[\s\S]*height:\s*10px;[\s\S]*box-shadow:\s*none;/,
    'Förväntade att badges i högerkolumnen inte längre använder bubble-dots.'
  );
});

test('kundintelligens-fallbacken speglar summary facts implication-formatet', () => {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.match(
    source,
    /class="intel-card-meta-row"[\s\S]*class="intel-card-summary"[\s\S]*class="intel-card-lines"[\s\S]*class="intel-card-implication"/,
    'Förväntade att fallback-shellen använder samma summary facts implication-format som runtime.'
  );
});
