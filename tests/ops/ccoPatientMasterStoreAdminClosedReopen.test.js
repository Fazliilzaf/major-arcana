const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-pm-ac-'));
  const store = await createCcoPatientMasterStore({ filePath: path.join(dir, 'patient-master.json') });
  return { store, dir };
}

// ORD-147 §2 — admin-stängning: stängs + blockeras, MEN går att ångra.
test('admin_closed är ångerbar: close → reopen', async () => {
  const { store, dir } = await makeStore();
  try {
    const created = await store.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'admin@example.com',
      displayName: 'Admin Stängd',
    });
    const closed = await store.closeCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
      closeReason: 'admin_closed',
      actor: { userId: 'u1', role: 'owner' },
      note: 'Manuell administrativ stängning.',
    });
    assert.equal(closed.careRelationship.state, 'closed');
    assert.equal(closed.careRelationship.closeReason, 'admin_closed');

    const reopened = await store.reopenCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
      actor: { userId: 'u1', role: 'owner' },
    });
    assert.equal(reopened.careRelationship.state, 'active');
    assert.equal(reopened.careRelationship.closeReason, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('återöppna en redan aktiv relation är idempotent', async () => {
  const { store, dir } = await makeStore();
  try {
    const created = await store.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'aktiv@example.com',
      displayName: 'Aktiv Kund',
    });
    const reopened = await store.reopenCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: created.id,
    });
    assert.equal(reopened.careRelationship.state, 'active');
    assert.equal(reopened.careRelationship.closeReason, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
