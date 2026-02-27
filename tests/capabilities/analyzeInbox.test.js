const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeInboxCapability } = require('../../src/capabilities/analyzeInbox');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

test('AnalyzeInbox returns schema-valid output with max 5 suggested drafts', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inbox-1',
    correlationId: 'corr-inbox-1',
    input: {
      includeClosed: false,
      maxDrafts: 5,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-1',
          subject: 'Fraga om symptom efter behandling',
          status: 'open',
          slaDeadlineAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          messages: [
            {
              messageId: 'msg-1',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Hej, jag har svullnad och feber. Kontakta mig pa 0701234567 eller patient@example.com',
            },
          ],
        },
        {
          conversationId: 'conv-2',
          subject: 'Statusuppdatering',
          status: 'open',
          messages: [
            {
              messageId: 'msg-2',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Tack, jag invantar svar.',
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  const validation = validateJsonSchema({
    schema: analyzeInboxCapability.outputSchema,
    value: output,
    rootPath: 'capability.output',
  });

  assert.equal(validation.ok, true, `schema validation errors: ${JSON.stringify(validation.errors)}`);
  assert.equal(Array.isArray(output.data.suggestedDrafts), true);
  assert.equal(output.data.suggestedDrafts.length <= 5, true);
  assert.equal(Array.isArray(output.data.riskFlags), true);
  assert.equal(Array.isArray(output.data.slaBreaches), true);
  assert.equal(typeof output.data.executiveSummary, 'string');
  assert.equal(['Low', 'Medium', 'High'].includes(output.data.priorityLevel), true);
  assert.equal(output.metadata.capability, 'AnalyzeInbox');
});

test('AnalyzeInbox adds medical safety disclaimer and avoids forbidden claims', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'staff-a', role: 'STAFF' },
    channel: 'admin',
    requestId: 'req-inbox-2',
    correlationId: 'corr-inbox-2',
    input: {
      maxDrafts: 3,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-medical',
          subject: 'Symptom efter operation',
          status: 'open',
          messages: [
            {
              messageId: 'msg-medical',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Jag har symptom och smarta efter behandling.',
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  assert.equal(output.data.suggestedDrafts.length >= 1, true);
  const draft = output.data.suggestedDrafts[0];
  const reply = String(draft.proposedReply || '').toLowerCase();

  assert.equal(reply.includes('medicinsk bedomning'), true);
  assert.equal(reply.includes('garanti'), false);
  assert.equal(reply.includes('100%'), false);
  assert.equal(reply.includes('diagnos'), false);
});

test('AnalyzeInbox acute drafts include explicit escalation phrase required by policy floor', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'staff-a', role: 'STAFF' },
    channel: 'admin',
    requestId: 'req-inbox-acute-policy',
    correlationId: 'corr-inbox-acute-policy',
    input: {
      maxDrafts: 1,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-acute-policy',
          subject: 'Akut fraga',
          status: 'open',
          messages: [
            {
              messageId: 'msg-acute-policy',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Jag har akut svar smarta och behover snabb hjalp.',
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  assert.equal(output.data.suggestedDrafts.length, 1);
  const reply = String(output.data.suggestedDrafts[0].proposedReply || '').toLowerCase();
  assert.equal(reply.includes('akuta symtom'), true);
  assert.equal(reply.includes('ring 112'), true);
});

test('AnalyzeInbox sanitizes acute terms in surfaced subjects but keeps urgency signals', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'staff-a', role: 'STAFF' },
    channel: 'admin',
    requestId: 'req-inbox-acute-subject',
    correlationId: 'corr-inbox-acute-subject',
    input: {
      maxDrafts: 2,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-acute-subject',
          subject: 'Akut fraga om eftervard',
          status: 'open',
          messages: [
            {
              messageId: 'msg-acute-subject',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Hej, jag foljer upp mitt arende.',
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  const renderedSubject = String(output.data.needsReplyToday?.[0]?.subject || '');
  assert.equal(renderedSubject.includes('Akut'), false);
  assert.equal(renderedSubject.includes('[eskaleradfraga]'), true);

  const riskFlagCodes = output.data.riskFlags.map((item) => item.flagCode);
  assert.equal(riskFlagCodes.includes('ACUTE_URGENT'), true);
});

test('AnalyzeInbox classifies SLA edge windows (24h, 48h) and risk words', async () => {
  const hourMs = 60 * 60 * 1000;
  const fixedNowMs = Date.parse('2026-02-26T18:00:00.000Z');
  const originalNow = Date.now;
  const isoAtOffset = (offsetMs) => new Date(fixedNowMs + offsetMs).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-sla-edges',
      correlationId: 'corr-inbox-sla-edges',
      input: {
        maxDrafts: 5,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-sla-24h',
            subject: 'Svar inom 24h',
            status: 'open',
            slaDeadlineAt: isoAtOffset(24 * hourMs),
            messages: [
              {
                messageId: 'msg-sla-24h',
                direction: 'inbound',
                sentAt: isoAtOffset(-2 * hourMs),
                bodyPreview: 'Hej, jag foljer upp mitt arende.',
              },
            ],
          },
          {
            conversationId: 'conv-sla-48h',
            subject: 'Svar inom 48h',
            status: 'open',
            slaDeadlineAt: isoAtOffset(48 * hourMs),
            messages: [
              {
                messageId: 'msg-sla-48h',
                direction: 'inbound',
                sentAt: isoAtOffset(-2 * hourMs),
                bodyPreview: 'Hej, jag invantar fortsatt kontakt.',
              },
            ],
          },
          {
            conversationId: 'conv-riskword',
            subject: 'Akut fraga',
            status: 'open',
            slaDeadlineAt: isoAtOffset(48 * hourMs),
            messages: [
              {
                messageId: 'msg-riskword',
                direction: 'inbound',
                sentAt: isoAtOffset(-2 * hourMs),
                bodyPreview: 'Jag har akut andningssvarigheter och behover snabb uppfoljning.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: isoAtOffset(0),
        },
      },
    });

    const needsReplyTodayIds = new Set(
      output.data.needsReplyToday.map((item) => item.conversationId)
    );
    const urgentByConversationId = new Map(
      output.data.urgentConversations.map((item) => [item.conversationId, item])
    );
    const riskFlagsForRiskWord = output.data.riskFlags
      .filter((item) => item.conversationId === 'conv-riskword')
      .map((item) => item.flagCode);

    assert.equal(needsReplyTodayIds.has('conv-sla-24h'), true);
    assert.equal(needsReplyTodayIds.has('conv-sla-48h'), false);
    assert.equal(needsReplyTodayIds.has('conv-riskword'), true);

    assert.equal(urgentByConversationId.has('conv-sla-24h'), false);
    assert.equal(urgentByConversationId.has('conv-sla-48h'), false);
    assert.equal(urgentByConversationId.get('conv-riskword')?.reason, 'risk_flag');
    assert.equal(riskFlagsForRiskWord.includes('ACUTE_URGENT'), true);
    assert.equal(output.data.priorityLevel, 'High');
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox debug mode exposes snapshot structure for conversations', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inbox-debug',
    correlationId: 'corr-inbox-debug',
    input: {
      debug: true,
      maxDrafts: 2,
    },
    systemStateSnapshot: {
      snapshotVersion: 'inbox.snapshot.v1',
      conversations: [
        {
          conversationId: 'conv-1',
          subject: 'Akut fraga',
          status: 'open',
          messages: [
            {
              messageId: 'msg-1',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Akut problem, ring mig pa 0731234567',
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: '2026-02-26T12:00:00.000Z',
        sourceGeneratedAt: '2026-02-26T11:59:59.000Z',
      },
    },
  });

  const snapshotDebug = output?.metadata?.snapshotDebug;
  assert.equal(Boolean(snapshotDebug), true);
  assert.equal(Array.isArray(snapshotDebug.keys), true);
  assert.equal(snapshotDebug.keys.includes('conversations'), true);
  assert.equal(typeof snapshotDebug.counts?.conversations, 'number');
  assert.equal(snapshotDebug.snapshotVersion, 'inbox.snapshot.v1');
  assert.equal(snapshotDebug.timestamp, '2026-02-26T12:00:00.000Z');
});

test('AnalyzeInbox omits empty optional metadata fields', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    input: {
      maxDrafts: 1,
    },
    systemStateSnapshot: {
      conversations: [],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  const validation = validateJsonSchema({
    schema: analyzeInboxCapability.outputSchema,
    value: output,
    rootPath: 'capability.output',
  });
  assert.equal(validation.ok, true, `schema validation errors: ${JSON.stringify(validation.errors)}`);
  assert.equal('requestId' in output.metadata, false);
  assert.equal('correlationId' in output.metadata, false);
});
