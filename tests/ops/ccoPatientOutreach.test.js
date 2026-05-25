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
