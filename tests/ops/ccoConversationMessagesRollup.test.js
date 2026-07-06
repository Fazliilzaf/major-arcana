'use strict';

/* Trådöppning i Konversationer: rollup-rader (kund med flera Graph-
 * konversationer) bär en identitets-/primärnyckel som inte matchar någon
 * lagrad mailboxConversationId — exakt strängmatch gav "0 meddelanden" eller
 * halva tråden. Låser att fetchSortedConversationMessages:
 *  - matchar råa nyckeln (oförändrat beteende för enkla trådar),
 *  - matchar kanoniskt normaliserad nyckel (case/mailbox-scopning),
 *  - unionerar över memberKeys (rollup-medlemmarna) sorterat i tidsordning,
 *  - ger [] för identitetsnyckel utan medlemmar (ingen gissning). */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectConversationAttachments,
  deriveBodyHtml,
  enrichConversationMessagesWithIngestion,
  fetchSortedConversationMessages,
  fetchSortedConversationMessagesForKeys,
  fetchSortedIngestionConversationMessagesForKeys,
  parseConversationContactScopeQuery,
} = require('../../src/routes/ccoConversation');
const {
  toContactFormReferenceScopedConversationKey,
  toContactFormScopedConversationKey,
} = require('../../src/ops/ccoContactFormIdentity');

const MESSAGES = [
  {
    graphMessageId: 'g-1',
    mailboxId: 'kons@hairtpclinic.com',
    conversationId: 'conv-form',
    mailboxConversationId: 'kons@hairtpclinic.com:conv-form',
    folderType: 'inbox',
    receivedAt: '2026-03-04T09:00:00.000Z',
    subject: 'Kontaktformulär',
    from: { address: 'kund@example.com' },
  },
  {
    graphMessageId: 'g-2',
    mailboxId: 'kons@hairtpclinic.com',
    conversationId: 'conv-svar',
    mailboxConversationId: 'kons@hairtpclinic.com:conv-svar',
    folderType: 'sent',
    sentAt: '2026-03-04T12:31:00.000Z',
    subject: 'Re: Kontaktformulär',
    from: { address: 'kons@hairtpclinic.com' },
  },
  {
    graphMessageId: 'g-3',
    mailboxId: 'kons@hairtpclinic.com',
    conversationId: 'conv-svar',
    mailboxConversationId: 'kons@hairtpclinic.com:conv-svar',
    folderType: 'sent',
    sentAt: '2026-03-06T17:50:00.000Z',
    subject: 'Re: Kontaktformulär',
    from: { address: 'kons@hairtpclinic.com' },
  },
];

const store = { listMessages: () => MESSAGES };

test('enkel tråd: exakt nyckel ger samma resultat som förut', () => {
  const sorted = fetchSortedConversationMessages(store, 'kons@hairtpclinic.com:conv-svar');
  assert.equal(sorted.length, 2);
  assert.equal(sorted[0].graphMessageId, 'g-2');
  assert.equal(sorted[1].graphMessageId, 'g-3');
});

test('rollup: primärnyckel + memberKeys unionerar HELA kundtråden i tidsordning', () => {
  // Radens nyckel är svarstrådens — kontaktformulärstråden är rollup-medlem.
  const sorted = fetchSortedConversationMessages(store, 'kons@hairtpclinic.com:conv-svar', [
    'kons@hairtpclinic.com:conv-form',
  ]);
  assert.equal(sorted.length, 3, 'både inkommande formulärsmail och båda svaren');
  assert.deepEqual(
    sorted.map((m) => m.graphMessageId),
    ['g-1', 'g-2', 'g-3'],
    'sorterat i tidsordning över konversationsgränserna'
  );
});

test('identitetsnyckel utan medlemmar ger tom lista — men MED medlemmar hittas tråden', () => {
  // Rollup-rader med mergedCount > 1 kan bära en identitetsnyckel som aldrig
  // finns bland lagrade mailboxConversationId ("0 meddelanden"-buggen).
  const withoutMembers = fetchSortedConversationMessages(store, 'email:kund@example.com');
  assert.equal(withoutMembers.length, 0);
  const withMembers = fetchSortedConversationMessages(store, 'email:kund@example.com', [
    'kons@hairtpclinic.com:conv-form',
    'kons@hairtpclinic.com:conv-svar',
  ]);
  assert.equal(withMembers.length, 3, 'medlemsnycklarna räddar hela tråden');
});

test('kontaktformulär: öppnad scope-nyckel visar bara den kundens meddelanden', () => {
  const sharedBaseKey = 'kons@hairtpclinic.com:wp-shared-thread';
  const scopedBlendKey = toContactFormScopedConversationKey(sharedBaseKey, 'blend@example.com');
  const contactFormStore = {
    listMessages: () => [
      {
        graphMessageId: 'cf-sudarshan',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'inbox',
        direction: 'inbound',
        receivedAt: '2026-07-05T10:00:00.000Z',
        subject: 'Kontaktformulär',
        bodyText:
          'Från: Sudarshan E-post: sudarshan@example.com Telefon: 0701112233 Hur kan vi hjälpa dig?',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
      {
        graphMessageId: 'cf-blend-in',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'inbox',
        direction: 'inbound',
        receivedAt: '2026-07-05T11:00:00.000Z',
        subject: 'Kontaktformulär',
        bodyText:
          'Från: Blend Bytyci E-post: blend@example.com Telefon: 0704445566 Hur kan vi hjälpa dig?',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
      {
        graphMessageId: 'cf-blend-out',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'sent',
        direction: 'outbound',
        sentAt: '2026-07-05T12:00:00.000Z',
        subject: 'Re: Kontaktformulär',
        from: { address: 'kons@hairtpclinic.com', name: 'Kons' },
        toRecipients: [{ emailAddress: { address: 'blend@example.com' } }],
      },
    ],
  };

  const sorted = fetchSortedConversationMessages(contactFormStore, scopedBlendKey);

  assert.deepEqual(
    sorted.map((message) => message.graphMessageId),
    ['cf-blend-in', 'cf-blend-out']
  );

  const sortedWithRawSharedMemberKey = fetchSortedConversationMessages(
    contactFormStore,
    scopedBlendKey,
    [sharedBaseKey]
  );
  assert.deepEqual(
    sortedWithRawSharedMemberKey.map((message) => message.graphMessageId),
    ['cf-blend-in', 'cf-blend-out'],
    'rå shared WordPress-/Graph-nyckel får inte bredda en scoped kontaktformulärstråd'
  );

  const sortedWithRawPrimaryAndScopedMember = fetchSortedConversationMessages(
    contactFormStore,
    sharedBaseKey,
    [scopedBlendKey]
  );
  assert.deepEqual(
    sortedWithRawPrimaryAndScopedMember.map((message) => message.graphMessageId),
    ['cf-blend-in', 'cf-blend-out'],
    'även rå primärnyckel ska ärva scope från scoped memberKey och inte visa andra kontaktformulär'
  );

  const sortedWithRawPrimaryAndCustomerEmail = fetchSortedConversationMessages(
    contactFormStore,
    sharedBaseKey,
    [],
    { contactEmail: 'blend@example.com' }
  );
  assert.deepEqual(
    sortedWithRawPrimaryAndCustomerEmail.map((message) => message.graphMessageId),
    ['cf-blend-in', 'cf-blend-out'],
    'prod-rader med rå shared key måste scopa på kundens e-post från worklisten'
  );

  const sortedViaHelper = fetchSortedConversationMessagesForKeys(contactFormStore, [
    scopedBlendKey,
    sharedBaseKey,
  ]);
  assert.deepEqual(
    sortedViaHelper.map((message) => message.graphMessageId),
    ['cf-blend-in', 'cf-blend-out'],
    'multi-key-helpern får inte flat-mappa den råa shared-nyckeln och dra in andra kunder'
  );
});

test('kontaktformulär: ingestion-helper ärver scoped key och breddar inte shared WordPress-tråd', () => {
  const sharedBaseKey = 'kons@hairtpclinic.com:wp-shared-thread';
  const scopedBlendKey = toContactFormScopedConversationKey(sharedBaseKey, 'blend@example.com');
  const ingestionStore = {
    getState: () => ({
      mailRawMessages: {
        sudarshan: {
          id: 'cf-sudarshan',
          graphMessageId: 'cf-sudarshan',
          mailboxId: 'kons@hairtpclinic.com',
          mailboxConversationId: sharedBaseKey,
          conversationId: 'wp-shared-thread',
          folderType: 'inbox',
          direction: 'inbound',
          receivedAt: '2026-07-05T10:00:00.000Z',
          subject: 'Kontaktformulär',
          bodyText:
            'Från: Sudarshan E-post: sudarshan@example.com Telefon: 0701112233 Hur kan vi hjälpa dig?',
          fromEmail: 'wordpress@hairtpclinic.se',
          fromName: 'WordPress',
        },
        blend: {
          id: 'cf-blend-in',
          graphMessageId: 'cf-blend-in',
          mailboxId: 'kons@hairtpclinic.com',
          mailboxConversationId: sharedBaseKey,
          conversationId: 'wp-shared-thread',
          folderType: 'inbox',
          direction: 'inbound',
          receivedAt: '2026-07-05T11:00:00.000Z',
          subject: 'Kontaktformulär',
          bodyText:
            'Från: Blend Bytyci E-post: blend@example.com Telefon: 0704445566 Hur kan vi hjälpa dig?',
          fromEmail: 'wordpress@hairtpclinic.se',
          fromName: 'WordPress',
        },
      },
    }),
  };

  const sorted = fetchSortedIngestionConversationMessagesForKeys(ingestionStore, [
    scopedBlendKey,
    sharedBaseKey,
  ]);

  assert.deepEqual(
    sorted.map((message) => message.graphMessageId),
    ['cf-blend-in'],
    'raw ingestion-fallback ska också hålla kvar scoped kontaktformulär per kund'
  );

  const sortedByCustomerEmail = fetchSortedIngestionConversationMessagesForKeys(
    ingestionStore,
    [sharedBaseKey],
    { contactEmail: 'blend@example.com' }
  );
  assert.deepEqual(
    sortedByCustomerEmail.map((message) => message.graphMessageId),
    ['cf-blend-in'],
    'ingestion-fallbacken måste också kunna scopa rå shared key med customerEmail-queryn'
  );
});

test('kontaktformulär utan e-post: öppnad reference scope visar bara rätt formulärnamn', () => {
  const sharedBaseKey = 'kons@hairtpclinic.com:wp-shared-thread';
  const scopedSudarshanKey = toContactFormReferenceScopedConversationKey(
    sharedBaseKey,
    'Sudarshan'
  );
  const contactFormStore = {
    listMessages: () => [
      {
        graphMessageId: 'cf-obaida',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'inbox',
        direction: 'inbound',
        receivedAt: '2026-10-14T05:11:00.000Z',
        subject: 'Kontaktformulär',
        bodyText:
          'Från: Obaida Ali E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hårtransplantation GDPR.',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
      {
        graphMessageId: 'cf-sudarshan',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'inbox',
        direction: 'inbound',
        receivedAt: '2026-11-21T13:00:00.000Z',
        subject: 'Sudarshan Kontaktformulär',
        bodyText:
          'Från: Sudarshan E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hej, jag behöver hjälp.',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
      {
        graphMessageId: 'cf-blend',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'inbox',
        direction: 'inbound',
        receivedAt: '2026-12-04T12:31:00.000Z',
        subject: 'Blend Bytyci Kontaktformulär',
        bodyText:
          'Från: Blend Bytyci E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Jag vill boka.',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
    ],
  };

  const sorted = fetchSortedConversationMessages(contactFormStore, scopedSudarshanKey);

  assert.deepEqual(
    sorted.map((message) => message.graphMessageId),
    ['cf-sudarshan']
  );

  const sortedWithRawSharedMemberKey = fetchSortedConversationMessages(
    contactFormStore,
    scopedSudarshanKey,
    [sharedBaseKey]
  );
  assert.deepEqual(
    sortedWithRawSharedMemberKey.map((message) => message.graphMessageId),
    ['cf-sudarshan'],
    'rå shared WordPress-/Graph-nyckel får inte bredda en reference-scopad kontaktformulärstråd'
  );

  const sortedWithRawPrimaryAndScopedMember = fetchSortedConversationMessages(
    contactFormStore,
    sharedBaseKey,
    [scopedSudarshanKey]
  );
  assert.deepEqual(
    sortedWithRawPrimaryAndScopedMember.map((message) => message.graphMessageId),
    ['cf-sudarshan'],
    'rå primärnyckel ska ärva reference-scope från scoped memberKey'
  );

  const sortedWithRawPrimaryAndContactReference = fetchSortedConversationMessages(
    contactFormStore,
    sharedBaseKey,
    [],
    { contactReference: 'Sudarshan' }
  );
  assert.deepEqual(
    sortedWithRawPrimaryAndContactReference.map((message) => message.graphMessageId),
    ['cf-sudarshan'],
    'prod-rader med rå shared key måste kunna scopa på kontaktreferens när kundmail saknas'
  );
});

test('contact scope query normaliserar e-post och kontaktreferens', () => {
  assert.deepEqual(parseConversationContactScopeQuery({ contactReference: ' Sudarshan ' }), {
    contactReference: 'sudarshan',
  });
  assert.deepEqual(
    parseConversationContactScopeQuery({
      customerEmail: ' Blend@Example.com ',
      contactReference: ' Blend Bytyci ',
    }),
    {
      contactEmail: 'blend@example.com',
      contactReference: 'blend bytyci',
    }
  );
});

test('rich mail html och bilagor exponeras utan rå contentBytes', () => {
  const message = {
    bodyPreview: 'Hej',
    rawJson: {
      body: {
        contentType: 'html',
        content: '<p>Hej</p><img src="cid:logo"><script>bad()</script>',
      },
      attachments: [
        {
          id: 'a1',
          name: 'logo.png',
          contentType: 'image/png',
          size: 1234,
          isInline: true,
          contentBytes: 'SECRET',
        },
      ],
    },
  };

  assert.match(deriveBodyHtml(message), /<p>Hej<\/p>/);
  const attachments = collectConversationAttachments(message);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].name, 'logo.png');
  assert.equal(attachments[0].contentType, 'image/png');
  assert.equal(attachments[0].contentBytes, undefined);
});

test('truth-preview berikas med full ingestion-body när raw store har hela mailet', () => {
  const preview = 'Från: Blend Bytyci E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig?';
  const truthMessages = [
    {
      graphMessageId: 'cf-blend-full',
      mailboxId: 'kons@hairtpclinic.com',
      mailboxConversationId: 'kons@hairtpclinic.com:conv-full',
      conversationId: 'conv-full',
      folderType: 'inbox',
      receivedAt: '2026-07-05T11:00:00.000Z',
      bodyPreview: preview,
      bodyText: preview,
      from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
    },
  ];
  const fullBody = [
    preview,
    'Jag känner mig redo att boka konsultation och vill veta vilka tider som finns nästa vecka.',
    'GDPR: Medgavs. Jag godkänner att mina personuppgifter behandlas.',
  ].join(' ');
  const ingestionStore = {
    getState: () => ({
      mailRawMessages: {
        blend: {
          id: 'cf-blend-full',
          graphMessageId: 'cf-blend-full',
          mailboxId: 'kons@hairtpclinic.com',
          mailboxConversationId: 'kons@hairtpclinic.com:conv-full',
          conversationId: 'conv-full',
          folderType: 'inbox',
          receivedAt: '2026-07-05T11:00:00.000Z',
          bodyPreview: preview,
          bodyText: fullBody,
          attachments: [
            {
              id: 'att-1',
              name: 'remiss.pdf',
              contentType: 'application/pdf',
              size: 4096,
              contentBytes: 'nope',
            },
          ],
          fromEmail: 'wordpress@hairtpclinic.se',
          fromName: 'WordPress',
        },
      },
    }),
  };

  const [enriched] = enrichConversationMessagesWithIngestion(truthMessages, ingestionStore);

  assert.match(enriched.bodyText, /Jag känner mig redo att boka konsultation/);
  assert.ok(enriched.bodyText.length > preview.length + 40);
  assert.equal(enriched.attachments[0].name, 'remiss.pdf');
});

test('tom/ogiltig nyckel ger tom lista', () => {
  assert.deepEqual(fetchSortedConversationMessages(store, ''), []);
  assert.deepEqual(fetchSortedConversationMessages(null, 'x'), []);
});
