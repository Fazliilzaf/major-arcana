const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCanonicalMailComposeDocument } = require('../../src/ops/ccoMailComposeDocument');

test('buildCanonicalMailComposeDocument builds compose-mode document with recipients and signature', () => {
  const composeDocument = buildCanonicalMailComposeDocument(
    {
      mode: 'compose',
      mailboxId: 'kons@hairtpclinic.com',
      senderMailboxId: 'contact@hairtpclinic.com',
      to: ['Patient@Example.com'],
      cc: ['Manager@Example.com'],
      bcc: ['Audit@Example.com'],
      subject: 'Ny kontakt',
      body: 'Hej från CCO.',
    },
    {
      signatureProfile: {
        key: 'contact',
        label: 'Contact',
        fullName: 'Hair TP Clinic',
        title: 'Patientservice',
        email: 'contact@hairtpclinic.com',
        senderMailboxId: 'contact@hairtpclinic.com',
      },
      renderedBodyText: 'Hej från CCO.\n\nBästa hälsningar',
      renderedBodyHtml: '<p>Hej från CCO.</p>',
      defaultSenderMailboxId: 'contact@hairtpclinic.com',
    }
  );

  assert.equal(composeDocument.kind, 'mail_compose_document');
  assert.equal(composeDocument.version, 'phase_5');
  assert.equal(composeDocument.mode, 'compose');
  assert.equal(composeDocument.sourceMailboxId, 'kons@hairtpclinic.com');
  assert.equal(composeDocument.senderMailboxId, 'contact@hairtpclinic.com');
  assert.deepEqual(composeDocument.recipients, {
    to: ['patient@example.com'],
    cc: ['manager@example.com'],
    bcc: ['audit@example.com'],
  });
  assert.equal(composeDocument.content.bodyText.includes('Bästa hälsningar'), true);
  assert.equal(composeDocument.delivery.sendStrategy, 'send_mail');
  assert.equal(composeDocument.validation.valid, true);
  assert.equal(composeDocument.signature.email, 'contact@hairtpclinic.com');
});

test('buildCanonicalMailComposeDocument keeps same-mailbox replies in reply_draft strategy', () => {
  const composeDocument = buildCanonicalMailComposeDocument(
    {
      mailboxId: 'kons@hairtpclinic.com',
      senderMailboxId: 'kons@hairtpclinic.com',
      replyToMessageId: 'msg-1',
      conversationId: 'conv-1',
      subject: 'Re: Konsultation',
      body: 'Hej! Vi svarar i samma tråd.',
    },
    {
      renderedBodyText: 'Hej! Vi svarar i samma tråd.',
      renderedBodyHtml: '<p>Hej! Vi svarar i samma tråd.</p>',
      defaultSenderMailboxId: 'contact@hairtpclinic.com',
    }
  );

  assert.equal(composeDocument.mode, 'reply');
  assert.equal(composeDocument.delivery.requiresExplicitRecipients, false);
  assert.equal(composeDocument.delivery.sendStrategy, 'reply_draft');
  assert.equal(composeDocument.validation.valid, true);
  assert.deepEqual(composeDocument.recipients.to, []);
});

test('buildCanonicalMailComposeDocument requires explicit recipients for cross-mailbox replies', () => {
  const composeDocument = buildCanonicalMailComposeDocument(
    {
      mailboxId: 'owner@hairtpclinic.se',
      senderMailboxId: 'contact@hairtpclinic.com',
      replyToMessageId: 'msg-2',
      conversationId: 'conv-2',
      subject: 'Re: Inkommande fråga',
      body: 'Hej! Detta skickas från contact.',
    },
    {
      renderedBodyText: 'Hej! Detta skickas från contact.',
      renderedBodyHtml: '<p>Hej! Detta skickas från contact.</p>',
      defaultSenderMailboxId: 'contact@hairtpclinic.com',
    }
  );

  assert.equal(composeDocument.mode, 'reply');
  assert.equal(composeDocument.delivery.requiresExplicitRecipients, true);
  assert.equal(composeDocument.delivery.sendStrategy, 'send_mail');
  assert.equal(composeDocument.validation.valid, false);
  assert.deepEqual(composeDocument.validation.errors.map((item) => item.field), ['to']);
});

test('buildCanonicalMailComposeDocument accepterar snake_case mailbox- och svarsfält', () => {
  const doc = buildCanonicalMailComposeDocument(
    {
      mailbox_id: 'inbox@clinic.se',
      sender_mailbox_id: 'inbox@clinic.se',
      conversation_id: 'conv-snake',
      reply_to_message_id: 'msg-snake',
      subject: 'Re: Test',
      body: 'Svarstext.',
    },
    { renderedBodyText: 'Svarstext.' }
  );

  assert.equal(doc.mode, 'reply');
  assert.equal(doc.sourceMailboxId, 'inbox@clinic.se');
  assert.equal(doc.senderMailboxId, 'inbox@clinic.se');
  assert.equal(doc.replyContext.conversationId, 'conv-snake');
  assert.equal(doc.replyContext.replyToMessageId, 'msg-snake');
  assert.equal(doc.validation.valid, true);
});

test('buildCanonicalMailComposeDocument send_mode alias styr compose-läge', () => {
  const doc = buildCanonicalMailComposeDocument(
    {
      send_mode: 'COMPOSE',
      mailboxId: 'mailbox@clinic.com',
      senderMailboxId: 'mailbox@clinic.com',
      to: ['patient@example.com'],
      subject: 'Rubrik',
      body: 'Brödtext',
    },
    { renderedBodyText: 'Brödtext' }
  );

  assert.equal(doc.mode, 'compose');
  assert.equal(doc.delivery.sendStrategy, 'send_mail');
  assert.equal(doc.validation.valid, true);
});

test('buildCanonicalMailComposeDocument begränsar to-lista till 20 adresser', () => {
  const to = Array.from({ length: 21 }, (_, i) => `user${i}@example.com`);
  const doc = buildCanonicalMailComposeDocument(
    {
      mode: 'compose',
      mailboxId: 'm@clinic.com',
      senderMailboxId: 'm@clinic.com',
      to,
      subject: 'Massutskick',
      body: 'Hej.',
    },
    { renderedBodyText: 'Hej.' }
  );

  assert.equal(doc.recipients.to.length, 20);
  assert.equal(doc.recipients.to[0], 'user0@example.com');
  assert.equal(doc.recipients.to[19], 'user19@example.com');
});

test('buildCanonicalMailComposeDocument icke-array to ger valideringsfel i compose', () => {
  const doc = buildCanonicalMailComposeDocument(
    {
      mode: 'compose',
      mailboxId: 'm@clinic.com',
      senderMailboxId: 'm@clinic.com',
      to: 'not-an-array@example.com',
      subject: 'S',
      body: 'B',
    },
    { renderedBodyText: 'B' }
  );

  assert.deepEqual(doc.recipients.to, []);
  assert.equal(doc.validation.valid, false);
  assert.ok(doc.validation.errors.some((e) => e.field === 'to'));
});

test('buildCanonicalMailComposeDocument null-input ger compose med valideringsfel', () => {
  const doc = buildCanonicalMailComposeDocument(null, { renderedBodyText: '' });

  assert.equal(doc.mode, 'compose');
  assert.equal(doc.validation.valid, false);
  assert.ok(doc.validation.errors.some((e) => e.field === 'sourceMailboxId'));
  assert.ok(doc.validation.errors.some((e) => e.field === 'body'));
});
