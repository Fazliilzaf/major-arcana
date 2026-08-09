'use strict';

/**
 * PR #1348 ("visa journalers displayName och gruppera efter datum") påstod
 * i sin beskrivning att enhetstester kördes mot båda adaptrarna — men
 * diffen innehöll inga testfiler, och inget befintligt test täckte
 * displayName-prioriteringen eller `fmtDateGroup`. De här testerna fyller
 * det gapet, mot de RIKTIGA funktionerna (samma vm.runInNewContext-mönster
 * som `ccoV12CanonAdapters.test.js`), inte stubbar.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadV11Adapters() {
  const src = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-v11-rail-adapters.js'),
    'utf8'
  );
  const sandbox = { window: {}, console };
  vm.runInNewContext(`${src}\n;this.exports = window.CcoV11RailAdapters;`, sandbox);
  return sandbox.exports;
}

function loadV12Adapters() {
  const src = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-v12-workspace-adapters.js'),
    'utf8'
  );
  const sandbox = { window: {}, console };
  vm.runInNewContext(`${src}\n;this.exports = window.CcoV12WorkspaceAdapters;`, sandbox);
  return sandbox.exports;
}

const V11 = loadV11Adapters();
const V12 = loadV12Adapters();

test('V11 buildJournalsFromEntries prioriterar displayName före title/journalType/formKey', () => {
  const { items } = V11.buildJournalsFromEntries([
    {
      displayName: '2024-05-24 · FUE Operation · Journal · signerad',
      title: 'Journal-PRP-Anna-1234.pdf',
      journalType: 'consultation',
      formKey: 'form-9',
      signedAt: '2024-05-24T10:00:00.000Z',
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '2024-05-24 · FUE Operation · Journal · signerad');
});

test('V11 buildJournalsFromEntries faller tillbaka på title, journalType, formKey i tur och ordning', () => {
  const noDisplayName = V11.buildJournalsFromEntries([
    { title: 'Rätt titel', journalType: 'consultation', formKey: 'form-1' },
  ]);
  assert.equal(noDisplayName.items[0].title, 'Rätt titel');

  const noTitle = V11.buildJournalsFromEntries([
    { journalType: 'consultation', formKey: 'form-1' },
  ]);
  assert.equal(noTitle.items[0].title, 'consultation');

  const onlyFormKey = V11.buildJournalsFromEntries([{ formKey: 'form-1' }]);
  assert.equal(onlyFormKey.items[0].title, 'form-1');

  const nothing = V11.buildJournalsFromEntries([{}]);
  assert.equal(nothing.items[0].title, 'Journalpost');
});

test('V12 buildJournalModule prioriterar displayName före title/journalType', () => {
  const { items } = V12.buildJournalModule([
    {
      displayName: 'Hälsodeklaration',
      title: 'Friskfo??rsa??kran-Anna-1234.pdf',
      journalType: 'health_declaration',
      signedAt: '2024-05-24T10:00:00.000Z',
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Hälsodeklaration');
});

test('V12 buildJournalModule faller tillbaka på title, sedan journalType, sedan default', () => {
  const noDisplayName = V12.buildJournalModule([
    { title: 'Rätt titel', journalType: 'consultation' },
  ]);
  assert.equal(noDisplayName.items[0].title, 'Rätt titel');

  const noTitle = V12.buildJournalModule([{ journalType: 'consultation' }]);
  assert.equal(noTitle.items[0].title, 'consultation');

  const nothing = V12.buildJournalModule([{}]);
  assert.equal(nothing.items[0].title, 'Journalanteckning');
});

test('V12 buildJournalModule sorterar fallande på datum (senaste först)', () => {
  const { items } = V12.buildJournalModule([
    { displayName: 'Äldst', signedAt: '2024-01-01T00:00:00.000Z' },
    { displayName: 'Nyast', signedAt: '2024-06-01T00:00:00.000Z' },
    { displayName: 'Mellan', signedAt: '2024-03-01T00:00:00.000Z' },
  ]);
  assert.deepEqual(
    items.map((i) => i.title),
    ['Nyast', 'Mellan', 'Äldst']
  );
});

test('V12 fmtDateGroup grupperar dagens datum som "Idag" och gårdagens som "Igår"', () => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const { items } = V12.buildJournalModule([
    { displayName: 'Dagens', signedAt: today.toISOString() },
    { displayName: 'Gårdagens', signedAt: yesterday.toISOString() },
  ]);

  const byTitle = Object.fromEntries(items.map((i) => [i.title, i.group]));
  assert.equal(byTitle['Dagens'], 'Idag');
  assert.equal(byTitle['Gårdagens'], 'Igår');
});

test('V12 fmtDateGroup faller tillbaka på kort datumformat för äldre poster, "Okänt datum" utan isoDate', () => {
  const oldDate = new Date('2020-03-15T10:00:00.000Z');
  const expectedGroup = new Date(
    oldDate.getFullYear(),
    oldDate.getMonth(),
    oldDate.getDate()
  ).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

  const { items } = V12.buildJournalModule([
    { displayName: 'Gammal post', signedAt: oldDate.toISOString() },
    { displayName: 'Utan datum' },
  ]);

  const byTitle = Object.fromEntries(items.map((i) => [i.title, i.group]));
  assert.equal(byTitle['Gammal post'], expectedGroup);
  assert.equal(byTitle['Utan datum'], 'Okänt datum');
});
