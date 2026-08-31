'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOutreachMessage,
  sendPatientOutreach,
} = require('../../src/ops/ccoPatientOutreach');

test('buildOutreachMessage returns health declaration copy', () => {
  const message = buildOutreachMessage({
    outreachType: 'health_declaration',
    patientName: 'Anna',
    linkUrl: 'https://hairtpclinic.com/screen',
  });
  assert.match(message.subject, /hälsodeklaration/i);
  assert.match(message.text, /Anna/);
  assert.match(message.text, /screen/);
});

test('sendPatientOutreach requires patient email', async () => {
  await assert.rejects(
    () =>
      sendPatientOutreach({
        patient: { displayName: 'Anna' },
        outreachType: 'consent',
      }),
    /saknar e-post/
  );
});

test('ORD-153 §6: sendPatientOutreach → dry-run utan CCO_SEND_LIVE (inget skickas)', async () => {
  delete process.env.CCO_SEND_LIVE;
  const result = await sendPatientOutreach({
    patient: { displayName: 'Anna', primaryEmail: 'anna@example.com' },
    outreachType: 'consent',
    linkUrl: 'https://hairtpclinic.com/screen',
  });
  assert.equal(result.skipped, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.reason, 'send_gate_off');
  assert.equal(result.delivery.mode, 'dry-run');
});
