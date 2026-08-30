const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const {
  createCcoPatientMasterStore,
  normalizeCareRelationship,
} = require('../../src/ops/ccoPatientMasterStore');

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-pm-care-'));
  const store = await createCcoPatientMasterStore({ filePath: path.join(dir, 'patient-master.json') });
  return { store, dir };
}

test('careRelationship är skilt från matchStatus och extern status', async () => {
  const { store, dir } = await makeStore();
  try {
    const created = await store.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'kund@example.com',
      displayName: 'Kund Test',
      // Extern status (Pipedrive-import) och matchStatus får inte röras.
      pipedrive: { status: 'Won', name: 'Kund Test' },
    });
    assert.equal(created.careRelationship.state, 'active');
    assert.equal(created.careRelationship.closeReason, null);
    assert.equal(created.matchStatus, 'unmatched');

    const closed = await store.closeCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
      closeReason: 'deceased',
      actor: { userId: 'u1', role: 'owner' },
      note: 'Avliden enligt anhörig.',
    });
    assert.equal(closed.careRelationship.state, 'closed');
    assert.equal(closed.careRelationship.closeReason, 'deceased');
    assert.equal(closed.careRelationship.closedByUserId, 'u1');
    assert.equal(closed.careRelationship.closedByRole, 'owner');
    assert.equal(closed.careRelationship.note, 'Avliden enligt anhörig.');
    // Orört: matchStatus och extern pipedrive.status.
    assert.equal(closed.matchStatus, 'unmatched');
    assert.equal(closed.pipedrive.status, 'Won');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('deceased är slutgiltig — ett andra anrop ändrar inget', async () => {
  const { store, dir } = await makeStore();
  try {
    const created = await store.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'x@example.com',
      displayName: 'X',
    });
    const first = await store.closeCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
      closeReason: 'deceased',
      actor: { userId: 'u1', role: 'owner' },
    });
    const second = await store.closeCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
      closeReason: 'deceased',
      actor: { userId: 'u2', role: 'doctor' },
    });
    assert.equal(second.careRelationship.closedByUserId, 'u1', 'första stängningen bevaras');
    assert.equal(second.careRelationship.closedAt, first.careRelationship.closedAt);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('findDeceasedByEmailOrId hittar avliden per e-post eller id (case-okänsligt)', async () => {
  const { store, dir } = await makeStore();
  try {
    const a = await store.upsertPatient({
      tenantId: 't1',
      primaryEmail: 'avliden@example.com',
      displayName: 'A',
    });
    const b = await store.upsertPatient({
      tenantId: 't2',
      primaryEmail: 'levande@example.com',
      displayName: 'B',
    });
    await store.closeCareRelationship({ tenantId: 't1', patientId: a.id, closeReason: 'deceased' });
    assert.equal(store.findDeceasedByEmailOrId({ email: 'avliden@example.com' }), true);
    assert.equal(store.findDeceasedByEmailOrId({ email: 'AVLIDEN@example.com' }), true);
    assert.equal(store.findDeceasedByEmailOrId({ customerId: a.id }), true);
    assert.equal(store.findDeceasedByEmailOrId({ email: 'levande@example.com' }), false);
    assert.equal(store.findDeceasedByEmailOrId({ customerId: b.id }), false);
    assert.equal(store.findDeceasedByEmailOrId({}), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('ogiltig closeReason avvisas', async () => {
  const { store, dir } = await makeStore();
  try {
    const created = await store.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'y@example.com',
      displayName: 'Y',
    });
    await assert.rejects(
      () =>
        store.closeCareRelationship({
          tenantId: 'hairtpclinic',
          patientId: created.id,
          closeReason: 'paused',
        }),
      /Ogiltig closeReason/
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('normalizeCareRelationship bevarar befintligt vid undefined och tömmer vid null', () => {
  assert.deepEqual(normalizeCareRelationship({}, {}), {
    state: 'active',
    closeReason: null,
    closedAt: null,
    closedByUserId: null,
    closedByRole: null,
    note: null,
  });
  const closed = { state: 'closed', closeReason: 'deceased', closedAt: 't' };
  assert.equal(normalizeCareRelationship({}, closed).closeReason, 'deceased');
  assert.equal(normalizeCareRelationship({ closeReason: null }, closed).closeReason, null);
});
