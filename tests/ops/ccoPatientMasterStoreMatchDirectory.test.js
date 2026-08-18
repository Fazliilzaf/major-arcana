'use strict';

/* Incident 2026-08-18 (uppföljning till #1410/#1411): efter O(1)-kö-fixen
 * fortsatte /process-all att frysa arcana. Render-loggarna visade att
 * frysningen inte längre låg i reconcileProcessingQueue (ingen "queue
 * integrity"-logg — inget att städa) och att INGET meddelande hann
 * processas (ingen "[mail-ingestion] processed raw="-logg alls). Det
 * pekade på ett steg FÖRE loopen i syncService.processQueue().
 *
 * Root cause: patientDirectoryProvider i server.js anropade
 * ccoPatientMasterStore.listPatients({ limit: 20000 }) en gång per batch.
 * listPatients gör en full JSON.parse(JSON.stringify)-djupklon
 * (clonePatient) av VARJE patient plus en localeCompare-sortering över
 * hela registret — samma kostnad som redan dokumenterats i koden vid
 * listPatientIdentities (ORD-85/#1233): +517 MB heap och flera sekunders
 * synkront CPU-arbete för ~7500 patienter. Det körde INNAN något
 * meddelande processades, blockerade event-loopen längre än Render:s
 * 5s-hälsokoll och tvingade fram en omstart.
 *
 * Fix: listPatientMatchDirectory() — ett engångspass över bucket.patients
 * utan klon och utan sortering, som returnerar EXAKT samma fältform som
 * patientDirectoryProvider tidigare byggde manuellt ovanpå listPatients.
 *
 * Dessa tester verifierar:
 *   1. Fält-för-fält-ekvivalens mot den gamla listPatients+.map()-vägen.
 *   2. merged-sekundärer utesluts (samma som listPatients).
 *   3. Returnerade arrayer (emails/phones) är kopior — mutation av
 *      resultatet kan inte korrumpera store:ets interna state.
 *   4. Skalar till tusentals patienter utan att bli långsamt (regressions-
 *      skydd mot att någon av nytt kod råkar återinföra klon/sortering).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

async function withStore(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pm-matchdir-'));
  const filePath = path.join(dir, 'cco-patient-master.json');
  const store = await createCcoPatientMasterStore({ filePath });
  try {
    await fn(store);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// Samma manuella mappning som patientDirectoryProvider i server.js gjorde
// INNAN denna fix, ovanpå listPatients — legacy-referensen vi jämför mot.
function legacyMapFromListPatients(listed) {
  return (listed.patients || []).map((patient) => ({
    id: patient.id,
    patientId: patient.id,
    personnummer: patient.personnummer,
    primaryEmail: patient.primaryEmail,
    personalEmail: patient.primaryEmail,
    verifiedPersonalEmailNormalized: String(patient.primaryEmail || '')
      .trim()
      .toLowerCase(),
    emails: patient.emails,
    phones: patient.phones,
    primaryPhone: patient.primaryPhone,
  }));
}

test('listPatientMatchDirectory är fält-för-fält-identisk med legacy listPatients+.map() (oordnad jämförelse)', async () => {
  await withStore(async (store) => {
    const tenantId = 'hair-tp-clinic';
    await store.upsertPatient({
      tenantId,
      displayName: 'Anna Andersson',
      personnummer: '199001011234',
      emails: ['anna@example.com', 'ANNA.A@example.com'],
      phones: ['+46701234567'],
    });
    await store.upsertPatient({
      tenantId,
      displayName: 'Björn Berg',
      emails: ['bjorn@example.com'],
      phones: [],
    });
    await store.upsertPatient({
      tenantId,
      displayName: 'Cecilia Ceder',
      emails: [],
      phones: ['+46709998877'],
    });

    const legacy = legacyMapFromListPatients(await store.listPatients({ tenantId, limit: 20000 }));
    const fast = (await store.listPatientMatchDirectory({ tenantId })).patients;

    assert.equal(fast.length, legacy.length);
    const legacyById = new Map(legacy.map((p) => [p.id, p]));
    for (const entry of fast) {
      const expected = legacyById.get(entry.id);
      assert.ok(expected, `saknar legacy-motsvarighet för id=${entry.id}`);
      assert.deepEqual(entry, expected);
    }
  });
});

test('listPatientMatchDirectory utesluter sammanslagna sekundärer (matchStatus=merged), precis som listPatients', async () => {
  await withStore(async (store) => {
    const tenantId = 'hair-tp-clinic';
    const primary = await store.upsertPatient({
      tenantId,
      displayName: 'Primär Patient',
      emails: ['primar@example.com'],
    });
    const secondary = await store.upsertPatient({
      tenantId,
      displayName: 'Sekundär Patient',
      emails: ['sekundar@example.com'],
    });
    await store.upsertPatient({
      tenantId,
      id: secondary.id,
      matchStatus: 'merged',
    });

    const { patients } = await store.listPatientMatchDirectory({ tenantId });
    const ids = patients.map((p) => p.id);
    assert.ok(ids.includes(primary.id));
    assert.ok(!ids.includes(secondary.id));
  });
});

test('listPatientMatchDirectory returnerar kopior av emails/phones — mutation av resultatet kan inte korrumpera store:et', async () => {
  await withStore(async (store) => {
    const tenantId = 'hair-tp-clinic';
    await store.upsertPatient({
      tenantId,
      displayName: 'Mutation Test',
      emails: ['original@example.com'],
      phones: ['+46700000000'],
    });

    const { patients } = await store.listPatientMatchDirectory({ tenantId });
    assert.equal(patients.length, 1);
    patients[0].emails.push('injicerad@example.com');
    patients[0].phones.push('+46799999999');

    const reread = await store.listPatientMatchDirectory({ tenantId });
    assert.deepEqual(reread.patients[0].emails, ['original@example.com']);
    assert.deepEqual(reread.patients[0].phones, ['+46700000000']);
  });
});

test('listPatientMatchDirectory skalar till 5000 patienter utan att bli långsamt (regressionsskydd mot återinförd klon/sortering)', async () => {
  await withStore(async (store) => {
    const tenantId = 'hair-tp-clinic';
    const inputs = [];
    for (let i = 0; i < 5000; i += 1) {
      inputs.push({
        tenantId,
        displayName: `Patient ${i}`,
        emails: [`patient${i}@example.com`],
        phones: [`+4670${String(i).padStart(7, '0')}`],
      });
    }
    await store.upsertPatients(inputs);

    const start = process.hrtime.bigint();
    const { patients } = await store.listPatientMatchDirectory({ tenantId });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    assert.equal(patients.length, 5000);
    // Generös marginal — ett engångspass utan klon/sortering över 5000
    // poster ska ta enstaka tiotals millisekunder, inte sekunder (det var
    // just den skillnaden som orsakade incidenten).
    assert.ok(
      elapsedMs < 1000,
      `listPatientMatchDirectory tog ${elapsedMs.toFixed(1)}ms för 5000 patienter — misstänkt långsamt`
    );
  });
});
