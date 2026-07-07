const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toCanonicalMailboxConversationKey,
  isOutOfScopeDraftReview,
  createCcoMailboxTruthWorklistReadModel,
  resolveWorklistEvidenceFields,
} = require('../../src/ops/ccoMailboxTruthWorklistReadModel');

test('toCanonicalMailboxConversationKey prefers mailboxConversationId with mailbox prefix normalization', () => {
  assert.equal(
    toCanonicalMailboxConversationKey({
      mailboxId: 'Clinic@Demo.SE',
      mailboxConversationId: 'Clinic@Demo.SE:thread-42',
      conversationId: 'other',
    }),
    'clinic@demo.se:thread-42'
  );
});

test('toCanonicalMailboxConversationKey uses conversationId when mailboxConversationId absent', () => {
  assert.equal(
    toCanonicalMailboxConversationKey({
      mailboxId: 'a@b.co',
      conversationId: 'orphan-id',
    }),
    'a@b.co:orphan-id'
  );
});

test('toCanonicalMailboxConversationKey falls back to mailboxId + graph messageId', () => {
  assert.equal(
    toCanonicalMailboxConversationKey({
      mailboxId: 'Box@Clinic.SE',
      messageId: 'graph-msg-7',
    }),
    'box@clinic.se:graph:graph-msg-7'
  );
});

test('toCanonicalMailboxConversationKey returns empty when insufficient fields', () => {
  assert.equal(toCanonicalMailboxConversationKey({}), '');
  assert.equal(toCanonicalMailboxConversationKey({ conversationId: 'only-global' }), 'only-global');
});

test('isOutOfScopeDraftReview true only for drafts-only queue posture', () => {
  assert.equal(
    isOutOfScopeDraftReview({
      hasDrafts: true,
      hasUnreadInbound: false,
      needsReply: false,
    }),
    true
  );
  assert.equal(
    isOutOfScopeDraftReview({
      hasDrafts: true,
      hasUnreadInbound: true,
      needsReply: false,
    }),
    false
  );
  assert.equal(
    isOutOfScopeDraftReview({
      hasDrafts: true,
      hasUnreadInbound: false,
      needsReply: true,
    }),
    false
  );
  assert.equal(isOutOfScopeDraftReview({ hasDrafts: false }), false);
});

test('worklist read model suppresses needsReply for classified system mail', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-billing',
            conversationId: 'conv-billing',
            graphMessageId: 'msg-billing-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: true,
            subject: 'Påminnelse: Faktura förfaller snart',
            bodyPreview: 'Din faktura förfaller 2026-05-25. Betala via Klarna.',
            from: {
              address: 'noreply@billing.example.com',
              name: 'Billing',
            },
            receivedAt: '2026-06-15T09:00:00.000Z',
          },
        ];
      },
    },
  });

  const readModel = model.buildReadModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });
  const consumer = model.buildConsumerModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });

  assert.equal(readModel.rows.length, 0);
  assert.equal(consumer.rows.length, 0);
});

test('worklist read model keeps human replies actionable even after automated reminders', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-human',
            conversationId: 'conv-human',
            graphMessageId: 'msg-human-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Påminnelse om bokning',
            bodyPreview: 'Hej, jag kan inte komma på fredag. Kan vi omboka konsultationen?',
            from: {
              address: 'patient@example.com',
              name: 'Patient',
            },
            receivedAt: '2026-06-15T09:00:00.000Z',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });

  assert.equal(consumer.rows.length, 1);
  assert.equal(consumer.rows[0].state.needsReply, true);
  assert.equal(consumer.rows[0].state.messageClassification, 'actionable');
});

test('worklist read model splits website contact forms by embedded customer email', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: 'kons@hairtpclinic.com:wp-form-sudarshan',
            conversationId: 'wp-form-sudarshan',
            graphMessageId: 'wp-msg-sudarshan',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Sudarshan Kontaktformulär',
            bodyPreview:
              'Från: Sudarshan E-post: sudarshan@example.com Telefon: 0701112233 Hur kan vi hjälpa dig?',
            bodyText:
              'Från: Sudarshan E-post: sudarshan@example.com Telefon: 0701112233 Hur kan vi hjälpa dig?',
            from: {
              address: 'wordpress@hairtpclinic.se',
              name: 'WordPress',
            },
            receivedAt: '2026-07-05T10:00:00.000Z',
          },
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: 'kons@hairtpclinic.com:wp-form-blend',
            conversationId: 'wp-form-blend',
            graphMessageId: 'wp-msg-blend',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Blend Bytyci Kontaktformulär',
            bodyPreview:
              'Från: Blend Bytyci E-post: blend@example.com Telefon: 0704445566 Hur kan vi hjälpa dig?',
            bodyText:
              'Från: Blend Bytyci E-post: blend@example.com Telefon: 0704445566 Hur kan vi hjälpa dig?',
            from: {
              address: 'wordpress@hairtpclinic.se',
              name: 'WordPress',
            },
            receivedAt: '2026-07-05T11:00:00.000Z',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({
    mailboxIds: ['kons@hairtpclinic.com'],
  });

  assert.equal(consumer.rows.length, 2);
  const emails = consumer.rows.map((row) => row.customer.email).sort();
  assert.deepEqual(emails, ['blend@example.com', 'sudarshan@example.com']);
  assert.equal(
    consumer.rows.some((row) => row.customer.email === 'wordpress@hairtpclinic.se'),
    false
  );
  const sudarshan = consumer.rows.find((row) => row.customer.name === 'Sudarshan');
  const blend = consumer.rows.find((row) => row.customer.name === 'Blend Bytyci');
  assert.ok(sudarshan, 'Sudarshan row should be present');
  assert.ok(blend, 'Blend row should be present');
  assert.equal(sudarshan.conversation.latestGraphMessageId, 'wp-msg-sudarshan');
  assert.deepEqual(sudarshan.conversation.underlyingGraphMessageIds, ['wp-msg-sudarshan']);
  assert.equal(sudarshan.rollup.primaryGraphMessageId, 'wp-msg-sudarshan');
  assert.deepEqual(sudarshan.rollup.underlyingGraphMessageIds, ['wp-msg-sudarshan']);
  assert.equal(blend.conversation.latestGraphMessageId, 'wp-msg-blend');
  assert.deepEqual(blend.conversation.underlyingGraphMessageIds, ['wp-msg-blend']);
  assert.equal(blend.rollup.primaryGraphMessageId, 'wp-msg-blend');
  assert.deepEqual(blend.rollup.underlyingGraphMessageIds, ['wp-msg-blend']);
});

test('worklist read model splits website contact forms even when Graph conversation id is shared', () => {
  const sharedMailboxConversationId = 'kons@hairtpclinic.com:wp-shared-thread';
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: sharedMailboxConversationId,
            conversationId: 'wp-shared-thread',
            graphMessageId: 'wp-msg-sudarshan',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Kontaktformulär',
            bodyText:
              'Från: Sudarshan E-post: sudarshan@example.com Telefon: 0701112233 Hur kan vi hjälpa dig?',
            from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
            receivedAt: '2026-07-05T10:00:00.000Z',
          },
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: sharedMailboxConversationId,
            conversationId: 'wp-shared-thread',
            graphMessageId: 'wp-msg-blend',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Kontaktformulär',
            bodyText:
              'Från: Blend Bytyci E-post: blend@example.com Telefon: 0704445566 Hur kan vi hjälpa dig?',
            from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
            receivedAt: '2026-07-05T11:00:00.000Z',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({
    mailboxIds: ['kons@hairtpclinic.com'],
  });

  assert.equal(consumer.rows.length, 2);
  assert.deepEqual(consumer.rows.map((row) => row.customer.email).sort(), [
    'blend@example.com',
    'sudarshan@example.com',
  ]);
  assert.equal(new Set(consumer.rows.map((row) => row.id)).size, 2);
  assert.equal(
    consumer.rows.every((row) => row.id.includes('::contact-form:')),
    true
  );
});

test('worklist read model splits placeholder contact forms by submitted name when email is missing', () => {
  const sharedMailboxConversationId = 'kons@hairtpclinic.com:wp-shared-thread';
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: sharedMailboxConversationId,
            conversationId: 'wp-shared-thread',
            graphMessageId: 'wp-msg-sudarshan',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Sudarshan Kontaktformulär',
            bodyText:
              'Från: Sudarshan E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hej, jag behöver hjälp.',
            from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
            receivedAt: '2026-07-05T10:00:00.000Z',
          },
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: sharedMailboxConversationId,
            conversationId: 'wp-shared-thread',
            graphMessageId: 'wp-msg-blend',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Blend Bytyci Kontaktformulär',
            bodyText:
              'Från: Blend Bytyci E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Jag vill boka tid.',
            from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
            receivedAt: '2026-07-05T11:00:00.000Z',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({
    mailboxIds: ['kons@hairtpclinic.com'],
  });

  assert.equal(consumer.rows.length, 2);
  assert.deepEqual(consumer.rows.map((row) => row.customer.name).sort(), [
    'Blend Bytyci',
    'Sudarshan',
  ]);
  assert.equal(new Set(consumer.rows.map((row) => row.id)).size, 2);
  assert.equal(
    consumer.rows.every((row) => row.id.includes('::contact-form-ref:')),
    true
  );
  assert.equal(
    consumer.rows.some((row) => row.customer.email === 'wordpress@hairtpclinic.se'),
    false
  );
});

test('worklist read model never rolls placeholder contact forms up to wordpress sender identity', () => {
  const sharedMailboxConversationId = 'kons@hairtpclinic.com:wp-prod-shared-thread';
  const wordpressIdentity = {
    customerEmail: 'wordpress@hairtpclinic.se',
    customerKey: 'wordpress@hairtpclinic.se',
  };
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: sharedMailboxConversationId,
            conversationId: 'wp-prod-shared-thread',
            graphMessageId: 'wp-prod-msg-sudarshan',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Sudarshan Kontaktformulär',
            bodyPreview:
              'Från: Sudarshan E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hej, jag behöver hjälp.',
            bodyText:
              'Från: Sudarshan E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hej, jag behöver hjälp.',
            from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
            fromEmail: 'wordpress@hairtpclinic.se',
            senderEmail: 'wordpress@hairtpclinic.se',
            customerEmail: 'wordpress@hairtpclinic.se',
            customerIdentity: wordpressIdentity,
            receivedAt: '2026-07-05T10:00:00.000Z',
          },
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: sharedMailboxConversationId,
            conversationId: 'wp-prod-shared-thread',
            graphMessageId: 'wp-prod-msg-blend',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Blend Bytyci Kontaktformulär',
            bodyPreview:
              'Från: Blend Bytyci E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Jag vill boka tid.',
            bodyText:
              'Från: Blend Bytyci E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Jag vill boka tid.',
            from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
            fromEmail: 'wordpress@hairtpclinic.se',
            senderEmail: 'wordpress@hairtpclinic.se',
            customerEmail: 'wordpress@hairtpclinic.se',
            customerIdentity: wordpressIdentity,
            receivedAt: '2026-07-05T11:00:00.000Z',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({
    mailboxIds: ['kons@hairtpclinic.com'],
  });

  assert.equal(consumer.rows.length, 2);
  assert.deepEqual(consumer.rows.map((row) => row.customer.name).sort(), [
    'Blend Bytyci',
    'Sudarshan',
  ]);
  assert.equal(
    consumer.rows.some((row) => row.id.startsWith('customerEmail:wordpress')),
    false
  );
  assert.equal(
    consumer.rows.every((row) => row.id.includes('::contact-form-ref:')),
    true
  );
  assert.equal(
    consumer.rows.some((row) => row.customer.email === 'wordpress@hairtpclinic.se'),
    false
  );
});

test('worklist consumer visar besvarade kundtrådar i Alla utan needsReply', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-answered',
            conversationId: 'conv-answered',
            graphMessageId: 'msg-answered-in',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: true,
            subject: 'Fråga om konsultation',
            bodyPreview: 'Hej, jag vill boka konsultation.',
            from: {
              address: 'patient@example.com',
              name: 'Patient Example',
            },
            receivedAt: '2026-07-01T09:00:00.000Z',
          },
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-answered',
            conversationId: 'conv-answered',
            graphMessageId: 'msg-answered-out',
            folderType: 'sent',
            direction: 'outbound',
            isRead: true,
            subject: 'Sv: Fråga om konsultation',
            bodyPreview: 'Hej, tack. Här är tider för konsultation.',
            toRecipients: [{ emailAddress: { address: 'patient@example.com' } }],
            sentAt: '2026-07-01T10:00:00.000Z',
          },
        ];
      },
    },
  });

  const readModel = model.buildReadModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });
  const consumer = model.buildConsumerModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });

  assert.equal(readModel.rows.length, 1);
  assert.equal(readModel.summary.rowCount, 1);
  assert.equal(readModel.summary.needsReplyCount, 0);
  assert.equal(consumer.rows.length, 1);
  assert.equal(consumer.summary.rowCount, 1);
  assert.equal(consumer.summary.needsReplyCount, 0);
  assert.equal(consumer.rows[0].lane, 'all');
  assert.equal(consumer.rows[0].state.needsReply, false);
  assert.equal(consumer.rows[0].customer.email, 'patient@example.com');
});

test('worklist consumer fyller inte inkorgen med sent-only kliniktrådar', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-sent-only',
            conversationId: 'conv-sent-only',
            graphMessageId: 'msg-sent-only',
            folderType: 'sent',
            direction: 'outbound',
            isRead: true,
            subject: 'Utskick utan inkommande svar',
            bodyPreview: 'Hej, här kommer information.',
            toRecipients: [{ emailAddress: { address: 'patient@example.com' } }],
            sentAt: '2026-07-01T10:00:00.000Z',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });

  assert.equal(consumer.rows.length, 0);
  assert.equal(consumer.summary.rowCount, 0);
});

test('applyIngestionLedgerProjection bumps lane to review for unmatched ingestion', () => {
  const {
    applyIngestionLedgerProjection,
  } = require('../../src/ops/ccoMailboxTruthWorklistReadModel');
  const conversationKey = 'contact@hairtpclinic.com:thread-1';
  const projected = applyIngestionLedgerProjection({
    rollupRows: [
      {
        conversationKey,
        lane: 'all',
        needsReply: false,
      },
    ],
    ingestionStore: {
      getConversationIngestionMap: () => ({
        [conversationKey]: {
          conversationKey,
          unmatchedCount: 2,
          needsReviewCount: 0,
          needsReview: true,
          hasUnmatched: true,
          dominantStatus: 'UNMATCHED',
        },
      }),
    },
  });
  assert.equal(projected[0].lane, 'review');
  assert.equal(projected[0].ingestion.hasUnmatched, true);
});

test('buildConsumerModel row-shape: nested preview/timing/state/mailbox/customer (C1 field contract)', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'info@hairtpclinic.com',
            mailboxAddress: 'info@hairtpclinic.com',
            userPrincipalName: 'info@hairtpclinic.com',
            mailboxConversationId: 'info@hairtpclinic.com:conv-c1',
            conversationId: 'conv-c1',
            graphMessageId: 'msg-c1-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Fråga om behandling',
            latestPreview: 'Hej, jag undrar om FUE',
            from: { address: 'patient@example.com', name: 'Anna Svensson' },
            receivedAt: '2026-07-01T10:00:00.000Z',
            customerName: 'Anna Svensson',
            customerEmail: 'patient@example.com',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({ mailboxIds: ['info@hairtpclinic.com'] });
  assert.equal(consumer.rows.length, 1);
  const row = consumer.rows[0];

  // preview lives at row.preview (not row.latestPreview)
  assert.ok('preview' in row, 'row.preview must exist');
  assert.equal(typeof row.preview, 'string');

  // timing is nested
  assert.ok(row.timing && typeof row.timing === 'object', 'row.timing must be an object');
  assert.ok('latestMessageAt' in row.timing, 'row.timing.latestMessageAt must exist');
  assert.ok('lastInboundAt' in row.timing, 'row.timing.lastInboundAt must exist');
  assert.ok('lastOutboundAt' in row.timing, 'row.timing.lastOutboundAt must exist');

  // state is nested
  assert.ok(row.state && typeof row.state === 'object', 'row.state must be an object');
  assert.ok('hasUnreadInbound' in row.state, 'row.state.hasUnreadInbound must exist');
  assert.equal(row.state.hasUnreadInbound, true);

  // mailbox is nested
  assert.ok(row.mailbox && typeof row.mailbox === 'object', 'row.mailbox must be an object');
  assert.ok(
    row.mailbox.mailboxId || row.mailbox.mailboxAddress,
    'row.mailbox.mailboxId or mailboxAddress must be set'
  );

  // customer is nested
  assert.ok(row.customer && typeof row.customer === 'object', 'row.customer must be an object');
  assert.ok(
    'name' in row.customer && 'email' in row.customer,
    'row.customer must have name and email'
  );
  assert.equal(row.customer.email, 'patient@example.com');
  assert.equal(row.customer.name, 'Anna Svensson');

  // top-level evidence fields for reporting/backfill samples
  assert.equal(row.conversationKey, row.id);
  assert.equal(row.mailboxId, 'info@hairtpclinic.com');
  assert.equal(row.lastInboundAt, row.timing.lastInboundAt);
  assert.equal(row.evidenceComplete, true);
});

test('resolveWorklistEvidenceFields prefers nested consumer evidence over stale flat fallbacks', () => {
  const evidence = resolveWorklistEvidenceFields({
    id: 'legacy-row-id',
    mailboxId: 'legacy@hairtpclinic.com',
    lastInboundAt: '2026-01-01T08:00:00.000Z',
    customerMatchStatus: 'UNMATCHED',
    conversation: {
      key: 'kons@hairtpclinic.com:conv-nested',
    },
    mailbox: {
      mailboxId: 'kons@hairtpclinic.com',
    },
    timing: {
      lastInboundAt: '2026-07-02T10:30:00.000Z',
    },
    state: {
      needsReply: true,
      ingestion: {
        dominantStatus: 'MATCHED',
      },
    },
  });

  assert.equal(evidence.conversationKey, 'kons@hairtpclinic.com:conv-nested');
  assert.equal(evidence.mailboxId, 'kons@hairtpclinic.com');
  assert.equal(evidence.lastInboundAt, '2026-07-02T10:30:00.000Z');
  assert.equal(evidence.needsReply, true);
  assert.equal(evidence.customerMatch, 'MATCHED');
  assert.equal(evidence.evidenceComplete, true);
});
