'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertExternalAiJournalPolicy,
  containsJournalLikeContent,
  redactChatCompletionParams,
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
