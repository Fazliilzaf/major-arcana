'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ADMIN_HTML = path.join(ROOT, 'public', 'admin.html');
const SUBNAV_JS = path.join(ROOT, 'public', 'admin', 'cco-subnav.js');
const SHELL_CSS = path.join(ROOT, 'public', 'admin', 'cco-shell.css');
const CONVERSATIONS_HTML = path.join(ROOT, 'public', 'konversationer.html');
const INDEX_HTML = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');
const SHELL_OVERRIDES = path.join(
  ROOT,
  'public',
  'major-arcana-preview',
  'cco-v9-shell-overrides.css'
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('admin#cco kundlänk fortsätter peka på customers-vyn med alla v9/v11/v12-flaggor', () => {
  const subnav = read(SUBNAV_JS);

  assert.match(
    subnav,
    /kunder:\s*PREVIEW \+ '\?view=customers&' \+ SPA_FLAGS \+ '&v11rail=on&v12workspace=on',/,
    'Kunder-länken ska fortsätta återbruka den befintliga customers-vyn'
  );
  assert.match(
    subnav,
    /var SPA_FLAGS = 'v9=on&demo=on&demoOpDay=1&embed=admin';/,
    'embed=admin måste fortsätta följa med in i customers-vyn'
  );
});

test('admin#cco använder ett neutralt skal utan att byta befintliga målunderlag', () => {
  const html = read(ADMIN_HTML);
  const subnav = read(SUBNAV_JS);
  const css = read(SHELL_CSS);

  assert.equal((html.match(/data-cco-subnav/g) || []).length, 1, 'exakt ett CCO-nav ska finnas');
  assert.equal(
    (html.match(/id="ccoPreviewEmbedFrame"/g) || []).length,
    1,
    'exakt en aktiv innehålls-iframe ska finnas'
  );
  assert.match(html, /\/admin\/cco-shell\.css\?v=__ARCANA_UI_BUILD__/);
  assert.match(
    html,
    /data-src="\/konversationer\.html\?v=__ARCANA_UI_BUILD__&amp;embed=admin"/,
    'Konversationer ska laddas navlöst i admin-skalet'
  );
  assert.match(subnav, /kalender:\s*'\/kalender\.html\?embed=1'/);
  assert.match(subnav, /automatisering:\s*PREVIEW \+ 'cco-automatisering-v3\.html'/);
  assert.match(subnav, /analys:\s*PREVIEW \+ 'cco-analytics-v3\.html'/);
  assert.match(subnav, /integrationer:\s*PREVIEW \+ 'cco-integrationer-v3\.html'/);
  assert.match(subnav, /makron:\s*PREVIEW \+ 'cco-makron-v3\.html'/);
  assert.match(subnav, /installningar:\s*PREVIEW \+ 'cco-installningar-v3-2\.html'/);
  assert.match(subnav, /notiser:\s*PREVIEW \+ 'cco-notiser-v3\.html'/);
  assert.match(subnav, /signaturer:\s*PREVIEW \+ 'cco-signaturer-v3\.html'/);
  assert.match(subnav, /revisor:\s*PREVIEW \+ 'cco-revisor-v3\.html'/);
  assert.match(subnav, /showcase:\s*PREVIEW \+ 'cco-showcase-v3\.html'/);

  assert.match(css, /body\.cco-preview-embed-route \.cco-subnav \{/);
  assert.match(css, /background:\s*transparent;/);
  assert.match(css, /body\.cco-preview-embed-route \.cco-subnav-btn\.is-active \{/);
  assert.match(css, /#fce9f0/);
  assert.match(css, /#f1cfdc/);
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.cco-subnav \{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow:\s*visible;/,
    'mobilnav ska visa alla kategorier och inte klippa Mer-menyn'
  );
});

test('konversationer embed gömmer bara dublettnav och bevarar sök samt riskkontroller', () => {
  const html = read(CONVERSATIONS_HTML);

  assert.match(html, /get\('embed'\) === 'admin'/);
  assert.match(
    html,
    /html\.is-admin-cco-content \.top-nav > \.brand,\s*html\.is-admin-cco-content \.top-nav > a \{\s*display:\s*none;/s
  );
  assert.doesNotMatch(
    html,
    /html\.is-admin-cco-content \.top-nav \{\s*display:\s*none;/s,
    'hela top-nav får inte döljas eftersom den också bär notiser, riskstatus och sök'
  );
  assert.match(html, /class="risk-badge-row" id="risk-badge-row"/);
  assert.match(html, /class="global-search"/);
});

test('admin embed markeras i customers-sidan så demo-chrome kan gömmas', () => {
  const html = read(INDEX_HTML);

  assert.match(html, /document\.documentElement\.classList\.add\('is-admin-embed'\)/);
  assert.match(html, /document\.body\.classList\.add\('is-admin-embed'\)/);
  assert.match(
    html,
    /cco-v9-shell-overrides\.css\?v=admin-embed-single-shell-v1/,
    'admin-embed CSS måste cache-bustas så den nya toppbar-gömningen laddas om'
  );
});

test('admin embed gömmer watch chrome i customers-vyn', () => {
  const css = read(SHELL_OVERRIDES);

  assert.match(
    css,
    /html\.is-admin-embed\[data-v9-enabled="on"\] \{\s*--topbar-height:\s*0px;\s*--workspace-top-clearance:\s*0px;/s,
    'admin-embed ska nollställa topbar-måtten'
  );
  assert.match(
    css,
    /html\.is-admin-embed\[data-v9-enabled="on"\] \.preview-topbar \{\s*display:\s*none !important;/s,
    'preview-topbar ska döljas i admin-embed'
  );
  assert.match(
    css,
    /html\.is-admin-embed\[data-v9-enabled="on"\] \.v9-watch-widget/,
    'watch-widget ska döljas i admin-embed'
  );
  assert.match(
    css,
    /html\.is-admin-embed\[data-v9-enabled="on"\] \.v9-watch-wrap/,
    'watch-wrap ska döljas i admin-embed'
  );
});
