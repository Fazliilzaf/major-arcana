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
  'cco-mobile-autosave.js',
  'cco-mobile-queue.js',
  'booking-mobile-shell.js',
  'booking-mobile-slot-picker.js',
  'booking-mobile-calendar-day.js',
  'app/cco-missing-forms-ops.js',
];

const REQUIRED_INDEX_MARKERS = [
  'viewport-fit=cover',
  'cco-mobile-shell.css',
  'cco-mobile-core.js',
  'cco-mobile-autosave.js',
  'cco-mobile-shell.js',
  'cco-mobile-queue.js',
  'booking-mobile-calendar-day.js',
  'cco-missing-forms-ops.js',
  'data-missing-forms-open',
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

  const calendarJs = fs.readFileSync(path.join(PREVIEW_DIR, 'booking-mobile-calendar-day.js'), 'utf8');
  assert.match(calendarJs, /data-calendar-grid/, 'BL.1: månadsvy grid saknas');
  assert.match(calendarJs, /getViewMonth/, 'BL.1: månadsvy API saknas');

  const autosaveJs = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-autosave.js'), 'utf8');
  assert.match(autosaveJs, /window\.ArcanaMobileAutosave/, 'ArcanaMobileAutosave export saknas');

  const coreJs = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-core.js'), 'utf8');
  assert.match(coreJs, /window\.ArcanaMobileCore/, 'ArcanaMobileCore export saknas');

  const clinicalJs = fs.readFileSync(path.join(PREVIEW_DIR, 'app', 'journal-pre-treatment-forms.js'), 'utf8');
  assert.match(clinicalJs, /data-clinical-step-panel/, 'pre-treatment mobil steg saknas');

  const queueJs = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-queue.js'), 'utf8');
  assert.match(queueJs, /window\.ArcanaMobileQueue/, 'ArcanaMobileQueue export saknas');

  const missingFormsOps = fs.readFileSync(
    path.join(PREVIEW_DIR, 'app', 'cco-missing-forms-ops.js'),
    'utf8'
  );
  assert.match(missingFormsOps, /ArcanaMissingFormsOps/, 'J-8.1: missing forms ops export saknas');
  assert.match(missingFormsOps, /missing-forms-report/, 'J-8.1: missing-forms-report API saknas');

  const patientUi = fs.readFileSync(path.join(PREVIEW_DIR, 'app', 'patient-master-ui.js'), 'utf8');
  assert.match(patientUi, /goBackToPatientList/, 'goBackToPatientList saknas');
  assert.match(patientUi, /bindJournalAutosaveForms/, 'bindJournalAutosaveForms saknas');
  assert.match(patientUi, /renderDriveFiles/, 'Filer: renderDriveFiles helper saknas');
  assert.match(patientUi, /Inga indexerade Drive-filer/, 'Filer: tom-state copy saknas');
});

test('mobile UX sweep — B3 workspace switch synlig i Konversationer, dold i Kunder', () => {
  const shellCss = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-shell.css'), 'utf8');
  assert.match(
    shellCss,
    /data-app-shell-view="conversations"\][\s\S]*\.mobile-workspace-switch[\s\S]*display:\s*flex/,
    'B3: workspace switch ska visas i Konversationer'
  );
  assert.match(
    shellCss,
    /width:\s*calc\(100% - \(var\(--cco-mobile-gutter\) \* 2\)\)/,
    'B3: fullbredd med 16px gutter'
  );
  assert.doesNotMatch(
    shellCss,
    /html\[data-cco-mobile-shell="on"\]\s*\.mobile-workspace-switch\s*\{[^}]*display:\s*none\s*!important/,
    'B3: global hide !important ska vara borta'
  );
});

test('mobile UX sweep — B4 utility touch + Mer-sheet actions', () => {
  const shellCss = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-shell.css'), 'utf8');
  const shellJs = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-shell.js'), 'utf8');
  const html = fs.readFileSync(INDEX, 'utf8');

  assert.match(
    shellCss,
    /preview-utility-button[\s\S]*min-height:\s*44px/,
    'B4.1: preview-utility-button ska vara 44px'
  );
  assert.match(
    shellCss,
    /preview-compose-pill[\s\S]*display:\s*none\s*!important/,
    'B4.2: compose ska döljas i app-bar'
  );
  assert.match(html, /data-mobile-more-action="compose"/, 'B4.2: Nytt mejl i Mer-sheet');
  assert.match(shellJs, /runMoreAction|data-mobile-more-action/, 'B4.2: Mer-sheet proxy till topbar');
});

test('mobile UX sweep — stängda modal-backdrops suddar inte iOS-vy', () => {
  const shellCss = fs.readFileSync(path.join(PREVIEW_DIR, 'cco-mobile-shell.css'), 'utf8');
  assert.match(
    shellCss,
    /customers-modal-shell:not\(\[data-open\]\)[\s\S]*customers-modal-backdrop[\s\S]*display:\s*none\s*!important/,
    'Stängda customer-modaler ska dölja backdrop helt'
  );
  assert.match(
    shellCss,
    /customers-modal-shell\[data-open\][\s\S]*customers-modal-backdrop[\s\S]*backdrop-filter:\s*blur\(4px\)/,
    'Öppna modaler ska behålla backdrop blur'
  );
  assert.doesNotMatch(
    shellCss,
    /html\[data-cco-mobile-shell="on"\]\s*\.customers-modal-backdrop,\s*\n\s*html\[data-cco-mobile-shell="on"\]\s*\.mailbox-admin-backdrop/,
    'Backdrop-filter får inte ligga på alla backdrops ovillkorligt'
  );
  assert.match(
    shellCss,
    /#later-shell\[aria-hidden="true"\][\s\S]*display:\s*none\s*!important/,
    'Stängda runtime-overlays (later/note/studio) ska display:none på mobil'
  );
  assert.match(
    shellCss,
    /\.preview-page[\s\S]*height:\s*100%\s*!important[\s\S]*overflow-y:\s*auto\s*!important/,
    'Mobil scroll-container ska ha begränsad höjd + overflow-y auto'
  );
});

test('mobile UX sweep — design tokens har phone breakpoint', () => {
  const tokens = fs.readFileSync(path.join(PREVIEW_DIR, 'design-tokens.css'), 'utf8');
  assert.match(tokens, /768|767|phone/i, 'design-tokens saknar mobil breakpoint');
});
