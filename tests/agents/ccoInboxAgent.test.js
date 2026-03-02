const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CCO_AGENT_NAME,
  ccoInboxAnalysisOutputSchema,
  composeCcoInboxAnalysis,
} = require('../../src/agents/ccoInboxAgent');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

function makeDraft(index) {
  return {
    conversationId: `conv-${index}`,
    messageId: `msg-${index}`,
    mailboxId: `mailbox-${index}@hairtpclinic.se`,
    sender: `sender-${index}@example.com`,
    latestInboundPreview: `Preview ${index}`,
    hoursSinceInbound: index,
    slaStatus: 'ok',
    intent: 'follow_up',
    tone: 'neutral',
    toneConfidence: 0.44,
    mailboxAddress: `mailbox-${index}@hairtpclinic.com`,
    userPrincipalName: `mailbox-${index}@hairtpclinic.com`,
    priorityLevel: 'Medium',
    priorityScore: 44,
    isUnanswered: true,
    unansweredThresholdHours: 24,
    dueBy: new Date().toISOString(),
    customerKey: `customer-${index}`,
    customerSummary: {
      customerKey: `customer-${index}`,
      customerName: `Kund ${index}`,
      lifecycleStatus: 'ACTIVE_DIALOGUE',
      lifecycleSource: 'auto',
      interactionCount: 3,
      caseCount: 2,
      lastInteractionAt: new Date().toISOString(),
      daysSinceLastInteraction: 1,
      engagementScore: 0.62,
      lastCaseSummary: 'Senaste ärende: Bokningsförfrågan',
      daysSinceLastClosedCase: 9,
      timeline: [
        {
          conversationId: `conv-${index}`,
          subject: `Subject ${index}`,
          status: 'open',
          occurredAt: new Date().toISOString(),
        },
      ],
    },
    lifecycleStatus: 'ACTIVE_DIALOGUE',
    tempoProfile: 'responsive',
    recommendedFollowUpDelayDays: 3,
    ctaIntensity: 'direct',
    followUpSuggestedAt: new Date().toISOString(),
    followUpTimingReason: ['weekday_window'],
    followUpUrgencyLevel: 'high',
    followUpManualApprovalRequired: true,
    estimatedWorkMinutes: 8,
    workloadBreakdown: {
      base: 5,
      toneAdjustment: 1,
      priorityAdjustment: 1,
      warmthAdjustment: 0,
      lengthAdjustment: 1,
    },
    dominantRisk: 'tone',
    riskStackScore: 0.74,
    riskStackExplanation: 'Kundtonen är anxious och kräver anpassat bemötande.',
    recommendedAction: 'Be om mer info',
    escalationRequired: false,
    draftModes: {
      short: `Kort ${index}`,
      warm: `Varm ${index}`,
      professional: `Professionell ${index}`,
    },
    recommendedMode: 'warm',
    structureUsed: {
      acknowledgement: 'Tack för ditt meddelande.',
      coreAnswer: 'Vi har tagit emot ditt ärende.',
      cta: 'Svara med detaljer så återkommer vi.',
    },
    subject: `Subject ${index}`,
    proposedReply: `Draft ${index}`,
    confidenceLevel: 'Medium',
  };
}

test('CCO inbox analysis compose returns schema-valid output', () => {
  const output = composeCcoInboxAnalysis({
    inboxOutput: {
      data: {
        urgentConversations: [{ conversationId: 'conv-1', messageId: 'msg-1', reason: 'sla_breach' }],
        needsReplyToday: [{ ...makeDraft(1), needsReplyStatus: 'needs_reply' }],
        conversationWorklist: [{ ...makeDraft(1), lastInboundAt: new Date().toISOString(), needsReplyStatus: 'needs_reply' }],
        slaBreaches: [{ conversationId: 'conv-1', messageId: 'msg-1', overdueMinutes: 42 }],
        riskFlags: [{ conversationId: 'conv-1', messageId: 'msg-1', flagCode: 'MEDICAL_TOPIC' }],
        suggestedDrafts: [makeDraft(1), makeDraft(2)],
        executiveSummary: 'Inbox summary',
        priorityLevel: 'Critical',
      },
      metadata: {
        capability: 'AnalyzeInbox',
        version: '1.0.0',
      },
      warnings: ['manual_review_required'],
    },
    channel: 'admin',
    tenantId: 'tenant-a',
    correlationId: 'corr-cco-1',
  });

  const validation = validateJsonSchema({
    schema: ccoInboxAnalysisOutputSchema,
    value: output,
    rootPath: 'agent.output',
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(output.metadata.agent, CCO_AGENT_NAME);
  assert.equal(output.metadata.channel, 'admin');
  assert.equal(output.data.priorityLevel, 'Critical');
  assert.equal(Array.isArray(output.data.conversationWorklist), true);
  assert.equal(typeof output.data.conversationWorklist?.[0]?.toneConfidence, 'number');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.mailboxAddress, 'string');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.isUnanswered, 'boolean');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.customerSummary?.customerName, 'string');
  assert.equal(output.data.conversationWorklist?.[0]?.tempoProfile, 'responsive');
  assert.equal(output.data.conversationWorklist?.[0]?.ctaIntensity, 'direct');
  assert.equal(typeof output.data.conversationWorklist?.[0]?.workloadBreakdown?.base, 'number');
  assert.equal(output.data.conversationWorklist?.[0]?.dominantRisk, 'tone');
  assert.equal(output.data.conversationWorklist?.[0]?.riskStackScore, 0.74);
  assert.equal(typeof output.data.conversationWorklist?.[0]?.riskStackExplanation, 'string');
  assert.equal(output.data.suggestedDrafts?.[0]?.recommendedMode, 'warm');
  assert.equal(typeof output.data.suggestedDrafts?.[0]?.draftModes?.short, 'string');
  assert.equal(typeof output.data.suggestedDrafts?.[0]?.structureUsed?.cta, 'string');
  assert.equal(typeof output.data.suggestedDrafts?.[0]?.customerSummary?.customerName, 'string');
  assert.equal(output.data.suggestedDrafts?.[0]?.tempoProfile, 'responsive');
  assert.equal(output.data.suggestedDrafts?.[0]?.dominantRisk, 'tone');
});

test('CCO inbox analysis compose clamps draft list to max 5', () => {
  const output = composeCcoInboxAnalysis({
    inboxOutput: {
      data: {
        urgentConversations: [],
        needsReplyToday: [],
        conversationWorklist: [],
        slaBreaches: [],
        riskFlags: [],
        suggestedDrafts: [1, 2, 3, 4, 5, 6, 7].map((index) => makeDraft(index)),
        executiveSummary: 'ok',
        priorityLevel: 'Medium',
      },
      metadata: {},
      warnings: [],
    },
  });

  assert.equal(Array.isArray(output.data.suggestedDrafts), true);
  assert.equal(output.data.suggestedDrafts.length, 5);
});
