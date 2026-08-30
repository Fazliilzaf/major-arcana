const test = require('node:test');
const assert = require('node:assert/strict');

const { setDeceasedResolver, assertNotDeceased } = require('../../src/ops/ccoDeceasedSendGuard');

test('blockerar avliden mottagare med SEND_BLOCKED', async () => {
  setDeceasedResolver(async ({ email }) => email === 'avliden@example.com');
  await assert.rejects(
    () => assertNotDeceased({ email: 'avliden@example.com' }),
    (e) => e && e.code === 'SEND_BLOCKED'
  );
  // Levande mottagare passerar utan kast.
  await assertNotDeceased({ email: 'levande@example.com' });
});

test('nycklar på telefon (SMS-vägen)', async () => {
  setDeceasedResolver(async ({ phone }) => phone === '+46700000001');
  await assert.rejects(
    () => assertNotDeceased({ phone: '+46700000001' }),
    (e) => e && e.code === 'SEND_BLOCKED'
  );
  await assertNotDeceased({ phone: '+46700000002' });
});

test('FAIL-CLOSED: kastande uppslag blockerar, släpper aldrig igenom', async () => {
  setDeceasedResolver(async () => {
    throw new Error('patient-master timeout');
  });
  await assert.rejects(
    () => assertNotDeceased({ email: 'x@example.com' }),
    (e) => e && e.code === 'SEND_GUARD_FAILED_CLOSED'
  );
});
