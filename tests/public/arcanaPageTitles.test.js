const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadArcanaPageTitles() {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/arcana-page-titles.js'),
    'utf8'
  );
  const sandbox = { document: { title: '' } };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return { titles: sandbox.ArcanaPageTitles, document: sandbox.document };
}

test('formatArcanaTitle uses Sidnamn · Arcana pattern', () => {
  const { titles } = loadArcanaPageTitles();
  assert.equal(titles.formatArcanaTitle('Chatt'), 'Chatt · Arcana');
  assert.equal(titles.formatArcanaTitle('Operatörsvy'), 'Operatörsvy · Arcana');
});

test('formatAdminTitle uses Subsida · Admin · Arcana pattern', () => {
  const { titles } = loadArcanaPageTitles();
  assert.equal(titles.formatAdminTitle('Översikt'), 'Översikt · Admin · Arcana');
});

test('applyArcanaTitle updates document.title', () => {
  const { titles, document } = loadArcanaPageTitles();
  titles.applyArcanaTitle('Bokning');
  assert.equal(document.title, 'Bokning · Arcana');
});
