'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

/**
 * ORD-183 — telefonnumret och det uteblivna besöket.
 *
 * MÄTT I CLIENTO 2026-09-03, 39 685 riktiga bokningar:
 *
 *   telefonnummer   28 450 (72 %)   28 118 på +46, 332 annan landskod,
 *                                   noll i nationellt format
 *   completed       34 588
 *   cancelled        3 188
 *   no_show          1 413
 *   upcoming           496
 *
 * Motorns bokningspost hade inget telefonfält alls och kände bara två
 * statusar. En klinik med 26 besök om dagen kan inte gå live utan påminnelser,
 * och en påminnelse behöver ett nummer. 1 413 uteblivna besök gick inte att
 * uttrycka över huvud taget.
 */

async function medMotor(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord183-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    await run(store);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function bokaTid(store, extra = {}) {
  const { fromDate, toDate } = bookingMondayWindow();
  const tider = await store.listAvailability({
    tenantId: 'tenant-a',
    fromDate,
    toDate,
    resIds: 'egzona',
    srvIds: 'consultation-physical',
  });
  assert.ok(tider.length >= 1, 'behöver en ledig tid');
  const bas = {
    tenantId: 'tenant-a',
    workspaceId: 'major-arcana-preview',
    conversationId: extra.conversationId || 'conv-183',
    customerEmail: extra.customerEmail || 'kund@example.com',
    customerName: 'Test Kund',
  };
  await store.reserveSlots({ ...bas, selectedSlots: [tider[0]] });
  return store.confirmBooking({ ...bas, ...extra, slot: tider[0] });
}

/* ---------- telefon ---------- */

test('ett E.164-nummer sparas på bokningen', async () => {
  await medMotor(async (store) => {
    const b = await bokaTid(store, { customerPhone: '+46701234567' });
    assert.equal(b.customerPhone, '+46701234567');
  });
});

test('svenska skrivsätt normaliseras till E.164', async () => {
  // Cliento levererar redan E.164, men formulär och personal skriver på ett
  // dussin sätt. Utan normalisering blir samma person tre olika nummer.
  await medMotor(async (store) => {
    const fall = [
      ['070-123 45 67', '+46701234567'],
      ['0701234567', '+46701234567'],
      ['46701234567', '+46701234567'],
      ['+46 70 123 45 67', '+46701234567'],
    ];
    let i = 0;
    for (const [in_, ut] of fall) {
      const b = await bokaTid(store, {
        customerPhone: in_,
        conversationId: `conv-tel-${i}`,
        customerEmail: `tel${i}@example.com`,
      });
      assert.equal(b.customerPhone, ut, `${in_} ska bli ${ut}`);
      i += 1;
    }
  });
});

test('ett nummer som inte går att tolka blir TOMT, inte gissat', async () => {
  // Kärnan. Ett halvt tolkat nummer ser ut som en kontaktväg och är det inte.
  // Fem siffror utan landskod kan vara svenskt, utländskt eller ett
  // internnummer — att anta +46 skickar påminnelsen till någon annan.
  // Bättre att påminnelsen uteblir synligt än att den går fel.
  await medMotor(async (store) => {
    const skrap = ['12345', 'ring mig', '', '999', '+1'];
    let i = 0;
    for (const s of skrap) {
      const b = await bokaTid(store, {
        customerPhone: s,
        conversationId: `conv-skrap-${i}`,
        customerEmail: `skrap${i}@example.com`,
      });
      assert.equal(b.customerPhone, '', `"${s}" ska ge tomt, inte ett påhittat nummer`);
      i += 1;
    }
  });
});

test('ett utländskt nummer behålls som det är', async () => {
  // 332 av Clientos nummer har annan landskod än +46. De ska inte tvingas om.
  await medMotor(async (store) => {
    const b = await bokaTid(store, { customerPhone: '+4917612345678' });
    assert.equal(b.customerPhone, '+4917612345678');
  });
});

/* ---------- uteblivet besök ---------- */

test('ett uteblivet besök går att märka', async () => {
  await medMotor(async (store) => {
    const b = await bokaTid(store);
    const { booking, changed } = await store.markBookingOutcome({
      bookingId: b.bookingId,
      status: 'no_show',
      now: new Date(Date.parse(b.slot.startsAt) + 3600000).toISOString(),
      actor: { userId: 'staff-1' },
    });
    assert.equal(changed, true);
    assert.equal(booking.status, 'no_show');
    assert.ok(booking.outcomeAt, 'när det märktes ska sparas');
    assert.equal(booking.outcomeBy, 'staff-1', 'och av vem');
  });
});

test('ett besök som inte ägt rum kan inte märkas', async () => {
  // Annars kan en framtida tid råka markeras som klar och därmed försvinna ur
  // påminnelserna.
  await medMotor(async (store) => {
    const b = await bokaTid(store);
    await assert.rejects(
      () => store.markBookingOutcome({ bookingId: b.bookingId, status: 'completed' }),
      /har inte ägt rum ännu/
    );
  });
});

test('en avbokning får inte skrivas om till ett uteblivet besök', async () => {
  // De är olika händelser med olika ekonomi och olika uppföljning. Kunden
  // meddelade i tid; att i efterhand kalla det uteblivet ändrar båda.
  await medMotor(async (store) => {
    const b = await bokaTid(store);
    await store.cancelBooking({
      tenantId: 'tenant-a',
      conversationId: 'conv-183',
      customerEmail: 'kund@example.com',
      reason: 'Kunden avbokade',
    });
    await assert.rejects(
      () =>
        store.markBookingOutcome({
          bookingId: b.bookingId,
          status: 'no_show',
          now: new Date(Date.parse(b.slot.startsAt) + 3600000).toISOString(),
        }),
      /avbokad tid kan inte märkas/
    );
  });
});

test('bara completed och no_show accepteras som utfall', async () => {
  await medMotor(async (store) => {
    const b = await bokaTid(store);
    for (const status of ['cancelled', 'confirmed', 'hittepå']) {
      await assert.rejects(
        () => store.markBookingOutcome({ bookingId: b.bookingId, status }),
        /completed.*no_show/
      );
    }
  });
});

test('en okänd status faller till confirmed, inte till något tyst', async () => {
  await medMotor(async (store) => {
    assert.deepEqual(store.BOKNINGSSTATUS, ['confirmed', 'completed', 'cancelled', 'no_show']);
  });
});

/* ---------- kollisionen ---------- */

test('ett uteblivet besök frigör INTE sin tid', async () => {
  // Den farliga följden av att lägga till statusar. isSlotTaken räknade bara
  // `confirmed` som upptaget — ett genomfört eller uteblivet besök hade alltså
  // öppnat sin egen tid för dubbelbokning.
  //
  // Rätt regel är den omvända: en avbokning är det ENDA som ger tillbaka
  // tiden. Klockan gick, personalen väntade.
  await medMotor(async (store) => {
    const b = await bokaTid(store);
    await store.markBookingOutcome({
      bookingId: b.bookingId,
      status: 'no_show',
      now: new Date(Date.parse(b.slot.startsAt) + 3600000).toISOString(),
    });

    const { fromDate, toDate } = bookingMondayWindow();
    const kvar = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(
      !kvar.some((s) => s.slotId === b.slot.slotId),
      'tiden ska förbli upptagen efter ett uteblivet besök'
    );
  });
});

test('en avbokning frigör tiden, som förut', async () => {
  // Motprovet. Ändringen ovan får inte göra avbokning verkningslös.
  await medMotor(async (store) => {
    const b = await bokaTid(store);
    await store.cancelBooking({
      tenantId: 'tenant-a',
      conversationId: 'conv-183',
      customerEmail: 'kund@example.com',
      reason: 'Kunden avbokade',
    });
    const { fromDate, toDate } = bookingMondayWindow();
    const kvar = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(
      kvar.some((s) => s.slotId === b.slot.slotId),
      'avbokad tid ska bli ledig igen'
    );
  });
});
