'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

const TENANT = 'hair-tp-clinic';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnr-merge-gate-'));
  const store = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  return { dir, store };
}

async function seedPair(store, { primaryPnr, secondaryPnr }) {
  const primary = await store.upsertPatient({
    tenantId: TENANT,
    displayName: 'Primär Person',
    primaryEmail: 'primar@example.test',
    personnummer: primaryPnr,
  });
  const secondary = await store.upsertPatient({
    tenantId: TENANT,
    displayName: 'Sekundär Person',
    primaryEmail: 'sekundar@example.test',
    personnummer: secondaryPnr,
  });
  return { primary, secondary };
}

test('personnummergrind: olika personnummer på båda sidor → rollback (409, ingen mutation)', async () => {
  const { store } = await makeStore();
  const { primary, secondary } = await seedPair(store, {
    primaryPnr: '19800101-1111',
    secondaryPnr: '19800101-2222',
  });

  await assert.rejects(
    () =>
      store.mergePatients({
        tenantId: TENANT,
        primaryPatientId: primary.id,
        secondaryPatientIds: [secondary.id],
      }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /olika personnummer/);
      return true;
    }
  );

  // Rollback: ingen av sidorna får vara arkiverad/merged.
  const secAfter = await store.getPatient({ tenantId: TENANT, patientId: secondary.id });
  assert.notEqual(secAfter.matchStatus, 'merged');
  const stats = await store.getTenantStats({ tenantId: TENANT });
  assert.equal(stats.totalPatients, 2);
});

test('personnummergrind: ena sidan saknar personnummer → tillåts (backfill)', async () => {
  const { store } = await makeStore();
  const { primary, secondary } = await seedPair(store, {
    primaryPnr: '19800101-1111',
    secondaryPnr: '',
  });

  const merged = await store.mergePatients({
    tenantId: TENANT,
    primaryPatientId: primary.id,
    secondaryPatientIds: [secondary.id],
  });
  assert.equal(merged.archivedPatientIds.length, 1);
});

test('personnummergrind: allowPersonnummerConflict=true (reconciliation) → tillåts', async () => {
  const { store } = await makeStore();
  const { primary, secondary } = await seedPair(store, {
    primaryPnr: '19800101-1111',
    secondaryPnr: '19800101-2222',
  });

  const merged = await store.mergePatients({
    tenantId: TENANT,
    primaryPatientId: primary.id,
    secondaryPatientIds: [secondary.id],
    allowPersonnummerConflict: true,
  });
  assert.equal(merged.archivedPatientIds.length, 1);
});
