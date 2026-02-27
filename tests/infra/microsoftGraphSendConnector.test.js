const test = require('node:test');
const assert = require('node:assert/strict');

const { createMicrosoftGraphSendConnector } = require('../../src/infra/microsoftGraphSendConnector');

function createJsonResponse({ status = 200, body = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get() {
        return null;
      },
    },
    async json() {
      return body;
    },
  };
}

test('MicrosoftGraphSendConnector performs token + reply request', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-send-1',
        },
      });
    }
    if (String(url).includes('/messages/msg-1/reply')) {
      return createJsonResponse({ status: 202, body: {} });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphSendConnector({
    tenantId: 'tenant-id-1',
    clientId: 'client-id-1',
    clientSecret: 'client-secret-1',
    fetchImpl,
  });

  const response = await connector.sendReply({
    mailboxId: 'owner@hairtpclinic.se',
    replyToMessageId: 'msg-1',
    body: 'Hej! Uppfoljning fran kliniken.',
    subject: 'Re: Uppfoljning',
    to: ['patient@example.com'],
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(String(calls[1].url).includes('/users/owner%40hairtpclinic.se/messages/msg-1/reply'), true);
  assert.equal(response.provider, 'microsoft_graph');
  assert.equal(response.mailboxId, 'owner@hairtpclinic.se');
  assert.equal(response.replyToMessageId, 'msg-1');
});
