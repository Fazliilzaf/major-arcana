'use strict';

/**
 * Kalendern får inte materialisera hela bokningslagret för att visa en dag.
 *
 * Incidenten 2026-08-24: efter Cliento-omimporten växte storen från 53 316 till
 * 64 047 rader. Veckovyn tog då 6,2 sekunder synkront arbete — dels för att
 * varje rad kopierades ur storen, dels för att buildDayView körde
 * clinicDateTimeParts per post OCH per dag (7 × 64 047 = 448 329
 * Intl.DateTimeFormat-anrop). Node är enkeltrådat, så /healthz svarade inte
 * heller under tiden. Render har fem sekunders health check timeout och
 * startade om instansen. Varje kalenderanrop dödade servern:
 *
 *     Instance failed: gm7d2
 *     HTTP health check failed (timed out after 5 seconds) while running your code.
 *
 * Två saker låser testerna nedan:
 *   1. fönstret skickas ner till storen, så raderna aldrig materialiseras
 *   2. fönstret ändrar INTE vilka poster som syns — särskilt inte kring midnatt
 *
 * Punkt 2 är den som gör punkt 1 ofarlig. Storen jämför på ISO-strängens
 * UTC-datum medan kalendern räknar i Europe/Stockholm, så en bokning 00:30
 * svensk tid ligger på föregående UTC-datum. Fönstret vidgas därför en dag åt
 * varje håll.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDayView, buildWeekView } = require('../../src/ops/clinicCalendarView');

function rad(iso, i) {
  return {
    bookingId: 'b' + i,
    serviceLabel: 'PRP TP',
    staffName: 'Egzona',
    startsAt: iso,
    endsAt: new Date(new Date(iso).getTime() + 27e5).toISOString(),
    customerName: 'Kund ' + i,
    customerEmail: `k${i}@exempel.se`,
    status: 'completed',
  };
}

/** Store som filtrerar på UTC-datumsträngen, precis som clientoBookingStore. */
function store(rows) {
  const anrop = [];
  return {
    anrop,
    listAllBookings({ fromDate = '', toDate = '' } = {}) {
      anrop.push({ fromDate, toDate });
      if (!fromDate && !toDate) return rows;
      return rows.filter((r) => {
        const d = String(r.startsAt).slice(0, 10);
        return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
      });
    },
  };
}

const VY = { tenantId: '', brand: 'hair-tp-clinic' };

test('dagsvyn ber storen om ett fönster, inte om allt', () => {
  const s = store([rad('2026-08-24T06:00:00.000Z', 0)]);
  buildDayView({ date: '2026-08-24', clientoBookingStore: s, ...VY });

  assert.equal(s.anrop.length, 1);
  const { fromDate, toDate } = s.anrop[0];
  assert.ok(fromDate, 'fromDate måste skickas — annars hämtas hela storen');
  assert.ok(toDate, 'toDate måste skickas');
  // En dags marginal åt varje håll, för tidszonsskillnaden mot UTC.
  assert.equal(fromDate, '2026-08-23');
  assert.equal(toDate, '2026-08-25');
});

test('veckovyn hämtar en gång för hela veckan, inte en gång per dag', () => {
  const s = store([rad('2026-08-24T06:00:00.000Z', 0)]);
  buildWeekView({ startDate: '2026-08-24', clientoBookingStore: s, ...VY });

  assert.equal(s.anrop.length, 1, 'sju anrop skulle vara sju gånger arbetet');
  assert.equal(s.anrop[0].fromDate, '2026-08-23');
  assert.equal(s.anrop[0].toDate, '2026-08-31');
});

test('fönstret tappar inga poster kring midnatt', () => {
  // Sommartid: svensk tid = UTC+2.
  const rows = [
    rad('2026-08-23T21:30:00.000Z', 0), // 23:30 sv 23 aug — inte vår dag
    rad('2026-08-23T22:30:00.000Z', 1), // 00:30 sv 24 aug — UTC-datum 23, ska MED
    rad('2026-08-24T06:00:00.000Z', 2), // 08:00 sv 24 aug
    rad('2026-08-24T18:00:00.000Z', 3), // 20:00 sv 24 aug
    rad('2026-08-24T21:30:00.000Z', 4), // 23:30 sv 24 aug
    rad('2026-08-24T22:30:00.000Z', 5), // 00:30 sv 25 aug — UTC-datum 24, ska EJ med
  ];
  const medFönster = buildDayView({ date: '2026-08-24', clientoBookingStore: store(rows), ...VY });
  const utanFönster = buildDayView({
    date: '2026-08-24',
    clientoBookingStore: { listAllBookings: () => rows },
    ...VY,
  });

  assert.equal(
    medFönster.totalSlots,
    utanFönster.totalSlots,
    'fönstret får inte ändra vad som syns'
  );
  assert.equal(medFönster.totalSlots, 4, '00:30 sv 24 aug med, 00:30 sv 25 aug utan');
});

test('veckovyn ger samma poster med och utan fönster', () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    rows.push(rad(new Date(Date.UTC(2026, 7, 20 + (i % 14), 6 + (i % 10), 0)).toISOString(), i));
  }
  const med = buildWeekView({ startDate: '2026-08-24', clientoBookingStore: store(rows), ...VY });
  const utan = buildWeekView({
    startDate: '2026-08-24',
    clientoBookingStore: { listAllBookings: () => rows },
    ...VY,
  });

  assert.equal(med.totalSlots, utan.totalSlots);
  assert.deepEqual(
    med.days.map((d) => [d.date, d.totalSlots]),
    utan.days.map((d) => [d.date, d.totalSlots])
  );
});

test('localDate räknas ut en gång per post, inte en gång per dag', () => {
  const { collectCalendarEntries } = require('../../src/ops/clinicCalendarView');
  const data = collectCalendarEntries({
    clientoBookingStore: { listAllBookings: () => [rad('2026-08-24T06:00:00.000Z', 0)] },
    ...VY,
  });

  assert.equal(data.entries.length, 1);
  assert.equal(
    data.entries[0].localDate,
    '2026-08-24',
    'utan localDate faller buildDayView tillbaka på Intl per post och per dag'
  );
});

test('utan fönster hämtas allt — äldre anropare bryts inte', () => {
  const rows = [rad('2020-01-01T06:00:00.000Z', 0), rad('2026-08-24T06:00:00.000Z', 1)];
  const s = store(rows);
  const { collectCalendarEntries } = require('../../src/ops/clinicCalendarView');
  const data = collectCalendarEntries({ clientoBookingStore: s, ...VY });

  assert.equal(s.anrop[0].fromDate, '', 'inget fönster begärt');
  assert.equal(data.entries.length, 2, 'båda posterna ska komma med');
});
