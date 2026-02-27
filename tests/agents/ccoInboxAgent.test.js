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
        needsReplyToday: [{ conversationId: 'conv-1', messageId: 'msg-1', subject: 'Need answer', hoursSinceInbound: 18 }],
        slaBreaches: [{ conversationId: 'conv-1', messageId: 'msg-1', overdueMinutes: 42 }],
        riskFlags: [{ conversationId: 'conv-1', messageId: 'msg-1', flagCode: 'MEDICAL_TOPIC' }],
        suggestedDrafts: [makeDraft(1), makeDraft(2)],
        executiveSummary: 'Inbox summary',
        priorityLevel: 'High',
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
  assert.equal(output.data.priorityLevel, 'High');
});

test('CCO inbox analysis compose clamps draft list to max 5', () => {
  const output = composeCcoInboxAnalysis({
    inboxOutput: {
      data: {
        urgentConversations: [],
        needsReplyToday: [],
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

test('CCO inbox analysis omits empty optional metadata fields', () => {
  const output = composeCcoInboxAnalysis({
    inboxOutput: {
      data: {
        urgentConversations: [],
        needsReplyToday: [],
        slaBreaches: [],
        riskFlags: [],
        suggestedDrafts: [makeDraft(1)],
        executiveSummary: 'ok',
        priorityLevel: 'Low',
      },
      metadata: {},
      warnings: [],
    },
    channel: 'admin',
    tenantId: '',
    correlationId: '',
  });

  const validation = validateJsonSchema({
    schema: ccoInboxAnalysisOutputSchema,
    value: output,
    rootPath: 'agent.output',
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal('tenantId' in output.metadata, false);
  assert.equal('correlationId' in output.metadata, false);
});

test('CCO inbox analysis accepts long provider message ids', () => {
  const longMessageId = `graph-${'x'.repeat(260)}`;
  const output = composeCcoInboxAnalysis({
    inboxOutput: {
      data: {
        urgentConversations: [],
        needsReplyToday: [],
        slaBreaches: [],
        riskFlags: [],
        suggestedDrafts: [
          {
            conversationId: 'conv-long-id',
            messageId: longMessageId,
            subject: 'Subject',
            proposedReply: 'Draft',
            confidenceLevel: 'High',
          },
        ],
        executiveSummary: 'ok',
        priorityLevel: 'Low',
      },
      metadata: {},
      warnings: [],
    },
    channel: 'admin',
    tenantId: 'tenant-a',
    correlationId: 'corr-cco-long',
  });

  const validation = validateJsonSchema({
    schema: ccoInboxAnalysisOutputSchema,
    value: output,
    rootPath: 'agent.output',
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(String(output.data.suggestedDrafts[0].messageId).length > 120, true);
});
