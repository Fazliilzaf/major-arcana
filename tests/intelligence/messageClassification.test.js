const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyConversationMessage,
  normalizeMessageClassification,
} = require('../../src/intelligence/messageClassification');

test('classifyConversationMessage treats noreply senders as system mail', () => {
  assert.equal(
    classifyConversationMessage({
      subject: 'Din order är bekräftad',
      inboundPreview: 'Tack för ditt köp',
      sender: 'noreply@shop.example.com',
    }),
    'system_mail'
  );
});

test('classifyConversationMessage keeps human booking inquiries actionable', () => {
  assert.equal(
    classifyConversationMessage({
      subject: 'Påminnelse om bokning',
      inboundPreview: 'Hej, jag fick en påminnelse men kan inte komma på fredag. Kan vi omboka?',
      sender: 'kund@example.com',
    }),
    'actionable'
  );
});

test('classifyConversationMessage filters automated billing reminders', () => {
  assert.equal(
    classifyConversationMessage({
      subject: 'Påminnelse: Faktura förfaller snart',
      inboundPreview: 'Din faktura på 499 kr förfaller 2026-05-25. Betala via Klarna.',
      sender: 'billing@stripe.com',
    }),
    'system_mail'
  );
});

test('classifyConversationMessage keeps customer invoice questions actionable', () => {
  assert.equal(
    classifyConversationMessage({
      subject: 'Fråga om faktura',
      inboundPreview: 'Hej, kan ni skicka faktura till min arbetsgivare?',
      sender: 'patient@example.com',
    }),
    'actionable'
  );
});

test('classifyConversationMessage respects actionable intents on noisy subjects', () => {
  assert.equal(
    classifyConversationMessage({
      subject: 'Kvitto från kliniken',
      inboundPreview: 'Jag förstår inte kvittot, kan ni förklara priset?',
      sender: 'patient@example.com',
      intent: 'pricing_question',
    }),
    'actionable'
  );
});

test('normalizeMessageClassification only accepts system_mail literal', () => {
  assert.equal(normalizeMessageClassification('system_mail'), 'system_mail');
  assert.equal(normalizeMessageClassification('actionable'), 'actionable');
  assert.equal(normalizeMessageClassification(''), 'actionable');
});
