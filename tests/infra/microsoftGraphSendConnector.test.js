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
  assert.equal(response.sourceMailboxId, 'owner@hairtpclinic.se');
  assert.equal(response.replyToMessageId, 'msg-1');
  assert.equal(response.sendMode, 'reply');
});

test('MicrosoftGraphSendConnector falls back to sendMail when sender mailbox differs from source mailbox', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-send-2',
        },
      });
    }
    if (String(url).includes('/users/contact%40hairtpclinic.com/sendMail')) {
      return createJsonResponse({ status: 202, body: {} });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphSendConnector({
    tenantId: 'tenant-id-2',
    clientId: 'client-id-2',
    clientSecret: 'client-secret-2',
    fetchImpl,
  });

  const response = await connector.sendReply({
    mailboxId: 'contact@hairtpclinic.com',
    sourceMailboxId: 'owner@hairtpclinic.se',
    replyToMessageId: 'msg-2',
    body: 'Hej! Detta skickas fran contact.',
    bodyHtml: '<p>Hej! Detta skickas fran <strong>contact</strong>.</p>',
    subject: 'Re: Inkommande fraga',
    to: ['patient@example.com'],
  });

  assert.equal(calls.length, 2);
  assert.equal(String(calls[1].url).includes('/users/contact%40hairtpclinic.com/sendMail'), true);
  const payload = JSON.parse(String(calls[1].options?.body || '{}'));
  assert.equal(payload?.message?.subject, 'Re: Inkommande fraga');
  assert.equal(payload?.message?.body?.contentType, 'HTML');
  assert.equal(payload?.message?.body?.content.includes('<strong>contact</strong>'), true);
  assert.equal(payload?.message?.toRecipients?.[0]?.emailAddress?.address, 'patient@example.com');
  assert.equal(response.sendMode, 'send_mail');
  assert.equal(response.mailboxId, 'contact@hairtpclinic.com');
  assert.equal(response.sourceMailboxId, 'owner@hairtpclinic.se');
});
