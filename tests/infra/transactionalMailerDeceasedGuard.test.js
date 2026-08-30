const test = require('node:test');
const assert = require('node:assert/strict');

const { createTransactionalMailer } = require('../../src/infra/transactionalMailer');
const { setDeceasedResolver } = require('../../src/ops/ccoDeceasedSendGuard');

// Chokepunkt 1: createTransactionalMailer.sendEmail (8 mejlanropare).
// MUTATION: ta bort `await assertNotDeceased(...)` i sendEmail → detta test blir rött.
test('transactionalMailer blockerar avliden mottagare', async () => {
  setDeceasedResolver(async ({ email }) => email === 'avliden@example.com');
  const mailer = createTransactionalMailer({ graphSendConnector: null });
  await assert.rejects(
    () => mailer.sendEmail({ to: 'avliden@example.com', subject: 'Uppföljning', text: 'Hej' }),
    (e) => e && e.code === 'SEND_BLOCKED'
  );
});

test('transactionalMailer skickar levande mottagare (mock)', async () => {
  setDeceasedResolver(async () => false);
  const mailer = createTransactionalMailer({ graphSendConnector: null });
  const result = await mailer.sendEmail({ to: 'levande@example.com', subject: 'x', text: 'x' });
  assert.equal(result.ok, true);
});
