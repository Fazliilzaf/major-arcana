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
