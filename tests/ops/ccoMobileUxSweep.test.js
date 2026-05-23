const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');
const PREVIEW_DIR = path.join(ROOT, 'public', 'major-arcana-preview');

const REQUIRED_MOBILE_ASSETS = [
  'cco-mobile-shell.css',
  'cco-mobile-shell.js',
  'cco-mobile-core.js',
  'cco-mobile-queue.js',
  'booking-mobile-shell.js',
  'booking-mobile-slot-picker.js',
  'booking-mobile-calendar-day.js',
];

const REQUIRED_INDEX_MARKERS = [
  'viewport-fit=cover',
  'cco-mobile-shell.css',
  'cco-mobile-core.js',
  'cco-mobile-shell.js',
  'cco-mobile-queue.js',
  'booking-mobile-calendar-day.js',
  'cco-mobile-tabbar',
  'cco-mobile-back-button',
  'cco-mobile-menu-button',
  'id="cco-mobile-app-title"',
  'data-mobile-tab="calendar"',
  'data-mobile-tab="journal"',
];

test('mobile UX sweep — preview index länkar shell assets', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  for (const marker of REQUIRED_INDEX_MARKERS) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `index.html saknar ${marker}`);
  }
});

test('mobile UX sweep — shell asset-filer finns', () => {
  for (const file of REQUIRED_MOBILE_ASSETS) {
    const full = path.join(PREVIEW_DIR, file);
    assert.ok(fs.existsSync(full), `saknar ${file}`);
    assert.ok(fs.statSync(full).size > 100, `${file} verkar tom`);
  }
});

test('mobile UX sweep — shell JS exporterar API-ytor', () => {
  const shellJs = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-shell.js'), 'utf8');
  assert.match(shellJs, /window\.ArcanaMobileShell/, 'ArcanaMobileShell export saknas');
  assert.match(shellJs, /navigateToCalendar/, 'navigateToCalendar saknas');

  const coreJs = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-core.js'), 'utf8');
  assert.match(coreJs, /window\.ArcanaMobileCore/, 'ArcanaMobileCore export saknas');

  const queueJs = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-queue.js'), 'utf8');
  assert.match(queueJs, /window\.ArcanaMobileQueue/, 'ArcanaMobileQueue export saknas');

  const patientUi = fs.readFileSync(path.join(PREVIEW_DIR, 'app', 'patient-master-ui.js'), 'utf8');
  assert.match(patientUi, /goBackToPatientList/, 'goBackToPatientList saknas');
  assert.match(patientUi, /setPatientTab/, 'setPatientTab saknas');
});

test('mobile UX sweep — design tokens har phone breakpoint', () => {
  const tokens = fs.readFileSync(path.join(PREVIEW_DIR, 'design-tokens.css'), 'utf8');
  assert.match(tokens, /768|767|phone/i, 'design-tokens saknar mobil breakpoint');
});
