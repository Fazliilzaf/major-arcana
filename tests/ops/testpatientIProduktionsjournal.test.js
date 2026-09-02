'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const {
  arTestrest,
  TEST_PATIENT,
  LEGACY_TENANT,
  FORVANTAT,
} = require('../../scripts/ops/arkivera-testrester-journal.js');

/**
 * ORD-166 §3 — ett smoke-test får inte lämna journalposter i produktion.
 *
 * Det som faktiskt hände 2–3 juni 2026: ett smoke-test och en pilotkörning
 * skrev 767 journalposter i prod. Fyra patient-id, ingen av dem i
 * cco-patient-master, samtliga consultation_plan med tomma fält, 764 markerade
 * som signerade och låsta. 12,9 % av patientjournalen.
 *
 * Tre gånger behandlades det som en tenant-stavningsfråga — av agenten, och två
 * gånger av mig — eftersom raderna bar `hairtpclinic`. Stavningen var bara hur
 * det syntes. Felet var att testdata nådde produktionsdatabasen.
 *
 * Arkiverade och borttagna 2026-09-02 (ORD-166, ägarbeslut B).
 *
 * Testet nedan skyddar två saker: att mönstret som identifierade dem finns kvar
 * och fungerar, och att en journalpost med ett test-patient-id inte kan skrivas
 * utan att vara märkt som testdata.
 */

const ACTOR = { userId: 't', role: 'owner', displayName: 'T' };

async function nyStore() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'testpatient-'));
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'j.json') });
  return { store, dir };
}

test('mönstret känner igen de fyra som faktiskt låg i prod', () => {
  for (const pid of Object.keys(FORVANTAT.perPatient)) {
    assert.ok(
      TEST_PATIENT.test(pid),
      `${pid} låg i produktionsjournalen och måste kännas igen som testdata`
    );
  }
  assert.equal(
    Object.values(FORVANTAT.perPatient).reduce((a, b) => a + b, 0),
    FORVANTAT.totalt,
    'summan per patient ska stämma med totalen som mättes i prod'
  );
});

test('mönstret träffar inte riktiga patient-id', () => {
  for (const pid of ['p-8471', 'cco-patient-1029', 'ML-2026-0031', 'contactperson-77']) {
    assert.equal(
      TEST_PATIENT.test(pid),
      false,
      `${pid} ser ut som en riktig patient och får inte klassas som testdata`
    );
  }
});

test('kriteriet är tvådelat — stavningen ensam räcker inte', () => {
  // En riktig patient som fått den gamla stavningen från någon av kodens
  // 52 defaulter ska INTE svepas med av städskriptet.
  assert.equal(
    arTestrest({ tenantId: LEGACY_TENANT, patientId: 'p-8471' }),
    false,
    'en riktig patient med gammal stavning är inte testdata'
  );
  // Och en testpatient under kanonisk tenant ska inte heller träffas av
  // just det skriptet — den hör till en egen städning.
  assert.equal(
    arTestrest({ tenantId: 'hair-tp-clinic', patientId: 'cco-pilot-20260602-a' }),
    false,
    'skriptet är avgränsat till kombinationen som mättes'
  );
  assert.equal(
    arTestrest({ tenantId: LEGACY_TENANT, patientId: 'cco-pilot-20260602-a' }),
    true,
    'kombinationen som faktiskt låg i prod ska träffas'
  );
});

test('en journalpost med test-patient-id måste märkas som testdata', async () => {
  const { store, dir } = await nyStore();
  try {
    const entry = await store.upsertEntry(
      {
        tenantId: 'hair-tp-clinic',
        patientId: 'cco-readiness-smoke-9999',
        journalType: 'consultation_plan',
        fields: {},
      },
      { actor: ACTOR }
    );

    assert.equal(
      entry.isTestData === true,
      true,
      'En journalpost med ett test-patient-id skrevs utan isTestData. Det är precis ' +
        'så de 767 raderna hamnade i produktionsjournalen: de såg ut som riktiga ' +
        'poster i varje vy och räknades in i varje mätning. Sätt isTestData i ' +
        'ccoJournalStore.upsertEntry när patientId matchar testmönstret.'
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('en riktig patient märks inte som testdata', async () => {
  const { store, dir } = await nyStore();
  try {
    const entry = await store.upsertEntry(
      {
        tenantId: 'hair-tp-clinic',
        patientId: 'p-8471',
        journalType: 'consultation_plan',
        fields: {},
      },
      { actor: ACTOR }
    );
    assert.notEqual(entry.isTestData, true, 'en riktig patient får inte flaggas som testdata');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
