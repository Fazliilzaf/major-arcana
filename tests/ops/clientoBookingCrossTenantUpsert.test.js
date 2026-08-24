'use strict';

/**
 * En import får inte skapa en ny kopia av en bokning som redan finns under den
 * andra tenant-stavningen.
 *
 * Kliniken har två namnrymder i storen: `hair_tp` (legacy) och
 * `hair-tp-clinic` (kanonisk). `bookingIdIndex` nycklas
 * `${tenantId}::${bookingId}`, så en import som kör som `hair-tp-clinic`
 * missade den befintliga raden under `hair_tp` och la till en ny.
 *
 * Det var inte teoretiskt. ORD-101 städade bort cross-tenant-dubbletterna
 * 2026-08-13. Omimporten 2026-08-24 la till 10 731 rader och återskapade
 * 24 842 av dem. Effekten blev synlig i kalendern: dedupen behöll den äldsta
 * kopian, så 9 219 reservationer visades som bokningar — och att köra om
 * importen ändrade ingenting, eftersom varje körning bara la till ännu en
 * kopia i fel namnrymd.
 *
 * Ordningen spelar roll om det här någonsin ska städas: fixa importen FÖRST,
 * annars återskapar nästa körning det man just slagit ihop.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createClientoBookingStore } = require('../../src/ops/clientoBookingStore');

const BOKNING = {
  bookingId: '20657575',
  serviceLabel: '',
  staffName: 'Egzona',
  startsAt: '2025-06-19T10:00:00.000Z',
  endsAt: '2025-06-19T10:30:00.000Z',
  customerName: '',
  customerEmail: '',
  status: 'completed',
  source: 'cliento_csv',
};

/**
 * Varje test kör de två importerna i SKILDA processinstanser av storen, med en
 * omstart emellan. Det är så det ser ut i verkligheten: den gamla raden skrevs
 * vid en tidigare körning, servern har startat om sedan dess, och
 * `bookingIdIndex` byggs då om från `state.bookings` — där varje rad bara
 * indexeras under sin egen hinks tenant.
 *
 * Gör man båda importerna i samma process döljs felet, eftersom skrivningen
 * lägger in nyckeln under båda stavningarna i minnet. Det var precis så en
 * första version av det här testet blev grön mot trasig kod.
 */
function tempfil(namn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbs-'));
  return path.join(dir, `${namn}.json`);
}

async function importera(filePath, tenantId, booking) {
  const store = await createClientoBookingStore({ filePath });
  await store.upsertBooking({ tenantId, booking });
  await store.flush();
}

async function läs(filePath, tenantId) {
  const store = await createClientoBookingStore({ filePath });
  return store.listAllBookings({ tenantId });
}

test('import som hair-tp-clinic uppdaterar raden som ligger under hair_tp', async () => {
  const f = tempfil('a');
  await importera(f, 'hair_tp', { ...BOKNING });
  await importera(f, 'hair-tp-clinic', { ...BOKNING, isReservation: true });

  const rader = await läs(f, 'hair-tp-clinic');
  assert.equal(rader.length, 1, 'en ny kopia hade blivit en cross-tenant-dubblett');
  assert.equal(rader[0].isReservation, true, 'den befintliga raden ska ha uppdaterats');
});

test('och åt andra hållet — hair_tp uppdaterar raden under hair-tp-clinic', async () => {
  const f = tempfil('b');
  await importera(f, 'hair-tp-clinic', { ...BOKNING });
  await importera(f, 'hair_tp', { ...BOKNING, isReservation: true });

  const rader = await läs(f, 'hair-tp-clinic');
  assert.equal(rader.length, 1);
  assert.equal(rader[0].isReservation, true);
});

test('upprepade importer med omstart emellan skapar inte fler kopior', async () => {
  const f = tempfil('c');
  for (let i = 0; i < 5; i++) {
    await importera(f, i % 2 ? 'hair_tp' : 'hair-tp-clinic', {
      ...BOKNING,
      isReservation: true,
    });
  }
  assert.equal((await läs(f, 'hair-tp-clinic')).length, 1, 'fem körningar ska ge en rad, inte fem');
});

test('olika bokningar slås inte ihop', async () => {
  const f = tempfil('d');
  await importera(f, 'hair_tp', { ...BOKNING });
  await importera(f, 'hair-tp-clinic', { ...BOKNING, bookingId: '20657576' });

  assert.equal((await läs(f, 'hair-tp-clinic')).length, 2, 'dedupen får inte bli girig');
});

test('en annan klinik påverkas inte', async () => {
  const f = tempfil('e');
  await importera(f, 'hair_tp', { ...BOKNING });
  await importera(f, 'curatiio', { ...BOKNING, isReservation: true });

  assert.equal(
    (await läs(f, 'curatiio')).length,
    1,
    'curatiio är inte en stavningsvariant av hair_tp — den ska få sin egen rad'
  );
  assert.equal((await läs(f, 'hair-tp-clinic')).length, 1);
});
