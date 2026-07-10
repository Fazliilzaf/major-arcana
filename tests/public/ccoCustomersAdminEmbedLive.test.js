'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const UI_PATH = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'patient-master-ui.js');
const CSS_PATH = path.join(ROOT, 'public', 'major-arcana-preview', 'cco-v9-shell-overrides.css');

test('kundregistret renderar snabb listfas före berikad översikt', () => {
  const source = fs.readFileSync(UI_PATH, 'utf8');

  assert.match(source, /initialParams\.set\('phase', 'list'\)/);
  assert.match(source, /applyCustomerShellPayload\(initialPayload/);
  assert.match(source, /Kundregistret laddat\. Uppdaterar översikten/);
  assert.match(source, /timeoutMs: 12_000/);
  assert.match(source, /timeoutMs: 20_000/);
  assert.match(source, /Översikten kunde inte uppdateras just nu/);
});

test('admin-embed äger navigation och kundkolumner vid Safari/tablet-bredd', () => {
  const source = fs.readFileSync(CSS_PATH, 'utf8');

  assert.match(source, /@layer components[\s\S]*\.cco-mobile-tabbar/);
  assert.match(
    source,
    /section\.customers-shell\[data-shell-view="customers"\][\s\S]*display: block !important/
  );
  assert.match(source, /grid-template-columns: minmax\(0, 1fr\) 280px !important/);
  assert.match(source, /\.customers-rail\.intel-shell[\s\S]*grid-column: 2 !important/);
  assert.match(source, /\.customers-center-shell[\s\S]*grid-column: 1 !important/);
  assert.match(source, /grid-template-columns: minmax\(0, 1fr\) !important/);
});
