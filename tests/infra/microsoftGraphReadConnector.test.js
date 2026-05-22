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
          '@odata.count': 3,
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

test('MicrosoftGraphReadConnector supports explicit sinceIso/untilIso filters', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-range',
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
    tenantId: 'tenant-id-range',
    clientId: 'client-id-range',
    clientSecret: 'client-secret-range',
    userId: 'mailbox@hairtpclinic.se',
    fetchImpl,
    now: () => Date.parse('2026-02-26T18:00:00.000Z'),
  });

  const snapshot = await connector.fetchInboxSnapshot({
    includeRead: true,
    sinceIso: '2025-01-01T00:00:00.000Z',
    untilIso: '2025-02-01T00:00:00.000Z',
  });

  const inboxCall = calls.find((item) => String(item.url).includes('/mailFolders/inbox/messages'));
  const sentCall = calls.find((item) => String(item.url).includes('/mailFolders/SentItems/messages'));
  const inboxUrl = new URL(inboxCall.url);
  const sentUrl = new URL(sentCall.url);

  assert.equal(
    inboxUrl.searchParams.get('$filter'),
    'receivedDateTime ge 2025-01-01T00:00:00.000Z and receivedDateTime lt 2025-02-01T00:00:00.000Z'
  );
  assert.equal(
    sentUrl.searchParams.get('$filter'),
    'sentDateTime ge 2025-01-01T00:00:00.000Z and sentDateTime lt 2025-02-01T00:00:00.000Z'
  );
  assert.equal(snapshot.metadata.windowStartIso, '2025-01-01T00:00:00.000Z');
  assert.equal(snapshot.metadata.windowEndIso, '2025-02-01T00:00:00.000Z');
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
          '@odata.count': 3,
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
          '@odata.count': 3,
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

test('MicrosoftGraphReadConnector keeps alias-similar threads separate when activity is too far apart', async () => {
  const fixedNowMs = Date.parse('2026-03-15T18:00:00.000Z');
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-alias-window',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-window-in',
              conversationId: 'conv-window-a',
              subject: 'Bokning konsultation',
              bodyPreview: 'Hej, jag vill boka en tid.',
              receivedDateTime: '2026-03-01T10:00:00.000Z',
              from: {
                emailAddress: {
                  address: 'patient+vip@hairtpclinic.se',
                  name: 'Patient Alias',
                },
              },
              replyTo: [{ emailAddress: { address: 'patient+vip@hairtpclinic.se' } }],
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
              id: 'msg-window-out',
              conversationId: 'conv-window-b',
              subject: 'SV: Bokning konsultation',
              bodyPreview: 'Vi har tider senare i månaden.',
              sentDateTime: '2026-03-12T10:00:00.000Z',
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
    tenantId: 'tenant-id-alias-window',
    clientId: 'client-id-alias-window',
    clientSecret: 'client-secret-alias-window',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
    now: () => fixedNowMs,
  });

  const snapshot = await connector.fetchInboxSnapshot();
  assert.equal(snapshot.conversations.length, 2);
});

test('MicrosoftGraphReadConnector fetches folder-aware mailbox truth for inbox, sent, drafts and deleted items', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const safeUrl = String(url);
    if (safeUrl.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-mailbox-truth',
        },
      });
    }
    if (safeUrl.includes('/mailFolders/inbox?')) {
      return createJsonResponse({
        body: {
          id: 'folder-inbox',
          displayName: 'Inbox',
          wellKnownName: 'inbox',
          totalItemCount: 11,
          unreadItemCount: 4,
        },
      });
    }
    if (safeUrl.includes('/mailFolders/SentItems?')) {
      return createJsonResponse({
        body: {
          id: 'folder-sent',
          displayName: 'Sent Items',
          wellKnownName: 'sentitems',
          totalItemCount: 9,
          unreadItemCount: 0,
        },
      });
    }
    if (safeUrl.includes('/mailFolders/Drafts?')) {
      return createJsonResponse({
        body: {
          id: 'folder-drafts',
          displayName: 'Drafts',
          wellKnownName: 'drafts',
          totalItemCount: 2,
          unreadItemCount: 0,
        },
      });
    }
    if (safeUrl.includes('/mailFolders/DeletedItems?')) {
      return createJsonResponse({
        body: {
          id: 'folder-deleted',
          displayName: 'Deleted Items',
          wellKnownName: 'deleteditems',
          totalItemCount: 3,
          unreadItemCount: 0,
        },
      });
    }
    if (safeUrl.includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-inbox-1',
              conversationId: 'conv-truth-1',
              subject: 'Kan ni hjälpa mig med bokning?',
              bodyPreview: 'Hej, jag vill boka en konsultation.',
              receivedDateTime: '2026-03-01T09:00:00.000Z',
              isRead: false,
              hasAttachments: true,
              parentFolderId: 'folder-inbox',
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
            },
          ],
        },
      });
    }
    if (safeUrl.includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-sent-1',
              conversationId: 'conv-truth-1',
              subject: 'Re: Kan ni hjälpa mig med bokning?',
              bodyPreview: 'Hej, vi kan erbjuda tider på tisdag.',
              sentDateTime: '2026-03-01T10:00:00.000Z',
              parentFolderId: 'folder-sent',
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
    if (safeUrl.includes('/mailFolders/Drafts/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-draft-1',
              conversationId: 'conv-truth-2',
              subject: 'Utkast svar',
              bodyPreview: 'Jag återkommer med tider inom kort.',
              createdDateTime: '2026-03-01T11:00:00.000Z',
              lastModifiedDateTime: '2026-03-01T11:15:00.000Z',
              isDraft: true,
              parentFolderId: 'folder-drafts',
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
    if (safeUrl.includes('/mailFolders/DeletedItems/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-deleted-1',
              conversationId: 'conv-truth-3',
              subject: 'Gammalt ärende',
              bodyPreview: 'Det här mailet är flyttat till deleted items.',
              receivedDateTime: '2026-03-01T07:00:00.000Z',
              lastModifiedDateTime: '2026-03-01T12:00:00.000Z',
              isRead: true,
              parentFolderId: 'folder-deleted',
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected URL: ${safeUrl}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-truth',
    clientId: 'client-id-truth',
    clientSecret: 'client-secret-truth',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
    now: () => Date.parse('2026-03-02T12:00:00.000Z'),
  });

  const snapshot = await connector.fetchMailboxTruthSnapshot({
    days: 30,
  });

  assert.equal(snapshot.snapshotVersion, 'graph.mailbox.truth.snapshot.v1');
  assert.equal(snapshot.source, 'microsoft-graph');
  assert.equal(snapshot.accounts.length, 1);
  assert.equal(snapshot.metadata.accountCount, 1);
  assert.equal(snapshot.metadata.folderCount, 4);
  assert.equal(snapshot.metadata.messageCount, 4);

  const account = snapshot.accounts[0];
  assert.equal(account.mailboxId, 'info@hairtpclinic.com');
  assert.equal(account.folders.length, 4);
  assert.equal(account.fetchStatus, 'success');

  const folderTypes = account.folders.map((folder) => folder.folderType);
  assert.deepEqual(folderTypes, ['inbox', 'sent', 'drafts', 'deleted']);

  const inboxFolder = account.folders.find((folder) => folder.folderType === 'inbox');
  const draftsFolder = account.folders.find((folder) => folder.folderType === 'drafts');
  const deletedFolder = account.folders.find((folder) => folder.folderType === 'deleted');
  assert.equal(inboxFolder.totalItemCount, 11);
  assert.equal(inboxFolder.unreadItemCount, 4);
  assert.equal(inboxFolder.messages[0].direction, 'inbound');
  assert.equal(inboxFolder.messages[0].hasAttachments, true);
  assert.equal(draftsFolder.messages[0].direction, 'draft');
  assert.equal(draftsFolder.messages[0].isDraft, true);
  assert.equal(deletedFolder.messages[0].folderType, 'deleted');

  const inboxRequest = calls.find((item) => item.url.includes('/mailFolders/inbox/messages'));
  const sentRequest = calls.find((item) => item.url.includes('/mailFolders/SentItems/messages'));
  const draftsRequest = calls.find((item) => item.url.includes('/mailFolders/Drafts/messages'));
  const deletedRequest = calls.find((item) => item.url.includes('/mailFolders/DeletedItems/messages'));
  assert.equal(Boolean(inboxRequest), true);
  assert.equal(Boolean(sentRequest), true);
  assert.equal(Boolean(draftsRequest), true);
  assert.equal(Boolean(deletedRequest), true);

  const inboxUrl = new URL(inboxRequest.url);
  const draftsUrl = new URL(draftsRequest.url);
  assert.equal(inboxUrl.searchParams.get('$filter'), 'receivedDateTime ge 2026-01-31T12:00:00.000Z');
  assert.equal(draftsUrl.searchParams.get('$filter'), 'lastModifiedDateTime ge 2026-01-31T12:00:00.000Z');
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

test('MicrosoftGraphReadConnector mailbox id filtering can match users outside first maxUsers window', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-id-filter-window',
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
            { id: 'user-5', mail: 'u5@hairtpclinic.se' },
            { id: 'user-6', mail: 'u6@hairtpclinic.se' },
            { id: 'user-7', mail: 'u7@hairtpclinic.se' },
            { id: 'user-8', mail: 'kons@hairtpclinic.com' },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-8/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'm8',
              conversationId: 'c8',
              subject: 'Hej 8',
              bodyPreview: 'Preview 8',
              receivedDateTime: '2026-02-26T11:00:00.000Z',
              isRead: false,
            },
          ],
        },
      });
    }
    if (String(url).includes('/users/user-8/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-6c',
    clientId: 'client-id-6c',
    clientSecret: 'client-secret-6c',
    fullTenant: true,
    userScope: 'all',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot({
    fullTenant: true,
    userScope: 'all',
    maxUsers: 3,
    mailboxIds: ['kons@hairtpclinic.com'],
    maxMessagesPerUser: 5,
  });

  assert.equal(
    calls.some((item) => String(item.url).includes('/users/user-8/mailFolders/inbox/messages')),
    true
  );
  assert.equal(snapshot.metadata.mailboxCount, 1);
  assert.deepEqual(snapshot.metadata.mailboxIdFilter, ['kons@hairtpclinic.com']);
  assert.deepEqual(snapshot.metadata.mailboxIds, ['kons@hairtpclinic.com']);
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

test('MicrosoftGraphReadConnector fetchMailboxTruthFolderPage paginates a single folder page with metadata and nextLink', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-folder-page',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox?')) {
      return createJsonResponse({
        body: {
          id: 'folder-inbox',
          displayName: 'Inbox',
          totalItemCount: 3,
          unreadItemCount: 2,
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-1',
              parentFolderId: 'folder-inbox',
              conversationId: 'conv-1',
              subject: 'Hej från kund',
              bodyPreview: 'Kan ni hjälpa mig?',
              receivedDateTime: '2026-04-02T08:00:00.000Z',
              sentDateTime: '2026-04-02T07:59:59.000Z',
              isRead: false,
              isDraft: false,
              hasAttachments: false,
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [
                {
                  emailAddress: {
                    address: 'kons@hairtpclinic.com',
                    name: 'Kons',
                  },
                },
              ],
              internetMessageId: '<message-1@example.com>',
              internetMessageHeaders: [],
            },
          ],
          '@odata.count': 3,
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/kons@hairtpclinic.com/mailFolders/inbox/messages?$skiptoken=abc',
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-folder-page',
    clientId: 'client-id-folder-page',
    clientSecret: 'client-secret-folder-page',
    userId: 'kons@hairtpclinic.com',
    fetchImpl,
    now: () => Date.parse('2026-04-02T09:00:00.000Z'),
  });

  const page = await connector.fetchMailboxTruthFolderPage({
    userId: 'kons@hairtpclinic.com',
    mailboxId: 'kons@hairtpclinic.com',
    mailboxAddress: 'kons@hairtpclinic.com',
    userPrincipalName: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    includeRead: true,
    sinceIso: '2026-04-01T00:00:00.000Z',
    pageSize: 1,
  });

  assert.equal(page.account.mailboxId, 'kons@hairtpclinic.com');
  assert.equal(page.folder.folderType, 'inbox');
  assert.equal(page.folder.totalItemCount, 3);
  assert.equal(page.folder.messageCollectionCount, 3);
  assert.equal(page.page.fetchedMessageCount, 1);
  assert.equal(page.page.complete, false);
  assert.equal(Boolean(page.page.nextPageUrl), true);
  assert.equal(page.messages.length, 1);
  assert.equal(page.messages[0].graphMessageId, 'msg-1');
  assert.equal(page.messages[0].direction, 'inbound');
});

test('MicrosoftGraphReadConnector fetchMailboxTruthFolderDeltaPage follows nextLink to deltaLink and maps delete tombstones', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-folder-delta',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox?')) {
      return createJsonResponse({
        body: {
          id: 'folder-inbox',
          displayName: 'Inbox',
          totalItemCount: 2,
          unreadItemCount: 1,
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages/delta') && !String(url).includes('$skiptoken=delta-2')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-1',
              parentFolderId: 'folder-inbox',
              conversationId: 'conv-1',
              subject: 'Hej från kund',
              bodyPreview: 'Kan ni hjälpa mig?',
              receivedDateTime: '2026-04-02T08:00:00.000Z',
              isRead: false,
              isDraft: false,
              hasAttachments: false,
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [
                {
                  emailAddress: {
                    address: 'kons@hairtpclinic.com',
                    name: 'Kons',
                  },
                },
              ],
              internetMessageId: '<message-1@example.com>',
              internetMessageHeaders: [],
            },
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/users/kons@hairtpclinic.com/mailFolders/inbox/messages/delta?$skiptoken=delta-2',
        },
      });
    }
    if (String(url).includes('$skiptoken=delta-2')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-2',
              '@removed': {
                reason: 'deleted',
              },
            },
          ],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/users/kons@hairtpclinic.com/mailFolders/inbox/messages/delta?$deltatoken=delta-final',
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-folder-delta',
    clientId: 'client-id-folder-delta',
    clientSecret: 'client-secret-folder-delta',
    userId: 'kons@hairtpclinic.com',
    fetchImpl,
  });

  const firstPage = await connector.fetchMailboxTruthFolderDeltaPage({
    userId: 'kons@hairtpclinic.com',
    mailboxId: 'kons@hairtpclinic.com',
    mailboxAddress: 'kons@hairtpclinic.com',
    userPrincipalName: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    pageSize: 1,
  });
  assert.equal(firstPage.page.complete, false);
  assert.equal(Boolean(firstPage.page.nextPageUrl), true);
  assert.equal(firstPage.page.deltaLink, null);
  assert.equal(firstPage.changes.length, 1);
  assert.equal(firstPage.changes[0].changeType, 'upsert');
  assert.equal(firstPage.changes[0].message.graphMessageId, 'msg-1');

  const secondPage = await connector.fetchMailboxTruthFolderDeltaPage({
    userId: 'kons@hairtpclinic.com',
    mailboxId: 'kons@hairtpclinic.com',
    mailboxAddress: 'kons@hairtpclinic.com',
    userPrincipalName: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    cursorUrl: firstPage.page.nextPageUrl,
    folderMetadata: firstPage.folder,
    pageSize: 1,
  });
  assert.equal(secondPage.page.complete, true);
  assert.equal(secondPage.page.nextPageUrl, null);
  assert.equal(Boolean(secondPage.page.deltaLink), true);
  assert.equal(secondPage.changes.length, 1);
  assert.equal(secondPage.changes[0].changeType, 'deleted');
  assert.equal(secondPage.changes[0].graphMessageId, 'msg-2');
});

test('MicrosoftGraphReadConnector fetchMailboxTruthFolderDeltaPage resolves cid images on delta upserts', async () => {
  const fetchImpl = async (url, _options = {}) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-folder-delta-inline',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox?')) {
      return createJsonResponse({
        body: {
          id: 'folder-inbox',
          displayName: 'Inbox',
          totalItemCount: 1,
          unreadItemCount: 1,
        },
      });
    }
    if (String(url).includes('/messages/msg-inline-1/attachments')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'att-inline-1',
              name: 'image001.png@abc',
              contentType: 'image/png',
              contentId: 'image001.png@abc',
              isInline: true,
              size: 128,
              contentBytes: 'YWJjMTIz',
            },
          ],
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages/delta')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-inline-1',
              parentFolderId: 'folder-inbox',
              conversationId: 'conv-inline-1',
              subject: 'Inline-signatur',
              bodyPreview: 'Här kommer signaturen.',
              body: {
                contentType: 'html',
                content:
                  '<div><p>Hej</p><img src="cid:image001.png@abc" alt="Hair TP Clinic" /></div>',
              },
              receivedDateTime: '2026-04-02T08:00:00.000Z',
              isRead: false,
              isDraft: false,
              hasAttachments: true,
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [
                {
                  emailAddress: {
                    address: 'kons@hairtpclinic.com',
                    name: 'Kons',
                  },
                },
              ],
              internetMessageId: '<message-inline@example.com>',
              internetMessageHeaders: [],
            },
          ],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/users/kons@hairtpclinic.com/mailFolders/inbox/messages/delta?$deltatoken=delta-inline-final',
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-folder-delta-inline',
    clientId: 'client-id-folder-delta-inline',
    clientSecret: 'client-secret-folder-delta-inline',
    userId: 'kons@hairtpclinic.com',
    fetchImpl,
  });

  const page = await connector.fetchMailboxTruthFolderDeltaPage({
    userId: 'kons@hairtpclinic.com',
    mailboxId: 'kons@hairtpclinic.com',
    mailboxAddress: 'kons@hairtpclinic.com',
    userPrincipalName: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    pageSize: 1,
  });

  assert.equal(page.changes.length, 1);
  assert.equal(page.changes[0].changeType, 'upsert');
  assert.match(
    String(page.changes[0].message?.bodyHtml || ''),
    /data:image\/png;base64,YWJjMTIz/
  );
});

test('MicrosoftGraphReadConnector fetchMailboxTruthFolderDeltaPage marks invalid delta tokens explicitly', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-folder-delta-invalid',
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox/messages/delta')) {
      return createJsonResponse({
        status: 410,
        body: {
          error: {
            code: 'SyncStateNotFound',
            message: 'The sync state generation is not found. The delta token is expired.',
          },
        },
      });
    }
    if (String(url).includes('/mailFolders/inbox?')) {
      return createJsonResponse({
        body: {
          id: 'folder-inbox',
          displayName: 'Inbox',
          totalItemCount: 1,
          unreadItemCount: 0,
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-folder-delta-invalid',
    clientId: 'client-id-folder-delta-invalid',
    clientSecret: 'client-secret-folder-delta-invalid',
    userId: 'kons@hairtpclinic.com',
    fetchImpl,
  });

  await assert.rejects(
    () =>
      connector.fetchMailboxTruthFolderDeltaPage({
        userId: 'kons@hairtpclinic.com',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        userPrincipalName: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        deltaLink:
          'https://graph.microsoft.com/v1.0/users/kons@hairtpclinic.com/mailFolders/inbox/messages/delta?$deltatoken=expired',
      }),
    (error) => {
      assert.equal(error.code, 'GRAPH_DELTA_TOKEN_INVALID');
      assert.equal(error.status, 410);
      return true;
    }
  );
});

test('MicrosoftGraphReadConnector preserves inbound bodyHtml and resolves cid inline images in inbox snapshot', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const safeUrl = String(url);
    calls.push(safeUrl);
    if (safeUrl.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-cid-inbox',
        },
      });
    }
    if (safeUrl.includes('/messages/msg-in-cid-1/attachments')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'att-inline-1',
              name: 'image0.png',
              contentType: 'image/png',
              size: 2048,
              isInline: true,
              contentId: 'image0@cid',
              contentBytes: 'QUJDRA==',
            },
          ],
        },
      });
    }
    if (safeUrl.includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-in-cid-1',
              conversationId: 'conv-cid-1',
              subject: 'Bild i signaturen',
              bodyPreview: 'Hej från kund.',
              receivedDateTime: '2026-04-07T08:00:00.000Z',
              hasAttachments: true,
              body: {
                contentType: 'html',
                content: '<div>Hej!<br><img src="cid:image0@cid" alt="kundlogga"></div>',
              },
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
    if (safeUrl.includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    throw new Error(`Unexpected URL: ${safeUrl}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-cid-inbox',
    clientId: 'client-id-cid-inbox',
    clientSecret: 'client-secret-cid-inbox',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot();
  const conversation = snapshot.conversations[0];
  assert.match(String(conversation.messages[0]?.bodyHtml || ''), /^<div>Hej!<br><img src="data:image\/png;base64,QUJDRA=="/);
  const attachmentRequest = calls.find((entry) => entry.includes('/messages/msg-in-cid-1/attachments'));
  assert.equal(Boolean(attachmentRequest), true);
  assert.equal(String(attachmentRequest).includes('contentId'), false);
  assert.equal(String(attachmentRequest).includes('contentBytes'), false);
});

test('MicrosoftGraphReadConnector carries non-inline attachment metadata through inbox snapshot messages', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const safeUrl = String(url);
    calls.push(safeUrl);
    if (safeUrl.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-attachment-snapshot',
        },
      });
    }
    if (safeUrl.includes('/messages/msg-in-attachment-1/attachments')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'att-file-1',
              name: 'order.pdf',
              contentType: 'application/pdf',
              size: 12000,
              isInline: false,
            },
          ],
        },
      });
    }
    if (safeUrl.includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-in-attachment-1',
              conversationId: 'conv-attachment-1',
              subject: 'Bifogad order',
              bodyPreview: 'Se bifogad order.',
              receivedDateTime: '2026-04-07T08:00:00.000Z',
              hasAttachments: true,
              body: {
                contentType: 'html',
                content: '<div>Se bifogad order.</div>',
              },
              from: {
                emailAddress: {
                  address: 'orders@example.com',
                  name: 'Orders',
                },
              },
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
              isRead: false,
            },
          ],
        },
      });
    }
    if (safeUrl.includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({
        body: {
          value: [],
        },
      });
    }
    throw new Error(`Unexpected URL: ${safeUrl}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-attachment-snapshot',
    clientId: 'client-id-attachment-snapshot',
    clientSecret: 'client-secret-attachment-snapshot',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot();
  const message = snapshot.conversations[0]?.messages?.[0] || {};
  assert.equal(message.hasAttachments, true);
  assert.equal(Array.isArray(message.attachments), true);
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0]?.name, 'order.pdf');
  assert.equal(message.attachments[0]?.isInline, false);
  const attachmentRequest = calls.find((entry) =>
    entry.includes('/messages/msg-in-attachment-1/attachments')
  );
  assert.equal(Boolean(attachmentRequest), true);
});

test('MicrosoftGraphReadConnector resolves cid inline images inside mailbox truth snapshot payloads', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const safeUrl = String(url);
    calls.push(safeUrl);
    if (safeUrl.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-cid-truth',
        },
      });
    }
    if (safeUrl.includes('/mailFolders/inbox?')) {
      return createJsonResponse({
        body: {
          id: 'folder-inbox',
          displayName: 'Inbox',
          wellKnownName: 'inbox',
          totalItemCount: 1,
          unreadItemCount: 1,
        },
      });
    }
    if (safeUrl.includes('/mailFolders/SentItems?')) {
      return createJsonResponse({
        body: {
          id: 'folder-sent',
          displayName: 'Sent Items',
          wellKnownName: 'sentitems',
          totalItemCount: 0,
          unreadItemCount: 0,
        },
      });
    }
    if (safeUrl.includes('/mailFolders/Drafts?')) {
      return createJsonResponse({
        body: {
          id: 'folder-drafts',
          displayName: 'Drafts',
          wellKnownName: 'drafts',
          totalItemCount: 0,
          unreadItemCount: 0,
        },
      });
    }
    if (safeUrl.includes('/mailFolders/DeletedItems?')) {
      return createJsonResponse({
        body: {
          id: 'folder-deleted',
          displayName: 'Deleted Items',
          wellKnownName: 'deleteditems',
          totalItemCount: 0,
          unreadItemCount: 0,
        },
      });
    }
    if (safeUrl.includes('/messages/msg-truth-cid-1/attachments')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'att-inline-2',
              name: 'logo.png',
              contentType: 'image/png',
              size: 4096,
              isInline: true,
              contentId: 'EA16576E-2872-4B08-B661-B735472875B3',
              contentBytes: 'RkFLRQ==',
            },
          ],
        },
      });
    }
    if (safeUrl.includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-truth-cid-1',
              conversationId: 'conv-truth-cid-1',
              subject: 'Organisk kundbild',
              bodyPreview: 'Hej, här kommer bilden.',
              receivedDateTime: '2026-04-07T08:00:00.000Z',
              isRead: false,
              hasAttachments: true,
              parentFolderId: 'folder-inbox',
              body: {
                contentType: 'html',
                content:
                  '<div>Hej!<img alt="image0.jpeg" src="cid:EA16576E-2872-4B08-B661-B735472875B3"></div>',
              },
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [{ emailAddress: { address: 'info@hairtpclinic.com' } }],
            },
          ],
        },
      });
    }
    if (safeUrl.includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    if (safeUrl.includes('/mailFolders/Drafts/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    if (safeUrl.includes('/mailFolders/DeletedItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    throw new Error(`Unexpected URL: ${safeUrl}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-cid-truth',
    clientId: 'client-id-cid-truth',
    clientSecret: 'client-secret-cid-truth',
    userId: 'info@hairtpclinic.com',
    fetchImpl,
  });

  const snapshot = await connector.fetchMailboxTruthSnapshot({ days: 30 });
  const inboxFolder = snapshot.accounts[0].folders.find((folder) => folder.folderType === 'inbox');
  assert.match(
    String(inboxFolder?.messages?.[0]?.bodyHtml || ''),
    /src="data:image\/png;base64,RkFLRQ=="/
  );
  const attachmentRequest = calls.find((entry) => entry.includes('/messages/msg-truth-cid-1/attachments'));
  assert.equal(Boolean(attachmentRequest), true);
  assert.equal(String(attachmentRequest).includes('contentId'), false);
  assert.equal(String(attachmentRequest).includes('contentBytes'), false);
});

test('MicrosoftGraphReadConnector enrichStoredMessagesWithMailAssets returns safe attachment metadata and repaired html', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const safeUrl = String(url);
    calls.push(safeUrl);
    if (safeUrl.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-mail-assets',
        },
      });
    }
    if (safeUrl.includes('/messages/msg-asset-1/attachments')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'att-inline-asset-1',
              name: 'logo.png',
              contentType: 'image/png',
              size: 4096,
              isInline: true,
              contentId: 'asset-logo@cid',
              contentBytes: 'RkFLRQ==',
            },
            {
              id: 'att-file-asset-2',
              name: 'price-list.pdf',
              contentType: 'application/pdf',
              size: 12000,
              isInline: false,
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected URL: ${safeUrl}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-mail-assets',
    clientId: 'client-id-mail-assets',
    clientSecret: 'client-secret-mail-assets',
    userId: 'contact@hairtpclinic.com',
    fetchImpl,
  });

  const messages = await connector.enrichStoredMessagesWithMailAssets({
    messages: [
      {
        graphMessageId: 'msg-asset-1',
        mailboxId: 'contact@hairtpclinic.com',
        mailboxAddress: 'contact@hairtpclinic.com',
        userPrincipalName: 'contact@hairtpclinic.com',
        hasAttachments: true,
        bodyHtml: '<div><img src="cid:asset-logo@cid" alt="Clinic logo" /></div>',
      },
    ],
  });

  assert.equal(messages.length, 1);
  assert.match(String(messages[0]?.bodyHtml || ''), /data:image\/png;base64,RkFLRQ==/);
  assert.equal(Array.isArray(messages[0]?.attachments), true);
  assert.equal(messages[0].attachments.length, 2);
  assert.equal(messages[0].attachments[0].contentBytesAvailable, true);
  assert.equal('contentBytes' in messages[0].attachments[0], false);
  assert.equal(messages[0].attachments[1].contentBytesAvailable, false);
  const attachmentRequest = calls.find((entry) => entry.includes('/messages/msg-asset-1/attachments'));
  assert.equal(Boolean(attachmentRequest), true);
});

test('MicrosoftGraphReadConnector fetchMessageMimeContent returns raw MIME metadata for an open message', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const safeUrl = String(url);
    calls.push(safeUrl);
    if (safeUrl.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-mime-open',
        },
      });
    }
    if (safeUrl.includes('/messages/msg-mime-1/$value')) {
      return {
        ok: true,
        status: 200,
        headers: {
          get(name = '') {
            return String(name).toLowerCase() === 'content-type' ? 'message/rfc822' : null;
          },
        },
        async text() {
          return 'MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="abc"';
        },
      };
    }
    throw new Error(`Unexpected URL: ${safeUrl}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-mime-open',
    clientId: 'client-id-mime-open',
    clientSecret: 'client-secret-mime-open',
    userId: 'contact@hairtpclinic.com',
    fetchImpl,
  });

  const payload = await connector.fetchMessageMimeContent({
    userId: 'contact@hairtpclinic.com',
    messageId: 'msg-mime-1',
    label: 'Open-mail MIME fetch',
    timeoutMs: 5000,
  });

  assert.equal(payload.contentType, 'message/rfc822');
  assert.match(String(payload.rawMime || ''), /MIME-Version: 1\.0/);
  assert.equal(
    calls.some((entry) => entry.includes('/messages/msg-mime-1/$value')),
    true
  );
});

test('MicrosoftGraphReadConnector fetchMessageAttachmentContent returns attachment bytes and metadata for open/download actions', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const safeUrl = String(url);
    calls.push(safeUrl);
    if (safeUrl.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-attachment-open',
        },
      });
    }
    if (safeUrl.includes('/messages/msg-asset-open-1/attachments/att-file-open-1/$value')) {
      return {
        ok: true,
        status: 200,
        headers: {
          get(name = '') {
            return String(name).toLowerCase() === 'content-type'
              ? 'application/pdf'
              : null;
          },
        },
        async arrayBuffer() {
          return Buffer.from('PDF-BYTES');
        },
      };
    }
    if (safeUrl.includes('/messages/msg-asset-open-1/attachments/att-file-open-1')) {
      return createJsonResponse({
        body: {
          id: 'att-file-open-1',
          name: 'price-list.pdf',
          contentType: 'application/pdf',
          size: 9,
          isInline: false,
        },
      });
    }
    throw new Error(`Unexpected URL: ${safeUrl}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-attachment-open',
    clientId: 'client-id-attachment-open',
    clientSecret: 'client-secret-attachment-open',
    userId: 'contact@hairtpclinic.com',
    fetchImpl,
  });

  const payload = await connector.fetchMessageAttachmentContent({
    userId: 'contact@hairtpclinic.com',
    messageId: 'msg-asset-open-1',
    attachmentId: 'att-file-open-1',
    label: 'Open-mail attachment fetch',
    timeoutMs: 5000,
  });

  assert.equal(payload.name, 'price-list.pdf');
  assert.equal(payload.contentType, 'application/pdf');
  assert.equal(payload.isInline, false);
  assert.equal(Buffer.isBuffer(payload.buffer), true);
  assert.equal(String(payload.buffer), 'PDF-BYTES');
  assert.equal(
    calls.some((entry) => entry.includes('/messages/msg-asset-open-1/attachments/att-file-open-1/$value')),
    true
  );
});

test('MicrosoftGraphReadConnector preserves long inline-image html beyond legacy 24000 cutoff', async () => {
  const longDataImage = `data:image/png;base64,${'QUJD'.repeat(7000)}`;
  const fetchImpl = async (url) => {
    const safeUrl = String(url);
    if (safeUrl.includes('/oauth2/v2.0/token')) {
      return createJsonResponse({
        body: {
          access_token: 'token-long-html',
        },
      });
    }
    if (safeUrl.includes('/mailFolders/inbox/messages')) {
      return createJsonResponse({
        body: {
          value: [
            {
              id: 'msg-long-html-1',
              conversationId: 'conv-long-html-1',
              subject: 'Organisk html-signatur',
              bodyPreview: 'Hej från kunden.',
              receivedDateTime: '2026-04-07T08:00:00.000Z',
              hasAttachments: false,
              body: {
                contentType: 'html',
                content: `<div><p>Hej!</p><img src="${longDataImage}" alt="kundlogga" /></div>`,
              },
              from: {
                emailAddress: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
              },
              toRecipients: [{ emailAddress: { address: 'contact@hairtpclinic.com' } }],
              isRead: false,
            },
          ],
        },
      });
    }
    if (safeUrl.includes('/mailFolders/SentItems/messages')) {
      return createJsonResponse({ body: { value: [] } });
    }
    throw new Error(`Unexpected URL: ${safeUrl}`);
  };

  const connector = createMicrosoftGraphReadConnector({
    tenantId: 'tenant-id-long-html',
    clientId: 'client-id-long-html',
    clientSecret: 'client-secret-long-html',
    userId: 'contact@hairtpclinic.com',
    fetchImpl,
  });

  const snapshot = await connector.fetchInboxSnapshot();
  const bodyHtml = String(snapshot.conversations[0]?.messages?.[0]?.bodyHtml || '');
  assert.equal(bodyHtml.length > 24000, true);
  assert.equal(bodyHtml.includes('data:image/png;base64,'), true);
  assert.equal(bodyHtml.endsWith('</div>'), true);
});
