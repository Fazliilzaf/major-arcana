'use strict';

/**
 * TVÅ PATIENTER KUNDE FÅ SAMMA ID.
 *
 * applyPatientPatch matchar på personnummer FÖRE id:
 *
 *   if (pnr) index = findIndex(p => normalizePersonnummer(p.personnummer) === pnr);
 *   if (index < 0 && normalized.id) index = findIndex(p => p.id === normalized.id);
 *
 * Kommer en uppdatering in med id X och ett personnummer som tillhör en ANNAN
 * post, vinner personnummerträffen. Den posten skrivs då över och ärver id X,
 * eftersom normalizePatientRecord låter det inkommande id:t vinna:
 *
 *   id: normalizeText(safe.id || existingSafe.id) || crypto.randomUUID()
 *
 * Originalet med id X ligger kvar. Registret har nu två poster med samma id.
 *
 * Upptäckt 2026-08-05: en patient dök upp två gånger i patientlistan och gick
 * inte att slå ihop — sammanslagningen kräver minst ett sekundärt id, och båda
 * posterna hade samma.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

const TENANT = 'hair-tp-clinic';

async function makeStore() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-idkrock-'));
  const store = await createCcoPatientMasterStore({
    filePath: path.join(tmp, 'patient-master.json'),
  });
  return { tmp, store };
}

async function allaPatienter(store) {
  const res = await store.listPatients({ tenantId: TENANT, limit: 8000 });
  return res.patients || [];
}

test('ett id kan inte flyttas till en post när en annan redan håller det', async () => {
  const { tmp, store } = await makeStore();
  try {
    // A har id X och inget personnummer.
    await store.upsertPatient({
      tenantId: TENANT,
      id: 'patient-X',
      displayName: 'A Utan Personnummer',
    });
    // B har eget id och ett personnummer.
    await store.upsertPatient({
      tenantId: TENANT,
      id: 'patient-Y',
      displayName: 'B Med Personnummer',
      personnummer: '19900101-1234',
    });

    // Uppdatering med A:s id men B:s personnummer. Personnummer matchar först,
    // så B traeffas — och skulle utan skyddet ärva id patient-X.
    await store.upsertPatient({
      tenantId: TENANT,
      id: 'patient-X',
      displayName: 'B Uppdaterad',
      personnummer: '19900101-1234',
    });

    const patienter = await allaPatienter(store);
    const idn = patienter.map((p) => p.patientId || p.id);
    const unika = new Set(idn);

    assert.equal(idn.length, unika.size, 'inga två patienter får dela id');
    assert.equal(patienter.length, 2, 'båda posterna ska finnas kvar');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('vanlig uppdatering via id fungerar oförändrat', async () => {
  const { tmp, store } = await makeStore();
  try {
    await store.upsertPatient({
      tenantId: TENANT,
      id: 'patient-1',
      displayName: 'Först',
    });
    await store.upsertPatient({
      tenantId: TENANT,
      id: 'patient-1',
      displayName: 'Uppdaterad',
    });

    const patienter = await allaPatienter(store);
    assert.equal(patienter.length, 1);
    assert.equal(patienter[0].displayName, 'Uppdaterad');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('vanlig uppdatering via personnummer fungerar oförändrat', async () => {
  const { tmp, store } = await makeStore();
  try {
    await store.upsertPatient({
      tenantId: TENANT,
      id: 'patient-1',
      displayName: 'Först',
      personnummer: '19850505-5678',
    });
    // Samma personnummer, inget id — ska hitta och uppdatera samma post.
    await store.upsertPatient({
      tenantId: TENANT,
      displayName: 'Uppdaterad via pnr',
      personnummer: '19850505-5678',
    });

    const patienter = await allaPatienter(store);
    assert.equal(patienter.length, 1, 'ingen ny post ska skapas');
    assert.equal(patienter[0].displayName, 'Uppdaterad via pnr');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('en ny patient med oanvänt id får behålla det', async () => {
  const { tmp, store } = await makeStore();
  try {
    await store.upsertPatient({
      tenantId: TENANT,
      id: 'patient-1',
      displayName: 'Ett',
      personnummer: '19700707-0001',
    });
    // Nytt personnummer OCH nytt id — ska bli en ny post med sitt eget id.
    await store.upsertPatient({
      tenantId: TENANT,
      id: 'patient-2',
      displayName: 'Tva',
      personnummer: '19800808-0002',
    });

    const patienter = await allaPatienter(store);
    assert.equal(patienter.length, 2);
    const idn = new Set(patienter.map((p) => p.patientId || p.id));
    assert.equal(idn.size, 2, 'de ska ha olika id');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
