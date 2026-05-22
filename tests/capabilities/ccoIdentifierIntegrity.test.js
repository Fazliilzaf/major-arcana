const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeInboxCapability } = require('../../src/capabilities/analyzeInbox');
const { RefineReplyDraftCapability } = require('../../src/capabilities/refineReplyDraft');
const { CcoConversationActionCapability } = require('../../src/capabilities/ccoConversationAction');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

function makeOpaqueGraphId(prefix = 'id') {
  return `${prefix}-AAMkADk1MjM0NTY3LTg5YWItY2RlZi0xMjM0LTU2Nzg5YWJjZGVmAAAuAAAAAACce2WbP2S4Q3K1k7kQ8P2EAQCEjU9oR2O9xQmG_5nX0dXvAAABEgAQAAEAAAD__${prefix}__${'x'.repeat(
    420
  )}`;
}

test('AnalyzeInbox preserves opaque Graph message/conversation IDs without truncation', async () => {
  const conversationId = makeOpaqueGraphId('conv');
  const messageId = makeOpaqueGraphId('msg');
  const mailboxId = 'owner@hairtpclinic.se';

  const output = await new analyzeInboxCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-cco-id-1',
    correlationId: 'corr-cco-id-1',
    input: {
      maxDrafts: 1,
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId,
          mailboxId,
          subject: 'Uppfoljning',
          status: 'open',
          messages: [
            {
              messageId,
              mailboxId,
              direction: 'inbound',
              sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              bodyPreview: 'Hej, jag vill ha en uppfoljning.',
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

  assert.equal(output.data.suggestedDrafts.length, 1);
  assert.equal(output.data.suggestedDrafts[0].conversationId, conversationId);
  assert.equal(output.data.suggestedDrafts[0].messageId, messageId);
  assert.equal(output.data.suggestedDrafts[0].mailboxId, mailboxId);
  assert.equal(output.data.conversationWorklist[0].conversationId, conversationId);
  assert.equal(output.data.conversationWorklist[0].messageId, messageId);
});

test('RefineReplyDraft accepts long opaque IDs and preserves them in output', async () => {
  const conversationId = makeOpaqueGraphId('refine-conv');
  const messageId = makeOpaqueGraphId('refine-msg');
  const mailboxId = 'owner@hairtpclinic.se';

  const output = await new RefineReplyDraftCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-cco-id-2',
    correlationId: 'corr-cco-id-2',
    input: {
      conversationId,
      messageId,
      mailboxId,
      subject: 'Svar',
      draft: 'Hej, tack for ditt meddelande.',
      instruction: 'professional',
    },
  });

  const validation = validateJsonSchema({
    schema: RefineReplyDraftCapability.outputSchema,
    value: output,
    rootPath: 'capability.output',
  });
  assert.equal(validation.ok, true, `schema validation errors: ${JSON.stringify(validation.errors)}`);
  assert.equal(output.data.conversationId, conversationId);
  assert.equal(output.data.messageId, messageId);
  assert.equal(output.data.mailboxId, mailboxId);
});

test('CcoConversationAction accepts long opaque IDs and preserves them in output', async () => {
  const conversationId = makeOpaqueGraphId('action-conv');
  const messageId = makeOpaqueGraphId('action-msg');
  const mailboxId = 'owner@hairtpclinic.se';

  const output = await new CcoConversationActionCapability().execute({
    tenantId: 'tenant-a',
    actor: { id: 'owner-a', role: 'OWNER' },
    channel: 'admin',
    requestId: 'req-cco-id-3',
    correlationId: 'corr-cco-id-3',
    input: {
      action: 'handled',
      conversationId,
      messageId,
      mailboxId,
      subject: 'Svar',
    },
  });

  const validation = validateJsonSchema({
    schema: CcoConversationActionCapability.outputSchema,
    value: output,
    rootPath: 'capability.output',
  });
  assert.equal(validation.ok, true, `schema validation errors: ${JSON.stringify(validation.errors)}`);
  assert.equal(output.data.conversationId, conversationId);
  assert.equal(output.data.messageId, messageId);
  assert.equal(output.data.mailboxId, mailboxId);
});
