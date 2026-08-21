'use strict';

/**
 * Schemat skrivs i klinikens väggklocka. Motorn räknade i UTC.
 *
 * `buildAvailabilitySlot` byggde tidpunkten som `${datum}T${tid}:00.000Z`.
 * Ett `Z` betyder UTC, så en regel som sa `10:00` gav en tid som kalendern
 * visade som **12:00** på sommaren och 11:00 på vintern. Samma fel i
 * `buildBlockInterval` gjorde att lunchblocket 12:00–13:00 låg på 14:00–15:00
 * och alltså inte täckte lunchen.
 *
 * Testerna nedan går två vägar: översättningen i sig, och att motorn faktiskt
 * använder den. Bara det första hade gått grönt även om ingen kopplat in den.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { klinikTidTillUtc, utcTillKlinikTid } = require('../../src/ops/klinikTid');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');

test('10:00 i schemat är 10:00 i Stockholm — sommar som vinter', () => {
  // Sommartid: Stockholm ligger 2 timmar före UTC.
  const sommar = klinikTidTillUtc('2026-07-15', '10:00');
  assert.equal(sommar, '2026-07-15T08:00:00.000Z');
  assert.deepEqual(utcTillKlinikTid(sommar), { datum: '2026-07-15', klockslag: '10:00' });

  // Normaltid: 1 timme före.
  const vinter = klinikTidTillUtc('2026-01-15', '10:00');
  assert.equal(vinter, '2026-01-15T09:00:00.000Z');
  assert.deepEqual(utcTillKlinikTid(vinter), { datum: '2026-01-15', klockslag: '10:00' });
});

test('tiden flyttar sig inte när sommartiden slår om', () => {
  // Det var det som gjorde felet lömskt: samma regel betydde olika klockslag
  // i juli och januari, utan att någon ändrat något.
  for (const datum of [
    '2026-03-28',
    '2026-03-29',
    '2026-03-30',
    '2026-10-24',
    '2026-10-25',
    '2026-10-26',
  ]) {
    const iso = klinikTidTillUtc(datum, '10:00');
    assert.deepEqual(
      utcTillKlinikTid(iso),
      { datum, klockslag: '10:00' },
      datum + ' läses inte tillbaka som 10:00'
    );
  }
});

test('ogiltig indata ger null, inte Invalid Date', () => {
  // Ett Invalid Date fortplantar sig tyst genom slot-byggandet och dyker upp
  // som en tom kalender långt senare.
  assert.equal(klinikTidTillUtc('inte-ett-datum', '10:00'), null);
  assert.equal(klinikTidTillUtc('2026-07-15', '25:99'), null);
  assert.equal(klinikTidTillUtc('2026-07-15', ''), null);
  assert.equal(klinikTidTillUtc(null, null), null);
  assert.equal(utcTillKlinikTid('inte-en-tid'), null);
});

async function medStore(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-kliniktid-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(dir, 'booking-engine.json'),
    });
    return await fn(store);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const datum = (dagarFram) => new Date(Date.now() + dagarFram * 86400000).toISOString().slice(0, 10);

test('varje erbjuden tid matchar sin regels klockslag', async () => {
  await medStore(async (store) => {
    const regler = store._state?.availabilityRules;
    assert.ok(Array.isArray(regler) && regler.length, 'kom inte åt reglerna — testet mäter inget');

    const slots = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: datum(1),
      toDate: datum(21),
    });
    assert.ok(slots.length > 50, 'för få tider (' + slots.length + ') för att säga något');

    for (const slot of slots) {
      const { datum: dag, klockslag } = utcTillKlinikTid(slot.startsAt);
      const veckodag = new Date(dag + 'T00:00:00Z').getUTCDay();
      // Samma resurs och tjänst kan ha flera regler — vardag, kväll och helg
      // ligger var för sig. Tiden ska finnas i någon av dem som gäller den
      // veckodagen, inte i den första som råkar matcha.
      const giltiga = regler.filter(
        (r) =>
          r.resourceId === slot.resourceId &&
          r.serviceId === slot.serviceId &&
          (r.weekdays || []).includes(veckodag)
      );
      if (!giltiga.length) continue;
      const tillatna = new Set(giltiga.flatMap((r) => r.startTimes || []));
      assert.ok(
        tillatna.has(klockslag),
        `${slot.resourceId}/${slot.serviceId} erbjuds ${dag} ${klockslag} svensk tid, ` +
          `men reglerna för den dagen säger ${[...tillatna].sort().join(', ')} ` +
          `— motorn räknar i fel tidszon`
      );
    }
  });
});

test('lunchblocket täcker lunchen', async () => {
  await medStore(async (store) => {
    const block = (store._state?.calendarBlocks || []).find((b) => b.blockType === 'lunch');
    assert.ok(block, 'inget lunchblock att pröva mot');

    const slots = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: datum(1),
      toDate: datum(21),
    });

    for (const slot of slots) {
      const t = utcTillKlinikTid(slot.startsAt);
      const veckodag = new Date(t.datum + 'T00:00:00Z').getUTCDay();
      if (!(block.weekdays || []).includes(veckodag)) continue;
      assert.ok(
        t.klockslag < block.startTime || t.klockslag >= block.endTime,
        `${slot.resourceId} erbjuds ${t.datum} ${t.klockslag} — mitt i lunchen ` +
          `${block.startTime}–${block.endTime}`
      );
    }
  });
});
