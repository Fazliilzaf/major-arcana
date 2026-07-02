'use strict';

/* A2 — brusfilter: leverantörs-/notisavsändare (Facebook/Meta, Fortnox, Loopia,
 * Google + no-reply/bounce/newsletter-prefix) blir system/brus och skapar aldrig
 * needsReply/act-now. gmail/googlemail (patient-domäner) rörs inte. Riktig
 * kundmail hamnar fortfarande i worklist.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyConversationMessage,
  isSystemNotificationSender,
} = require('../../src/intelligence/messageClassification');
const { isNonPatientCounterpartyEmail } = require('../../src/ops/ccoMailIngestion/nonPatientRules');
const {
  createCcoMailboxTruthWorklistReadModel,
} = require('../../src/ops/ccoMailboxTruthWorklistReadModel');

// ── 1. Facebook/Meta → system/brus ───────────────────────────────────────────

test('A2: Facebook/Meta-mail blir system/brus', () => {
  const sender = 'notification+xyz@facebookmail.com';
  assert.equal(isNonPatientCounterpartyEmail(sender), true);
  assert.equal(isSystemNotificationSender(sender), true);
  // Även med "mänskligt" ord i ämnet → fortfarande brus (domän före human-inquiry).
  assert.equal(
    classifyConversationMessage({ subject: 'Ny avisering om ditt pris', sender }),
    'system_mail'
  );
});

// ── 2. Fortnox/Loopia/Google → system/brus ───────────────────────────────────

test('A2: Fortnox/Loopia/Google-notiser blir system/brus', () => {
  for (const sender of [
    'no-reply@fortnox.se',
    'noreply@loopia.se',
    'notify@accounts.google.com', // subdomän till google.com
    'no-reply@google.com',
  ]) {
    assert.equal(isNonPatientCounterpartyEmail(sender), true, `${sender} → non-patient`);
    assert.equal(
      classifyConversationMessage({ subject: 'Bokningsfråga', sender }),
      'system_mail',
      `${sender} → system_mail`
    );
  }
});

test('A2: notis-prefix (bounce/auto-reply/newsletter/nyhetsbrev/donotreply) blir brus', () => {
  for (const local of [
    'bounce',
    'bounces',
    'auto-reply',
    'autoreply',
    'newsletter',
    'nyhetsbrev',
    'donotreply',
  ]) {
    const sender = `${local}@somevendor.example`;
    assert.equal(isSystemNotificationSender(sender), true, `${sender} → notis`);
    assert.equal(classifyConversationMessage({ subject: 'x', sender }), 'system_mail');
  }
});

// ── 3. Gmail-patientmail → INTE brus ─────────────────────────────────────────

test('A2: gmail/googlemail patientmail blir INTE brus', () => {
  for (const sender of ['anna.andersson@gmail.com', 'patient@googlemail.com']) {
    assert.equal(isNonPatientCounterpartyEmail(sender), false, `${sender} → patient`);
    assert.equal(isSystemNotificationSender(sender), false);
    assert.equal(
      classifyConversationMessage({ subject: 'Fråga om pris och bokning', sender }),
      'actionable',
      `${sender} → actionable`
    );
  }
});

// ── 4 + 5. Worklist: brus skapar inte needsReply, riktig kundmail gör det ─────

function inboundMessage({ conv, sender, subject, isRead = false }) {
  return {
    mailboxId: 'contact@hairtpclinic.com',
    mailboxAddress: 'contact@hairtpclinic.com',
    userPrincipalName: 'contact@hairtpclinic.com',
    mailboxConversationId: `contact@hairtpclinic.com:${conv}`,
    conversationId: conv,
    graphMessageId: `msg-${conv}`,
    folderType: 'inbox',
    direction: 'inbound',
    isRead,
    subject,
    bodyPreview: subject,
    from: { address: sender, name: sender },
    receivedAt: '2026-06-15T09:00:00.000Z',
  };
}

test('A2: brus-inbound skapar inte needsReply; riktig kundmail hamnar i worklist med needsReply', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          // Brus: oläst inbound från facebookmail → skulle bli needsReply om det
          // vore riktig kund, men ska filtreras/aldrig kräva svar.
          inboundMessage({
            conv: 'conv-brus',
            sender: 'notification@facebookmail.com',
            subject: 'Någon gillade ditt inlägg',
          }),
          // Riktig kund: oläst inbound från personlig gmail med förfrågan.
          inboundMessage({
            conv: 'conv-kund',
            sender: 'kund.person@gmail.com',
            subject: 'Fråga om pris och bokning',
          }),
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({ mailboxIds: ['contact@hairtpclinic.com'] });
  const rows = consumer.rows || [];

  const rowEmail = (r) => String(r.customerEmail || r.customer?.email || '').toLowerCase();
  const rowNeedsReply = (r) => r.state?.needsReply === true || r.needsReply === true;

  // Ingen rad kopplad till brus-avsändaren får kräva svar.
  const brusRows = rows.filter((r) => rowEmail(r).includes('facebookmail.com'));
  for (const r of brusRows) {
    assert.equal(rowNeedsReply(r), false, 'brus får aldrig skapa needsReply');
  }

  // Riktig kund ska finnas i worklist och kräva svar.
  const kundRow = rows.find((r) => rowEmail(r).includes('kund.person@gmail.com'));
  assert.ok(kundRow, 'riktig kundmail ska finnas i worklist');
  assert.equal(rowNeedsReply(kundRow), true, 'obesvarad kundmail ska kräva svar');
});
