'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'public/cco-kalender-shell.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/kalender.html'), 'utf8');
const visualFixture = fs.readFileSync(
  path.join(root, 'tests/visual/fixtures/cco-calendar-readonly-booking-preflight.html'),
  'utf8'
);

function loadShell() {
  const sandbox = {
    window: { CCO_CALENDAR_READ_ONLY: true },
    document: { readyState: 'loading', addEventListener() {} },
    console,
    Date,
    Intl,
    Map,
    Set,
    URLSearchParams,
  };
  vm.runInNewContext(`${source}\n;this.exports = window.CcoKalenderShell;`, sandbox);
  return sandbox.exports;
}

function canonicalSlot(overrides = {}) {
  return {
    id: 'booking-canonical',
    bookingId: 'booking-canonical',
    patientId: 'patient-canonical',
    patientName: 'Canonical Patient',
    encounterId: 'encounter-canonical',
    serviceId: 'prp-hair',
    serviceLabel: 'PRP hår',
    resourceId: 'resource-egzona',
    resourceLabel: 'Rum 2',
    practitioner: 'Egzona',
    startsAt: '2026-07-17T10:00:00.000Z',
    source: 'cliento_export',
    ...overrides,
  };
}

test('preflight shows canonical care data and converts time to Europe/Stockholm', () => {
  const preflight = loadShell().buildReadonlyBookingPreflight(canonicalSlot());
  const fields = Object.fromEntries(preflight.fields);

  assert.equal(preflight.readOnly, true);
  assert.equal(preflight.zeroWrites, true);
  assert.equal(preflight.actionAllowed, false);
  assert.equal(preflight.identityState, 'canonical');
  assert.equal(fields['Canonical patientId'], 'patient-canonical');
  assert.equal(fields.Behandling, 'PRP hår');
  assert.equal(fields.Resurs, 'Rum 2');
  assert.equal(fields.Vårdgivare, 'Egzona');
  assert.equal(fields.Tid, '2026-07-17 kl 12:00 · Europe/Stockholm');
  assert.ok(
    preflight.gates.some((gate) => gate.key === 'canonical_patient' && gate.status === 'pass')
  );
  assert.ok(
    preflight.gates.some(
      (gate) => gate.key === 'provider_write_contract' && gate.status === 'blocked'
    )
  );
});

test('missing or ambiguous identity remains unlinked and fail-closed', () => {
  const missing = loadShell().buildReadonlyBookingPreflight(
    canonicalSlot({
      patientId: '',
      encounterId: '',
      bookingId: '',
      practitioner: '',
      resourceLabel: 'Rum 2',
      treatmentPresent: false,
    })
  );
  assert.equal(missing.identityState, 'missing');
  assert.ok(missing.blockers.some((gate) => gate.key === 'canonical_patient'));
  assert.ok(missing.blockers.some((gate) => gate.key === 'booking_reference'));
  assert.ok(missing.blockers.some((gate) => gate.key === 'treatment'));
  assert.ok(missing.blockers.some((gate) => gate.key === 'encounter_policy'));
  assert.ok(missing.blockers.some((gate) => gate.key === 'practitioner'));
  assert.equal(Object.fromEntries(missing.fields).Behandling, 'Saknas');
  assert.equal(Object.fromEntries(missing.fields).Vårdgivare, 'Saknas');

  const ambiguous = loadShell().buildReadonlyBookingPreflight(
    canonicalSlot({ identityAmbiguous: true, linkAllowed: false })
  );
  assert.equal(ambiguous.identityState, 'ambiguous');
  assert.equal(Object.fromEntries(ambiguous.fields)['Canonical patientId'], 'Tvetydig · okopplad');
  assert.ok(ambiguous.blockers.some((gate) => gate.key === 'identity_unambiguous'));
});

test('read-only preflight exposes every operational safety gate and no mutation action', () => {
  const preflight = loadShell().buildReadonlyBookingPreflight(canonicalSlot());
  const keys = new Set(preflight.gates.map((gate) => gate.key));
  for (const key of [
    'canonical_patient',
    'identity_unambiguous',
    'booking_reference',
    'treatment',
    'resource',
    'practitioner',
    'stockholm_time',
    'encounter_policy',
    'provider_write_contract',
    'write_permission',
    'idempotency',
    'append_only_audit',
    'recovery',
  ])
    assert.ok(keys.has(key), `missing gate ${key}`);

  const block = source.slice(
    source.indexOf('function buildReadonlyBookingPreflight'),
    source.indexOf('function createBookingIdempotencyKey')
  );
  assert.doesNotMatch(
    block,
    /fetch\s*\(|method\s*:\s*['"]POST|\/cco-booking-engine\/(confirm|cancel|rebook)/
  );
  assert.doesNotMatch(block, /Bekräfta bokning|Flytta bokning|Avboka bokning/);
  assert.match(block, /actionAllowed: false/);
  assert.ok(
    source.indexOf('global.CcoKalenderShell = isReadOnlyMode()') <
      source.indexOf("document.addEventListener('DOMContentLoaded', init)")
  );
  assert.match(html, /cco-kalender-shell\.js\?v=20260717j/);
  assert.match(visualFixture, /window\.CcoKalenderShell\.renderDrawer/);
  assert.match(visualFixture, /window\.CCO_CALENDAR_READ_ONLY = true/);
  assert.doesNotMatch(visualFixture, /fetch\s*\(|method\s*:\s*['"]POST/);
});
