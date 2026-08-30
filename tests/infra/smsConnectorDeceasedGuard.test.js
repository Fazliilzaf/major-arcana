const test = require('node:test');
const assert = require('node:assert/strict');

const { sendSms } = require('../../src/sms/smsConnector');
const { setDeceasedResolver } = require('../../src/ops/ccoDeceasedSendGuard');

// Chokepunkt 2: sendSms (6 SMS-anropare, patient + personal + drift).
// MUTATION: ta bort `await assertNotDeceased(...)` i sendSms → detta test blir rött.
test('sendSms blockerar avliden mottagares telefon', async () => {
  setDeceasedResolver(async ({ phone }) => phone === '+46700000001');
  await assert.rejects(
    () => sendSms({ to: '+46700000001', message: 'Påminnelse' }),
    (e) => e && e.code === 'SEND_BLOCKED'
  );
});

test('sendSms skickar levande mottagare (mock/ej konfigurerad)', async () => {
  setDeceasedResolver(async () => false);
  const result = await sendSms({ to: '+46700000002', message: 'Hej' });
  // Ingen SMS-provider i testmiljö → ok:false med sms_not_configured, men INTE blockerad.
  assert.notEqual(result.error, 'SEND_BLOCKED');
});
