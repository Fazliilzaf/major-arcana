'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadKkx() {
  const src = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-kundkort-kkx.js'),
    'utf8'
  );
  const sandbox = { window: { CcoV9CustomersParity: {} }, console };
  vm.runInNewContext(`${src}\n;this.exports = window.CcoKundkortKkx;`, sandbox);
  return sandbox.exports;
}

test('steg 4 done efter sign även utan HD', () => {
  const kkx = loadKkx();
  const signedTp = {
    journalType: 'tp_treatment',
    locked: true,
    signedAt: '2026-06-04T10:00:00.000Z',
  };
  const card = {
    missingJournal: true,
    hasJournal: false,
    missingHealthDeclaration: true,
    hasHealthDeclaration: false,
  };
  const readout = kkx.normalizeKkxReadout(card, [signedTp], null, {});
  assert.equal(readout.missingJournal, false);

  const journey = kkx.buildCanonicalJourneyLive(readout, [signedTp], null, {
    historyBookingCount: 1,
  });
  const step4 = journey.steps.find((s) => s.step === 4);
  const step5 = journey.steps.find((s) => s.step === 5);
  assert.equal(step4?.status, 'done');
  assert.equal(step5?.status === 'active' || step5?.status === 'open', true);
});

test('steg 4 future utan sign och utan HD', () => {
  const kkx = loadKkx();
  const card = {
    missingJournal: true,
    missingHealthDeclaration: true,
  };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  const step4 = journey.steps.find((s) => s.step === 4);
  assert.equal(step4?.truth, 'future');
});

test('skipSteps hoppar över op-steg (8) — skippad istället för false', () => {
  const kkx = loadKkx();
  const card = { skipSteps: [8], missingJournal: false, hasJournal: true };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  const step8 = journey.steps.find((s) => s.step === 8);
  assert.equal(step8?.status, 'skipped');
  assert.equal(step8?.truth, 'skipped');
  assert.equal(journey.skippedSteps.includes(8), true);
  assert.equal(journey.skipped, true);
  // Steg 9 påverkas inte.
  assert.notEqual(journey.steps.find((s) => s.step === 9)?.status, 'skipped');
});

test('pathVariant nonSurgical hoppar över op-steg (8) men behåller foto-samtycke (9) — GDPR/ORD-122', () => {
  const kkx = loadKkx();
  const card = { pathVariant: 'nonSurgical', missingJournal: false, hasJournal: true };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  assert.equal(journey.pathVariant, 'nonSurgical');
  // Steg 8 (friskförsäkran) hoppas över — ingen operationsdag.
  assert.equal(journey.steps.find((s) => s.step === 8)?.status, 'skipped');
  assert.equal(journey.steps.find((s) => s.step === 8)?.truth, 'skipped');
  // Steg 9 (foto-/bildsamtycke) FÅR INTE hoppas över — samtycke gäller alla vägar.
  const step9 = journey.steps.find((s) => s.step === 9);
  assert.notEqual(step9?.status, 'skipped');
  assert.notEqual(step9?.truth, 'skipped');
  // Titeln överrids (Bildsamtycke) via variant-stepOverrides, inte skip.
  assert.equal(journey.steps.find((s) => s.step === 9)?.label, 'Bildsamtycke');
});

test('utan flex behålls kanoniskt beteende — inga steg skippas', () => {
  const kkx = loadKkx();
  const card = { missingJournal: false, hasJournal: true };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  assert.equal(journey.skippedSteps.length, 0);
  assert.equal(journey.skipped, false);
  assert.equal(journey.steps.find((s) => s.step === 8)?.status, 'future');
});

test('stepOverrides ersätter steginnehåll utan att hoppa över', () => {
  const kkx = loadKkx();
  const card = {
    missingJournal: false,
    hasJournal: true,
    pathVariant: 'hairTP',
    stepOverrides: {
      8: { title: 'Röntgen inför operation', when: 'T-3 dagar', note: 'Ersatt steg' },
    },
  };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  const step8 = journey.steps.find((s) => s.step === 8);
  assert.equal(step8?.label, 'Röntgen inför operation');
  assert.equal(step8?.when, 'T-3 dagar');
  assert.equal(step8?.note, 'Ersatt steg');
  assert.notEqual(step8?.status, 'skipped');
});

test('behandlingstyp härleder nonSurgical-variant och hoppar över op-steg', () => {
  const kkx = loadKkx();
  const card = { treatmentTypes: ['PRP'], missingJournal: false, hasJournal: true };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  assert.equal(journey.pathVariant, 'nonSurgical');
  assert.equal(journey.steps.find((s) => s.step === 8)?.status, 'skipped');
});

test('explicit pathVariant vinner över behandlingstyp-härledning', () => {
  const kkx = loadKkx();
  const card = {
    treatmentTypes: ['PRP'],
    pathVariant: 'hairTP',
    missingJournal: false,
    hasJournal: true,
  };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  assert.equal(journey.pathVariant, 'hairTP');
  assert.equal(journey.skippedSteps.length, 0);
});

test('renderCanonicalJourneyBig visar Hoppad över för skippat steg', () => {
  const kkx = loadKkx();
  const card = { skipSteps: [8], missingJournal: false, hasJournal: true };
  const html = kkx.renderCanonicalJourneyBig(card, [], null, { historyBookingCount: 1 });
  assert.ok(html.includes('Hoppad över'), 'skippat steg ska märkas Hoppad över');
  assert.ok(html.includes('kkx-cstep skip'), 'skippat steg ska få skip-klass');
});

test('Block 2.1/2.2: steg 10-13 finns; steg 10 done vid signerad behandlingsjournal', () => {
  const kkx = loadKkx();
  const card = {
    missingJournal: false,
    hasJournal: true,
    treatmentJournalSigned: true,
    followUpCount: 3,
  };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  const steps = journey.steps.map((s) => s.step);
  assert.ok(
    steps.includes(10) && steps.includes(11) && steps.includes(12) && steps.includes(13),
    'steg 10-13 ska finnas'
  );
  assert.equal(journey.steps.find((s) => s.step === 10)?.status, 'done');
  assert.equal(journey.steps.find((s) => s.step === 10)?.truth, 'done');
});

test('Block 2.1/2.2: steg 10 future utan signerad behandlingsjournal', () => {
  const kkx = loadKkx();
  const card = { missingJournal: false, hasJournal: true };
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, { historyBookingCount: 1 });
  const step10 = journey.steps.find((s) => s.step === 10);
  assert.equal(step10?.status, 'future');
  assert.notEqual(step10?.truth, 'done');
});
