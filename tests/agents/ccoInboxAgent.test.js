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
    priorityLevel: 'Medium',
    priorityScore: 44,
    recommendedAction: 'Be om mer info',
    escalationRequired: false,
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
