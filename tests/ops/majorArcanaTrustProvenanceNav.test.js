const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const INDEX_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'index.html'
);

const APP_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app.js'
);

const OVERLAY_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-overlay-renderers.js'
);

const INTEL_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-focus-intel-renderers.js'
);

test('mer-nav ar tillbaka och exponerar kvarvarande aux-yter som tidigare levde under huven', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.ok(
    indexSource.includes('data-more-toggle'),
    'Headern ska exponera ett Mer-trigger igen sa att underliggande aux-views inte forblir dolda.'
  );
  assert.ok(
    indexSource.includes('id="preview-more-menu"'),
    'Mer-menyn ska finnas i DOM nar aux-views fortfarande lever i appen.'
  );

  ['later', 'sent', 'integrations', 'macros', 'settings', 'showcase'].forEach((viewKey) => {
    assert.ok(
      indexSource.includes(`data-nav-view="${viewKey}"`),
      `Mer-menyn ska exponera ${viewKey} nar den underliggande shellvyn fortfarande finns kvar.`
    );
  });
});

test('owner-scope visar arlig fixturebegransning i stallet for ett diffust filter och analytics scope-meta ateranvander samma sanning', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const queueSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'runtime-queue-renderers.js'
    ),
    'utf8'
  );

  assert.ok(
    indexSource.includes('data-owner-menu-note'),
    'Owner-menyn ska ha en dedikerad note-yta for fixturebegransningar eller saknad agardifferentiering.'
  );
  assert.ok(
    appSource.includes('function getOwnerScopeAvailability('),
    'Appen ska ha en helper som kan uttrycka nar owner-scope bara ar Alla agare eller Oagd.'
  );
  assert.ok(
    queueSource.includes('ownerTriggerLabel.textContent = asText(selectedOwner?.label, "Alla ägare");'),
    'Owner-triggern ska visa vald sanning direkt i stallet for den generiska texten "Ägarvy".'
  );
  assert.ok(
    queueSource.includes('ownerMenuToggle.disabled = ownerScopeAvailability.disableMenu === true;'),
    'Owner-menyn ska kunna disableas nar aktuell fixture inte erbjuder nagot val utover Alla agare.'
  );
  assert.ok(
    appSource.includes('ownerScopeAvailability.note ? ` ${ownerScopeAvailability.note}` : ""'),
    'Analytics scope-kortet ska ateranvanda owner-scope-noten sa att samma fixturebegransning syns i analytics.'
  );
});

test('analytics trust-gating spårar auth och ersatter falsk fallback med arlig lower-dashboard-state', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.ok(
    appSource.includes('authRequired: false,'),
    'Analytics-runtime ska ha en explicit authRequired-flagga som separat state.'
  );
  assert.ok(
    appSource.includes('function buildAnalyticsAuthBlockedPeriodData('),
    'Analytics ska ha en separat auth-blocked-modell for lower dashboard i stallet for att visa falska fallback-KPI:er.'
  );
  assert.ok(
    appSource.includes('state.analyticsRuntime.authRequired = hasAuthFailure;'),
    'Analytics-loaden ska komma ihag auth-fel aven vid blandade partial-svar.'
  );
  assert.ok(
    appSource.includes('analyticsCoachingAction.disabled = periodData.coaching.disabled === true;'),
    'Analytics CTA ska kunna truth-gatas fran perioddatat.'
  );

  ['team', 'self', 'leaderboard', 'templates', 'coaching'].forEach((noteKey) => {
    assert.ok(
      indexSource.includes(`data-analytics-trust-note="${noteKey}"`),
      `Analytics-shellen ska ha en trust/provenance-yta for ${noteKey}.`
    );
  });
});

test('automation trust-gating markerar shelllokala delar och auth-laser liveactions tydligt', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.ok(
    appSource.includes('function renderAutomationTrustNotes() {'),
    'Automation-shellen ska ha en dedikerad renderer for trust/provenance-notiser.'
  );
  assert.ok(
    appSource.includes('automationRunButton.disabled = authRequired || state.automationRuntime.loading;'),
    'Top-level Testkor ska truth-gatas nar auth saknas for live evaluate.'
  );
  assert.ok(
    appSource.includes('automationSaveButton.disabled = authRequired || state.automationRuntime.loading;'),
    'Spara ska truth-gatas nar auth saknas for live templatesystemet.'
  );
  assert.ok(
    appSource.includes("const restoreButton = card.querySelector('[data-automation-version-action=\"restore\"]');"),
    'Automation auth-gating ska ocksa kunna lasa synliga version-aterstallningar nar auth saknas.'
  );
  assert.ok(
    appSource.includes('Hoppa över väntan är shell-lokal simulering'),
    'Testing skip ska uttryckligen beskrivas som lokal simulering i trust-copy.'
  );

  ['global', 'analysis', 'testing', 'versioner', 'autopilot'].forEach((noteKey) => {
    assert.ok(
      indexSource.includes(`data-automation-trust-note="${noteKey}"`),
      `Automation-shellen ska ha en trust/provenance-yta for ${noteKey}.`
    );
  });
});

test('senare-modal och kundintelligens visar nu explicit kontext- och provenienssanning', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const overlaySource = fs.readFileSync(OVERLAY_PATH, 'utf8');
  const intelSource = fs.readFileSync(INTEL_PATH, 'utf8');

  assert.ok(
    indexSource.includes('data-later-context'),
    'Senare-modalen ska ha en dedikerad kontextrad i DOM.'
  );
  assert.ok(
    appSource.includes('contextThreadId: ""'),
    'Later-state ska spara vilken tråd som senareläggningen faktiskt gäller.'
  );
  assert.ok(
    overlaySource.includes('function renderLaterContext() {'),
    'Overlay-renderern ska kunna rita explicit senare-kontext for vald tråd eller bulkurval.'
  );
  assert.ok(
    overlaySource.includes('asArray,'),
    'Later-kontexten ska wirea in asArray-hjalparen sa att modalen inte kraschar vid oppning.'
  );
  assert.ok(
    appSource.includes('NOTE_MODE_PRESETS,\n      asArray,'),
    'Appen ska skicka asArray vidare till overlay-renderern sa att later-kontexten far fungerande helper-wireup.'
  );
  assert.ok(
    overlaySource.includes('openLaterDialog(options = {})'),
    'Later-dialogen ska ta explicit kontext i stallet for att bara forlita sig pa dold global state.'
  );
  assert.ok(
    intelSource.includes('intel-card-provenance'),
    'Kundintelligenskort ska nu rendera explicita proveniensmarkorer i markupen.'
  );
});

test('slutpasset harmoniserar offline-copy, capability-spärrar och trust-språk utan ny logik', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const overlaySource = fs.readFileSync(OVERLAY_PATH, 'utf8');
  const intelSource = fs.readFileSync(INTEL_PATH, 'utf8');

  assert.ok(
    appSource.includes('Skicka: spärrad i nuvarande profil'),
    'Capability-copy ska uttryckligen säga nar skicka ar spärrat i den aktuella liveprofilen.'
  );
  assert.ok(
    appSource.includes('Radera: spärrad i nuvarande profil'),
    'Capability-copy ska uttryckligen säga nar delete ar spärrat i den aktuella liveprofilen.'
  );
  assert.ok(
    appSource.includes('Signatur: profil saknas i nuvarande läge'),
    'Capability-copy ska uttryckligen säga nar signaturprofilen saknas i det aktuella laget.'
  );
  assert.ok(
    overlaySource.includes('Offline historik · läsläge · live-actions spärrade'),
    'Studio-copy ska göra offline historik som läsläge tydlig utan att ge sken av operativt läge.'
  );
  assert.ok(
    appSource.includes('Skicka: spärrad i läsläge'),
    'Capability-copy ska uttryckligen markera att skicka är spärrat i offline läsläge.'
  );
  assert.ok(
    appSource.includes('Radera: spärrad i läsläge'),
    'Capability-copy ska uttryckligen markera att delete är spärrat i offline läsläge.'
  );
  assert.ok(
    intelSource.includes('Offline historik · läsläge'),
    'Fokusyta och kundintelligens ska märka offline historik som läsläge i mitten/höger.'
  );
  assert.ok(
    appSource.includes('Härledd från livekällor: KPI-raden bygger på live telemetry'),
    'Analytics trust-copy ska uttryckligen skilja derived live-sammanställning från separat live-feed.'
  );
  assert.ok(
    appSource.includes('Shell-lokal: analyskort och copy är härledd UI'),
    'Automation trust-copy ska uttryckligen märka shell-lokala analysytor.'
  );
  assert.ok(
    appSource.includes('Livekälla i valt mailboxscope: bygger på tidigare kundinteraktioner'),
    'Kundintelligensens proveniensdetaljer ska harmonisera mot samma live/derived-vokabular.'
  );
});
