'use strict';

/**
 * Graftantalet per zon ska nå hela vägen från konsultationspanelen till
 * offerten.
 *
 * Bakgrund 2026-08-25. Panelen "Behandlingsplan på bild"
 * (public/major-arcana-preview/app/journal-plan-editor.js) hade zonerna som en
 * kommaseparerad textarea och sparade dem som strängar:
 *
 *     zones: ['Hårlinje', 'Mitt', 'Krona']
 *
 * `buildOfferPlanData` läser `zones[].grafts`. En sträng har ingen `.grafts`,
 * så antalet blev alltid tomt — och eftersom kundportalen har egna hårdkodade
 * värden (800 / 1200 / 500 i cco-patient-offer-portal-v3.html) syntes felet
 * aldrig som en lucka. Det syntes som fel siffror.
 *
 * Panelen sparar nu objekt. Testet håller ihop de två ändarna: ändras formen i
 * panelen utan att offerten följer med, ska det här gå sönder.
 *
 * Etiketterna måste också hålla ihop med ZONE_META i ccoOfferEsign.js, som
 * matchar på label i gemener.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOfferPlanData } = require('../../src/ops/ccoOfferFromPlan');

// Exakt det panelens readPlanSummary() producerar efter ändringen.
const FRAN_PANELEN = {
  method: 'FUE',
  graftsTotal: '',
  zones: [
    { label: 'Hårlinje', grafts: '1400' },
    { label: 'Mitt', grafts: '900' },
    { label: 'Krona', grafts: '500' },
  ],
  notes: 'Tät hårlinje fram.',
};

function plan(fields) {
  return buildOfferPlanData({ fields }, {});
}

test('varje zon får sitt eget graftantal', () => {
  const { zones } = plan(FRAN_PANELEN).grafts;

  assert.equal(zones.length, 3);
  assert.deepEqual(
    zones.map((zone) => [zone.label, zone.grafts]),
    [
      ['Hårlinje', '1400'],
      ['Mitt', '900'],
      ['Krona', '500'],
    ]
  );
});

test('totalen summeras från zonerna när fältet lämnats tomt', () => {
  assert.equal(plan(FRAN_PANELEN).grafts.total, '2800');
});

test('en ifylld total vinner över summan — personalen får överstyra', () => {
  assert.equal(plan({ ...FRAN_PANELEN, graftsTotal: '3000' }).grafts.total, '3000');
});

test('etiketterna matchar ZONE_META, annars tappar offerten siffran', () => {
  // ccoOfferEsign slår upp ZONE_META[label.toLowerCase()].
  const kända = ['hårlinje', 'mitt', 'krona', 'vertex', 'tempel'];
  for (const zone of plan(FRAN_PANELEN).grafts.zones) {
    assert.ok(
      kända.includes(zone.label.toLowerCase()),
      `zonen "${zone.label}" finns inte i ZONE_META — offerten visar då ingen siffra`
    );
  }
});

test('gamla planer med zoner som strängar kraschar inte', () => {
  // Före ändringen sparades zonerna så här. De ska fortfarande ge etiketter.
  const { zones } = plan({ ...FRAN_PANELEN, zones: ['Hårlinje', 'Krona'] }).grafts;

  assert.equal(zones.length, 2);
  assert.equal(zones[0].label, 'Hårlinje');
  assert.equal(zones[0].grafts, '', 'antal saknas i gamla planer — det är väntat');
});

test('en zon utan siffra räknas inte in i totalen', () => {
  const d = plan({
    ...FRAN_PANELEN,
    zones: [
      { label: 'Hårlinje', grafts: '1400' },
      { label: 'Krona', grafts: '' },
    ],
  });

  assert.equal(d.grafts.total, '1400');
  assert.equal(d.grafts.zones.length, 2, 'zonen ska ändå synas i planen');
});

test('inga zoner alls ger tom total, inte NaN eller "0"', () => {
  assert.equal(plan({ ...FRAN_PANELEN, zones: [] }).grafts.total, '');
});
