'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// IIFE-filerna registrerar sig på global när de require:as i Node.
require('../public/major-arcana-preview/app/cco-v11-rail-adapters.js');
require('../public/major-arcana-preview/app/cco-v12-workspace-adapters.js');

const v11 = global.CcoV11RailAdapters;
const v12 = global.CcoV12WorkspaceAdapters;

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

test('adapters are registered on global', () => {
  assert.ok(v11, 'CcoV11RailAdapters should exist');
  assert.ok(v12, 'CcoV12WorkspaceAdapters should exist');
  assert.equal(typeof v11.buildJournalsFromEntries, 'function');
  assert.equal(typeof v12.buildJournalModule, 'function');
});

test('V11 rail: displayName is preferred over title and journalType', () => {
  const entries = [
    { title: 'raw-title', displayName: 'Vårdkontakt', journalType: 'consultation' },
    { title: 'raw-title-2', journalType: 'historical_import' },
    { title: 'raw-title-3' },
  ];
  const result = v11.buildJournalsFromEntries(entries);
  assert.equal(result.items[0].title, 'Vårdkontakt');
  assert.equal(result.items[1].title, 'raw-title-2');
  assert.equal(result.items[2].title, 'raw-title-3');
});

test('V12 workspace: displayName is preferred over title and journalType', () => {
  const entries = [
    { title: 'raw-title', displayName: 'Journal-PRP', journalType: 'historical_import' },
    { title: 'raw-title-2', journalType: 'consultation' },
  ];
  const result = v12.buildJournalModule(entries);
  assert.equal(result.items[0].title, 'Journal-PRP');
  assert.equal(result.items[1].title, 'raw-title-2');
});

test('V12 workspace: fmtDateGroup boundaries (Idag / Igår / older)', () => {
  const now = new Date();
  const todayIso = now.toISOString();
  const yesterdayIso = isoDaysAgo(1);
  const lastWeekIso = isoDaysAgo(7);

  const result = v12.buildJournalModule([
    { title: 'last-week', createdAt: lastWeekIso },
    { title: 'yesterday', createdAt: yesterdayIso },
    { title: 'today', createdAt: todayIso },
  ]);

  // Sortering fallande: idag, igår, sist förra veckan.
  assert.equal(result.items[0].group, 'Idag');
  assert.equal(result.items[1].group, 'Igår');
  assert.equal(
    result.items[2].group,
    lastWeekIso.includes('T')
      ? new Date(lastWeekIso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
      : result.items[2].group
  );
});

test('V12 workspace: items are sorted descending by date', () => {
  const result = v12.buildJournalModule([
    { title: 'oldest', createdAt: isoDaysAgo(5) },
    { title: 'newest', createdAt: isoDaysAgo(0) },
    { title: 'middle', createdAt: isoDaysAgo(2) },
  ]);
  assert.deepEqual(
    result.items.map((i) => i.title),
    ['newest', 'middle', 'oldest']
  );
});

test('V12 workspace: group fallback for missing dates', () => {
  const result = v12.buildJournalModule([{ title: 'no-date' }]);
  assert.equal(result.items[0].group, 'Okänt datum');
});
