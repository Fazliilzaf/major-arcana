const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoAftercareSchedulerStore } = require('../../src/ops/ccoAftercareSchedulerStore');

test('cancelFollowUpsForCustomer stänger bara kundens framtida jobb, raderar inget', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-af-cust-'));
  const closedEntries = [];
  const journalStore = {
    upsertEntry: async (input) => ({ entryId: input?.entryId || 'draft-default' }),
    closeEntry: async ({ patientId, entryId, reason }) => {
      closedEntries.push({ patientId, entryId, reason });
      return { closedAt: new Date().toISOString() };
    },
  };
  const scheduler = await createCcoAftercareSchedulerStore({
    filePath: path.join(dir, 'jobs.json'),
    treatmentRequirements: {
      treatments: { tp: { aftercareTemplate: 'aftercare_tp', followupCadence: ['4m'] } },
    },
    journalStore,
  });

  try {
    await scheduler.scheduleForCompletedEncounter({
      tenantId: 'hairtpclinic',
      customerId: 'cust-a',
      encounterId: 'enc-a',
      treatmentKey: 'tp',
      completedAt: new Date().toISOString(),
      customerName: 'A',
      customerEmail: 'a@example.com',
    });
    await scheduler.scheduleForCompletedEncounter({
      tenantId: 'hairtpclinic',
      customerId: 'cust-b',
      encounterId: 'enc-b',
      treatmentKey: 'tp',
      completedAt: new Date().toISOString(),
      customerName: 'B',
      customerEmail: 'b@example.com',
    });

    const before = scheduler.stats().total;
    const outcome = await scheduler.cancelFollowUpsForCustomer({
      tenantId: 'hairtpclinic',
      customerId: 'cust-a',
      reason: 'patient_deceased',
      actor: { role: 'owner' },
    });

    assert.ok(outcome.cancelled >= 1, 'cust-a:s köade jobb avbryts');
    assert.ok(outcome.closedDrafts >= 1, 'cust-a:s uppföljningsutkast stängs via closeEntry');

    const after = scheduler.stats().total;
    assert.equal(after, before, 'inget raderas — antalet jobb oförändrat');

    const aJobs = scheduler.listJobs({ customerId: 'cust-a' });
    const bJobs = scheduler.listJobs({ customerId: 'cust-b' });
    assert.ok(aJobs.length > 0);
    assert.ok(aJobs.every((j) => j.status === 'cancelled'), 'alla cust-a jobb avbrutna');
    assert.ok(bJobs.every((j) => j.status === 'queued'), 'cust-b orörda');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('cancelFollowUpsForCustomer utan customerId är en no-op med tydlig orsak', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-af-cust-empty-'));
  const scheduler = await createCcoAftercareSchedulerStore({
    filePath: path.join(dir, 'jobs.json'),
  });
  try {
    const outcome = await scheduler.cancelFollowUpsForCustomer({ tenantId: 'hairtpclinic' });
    assert.equal(outcome.cancelled, 0);
    assert.match(outcome.reason, /customerId/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
