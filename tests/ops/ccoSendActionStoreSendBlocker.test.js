const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoSendActionStore } = require('../../src/ops/ccoSendActionStore');

// Samma spärr-wiring som server.js gör: sendBlocker läser avlidna-status ur
// patient-mastern. Det här är orderns viktigaste rad (ORD-147 §3) och den enda
// punkten där ett grönt test utan mutationstest inte duger.
async function makeStores() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-send-block-'));
  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'patient-master.json'),
  });
  const sendActionStore = await createCcoSendActionStore({
    filePath: path.join(dir, 'send-actions.json'),
    sendBlocker: async ({ customerId, customerEmail }) => {
      const deceased = patientMasterStore.findDeceasedByEmailOrId({
        customerId,
        email: customerEmail,
      });
      return deceased
        ? { blocked: true, reason: 'Mottagaren är registrerad som avliden — utskick blockerat.' }
        : null;
    },
  });
  return { patientMasterStore, sendActionStore, dir };
}

// MUTATIONSTEST (ORD-147 §3 Godkänt 3): ta bort sendBlocker-kontrollen i
// ccoSendActionStore.performSend, och det här testet blir rött — performSend
// slutar kasta och registrerar i stället ett utskick till den avlidna.
test('avliden mottagare blockeras vid sändgränsen (SEND_BLOCKED)', async () => {
  const { patientMasterStore, sendActionStore, dir } = await makeStores();
  try {
    const patient = await patientMasterStore.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'avliden@example.com',
      displayName: 'Avliden Person',
    });
    await patientMasterStore.closeCareRelationship({
      tenantId: 'hairtpclinic',
      patientId: patient.id,
      closeReason: 'deceased',
      actor: { userId: 'owner-1', role: 'owner' },
    });

    await assert.rejects(
      () =>
        sendActionStore.performSend({
          kind: 'aftercare',
          payload: { to: 'avliden@example.com', subject: 'Uppföljning', text: 'Hej' },
          customerId: patient.id,
        }),
      (err) => err && err.code === 'SEND_BLOCKED',
      'ett utskick till en avliden mottagare ska kasta SEND_BLOCKED'
    );

    // Ingenting registrerades som skickat.
    assert.equal(sendActionStore.listSends({ customerId: patient.id }).length, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('levande mottagare skickas normalt', async () => {
  const { patientMasterStore, sendActionStore, dir } = await makeStores();
  try {
    const patient = await patientMasterStore.upsertPatient({
      tenantId: 'hairtpclinic',
      primaryEmail: 'levande@example.com',
      displayName: 'Levande Person',
    });
    const result = await sendActionStore.performSend({
      kind: 'aftercare',
      payload: { to: 'levande@example.com', subject: 'Uppföljning', text: 'Hej' },
      customerId: patient.id,
    });
    assert.equal(result.ok, true);
    assert.notEqual(result.status, 'failed');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
