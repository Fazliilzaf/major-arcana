const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

const CONFIG_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-config.js'
);

const DOM_LIVE_COMPOSITION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);

const OVERLAY_RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-overlay-renderers.js'
);

const ASYNC_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-async-orchestration.js'
);

test('runtime-config låser Studio wave 1 till egzona och contact med egen kill switch', () => {
  const source = fs.readFileSync(CONFIG_PATH, 'utf8');

  assert.match(
    source,
    /STUDIO_TRUTH_PRIMARY:\s*\{[\s\S]*mailboxIds:\s*\[[\s\S]*"egzona@hairtpclinic\.com"[\s\S]*"contact@hairtpclinic\.com"[\s\S]*\]/,
    'Förväntade att Studio wave 1 bara scopes till egzona och contact.'
  );
  assert.match(
    source,
    /STUDIO_TRUTH_PRIMARY:\s*\{[\s\S]*replyOnly:\s*true,/,
    'Förväntade att Studio wave 1 uttryckligen låses till reply-only.'
  );
  assert.match(
    source,
    /disableStorageKey:\s*"cco\.truthPrimaryStudio\.disabled"/,
    'Förväntade en separat kill switch för sanningsstyrd svarstudio.'
  );
});

test('app.js håller separat studio truth-state och låser studio-state till truth-driven källmejlkonto', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /studioTruthPrimary:\s*\{[\s\S]*replyOnly:\s*STUDIO_TRUTH_PRIMARY\?\.replyOnly !== false,/,
    'Förväntade att runtime har ett separat studioTruthPrimary-state.'
  );
  assert.match(
    source,
    /function isTruthPrimaryStudioFeatureEnabled\(\)/,
    'Förväntade en separat feature-gate för sanningsstyrd svarstudio.'
  );
  assert.match(
    source,
    /function getTruthPrimaryStudioMailboxIds\(\{ mailboxIds = \[\] \} = \{\}\)/,
    'Förväntade en separat mailbox-allowlist för sanningsstyrd svarstudio.'
  );
  assert.match(
    source,
    /function getRuntimeStudioTruthState\(thread = null\)/,
    'Förväntade en separat studio-proveniensfunktion för truth vs legacy.'
  );
  assert.match(
    source,
    /function applyTruthPrimaryStudioState\(studioState,\s*thread = null\)/,
    'Förväntade ett separat lås som applicerar sanningsstyrd svarstudio-state på reply-studion.'
  );
  assert.match(
    source,
    /studioState\.selectedSignatureId = asText\([\s\S]*studioTruthState\.selectedSignatureId/,
    'Förväntade att sanningsstyrd svarstudio låser signaturprofilen till källmejlkonto.'
  );
  assert.match(
    source,
    /studioState\.composeMailboxId = asText\([\s\S]*studioTruthState\.sourceMailboxId/,
    'Förväntade att sanningsstyrd svarstudio låser composeMailboxId till källmejlkonto i wave 1.'
  );
});

test('app.js kopplar studio truth-helpers till overlay, async och dom-live-kedjan', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.ok(
    source.includes('\n      getRuntimeStudioTruthState,'),
    'Förväntade att getRuntimeStudioTruthState kopplas in i appens helpers.'
  );
  assert.ok(
    source.includes('\n      getTruthPrimaryStudioMailboxIds,'),
    'Förväntade att dom-live får studio-mailboxallowlisten.'
  );
  assert.ok(
    source.includes('\n      isTruthPrimaryStudioFeatureEnabled,'),
    'Förväntade att dom-live får studio-kill-switchen.'
  );
});

test('app.js återställer vänsterspaltens AI-kontext med tre data-drivna kort', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /function buildStudioContextAiItems\(thread\)[\s\S]*label:\s*"NU I"[\s\S]*thread\?\.statusLabel[\s\S]*label:\s*"NÄSTA STEG"[\s\S]*thread\?\.nextActionSummary[\s\S]*label:\s*"VÄNTAR \/ BLOCKERAR"[\s\S]*thread\?\.riskReason/,
    'Förväntade att AI-kontexten i svarsstudions vänsterspalt återställs med de tre tidigare data-drivna korten.'
  );
  assert.match(
    source,
    /renderStudioContextAiList\(items\)[\s\S]*Ingen kontext ännu[\s\S]*Välj en aktiv tråd för att ladda svarsstudion/,
    'Förväntade en tydlig tom-state om AI-kontexten saknar tråddata.'
  );
});

test('app.js återställer svarsstudiots operativa vänsterspalt med källa, gör detta nu och varför i fokus', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const htmlSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'index.html'),
    'utf8'
  );

  assert.match(
    htmlSource,
    /data-studio-source-lock-label/,
    'Förväntade att svarsstudions vänsterspalt återfår ett dedikerat källa-låsblock.'
  );
  assert.match(
    htmlSource,
    /data-studio-next-action-title/,
    'Förväntade att svarsstudions vänsterspalt återfår ett dedikerat gör detta nu-block.'
  );
  assert.match(
    htmlSource,
    /data-studio-why-in-focus/,
    'Förväntade att svarsstudions vänsterspalt återfår ett dedikerat varför i fokus-block.'
  );
  assert.match(
    htmlSource,
    /KÄLLA LÅST/,
    'Förväntade att de operativa blocken ligger i rätt funktionell ordning i vänsterspalten.'
  );
  assert.match(
    htmlSource,
    /data-studio-status-value="owner"/,
    'Förväntade att vänsterspaltens operativa fokusblock återfår agentfältet.'
  );
  assert.match(
    htmlSource,
    /data-studio-status-value="status"/,
    'Förväntade att vänsterspaltens operativa fokusblock återfår statusfältet.'
  );
  assert.match(
    htmlSource,
    /data-studio-status-value="sla"/,
    'Förväntade att vänsterspaltens operativa fokusblock återfår SLA-fältet.'
  );
  assert.match(
    htmlSource,
    /data-studio-status-value="risk"/,
    'Förväntade att vänsterspaltens operativa fokusblock återfår prioritetsfältet.'
  );
  assert.ok(
    source.includes(
      'const studioSourceLockLabel = document.querySelector("[data-studio-source-lock-label]");'
    ),
    'Förväntade att source lock bindes till ett dedikerat DOM-node i app.js.'
  );
  assert.ok(
    source.includes(
      'const studioSourceLockNote = document.querySelector("[data-studio-source-lock-note]");'
    ),
    'Förväntade att source lock note bindes till ett dedikerat DOM-node i app.js.'
  );

  const sourceLockIndex = htmlSource.indexOf(
    '<article class="studio-card studio-card-source-lock">'
  );
  const actionIndex = htmlSource.indexOf('<article class="studio-card studio-card-action">');
  const focusIndex = htmlSource.indexOf('<article class="studio-card studio-card-focus">');
  const metricRowIndex = htmlSource.indexOf('<div class="studio-metric-row">');
  const contextIndex = htmlSource.indexOf('<section class="studio-card studio-card-context">');

  assert.ok(sourceLockIndex !== -1, 'Förväntade att källa-låset finns i vänsterspalten.');
  assert.ok(actionIndex !== -1, 'Förväntade att gör detta nu-blocket finns i vänsterspalten.');
  assert.ok(focusIndex !== -1, 'Förväntade att varför i fokus-blocket finns i vänsterspalten.');
  assert.ok(
    metricRowIndex !== -1,
    'Förväntade att risk- och engagemangsytan finns kvar i vänsterspalten.'
  );
  assert.ok(
    contextIndex !== -1,
    'Förväntade att AI-kontexten finns kvar längre ned i vänsterspalten.'
  );
  assert.ok(
    sourceLockIndex < actionIndex &&
      actionIndex < focusIndex &&
      focusIndex < metricRowIndex &&
      metricRowIndex < contextIndex,
    'Förväntade att Svarsstudiots vänsterspalt behåller den operativa blockordningen före AI-kontexten.'
  );
});

test('styles.css placerar svarsstudions contextblock direkt under risk och engagemang', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'styles.css'),
    'utf8'
  );

  assert.match(
    source,
    /\.studio-card-context\s*\{[\s\S]*margin-top:\s*0;/,
    'Förväntade att svarsstudiots contextblock inte längre bottenankras i vänsterspalten.'
  );
});

test('runtime-dom-live-composition håller separat studio runtime-state och blockerar sender-switch i sanningsstyrd svarstudio', () => {
  const source = fs.readFileSync(DOM_LIVE_COMPOSITION_PATH, 'utf8');

  assert.match(
    source,
    /const configuredStudioTruthMailboxIds =[\s\S]*getTruthPrimaryStudioMailboxIds\(\{ mailboxIds: runtimeMailboxIds \}\)/,
    'Förväntade att dom-live använder en separat allowlist för Studio wave 1.'
  );
  assert.match(
    source,
    /state\.runtime\.studioTruthPrimary = \{[\s\S]*configuredMailboxIds: configuredStudioTruthMailboxIds,[\s\S]*activeMailboxIds: activeStudioTruthMailboxIds,[\s\S]*replyOnly: true,/,
    'Förväntade att dom-live sparar separat studioTruthPrimary-state med aktiv scope.'
  );
  assert.match(
    source,
    /Sanningsstyrd svarstudio låser källmejlkonto och signatur till/,
    'Förväntade att senderväxling blockeras med tydlig provenancecopy i sanningsstyrd svarstudio.'
  );
  assert.match(
    source,
    /Sanningsstyrd svarstudio låser signaturen till/,
    'Förväntade att klickbara signaturval också blockeras i sanningsstyrd svarstudio.'
  );
});

test('overlay-renderern visar sanningsstyrd svarstudio-proveniens och låser sender-kontroller utan att låsa hela utkastytan', () => {
  const source = fs.readFileSync(OVERLAY_RENDERERS_PATH, 'utf8');

  assert.match(
    source,
    /const isTruthDrivenStudio =[\s\S]*studioTruthState\?\.truthDriven === true;/,
    'Förväntade att overlay-renderern känner igen sanningsstyrd svarstudio som eget läge.'
  );
  assert.match(
    source,
    /studioShell\.dataset\.truthPrimary = isTruthDrivenStudio \? "true" : "false";/,
    'Förväntade ett explicit data-attribut för sanningsstyrd svarstudio i runtime.'
  );
  assert.match(
    source,
    /studioShell\.dataset\.replyContextLocked = isTruthDrivenStudio \? "true" : "false";/,
    'Förväntade ett explicit runtime-attribut när svarskontext är låst.'
  );
  assert.match(
    source,
    /svarskontext låst/i,
    'Förväntade tydlig provenancecopy för låst svarskontext i svarsstudion.'
  );
  assert.match(
    source,
    /Truth guardrail aktiv/,
    'Förväntade att studion visar en guardrail-pill när sanningsstyrd svarstudio är aktiv.'
  );
  assert.match(
    source,
    /const disableSignatureControls = disableChoiceControls \|\| isTruthDrivenStudio;/,
    'Förväntade att sender-kontroller låses separat från övriga studiovärden.'
  );
  assert.match(
    source,
    /studioComposeFromSelect\.disabled =[\s\S]*isTruthDrivenStudio;/,
    'Förväntade att From-väljaren låses i sanningsstyrd svarstudio.'
  );
});

test('async send-pathen skickar sanningsstyrd svarstudio med låst mejlkonto, wave-label och reply-context-guardrail', () => {
  const source = fs.readFileSync(ASYNC_PATH, 'utf8');

  assert.match(
    source,
    /const studioTruthState =[\s\S]*getRuntimeStudioTruthState\(thread\)/,
    'Förväntade att async orchestration läser studio truth-state innan send.'
  );
  assert.match(
    source,
    /Sanningsstyrd svarstudio låser signatur och källmejlkonto till/,
    'Förväntade en hård guardrail om senderidentiteten försöker glida i wave 1.'
  );
  assert.match(
    source,
    /mailboxId:\s*isComposeMode[\s\S]*studioTruthState\.sourceMailboxId \|\| thread\.mailboxAddress/,
    'Förväntade att reply-send låser mailboxId till truth-driven källmejlkonto i wave 1.'
  );
  assert.match(
    source,
    /sourceMailboxId:\s*isComposeMode[\s\S]*studioTruthState\.sourceMailboxId \|\| thread\.mailboxAddress/,
    'Förväntade att sourceMailboxId följer samma låsta sanningsmejlkonto.'
  );
  assert.match(
    source,
    /truthPrimaryStudio:\s*studioTruthState\?\.truthDriven === true,/,
    'Förväntade att send-pathen märker ut sanningsstyrd svarstudio i payloaden.'
  );
  assert.match(
    source,
    /replyContextLocked:\s*studioTruthState\?\.truthDriven === true,/,
    'Förväntade att send-pathen märker ut låst reply-context i payloaden.'
  );
  assert.match(
    source,
    /Sanningsstyrd svarstudio skickade svar från/,
    'Förväntade tydlig successcopy när wave-1-studion faktiskt skickar i truth-driven läge.'
  );
});
