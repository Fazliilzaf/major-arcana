'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

/**
 * ORD-182 — behandlarna som faktiskt jobbar, inte de som en gång gjorde det.
 *
 * HANDOVERDOKUMENTET SA NIO SAKNADE BEHANDLARE och räknade upp dem med
 * bokningsantal: Hind Alsharifi (1 192), Natsuko Martinsson (1 121), Sabina
 * Nordvall (630), Matilda Sellergren (529), Mikaela Richter-Hill (246), Danyal
 * Golgo (202), Jessicka Bakhtiari (196), Emir Kapetanovic (8), Anna Klang (1).
 *
 * Listan var byggd på TOTALER ur hela Cliento-historiken. Mätt på SENASTE
 * BOKNING i stället, 2026-09-03:
 *
 *   Sabina Nordvall      2026-10-09 (framtida)   256 senaste året
 *   Jessicka Bakhtiari   2025-11-28                7
 *   Natsuko Martinsson   2025-02-12                0
 *   Mikaela Richter-Hill 2024-07-08                0
 *   Hind Alsharifi       2024-06-08                0
 *   Matilda Sellergren   2024-06-07                0
 *   Danyal Golgo         2024-03-25                0
 *   Emir Kapetanovic     2024-02-25                0
 *   Anna Klang           2021-11-02                0
 *
 * Sju av nio slutade för ett till fem år sedan. Att lägga in dem hade fyllt
 * kalendern med personal som inte finns — precis det ägaren varnade för samma
 * dag: "michael är inte ens kvar och jobbar".
 *
 * FACIT ÄR HEMSIDAN, INTE HISTORIKEN. curatiio.com/priser listar i dag tre
 * specialister: "ORTOPEDI · DR. SABINA", "ÖGONLOCKSPLASTIK · DR. ARYA",
 * "ESTETIK · DR. JESSICA".
 */

const AVSLUTADE = [
  'Hind Alsharifi',
  'Natsuko Martinsson',
  'Matilda Sellergren',
  'Mikaela Richter-Hill',
  'Danyal Golgo',
  'Emir Kapetanovic',
  'Anna Klang',
];

async function medMotor(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord182-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    await run({ store, resurser: await store.listResources() });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test('Curatiios tre specialister finns — Arya, Sabina och Jessica', async () => {
  await medMotor(async ({ resurser }) => {
    const ids = resurser.map((r) => r.id);
    for (const id of ['arya', 'sabina', 'jessica']) {
      assert.ok(ids.includes(id), `${id} saknas — hemsidan listar hen som verksam`);
    }
  });
});

test('de nya resurserna kommer in i ett BEFINTLIGT state, inte bara i ett tomt', async () => {
  /**
   * MITT FEL, UPPTÄCKT I PROD OCH INTE AV DE HÄR TESTERNA.
   *
   * ORD-182 la till Sabina och Jessica, ORD-186 transplantationskolumnen. Allt
   * grönt — och ingen av dem fanns i produktion efter deploy. Skälet:
   * migreringen itererade `defaults.services` men aldrig `defaults.resources`.
   * En ny standardTJÄNST kom in i befintligt state, en ny standardRESURS inte.
   *
   * Testerna byggde en TOM store, där defaults blir hela sanningen. Skillnaden
   * mellan "tomt state" och "befintligt state" var precis det som gick fel, och
   * precis det inget test mätte.
   *
   * Det här testet startar från ett state som ser ut som prod gjorde: de gamla
   * sju resurserna, inga nya.
   */
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord193-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    const fs = require('node:fs');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        services: [],
        resources: [
          { id: 'fazli', label: 'Fazli Krasniqi', active: true, publicBookable: true },
          { id: 'egzona', label: 'Egzona Krasniqi', active: true, publicBookable: true },
          { id: 'arya', label: 'Dr. Arya Emami', active: true, publicBookable: true },
          { id: 'veronica', label: 'Veronica', active: true, publicBookable: false },
          { id: 'clara', label: 'Clara', active: true, publicBookable: false },
          { id: 'wendela', label: 'Wendela', active: true, publicBookable: false },
          { id: 'louise', label: 'Louise', active: true, publicBookable: false },
        ],
        availabilityRules: [],
        reservations: [],
        bookings: [],
        calendarBlocks: [],
      })
    );

    const store = await createCcoBookingEngineStore({ filePath });
    const ids = (await store.listResources()).map((r) => r.id);
    for (const id of ['sabina', 'jessica', 'transplantation']) {
      assert.ok(ids.includes(id), `${id} måste läggas till i ett befintligt state`);
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('en befintlig resurs skrivs INTE över av deployen', async () => {
  // Personalen kan ha ändrat etikett eller defaultRoomId. En deploy ska inte
  // slå tillbaka det. Därför är mergen additiv, inte överskrivande.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord193b-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    const fs = require('node:fs');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        services: [],
        resources: [
          {
            id: 'egzona',
            label: 'Egzona K. (omdöpt av personalen)',
            active: true,
            publicBookable: true,
            defaultRoomId: '3',
          },
        ],
        availabilityRules: [],
        reservations: [],
        bookings: [],
        calendarBlocks: [],
      })
    );
    const store = await createCcoBookingEngineStore({ filePath });
    const egzona = (await store.listResources()).find((r) => r.id === 'egzona');
    assert.equal(egzona.label, 'Egzona K. (omdöpt av personalen)');
    assert.equal(egzona.defaultRoomId, '3');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('de sju som slutat läggs INTE in', async () => {
  // Den viktigaste raden i filen. Historikens totaler är en frestelse: Hind
  // har 1 192 bokningar och ser ut som klinikens viktigaste behandlare. Hon
  // slutade i juni 2024.
  await medMotor(async ({ resurser }) => {
    const etiketter = resurser.map((r) => String(r.label || '').toLowerCase());
    for (const namn of AVSLUTADE) {
      const efternamn = namn.split(' ')[1].toLowerCase();
      assert.ok(
        !etiketter.some((l) => l.includes(efternamn)),
        `${namn} slutade och ska inte finnas som resurs`
      );
    }
  });
});

test('back-office läggs inte in som behandlare', async () => {
  // Bittan (Britt-louise) har 324 bokningar det senaste året men INTE EN enda
  // med tjänstenamn. Katalogkommentaren sedan tidigare: back-office är "aldrig
  // patient-bokningsbar". Andrea, 374 bokningar och noll tjänstenamn, motsvarar
  // legacy-cliento-60199 "Content · Andrea" — innehåll, inte behandling.
  //
  // Ett högt bokningsantal betyder att kalendern används, inte att någon
  // behandlar patienter.
  await medMotor(async ({ resurser }) => {
    const etiketter = resurser.map((r) => String(r.label || '').toLowerCase());
    for (const namn of ['bittan', 'britt-louise', 'andrea', 'måns', 'felix']) {
      assert.ok(!etiketter.some((l) => l.includes(namn)), `${namn} är inte behandlare`);
    }
  });
});

test('Sabina och Jessica tillhör Curatiio, inte Hair TP', async () => {
  // `brand` fanns inte alls på resurser — normalizeResource tappade fältet, så
  // ingen resurs kunde någonsin tillhöra Curatiio. Utan det hamnar Curatiios
  // specialister i Hair TP:s lista.
  await medMotor(async ({ store }) => {
    const curatiio = (await store.listResources({ brand: 'curatiio' })).map((r) => r.id);
    assert.deepEqual(curatiio.sort(), ['jessica', 'sabina']);

    const hairtp = (await store.listResources({ brand: 'hair-tp-clinic' })).map((r) => r.id);
    assert.ok(!hairtp.includes('sabina'), 'Sabina ska inte synas i Hair TP-vyn');
    assert.ok(!hairtp.includes('jessica'));
    assert.ok(hairtp.includes('arya'), 'Arya jobbar åt båda och ligger kvar i Hair TP');
  });
});

test('de nya syns inte i den publika resurskatalogen', async () => {
  // Publik synlighet är ett eget beslut (PLAN_A-listan), inte en bieffekt av
  // att någon läggs till.
  await medMotor(async ({ store }) => {
    const publika = (await store.listPublicResources()).map((r) => r.id);
    assert.deepEqual(publika.sort(), ['arya', 'egzona', 'fazli']);
  });
});

test('ortopedin går nu att boka — det var det som var poängen', async () => {
  // Sabinas 256 bokningar det senaste året är i praktiken enbart ortopedisk
  // PRP/PRF. Att `ortho-treatment` och `consultation-ortho` stod utan resurs
  // betydde att Curatiios ortopedi inte gick att boka alls: tjänsten fanns,
  // behandlaren gjorde det inte.
  await medMotor(async ({ store }) => {
    const { fromDate, toDate } = bookingMondayWindow();
    const fore = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      srvIds: 'consultation-ortho',
    });
    assert.equal(fore.length, 0, 'inga tider förrän någon lägger in dem');

    await store.upsertAvailabilityRule(
      {
        resourceId: 'sabina',
        serviceId: 'consultation-ortho',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['09:00', '10:00'],
      },
      { role: 'operator' }
    );

    const efter = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      srvIds: 'consultation-ortho',
    });
    assert.ok(efter.length > 0, 'ortopedikonsultation ska nu gå att boka');
    assert.ok(efter.every((s) => s.resourceId === 'sabina'));
  });
});

test('en avslutad behandlare går inte att lägga tider på', async () => {
  // Skyddet från ORD-181 gäller även här: en regel mot en resurs som inte
  // finns avvisas i stället för att skapa tider ingen kan utföra.
  await medMotor(async ({ store }) => {
    await assert.rejects(
      () =>
        store.upsertAvailabilityRule({
          resourceId: 'hind',
          serviceId: 'consultation-ortho',
          weekdays: [1],
          startTimes: ['09:00'],
        }),
      /Resursen hind finns inte/
    );
  });
});
