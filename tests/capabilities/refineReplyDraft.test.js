const test = require('node:test');
const assert = require('node:assert/strict');

const { RefineReplyDraftCapability } = require('../../src/capabilities/refineReplyDraft');

const baseInput = {
  conversationId: 'c1',
  messageId: 'm1',
  mailboxId: 'mb1',
  subject: 'Angående bokning',
  draft: 'Tack för ditt meddelande.',
};

async function runExecute(overrides = {}) {
  const cap = new RefineReplyDraftCapability();
  return cap.execute({
    tenantId: 'tenant-x',
    channel: 'admin',
    input: { ...baseInput, ...overrides },
  });
}

test('RefineReplyDraft improve instruction appends follow-up line', async () => {
  const out = await runExecute({ instruction: 'improve' });
  assert.equal(out.data.instruction, 'improve');
  assert.match(out.data.refinedReply, /foljer upp skyndsamt/i);
  assert.match(out.data.refinedReply, /Hej,/i);
});

test('RefineReplyDraft professional instruction rewrites hedging phrases', async () => {
  const out = await runExecute({
    instruction: 'professional',
    draft: 'jag tror vi kan boka. snalla återkom.',
  });
  assert.match(out.data.refinedReply, /vi bedomer/i);
  assert.match(out.data.refinedReply, /vanligen/i);
});

test('RefineReplyDraft shorten keeps first sentences under cap', async () => {
  const out = await runExecute({
    instruction: 'shorten',
    draft: 'Meny rad ett. Rad två! Rad tre? Rad fyra. Rad fem.',
  });
  assert.ok(out.data.refinedReply.length <= 920);
  assert.match(out.data.refinedReply, /Meny rad ett/i);
});

test('RefineReplyDraft metadata carries capability id and tenant', async () => {
  const out = await runExecute({ instruction: 'improve' });
  assert.equal(out.metadata.capability, 'RefineReplyDraft');
  assert.equal(out.metadata.tenantId, 'tenant-x');
  assert.equal(out.metadata.channel, 'admin');
  assert.deepEqual(out.warnings, []);
});

test('RefineReplyDraft instruction trimmas och lowercases', async () => {
  const out = await runExecute({ instruction: '\n  SHORTEN  \t' });
  assert.equal(out.data.instruction, 'shorten');
});

test('RefineReplyDraft tom mailboxId defaultar till okand-postlada', async () => {
  const out = await runExecute({ mailboxId: '   ', instruction: 'improve' });
  assert.equal(out.data.mailboxId, 'okand-postlada');
});

test('RefineReplyDraft saknad tenantId i context defaultar metadata till okand', async () => {
  const cap = new RefineReplyDraftCapability();
  const out = await cap.execute({
    channel: 'admin',
    input: { ...baseInput, instruction: 'improve' },
  });
  assert.equal(out.metadata.tenantId, 'okand');
});

test('RefineReplyDraft subject med bara whitespace blir utan amne-titel', async () => {
  const out = await runExecute({
    subject: '  \n\t  ',
    instruction: 'improve',
  });
  assert.equal(out.data.subject, '(utan ämne)');
});

test('RefineReplyDraft langt amne kapas till max 220 tecken', async () => {
  const longSubject = `Ämne ${'x'.repeat(400)}`;
  const out = await runExecute({ subject: longSubject, instruction: 'improve' });
  assert.equal(out.data.subject.length, 220);
  assert.ok(out.data.subject.endsWith('...'));
});
