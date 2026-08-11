'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildJournalReadout,
  buildJournalDisplayName,
} = require('../../src/ops/ccoJournalStore');
const { buildVisitSegments } = require('../../src/ops/ccoPatientVisitSegments');

test('buildJournalDisplayName formats date, type, status', () => {
  const displayName = buildJournalDisplayName({
    journalType: 'tp_treatment',
    status: 'signed',
    updatedAt: '2024-06-15T10:30:00Z',
  });
  assert.equal(displayName, '2024-06-15 · TP · Journal · signerad');
});

test('buildJournalDisplayName maps journal types', () => {
  const cases = [
    { journalType: 'prp_treatment', status: 'draft', expected: 'PRP' },
    { journalType: 'bleph_treatment', status: 'signed', expected: 'Curatiio' },
    { journalType: 'follow_up', status: 'signed', expected: 'Uppföljning' },
    { journalType: 'consultation_plan', status: 'signed', expected: 'Konsultation' },
    { journalType: 'consent_bundle', status: 'signed', expected: 'Avtal + samtycke' },
    { journalType: 'health_declaration', status: 'signed', expected: 'Hälsodeklaration' },
    { journalType: 'fitness_certificate', status: 'signed', expected: 'Friskförsäkran' },
    { journalType: 'historical_import', status: 'signed', expected: 'Historisk import' },
  ];
  for (const { journalType, status, expected } of cases) {
    const displayName = buildJournalDisplayName({ journalType, status, updatedAt: '2024-05-21T08:00:00Z' });
    assert.ok(displayName.includes(` · ${expected} · `), `${journalType}: expected ${expected} in ${displayName}`);
  }
});

test('buildJournalDisplayName falls back to treatmentType when present', () => {
  const displayName = buildJournalDisplayName({
    journalType: 'tp_treatment',
    treatmentType: 'Custom treatment',
    status: 'signed',
    updatedAt: '2024-06-15T10:30:00Z',
  });
  assert.equal(displayName, '2024-06-15 · Custom treatment · Journal · signerad');
});

test('buildJournalDisplayName uses signedAt before updatedAt and createdAt', () => {
  const displayName = buildJournalDisplayName({
    journalType: 'tp_treatment',
    status: 'signed',
    createdAt: '2024-06-13T10:30:00Z',
    updatedAt: '2024-06-14T10:30:00Z',
    signedAt: '2024-06-15T10:30:00Z',
  });
  assert.equal(displayName, '2024-06-15 · TP · Journal · signerad');
});

test('buildJournalDisplayName handles missing date', () => {
  const displayName = buildJournalDisplayName({
    journalType: 'tp_treatment',
    status: 'draft',
  });
  assert.equal(displayName, 'okänt datum · TP · Journal · utkast');
});

test('buildJournalReadout prefers stored displayName', () => {
  const readout = buildJournalReadout({
    entryId: '1',
    journalType: 'tp_treatment',
    status: 'signed',
    updatedAt: '2024-06-15T10:30:00Z',
    title: 'Journal | TP Behandling',
    displayName: '2024-06-15 · TP · Journal · signerad',
  });
  assert.equal(readout.displayName, '2024-06-15 · TP · Journal · signerad');
  assert.equal(readout.title, 'Journal | TP Behandling');
});

test('buildJournalReadout computes displayName when not stored', () => {
  const readout = buildJournalReadout({
    entryId: '1',
    journalType: 'prp_treatment',
    status: 'draft',
    updatedAt: '2024-05-21T08:00:00Z',
    title: 'Journal | PRP',
  });
  assert.equal(readout.displayName, '2024-05-21 · PRP · Journal · utkast');
  assert.equal(readout.title, 'Journal | PRP');
});

test('buildJournalReadout returns corrected status label', () => {
  const readout = buildJournalReadout({
    entryId: '1',
    journalType: 'tp_treatment',
    status: 'corrected',
    updatedAt: '2024-06-15T10:30:00Z',
  });
  assert.equal(readout.displayName, '2024-06-15 · TP · Journal · korrigerad');
});

test('buildVisitSegments copies journal displayName into segment journals', () => {
  const result = buildVisitSegments({
    customerId: 'patient-1',
    journalEntries: [
      {
        entryId: 'je-1',
        journalType: 'tp_treatment',
        status: 'signed',
        updatedAt: '2024-04-22T09:14:00Z',
        treatmentEncounterId: 'enc-1',
        title: 'Journal | TP Behandling',
      },
    ],
  });
  const segment = result.visitSegments.find((s) => s.encounterId === 'enc-1');
  assert.ok(segment, 'expected segment with encounterId enc-1');
  assert.equal(segment.journals.length, 1);
  assert.equal(segment.journals[0].displayName, '2024-04-22 · TP · Journal · signerad');
  assert.equal(segment.journals[0].title, '2024-04-22 · TP · Journal · signerad');
});

test('buildVisitSegments uses stored displayName for segment journal title', () => {
  const result = buildVisitSegments({
    customerId: 'patient-1',
    journalEntries: [
      {
        entryId: 'je-1',
        journalType: 'tp_treatment',
        status: 'signed',
        updatedAt: '2024-04-22T09:14:00Z',
        treatmentEncounterId: 'enc-1',
        title: 'Journal | TP Behandling',
        displayName: '2024-04-22 · TP · signerad',
      },
    ],
  });
  const segment = result.visitSegments.find((s) => s.encounterId === 'enc-1');
  assert.equal(segment.journals[0].displayName, '2024-04-22 · TP · signerad');
  assert.equal(segment.journals[0].title, '2024-04-22 · TP · signerad');
});
