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
  rewriteMailCidImageSources,
  deriveBody,
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

test('OOM-skydd: listMessages scopas till trådens mailbox, inte hela storen', () => {
  // fetchSortedConversationMessages laddade förr ALLA shards per request
  // (store.listMessages({})) → heapen spikade > 4 GB (Render-OOM) för
  // kontaktformulär-trådar med många memberKeys. Nu scopas den till mailboxen.
  let received = null;
  const spyStore = {
    listMessages: (options) => {
      received = options;
      return MESSAGES;
    },
  };
  fetchSortedConversationMessages(
    spyStore,
    'kons@hairtpclinic.com:AAQ123::contact-form:blend.bytyci@hotmail.com',
    ['kons@hairtpclinic.com:AAMk456::contact-form-ref:blend']
  );
  assert.ok(received, 'listMessages ska anropas med options');
  assert.deepEqual(
    received.mailboxIds,
    ['kons@hairtpclinic.com'],
    'ska scopa till kons@-sharden, inte ladda alla shards'
  );
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

test('kontaktformulär utan e-post: message-id som bas visar bara vald formulärrad', () => {
  const sharedBaseKey = 'kons@hairtpclinic.com:wp-shared-thread';
  const scopedSudarshanMessageKey = toContactFormReferenceScopedConversationKey(
    'cf-sudarshan',
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
        subject: 'Obaida Ali Kontaktformulär',
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

  const sorted = fetchSortedConversationMessages(contactFormStore, scopedSudarshanMessageKey, [
    sharedBaseKey,
  ]);

  assert.deepEqual(
    sorted.map((message) => message.graphMessageId),
    ['cf-sudarshan'],
    'vald kontaktformulär-rads graphMessageId får inte breddas till hela WordPress-tråden'
  );
});

test('kontaktformulär reference-scope matchar namn även när meddelandet har telefon eller e-post', () => {
  const sharedBaseKey = 'kons@hairtpclinic.com:wp-shared-thread';
  const scopedSudarshanMessageKey = toContactFormReferenceScopedConversationKey(
    'cf-sudarshan',
    'Sudarshan'
  );
  const contactFormStore = {
    listMessages: () => [
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
          'Från: Sudarshan E-post: sudarshan@example.com Telefon: 0701112233 Hur kan vi hjälpa dig? Hej, jag behöver hjälp.',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
      {
        graphMessageId: 'cf-sundquist',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'inbox',
        direction: 'inbound',
        receivedAt: '2026-11-21T14:00:00.000Z',
        subject: 'Sundquist Kontaktformulär',
        bodyText:
          'Från: Sundquist E-post: sundquist@example.com Telefon: 0709998877 Hur kan vi hjälpa dig? Hej, tack för hjälpen.',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
    ],
  };

  const sorted = fetchSortedConversationMessages(contactFormStore, scopedSudarshanMessageKey, [
    sharedBaseKey,
  ]);

  assert.deepEqual(
    sorted.map((message) => message.graphMessageId),
    ['cf-sudarshan'],
    'namn-scope från listan ska matcha full kontaktformulär-identitet men inte andra formulär'
  );
});

test('kontaktformulär utan e-post: ämnesrad räcker för reference-scope när body är mager', () => {
  const sharedBaseKey = 'kons@hairtpclinic.com:wp-shared-thread';
  const scopedSudarshanKey = toContactFormReferenceScopedConversationKey(
    sharedBaseKey,
    'Sudarshan'
  );
  const contactFormStore = {
    listMessages: () => [
      {
        graphMessageId: 'cf-obaida-preview',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'inbox',
        direction: 'inbound',
        receivedAt: '2026-10-14T05:11:00.000Z',
        subject: 'Obaida Ali Kontaktformulär',
        bodyPreview: 'Från: Obaida Ali E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig?',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
      {
        graphMessageId: 'cf-sudarshan-preview',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxConversationId: sharedBaseKey,
        conversationId: 'wp-shared-thread',
        folderType: 'inbox',
        direction: 'inbound',
        receivedAt: '2026-11-21T13:00:00.000Z',
        subject: 'Sudarshan Kontaktformulär',
        bodyPreview: 'Från: Sudarshan E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig?',
        from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
      },
    ],
  };

  const sorted = fetchSortedConversationMessages(contactFormStore, scopedSudarshanKey);

  assert.deepEqual(
    sorted.map((message) => message.graphMessageId),
    ['cf-sudarshan-preview'],
    'selected kontaktformulär-rad får inte bli tom bara för att Graph bara gav preview/subject'
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

test('full bodyText vinner över kortare Graph-body när båda finns', () => {
  const preview = 'Från: Sudarshan E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hej';
  const fullBody = `${preview}, jag har fyllt i formuläret och vill gärna bli kontaktad om hårtransplantation.

Medgivande: Jag godkänner att mina personuppgifter behandlas i syfte att kontakta mig.

--
Epost-meddelandet skickades från Hair TP Clinic kontaktformulär.
Med vänliga hälsningar,
Hair TP Clinic`;
  const message = {
    bodyPreview: preview,
    body: {
      contentType: 'text',
      content: `${preview}, jag har fyllt i formuläret...`,
    },
    bodyText: fullBody,
  };

  assert.equal(deriveBody(message), fullBody);
});

test('enriched raw bodyText ersätter kortare truth-body i trådvy', () => {
  const truthMessage = {
    graphMessageId: 'graph-short-body',
    mailboxId: 'kons@hairtpclinic.com',
    conversationId: 'conv-short-body',
    mailboxConversationId: 'kons@hairtpclinic.com:conv-short-body',
    folderType: 'inbox',
    bodyPreview: 'Hej, jag vill boka konsultation',
    body: {
      contentType: 'text',
      content: 'Hej, jag vill boka konsultation...',
    },
  };
  const rawMessage = {
    graphMessageId: 'graph-short-body',
    mailboxId: 'kons@hairtpclinic.com',
    conversationId: 'conv-short-body',
    mailboxConversationId: 'kons@hairtpclinic.com:conv-short-body',
    folderType: 'inbox',
    bodyText:
      'Hej, jag vill boka konsultation i Göteborg. Jag har flera frågor om pris, tider och eftervård.\n\nMed vänliga hälsningar,\nKund',
  };
  const store = {
    getState() {
      return {
        mailRawMessages: {
          raw1: rawMessage,
        },
      };
    },
  };

  const [enriched] = enrichConversationMessagesWithIngestion([truthMessage], store);

  assert.equal(deriveBody(enriched), rawMessage.bodyText);
});

test('inline-assets från canonical mail document exponeras som säkra bilagor', () => {
  const attachments = collectConversationAttachments({
    mailDocument: {
      inlineAssets: [
        {
          assetId: 'inline-logo-1',
          filename: 'logo.png',
          mimeType: 'image/png',
          disposition: 'inline',
          contentId: 'logo@hairtp',
          render: { safe: true, state: 'attachment_content_available' },
          download: { available: false, state: 'inline_only' },
          contentBytes: 'SECRET',
        },
      ],
      attachments: [
        {
          assetId: 'file-1',
          filename: 'bilaga.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          download: { available: true, state: 'metadata_only' },
          contentBytes: 'SECRET',
        },
      ],
    },
  });

  assert.equal(attachments.length, 2);
  assert.equal(attachments[0].name, 'bilaga.pdf');
  assert.equal(attachments[1].name, 'logo.png');
  assert.equal(attachments[1].isInline, true);
  assert.equal(attachments[1].contentId, 'logo@hairtp');
  assert.equal(attachments[1].render.safe, true);
  assert.equal(attachments[1].contentBytes, undefined);
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

test('nested Graph-raw body/html matchar truth-preview via rawJson.id', () => {
  const preview = 'Kort preview från Graph';
  const truthMessages = [
    {
      graphMessageId: 'graph-nested-1',
      mailboxId: 'kons@hairtpclinic.com',
      mailboxConversationId: 'kons@hairtpclinic.com:conv-nested',
      conversationId: 'conv-nested',
      folderType: 'inbox',
      receivedAt: '2026-07-05T12:00:00.000Z',
      bodyPreview: preview,
      bodyText: preview,
      from: { address: 'kund@example.com' },
    },
  ];
  const ingestionStore = {
    getState: () => ({
      mailRawMessages: {
        nested: {
          mailboxId: 'kons@hairtpclinic.com',
          rawJson: {
            id: 'graph-nested-1',
            conversationId: 'conv-nested',
            receivedDateTime: '2026-07-05T12:00:00.000Z',
            bodyPreview: preview,
            body: {
              contentType: 'html',
              content:
                '<div><p>Kort preview från Graph</p><p>Fullt mail med signatur, logotyp och hela kundens fråga.</p></div>',
            },
            from: {
              emailAddress: { address: 'kund@example.com', name: 'Kund Exempel' },
            },
          },
        },
      },
    }),
  };

  const [enriched] = enrichConversationMessagesWithIngestion(truthMessages, ingestionStore);

  assert.match(enriched.bodyText, /Fullt mail med signatur/);
  assert.match(enriched.bodyHtml, /Fullt mail med signatur/);
  assert.ok(enriched.bodyText.length > preview.length + 30);
});

test('kontaktformulär-preview berikas från scoped raw-store även när Graph-id saknar alias', () => {
  const preview =
    'Från: Sudarshan E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hi, I am a foreigner residing in Umea, Sweden.';
  const truthMessages = [
    {
      graphMessageId: 'cf-sudarshan-preview-only',
      mailboxId: 'kons@hairtpclinic.com',
      mailboxConversationId: 'kons@hairtpclinic.com:contact-form',
      conversationId: 'contact-form',
      folderType: 'inbox',
      receivedAt: '2026-10-14T05:11:00.000Z',
      subject: 'Sudarshan Kontaktformulär',
      bodyPreview: preview,
      bodyText: preview,
      from: { address: 'wordpress@hairtpclinic.se', name: 'WordPress' },
    },
  ];
  const sudarshanFullBody = [
    preview,
    'I recently have had a hair transplant abroad. Its been about 5 months now.',
    'I am experiencing redness and would like advice about aftercare and next steps.',
    'GDPR: Medgavs. Jag godkänner att mina personuppgifter behandlas.',
  ].join(' ');
  const ingestionStore = {
    getState: () => ({
      mailRawMessages: {
        obaida: {
          graphMessageId: 'cf-obaida-full',
          mailboxId: 'kons@hairtpclinic.com',
          mailboxConversationId: 'kons@hairtpclinic.com:contact-form',
          conversationId: 'contact-form',
          folderType: 'inbox',
          receivedAt: '2026-10-14T05:11:00.000Z',
          subject: 'Obaida Ali Kontaktformulär',
          bodyText:
            'Från: Obaida Ali E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hårtransplantation GDPR: Medgavs.',
          fromEmail: 'wordpress@hairtpclinic.se',
        },
        sudarshan: {
          graphMessageId: 'raw-sudarshan-full',
          mailboxId: 'kons@hairtpclinic.com',
          mailboxConversationId: 'kons@hairtpclinic.com:contact-form',
          conversationId: 'contact-form',
          folderType: 'inbox',
          receivedAt: '2026-10-14T05:11:00.000Z',
          subject: 'Sudarshan Kontaktformulär',
          bodyPreview: preview,
          bodyText: sudarshanFullBody,
          fromEmail: 'wordpress@hairtpclinic.se',
        },
      },
    }),
  };

  const [enriched] = enrichConversationMessagesWithIngestion(truthMessages, ingestionStore, {
    contactReference: 'sudarshan',
  });

  assert.match(enriched.bodyText, /Its been about 5 months now/);
  assert.match(enriched.bodyText, /I am experiencing redness/);
  assert.doesNotMatch(enriched.bodyText, /Obaida Ali/);
  assert.ok(enriched.bodyText.length > preview.length + 100);
});

test('cid-inlinebilder skrivs om till säkra attachment-URL:er', () => {
  const message = {
    mailboxId: 'kons@hairtpclinic.com',
    graphMessageId: 'graph-inline-logo',
    rawJson: {
      body: {
        contentType: 'html',
        content: '<div><img src="cid:logo@hairtp"><p>Med vänliga hälsningar</p></div>',
      },
      attachments: [
        {
          id: 'att-logo',
          name: 'logo.png',
          contentType: 'image/png',
          isInline: true,
          contentId: 'logo@hairtp',
          contentBytes: 'SECRET',
        },
      ],
    },
  };
  const attachments = collectConversationAttachments(message);
  const html = rewriteMailCidImageSources(deriveBodyHtml(message), attachments);

  assert.doesNotMatch(html, /cid:logo@hairtp/);
  assert.match(html, /\/api\/v1\/cco\/runtime\/mail-asset\/content\?/);
  assert.match(html, /attachmentId=att-logo/);
  assert.match(html, /messageId=graph-inline-logo/);
});

test('bilagor får öppnings- och nedladdningslänkar utan contentBytes', () => {
  const [attachment] = collectConversationAttachments({
    mailboxId: 'kons@hairtpclinic.com',
    graphMessageId: 'graph-asset-1',
    attachments: [
      {
        id: 'att-logo-1',
        name: 'logo.png',
        contentType: 'image/png',
        size: 512,
        isInline: true,
        contentBytes: 'SECRET',
      },
    ],
  });

  assert.equal(attachment.name, 'logo.png');
  assert.match(attachment.openUrl, /\/api\/v1\/cco\/runtime\/mail-asset\/content\?/);
  assert.match(attachment.openUrl, /mailboxId=kons%40hairtpclinic\.com/);
  assert.match(attachment.openUrl, /messageId=graph-asset-1/);
  assert.match(attachment.openUrl, /attachmentId=att-logo-1/);
  assert.match(attachment.downloadUrl, /mode=download/);
  assert.equal(attachment.inlineUrl, attachment.openUrl);
  assert.equal(attachment.contentBytes, undefined);
});

test('enrichment merge:ar truth- och raw-bilagor i samma tråd', () => {
  const truthMessages = [
    {
      graphMessageId: 'graph-merge-1',
      mailboxId: 'kons@hairtpclinic.com',
      conversationId: 'conv-merge',
      mailboxConversationId: 'kons@hairtpclinic.com:conv-merge',
      bodyText: 'Kort',
      attachments: [{ id: 'truth-att', name: 'truth.pdf', contentType: 'application/pdf' }],
    },
  ];
  const ingestionStore = {
    getState: () => ({
      mailRawMessages: {
        raw: {
          graphMessageId: 'graph-merge-1',
          mailboxId: 'kons@hairtpclinic.com',
          conversationId: 'conv-merge',
          bodyText: 'Kort men med hela texten från raw-store som är längre.',
          attachments: [{ id: 'raw-att', name: 'raw.jpg', contentType: 'image/jpeg' }],
        },
      },
    }),
  };

  const [enriched] = enrichConversationMessagesWithIngestion(truthMessages, ingestionStore);

  assert.deepEqual(enriched.attachments.map((attachment) => attachment.name).sort(), [
    'raw.jpg',
    'truth.pdf',
  ]);
});

test('tom/ogiltig nyckel ger tom lista', () => {
  assert.deepEqual(fetchSortedConversationMessages(store, ''), []);
  assert.deepEqual(fetchSortedConversationMessages(null, 'x'), []);
});
