'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { nextBookableWeekday } = require('../helpers/bookingTestDates');

/**
 * ORD-241 — en ledig tid får visas EN gång.
 *
 * HUR FELET HITTADES, för att nästa läsare ska veta vad som är värt att lita
 * på: ett orelaterat test blev rött en söndagmorgon utan att en rad kod hade
 * ändrats. Det väntade en tid och fick åtta. Två hypoteser föll på mätning —
 * cykelveckorna räknade rätt, och veckodagsfiltret läckte inte. Kvar blev det
 * som faktiskt var fel: två av de åtta posterna hade IDENTISK slotId.
 *
 * slotId är deterministisk — resurs + tjänst + starttid. Två regler som täcker
 * samma resurs, tjänst och klockslag byggde alltså två poster med samma nyckel,
 * och listAvailability returnerade båda.
 *
 * Det är inte ett konstruerat fall. Det är vad kliniken får när personalen
 * lägger en extratid ovanpå ett befintligt schema — och personalen kan skapa
 * regler sedan ORD-181. Konsekvensen är att samma tid syns två gånger för
 * personal och kund, och att kod som slår upp på slotId får ett godtyckligt av
 * två exemplar.
 */

const TJANST = {
  id: 'consultation-physical',
  label: 'Konsultation',
  durationMinutes: 45,
  active: true,
};

async function butikMed(regler, resursId = 'dubbeltest') {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ord241-'));
  const filePath = path.join(tempDir, 'booking-engine.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      resources: [{ id: resursId, label: 'Dubbeltest', active: true, publicBookable: false }],
      services: [TJANST],
      availabilityRules: regler,
      reservations: [],
      bookings: [],
    }),
    'utf8'
  );
  const store = await createCcoBookingEngineStore({ filePath });
  return { store, tempDir, resursId };
}

function regel(ruleId, resursId, extra = {}) {
  return {
    ruleId,
    resourceId: resursId,
    serviceId: 'consultation-physical',
    weekdays: [1],
    startTimes: ['10:00'],
    locationLabel: 'Hair TP Clinic',
    managedBy: 'staff',
    ...extra,
  };
}

test('T-001: två regler som ger samma tid ger EN post, inte två', async () => {
  const mandag = nextBookableWeekday(1);
  const { store, tempDir, resursId } = await butikMed([
    regel('schema', 'dubbeltest'),
    regel('extratid-ovanpa-schemat', 'dubbeltest'),
  ]);
  try {
    const tider = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate: mandag,
      toDate: mandag,
      resIds: resursId,
      srvIds: 'consultation-physical',
    });
    assert.equal(tider.length, 1, `två regler gav ${tider.length} poster för samma klockslag`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('T-002: invarianten uttrycks som unika slotId, inte som ett antal', async () => {
  // Ett antal stämmer bara för just den här fixturen. Att ALLA slotId är unika
  // är sant oavsett hur många regler någon lägger till senare, och det är den
  // formen felet bör fångas i.
  const mandag = nextBookableWeekday(1);
  const { store, tempDir, resursId } = await butikMed([
    regel('a', 'dubbeltest'),
    regel('b', 'dubbeltest'),
    regel('c', 'dubbeltest', { startTimes: ['10:00', '11:00'] }),
    regel('d', 'dubbeltest', { startTimes: ['11:00', '13:00'] }),
  ]);
  try {
    const tider = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate: mandag,
      toDate: mandag,
      resIds: resursId,
      srvIds: 'consultation-physical',
    });
    const ids = tider.map((t) => t.slotId);
    const dubbletter = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dubbletter, [], `${dubbletter.length} dubblett(er): ${dubbletter.join(', ')}`);
    // Fyra regler, tre distinkta klockslag (10:00, 11:00, 13:00).
    assert.equal(tider.length, 3, `väntade tre distinkta tider, fick ${tider.length}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('T-003: MOTPROV — dedupen slår inte ihop olika tider', async () => {
  // Det enkla sättet att göra T-001 grön är att returnera för lite. Det här
  // testet är det som gör den lösningen omöjlig.
  const mandag = nextBookableWeekday(1);
  // Klockslagen är valda efter mätning, inte på känsla. Första försöket använde
  // 10:00, 10:45 och 11:30 och fick två tider — 11:30 ligger i klinikens
  // lunchblock enligt öppettidskonfigen från ORD-189, så motorn filtrerade bort
  // den. Ett motprov som blir rött av rätt beteende är ett dåligt motprov.
  const { store, tempDir, resursId } = await butikMed([
    regel('morgon', 'dubbeltest', { startTimes: ['10:00', '13:00', '14:30'] }),
  ]);
  try {
    const tider = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate: mandag,
      toDate: mandag,
      resIds: resursId,
      srvIds: 'consultation-physical',
    });
    assert.equal(tider.length, 3, 'tre olika klockslag ska ge tre tider');
    assert.equal(new Set(tider.map((t) => t.startsAt)).size, 3);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('T-004: MOTPROV — dedupen slår inte ihop två resurser', async () => {
  // slotId innehåller resursen. Två behandlare som båda är lediga 10:00 ska ge
  // två tider — den som slår ihop dem har halverat klinikens kapacitet.
  const mandag = nextBookableWeekday(1);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ord241-tva-'));
  const filePath = path.join(tempDir, 'booking-engine.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      resources: [
        { id: 'behandlare-ett', label: 'Ett', active: true, publicBookable: false },
        { id: 'behandlare-tva', label: 'Två', active: true, publicBookable: false },
      ],
      services: [TJANST],
      availabilityRules: [regel('r1', 'behandlare-ett'), regel('r2', 'behandlare-tva')],
      reservations: [],
      bookings: [],
    }),
    'utf8'
  );
  try {
    const store = await createCcoBookingEngineStore({ filePath });
    const tider = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate: mandag,
      toDate: mandag,
      resIds: 'behandlare-ett,behandlare-tva',
      srvIds: 'consultation-physical',
    });
    assert.equal(tider.length, 2, 'två behandlare lediga samma tid ska ge två tider');
    assert.equal(new Set(tider.map((t) => t.resourceId)).size, 2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('T-005: dedupen sker i motorn, inte hos anroparna', async () => {
  // Fem vyer som var för sig kommer ihåg att filtrera är samma duplikationsfel
  // en nivå upp; en av dem kommer att glömma. Testet mäter att lösningen sitter
  // i listAvailability och inte är utspridd.
  const kalla = await fs.readFile(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoBookingEngineStore.js'),
    'utf8'
  );
  const i = kalla.indexOf('async function listAvailability');
  assert.notEqual(i, -1, 'listAvailability saknas');
  const kropp = kalla.slice(i, kalla.indexOf('\n  async function listCalendarBlocks', i));
  assert.match(kropp, /new Map\(\)/, 'ingen nyckelbaserad uppsamling i listAvailability');
  assert.match(kropp, /\.has\(slot\.slotId\)/, 'dedupen sker inte på slotId');
});
