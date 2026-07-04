'use strict';

/* PR 16 — bottenknapparna i admin#cco ska fungera med mus-klick.
 * Repro i prod: keyboard-genvägar (B/N/K) öppnade paneler, men mouse click på
 * bottom action bar öppnade inget. Fixen är en central action-router + capture-
 * lyssnare så gamla handlers/lager inte kan svälja klicket. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(repoRoot, 'public', 'konversationer-bottom-actions.js'),
  'utf8'
);
const polishSource = fs.readFileSync(path.join(repoRoot, 'public', 'cco-polish.js'), 'utf8');
const html = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PR16: mus och keyboard använder samma centrala CCO-action-router', () => {
  assert.match(source, /function runCcoAction\(action\)/);
  assert.match(source, /action === 'bokningsyta'\) openBokningsyta\(\)/);
  assert.match(source, /action === 'smart-anteckning'\) openSmartAnteckning\(\)/);
  assert.match(source, /action === 'kalender'\) openKalender\(\)/);
  assert.match(source, /action === 'senare'\) openSenarePanel\(\)/);

  assert.match(source, /runCcoAction\('bokningsyta'\)/);
  assert.match(source, /runCcoAction\('smart-anteckning'\)/);
  assert.match(source, /runCcoAction\('kalender'\)/);
});

test('PR16: klick på bottom action bar fångas i capture-fas och stoppar dubbelhantering', () => {
  assert.match(source, /function actionButtonFromEvent\(event\)/);
  assert.match(source, /\[data-action\]/);
  assert.match(source, /closest\('\.thread-bottom-actions'\)/);
  assert.match(source, /closest\('\.risk-badge-row'\)/);
  assert.match(source, /classList\.contains\('nav-btn'\)/);
  assert.match(compact(source), /document\.addEventListener\( 'click', \(e\) => \{/);
  assert.match(source, /e\.preventDefault\(\)/);
  assert.match(source, /e\.stopPropagation\(\)/);
  assert.match(compact(source), /\}, true \);/);
});

test('PR16: cache-bust bumpad efter bottom click-fixen', () => {
  // bottom-actions bumpad vidare av flik-rad-ändringen (z-tabrow); cco-polish
  // rördes inte av den och ligger kvar på click-fixens bust.
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703z-tabrow/);
  assert.match(html, /cco-polish\.js\?v=20260703y-paneltargets/);
});

test('PR16: global toast-layer blockerar inte bottom action-klick', () => {
  assert.match(polishSource, /className = 'cco-toast-global'/);
  assert.match(polishSource, /pointer-events:none/);
});
