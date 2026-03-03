const test = require('node:test');
const assert = require('node:assert/strict');

const { createMicrosoftGraphReadConnector } = require('../../src/infra/microsoftGraphReadConnector');

function createJsonResponse({ status = 200, body = {}, headers = {} } = {}) {
  const normalizedHeaders = headers && typeof headers === 'object' ? headers : {};
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name = '') {
        const key = String(name || '').toLowerCase();
        if (!key) return null;
        const direct = normalizedHeaders[key];
        if (direct !== undefined && direct !== null) return String(direct);
        const pair = Object.entries(normalizedHeaders).find(
          ([entryKey]) => String(entryKey || '').toLowerCase() === key
        );
        if (!pair) return null;
        return String(pair[1] ?? '');
      },
    },
    async json() {
      return body;
    },
  };
}

test('MicrosoftGraphReadConnector fetches 14-day inbox snapshot using read-only graph request', async () => {
  const fixedNowMs = Date.parse('2026-02-26T18:00:00.000Z');
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-abc',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-1',
              conversationId: 'conv-1',
              subject: 'Akut fraga efter behandling',
              bodyPreview:
                'Kontakta mig pa 0701234567 eller patient@example.com. Se https://example.com.',
              receivedDateTime: '2026-02-26T16:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-1',
    clientId: 'client-id-1',
    clientSecret: 'client-secret-1',
    userId: 'mailbox@hairtpclinic.se',
    fetchImpl,
    now: () => fixedNowMs,
  });

  const snapshot = await connector.fetchInboxSnapshot();

  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((item) => item.options?.method),
    ['POST', 'GET', 'GET']
  );

  const tokenRequest = calls[0];
  assert.equal(
    tokenRequest.url.includes('https://login.microsoftonline.com/tenant-id-1/oauth2/v2.0/token'),
    true
  );
  const tokenBody = new URLSearchParams(String(tokenRequest.options?.body || ''));
  assert.equal(tokenBody.get('grant_type'), 'client_credentials');
  assert.equal(tokenBody.get('scope'), 'https://graph.microsoft.com/.default');
  assert.equal(tokenBody.get('client_id'), 'client-id-1');
  assert.equal(tokenBody.get('client_secret'), 'client-secret-1');

  const inboxRequest = calls.find((item) =>
    String(item.url).includes('/mailFolders/inbox/messages')
  );
  const sentRequest = calls.find((item) =>
    String(item.url).includes('/mailFolders/SentItems/messages')
  );
  assert.equal(Boolean(inboxRequest), true);
  assert.equal(Boolean(sentRequest), true);
  const inboxUrl = new URL(inboxRequest.url);
  assert.equal(inboxUrl.searchParams.get('$top'), '50');
  assert.equal(inboxUrl.searchParams.get('$orderby'), 'receivedDateTime desc');
  assert.equal(
    inboxUrl.searchParams.get('$filter'),
    'receivedDateTime ge 2026-02-12T18:00:00.000Z and isRead eq false'
  );
  assert.equal(
    String(inboxRequest.options?.headers?.authorization || '').startsWith('Bearer '),
    true
  );

  assert.equal(snapshot.snapshotVersion, 'graph.inbox.snapshot.v2');
  assert.equal(snapshot.source, 'microsoft-graph');
  assert.equal(snapshot.timestamps.capturedAt, '2026-02-26T18:00:00.000Z');
  assert.equal(snapshot.metadata.windowDays, 14);
  assert.equal(snapshot.metadata.fetchedMessages, 1);
  assert.equal(snapshot.metadata.inboundMessageCount, 1);
  assert.equal(snapshot.metadata.outboundMessageCount, 0);
  assert.equal(snapshot.conversations.length, 1);

  const conversation = snapshot.conversations[0];
  assert.equal(conversation.conversationId, 'conv-1');
  assert.equal(conversation.status, 'open');
  assert.equal(conversation.messages.length, 1);
  const bodyPreview = String(conversation.messages[0].bodyPreview);
  assert.equal(bodyPreview.includes('[telefon]'), true);
  assert.equal(bodyPreview.includes('[email]'), true);
  assert.equal(bodyPreview.includes('[lank]'), true);
  assert.equal(bodyPreview.includes('0701234567'), false);
  assert.equal(bodyPreview.includes('patient@example.com'), false);
  assert.equal(bodyPreview.includes('https://example.com'), false);
  assert.equal(Array.isArray(conversation.riskWords), true);
  assert.equal(conversation.riskWords.includes('akut'), true);
});

test('MicrosoftGraphReadConnector supports custom window and includeRead=true filter', async () => {
  const fixedNowMs = Date.parse('2026-02-26T18:00:00.000Z');
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-xyz',
        },
      });
    }
    return createJsonResponse({
      body: {
        value: [],
      },
    });
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-2',
    clientId: 'client-id-2',
    clientSecret: 'client-secret-2',
    userId: 'mailbox@hairtpclinic.se',
    fetchImpl,
    now: () => fixedNowMs,
  });

  const snapshot = await connector.fetchInboxSnapshot({
    days: 7,
    maxMessages: 5,
    includeRead: true,
  });

  const inboxCall = calls.find((item) => String(item.url).includes('/mailFolders/inbox/messages'));
  const sentCall = calls.find((item) => String(item.url).includes('/mailFolders/SentItems/messages'));
  const inboxUrl = new URL(inboxCall.url);
  const sentUrl = new URL(sentCall.url);
  assert.equal(inboxUrl.searchParams.get('$top'), '3');
  assert.equal(sentUrl.searchParams.get('$top'), '2');
  assert.equal(inboxUrl.searchParams.get('$filter'), 'receivedDateTime ge 2026-02-19T18:00:00.000Z');
  assert.equal(snapshot.metadata.windowDays, 7);
  assert.equal(snapshot.metadata.maxMessages, 5);
  assert.equal(snapshot.metadata.includeReadMessages, true);
});

test('MicrosoftGraphReadConnector omits unsupported inReplyTo/references select fields', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-select-fields',
        },
      });
    }
    return createJsonResponse({
      body: {
        value: [],
      },
    });
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-select',
    clientId: 'client-id-select',
    clientSecret: 'client-secret-select',
    userId: 'mailbox@hairtpclinic.se',
    fetchImpl,
  });

  await connector.fetchInboxSnapshot({
    includeRead: true,
  });

  const inboxRequest = calls.find((item) => String(item.url).includes('/mailFolders/inbox/messages'));
  const sentRequest = calls.find((item) => String(item.url).includes('/mailFolders/SentItems/messages'));
  assert.equal(Boolean(inboxRequest), true);
  assert.equal(Boolean(sentRequest), true);

  const inboxSelect = new URL(String(inboxRequest.url)).searchParams.get('$select') || '';
  const sentSelect = new URL(String(sentRequest.url)).searchParams.get('$select') || '';
  assert.equal(inboxSelect.includes('inReplyTo'), false);
  assert.equal(inboxSelect.includes('references'), false);
  assert.equal(sentSelect.includes('inReplyTo'), false);
  assert.equal(sentSelect.includes('references'), false);
  assert.equal(inboxSelect.includes('internetMessageHeaders'), true);
  assert.equal(sentSelect.includes('internetMessageHeaders'), true);
});

test('MicrosoftGraphReadConnector merges inbox + sent items and marks lastOutboundAt', async () => {
  const fixedNowMs = Date.parse('2026-02-26T18:00:00.000Z');
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-merge',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-in-1',
              conversationId: 'conv-merge-1',
              subject: 'Bokning konsultation',
              bodyPreview: 'Hej, jag vill boka en tid.',
              receivedDateTime: '2026-02-26T13:00:00.000Z',
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-out-1',
              conversationId: 'conv-merge-1',
              subject: 'Re: Bokning konsultation',
              bodyPreview: 'Hej! Vi kan erbjuda tider imorgon.',
              sentDateTime: '2026-02-26T14:00:00.000Z',
              from: {
                emailAddress: {
                  address: 'info@hairtpclinic.com',
                  name: 'Hair TP Clinic',
                },
              },
              toRecipients: [{ emailAddress: { address: 'patient@example.com' } }],
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-merge',
    clientId: 'client-id-merge',
    clientSecret: 'client-secret-merge',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
    now: () => fixedNowMs,
  });

  const snapshot = await connector.fetchInboxSnapshot();
  assert.equal(snapshot.conversations.length, 1);
  const conversation = snapshot.conversations[0];
  assert.equal(conversation.conversationId, 'conv-merge-1');
  assert.equal(conversation.lastInboundAt, '2026-02-26T13:00:00.000Z');
  assert.equal(conversation.lastOutboundAt, '2026-02-26T14:00:00.000Z');
  assert.equal(conversation.messages.length, 2);
  const directions = conversation.messages.map((item) => item.direction);
  assert.equal(directions.includes('inbound'), true);
  assert.equal(directions.includes('outbound'), true);
});

test('MicrosoftGraphReadConnector falls back to subject + customer correlation when conversationId differs', async () => {
  const fixedNowMs = Date.parse('2026-02-26T18:00:00.000Z');
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-fallback',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-fallback-in',
              conversationId: 'conv-a',
              subject: 'Bokning konsultation',
              bodyPreview: 'Hej, finns tider nästa vecka?',
              receivedDateTime: '2026-02-26T12:00:00.000Z',
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-fallback-out',
              conversationId: 'conv-b',
              subject: 'Re: Bokning konsultation',
              bodyPreview: 'Hej! Vi har tider på tisdag och torsdag.',
              sentDateTime: '2026-02-26T12:30:00.000Z',
              from: {
                emailAddress: {
                  address: 'info@hairtpclinic.com',
                  name: 'Hair TP Clinic',
                },
              },
              toRecipients: [{ emailAddress: { address: 'patient@example.com' } }],
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-fallback',
    clientId: 'client-id-fallback',
    clientSecret: 'client-secret-fallback',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
    now: () => fixedNowMs,
  });

  const snapshot = await connector.fetchInboxSnapshot();
  assert.equal(snapshot.conversations.length, 1);
  const conversation = snapshot.conversations[0];
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.lastOutboundAt, '2026-02-26T12:30:00.000Z');
});

test('MicrosoftGraphReadConnector merges by replyTo alias when sender alias differs across threads', async () => {
  const fixedNowMs = Date.parse('2026-02-26T18:00:00.000Z');
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-replyto-fallback',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-alias-in',
              conversationId: 'conv-reply-a',
              subject: 'Bokning konsultation',
              bodyPreview: 'Hej, kan jag boka en tid?',
              receivedDateTime: '2026-02-26T10:00:00.000Z',
              from: {
                emailAddress: {
                  address: 'noreply+thread@hairtpclinic.se',
                  name: 'Patient Alias',
                },
              },
              replyTo: [{ emailAddress: { address: 'patient@hairtpclinic.se' } }],
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-alias-out',
              conversationId: 'conv-reply-b',
              subject: 'SV: Bokning konsultation',
              bodyPreview: 'Vi har lediga tider pa torsdag.',
              sentDateTime: '2026-02-26T10:30:00.000Z',
              from: {
                emailAddress: {
                  address: 'info@hairtpclinic.com',
                },
              },
              toRecipients: [{ emailAddress: { address: 'patient@hairtpclinic.com' } }],
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-replyto-fallback',
    clientId: 'client-id-replyto-fallback',
    clientSecret: 'client-secret-replyto-fallback',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
    now: () => fixedNowMs,
  });

  const snapshot = await connector.fetchInboxSnapshot();
  assert.equal(snapshot.conversations.length, 1);
  const conversation = snapshot.conversations[0];
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.lastOutboundAt, '2026-02-26T10:30:00.000Z');
});

test('MicrosoftGraphReadConnector merges typo alias via fuzzy email + fuzzy subject fallback', async () => {
  const fixedNowMs = Date.parse('2026-02-26T18:00:00.000Z');
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-fuzzy-alias',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-fuzzy-in',
              conversationId: 'conv-fuzzy-a',
              subject: 'Bokning konsultation',
              bodyPreview: 'Hej, kan jag boka en tid?',
              receivedDateTime: '2026-02-26T10:00:00.000Z',
              from: {
                emailAddress: {
                  address: 'patinet@hairtpclinic.se',
                  name: 'Patient Typo',
                },
              },
              replyTo: [{ emailAddress: { address: 'patinet@hairtpclinic.se' } }],
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-fuzzy-out',
              conversationId: 'conv-fuzzy-b',
              subject: 'SV: Boknng konsultation',
              bodyPreview: 'Vi har lediga tider pa torsdag.',
              sentDateTime: '2026-02-26T10:20:00.000Z',
              from: {
                emailAddress: {
                  address: 'info@hairtpclinic.com',
                },
              },
              toRecipients: [{ emailAddress: { address: 'patient@hairtpclinic.com' } }],
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-fuzzy-alias',
    clientId: 'client-id-fuzzy-alias',
    clientSecret: 'client-secret-fuzzy-alias',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
    now: () => fixedNowMs,
  });

  const snapshot = await connector.fetchInboxSnapshot();
  assert.equal(snapshot.conversations.length, 1);
  const conversation = snapshot.conversations[0];
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.lastOutboundAt, '2026-02-26T10:20:00.000Z');
});

test('MicrosoftGraphReadConnector full-tenant mode lists users and reads each inbox with limits', async () => {
  const fixedNowMs = Date.parse('2026-02-26T18:00:00.000Z');
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-tenant',
        },
      });
    }
    if (String(url).includes('/users?')) {
      return createJsonResponse({
        body: {
          value: [
            { id: 'user-1', mail: 'owner1@hairtpclinic.se', userPrincipalName: 'owner1@hairtpclinic.se' },
            { id: 'user-2', mail: 'owner2@hairtpclinic.se', userPrincipalName: 'owner2@hairtpclinic.se' },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-u1',
              conversationId: 'conv-u1',
              subject: 'Hej owner1',
              bodyPreview: 'Kontakta mig pa owner1@example.com',
              receivedDateTime: '2026-02-26T12:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    if (String(url).includes('/users/user-2/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-u2',
              conversationId: 'conv-u2',
              subject: 'Hej owner2',
              bodyPreview: 'Mitt nummer ar 0701234567',
              receivedDateTime: '2026-02-26T11:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-2/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-3',
    clientId: 'client-id-3',
    clientSecret: 'client-secret-3',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
    now: () => fixedNowMs,
  });

  const snapshot = await connector.fetchInboxSnapshot({
    fullTenant: true,
    userScope: 'all',
    maxUsers: 2,
    maxMessagesPerUser: 5,
  });

  assert.equal(calls.length, 6);
  const usersRequest = calls[1];
  assert.equal(String(usersRequest.url).includes('/users?'), true);

  const mailboxInboxRequest1 = calls.find((item) =>
    String(item.url).includes('/users/user-1/mailFolders/inbox/messages')
  );
  const mailboxInboxRequest2 = calls.find((item) =>
    String(item.url).includes('/users/user-2/mailFolders/inbox/messages')
  );
  assert.equal(new URL(mailboxInboxRequest1.url).searchParams.get('$top'), '3');
  assert.equal(new URL(mailboxInboxRequest2.url).searchParams.get('$top'), '3');

  assert.equal(snapshot.metadata.fullTenantMode, true);
  assert.equal(snapshot.metadata.userScope, 'all');
  assert.equal(snapshot.metadata.maxUsers, 2);
  assert.equal(snapshot.metadata.maxMessagesPerUser, 5);
  assert.equal(snapshot.metadata.mailboxCount, 2);
  assert.equal(snapshot.metadata.messageCount, 2);
  assert.equal(snapshot.conversations.length, 2);
});

test('MicrosoftGraphReadConnector full-tenant mode supports mailbox index filtering', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-index-filter',
        },
      });
    }
    if (String(url).includes('/users?')) {
      return createJsonResponse({
        body: {
          value: [
            { id: 'user-1', mail: 'u1@hairtpclinic.se' },
            { id: 'user-2', mail: 'u2@hairtpclinic.se' },
            { id: 'user-3', mail: 'u3@hairtpclinic.se' },
            { id: 'user-4', mail: 'u4@hairtpclinic.se' },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'm1',
              conversationId: 'c1',
              subject: 'Hej 1',
              bodyPreview: 'Preview 1',
              receivedDateTime: '2026-02-26T12:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    if (String(url).includes('/users/user-3/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'm3',
              conversationId: 'c3',
              subject: 'Hej 3',
              bodyPreview: 'Preview 3',
              receivedDateTime: '2026-02-26T11:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-3/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-5',
    clientId: 'client-id-5',
    clientSecret: 'client-secret-5',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot({
    fullTenant: true,
    userScope: 'all',
    maxUsers: 4,
    mailboxIndexes: [1, 3, 7],
    maxMessagesPerUser: 5,
  });

  assert.equal(calls.length, 6);
  assert.equal(
    calls.some((item) => String(item.url).includes('/users/user-1/mailFolders/inbox/messages')),
    true
  );
  assert.equal(
    calls.some((item) => String(item.url).includes('/users/user-3/mailFolders/inbox/messages')),
    true
  );
  assert.equal(snapshot.metadata.mailboxCount, 2);
  assert.deepEqual(snapshot.metadata.mailboxIndexes, [1, 3]);
  assert.deepEqual(snapshot.metadata.mailboxIds, ['u1@hairtpclinic.se', 'u3@hairtpclinic.se']);
});

test('MicrosoftGraphReadConnector full-tenant mode supports explicit mailbox id filtering', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-id-filter',
        },
      });
    }
    if (String(url).includes('/users?')) {
      return createJsonResponse({
        body: {
          value: [
            { id: 'user-1', mail: 'u1@hairtpclinic.se' },
            { id: 'user-2', mail: 'u2@hairtpclinic.se' },
            { id: 'user-3', mail: 'u3@hairtpclinic.se' },
            { id: 'user-4', mail: 'kons@hairtpclinic.com' },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'm1',
              conversationId: 'c1',
              subject: 'Hej 1',
              bodyPreview: 'Preview 1',
              receivedDateTime: '2026-02-26T12:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    if (String(url).includes('/users/user-4/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'm4',
              conversationId: 'c4',
              subject: 'Hej 4',
              bodyPreview: 'Preview 4',
              receivedDateTime: '2026-02-26T11:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-4/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-6',
    clientId: 'client-id-6',
    clientSecret: 'client-secret-6',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot({
    fullTenant: true,
    userScope: 'all',
    maxUsers: 4,
    mailboxIndexes: [1],
    mailboxIds: ['kons@hairtpclinic.com', 'missing@hairtpclinic.com'],
    maxMessagesPerUser: 5,
  });

  assert.equal(calls.length, 6);
  assert.equal(
    calls.some((item) => String(item.url).includes('/users/user-1/mailFolders/inbox/messages')),
    true
  );
  assert.equal(
    calls.some((item) => String(item.url).includes('/users/user-4/mailFolders/inbox/messages')),
    true
  );
  assert.equal(snapshot.metadata.mailboxCount, 2);
  assert.deepEqual(snapshot.metadata.mailboxIndexes, [1]);
  assert.deepEqual(snapshot.metadata.mailboxIdFilter, [
    'kons@hairtpclinic.com',
    'missing@hairtpclinic.com',
  ]);
  assert.deepEqual(snapshot.metadata.mailboxIds, ['u1@hairtpclinic.se', 'kons@hairtpclinic.com']);
  assert.equal(Array.isArray(snapshot.warnings), true);
  assert.equal(
    snapshot.warnings.some((item) => String(item).includes('Mailbox-idfilter matchade 1 av 2')),
    true
  );
});

test('MicrosoftGraphReadConnector mailbox id filter matches com/se aliases in full-tenant mode', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-id-filter-alias',
        },
      });
    }
    if (String(url).includes('/users?')) {
      return createJsonResponse({
        body: {
          value: [
            { id: 'user-1', mail: 'u1@hairtpclinic.se' },
            { id: 'user-2', mail: 'kons@hairtpclinic.se' },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-2/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'm2',
              conversationId: 'c2',
              subject: 'Hej alias',
              bodyPreview: 'Preview alias',
              receivedDateTime: '2026-02-26T11:30:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-2/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-6b',
    clientId: 'client-id-6b',
    clientSecret: 'client-secret-6b',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot({
    fullTenant: true,
    userScope: 'all',
    maxUsers: 4,
    mailboxIds: ['kons@hairtpclinic.com'],
    maxMessagesPerUser: 5,
  });

  assert.equal(
    calls.some((item) => String(item.url).includes('/users/user-2/mailFolders/inbox/messages')),
    true
  );
  assert.equal(
    calls.some((item) => String(item.url).includes('/users/user-1/mailFolders/inbox/messages')),
    false
  );
  assert.equal(snapshot.metadata.mailboxCount, 1);
  assert.deepEqual(snapshot.metadata.mailboxIds, ['kons@hairtpclinic.se']);
  assert.deepEqual(snapshot.metadata.mailboxIdFilter, ['kons@hairtpclinic.com']);
  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
  assert.equal(
    warnings.some((item) => String(item).includes('Mailbox-idfilter matchade 0 av')),
    false
  );
});

test('MicrosoftGraphReadConnector full-tenant mode paginates users and mailbox messages', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-pagination',
        },
      });
    }
    if (String(url).includes('/users?$skiptoken=users-2')) {
      return createJsonResponse({
        body: {
          value: [{ id: 'user-2', mail: 'owner2@hairtpclinic.se' }],
        },
      });
    }
    if (String(url).includes('/users?')) {
      return createJsonResponse({
        body: {
          value: [{ id: 'user-1', mail: 'owner1@hairtpclinic.se' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=users-2',
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/inbox/messages') && String(url).includes('$skiptoken=msg-2')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'u1-m2',
              conversationId: 'u1-c2',
              subject: 'Andra sida user 1',
              bodyPreview: 'Preview user 1 page 2',
              receivedDateTime: '2026-02-26T13:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'u1-m1',
              conversationId: 'u1-c1',
              subject: 'Forsta sida user 1',
              bodyPreview: 'Preview user 1 page 1',
              receivedDateTime: '2026-02-26T14:00:00.000Z',
              isRead: false,
            },
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/users/user-1/mailFolders/inbox/messages?$skiptoken=msg-2',
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    if (String(url).includes('/users/user-2/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'u2-m1',
              conversationId: 'u2-c1',
              subject: 'User 2 meddelande',
              bodyPreview: 'Preview user 2',
              receivedDateTime: '2026-02-26T12:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-2/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-4',
    clientId: 'client-id-4',
    clientSecret: 'client-secret-4',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot({
    fullTenant: true,
    userScope: 'all',
    maxUsers: 5,
    maxMessagesPerUser: 5,
  });

  assert.equal(calls.length, 8);
  assert.equal(snapshot.metadata.mailboxCount, 2);
  assert.equal(snapshot.metadata.messageCount, 3);
  assert.equal(snapshot.conversations.length, 3);
  assert.deepEqual(snapshot.metadata.mailboxIds, ['owner1@hairtpclinic.se', 'owner2@hairtpclinic.se']);
});

test('MicrosoftGraphReadConnector retries retryable failures with backoff and retry-after', async () => {
  const sleepCalls = [];
  let usersCallCount = 0;
  let mailboxCallCount = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-retry',
        },
      });
    }
    if (String(url).includes('/users?')) {
      usersCallCount += 1;
      if (usersCallCount === 1) {
        return createJsonResponse({
          status: 429,
          body: {
            error: { message: 'Too many requests' },
          },
          headers: {
            'retry-after': '0',
          },
        });
      }
      return createJsonResponse({
        body: {
          value: [{ id: 'user-1', mail: 'owner1@hairtpclinic.se' }],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/inbox/messages')) {
      mailboxCallCount += 1;
      if (mailboxCallCount === 1) {
        return createJsonResponse({
          status: 503,
          body: {
            error: { message: 'Service unavailable' },
          },
        });
      }
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'retry-m1',
              conversationId: 'retry-c1',
              subject: 'Retry works',
              bodyPreview: 'Detta meddelande ska hamtas efter retry',
              receivedDateTime: '2026-02-26T12:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-7',
    clientId: 'client-id-7',
    clientSecret: 'client-secret-7',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
  });

  const snapshot = await connector.fetchInboxSnapshot({
    fullTenant: true,
    userScope: 'all',
    maxUsers: 1,
    maxMessagesPerUser: 5,
    requestMaxRetries: 2,
    retryBaseDelayMs: 100,
    retryMaxDelayMs: 500,
  });

  assert.equal(usersCallCount, 2);
  assert.equal(mailboxCallCount, 2);
  assert.equal(snapshot.metadata.mailboxCount, 1);
  assert.equal(snapshot.metadata.messageCount, 1);
  assert.equal(sleepCalls.length, 2);
  assert.equal(sleepCalls[0], 0);
  assert.equal(sleepCalls[1], 100);
});

test('MicrosoftGraphReadConnector fails closed on pagination loop detection', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-loop',
        },
      });
    }
    if (String(url).includes('/users?$skiptoken=abc')) {
      return createJsonResponse({
        body: {
          value: [{ id: 'user-1', mail: 'owner1@hairtpclinic.se' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=abc',
        },
      });
    }
    if (String(url).includes('/users?')) {
      return createJsonResponse({
        body: {
          value: [{ id: 'user-1', mail: 'owner1@hairtpclinic.se' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=abc',
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-8',
    clientId: 'client-id-8',
    clientSecret: 'client-secret-8',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
  });

  await assert.rejects(
    () =>
      connector.fetchInboxSnapshot({
        fullTenant: true,
        userScope: 'all',
      }),
    /pagination loop detected/i
  );
});

test('MicrosoftGraphReadConnector metadata.mailboxIds includes selected mailboxes even when no messages are returned', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-mailboxes',
        },
      });
    }
    if (String(url).includes('/users?')) {
      return createJsonResponse({
        body: {
          value: [
            { id: 'user-1', mail: 'info@hairtpclinic.com', userPrincipalName: 'info@hairtpclinic.com' },
            { id: 'user-2', mail: 'kons@hairtpclinic.com', userPrincipalName: 'kons@hairtpclinic.com' },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-u1-in',
              conversationId: 'conv-u1',
              subject: 'Hej',
              bodyPreview: 'Hej från kund',
              receivedDateTime: '2026-02-26T11:00:00.000Z',
              from: { emailAddress: { address: 'patient@example.com' } },
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-1/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    if (String(url).includes('/users/user-2/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    if (String(url).includes('/users/user-2/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-mailboxes',
    clientId: 'client-id-mailboxes',
    clientSecret: 'client-secret-mailboxes',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot({
    fullTenant: true,
    userScope: 'all',
    maxUsers: 2,
    maxMessagesPerUser: 10,
  });

  assert.equal(Array.isArray(snapshot.metadata.mailboxIds), true);
  assert.equal(snapshot.metadata.mailboxIds.includes('info@hairtpclinic.com'), true);
  assert.equal(snapshot.metadata.mailboxIds.includes('kons@hairtpclinic.com'), true);
});
