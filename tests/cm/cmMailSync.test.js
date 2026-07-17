'use strict';

// ORD-64 · cmMailSync v2: delta-cursor, dedupe, originalarkiv, bilagor, ledger.
// Fixture-connector — inga nätanrop. OPENAI_API_KEY nollas så extraktion
// fail-closed:ar utan externa anrop.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCmStore } = require('../../src/cm/cmStore');
const { createCmMailSync, buildCombinedText, stripHtml } = require('../../src/cm/cmMailSync');

delete process.env.OPENAI_API_KEY;

function makeMessage({ id, subject, body = '', hasAttachments = false }) {
  return {
    id,
    internetMessageId: `<${id}@test>`,
    subject,
    from: { emailAddress: { address: 'leverantor@test.se' } },
    receivedDateTime: '2026-07-12T10:00:00Z',
    hasAttachments,
    body: { content: body },
    bodyPreview: body.slice(0, 200),
  };
}

function makeFixtureConnector({ messages, deltaLink = 'https://graph/delta?token=DL1' }) {
  const calls = { deltaPages: [], attachmentContent: [] };
  return {
    calls,
    graphBaseUrl: 'https://graph.test/v1.0',
    async fetchAccessToken() {
      return 'token-123';
    },
    async fetchMailboxTruthFolderDeltaPage({ userId, folderType, cursorUrl }) {
      calls.deltaPages.push({ userId, folderType, cursorUrl });
      return {
        account: { mailboxId: userId },
        folder: { folderType },
        page: { nextPageUrl: null, deltaLink, complete: true },
        changes: messages.map((m) => ({ changeType: 'upsert', message: m })),
      };
    },
    async fetchMessageAttachmentContent({ messageId, attachmentId }) {
      calls.attachmentContent.push({ messageId, attachmentId });
      return {
        attachmentId,
        name: 'faktura.pdf',
        contentType: 'application/pdf',
        size: 13,
        isInline: false,
        buffer: Buffer.from('%PDF-1.4 fake'),
      };
    },
  };
}

function makeFakeSecureStorage() {
  const objects = [];
  return {
    objects,
    async putObject({ key, body, contentType }) {
      objects.push({
        key,
        size: Buffer.isBuffer(body) ? body.length : String(body).length,
        contentType,
      });
      return { storageKey: key, checksum: 'deadbeef', size: 1, deduped: false };
    },
  };
}

async function tmpStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-mailsync-test-'));
  const store = createCmStore({ filePath: path.join(dir, 'cm.json') });
  return store;
}

test('syncFolder: importerar ALLA mail (CM-4), sparar deltaLink + original', async () => {
  const cmStore = await tmpStore();
  const connector = makeFixtureConnector({
    messages: [
      makeMessage({
        id: 'm1',
        subject: 'Faktura 2026-100',
        body: 'Att betala: 1 250 kr. Förfallodatum 2026-08-01. OCR 123456.',
      }),
      makeMessage({ id: 'm2', subject: 'Nyhetsbrev juli', body: 'Hej! Kul saker har hänt.' }),
    ],
  });
  const secureStorage = makeFakeSecureStorage();
  const sync = createCmMailSync({ graphReadConnector: connector, cmStore, secureStorage });

  const result = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(result.ok, true);
  // ORD-CM-4: "varje mail räknas" — nyhetsbrevet importeras OCKSÅ
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 1); // statistik: 1 icke-ekonomi
  assert.equal(result.duplicates, 0);

  // deltaLink persisterad
  assert.equal(
    cmStore.getSyncState('kons@test.se', 'inbox').deltaLink,
    'https://graph/delta?token=DL1'
  );
  // original arkiverat (BFN)
  assert.ok(secureStorage.objects.some((o) => o.key.startsWith('cm/raw-mail/')));
  // extraktion körd utan nyckel → fel loggat men importen står
  assert.ok(result.errors.some((e) => /OPENAI_API_KEY saknas/.test(e.error)));
});

test('syncFolder: andra körningen dedupear (samma meddelanden)', async () => {
  const cmStore = await tmpStore();
  const connector = makeFixtureConnector({
    messages: [
      makeMessage({ id: 'm1', subject: 'Kvitto café', body: 'Kvitto på 85 kr betalt med kort.' }),
    ],
  });
  const sync = createCmMailSync({
    graphReadConnector: connector,
    cmStore,
    secureStorage: makeFakeSecureStorage(),
  });

  const first = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(first.imported, 1);
  const second = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(second.imported, 0);
  assert.equal(second.duplicates, 1);
  // cursorn användes i andra körningen
  assert.equal(connector.calls.deltaPages[1].cursorUrl, 'https://graph/delta?token=DL1');
});

test('syncFolder: PDF-bilaga sparas i secure storage + dokument skapas', async () => {
  const cmStore = await tmpStore();
  const connector = makeFixtureConnector({
    messages: [
      makeMessage({
        id: 'm3',
        subject: 'Er faktura',
        hasAttachments: true,
        body: 'Se bifogad faktura.',
      }),
    ],
  });
  const secureStorage = makeFakeSecureStorage();
  const fetchImpl = async (url, init) => {
    assert.match(url, /attachments\?\$select/);
    // ORD-67f: immutable-ID-headern MÅSTE följa med — annars Graph 400 i prod.
    assert.equal(init?.headers?.Prefer, 'IdType="ImmutableId"');
    return {
      ok: true,
      async json() {
        return {
          value: [
            {
              id: 'a1',
              name: 'faktura.pdf',
              contentType: 'application/pdf',
              size: 1234,
              isInline: false,
            },
          ],
        };
      },
    };
  };
  const sync = createCmMailSync({
    graphReadConnector: connector,
    cmStore,
    secureStorage,
    fetchImpl,
  });

  const result = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(result.imported, 1);
  assert.equal(connector.calls.attachmentContent.length, 1);
  assert.ok(
    secureStorage.objects.some(
      (o) => o.key.startsWith('cm/receipts/') && o.key.endsWith('faktura.pdf')
    )
  );

  const dash = cmStore.getDashboard();
  assert.equal(dash.totalDocuments, 1);
});

test('syncFolder: ogiltig delta-token → cursor nollställs + omstart utan cursor', async () => {
  const cmStore = await tmpStore();
  cmStore.setSyncState('kons@test.se', 'inbox', { deltaLink: 'https://graph/delta?token=OLD' });

  let call = 0;
  const connector = {
    graphBaseUrl: 'https://graph.test/v1.0',
    async fetchAccessToken() {
      return 't';
    },
    async fetchMailboxTruthFolderDeltaPage({ cursorUrl }) {
      call++;
      if (call === 1) {
        assert.equal(cursorUrl, 'https://graph/delta?token=OLD');
        const err = new Error('delta token invalid');
        err.code = 'GRAPH_DELTA_TOKEN_INVALID';
        throw err;
      }
      assert.equal(cursorUrl, null);
      return {
        page: { nextPageUrl: null, deltaLink: 'https://graph/delta?token=FRESH', complete: true },
        changes: [],
      };
    },
  };
  const sync = createCmMailSync({ graphReadConnector: connector, cmStore, secureStorage: null });
  const result = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(result.ok, true);
  assert.equal(call, 2);
  assert.equal(
    cmStore.getSyncState('kons@test.se', 'inbox').deltaLink,
    'https://graph/delta?token=FRESH'
  );
});

test('ORD-68: stripHtml bevarar rad- och tabellstruktur', () => {
  const html =
    '<table><tr><td>Totalt</td><td>1 250 kr</td></tr><tr><td>Moms</td><td>250 kr</td></tr></table><p>Tack för ditt köp!</p>';
  const text = stripHtml(html);
  assert.match(text, /Totalt \| 1 250 kr/);
  assert.match(text, /Moms \| 250 kr/);
  // radbrytning mellan raderna — beloppen blandas inte ihop
  assert.ok(text.indexOf('1 250 kr') < text.indexOf('Moms'));
  assert.ok(text.includes('\n'));
});

test('ORD-68: buildCombinedText kombinerar ämne + mailtext + PDF i samma underlag', () => {
  const combined = buildCombinedText({
    subject: 'Faktura 2026-100',
    bodyText: 'Hej! Se bifogad faktura på 1 250 kr.',
    pdfText: 'FAKTURA\nLeverantör: Telia AB\nTotalt: 1250,00 SEK',
  });
  assert.match(combined, /Ämne: Faktura 2026-100/);
  assert.match(combined, /Mailtext:\n/);
  assert.match(combined, /Bilaga \(PDF-text\):\n/);
  assert.match(combined, /Telia AB/);
  assert.ok(combined.length <= 8000);
});

test('ORD-68: reprocess hämtar bilagor i efterhand för rawItems utan record', async () => {
  const cmStore = await tmpStore();
  // Simulera mail som synkades FÖRE bilage-fixen: rawItem finns, ingen record,
  // ledger-entry utan expenseRecordId (som efter en misslyckad extraktion).
  const { rawItem } = cmStore.importRawItem({
    sourceType: 'email',
    sourceId: 'kvitto@test.se',
    mailMessageId: 'm-old-1',
    internetMessageId: '<old-1@test>',
    subject: 'Er faktura från Telia',
    rawBodyText: 'Se bifogad faktura. Totalt 1 250 kr.',
    hasAttachments: true,
  });
  const led = cmStore.addLedgerEntry({ rawItemId: rawItem.id });
  cmStore.completeLedgerEntry(led.id, { status: 'done', expenseRecordId: null });

  const connector = makeFixtureConnector({ messages: [] });
  const secureStorage = makeFakeSecureStorage();
  const fetchImpl = async (url, init) => {
    assert.equal(init?.headers?.Prefer, 'IdType="ImmutableId"');
    return {
      ok: true,
      async json() {
        return {
          value: [
            {
              id: 'a9',
              name: 'faktura.pdf',
              contentType: 'application/pdf',
              size: 999,
              isInline: false,
            },
          ],
        };
      },
    };
  };
  const sync = createCmMailSync({
    graphReadConnector: connector,
    cmStore,
    secureStorage,
    fetchImpl,
  });

  const result = await sync.reprocessUnprocessed({ limit: 5 });
  assert.equal(result.candidates, 1);
  assert.equal(result.reprocessed, 1);
  // Bilagan hämtades och arkiverades i efterhand
  assert.equal(connector.calls.attachmentContent.length, 1);
  assert.ok(secureStorage.objects.some((o) => o.key.startsWith('cm/receipts/')));
  assert.equal(cmStore.getDashboard().totalDocuments, 1);
  // Extraktionen körs utan OPENAI_API_KEY → fel loggas ärligt (inga tysta hopp)
  assert.ok(result.errors.some((e) => /OPENAI_API_KEY saknas/.test(e.error)));

  // Item med record är INTE reprocess-kandidat
  cmStore.createExpenseRecord({
    rawItemId: rawItem.id,
    expenseType: 'invoice',
    confidenceScore: 90,
  });
  const again = await sync.reprocessUnprocessed({ limit: 5 });
  assert.equal(again.candidates, 0);
});

test('syncFolder utan delta-API → ärligt fel (ingen tyst no-op)', async () => {
  const cmStore = await tmpStore();
  const sync = createCmMailSync({ graphReadConnector: {}, cmStore });
  const result = await sync.syncFolder('kons@test.se', 'inbox');
  assert.equal(result.ok, false);
  assert.match(result.error, /delta-API/);
});

// ─── ORD-72 · Om-extraktion av saknade belopp ur sparat källmail ───

function fakeExtractorReturning(extraction) {
  const calls = [];
  const impl = async (input) => {
    calls.push(input);
    return { ok: true, extraction };
  };
  impl.calls = calls;
  return impl;
}

test('reextractMissingAmounts: fyller tomma fält ur källmailet, rör aldrig befintliga', async () => {
  const cmStore = await tmpStore();
  // ORD-72c-scenariot från prod: delta gav bara preview (~200 tecken) UTAN
  // belopp — fulla mailkroppen (med beloppet) hämtas via Graph i efterhand.
  const { rawItem } = cmStore.importRawItem({
    sourceType: 'email',
    sourceId: 'kvitto@test.se',
    mailMessageId: 'mm-1',
    internetMessageId: '<mm-1@test>',
    subject: 'Kvitto Foodora',
    fromEmail: 'no-reply@foodora.se',
    rawBodyText: 'Tack för din beställning! Ditt kvitto finns i detta mail.',
    hasAttachments: false,
  });
  const record = cmStore.createExpenseRecord({
    rawItemId: rawItem.id,
    expenseType: 'receipt',
    supplierName: 'Foodora AB', // befintligt värde — får INTE skrivas över
    confidenceScore: 70,
  });
  assert.ok(record.flags.includes('MISSING_TOTAL_AMOUNT'));

  const extractor = fakeExtractorReturning({
    documentType: 'receipt',
    supplier: 'FEL-LEVERANTÖR AB', // ska ignoreras (fältet är redan satt)
    amountIncVat: 402,
    vatAmount: 43.07,
    date: '2026-07-02',
    confidenceScore: 90,
  });
  // Graph message-GET (full body) — ORD-72c: preview <500 tecken triggar hämtning
  const fullBodyFetch = async (url, init) => {
    assert.match(url, /messages\/mm-1\?\$select=subject,body/);
    assert.equal(init?.headers?.Prefer, 'IdType="ImmutableId"');
    return {
      ok: true,
      async json() {
        return {
          body: {
            content:
              '<html><body><table><tr><td>Summa</td><td>Totalt: 402,00 kr varav moms 43,07 kr</td></tr></table></body></html>',
          },
        };
      },
    };
  };
  const sync = createCmMailSync({
    graphReadConnector: makeFixtureConnector({ messages: [] }),
    cmStore,
    fetchImpl: fullBodyFetch,
    extractDocumentImpl: extractor,
  });

  const result = await sync.reextractMissingAmounts({ limit: 10 });
  assert.equal(result.candidates, 1);
  assert.equal(result.updatedRecords, 1);
  assert.equal(result.errors.length, 0);

  const updated = cmStore.getExpenseRecordById(record.id);
  assert.equal(updated.amountIncVat, 402);
  assert.equal(updated.vatAmount, 43.07);
  assert.equal(updated.date, '2026-07-02');
  assert.equal(updated.supplierName, 'Foodora AB'); // orörd
  assert.ok(!updated.flags.includes('MISSING_TOTAL_AMOUNT'));
  assert.ok(!updated.flags.includes('MISSING_VAT'));

  // Extraktorn fick den HÄMTADE fulla mailtexten (inte preview-stumpen)
  assert.equal(extractor.calls.length, 1);
  assert.match(extractor.calls[0].text, /402,00 kr/);
  // rawItem uppgraderades så framtida körningar slipper Graph-anropet
  assert.match(cmStore.getRawItemById(rawItem.id).rawBodyText, /402,00 kr/);

  // Andra körningen: inget kvar att göra
  const again = await sync.reextractMissingAmounts({ limit: 10 });
  assert.equal(again.candidates, 0);
});

test('reextractMissingAmounts: backfillar promotad CFO-utgift endast när belopp saknas', async () => {
  const cmStore = await tmpStore();
  const { rawItem } = cmStore.importRawItem({
    sourceType: 'email',
    sourceId: 'kvitto@test.se',
    mailMessageId: 'mm-2',
    internetMessageId: '<mm-2@test>',
    subject: 'Kvitto',
    fromEmail: 'x@y.se',
    // ≥500 tecken → fulla body:n finns redan, ingen Graph-hämtning behövs
    rawBodyText:
      'Summa att betala: 1 000 kr inkl. moms 200 kr — tack för köpet. ' +
      'Orderdetaljer och leveransvillkor: '.repeat(15),
    hasAttachments: false,
  });
  const record = cmStore.createExpenseRecord({
    rawItemId: rawItem.id,
    expenseType: 'receipt',
    supplierName: 'Test AB',
    confidenceScore: 80,
  });
  // Simulera promote (ORD-63): CFO äger utgiften, beloppet är tomt
  record.cfoExpenseId = 'cfo-1';
  record.bookkeepingStatus = 'handed_off';

  const cfoCalls = [];
  const cfoExpenseStore = {
    async getById(id) {
      return { id, amountSek: null, vatSek: null };
    },
    async updateExpense(args) {
      cfoCalls.push(args);
      return { id: args.id };
    },
  };
  const sync = createCmMailSync({
    graphReadConnector: makeFixtureConnector({ messages: [] }),
    cmStore,
    cfoExpenseStore,
    extractDocumentImpl: fakeExtractorReturning({
      documentType: 'receipt',
      amountIncVat: 1000,
      vatAmount: 200,
      confidenceScore: 85,
    }),
  });

  const result = await sync.reextractMissingAmounts({ limit: 5 });
  assert.equal(result.updatedRecords, 1);
  assert.equal(result.updatedCfo, 1);
  assert.equal(cfoCalls.length, 1);
  assert.equal(cfoCalls[0].id, 'cfo-1');
  assert.equal(cfoCalls[0].patch.amountSek, 1000);
  assert.equal(cfoCalls[0].patch.vatSek, 200);
  assert.equal(cfoCalls[0].actor, 'cm-reextract');
});

test('reextractMissingAmounts: utan källmail → skippedNoSource, extraktorfel → ärligt fel', async () => {
  const cmStore = await tmpStore();
  // Record utan rawItemId och utan dokument — inget att läsa ur
  cmStore.createExpenseRecord({ expenseType: 'receipt', confidenceScore: 50 });
  // Record med källmail men extraktorn felar
  const { rawItem } = cmStore.importRawItem({
    sourceType: 'email',
    sourceId: 'kvitto@test.se',
    mailMessageId: 'mm-3',
    internetMessageId: '<mm-3@test>',
    subject: 'Faktura utan nyckel',
    fromEmail: 'x@y.se',
    rawBodyText: 'Fakturabelopp: 500 kr — betalas inom 30 dagar från fakturadatum',
    hasAttachments: false,
  });
  cmStore.createExpenseRecord({
    rawItemId: rawItem.id,
    expenseType: 'invoice',
    confidenceScore: 60,
  });

  const sync = createCmMailSync({
    graphReadConnector: makeFixtureConnector({ messages: [] }),
    cmStore,
    // full-body-hämtningen felar → fail-open till preview, ärligt fel loggas
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      async json() {
        return {};
      },
    }),
    extractDocumentImpl: async () => ({ ok: false, error: 'OPENAI_API_KEY saknas' }),
  });
  const result = await sync.reextractMissingAmounts({ limit: 10 });
  assert.equal(result.candidates, 2);
  assert.equal(result.skippedNoSource, 1);
  assert.equal(result.updatedRecords, 0);
  assert.ok(result.errors.some((e) => /OPENAI_API_KEY saknas/.test(e.error)));
});

test('reextractMissingAmounts: redan-försökta hoppas över, force kör om', async () => {
  const cmStore = await tmpStore();
  const { rawItem } = cmStore.importRawItem({
    sourceType: 'email',
    sourceId: 'kvitto@test.se',
    mailMessageId: 'mm-4',
    internetMessageId: '<mm-4@test>',
    subject: 'Kvitto utan belopp i texten',
    fromEmail: 'x@y.se',
    // ≥500 tecken → ingen Graph-hämtning; extraktorn hittar ändå inget belopp
    rawBodyText:
      'Tack för ditt köp hos oss! Kvittot bifogas separat i nästa mail. ' +
      'Information om din beställning och våra villkor: '.repeat(12),
    hasAttachments: false,
  });
  cmStore.createExpenseRecord({
    rawItemId: rawItem.id,
    expenseType: 'receipt',
    supplierName: 'Test AB',
    confidenceScore: 60,
  });

  // Extraktorn hittar inget belopp
  const extractor = fakeExtractorReturning({ documentType: 'receipt', confidenceScore: 55 });
  const sync = createCmMailSync({
    graphReadConnector: makeFixtureConnector({ messages: [] }),
    cmStore,
    extractDocumentImpl: extractor,
  });

  const first = await sync.reextractMissingAmounts({ limit: 5 });
  assert.equal(first.attempted, 1);
  assert.equal(first.updatedRecords, 0);

  // Andra körningen: posten är markerad som försökt → ingen ny AI-spend
  const second = await sync.reextractMissingAmounts({ limit: 5 });
  assert.equal(second.attempted, 0);
  assert.equal(second.skippedAlreadyTried, 1);
  assert.equal(extractor.calls.length, 1);

  // force=true (UI-knappen) kör om ändå
  const forced = await sync.reextractMissingAmounts({ limit: 5, force: true });
  assert.equal(forced.attempted, 1);
  assert.equal(extractor.calls.length, 2);
});

test('reextractMissingAmounts: mailMessageId-backfill via internetMessageId (ORD-72d)', async () => {
  const cmStore = await tmpStore();
  // Äldre rawItem: importerad utan mailMessageId (graphMessageId-aliasbuggen)
  const { rawItem } = cmStore.importRawItem({
    sourceType: 'email',
    sourceId: 'kvitto@test.se',
    mailMessageId: '',
    internetMessageId: 'meta-receipt-1@fb.com', // lagras UTAN <> (connector-format)
    subject: 'Ditt annonser-kvitto för Meta',
    fromEmail: 'billing@meta.com',
    rawBodyText: 'Maskad preview utan belopp.',
    hasAttachments: false,
  });
  cmStore.createExpenseRecord({
    rawItemId: rawItem.id,
    expenseType: 'receipt',
    supplierName: 'Meta for Business',
    confidenceScore: 50,
  });

  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url);
    assert.equal(init?.headers?.Prefer, 'IdType="ImmutableId"');
    if (/\/messages\?\$filter=/.test(url)) {
      return {
        ok: true,
        async json() {
          return { value: [{ id: 'immutable-id-777' }] };
        },
      };
    }
    assert.match(url, /messages\/immutable-id-777\?\$select=subject,body/);
    return {
      ok: true,
      async json() {
        return { body: { content: '<p>Betalt belopp: 7 096,00 kr (moms 0,00 kr)</p>' } };
      },
    };
  };
  const sync = createCmMailSync({
    graphReadConnector: makeFixtureConnector({ messages: [] }),
    cmStore,
    fetchImpl,
    extractDocumentImpl: fakeExtractorReturning({
      documentType: 'receipt',
      amountIncVat: 7096,
      confidenceScore: 88,
    }),
  });

  const result = await sync.reextractMissingAmounts({ limit: 5 });
  assert.equal(result.updatedRecords, 1);
  assert.equal(result.errors.length, 0);
  // id-lookup skedde och sparades på rawItem
  assert.ok(urls.some((u) => /\$filter=internetMessageId/.test(u)));
  assert.equal(cmStore.getRawItemById(rawItem.id).mailMessageId, 'immutable-id-777');
});

// ─── ORD-CM-5 · Undermappar + "Klara fortnox"-märkning ───

test('CM-5: custom-mappar synkas och Klara fortnox-mail märks som redan bokförda', async () => {
  const cmStore = await tmpStore();
  const secureStorage = makeFakeSecureStorage();
  const connector = makeFixtureConnector({ messages: [] });
  const fetchImpl = async (url, init) => {
    assert.equal(init?.headers?.Prefer, 'IdType="ImmutableId"');
    if (/\/mailFolders\?/.test(url)) {
      return {
        ok: true,
        async json() {
          return {
            value: [
              { id: 'f-amex', displayName: 'AMEX', totalItemCount: 1 },
              { id: 'f-klara', displayName: 'Klara fortnox', totalItemCount: 1 },
              { id: 'f-sent', displayName: 'Skickat', totalItemCount: 99 }, // exkluderas
            ],
          };
        },
      };
    }
    if (/f-amex\/messages\/delta/.test(url)) {
      return {
        ok: true,
        async json() {
          return {
            value: [
              {
                id: 'amex-1',
                internetMessageId: '<amex-1@a>',
                subject: 'Kortkvitto Amex',
                from: { emailAddress: { address: 'noreply@amex.se' } },
                receivedDateTime: '2026-07-01T10:00:00Z',
                hasAttachments: false,
                body: { content: 'Köp: 900 kr på Restaurang X, betalt med Amex-kortet.' },
              },
            ],
            '@odata.deltaLink': 'https://graph/delta-amex',
          };
        },
      };
    }
    if (/f-klara\/messages\/delta/.test(url)) {
      return {
        ok: true,
        async json() {
          return {
            value: [
              {
                id: 'klar-1',
                internetMessageId: '<klar-1@k>',
                subject: 'Faktura Telia — bokförd',
                from: { emailAddress: { address: 'ekonomi@telia.se' } },
                receivedDateTime: '2026-06-01T10:00:00Z',
                hasAttachments: false,
                body: { content: 'Faktura: 450 kr inkl. moms. Betald och bokförd i Fortnox.' },
              },
            ],
            '@odata.deltaLink': 'https://graph/delta-klara',
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { value: [] };
      },
    };
  };
  const sync = createCmMailSync({
    graphReadConnector: connector,
    cmStore,
    secureStorage,
    fetchImpl,
    extractDocumentImpl: async (inp) => ({
      ok: true,
      extraction: {
        documentType: /Telia/.test(inp.text) ? 'invoice' : 'receipt',
        supplier: /Telia/.test(inp.text) ? 'Telia' : 'Restaurang X',
        amountIncVat: /Telia/.test(inp.text) ? 450 : 900,
        confidenceScore: 90,
      },
    }),
  });

  const result = await sync.syncAll('faktura@test.se');
  const folderNames = result.folders.map((f) => f.folderType);
  assert.ok(folderNames.includes('AMEX'));
  assert.ok(folderNames.includes('Klara fortnox'));
  assert.ok(!folderNames.includes('Skickat')); // exkluderad

  // AMEX-kvittot är öppen kandidat
  const amex = cmStore
    .getInbox()
    .concat(cmStore.getNeedsReview())
    .find((r) => r.supplierName === 'Restaurang X');
  assert.ok(amex);

  // Klara fortnox-fakturan är märkt REDAN BOKFÖRD (exported) — inte kandidat
  const telia = cmStore.getExported().find((r) => r.supplierName === 'Telia');
  assert.ok(telia);
  assert.equal(telia.externalAccountingId, 'pre-fortnox-manuell');

  // Delta-cursor per mapp persisterad
  assert.equal(
    cmStore.getSyncState('faktura@test.se', 'custom:f-amex').deltaLink,
    'https://graph/delta-amex'
  );
});
