'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const { canonicalTenantId } = require('../../src/tenant/tenantIdCanonical');

/**
 * ORD-165 §3 — varför journalens SKRIVVÄG inte normaliserar tenant-stavningen.
 *
 * Normalisering byggdes in 2026-09-02 (8c401043) och rullades tillbaka samma
 * dag. Den såg riktig ut och alla dess egna tester var gröna. Den duplicerade
 * journalposter.
 *
 * Mekanismen: `upsertEntry` hittar den befintliga posten via (tenantId,
 * patientId). Kanoniserar man tenantId INNAN uppslaget så matchar en legacy-rad
 * inte längre sig själv — och en ny rad skapas, med SAMMA entryId.
 *
 *   FÖRE   1 rad   tenantId "hairtpclinic"   ändringen ej gjord
 *   EFTER  2 rader entryId identiskt, en "hairtpclinic" utan ändringen
 *                  och en "hair-tp-clinic" med
 *
 * Prod har 767 sådana rader — samtliga consultation_plan, skrivna i ett
 * 19-timmarsfönster 2–3 juni 2026. Läsvägen matchar exakt (`listEntries`), så
 * vyer som filtrerar på den gamla stavningen hade fortsatt visa den föråldrade
 * kopian medan andra vyer visade den uppdaterade. Två svar på samma fråga i en
 * patientjournal, utan att något larmar.
 *
 * Ordningen som gäller innan normalisering får slås på igen:
 *   1. migrera de 767 raderna till hair-tp-clinic
 *   2. få upsert att matcha på entryId oberoende av tenant
 *   3. först då normalisera vid inskrivning
 *
 * Testet nedan failar om någon slår på det i steg 1 eller 2.
 */

async function nyStore() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'journal-tenant-blockerad-'));
  const filePath = path.join(dir, 'j.json');
  return { store: await createCcoJournalStore({ filePath }), dir, filePath };
}

const ACTOR = { userId: 't', role: 'owner', displayName: 'T' };

/** Skapar en post och sätter dess tenantId på disk till den gamla stavningen. */
async function legacyRad(filePath, store) {
  await store.upsertEntry(
    { tenantId: 'hair-tp-clinic', patientId: 'P1', journalType: 'consultation_plan', fields: {} },
    { actor: ACTOR }
  );
  const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  j.entries[0].tenantId = 'hairtpclinic';
  delete j._indexes;
  fs.writeFileSync(filePath, JSON.stringify(j, null, 2));
}

test('modulen finns och kan den kanoniska stavningen — den är inte borttagen', () => {
  assert.equal(canonicalTenantId('hairtpclinic'), 'hair-tp-clinic');
  assert.equal(canonicalTenantId('hair_tp'), 'hair-tp-clinic');
  assert.equal(canonicalTenantId('curatiio'), 'curatiio');
});

test('en legacy-rad som uppdateras dupliceras INTE', async () => {
  const { dir, filePath } = await nyStore();
  try {
    let store = await createCcoJournalStore({ filePath });
    await legacyRad(filePath, store);

    store = await createCcoJournalStore({ filePath });
    const post = (await store.listEntries({ tenantId: 'hairtpclinic', patientId: 'P1' }))[0];
    assert.ok(post, 'legacy-raden ska gå att läsa med den gamla stavningen');

    const fore = JSON.parse(fs.readFileSync(filePath, 'utf8')).entries.length;
    await store.upsertEntry(
      { ...post, fields: { ...post.fields, notes: 'bridgen rörde den' } },
      { actor: ACTOR }
    );
    const efter = JSON.parse(fs.readFileSync(filePath, 'utf8')).entries;

    assert.equal(
      efter.length,
      fore,
      'Journalposten duplicerades. Det händer när skrivvägen kanoniserar tenantId ' +
        'före uppslaget: legacy-raden matchar inte längre sig själv. Migrera de 767 ' +
        'raderna och gör upsert entryId-baserad innan normaliseringen slås på.\n' +
        efter.map((e) => `  entryId=${e.entryId} tenantId=${e.tenantId}`).join('\n')
    );

    const idn = efter.map((e) => e.entryId);
    assert.equal(
      new Set(idn).size,
      idn.length,
      'Två journalposter delar entryId. Patientjournalen har då två svar på samma ' +
        'fråga, och den ena är tyst föråldrad.'
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('ändringen hamnar på raden som faktiskt läses tillbaka', async () => {
  const { dir, filePath } = await nyStore();
  try {
    let store = await createCcoJournalStore({ filePath });
    await legacyRad(filePath, store);

    store = await createCcoJournalStore({ filePath });
    const post = (await store.listEntries({ tenantId: 'hairtpclinic', patientId: 'P1' }))[0];
    await store.upsertEntry(
      { ...post, fields: { ...post.fields, notes: 'bridgen rörde den' } },
      { actor: ACTOR }
    );

    const igen = await createCcoJournalStore({ filePath });
    const gamla = await igen.listEntries({ tenantId: 'hairtpclinic', patientId: 'P1' });
    assert.equal(
      gamla.length && gamla[0].fields.notes,
      'bridgen rörde den',
      'Vyn som filtrerar på den gamla stavningen ser inte ändringen. Då visar två ' +
        'vyer olika versioner av samma journalpost.'
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
