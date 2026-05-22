const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const OVERLAY_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-overlay-renderers.js'
);

const STYLES_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'styles.css'
);

const INDEX_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'index.html'
);

const FOCUS_RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-focus-intel-renderers.js'
);

const DOM_COMPOSITION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);

const ACTION_ENGINE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-action-engine.js'
);

const ASYNC_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-async-orchestration.js'
);

test('surfacing fix markerar studio som read-only och truth-gatar verktyg i offline historik', () => {
  const overlaySource = fs.readFileSync(OVERLAY_PATH, 'utf8');

  assert.ok(
    overlaySource.includes('studioShell.dataset.readOnly = isOfflineHistoryReply ? "true" : "false";'),
    'Studio-shellen ska exponera ett explicit read-only-state sa att offline historik kan surfacas arligt.'
  );
  assert.ok(
    overlaySource.includes('Array.from(studioShell.querySelectorAll(".studio-tool-button"))'),
    'Studio-renderern ska samla alla visuella tool-knappar, inte bara de som har en action-handler.'
  );
  assert.ok(
    overlaySource.includes('button.disabled = disableChoiceControls;'),
    'Studio-verktyg och valrader ska truth-gatas av samma disable-state i offline historik.'
  );
  assert.ok(
    overlaySource.includes('tab.dataset.count = String(count);'),
    'Studio-kontextflikarna ska markera hur mycket faktisk hjälpkontext som finns i respektive stack.'
  );
});

test('surfacing fix stärker read-only-, tool- och later-surfacing utan expansion', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.ok(
    stylesSource.includes('.studio-primary-chip:disabled,'),
    'Read-only primary chip ska ha en tydlig disabled-styling i stallet for att se aktiv ut.'
  );
  assert.ok(
    stylesSource.includes('.studio-context-tab[data-count]:not([data-empty="true"])::after'),
    'Kontextflikarna ska kunna visa en subtil count-signal när faktisk detaljkontext finns.'
  );
  assert.ok(
    stylesSource.includes('.studio-tool-button::after'),
    'Studioverktygen ska fa en liten discoverability-label utan att layouten blir större.'
  );
  assert.ok(
    stylesSource.includes('.later-context::before'),
    'Senare-modalen ska fa en explicit kontextmarkor sa att vald tråd känns direkt.'
  );
  assert.ok(
    stylesSource.includes('.studio-shell[data-read-only="true"] .studio-tool-button:disabled'),
    'Offline historik ska ge ett särskilt read-only-utseende till studiots verktygskontroller.'
  );
});

test('offline historik öppnar svarstudio utan att handoffen hoppar tillbaka till live-tråd', () => {
  const focusSource = fs.readFileSync(FOCUS_RENDERERS_PATH, 'utf8');
  const domCompositionSource = fs.readFileSync(DOM_COMPOSITION_PATH, 'utf8');
  const actionEngineSource = fs.readFileSync(ACTION_ENGINE_PATH, 'utf8');
  const asyncSource = fs.readFileSync(ASYNC_PATH, 'utf8');

  assert.ok(
    focusSource.includes('data-runtime-studio-read-only="true"'),
    'Offline historik-knappen ska markera read-only handoff explicit i DOM i stället för att se ut som vanlig live-öppning.'
  );
  assert.ok(
    focusSource.includes(
      '<button class="conversation-next-button" type="button" data-runtime-studio-open data-runtime-studio-read-only="true" data-runtime-studio-thread-id="${escapeHtml('
    ),
    'Offline historik-knappen ska bära med sig historikkonversationens id så read-only-handoffen kan återvälja samma historikrad.'
  );
  assert.ok(
    domCompositionSource.includes('const runtimeStudioReadOnly =') &&
      domCompositionSource.includes('runtimeStudioThreadId && runtimeStudioReadOnly') &&
      domCompositionSource.includes('selectOfflineHistoryConversation(runtimeStudioThreadId, { reloadBootstrap: false });') &&
      domCompositionSource.includes('readOnly: runtimeStudioReadOnly,'),
    'DOM-handoffet ska återvälja samma offline-historikkonversation innan svarstudion öppnas i read-only-läge.'
  );
  assert.ok(
    actionEngineSource.includes('state.studio.readOnly = readOnly;'),
    'Runtime action engine ska bära med sig ett explicit read-only-lås när studion öppnas från offline historik.'
  );
  assert.ok(
    asyncSource.includes('resolveStudioMode() !== "compose" && state.studio?.readOnly === true && lockedThread'),
    'Async studioactions ska fortsätta blockeras när reply-studion är låst i offline historik.'
  );
});

test('signal strength pass humaniserar runtimeblock och stärker små signalytor utan expansion', () => {
  const overlaySource = fs.readFileSync(OVERLAY_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.ok(
    overlaySource.includes('function getRuntimeConversationSignal(thread)'),
    'Overlay-renderern ska ha en liten helper som översätter vald live-tråd till mänsklig kontextsignal.'
  );
  assert.ok(
    overlaySource.includes('Kund · ${thread.customerName}') &&
      overlaySource.includes('Ärende · ${compactRuntimeCopy(thread.subject, thread.intentLabel || "Aktiv tråd", 72)}') &&
      overlaySource.includes('Ansvar · ${thread.ownerLabel}'),
    'Anteckning och schemaläggning ska länka med mänskliga runtime-signaler i stället för råa systemfält.'
  );
  assert.ok(
    overlaySource.includes('label: "Kund och tråd"') &&
      !overlaySource.includes('label: "Konversations-ID"'),
    'Rått konversations-id ska inte längre vara förstahandskort i smart anteckning.'
  );
  assert.ok(
    stylesSource.includes('.intel-card-chip::before') &&
      stylesSource.includes('.intel-card-badge::before'),
    'Högerkolumnens små signalchips ska få en tydligare visuell signal utan större ytor eller nya containrar.'
  );
  assert.ok(
    stylesSource.includes('.studio-tool-button:hover,') &&
      stylesSource.includes('.studio-editor-tools {') &&
      stylesSource.includes('border: 1px solid rgba(229, 218, 210, 0.74);'),
    'Studioverktygen ska stärkas genom kontrast och precision, inte genom expansion.'
  );
  assert.ok(
    indexSource.includes('aria-label="Lägg till present"') &&
      indexSource.includes('aria-label="Öppna smart anteckning"') &&
      indexSource.includes('aria-label="Skriv om utkast"') &&
      indexSource.includes('aria-label="Kontrollera policy"'),
    'Studioverktygen ska bära mänskligare labels så tooltipen hjälper operatören snabbare.'
  );
});
