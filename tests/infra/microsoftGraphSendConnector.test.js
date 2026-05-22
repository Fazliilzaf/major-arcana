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

test('MicrosoftGraphSendConnector performs token + createReply/update/send flow for in-thread replies', async () => {
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
    if (String(url).includes('/messages/msg-1/createReply')) {
      return createJsonResponse({ status: 201, body: { id: 'draft-msg-1' } });
    }
    if (String(url).includes('/messages/draft-msg-1/send')) {
      return createJsonResponse({ status: 202, body: {} });
    }
    if (String(url).includes('/messages/draft-msg-1')) {
      return createJsonResponse({ status: 200, body: {} });
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

  assert.equal(calls.length, 4);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(String(calls[1].url).includes('/users/owner%40hairtpclinic.se/messages/msg-1/createReply'), true);
  assert.equal(calls[2].options.method, 'PATCH');
  const patchPayload = JSON.parse(String(calls[2].options?.body || '{}'));
  assert.equal(patchPayload?.body?.contentType, 'HTML');
  assert.equal(String(patchPayload?.body?.content || '').includes('Hej! Uppfoljning fran kliniken.'), true);
  assert.equal(String(calls[3].url).includes('/users/owner%40hairtpclinic.se/messages/draft-msg-1/send'), true);
  assert.equal(response.provider, 'microsoft_graph');
  assert.equal(response.mailboxId, 'owner@hairtpclinic.se');
  assert.equal(response.sourceMailboxId, 'owner@hairtpclinic.se');
  assert.equal(response.replyToMessageId, 'msg-1');
  assert.equal(response.sendMode, 'reply_draft');
});

test('MicrosoftGraphSendConnector allows in-thread reply without explicit recipients', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-send-1b',
        },
      });
    }
    if (String(url).includes('/messages/msg-1b/createReply')) {
      return createJsonResponse({ status: 201, body: { id: 'draft-msg-1b' } });
    }
    if (String(url).includes('/messages/draft-msg-1b/send')) {
      return createJsonResponse({ status: 202, body: {} });
    }
    if (String(url).includes('/messages/draft-msg-1b')) {
      return createJsonResponse({ status: 200, body: {} });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphSendConnector({
    tenantId: 'tenant-id-1b',
    clientId: 'client-id-1b',
    clientSecret: 'client-secret-1b',
    fetchImpl,
  });

  const response = await connector.sendReply({
    mailboxId: 'kons@hairtpclinic.com',
    sourceMailboxId: 'kons@hairtpclinic.com',
    replyToMessageId: 'msg-1b',
    body: 'Hej! Vi svarar i samma trad utan manuell mottagarlista.',
    subject: 'Re: Konsultation',
  });

  assert.equal(calls.length, 4);
  assert.equal(String(calls[1].url).includes('/users/kons%40hairtpclinic.com/messages/msg-1b/createReply'), true);
  const patchPayload = JSON.parse(String(calls[2].options?.body || '{}'));
  assert.equal(patchPayload?.body?.contentType, 'HTML');
  assert.equal(String(calls[3].url).includes('/users/kons%40hairtpclinic.com/messages/draft-msg-1b/send'), true);
  assert.equal(response.sendMode, 'reply_draft');
  assert.deepEqual(response.to, []);
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

test('MicrosoftGraphSendConnector sends a brand new message via sendMail', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-send-compose-1',
        },
      });
    }
    if (String(url).includes('/users/contact%40hairtpclinic.com/sendMail')) {
      return createJsonResponse({ status: 202, body: {} });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphSendConnector({
    tenantId: 'tenant-id-compose-1',
    clientId: 'client-id-compose-1',
    clientSecret: 'client-secret-compose-1',
    fetchImpl,
  });

  const response = await connector.sendNewMessage({
    mailboxId: 'contact@hairtpclinic.com',
    sourceMailboxId: 'kons@hairtpclinic.com',
    body: 'Hej! Detta är ett nytt mejl från nya CCO.',
    subject: 'Ny kontakt från kliniken',
    to: ['patient@example.com'],
  });

  assert.equal(calls.length, 2);
  assert.equal(String(calls[1].url).includes('/users/contact%40hairtpclinic.com/sendMail'), true);
  const payload = JSON.parse(String(calls[1].options?.body || '{}'));
  assert.equal(payload?.message?.subject, 'Ny kontakt från kliniken');
  assert.equal(payload?.message?.toRecipients?.[0]?.emailAddress?.address, 'patient@example.com');
  assert.equal(response.sendMode, 'send_mail');
  assert.equal(response.replyToMessageId, null);
  assert.equal(response.sourceMailboxId, 'kons@hairtpclinic.com');
});

test('MicrosoftGraphSendConnector sends canonical compose documents with cc and bcc support', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-send-compose-document-1',
        },
      });
    }
    if (String(url).includes('/users/contact%40hairtpclinic.com/sendMail')) {
      return createJsonResponse({ status: 202, body: {} });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphSendConnector({
    tenantId: 'tenant-id-compose-document-1',
    clientId: 'client-id-compose-document-1',
    clientSecret: 'client-secret-compose-document-1',
    fetchImpl,
  });

  const response = await connector.sendComposeDocument({
    composeDocument: {
      version: 'phase_5',
      kind: 'mail_compose_document',
      mode: 'compose',
      sourceMailboxId: 'kons@hairtpclinic.com',
      senderMailboxId: 'contact@hairtpclinic.com',
      recipients: {
        to: ['patient@example.com'],
        cc: ['manager@example.com'],
        bcc: ['audit@example.com'],
      },
      subject: 'Uppföljning från CCO',
      content: {
        bodyText: 'Hej! Detta skickas från canonical compose document.',
        bodyHtml: '<p>Hej! Detta skickas från <strong>canonical compose document</strong>.</p>',
      },
      delivery: {
        sendStrategy: 'send_mail',
      },
    },
  });

  assert.equal(calls.length, 2);
  const payload = JSON.parse(String(calls[1].options?.body || '{}'));
  assert.equal(payload?.message?.toRecipients?.[0]?.emailAddress?.address, 'patient@example.com');
  assert.equal(payload?.message?.ccRecipients?.[0]?.emailAddress?.address, 'manager@example.com');
  assert.equal(payload?.message?.bccRecipients?.[0]?.emailAddress?.address, 'audit@example.com');
  assert.equal(
    String(payload?.message?.body?.content || '').includes('canonical compose document'),
    true
  );
  assert.equal(response.sendMode, 'send_mail');
  assert.equal(response.composeDocumentVersion, 'phase_5');
  assert.deepEqual(response.cc, ['manager@example.com']);
  assert.deepEqual(response.bcc, ['audit@example.com']);
});

test('MicrosoftGraphSendConnector moves message to Deleted Items for safe delete', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-delete-1',
        },
      });
    }
    if (
      String(url).includes(
        '/users/contact%40hairtpclinic.com/messages/msg-delete-1/move'
      )
    ) {
      return createJsonResponse({
        status: 201,
        body: {
          id: 'msg-delete-1-moved',
          conversationId: 'conv-delete-1',
          parentFolderId: 'deleteditems',
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphSendConnector({
    tenantId: 'tenant-id-delete-1',
    clientId: 'client-id-delete-1',
    clientSecret: 'client-secret-delete-1',
    fetchImpl,
  });

  const response = await connector.moveMessageToDeletedItems({
    mailboxId: 'contact@hairtpclinic.com',
    messageId: 'msg-delete-1',
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(
    String(calls[1].url).includes(
      '/users/contact%40hairtpclinic.com/messages/msg-delete-1/move'
    ),
    true
  );
  const payload = JSON.parse(String(calls[1].options?.body || '{}'));
  assert.equal(payload.destinationId, 'deleteditems');
  assert.equal(response.provider, 'microsoft_graph');
  assert.equal(response.mailboxId, 'contact@hairtpclinic.com');
  assert.equal(response.messageId, 'msg-delete-1');
  assert.equal(response.movedMessageId, 'msg-delete-1-moved');
  assert.equal(response.deleteMode, 'soft_delete');
});
