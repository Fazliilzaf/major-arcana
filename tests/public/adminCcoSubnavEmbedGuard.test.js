'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SUBNAV_JS = path.join(ROOT, 'public', 'admin', 'cco-subnav.js');
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

test('admin embed markeras i customers-sidan så demo-chrome kan gömmas', () => {
  const html = read(INDEX_HTML);

  assert.match(html, /document\.documentElement\.classList\.add\('is-admin-embed'\)/);
  assert.match(html, /document\.body\.classList\.add\('is-admin-embed'\)/);
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
