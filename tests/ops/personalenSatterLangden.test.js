'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const LANGDER = require('../../config/tjanstelangder.json');

/**
 * ORD-194 — personalen sätter längden, och värdet överlever.
 *
 * Ägaren 2026-09-03: "du kan alltid ha de som grund men att vi ska kunna ändra
 * det så klart."
 *
 * FÖRSÖKET ATT GÖRA DET FÖR HAND MISSLYCKADES TYST. Uppmätt i ORD-178: 222
 * minuter satt direkt i cco-booking-engine.json blev 480 igen efter omstart,
 * eftersom migreringen slår ihop standardtjänsten med den befintliga som
 * `{ ...svc, ...existing, ...svc }` — standardvärdet spritt SIST, alltså vinner
 * det. Det såg sparat ut ända fram till nästa deploy.
 *
 *   fue-scar               222   (överlevde, av en slump i ORD-177:s gren)
 *   dhi                    480   (tyst återställd)
 *   beard                  360   (tyst återställd)
 *   consultation-physical   45   (tyst återställd)
 *
 * Ordningen är nu: personalen > facit > kodens standardvärde.
 */

async function medMotor(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord194-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    const store = await createCcoBookingEngineStore({ filePath });
    await run({ store, filePath });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const langd = async (store, id) =>
  (await store.listServices()).find((s) => s.id === id)?.durationMinutes;

test('en satt längd slår igenom direkt', async () => {
  await medMotor(async ({ store }) => {
    const { changed, service } = await store.setServiceDuration(
      { serviceId: 'fue-scar', durationMinutes: 180 },
      { userId: 'fazli' }
    );
    assert.equal(changed, true);
    assert.equal(service.durationMinutes, 180);
    assert.equal(service.durationSource, 'staff');
    assert.equal(service.durationSetBy, 'fazli');
    assert.ok(service.durationSetAt, 'och när');
    assert.equal(await langd(store, 'fue-scar'), 180);
  });
});

test('den ÖVERLEVER en omstart — det var hela problemet', async () => {
  // Det här testet är kärnan. Utan det är funktionen en illusion: värdet syns i
  // vyn, ligger i filen, och försvinner vid nästa deploy.
  await medMotor(async ({ store, filePath }) => {
    await store.setServiceDuration({ serviceId: 'fue-scar', durationMinutes: 180 }, {});
    await store.setServiceDuration({ serviceId: 'dhi', durationMinutes: 420 }, {});
    await store.setServiceDuration({ serviceId: 'consultation-physical', durationMinutes: 30 }, {});

    const omstartad = await createCcoBookingEngineStore({ filePath });
    assert.equal(await langd(omstartad, 'fue-scar'), 180, 'ärrtransplantationen');
    assert.equal(await langd(omstartad, 'dhi'), 420, 'DHI — återställdes tyst före ORD-194');
    assert.equal(
      await langd(omstartad, 'consultation-physical'),
      30,
      'konsultationen — återställdes tyst före ORD-194'
    );
  });
});

test('personalens längd vinner över längdfacit', async () => {
  // bleph-upper står på 90 min i facit (ägarens "övre eller nedre 1,5h").
  // Facit är utgångsläget, inte sista ordet.
  await medMotor(async ({ store, filePath }) => {
    assert.equal(LANGDER.langder['bleph-upper'].minuter, 90, 'facit säger 90');
    assert.equal(await langd(store, 'bleph-upper'), 90);

    await store.setServiceDuration({ serviceId: 'bleph-upper', durationMinutes: 120 }, {});
    const omstartad = await createCcoBookingEngineStore({ filePath });
    assert.equal(await langd(omstartad, 'bleph-upper'), 120, 'personalen vinner');
  });
});

test('facit gäller fortfarande för tjänster ingen rört', async () => {
  // Motprovet: att låta personalen vinna får inte göra facit verkningslöst.
  await medMotor(async ({ store }) => {
    for (const [id, rad] of Object.entries(LANGDER.langder)) {
      const s = (await store.listServices()).find((x) => x.id === id);
      if (!s) continue;
      assert.equal(s.durationMinutes, rad.minuter, `${id} ska följa facit`);
      assert.equal(s.durationSource, 'facit');
    }
  });
});

test('ägarens 45 minuter gäller PRP och microneedling', async () => {
  // Ägaren 2026-09-03: "FUE DHI hår PRP hud Microneedling PRP 45."
  //
  // 45 minuter tillämpas på PRP- och microneedlingfamiljen, som stod på 60.
  // INTE på FUE och DHI: de är åttatimmarsingrepp, och 45 minuter kan inte vara
  // avsett. Att gissa där hade gett en kalender som säljer en transplantation i
  // ett 45-minuterspass.
  await medMotor(async ({ store }) => {
    assert.equal(await langd(store, 'prp-hair'), 45);
    assert.equal(await langd(store, 'prp-skin'), 45, 'stod på 60');
    assert.equal(await langd(store, 'microneedling'), 45, 'stod på 60');
    assert.equal(await langd(store, 'fue'), 480, 'FUE rörs inte');
    assert.equal(await langd(store, 'dhi'), 480, 'DHI rörs inte');
  });
});

test('orimliga tal nekas, med ett skäl som går att läsa', async () => {
  await medMotor(async ({ store }) => {
    await assert.rejects(
      () => store.setServiceDuration({ serviceId: 'fue-scar', durationMinutes: 10 }),
      /Kortast bokningsbara tid är 15 minuter/
    );
    // 4800 i stället för 480 är det skrivfel som faktiskt görs.
    await assert.rejects(
      () => store.setServiceDuration({ serviceId: 'fue-scar', durationMinutes: 4800 }),
      /12 timmar/
    );
    await assert.rejects(
      () => store.setServiceDuration({ serviceId: 'fue-scar', durationMinutes: 47.5 }),
      /hela minuter/
    );
    await assert.rejects(
      () => store.setServiceDuration({ serviceId: 'finns-inte', durationMinutes: 60 }),
      /finns inte i katalogen/
    );
  });
});

test('längden syns i kalendern — talet är inte bara en etikett', async () => {
  // En längd som inte påverkar tiderna är en anteckning, inte en inställning.
  await medMotor(async ({ store }) => {
    await store.upsertAvailabilityRule(
      {
        resourceId: 'egzona',
        serviceId: 'prp-hair',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['10:00'],
      },
      {}
    );
    const { fromDate, toDate } = require('../helpers/bookingTestDates').bookingMondayWindow();
    const fore = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      srvIds: 'prp-hair',
    });
    assert.ok(fore.length > 0);
    const langdFore = (Date.parse(fore[0].endsAt) - Date.parse(fore[0].startsAt)) / 60000;
    assert.equal(langdFore, 45);

    await store.setServiceDuration({ serviceId: 'prp-hair', durationMinutes: 90 }, {});
    const efter = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      srvIds: 'prp-hair',
    });
    const langdEfter = (Date.parse(efter[0].endsAt) - Date.parse(efter[0].startsAt)) / 60000;
    assert.equal(langdEfter, 90, 'tiden ska bli längre i kalendern');
  });
});

test('ärrlängderna står kvar som EJ FASTSTÄLLDA tills någon sätter dem', () => {
  // 480 min är ärvt från FUE-hår, inte mätt. Att låta det stå omarkerat hade
  // gjort en gissning till data. Raden tas bort när ägaren satt talet.
  for (const id of ['fue-scar', 'dhi-scar']) {
    assert.ok(LANGDER._att_sattas[id], `${id} måste stå som ej fastställd`);
    assert.equal(LANGDER.langder[id], undefined);
  }
});

test('45 gäller INTE FUE eller DHI, och skälet står skrivet', () => {
  assert.equal(LANGDER.langder.fue, undefined);
  assert.equal(LANGDER.langder.dhi, undefined);
  assert.match(LANGDER._kallor.agaren_2026_09_03, /INTE tillämpat på FUE\/DHI/);
});

test('en handredigering UTAN staff-märkning skrivs fortfarande tillbaka', () => {
  // Mekanismen bygger helt på märkningen. Utan den gäller den gamla ordningen,
  // och det ska stå tydligt: att öppna filen och byta ett tal räcker inte.
  const kalla = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoBookingEngineStore.js'),
    'utf8'
  );
  assert.match(kalla, /durationSource !== 'staff'/, 'migreringen kollar märkningen');
  assert.match(kalla, /bevaraPersonalensLangd/, 'och plockar tillbaka värdet');
});
