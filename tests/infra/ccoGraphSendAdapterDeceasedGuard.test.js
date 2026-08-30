const test = require('node:test');
const assert = require('node:assert/strict');

const { createCcoGraphSendAdapter } = require('../../src/infra/ccoGraphSendAdapter');
const { setDeceasedResolver } = require('../../src/ops/ccoDeceasedSendGuard');

// Chokepunkt 3: createCcoGraphSendAdapter.sendMail (ccoComposeSend graph + ccoCommDraft).
// MUTATION: ta bort `await assertNotDeceased(...)` i sendMail → detta test blir rött.
test('graphSendAdapter blockerar avliden mottagare', async () => {
  setDeceasedResolver(async ({ email }) => email === 'avliden@example.com');
  const connector = { sendNewMessage: async () => ({ sentAt: 'now' }) };
  const adapter = createCcoGraphSendAdapter(connector);
  await assert.rejects(
    () => adapter.sendMail({ from: 'kons@hairtpclinic.com', to: 'avliden@example.com', subject: 'x', body: 'x' }),
    (e) => e && e.code === 'SEND_BLOCKED'
  );
});

test('graphSendAdapter skickar levande mottagare', async () => {
  setDeceasedResolver(async () => false);
  const connector = { sendNewMessage: async () => ({ sentAt: 'now' }) };
  const adapter = createCcoGraphSendAdapter(connector);
  const result = await adapter.sendMail({
    from: 'kons@hairtpclinic.com',
    to: 'levande@example.com',
    subject: 'x',
    body: 'x',
  });
  assert.equal(result.provider, 'microsoft_graph');
});
