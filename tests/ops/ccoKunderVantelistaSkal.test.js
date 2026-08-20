'use strict';

/**
 * Vantelistesignalen far inte utlosas av tomma bokningsarenden.
 *
 * Bakgrund: ett bokningsarende skapas automatiskt med status needs_triage sa
 * fort nagon OPPNAR en konversation (ccoWorkspace.js:770) eller bokningsytan
 * (ccoBookings.js:849). I produktion var 134 av 148 arenden sadana skal.
 *
 * Sa lange needs_triage rakandes som vantelista blev foljden att patienter
 * visades som vantande pa tid for att nagon rakat titta pa deras konversation.
 * Signalen gar hela vagen ut i segmentet "Vantelista", raknaren i kundvyn och
 * taggen "Pa vantelistan" pa patientkortet — den ar alltsa inte kosmetisk, den
 * far personalen att tro att nagon vantar pa svar.
 *
 * Det som avgor ar inte statusen utan om arendet innehaller nagot en manniska
 * lagt dit. Ett skal har exakt en handelse (case_created) och inget annat.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBookingSignalsIndex } = require('../../src/ops/ccoKunderBookingEnrichment');

const PATIENT = {
  id: 'pat-1',
  primaryEmail: 'anna@example.se',
  emails: ['anna@example.se'],
  phones: [],
  cliento: {},
};

function skal(overrides = {}) {
  // Exakt sa ett arende ser ut direkt efter ensureCase.
  return {
    bookingCaseId: 'case-skal',
    customerEmail: 'anna@example.se',
    conversationId: 'conv-1',
    status: 'needs_triage',
    source: 'workspace_bootstrap',
    selectedSlots: [],
    events: [{ type: 'case_created' }],
    ...overrides,
  };
}

function signalFor(bookingCases, patients = [PATIENT]) {
  const { index } = buildBookingSignalsIndex({
    patients,
    bookingCases,
    engineBookings: [],
    clientoBookings: [],
    encounters: [],
    services: [],
  });
  return index.get('pat-1') || null;
}

test('tomt skal satter INTE patienten pa vantelistan', () => {
  const sig = signalFor([skal()]);
  assert.ok(sig, 'patienten ska finnas i signalindexet');
  assert.notEqual(sig.onWaitlist, true, 'ett oppnat men orort arende ar ingen vantelista');
});

test('skal fran bokningsytan raknas inte heller', () => {
  // Andra skapandestallet anvander source 'operator', sa source duger inte
  // som skiljetecken — det ar innehallet som avgor.
  const sig = signalFor([skal({ source: 'operator' })]);
  assert.notEqual(sig.onWaitlist, true);
});

test('arende med valda tider raknas som vantelista', () => {
  const sig = signalFor([
    skal({ selectedSlots: [{ slotId: 's1', startsAt: '2026-09-01T09:00:00.000Z' }] }),
  ]);
  assert.equal(sig.onWaitlist, true);
});

test('arende med angiven behandling raknas, aven utan tider', () => {
  const sig = signalFor([skal({ requestedTreatment: 'PRP har' })]);
  assert.equal(sig.onWaitlist, true);
});

test('arende med fler handelser an skapandet raknas', () => {
  const sig = signalFor([
    skal({ events: [{ type: 'case_created' }, { type: 'operator_note_added' }] }),
  ]);
  assert.equal(sig.onWaitlist, true);
});

test('statusar dar en manniska agerat raknas alltid', () => {
  for (const status of ['slots_ready', 'offered', 'waiting_customer']) {
    const sig = signalFor([skal({ status })]);
    assert.equal(sig.onWaitlist, true, `${status} ska ge vantelista`);
  }
});

test('avslutade arenden ar inte vantelista', () => {
  for (const status of ['confirmed_external', 'cancelled', 'closed', 'follow_up_completed']) {
    const sig = signalFor([skal({ status })]);
    assert.notEqual(sig.onWaitlist, true, `${status} ska inte ge vantelista`);
  }
});
