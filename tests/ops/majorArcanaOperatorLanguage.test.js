const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const GLOSSARY_PATH = path.join(ROOT, 'docs', 'uiux', 'cco-operator-language.md');
const PREVIEW_FILES = [
  path.join(ROOT, 'public', 'major-arcana-preview', 'index.html'),
  path.join(ROOT, 'public', 'major-arcana-preview', 'app.js'),
  path.join(ROOT, 'public', 'major-arcana-preview', 'runtime-i18n.js'),
  path.join(ROOT, 'public', 'major-arcana-preview', 'runtime-queue-renderers.js'),
  path.join(ROOT, 'public', 'major-arcana-preview', 'runtime-focus-intel-renderers.js'),
  path.join(ROOT, 'public', 'major-arcana-preview', 'runtime-dom-live-composition.js'),
  path.join(ROOT, 'public', 'major-arcana-preview', 'runtime-overlay-renderers.js'),
  path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'demo-fixtures-data.js'),
  path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-shims.js'),
];

const REQUIRED_TERMS = [
  'Svarstudio',
  'Fokuspass',
  'Mejlkonto',
  'Mejlurval',
  'Sanningsvy',
  'Mejlsanning',
  'Aktiv tråd',
  'Extern kalender',
];

const FORBIDDEN_VISIBLE_TERMS = [
  'Truth Worklist Assist View',
  'Öppna Studio',
  'Sprint 3',
  'Mailbox truth',
  'Live runtime',
  'Mailboxscope',
  'live-tråd',
  'Truth-driven',
  'truth-driven',
  'Reply-context',
  'Öppna readout',
  'Öppna full readout',
];

test('CCO-ordlistan låser godkända operatörstermer för boknings- och mailytan', () => {
  const source = fs.readFileSync(GLOSSARY_PATH, 'utf8');

  for (const term of REQUIRED_TERMS) {
    assert.match(source, new RegExp(term), `Ordlistan ska dokumentera operatörstermen "${term}".`);
  }

  assert.match(
    source,
    /Cliento[\s\S]*Extern kalender/,
    'Ordlistan ska göra Cliento till Extern kalender i synlig bokningscopy.'
  );
});

test('major-arcana-preview läcker inte gamla tekniska operatörslabels', () => {
  const combinedSource = PREVIEW_FILES.map((filePath) => fs.readFileSync(filePath, 'utf8')).join(
    '\n'
  );

  for (const term of FORBIDDEN_VISIBLE_TERMS) {
    assert.doesNotMatch(
      combinedSource,
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `Preview-copy ska inte visa den gamla tekniska termen "${term}".`
    );
  }

  assert.match(combinedSource, /Svarstudio/, 'Previewn ska använda Svarstudio som synlig term.');
  assert.match(combinedSource, /Fokuspass/, 'Previewn ska använda Fokuspass som synlig term.');
  assert.match(combinedSource, /Mejlkonto/, 'Previewn ska använda Mejlkonto som synlig term.');
  assert.match(combinedSource, /Mejlurval/, 'Previewn ska använda Mejlurval som synlig term.');
});
