'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertExternalAiJournalPolicy,
  containsJournalLikeContent,
  redactChatCompletionParams,
  guardOpenAiChatCompletions,
} = require('../../src/ops/ccoJournalAiGuard');

test('containsJournalLikeContent detects journal keywords', () => {
  assert.equal(containsJournalLikeContent('Patientens hälsodeklaration är ifylld.'), true);
  assert.equal(containsJournalLikeContent('Hej, kan vi boka tid?'), false);
});

test('assertExternalAiJournalPolicy redacts journal messages for external AI', () => {
  const guarded = assertExternalAiJournalPolicy({
    messages: [
      { body: 'Hej!' },
      { body: 'Friskförsäkran signerad i journalen.' },
    ],
  });
  assert.equal(guarded.messages[0].body, 'Hej!');
  assert.match(guarded.messages[1].body, /Journalinnehåll utelämnat/);
  assert.equal(guarded.journalAiGuardApplied, true);
});

test('redactChatCompletionParams redacts journal content, preserves OpenAI message shape', () => {
  const params = {
    model: 'gpt-x',
    temperature: 0.4,
    messages: [
      { role: 'system', content: 'Du är en assistent.' },
      { role: 'user', content: 'Patientens hälsodeklaration är ifylld.' },
      { role: 'tool', tool_call_id: 't1', content: '{"personnummer":"19900101-1234"}' },
    ],
  };
  const out = redactChatCompletionParams(params);
  // clean message untouched
  assert.equal(out.messages[0].content, 'Du är en assistent.');
  // journal + personnummer content redacted in the content string
  assert.match(out.messages[1].content, /utelämnat enligt policy/);
  assert.match(out.messages[2].content, /utelämnat enligt policy/);
  // OpenAI shape preserved — no stray body/text/journalRedacted fields, role/ids intact
  assert.equal(out.messages[1].body, undefined);
  assert.equal(out.messages[1].journalRedacted, undefined);
  assert.equal(out.messages[2].role, 'tool');
  assert.equal(out.messages[2].tool_call_id, 't1');
  assert.equal(out.model, 'gpt-x');
  assert.equal(out.temperature, 0.4);
});

test('redactChatCompletionParams leaves clean params as same reference', () => {
  const params = { model: 'gpt-x', messages: [{ role: 'user', content: 'Boka tid imorgon?' }] };
  assert.equal(redactChatCompletionParams(params), params);
});

test('redactChatCompletionParams handles missing/invalid messages gracefully', () => {
  assert.deepEqual(redactChatCompletionParams({ model: 'x' }), { model: 'x' });
  assert.equal(redactChatCompletionParams(null), null);
});

// Integration test for the SDK choke-point wrap — proves journal content is
// redacted at the actual create() boundary, using a fake OpenAI instance
// (no real key, no cost, no network). This is the automated stand-in for the
// manual AI smoke-test.
test('guardOpenAiChatCompletions: redacts journal content at the create() boundary', async () => {
  let captured = null;
  const fakeOpenai = {
    chat: { completions: { create: async (params) => { captured = params; return { ok: true }; } } },
  };
  guardOpenAiChatCompletions(fakeOpenai);
  await fakeOpenai.chat.completions.create({
    model: 'gpt-x',
    messages: [
      { role: 'user', content: 'Patientens hälsodeklaration och personnummer 19900101-1234.' },
      { role: 'system', content: 'Du är en hjälpsam assistent.' },
      { role: 'tool', tool_call_id: 't1', content: '{"journalpost":"tp_treatment dag 1"}' },
    ],
  });
  assert.ok(captured, 'create ska ha anropats');
  assert.match(captured.messages[0].content, /utelämnat enligt policy/);
  assert.equal(captured.messages[1].content, 'Du är en hjälpsam assistent.'); // ren text orörd
  assert.match(captured.messages[2].content, /utelämnat enligt policy/); // tool-resultat täcks
});

test('redactChatCompletionParams: allowlistad context (patient_chat) skippar redaktering', () => {
  const params = {
    model: 'gpt-x',
    __aiContext: 'patient_chat',
    messages: [{ role: 'user', content: 'Hur fyller jag i hälsodeklarationen inför besöket?' }],
  };
  const out = redactChatCompletionParams(params);
  // INTE redaktat — patient_chat är allowlistad
  assert.match(out.messages[0].content, /hälsodeklarationen/);
  // hint-fältet strippat så det aldrig når API:t
  assert.equal('__aiContext' in out, false);
});

test('redactChatCompletionParams: ej-allowlistad context redaktas ändå + strippar hint', () => {
  const params = {
    model: 'gpt-x',
    __aiContext: 'some_random_context',
    messages: [{ role: 'user', content: 'Patientens hälsodeklaration ...' }],
  };
  const out = redactChatCompletionParams(params);
  assert.match(out.messages[0].content, /utelämnat enligt policy/);
  assert.equal('__aiContext' in out, false);
});

test('guardOpenAiChatCompletions: idempotent + tål null/ofullständig instans', () => {
  const fake = { chat: { completions: { create: async () => ({}) } } };
  guardOpenAiChatCompletions(fake);
  const wrappedOnce = fake.chat.completions.create;
  guardOpenAiChatCompletions(fake); // andra gången → ingen dubbel-wrap
  assert.equal(fake.chat.completions.create, wrappedOnce);
  assert.doesNotThrow(() => guardOpenAiChatCompletions(null));
  assert.doesNotThrow(() => guardOpenAiChatCompletions({}));
});
