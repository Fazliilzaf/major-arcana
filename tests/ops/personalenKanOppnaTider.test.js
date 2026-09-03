'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

/**
 * ORD-181 — kliniken måste kunna öppna tider utan en deploy.
 *
 * MÄTT I PRODUKTION 2026-09-03: 11 av 14 publikt bokningsbara tjänster hade
 * NOLL tillgänglighetsregler:
 *
 *    31 regler  consultation-physical
 *     4 regler  consultation-online
 *     2 regler  followup-transplant
 *     0 regler  prp-hair, prp-skin, microneedling, consultation-bleph,
 *               consultation-ortho, consultation-curatiio-aesthetic och
 *               samtliga fyra Curatiio-behandlingar
 *
 * Slås publik bokning på ser kunden en katalog där nästan ingenting går att
 * boka. Och personalen kunde inte rätta det: reglerna stod redan märkta
 * `managedBy: 'staff'`, men det fanns varken store-metod, API eller vy för att
 * skapa en. Etiketten sa "personalen förvaltar det här"; ingen kunde det.
 *
 * Det är hindret som gör CCO oanvändbart som Cliento-ersättare — och det är
 * inte ett schemaläggningsproblem utan ett saknat verktyg.
 */

async function medMotor(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord181-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    const store = await createCcoBookingEngineStore({ filePath });
    await run({ store, filePath, dir });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const REGEL = {
  resourceId: 'egzona',
  serviceId: 'prp-hair',
  weekdays: [1, 2, 3, 4, 5],
  startTimes: ['09:00', '10:00', '11:00'],
  locationLabel: 'Hair TP Clinic',
};

test('en tid personalen lägger in blir bokningsbar', async () => {
  // Kärnan. prp-hair är publikt bokningsbar och hade noll tider i prod.
  await medMotor(async ({ store }) => {
    const fore = await store.listAvailability({
      tenantId: 'tenant-a',
      ...bookingMondayWindow(),
      srvIds: 'prp-hair',
    });
    assert.equal(fore.length, 0, 'utgångsläget: inga tider');

    const { created } = await store.upsertAvailabilityRule(REGEL, { role: 'operator' });
    assert.equal(created, true);

    const efter = await store.listAvailability({
      tenantId: 'tenant-a',
      ...bookingMondayWindow(),
      srvIds: 'prp-hair',
    });
    assert.ok(efter.length > 0, 'tiderna ska nu gå att boka');
    assert.ok(efter.every((s) => s.serviceId === 'prp-hair'));
  });
});

test('regeln ÖVERLEVER en omstart — annars är verktyget en illusion', async () => {
  // Den farligaste fällan i hela den här kodbasen, mött tre gånger i dag:
  // längderna (ORD-178), ärendena (ORD-179) och nu schemat. Något ser sparat
  // ut, och nästa omstart tar tyst bort det.
  //
  // migratePlanASchema släcker regler på sköterskeresurser som saknar
  // cykelfält. En enkel veckoregel personalen lägger in har inga cykelfält.
  // Utan undantaget för createdVia: 'staff_api' hade varje tid kliniken lade
  // in på en sköterska släckts vid nästa deploy.
  await medMotor(async ({ store, filePath }) => {
    const { rule } = await store.upsertAvailabilityRule(
      { ...REGEL, resourceId: 'veronica' }, // veronica = sjuksköterska
      { role: 'operator' }
    );
    assert.equal(rule.createdVia, 'staff_api');
    assert.equal(rule.active, true);

    const omstartad = await createCcoBookingEngineStore({ filePath });
    const efter = omstartad
      .listAvailabilityRules({ includeInactive: true })
      .find((r) => r.ruleId === rule.ruleId);
    assert.ok(efter, 'regeln ska finnas kvar');
    assert.equal(efter.active, true, 'och fortfarande vara aktiv efter omstart');
    assert.equal(efter.createdVia, 'staff_api', 'märkningen får inte normaliseras bort');
  });
});

test('en regel mot en tjänst som inte finns nekas, i stället för att skapa spöktider', async () => {
  // En regel mot ett okänt id ger rader i kalendern som ingen kan boka och som
  // försvinner vid nästa merge. Hellre ett fel som går att läsa.
  await medMotor(async ({ store }) => {
    await assert.rejects(
      () => store.upsertAvailabilityRule({ ...REGEL, serviceId: 'finns-inte' }),
      /finns inte i katalogen/
    );
    await assert.rejects(
      () => store.upsertAvailabilityRule({ ...REGEL, resourceId: 'finns-inte' }),
      /Resursen finns-inte finns inte/
    );
  });
});

test('en regel mot en inaktiv tjänst nekas', async () => {
  // `consultation` står inaktiv i katalogen. Att öppna tider för något
  // kliniken inte utför är ett fel, inte en förberedelse.
  await medMotor(async ({ store }) => {
    await assert.rejects(
      () => store.upsertAvailabilityRule({ ...REGEL, serviceId: 'consultation' }),
      /är inte aktiv/
    );
  });
});

test('en regel utan starttider nekas — tom är inte samma sak som avstängd', async () => {
  await medMotor(async ({ store }) => {
    await assert.rejects(
      () => store.upsertAvailabilityRule({ ...REGEL, startTimes: [] }),
      /Minst en starttid krävs/
    );
    // normalizeWeekdays fyller tyst i måndag–fredag när listan är tom. För en
    // regel som läses ur en fil är det en rimlig reserv; för en regel någon
    // skickar in är det ett påhitt — kliniken bad om inga dagar och fick fem.
    // Därför granskas rå indata innan normaliseringen hinner gissa.
    await assert.rejects(
      () => store.upsertAvailabilityRule({ ...REGEL, weekdays: [] }),
      /Minst en veckodag krävs/
    );
  });
});

test('avaktivering tar bort tiderna men behåller raden', async () => {
  // Raderas regeln går det inte att svara på "varför fanns det inga tider den
  // veckan". Historik är billigare än gissningar.
  await medMotor(async ({ store }) => {
    const { rule } = await store.upsertAvailabilityRule(REGEL, { role: 'operator' });
    const { changed } = await store.deactivateAvailabilityRule(rule.ruleId);
    assert.equal(changed, true);

    const tider = await store.listAvailability({
      tenantId: 'tenant-a',
      ...bookingMondayWindow(),
      srvIds: 'prp-hair',
    });
    assert.equal(tider.length, 0, 'inga tider kvar');

    assert.equal(
      store.listAvailabilityRules({ serviceId: 'prp-hair' }).length,
      0,
      'inte i den aktiva listan'
    );
    assert.ok(
      store.listAvailabilityRules({ includeInactive: true }).some((r) => r.ruleId === rule.ruleId),
      'men raden finns kvar för den som frågar'
    );
  });
});

test('avaktivering två gånger ändrar ingenting andra gången', async () => {
  await medMotor(async ({ store }) => {
    const { rule } = await store.upsertAvailabilityRule(REGEL, { role: 'operator' });
    await store.deactivateAvailabilityRule(rule.ruleId);
    const andra = await store.deactivateAvailabilityRule(rule.ruleId);
    assert.equal(andra.changed, false);
  });
});

test('en ändrad regel skriver över, den lägger inte till en till', async () => {
  await medMotor(async ({ store }) => {
    const { rule } = await store.upsertAvailabilityRule(REGEL, { role: 'operator' });
    const { created } = await store.upsertAvailabilityRule(
      { ...REGEL, ruleId: rule.ruleId, startTimes: ['13:00'] },
      { role: 'operator' }
    );
    assert.equal(created, false);
    const alla = store.listAvailabilityRules({ serviceId: 'prp-hair' });
    assert.equal(alla.length, 1, 'en regel, inte två');
    assert.deepEqual(alla[0].startTimes, ['13:00']);
  });
});

test('anroparen kan inte utge sig för att vara personalen', async () => {
  // managedBy och createdVia sätts av storen, aldrig av indata. Annars hade en
  // klient kunnat märka sin regel som personalskapad och därmed slippa
  // sköterskestädningen.
  await medMotor(async ({ store }) => {
    const { rule } = await store.upsertAvailabilityRule(
      { ...REGEL, managedBy: 'nagon-annan', createdVia: 'pahittat' },
      { role: 'operator' }
    );
    assert.equal(rule.managedBy, 'staff');
    assert.equal(rule.createdVia, 'staff_api');
  });
});

test('luckan är mätbar — så att någon ser när den är stängd', async () => {
  // Den här raden är inte en regel utan en mätare. 2026-09-03 saknade 11 av 14
  // publika tjänster tider. Testet kräver INTE att alla har tider — det är
  // klinikens arbete, inte kodens — men det gör bristen synlig i sviten i
  // stället för att den bara finns i ett dokument.
  await medMotor(async ({ store }) => {
    const publika = await store.listPublicServices();
    const utanTider = publika.filter(
      (s) => store.listAvailabilityRules({ serviceId: s.id }).length === 0
    );
    assert.ok(
      utanTider.length <= 11,
      `fler tjänster utan tider än vid mätningen: ${utanTider.map((s) => s.id).join(', ')}`
    );
  });
});
