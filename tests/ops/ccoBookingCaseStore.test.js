const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBookingCaseStore } = require('../../src/ops/ccoBookingCaseStore');

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-case-'));
  return path.join(dir, 'cco-booking-cases.json');
}

test('cco booking case store: create → get → list → stats', async () => {
  const filePath = await tmpFile();
  const store = await createCcoBookingCaseStore({ filePath });

  const created = await store.createCase(
    {
      tenantId: 'hairtp-clinic',
      patientId: 'patient-1',
      customerName: 'Anna Karlsson',
      serviceId: 'fue-2000',
      assignedTo: 'owner-a',
    },
    { role: 'owner', userId: 'owner-a' }
  );

  assert.ok(created.id, 'case ska ha ett id');
  assert.equal(created.state, 'new');
  assert.equal(created.tenantId, 'hairtp-clinic');

  const fetched = await store.getCase(created.id);
  assert.equal(fetched.id, created.id);
  assert.equal(fetched.patientId, 'patient-1');

  assert.equal(await store.getCase('nonexistent'), null);

  const list = await store.listCases({ tenantId: 'hairtp-clinic' });
  assert.equal(list.length, 1);

  const filtered = await store.listCases({ tenantId: 'hairtp-clinic', state: 'confirmed' });
  assert.equal(filtered.length, 0);

  const byAssignee = await store.listCases({ tenantId: 'hairtp-clinic', assignedTo: 'owner-a' });
  assert.equal(byAssignee.length, 1);

  const s = store.stats();
  assert.equal(s.total, 1);
  assert.equal(s.byState.new, 1);
  assert.equal(s.byState.confirmed, 0);
});

test('cco booking case store: state transition and candidate + handoff flow', async () => {
  const filePath = await tmpFile();
  const store = await createCcoBookingCaseStore({ filePath });

  const c = await store.createCase({ tenantId: 't1', patientId: 'p1' }, { role: 'owner' });

  const withCandidate = await store.proposeCandidate(
    c.id,
    { startsAt: '2026-07-01T09:00:00.000Z', resourceLabel: 'Rum 1' },
    { role: 'owner' }
  );
  assert.equal(withCandidate.candidates.length, 1);

  const proposed = await store.transitionState(c.id, 'proposed', { role: 'owner' }, {});
  assert.equal(proposed.state, 'proposed');

  const confirmed = await store.transitionState(
    c.id,
    'confirmed',
    { role: 'owner' },
    { startsAt: '2026-07-01T09:00:00.000Z' }
  );
  assert.equal(confirmed.state, 'confirmed');
  assert.equal(confirmed.startsAt, '2026-07-01T09:00:00.000Z');
  assert.ok(confirmed.history.some((h) => h.action === 'transition' && h.toState === 'confirmed'));

  // Otillåten övergång ska kasta.
  await assert.rejects(
    () => store.transitionState(c.id, 'new', { role: 'owner' }, {}),
    /Otillåten övergång/
  );

  // Handoff complete ska blockeras tills checklistan är klar.
  await store.transitionState(c.id, 'handoff', { role: 'owner' }, {});
  await assert.rejects(
    () => store.attemptHandoffComplete(c.id, { role: 'owner' }),
    /Handoff ej klar/
  );

  await store.updateHandoffChecklist(
    c.id,
    { journalReady: true, consentSigned: true, paymentSettled: true, encounterLinked: true },
    { role: 'owner' }
  );

  const done = await store.attemptHandoffComplete(c.id, { role: 'owner' });
  assert.equal(done.state, 'completed');
  assert.ok(done.handoffCompletedAt);
});

test('cco booking case store: persistence across a new instance', async () => {
  const filePath = await tmpFile();
  const store = await createCcoBookingCaseStore({ filePath });
  const created = await store.createCase({ tenantId: 't1', patientId: 'p1' }, { role: 'owner' });
  await store.transitionState(created.id, 'qualifying', { role: 'owner' }, {});

  const reopened = await createCcoBookingCaseStore({ filePath });
  const fetched = await reopened.getCase(created.id);
  assert.ok(fetched, 'case ska finnas efter omladdning');
  assert.equal(fetched.state, 'qualifying');
  assert.equal(fetched.patientId, 'p1');

  const s = reopened.stats();
  assert.equal(s.total, 1);
  assert.equal(s.byState.qualifying, 1);
});

test('cco booking case store: auditLog hook anropas', async () => {
  const filePath = await tmpFile();
  const events = [];
  const auditLog = { append: (e) => events.push(e) };
  const store = await createCcoBookingCaseStore({ filePath, auditLog });

  const c = await store.createCase({ tenantId: 't1' }, { role: 'owner', userId: 'u1' });
  await store.transitionState(c.id, 'qualifying', { role: 'owner', userId: 'u1' }, {});

  assert.ok(events.length >= 2);
  const created = events.find((e) => e.action === 'cco.booking_case.created');
  assert.ok(created);
  assert.equal(created.target.kind, 'booking_case');
  assert.equal(created.actor.role, 'owner');
});
