'use strict';

/**
 * patientId hela vagen fran store till kalenderslot.
 *
 * Bakgrund: migreringen 2026-08-20 satte patientId pa 42 051 av 53 316
 * Cliento-bokningar. Datan var alltsa kopplad — men clinicCalendarView bar
 * inte fältet vidare, sa /api/v1/calendar/day och /week kunde anda inte lanka
 * till ett kundkort. Kopplingen fanns i filen och ingenstans i granssnittet.
 *
 * Testet gar via buildDayView, inte via de interna normaliserarna, eftersom
 * det ar slotens form som ar kontraktet mot klienten. Ett falt kan finnas pa
 * entry och anda tappas i toSlot — det var precis det som var fallet.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDayView } = require('../../src/ops/clinicCalendarView');

const DATUM = '2026-09-15';

function clientoStoreMed(bookings) {
  return {
    listAllBookings: () => bookings,
  };
}

function bokning(overrides = {}) {
  return {
    id: 'cl-1',
    startsAt: `${DATUM}T09:00:00.000Z`,
    endsAt: `${DATUM}T10:00:00.000Z`,
    customerName: 'Anna Andersson',
    customerEmail: 'anna@exempel.se',
    staffName: 'Vardgivare A',
    serviceLabel: 'Konsultation',
    status: 'completed',
    source: 'cliento_csv',
    ...overrides,
  };
}

function slots(bookings) {
  const vy = buildDayView({
    date: DATUM,
    bookingEngineStore: null,
    clientoBookingStore: clientoStoreMed(bookings),
    encounterStore: null,
    tenantId: '',
  });
  // Dagvyn kan gruppera slots per resurs; platta ut oavsett form.
  const alla = [];
  const samla = (nod) => {
    if (!nod || typeof nod !== 'object') return;
    if (Array.isArray(nod)) {
      for (const x of nod) samla(x);
      return;
    }
    if (typeof nod.startsAt === 'string' && 'patientName' in nod) alla.push(nod);
    for (const v of Object.values(nod)) if (v && typeof v === 'object') samla(v);
  };
  samla(vy);
  return alla;
}

test('lankad bokning bar patientId ut i sloten', () => {
  const funna = slots([bokning({ patientId: 'pat-123', patientIdResolutionStatus: 'linked' })]);

  assert.ok(funna.length > 0, 'dagvyn gav inga slots alls');
  const slot = funna[0];

  assert.equal(slot.patientId, 'pat-123');
  assert.equal(slot.patientIdResolutionStatus, 'linked');
  // Utan namnet gar det inte att visa nagot vettigt bredvid id:t.
  assert.equal(slot.patientName, 'Anna Andersson');
});

test('olankad bokning bar statusen sa att skalet gar att visa', () => {
  // 9 377 bokningar saknar identitet helt, 367 ar tvetydiga. Det forsta ar en
  // atervandsgrand, det andra nagot en manniska kan reda ut — granssnittet
  // maste kunna skilja dem at.
  const funna = slots([bokning({ id: 'cl-2', patientIdResolutionStatus: 'ambiguous_identity' })]);

  const slot = funna[0];
  assert.equal(slot.patientId, '', 'olankad bokning ska ha tomt patientId');
  assert.equal(slot.patientIdResolutionStatus, 'ambiguous_identity');

  // cco-kalender-shell.js laser identityMatchStatus, inte storens fältnamn, och
  // vagrar koppla nar den ar 'ambiguous'. Utan oversattningen har den logiken
  // aldrig fatt veta nagot.
  assert.equal(slot.identityMatchStatus, 'ambiguous');
});

test('saknad identitet ar inte samma sak som tvetydig', () => {
  // 9 377 bokningar saknar identitet. De ska INTE flaggas som tvetydiga —
  // det ar tva olika problem med tva olika atgarder.
  const funna = slots([bokning({ id: 'cl-4', patientIdResolutionStatus: 'missing_identity' })]);

  const slot = funna[0];
  assert.equal(slot.patientIdResolutionStatus, 'missing_identity');
  assert.equal(slot.identityMatchStatus, '', 'saknad identitet ska inte bli ambiguous');
});

test('faltet finns pa sloten aven nar storen inte satt det', () => {
  // Regressionsskydd: falten ska alltid finnas i kontraktet, sa att en klient
  // kan lita pa deras existens i stallet for att gissa.
  const funna = slots([bokning({ id: 'cl-3' })]);
  const slot = funna[0];

  assert.ok('patientId' in slot, 'patientId saknas helt i slotens form');
  assert.ok('patientIdResolutionStatus' in slot);
  assert.equal(slot.patientId, '');
});
