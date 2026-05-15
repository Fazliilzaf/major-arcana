'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ccoConversationActionCapability,
} = require('../../src/capabilities/ccoConversationAction');

const baseContext = {
  tenantId: 'tenant-a',
  channel: 'admin',
  requestId: 'req-1',
  correlationId: 'corr-1',
};

async function execute(input) {
  return new ccoConversationActionCapability().execute({
    ...baseContext,
    input,
  });
}

test('CcoConversationAction: handled sätter needsReplyStatus handled och låg prioritet', async () => {
  const out = await execute({
    action: 'handled',
    conversationId: 'c1',
    messageId: 'm1',
  });
  assert.equal(out.data.action, 'handled');
  assert.equal(out.data.needsReplyStatus, 'handled');
  assert.equal(out.data.priorityLevel, 'Low');
  assert.match(out.data.actionLabel, /hanterad/i);
});

test('CcoConversationAction: flag_critical ger Critical och needs_reply', async () => {
  const out = await execute({
    action: 'flag_critical',
    conversationId: 'c1',
    messageId: 'm1',
  });
  assert.equal(out.data.action, 'flag_critical');
  assert.equal(out.data.needsReplyStatus, 'needs_reply');
  assert.equal(out.data.priorityLevel, 'Critical');
  assert.match(out.data.actionLabel, /kritisk/i);
});

test('CcoConversationAction: action trimmas och lowercases till handled', async () => {
  const out = await execute({
    action: '  HANDLED  ',
    conversationId: 'c1',
    messageId: 'm1',
  });
  assert.equal(out.data.action, 'handled');
});

test('CcoConversationAction: okänd action normaliseras till tom och behandlas som needs_reply', async () => {
  const out = await execute({
    action: 'archive',
    conversationId: 'c1',
    messageId: 'm1',
  });
  assert.equal(out.data.action, '');
  assert.equal(out.data.needsReplyStatus, 'needs_reply');
  assert.equal(out.data.priorityLevel, 'Low');
});

test('CcoConversationAction: subject med bara whitespace blir utan amne', async () => {
  const out = await execute({
    action: 'handled',
    conversationId: 'c1',
    messageId: 'm1',
    subject: '  \n\t  ',
  });
  assert.equal(out.data.subject, '(utan ämne)');
});

test('CcoConversationAction: langt amne kapas', async () => {
  const long = `Re: ${'x'.repeat(400)}`;
  const out = await execute({
    action: 'handled',
    conversationId: 'c1',
    messageId: 'm1',
    subject: long,
  });
  assert.equal(out.data.subject.length, 220);
  assert.ok(out.data.subject.endsWith('...'));
});

test('CcoConversationAction: saknad tenantId defaultar metadata till okand', async () => {
  const out = await new ccoConversationActionCapability().execute({
    channel: 'admin',
    input: {
      action: 'handled',
      conversationId: 'c1',
      messageId: 'm1',
    },
  });
  assert.equal(out.metadata.tenantId, 'okand');
});

test('CcoConversationAction: tom mailboxId i output', async () => {
  const out = await execute({
    action: 'handled',
    conversationId: 'c1',
    messageId: 'm1',
    mailboxId: '',
  });
  assert.equal(out.data.mailboxId, '');
});
