'use strict';

/* B1 — sendMail-shim ovanpå microsoftGraphSendConnector. Mappar draft-routerns
 * payload till connectorns sendNewMessage, avvisar bilagor, och exponerar
 * supportsAttachments=false. Ingen riktig Graph. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCcoGraphSendAdapter } = require('../../src/infra/ccoGraphSendAdapter');

function fakeConnector() {
  const calls = [];
  return {
    calls,
    sendNewMessage: async (args) => {
      calls.push(args);
      return { provider: 'microsoft_graph', sentAt: '2026-07-07T00:00:00.000Z' };
    },
  };
}

test('kräver en connector med sendNewMessage', () => {
  assert.throws(() => createCcoGraphSendAdapter(null));
  assert.throws(() => createCcoGraphSendAdapter({}));
});

test('sendMail mappar from→mailbox, to→[to], subject/body till connectorn', async () => {
  const connector = fakeConnector();
  const adapter = createCcoGraphSendAdapter(connector);
  assert.equal(adapter.supportsAttachments, false);
  const res = await adapter.sendMail({
    from: 'kons@hairtp.se',
    to: 'anna@mail.se',
    subject: 'Hej',
    body: 'Text',
    attachments: [],
  });
  assert.equal(connector.calls.length, 1);
  assert.deepEqual(connector.calls[0], {
    mailboxId: 'kons@hairtp.se',
    sourceMailboxId: 'kons@hairtp.se',
    to: ['anna@mail.se'],
    subject: 'Hej',
    body: 'Text',
  });
  // Graph 202 utan body → inget message-id.
  assert.equal(res.messageId, null);
  assert.equal(res.sentAt, '2026-07-07T00:00:00.000Z');
});

test('avvisar bilagor (kastar) och anropar ALDRIG connectorn', async () => {
  const connector = fakeConnector();
  const adapter = createCcoGraphSendAdapter(connector);
  await assert.rejects(
    () =>
      adapter.sendMail({
        from: 'kons@hairtp.se',
        to: 'anna@mail.se',
        subject: 'Hej',
        body: 'Text',
        attachments: [{ name: 'preop.pdf' }],
      }),
    (e) => e.code === 'attachments_not_supported'
  );
  assert.equal(connector.calls.length, 0);
});
