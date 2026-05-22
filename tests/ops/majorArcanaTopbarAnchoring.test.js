const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLES_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'styles.css'
);
const INDEX_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'index.html');
const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');
const ACTION_ENGINE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-action-engine.js'
);

test('arbetsko-toppen har expanded 3x5-lage och lokalt kompakt bubbellage utan lakage', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const actionEngineSource = fs.readFileSync(ACTION_ENGINE_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.queue-lane-quickstrip\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);[\s\S]*gap:\s*4px;[\s\S]*\}/,
    'Forsta raden i Arbetsko ska vara en femspaltsgrid.'
  );

  assert.match(
    stylesSource,
    /\.collapsed-list\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);[\s\S]*gap:\s*4px;[\s\S]*\}/,
    'Andra och tredje raden i Arbetsko ska ligga i samma femspaltsgrid.'
  );

  assert.match(
    stylesSource,
    /\.queue-filter-chip--segment-toggle\s*\{[\s\S]*justify-content:\s*center;[\s\S]*\}/,
    'Pilbubblan ska ha egen lokal styling i toppen.'
  );

  assert.match(
    stylesSource,
    /\.queue-filter-chip\s*\{[\s\S]*min-height:\s*23px;[\s\S]*border-radius:\s*999px;[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.9\)[\s\S]*rgba\(244,\s*238,\s*232,\s*0\.88\)[\s\S]*\}/,
    'De stora filterrutorna ska fortsatt använda det vanliga bubbelspråket.'
  );

  assert.match(
    stylesSource,
    /\.queue-secondary-signal-chip\s*\{[\s\S]*min-height:\s*20px;[\s\S]*border-radius:\s*999px;[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.9\)[\s\S]*rgba\(244,\s*238,\s*232,\s*0\.88\)[\s\S]*\}/,
    'Uppföljning-, oägd- och riskraden ska fortsatt använda samma bubbelspråk.'
  );

  assert.match(
    stylesSource,
    /\.queue-scope-strip\.is-compact\s+\.collapsed-list\s+\.queue-filter-chip\s*\{[\s\S]*width:\s*28px;[\s\S]*min-width:\s*28px;[\s\S]*min-height:\s*28px;[\s\S]*justify-content:\s*center;[\s\S]*justify-self:\s*center;[\s\S]*\}/,
    'Kompaktlaget ska gora de nedre kategoriraderna till runda ikonbubblor.'
  );

  assert.match(
    stylesSource,
    /\.queue-scope-strip\.is-compact\s+\.collapsed-list\s*\{[\s\S]*display:\s*flex;[\s\S]*gap:\s*8px;[\s\S]*flex-wrap:\s*nowrap;[\s\S]*\}/,
    'Kompaktlaget ska gora de nedre kategorierna till en sammanhallen ikonrad.'
  );

  assert.match(
    stylesSource,
    /\.queue-scope-strip\.is-compact\s+\.collapsed-list\s+\.queue-filter-chip\s*>\s*strong\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Kompaktlaget ska dolja siffrorna i den nedre ikonraden.'
  );

  assert.match(
    stylesSource,
    /\.queue-scope-strip\.is-compact\s+\.collapsed-list\s+\.queue-filter-chip\s*>\s*span\s*\{[\s\S]*font-size:\s*0;[\s\S]*justify-content:\s*center;[\s\S]*\}/,
    'Kompaktlaget ska dolja etiketttexten visuellt bara i den nedre ikonraden.'
  );

  assert.match(
    stylesSource,
    /\.queue-scope-strip\.is-compact\s+\.queue-filter-chip--segment-toggle\s*\{[\s\S]*width:\s*28px;[\s\S]*min-width:\s*28px;[\s\S]*min-height:\s*28px;[\s\S]*\}/,
    'Pilbubblan ska matcha samma runda storlek som de ovriga ikonbubblorna.'
  );

  assert.doesNotMatch(
    stylesSource,
    /\.queue-scope-strip\.is-compact\s+\.queue-filter-chip\s*\{[\s\S]*width:\s*28px;[\s\S]*min-width:\s*28px;[\s\S]*min-height:\s*28px;[\s\S]*\}/,
    'Toppraden ska inte forvandlas till runda ikonbubblor i kompaktlaget.'
  );

  assert.doesNotMatch(
    stylesSource,
    /\.queue-scope-strip\.is-collapsed\s+\.queue-lane-quickstrip\s+\[data-queue-lane\]\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Det gamla hide-all-laget ska inte finnas kvar for queue-toppen.'
  );

  assert.doesNotMatch(
    stylesSource,
    /\.queue-scope-strip\.is-collapsed\s+\.collapsed-list\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'De nedre kategoriraderna ska inte dodoljas av gammal collapse-CSS.'
  );

  assert.match(
    stylesSource,
    /\.preview-hint\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Triage-hjalptexten ska fortsatt vara dold pa desktop sa den inte ligger mitt i queueflodet.'
  );

  assert.doesNotMatch(
    stylesSource,
    /\.queue-filter-chip\.is-active,\s*\.focus-tab\.is-active/,
    'Queuebubblornas aktiva styling far inte delas med fokusflikarna.'
  );

  assert.doesNotMatch(
    stylesSource,
    /\.queue-filter-chip\.is-active,[\s\S]*#intel-view-overview:checked\s*~\s*\.focus-intel-tabs/,
    'Queuebubblornas aktiva styling far inte heller styra kundintelligensflikarna.'
  );

  assert.match(
    indexSource,
    /data-queue-category-toggle/,
    'Pilbubblan ska finnas kvar i toppsegmentet.'
  );

  assert.match(
    indexSource,
    /data-queue-category-toggle[\s\S]*data-queue-lane="all"/,
    'Pilbubblan ska ligga före Alla i markupen.'
  );

  assert.match(
    indexSource,
    /data-quick-action="studio"/,
    'Svarstudio ska ligga tillbaka i den andra raden av toppsegmentet.'
  );

  assert.match(
    indexSource,
    /data-quick-action="handled"/,
    'Klar ska ligga tillbaka i den andra raden av toppsegmentet.'
  );

  assert.match(
    indexSource,
    /data-quick-action="delete"/,
    'Radera ska ligga tillbaka i den andra raden av toppsegmentet.'
  );

  assert.match(
    indexSource,
    /data-queue-action-strip/,
    'Den nedre actionraden med aktiv kategori plus snabbatgarder ska fortsatt finnas kvar.'
  );

  // Invarianter (cco-ny-project-lock): samma snabbåtgärder och köspår i arbetsköns sekundära rad —
  // visningsetiketter får ändras (t.ex. Studio vs Svarstudio) men data-attribut och kölogik ska finnas kvar.
  const secondaryQueues = indexSource.match(
    /<div class="collapsed-list"[^>]*aria-label="Sekundära köer"[\s\S]*?<\/div>\s*\n\s*<\/div>\s*\n\s*<\/section>/
  );
  assert.ok(secondaryQueues, 'Sekundära köer-blocket (collapsed-list) ska finnas i arbetskö-toppen.');
  const strip = secondaryQueues[0];
  assert.match(strip, /Historik/, 'Historik-entry (delad hub) ska synas i sekundära raden.');
  assert.match(strip, /data-quick-action="studio"/, 'Studio/Svarstudio-snabbåtgärd ska finnas (data-quick-action="studio").');
  assert.match(strip, /(Svarstudio|Studio)/, 'Synlig studio-etikett ska finnas (Svarstudio eller kortat Studio).');
  assert.match(strip, /data-quick-action="handled"/, 'Klar-snabbåtgärd ska finnas.');
  assert.match(strip, /data-quick-action="delete"/, 'Radera-snabbåtgärd ska finnas.');
  assert.match(strip, /data-queue-lane="admin"/, 'Admin-köspår ska finnas.');
  assert.match(strip, /Granska/, 'Granska-köetikett ska finnas.');
  assert.match(strip, /data-queue-lane="unclear"/, 'Oklart-köspår ska finnas.');
  assert.match(strip, /Bokning/, 'Bokning-köetikett ska finnas.');
  assert.match(strip, /Medicinsk/, 'Medicinsk-köetikett ska finnas.');

  assert.match(
    appSource,
    /queueCategoriesCompact:\s*false/,
    'Toggle-state ska vara ett lokalt compact-state for kategoriblocket.'
  );

  assert.match(
    appSource,
    /queueCategoryToggleButton\.addEventListener\("click"/,
    'Pilbubblan ska kunna toggla mellan expanded och kompakt bubbellage.'
  );

  assert.match(
    appSource,
    /queueScopeStrip\.classList\.toggle\("is-compact",\s*isCompact\)/,
    'Queue-toppen ska anvanda en lokal is-compact-klass i stallet for hide-all.'
  );

  assert.match(
    appSource,
    /renderQueueCategoryStripMode\(\);/,
    'Queue-renderingen ska alltid aterapplicera segmentets visningslage.'
  );

  assert.match(
    actionEngineSource,
    /button\.closest\("\.queue-action-row"\)\s*\|\|\s*button\.closest\("\.queue-scope-strip"\)/,
    'Radera i toppsegmentet ska behandlas som queue-delete och inte focus-delete.'
  );
});
