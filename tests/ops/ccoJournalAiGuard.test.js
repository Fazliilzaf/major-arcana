'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertExternalAiJournalPolicy,
  containsJournalLikeContent,
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
