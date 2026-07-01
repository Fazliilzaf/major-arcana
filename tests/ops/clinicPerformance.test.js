const test = require('node:test');
const assert = require('node:assert/strict');

const { composeClinicMetrics, periodLabel } = require('../../src/ops/clinicPerformance');

// Fast referens-nu: 15 juni 2026 (UTC) → månadsfönster juni.
const NOW = new Date(Date.UTC(2026, 5, 15));

function booking(startsAt, status = 'completed') {
  return { startsAt, status };
}

test('periodLabel ger svenskt månadsnamn + år', () => {
  assert.equal(periodLabel(new Date(Date.UTC(2026, 5, 1))), 'juni 2026');
  assert.equal(periodLabel(new Date(Date.UTC(2026, 4, 1))), 'maj 2026');
});

test('räknar bokningar denna månad och ignorerar andra månader', () => {
  const bookings = [
    booking('2026-06-02T09:00:00Z'),
    booking('2026-06-20T09:00:00Z'),
    booking('2026-05-30T09:00:00Z'), // föregående månad — exkluderas
    booking('2026-07-01T09:00:00Z'), // nästa månad — exkluderas
    { status: 'completed' }, // saknar startsAt — hoppas över
  ];
  const m = composeClinicMetrics({ bookings, now: NOW, tenantId: 't1' });
  assert.equal(m.bookings.current, 2);
  assert.equal(m.period, 'juni 2026');
  assert.equal(m.previousPeriod, 'maj 2026');
});

test('no-show-rate beräknas ur månadens bokningar', () => {
  const bookings = [
    booking('2026-06-02T09:00:00Z', 'no_show'),
    booking('2026-06-03T09:00:00Z', 'completed'),
    booking('2026-06-04T09:00:00Z', 'completed'),
    booking('2026-06-05T09:00:00Z', 'no_show'),
  ];
  const m = composeClinicMetrics({ bookings, now: NOW });
  assert.equal(m.bookings.current, 4);
  assert.equal(m.noShowRate.current, 0.5);
});

test('intäkt hämtas ur finance-dashboarden; AOV = intäkt/bokningar', () => {
  const bookings = [booking('2026-06-02T09:00:00Z'), booking('2026-06-03T09:00:00Z')];
  const financeDashboard = { invoices: { totalPaidThisMonthSek: 20000 } };
  const m = composeClinicMetrics({ bookings, financeDashboard, now: NOW });
  assert.equal(m.revenueSek.current, 20000);
  assert.equal(m.avgOrderValueSek.current, 10000); // 20000 / 2
});

test('ärlig partiell live: bel./kanal/trend fabriceras aldrig', () => {
  const m = composeClinicMetrics({ bookings: [], now: NOW });
  assert.equal(m.source, 'live');
  // Beläggning har ingen sanningskälla → null, inte gissad.
  assert.equal(m.utilizationRate.current, null);
  // Kanalfördelning utelämnas helt.
  assert.equal(m.channelSplit, undefined);
  // Ingen trend → previous null överallt.
  assert.equal(m.bookings.previous, null);
  assert.equal(m.revenueSek.previous, null);
  // Luckorna deklareras explicit.
  assert.ok(Array.isArray(m.notLiveYet) && m.notLiveYet.includes('utilizationRate'));
});

test('ingen intäkt → revenue och AOV blir null (inte 0-gissning)', () => {
  const bookings = [booking('2026-06-02T09:00:00Z')];
  const m = composeClinicMetrics({ bookings, financeDashboard: null, now: NOW });
  assert.equal(m.revenueSek.current, null);
  assert.equal(m.avgOrderValueSek.current, null);
});

test('inga bokningar → noShowRate 0, AOV null', () => {
  const m = composeClinicMetrics({ bookings: [], financeDashboard: { invoices: { totalPaidThisMonthSek: 5000 } }, now: NOW });
  assert.equal(m.bookings.current, 0);
  assert.equal(m.noShowRate.current, 0);
  assert.equal(m.avgOrderValueSek.current, null); // 0 bokningar → ingen division
});
