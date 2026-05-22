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
            {
              messageId: 'msg-1-out',
              direction: 'outbound',
              sentAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
              bodyPreview: 'Tack för ditt meddelande. Vi återkommer inom kort.',
              bodyHtml:
                '<div><p>Tack för ditt meddelande.</p><img src="https://arcana.hairtpclinic.se/assets/hair-tp-clinic/hairtpclinic-mark-light.svg" alt="Hair TP Clinic" /></div>',
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
  assert.equal(['Low', 'Medium', 'High', 'Critical'].includes(output.data.priorityLevel), true);
  assert.equal(typeof output.data.needsReplyToday?.[0]?.intentConfidence, 'number');
  assert.equal(output.data.needsReplyToday?.[0]?.intentConfidence >= 0, true);
  assert.equal(output.data.needsReplyToday?.[0]?.intentConfidence <= 1, true);
  assert.equal(typeof output.data.needsReplyToday?.[0]?.toneConfidence, 'number');
  assert.equal(output.data.needsReplyToday?.[0]?.toneConfidence >= 0, true);
  assert.equal(output.data.needsReplyToday?.[0]?.toneConfidence <= 1, true);
  assert.equal(typeof output.data.conversationWorklist?.[0]?.toneConfidence, 'number');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.hoursRemaining, 'number');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.slaThreshold, 'number');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.hasUnreadInbound, 'boolean');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.isUnanswered, 'boolean');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.unansweredThresholdHours, 'number');
  assert.equal(
    ['string', 'object'].includes(typeof output.data.conversationWorklist?.[0]?.mailboxAddress),
    true
  );
  assert.equal(
    ['string', 'object'].includes(typeof output.data.conversationWorklist?.[0]?.userPrincipalName),
    true
  );
  assert.equal(typeof output.data.conversationWorklist?.[0]?.stagnated, 'boolean');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.stagnationHours, 'number');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.followUpSuggested, 'boolean');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.customerKey, 'string');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.customerSummary?.customerName, 'string');
  assert.equal(
    ['none', 'reschedule', 'complaint', 'booking', 'mixed'].includes(
      output.data.conversationWorklist?.[0]?.customerSummary?.historySignalPattern
    ),
    true
  );
  assert.equal(
    ['responsive', 'reflective', 'hesitant', 'low_engagement'].includes(
      output.data.conversationWorklist?.[0]?.tempoProfile
    ),
    true
  );
  assert.equal(typeof output.data.conversationWorklist?.[0]?.recommendedFollowUpDelayDays, 'number');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.followUpManualApprovalRequired, 'boolean');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.estimatedWorkMinutes, 'number');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.workloadBreakdown?.base, 'number');
  assert.equal(
    ['miss', 'tone', 'follow_up', 'relationship', 'neutral'].includes(
      output.data.conversationWorklist?.[0]?.dominantRisk
    ),
    true
  );
  assert.equal(typeof output.data.conversationWorklist?.[0]?.riskStackScore, 'number');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.riskStackExplanation, 'string');
  assert.equal(Array.isArray(output.data.customerSummaries), true);
  assert.equal(Array.isArray(output.data.inboundFeed), true);
  assert.equal(Array.isArray(output.data.outboundFeed), true);
  assert.equal(output.data.inboundFeed.length >= 1, true);
  assert.equal(output.data.outboundFeed.length >= 1, true);
  assert.equal(output.data.inboundFeed[0].direction, 'inbound');
  assert.equal(['boolean', 'object', 'undefined'].includes(typeof output.data.inboundFeed[0].isRead), true);
  assert.equal(output.data.outboundFeed[0].direction, 'outbound');
  assert.match(
    String(output.data.outboundFeed[0].bodyHtml || ''),
    /hairtpclinic-mark-light\.svg/
  );
  const firstDraft = output.data.suggestedDrafts?.[0] || {};
  assert.equal(typeof firstDraft?.draftModes?.short, 'string');
  assert.equal(typeof firstDraft?.draftModes?.warm, 'string');
  assert.equal(typeof firstDraft?.draftModes?.professional, 'string');
  assert.equal(['short', 'warm', 'professional'].includes(firstDraft.recommendedMode), true);
  assert.equal(typeof firstDraft?.structureUsed?.acknowledgement, 'string');
  assert.equal(typeof firstDraft?.structureUsed?.coreAnswer, 'string');
  assert.equal(typeof firstDraft?.structureUsed?.cta, 'string');
  assert.equal(
    ['miss', 'tone', 'follow_up', 'relationship', 'neutral'].includes(firstDraft?.dominantRisk),
    true
  );
  assert.equal(typeof firstDraft?.riskStackScore, 'number');
  assert.equal(typeof firstDraft?.riskStackExplanation, 'string');
  assert.equal(output.metadata.capability, 'AnalyzeInbox');
});

test('AnalyzeInbox surfaces unread inbound separately from unanswered state', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inbox-unread',
    correlationId: 'corr-inbox-unread',
    input: {
      includeClosed: false,
      maxDrafts: 1,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-unread-1',
          subject: 'Kan ni hjälpa mig med pris?',
          status: 'open',
          messages: [
            {
              messageId: 'msg-unread-1',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Hej, jag vill veta mer om pris för behandling.',
              isRead: false,
            },
          ],
        },
        {
          conversationId: 'conv-read-1',
          subject: 'Uppföljning efter svar',
          status: 'open',
          messages: [
            {
              messageId: 'msg-read-1',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Tack, jag återkommer om jag har fler frågor.',
              isRead: true,
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  const unreadRow = output.data.conversationWorklist.find((item) => item.conversationId === 'conv-unread-1');
  const readRow = output.data.conversationWorklist.find((item) => item.conversationId === 'conv-read-1');
  const unreadFeed = output.data.inboundFeed.find((item) => item.conversationId === 'conv-unread-1');
  const readFeed = output.data.inboundFeed.find((item) => item.conversationId === 'conv-read-1');

  assert.equal(unreadRow?.hasUnreadInbound, true);
  assert.equal(readRow?.hasUnreadInbound, false);
  assert.equal(unreadFeed?.isRead, false);
  assert.equal(readFeed?.isRead, true);
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

  assert.match(reply, /medicinsk bed[oö]mning/);
  assert.equal(reply.includes('garanti'), false);
  assert.equal(reply.includes('100%'), false);
  assert.equal(reply.includes('diagnos'), false);
});

test('AnalyzeInbox derives preview from inbound bodyHtml and customer name from subject when sender is placeholder', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inbox-preview-fallback',
    correlationId: 'corr-inbox-preview-fallback',
    input: {
      includeClosed: false,
      maxDrafts: 1,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-preview-fallback',
          subject: 'Noha Haj omar Kontaktformulär',
          status: 'open',
          sender: 'Okänd avsändare',
          messages: [
            {
              messageId: 'msg-preview-fallback',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              senderName: 'Okänd avsändare',
              bodyPreview: '',
              bodyHtml:
                '<div>Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?</div>',
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  const row = output.data.conversationWorklist.find(
    (item) => item.conversationId === 'conv-preview-fallback'
  );

  assert.equal(row?.customerSummary?.customerName, 'Noha Haj omar');
  assert.match(String(row?.latestInboundPreview || ''), /ögonbrynshår/);
});

test('AnalyzeInbox bevarar lang outbound bodyHtml med inline-image over legacy 24000 cutoff', async () => {
  const longDataImage = `data:image/png;base64,${'QUJD'.repeat(7000)}`;
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inbox-long-inline-html',
    correlationId: 'corr-inbox-long-inline-html',
    input: {
      includeClosed: false,
      maxDrafts: 1,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-long-inline-html',
          subject: 'Grafisk signatur',
          status: 'open',
          messages: [
            {
              messageId: 'msg-inline-html-in',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Hej, jag vill återkomma.',
              senderEmail: 'patient@example.com',
              senderName: 'Patient',
            },
            {
              messageId: 'msg-inline-html-out',
              direction: 'outbound',
              sentAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
              bodyPreview: 'Hej! Här kommer mitt svar.',
              bodyHtml: `<div><p>Hej!</p><img src="${longDataImage}" alt="Hair TP Clinic" /></div>`,
              senderEmail: 'contact@hairtpclinic.com',
              senderName: 'Contact',
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  const bodyHtml = String(output.data.outboundFeed[0]?.bodyHtml || '');
  assert.equal(bodyHtml.length > 24000, true);
  assert.equal(bodyHtml.includes('data:image/png;base64,'), true);
  assert.equal(bodyHtml.endsWith('</div>'), true);
});

test('AnalyzeInbox carries safe attachment metadata into inbound feed entries for live runtime previews', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-inbox-attachment-feed',
    correlationId: 'corr-inbox-attachment-feed',
    input: {
      includeClosed: false,
      maxDrafts: 1,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-attachment-feed',
          subject: 'Bifogad order',
          status: 'open',
          messages: [
            {
              messageId: 'msg-attachment-feed',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Se bifogad order.',
              bodyHtml: '<div>Se bifogad order.</div>',
              hasAttachments: true,
              attachments: [
                {
                  id: 'att-file-1',
                  name: 'order.pdf',
                  contentType: 'application/pdf',
                  isInline: false,
                  size: 12000,
                  sourceType: 'graph_file_attachment',
                  contentBytesAvailable: false,
                },
              ],
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  const inboundFeed = output.data.inboundFeed.find(
    (item) => item.conversationId === 'conv-attachment-feed'
  );
  assert.equal(inboundFeed?.hasAttachments, true);
  assert.equal(Array.isArray(inboundFeed?.attachments), true);
  assert.equal(inboundFeed.attachments.length, 1);
  assert.equal(inboundFeed.attachments[0]?.name, 'order.pdf');
  assert.equal(inboundFeed.attachments[0]?.isInline, false);
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
  assert.match(reply, /\bring(a)? 112\b/);
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

test('AnalyzeInbox enriches SLA monitor statuses and keeps risk-word urgency signals', async () => {
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
            conversationId: 'conv-sla-breach',
            subject: 'Äldre uppföljning',
            status: 'open',
            messages: [
              {
                messageId: 'msg-sla-breach',
                direction: 'inbound',
                sentAt: isoAtOffset(-30 * hourMs),
                bodyPreview: 'Hej, jag foljer upp mitt arende.',
              },
            ],
          },
          {
            conversationId: 'conv-sla-warning',
            subject: 'Klagomål väntar',
            status: 'open',
            messages: [
              {
                messageId: 'msg-sla-warning',
                direction: 'inbound',
                sentAt: isoAtOffset(-9 * hourMs),
                bodyPreview: 'Jag är missnöjd och vill lämna klagomål.',
              },
            ],
          },
          {
            conversationId: 'conv-sla-safe',
            subject: 'Nyare uppföljning',
            status: 'open',
            messages: [
              {
                messageId: 'msg-sla-safe',
                direction: 'inbound',
                sentAt: isoAtOffset(-10 * hourMs),
                bodyPreview: 'Hej, jag vill ha en statusuppdatering.',
              },
            ],
          },
          {
            conversationId: 'conv-riskword',
            subject: 'Akut fraga',
            status: 'open',
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

    const needsReplyTodayIds = new Set(output.data.needsReplyToday.map((item) => item.conversationId));
    const urgentByConversationId = new Map(
      output.data.urgentConversations.map((item) => [item.conversationId, item])
    );
    const worklistByConversationId = new Map(
      output.data.conversationWorklist.map((item) => [item.conversationId, item])
    );
    const riskFlagsForRiskWord = output.data.riskFlags
      .filter((item) => item.conversationId === 'conv-riskword')
      .map((item) => item.flagCode);

    assert.equal(needsReplyTodayIds.has('conv-sla-breach'), true);
    assert.equal(needsReplyTodayIds.has('conv-sla-warning'), true);
    assert.equal(needsReplyTodayIds.has('conv-sla-safe'), true);
    assert.equal(needsReplyTodayIds.has('conv-riskword'), true);
    assert.equal(worklistByConversationId.get('conv-sla-breach')?.slaStatus, 'breach');
    assert.equal(worklistByConversationId.get('conv-sla-breach')?.dominantRisk, 'miss');
    assert.equal(worklistByConversationId.get('conv-sla-warning')?.slaStatus, 'warning');
    assert.equal(worklistByConversationId.get('conv-sla-safe')?.slaStatus, 'safe');

    assert.equal(urgentByConversationId.has('conv-sla-warning'), false);
    assert.equal(urgentByConversationId.get('conv-riskword')?.reason, 'risk_flag');
    assert.equal(riskFlagsForRiskWord.includes('ACUTE_URGENT'), true);
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox keeps systemmail out of the active worklist and sprint-driving buckets', async () => {
  const fixedNowMs = Date.parse('2026-03-03T12:00:00.000Z');
  const originalNow = Date.now;
  const hourMs = 60 * 60 * 1000;
  const isoAtOffset = (offsetMs) => new Date(fixedNowMs + offsetMs).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-systemmail',
      correlationId: 'corr-inbox-systemmail',
      input: {
        maxDrafts: 5,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-system-mail',
            subject: 'Orderbekräftelse 12345',
            status: 'open',
            messages: [
              {
                messageId: 'msg-system-mail',
                direction: 'inbound',
                sentAt: isoAtOffset(-30 * hourMs),
                senderEmail: 'noreply@booking.example.com',
                bodyPreview: 'Detta är ett automatiskt kvitto. Do-not-reply.',
              },
            ],
          },
          {
            conversationId: 'conv-actionable-mail',
            subject: 'Klagomål efter behandling',
            status: 'open',
            messages: [
              {
                messageId: 'msg-actionable-mail',
                direction: 'inbound',
                sentAt: isoAtOffset(-8 * hourMs),
                senderEmail: 'patient@example.com',
                bodyPreview: 'Jag är missnöjd och vill ha återkoppling.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: isoAtOffset(0),
        },
      },
    });

    const byConversation = new Map(
      output.data.conversationWorklist.map((item) => [item.conversationId, item])
    );
    assert.equal(byConversation.has('conv-system-mail'), false);
    assert.equal(byConversation.get('conv-actionable-mail')?.messageClassification, 'actionable');

    const needsReplyIds = new Set(output.data.needsReplyToday.map((item) => item.conversationId));
    assert.equal(needsReplyIds.has('conv-system-mail'), false);
    assert.equal(needsReplyIds.has('conv-actionable-mail'), true);

    const urgentIds = new Set(output.data.urgentConversations.map((item) => item.conversationId));
    assert.equal(urgentIds.has('conv-system-mail'), false);

    const draftIds = new Set(output.data.suggestedDrafts.map((item) => item.conversationId));
    assert.equal(draftIds.has('conv-system-mail'), false);
    assert.equal(draftIds.has('conv-actionable-mail'), true);

    const slaBreachIds = new Set(output.data.slaBreaches.map((item) => item.conversationId));
    assert.equal(slaBreachIds.has('conv-system-mail'), false);
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox keeps human clinic inquiries actionable even with system-mail markers in the text', async () => {
  const fixedNowMs = Date.parse('2026-03-03T12:00:00.000Z');
  const originalNow = Date.now;
  const hourMs = 60 * 60 * 1000;
  const isoAtOffset = (offsetMs) => new Date(fixedNowMs + offsetMs).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-human-inquiry',
      correlationId: 'corr-inbox-human-inquiry',
      input: {
        maxDrafts: 5,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-human-inquiry',
            subject: 'Fråga om tvätt av hårbotten efter ingreppet',
            status: 'open',
            messages: [
              {
                messageId: 'msg-human-inquiry',
                direction: 'inbound',
                sentAt: isoAtOffset(-7 * hourMs),
                senderEmail: 'alfred@example.com',
                bodyPreview:
                  'Hej, jag har en fråga om tvätt av hårbotten efter ingreppet. Längst ner står unsubscribe från min mailklient.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: isoAtOffset(0),
        },
      },
    });

    const workItem = output.data.conversationWorklist.find(
      (item) => item.conversationId === 'conv-human-inquiry'
    );
    assert.equal(workItem?.messageClassification, 'actionable');

    const needsReplyIds = new Set(output.data.needsReplyToday.map((item) => item.conversationId));
    assert.equal(needsReplyIds.has('conv-human-inquiry'), true);

    const draftIds = new Set(output.data.suggestedDrafts.map((item) => item.conversationId));
    assert.equal(draftIds.has('conv-human-inquiry'), true);
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox keeps generic external newsletters and order confirmations out of the active worklist', async () => {
  const fixedNowMs = Date.parse('2026-03-03T12:00:00.000Z');
  const originalNow = Date.now;
  const hourMs = 60 * 60 * 1000;
  const isoAtOffset = (offsetMs) => new Date(fixedNowMs + offsetMs).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-generic-external',
      correlationId: 'corr-inbox-generic-external',
      input: {
        maxDrafts: 5,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-foodora-order',
            subject: 'Orderbekräftelse: (s2uh-2612-dj45)',
            status: 'open',
            messages: [
              {
                messageId: 'msg-foodora-order',
                direction: 'inbound',
                sentAt: isoAtOffset(-30 * hourMs),
                senderEmail: 'orders@foodora.se',
                bodyPreview: 'Din order är mottagen. Do-not-reply.',
              },
            ],
          },
          {
            conversationId: 'conv-newsletter',
            subject: 'Nyheter: Reflect-kollektionen',
            status: 'open',
            messages: [
              {
                messageId: 'msg-newsletter',
                direction: 'inbound',
                sentAt: isoAtOffset(-32 * hourMs),
                senderEmail: 'updates@georgjensen.se',
                bodyPreview: 'Nyheter och erbjudanden för dig som prenumererar på vårt nyhetsbrev.',
              },
            ],
          },
          {
            conversationId: 'conv-real-patient',
            subject: 'Fråga om pris för hårtransplantation',
            status: 'open',
            messages: [
              {
                messageId: 'msg-real-patient',
                direction: 'inbound',
                sentAt: isoAtOffset(-6 * hourMs),
                senderEmail: 'patient@example.com',
                bodyPreview: 'Hej, jag vill veta vad en hårtransplantation kostar och om ni har tider i april.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: isoAtOffset(0),
        },
      },
    });

    const byConversation = new Map(
      output.data.conversationWorklist.map((item) => [item.conversationId, item])
    );
    assert.equal(byConversation.has('conv-foodora-order'), false);
    assert.equal(byConversation.has('conv-newsletter'), false);
    assert.equal(byConversation.get('conv-real-patient')?.messageClassification, 'actionable');

    const needsReplyIds = new Set(output.data.needsReplyToday.map((item) => item.conversationId));
    assert.equal(needsReplyIds.has('conv-foodora-order'), false);
    assert.equal(needsReplyIds.has('conv-newsletter'), false);
    assert.equal(needsReplyIds.has('conv-real-patient'), true);
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox applies mailbox-specific writing identity overrides to drafts', async () => {
  const baseSentAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-writing-inbox',
    actor: { id: 'owner-writing', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-writing-inbox',
    correlationId: 'corr-writing-inbox',
    input: {
      maxDrafts: 2,
      writingIdentityProfiles: {
        profilesByMailbox: {
          'egzona@hairtpclinic.com': {
            greetingStyle: 'Hej {{name}},',
            closingStyle: 'Bästa hälsningar',
            formalityLevel: 7,
            ctaStyle: 'calm-guiding',
            sentenceLength: 'medium',
            emojiUsage: false,
            warmthIndex: 8,
          },
          'fazli@hairtpclinic.com': {
            greetingStyle: 'Hej,',
            closingStyle: 'Vänliga hälsningar',
            formalityLevel: 9,
            ctaStyle: 'direct-structured',
            sentenceLength: 'short',
            emojiUsage: false,
            warmthIndex: 4,
          },
        },
      },
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-writing-egzona',
          subject: 'Bokning konsultation',
          status: 'open',
          mailboxAddress: 'egzona@hairtpclinic.com',
          messages: [
            {
              messageId: 'msg-writing-egzona',
              direction: 'inbound',
              sentAt: baseSentAt,
              mailboxAddress: 'egzona@hairtpclinic.com',
              bodyPreview: 'Hej, jag vill boka tid och är lite orolig inför behandlingen.',
            },
          ],
        },
        {
          conversationId: 'conv-writing-fazli',
          subject: 'Bokning konsultation',
          status: 'open',
          mailboxAddress: 'fazli@hairtpclinic.com',
          messages: [
            {
              messageId: 'msg-writing-fazli',
              direction: 'inbound',
              sentAt: baseSentAt,
              mailboxAddress: 'fazli@hairtpclinic.com',
              bodyPreview: 'Hej, jag vill boka tid och är lite orolig inför behandlingen.',
            },
          ],
        },
      ],
      timestamps: {
        capturedAt: new Date().toISOString(),
      },
    },
  });

  const draftsByConversation = new Map(
    (Array.isArray(output?.data?.suggestedDrafts) ? output.data.suggestedDrafts : []).map((draft) => [
      draft.conversationId,
      draft,
    ])
  );
  const egzonaDraft = draftsByConversation.get('conv-writing-egzona');
  const fazliDraft = draftsByConversation.get('conv-writing-fazli');
  assert.equal(Boolean(egzonaDraft), true);
  assert.equal(Boolean(fazliDraft), true);
  assert.notEqual(
    String(egzonaDraft?.proposedReply || ''),
    String(fazliDraft?.proposedReply || '')
  );
});

test('AnalyzeInbox exposes contact as default sender and default signature profile metadata', async () => {
  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-contact-default',
    actor: { id: 'owner-contact-default', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-contact-default',
    correlationId: 'corr-contact-default',
    input: {
      maxDrafts: 1,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-contact-default',
          subject: 'Fråga om konsultation',
          status: 'open',
          mailboxAddress: 'kons@hairtpclinic.com',
          messages: [
            {
              messageId: 'msg-contact-default',
              direction: 'inbound',
              sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              mailboxAddress: 'kons@hairtpclinic.com',
              bodyPreview: 'Hej, jag vill ha hjälp med en konsultationstid.',
            },
          ],
        },
      ],
    },
  });

  assert.equal(output.metadata.ccoDefaultSenderMailbox, 'contact@hairtpclinic.com');
  assert.equal(output.metadata.ccoDefaultSignatureProfile, 'fazli');
  assert.deepEqual(
    output.metadata.ccoSenderMailboxOptions,
    [
      'contact@hairtpclinic.com',
      'kons@hairtpclinic.com',
      'egzona@hairtpclinic.com',
      'fazli@hairtpclinic.com',
    ]
  );
  assert.deepEqual(
    output.metadata.ccoSignatureProfiles.map((item) => item.key),
    ['egzona', 'fazli']
  );
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

test('AnalyzeInbox sorts worklist with SLA breach first before priorityScore', async () => {
  const fixedNowMs = Date.parse('2026-02-28T12:00:00.000Z');
  const originalNow = Date.now;
  const hourMs = 60 * 60 * 1000;
  const isoHoursAgo = (hours) => new Date(fixedNowMs - hours * hourMs).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-priority-sort',
      correlationId: 'corr-inbox-priority-sort',
      input: {
        maxDrafts: 5,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-breach-lower-score',
            subject: 'Äldre oklart',
            status: 'open',
            messages: [
              {
                messageId: 'msg-breach-lower-score',
                direction: 'inbound',
                sentAt: isoHoursAgo(30),
                bodyPreview: 'Hej, kan ni hjälpa mig vidare?',
              },
            ],
          },
          {
            conversationId: 'conv-safe-higher-score',
            subject: 'Klagomål',
            status: 'open',
            openCommitments: true,
            repeatCustomer: true,
            estimatedRevenueBand: 'high',
            messages: [
              {
                messageId: 'msg-safe-higher-score',
                direction: 'inbound',
                sentAt: isoHoursAgo(2),
                bodyPreview: 'Jag är missnöjd och vill lämna klagomål.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: new Date(fixedNowMs).toISOString(),
        },
      },
    });

    const ids = output.data.conversationWorklist.map((item) => item.conversationId);
    assert.deepEqual(ids.slice(0, 2), [
      'conv-breach-lower-score',
      'conv-safe-higher-score',
    ]);

    const topItem = output.data.conversationWorklist[0];
    const secondItem = output.data.conversationWorklist[1];
    assert.equal(topItem.slaStatus, 'breach');
    assert.equal(secondItem.slaStatus, 'safe');
    assert.equal(secondItem.priorityScore > topItem.priorityScore, true);
    assert.equal(typeof topItem.priorityScore, 'number');
    assert.equal(Array.isArray(topItem.priorityReasons), true);
    assert.equal(topItem.priorityReasons.length > 0, true);
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox includes customer context factors in priority reasons', async () => {
  const fixedNowMs = Date.parse('2026-02-28T12:00:00.000Z');
  const originalNow = Date.now;
  const isoHoursAgo = (hours) => new Date(fixedNowMs - hours * 60 * 60 * 1000).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-customer-context',
      correlationId: 'corr-inbox-customer-context',
      input: {
        maxDrafts: 2,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-context-rich',
            subject: 'Boka tid',
            status: 'open',
            openCommitments: true,
            repeatCustomer: true,
            estimatedRevenueBand: 'high',
            messages: [
              {
                messageId: 'msg-context-rich',
                direction: 'inbound',
                sentAt: isoHoursAgo(26),
                bodyPreview: 'Jag vill boka en tid för uppföljning.',
              },
            ],
          },
          {
            conversationId: 'conv-context-basic',
            subject: 'Boka tid',
            status: 'open',
            messages: [
              {
                messageId: 'msg-context-basic',
                direction: 'inbound',
                sentAt: isoHoursAgo(26),
                bodyPreview: 'Jag vill boka en tid för uppföljning.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: new Date(fixedNowMs).toISOString(),
        },
      },
    });

    const byId = new Map(
      output.data.conversationWorklist.map((item) => [item.conversationId, item])
    );
    const rich = byId.get('conv-context-rich');
    const basic = byId.get('conv-context-basic');

    assert.equal(Boolean(rich), true);
    assert.equal(Boolean(basic), true);
    assert.equal(rich.priorityScore > basic.priorityScore, true);
    assert.equal(rich.priorityReasons.includes('CUSTOMER_OPEN_COMMITMENTS:+15'), true);
    assert.equal(rich.priorityReasons.includes('CUSTOMER_REPEAT:+5'), true);
    assert.equal(rich.priorityReasons.includes('CUSTOMER_REVENUE_HIGH:+10'), true);
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox carries customer history signals into priority, recommendation and summary', async () => {
  const fixedNowMs = Date.parse('2026-03-10T12:00:00.000Z');
  const originalNow = Date.now;
  const isoHoursAgo = (hours) => new Date(fixedNowMs - hours * 60 * 60 * 1000).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-history-signal',
      correlationId: 'corr-inbox-history-signal',
      input: {
        maxDrafts: 1,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-history-signal',
            subject: 'Boka om min tid',
            status: 'open',
            historySignals: {
              pattern: 'reschedule',
              summary: 'Historik visar återkommande ombokning över flera mailboxar.',
              actionCue: 'Skicka två konkreta tider direkt och be kunden välja i samma svar.',
              mailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
              mailboxCount: 2,
              messageCount: 6,
              recentMessageCount: 4,
              latestMessageAt: new Date(fixedNowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
              outcomeCode: 'rebooked',
              outcomeSummary: 'Tidigare utfall: ombokning lyckades efter tydliga alternativ.',
              outcomeActionCue: 'Upprepa två tydliga tider direkt.',
              outcomeAt: new Date(fixedNowMs - 24 * 60 * 60 * 1000).toISOString(),
            },
            messages: [
              {
                messageId: 'msg-history-signal',
                direction: 'inbound',
                senderEmail: 'kund@example.com',
                sentAt: isoHoursAgo(28),
                bodyPreview: 'Hej, jag behöver boka om min tid och vill gärna ha två nya alternativ.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: new Date(fixedNowMs).toISOString(),
        },
      },
    });

    const row = output.data.conversationWorklist.find((item) => item.conversationId === 'conv-history-signal');
    assert.equal(Boolean(row), true);
    assert.equal(row.priorityReasons.includes('HISTORY_PATTERN_RESCHEDULE:+8'), true);
    assert.equal(row.priorityReasons.includes('HISTORY_MULTI_MAILBOX:+6'), true);
    assert.equal(row.priorityReasons.includes('HISTORY_RECENT_ACTIVITY:+5'), true);
    assert.equal(row.recommendedAction.includes('två tydliga tider direkt'), true);
    assert.equal(row.customerSummary.historySignalPattern, 'reschedule');
    assert.equal(row.customerSummary.historyMailboxCount, 2);
    assert.equal(row.customerSummary.historyRecentMessageCount, 4);
    assert.equal(row.customerSummary.historyOutcomeCode, 'rebooked');
    assert.equal(row.customerSummary.historyOutcomeSummary.includes('ombokning lyckades'), true);
    const suggestedDraft = output.data.suggestedDrafts.find(
      (item) => item.conversationId === 'conv-history-signal'
    );
    assert.equal(Boolean(suggestedDraft), true);
    assert.equal(
      String(
        suggestedDraft.draftModes?.[suggestedDraft.recommendedMode] || suggestedDraft.draftModes?.professional || ''
      ).includes('Tidigare liknande dialog löstes bäst med två tydliga alternativ direkt.'),
      true
    );
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox uses calibration history to shape priority, action and draft mode', async () => {
  const fixedNowMs = Date.parse('2026-03-10T12:00:00.000Z');
  const originalNow = Date.now;
  const isoHoursAgo = (hours) => new Date(fixedNowMs - hours * 60 * 60 * 1000).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-calibration-signal',
      correlationId: 'corr-inbox-calibration-signal',
      input: {
        maxDrafts: 1,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-calibration-signal',
            subject: 'Jag behöver boka om min tid',
            status: 'open',
            historySignals: {
              pattern: 'reschedule',
              summary: 'Historik visar återkommande ombokning över flera mailboxar.',
              actionCue: 'Skicka två konkreta tider direkt och be kunden välja i samma svar.',
              mailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
              mailboxCount: 2,
              messageCount: 8,
              recentMessageCount: 5,
              latestMessageAt: new Date(fixedNowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
              outcomeCode: 'rebooked',
              outcomeSummary: 'Tidigare utfall: ombokning lyckades efter tydliga alternativ.',
              outcomeActionCue: 'Upprepa två tydliga tider direkt.',
              outcomeAt: new Date(fixedNowMs - 24 * 60 * 60 * 1000).toISOString(),
              calibrationSummary: 'Utfallshistorik: professionell ton gav bäst resultat, men uteblivet svar återkommer i liknande trådar.',
              calibrationActionCue: 'Behåll professionell ton och ge två tydliga alternativ direkt.',
              preferredMode: 'professional',
              positiveOutcomeCount: 3,
              negativeOutcomeCount: 2,
              dominantFailureOutcome: 'no_response',
              dominantFailureRisk: 'relationship',
            },
            messages: [
              {
                messageId: 'msg-calibration-signal',
                direction: 'inbound',
                senderEmail: 'kund@example.com',
                sentAt: isoHoursAgo(28),
                bodyPreview: 'Hej, jag behöver boka om min tid så snart som möjligt.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: new Date(fixedNowMs).toISOString(),
        },
      },
    });

    const row = output.data.conversationWorklist.find((item) => item.conversationId === 'conv-calibration-signal');
    assert.equal(Boolean(row), true);
    assert.equal(row.priorityReasons.includes('HISTORY_CALIBRATION_REPEAT_NEGATIVE:+4'), true);
    assert.equal(row.priorityReasons.includes('HISTORY_CALIBRATION_NO_RESPONSE:+4'), true);
    assert.equal(row.priorityReasons.includes('HISTORY_CALIBRATION_RELATIONSHIP:+4'), true);
    assert.equal(row.recommendedAction.includes('två tydliga tider'), true);

    const suggestedDraft = output.data.suggestedDrafts.find(
      (item) => item.conversationId === 'conv-calibration-signal'
    );
    assert.equal(Boolean(suggestedDraft), true);
    assert.equal(suggestedDraft.recommendedMode, 'professional');
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox enriches follow-up timing with booking weekday scheduling', async () => {
  const fixedNowMs = Date.parse('2026-03-01T08:00:00.000Z');
  const originalNow = Date.now;
  const isoHoursAgo = (hours) => new Date(fixedNowMs - hours * 60 * 60 * 1000).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-followup-timing',
      correlationId: 'corr-inbox-followup-timing',
      input: {
        maxDrafts: 2,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-followup-booking',
            subject: 'Book appointment',
            status: 'open',
            messages: [
              {
                messageId: 'msg-followup-booking',
                direction: 'inbound',
                sentAt: isoHoursAgo(80),
                bodyPreview: 'Hej, jag vill book appointment men är osäker.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: new Date(fixedNowMs).toISOString(),
        },
      },
    });

    const row = output.data.conversationWorklist.find(
      (item) => item.conversationId === 'conv-followup-booking'
    );
    assert.equal(Boolean(row), true);
    assert.equal(row.followUpSuggested, true);
    assert.equal(typeof row.followUpSuggestedAt, 'string');
    assert.equal(Array.isArray(row.followUpTimingReason), true);
    assert.equal(row.followUpTimingReason.includes('booking_next_weekday'), true);
    assert.equal(row.followUpTimingReason.includes('weekday_window'), true);
    assert.equal(row.followUpManualApprovalRequired, true);

    const scheduled = new Date(row.followUpSuggestedAt);
    assert.equal(scheduled.getUTCDay() === 0, false);
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox sets intent-based unanswered thresholds with true unanswered state', async () => {
  const fixedNowMs = Date.parse('2026-03-01T12:00:00.000Z');
  const originalNow = Date.now;
  const isoHoursAgo = (hours) => new Date(fixedNowMs - hours * 60 * 60 * 1000).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-unanswered-thresholds',
      correlationId: 'corr-inbox-unanswered-thresholds',
      input: {
        maxDrafts: 2,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-complaint-threshold',
            subject: 'Klagomål',
            status: 'open',
            messages: [
              {
                messageId: 'msg-complaint-threshold',
                direction: 'inbound',
                sentAt: isoHoursAgo(7),
                bodyPreview: 'Jag är missnöjd och vill lämna klagomål.',
              },
            ],
          },
          {
            conversationId: 'conv-booking-threshold',
            subject: 'Bokning',
            status: 'open',
            messages: [
              {
                messageId: 'msg-booking-threshold',
                direction: 'inbound',
                sentAt: isoHoursAgo(7),
                bodyPreview: 'Jag vill boka en tid nästa vecka.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: new Date(fixedNowMs).toISOString(),
        },
      },
    });

    const byId = new Map(
      output.data.conversationWorklist.map((item) => [item.conversationId, item])
    );
    const complaint = byId.get('conv-complaint-threshold');
    const booking = byId.get('conv-booking-threshold');

    assert.equal(complaint.unansweredThresholdHours, 6);
    assert.equal(complaint.isUnanswered, true);
    assert.equal(booking.unansweredThresholdHours, 12);
    assert.equal(booking.isUnanswered, true);
  } finally {
    Date.now = originalNow;
  }
});

test('AnalyzeInbox excludes conversation when outbound is newer than inbound', async () => {
  const fixedNowMs = Date.parse('2026-03-01T12:00:00.000Z');
  const originalNow = Date.now;
  const isoHoursAgo = (hours) => new Date(fixedNowMs - hours * 60 * 60 * 1000).toISOString();

  Date.now = () => fixedNowMs;
  try {
    const output = await new analyzeInboxCapability().execute({
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
      requestId: 'req-inbox-answered-by-outbound',
      correlationId: 'corr-inbox-answered-by-outbound',
      input: {
        maxDrafts: 2,
      },
      systemStateSnapshot: {
        conversations: [
          {
            conversationId: 'conv-answered',
            subject: 'Bokning',
            status: 'open',
            messages: [
              {
                messageId: 'msg-answered-inbound',
                direction: 'inbound',
                sentAt: isoHoursAgo(4),
                bodyPreview: 'Hej, jag vill boka en tid.',
              },
              {
                messageId: 'msg-answered-outbound',
                direction: 'outbound',
                sentAt: isoHoursAgo(2),
                bodyPreview: 'Hej! Här är två tider att välja mellan.',
              },
            ],
          },
        ],
        timestamps: {
          capturedAt: new Date(fixedNowMs).toISOString(),
        },
      },
    });

    assert.equal(output.data.conversationWorklist.length, 0);
    assert.equal(output.data.needsReplyToday.length, 0);
    assert.equal(output.data.urgentConversations.length, 0);
  } finally {
    Date.now = originalNow;
  }
});
