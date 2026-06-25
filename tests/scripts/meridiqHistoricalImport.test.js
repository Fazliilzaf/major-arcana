'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  isJournalQuestionary,
  buildJournalEntryFromMeridiq,
} = require('../../scripts/import-meridiq-historical-journals');
const {
  normalizeEmail,
  normalizePhone,
  normalizeMeridiqClient,
  normalizeMeridiqQuestionaryEntry,
} = require('../../scripts/migration/lib/meridiqApi');

test('parseArgs — default dry-run, commit flips mode', () => {
  const dry = parseArgs(['node', 'script.js']);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.commit, false);

  const commit = parseArgs(['node', 'script.js', '--commit', '--limit=5']);
  assert.equal(commit.dryRun, false);
  assert.equal(commit.commit, true);
  assert.equal(commit.limit, 5);
});

test('normalizeEmail/Phone — svenska format', () => {
  assert.equal(normalizeEmail(' Mailto:Anna@Example.com '), 'anna@example.com');
  assert.equal(normalizePhone('070-123 45 67'), '+46701234567');
});

test('normalizeMeridiqClient — plockar id och kontakt', () => {
  const row = normalizeMeridiqClient({
    id: 9911,
    email: 'x@y.se',
    phone_number: '0701112233',
  });
  assert.equal(row.meridiqClientId, '9911');
  assert.equal(row.email, 'x@y.se');
  assert.equal(row.phone, '+46701112233');
});

test('isJournalQuestionary — tp ja, hälsodeklaration nej', () => {
  const map = new Map([
    ['16411', { journalType: 'tp_treatment', migrate: true }],
    ['16472', { journalType: 'health_declaration', migrate: true }],
  ]);
  assert.equal(isJournalQuestionary({ questionaryId: '16411' }, map), true);
  assert.equal(isJournalQuestionary({ questionaryId: '16472' }, map), false);
  assert.equal(isJournalQuestionary({ questionaryId: '99999' }, map), false);
});

test('buildJournalEntryFromMeridiq — dedup importKey', () => {
  const map = new Map([['16411', { journalType: 'tp_treatment', title: 'TP', migrate: true }]]);
  const entry = buildJournalEntryFromMeridiq({
    tenantId: 'hair_tp',
    ccoPatientId: 'anna@example.com',
    meridiqClientId: '42',
    entry: normalizeMeridiqQuestionaryEntry({
      id: 7001,
      questionary_id: 16411,
      signed_at: '2024-01-15T10:00:00Z',
    }),
    questionaryMap: map,
  });
  assert.equal(entry.importMeta.importKey, 'meridiq::42::7001');
  assert.equal(entry.journalType, 'tp_treatment');
  assert.equal(entry.locked, true);
});
