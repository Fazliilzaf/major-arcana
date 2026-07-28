'use strict';

/**
 * ORD-86 — den tredje sortens `.se`, som varken är länk eller domänigenkänning.
 *
 * `buildIcalFeed` sätter UID till `booking-<id>@arcana.hairtpclinic.se`.
 * Det SER ut som en adress men är en namnrymd i en identifierare. Den behöver
 * inte peka på något som svarar, och den får inte ändras.
 *
 * Kalenderklienter matchar uppdateringar mot UID. Byts domändelen ser
 * Outlook och Google en HELT NY händelse i stället för en uppdatering av en
 * befintlig — och personalen får dubbletter för varje bokning som redan
 * skickats ut. Skadan är tyst: inget felmeddelande, bara två poster där det
 * ska stå en.
 *
 * En sweep som byter alla `.se` till `.com` skulle träffa raden. Det här testet
 * är det enda som håller emot, så det ska vara omöjligt att missförstå varför
 * det finns.
 *
 * Skulle UID:n någon gång MÅSTE ändras är det en migrering med ett
 * REPLACES-fält eller en medveten avbokning + ombokning — inte en söka-ersätta.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildIcalFeed } = require('../../src/ops/icalExport');

const BOKNINGAR = [
  {
    bookingId: 'bk-1001',
    startsAt: '2026-08-03T09:00:00.000Z',
    durationMinutes: 90,
    serviceLabel: 'FUE',
    customerName: 'Anna Andersson',
    status: 'confirmed',
  },
];

test('UID behåller legacy-namnrymden — den är stabil, inte en adress', () => {
  const feed = buildIcalFeed({ resourceLabel: 'Rum 1', bookings: BOKNINGAR });
  assert.match(
    feed,
    /UID:booking-bk-1001@arcana\.hairtpclinic\.se/,
    'UID:ns domändel får inte bytas — kalenderklienter skulle se en ny händelse'
  );
  assert.doesNotMatch(
    feed,
    /UID:booking-bk-1001@arcana\.hairtpclinic\.com/,
    'byts den här har någon kört en .se→.com-sweep över identifierare'
  );
});

test('samma bokning ger samma UID vid upprepade export', () => {
  // Stabiliteten är hela poängen. Är UID:n inte deterministisk spelar
  // domändelen ingen roll — då är den trasig ändå.
  const a = buildIcalFeed({ resourceLabel: 'Rum 1', bookings: BOKNINGAR });
  const b = buildIcalFeed({ resourceLabel: 'Rum 2', bookings: BOKNINGAR });
  const uid = (feed) => feed.match(/UID:([^\r\n]+)/)[1];
  assert.equal(uid(a), uid(b), 'UID får inte bero på resurs eller exporttillfälle');
});

test('VAKT: kommentaren som förklarar varför står kvar', () => {
  // Utan förklaringen ser raden ut som en bortglömd fallback, och nästa
  // person "rättar" den i god tro. Kommentaren ÄR skyddet; testet skyddar
  // kommentaren.
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'icalExport.js'),
    'utf8'
  );
  assert.match(src, /RÖR INTE \.se HÄR/, 'varningen ska stå kvar i koden');
  assert.ok(
    /dubblett|dubbletter/i.test(src),
    'konsekvensen — dubbletter i personalens kalendrar — ska stå utskriven'
  );
});
