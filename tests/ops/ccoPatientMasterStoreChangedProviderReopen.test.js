const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-pm-cp-'));
  const store = await createCcoPatientMasterStore({ filePath: path.join(dir, 'patient-master.json') });
  return { store, dir };
}

// ORD-147 §2 — bytt vårdgivare: stängs + blockeras, MEN går att ångra.
test('changed_provider är ångerbar: close → reopen', async () => {
  const { store, dir } = await makeStore();
  try {
    const created = await store.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'flyttad@example.com',
      displayName: 'Flyttad Kund',
    });
    const closed = await store.closeCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
      closeReason: 'changed_provider',
      actor: { userId: 'u1', role: 'operator' },
      note: 'Byte till annan klinik.',
    });
    assert.equal(closed.careRelationship.state, 'closed');
    assert.equal(closed.careRelationship.closeReason, 'changed_provider');

    const reopened = await store.reopenCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
      actor: { userId: 'u1', role: 'operator' },
    });
    assert.equal(reopened.careRelationship.state, 'active');
    assert.equal(reopened.careRelationship.closeReason, null);
    assert.equal(reopened.careRelationship.closedAt, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('avliden kan INTE återöppnas (409)', async () => {
  const { store, dir } = await makeStore();
  try {
    const created = await store.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'avliden@example.com',
      displayName: 'Avliden Kund',
    });
    await store.closeCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
      closeReason: 'deceased',
      actor: { userId: 'u1', role: 'owner' },
    });
    await assert.rejects(
      () => store.reopenCareRelationship({ tenantId: 'hairtpclinic', patientId: created.id }),
      /Avliden kan inte återöppnas/
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
