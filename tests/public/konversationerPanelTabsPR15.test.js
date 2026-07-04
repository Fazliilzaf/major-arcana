'use strict';

/* PR 15 — panel-flikar. Panelerna öppnas som fullskärms-modaler vars backdrop
 * täcker bottenknapparna → man kunde inte öppna resterande paneler utan att
 * först stänga. Fix: en flik-rad i modal-headern (ovanför backdrop) så man kan
 * byta panel direkt. Ingen live-send, ingen ny yta. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(repoRoot, 'public', 'konversationer-bottom-actions.js'),
  'utf8'
);
const html = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PR15: panelTabs listar de öppningsbara panelerna', () => {
  assert.match(source, /function panelTabs\(activeKey\)/);
  assert.match(
    source,
    /key: 'svarstudio', label: 'Svarstudio', open: \(\) => openSvarstudioForSelectedThread\(\)/
  );
  assert.match(source, /key: 'bokning', label: 'Bokning', open: \(\) => openBokningsyta\(\)/);
  assert.match(source, /key: 'smart', label: 'Anteckning', open: \(\) => openSmartAnteckning\(\)/);
  assert.match(source, /key: 'kalender', label: 'Kalender', open: \(\) => openKalender\(\)/);
});

test('PR15: openModal renderar flik-raden i headern', () => {
  assert.match(
    source,
    /function openModal\(\{ title, body, footer, wide, workbench, headChips, tabs, onClose \} = \{\}\)/
  );
  assert.match(source, /if \(tabs && tabs\.length\) \{/);
  assert.match(source, /class: 'action-modal-tabs'/);
  assert.match(source, /'action-modal-tab' \+ \(t\.active \? ' is-active' : ''\)/);
  // aktiv flik gör inget; övriga öppnar sin panel
  assert.match(compact(source), /if \(!t\.active && typeof t\.open === 'function'\) t\.open\(\);/);
});

test('PR15: alla fyra huvudpaneler skickar med flikar', () => {
  assert.match(source, /tabs: panelTabs\('svarstudio'\)/);
  assert.match(source, /tabs: panelTabs\('bokning'\)/);
  assert.match(source, /tabs: panelTabs\('smart'\)/);
  assert.match(source, /tabs: panelTabs\('kalender'\)/);
});

test('PR15: flik-CSS finns (aktiv-state)', () => {
  const c = compact(html);
  assert.match(c, /\.action-modal-tabs \{/);
  assert.match(c, /\.action-modal-tab\.is-active \{/);
});

test('PR15: cache-bust bumpad efter flik-fix', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703z-tabrow/);
});
