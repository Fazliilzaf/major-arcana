'use strict';

// ORD-73 · IMAP-intag (info@fazli.se, one.com) — fixture-klient, inga nätanrop.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCmStore } = require('../../src/cm/cmStore');
const { createCmImapSync } = require('../../src/cm/cmImapSync');

delete process.env.OPENAI_API_KEY;

async function tmpStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-imap-test-'));
  return createCmStore({ filePath: path.join(dir, 'cm.json') });
}

function fakeSecureStorage() {
  const objects = [];
  return {
    objects,
    async putObject({ key, contentType }) {
      objects.push({ key, contentType });
      return { storageKey: key };
    },
  };
}

// Fixture: uid → parsed-form (parseMessageImpl slår upp uid ur source-markören)
function makeFixtures(messagesByUid) {
  const imapClientFactory = async () => ({
    async search(query) {
      const uids = Object.keys(messagesByUid).map(Number);
      if (query.uid) {
        const from = Number(String(query.uid).split(':')[0]);
        return uids.filter((u) => u >= from);
      }
      return uids; // since-läge: allt
    },
    async fetchOne(uid) {
      return { source: Buffer.from(`uid:${uid}`) };
    },
    async logout() {},
  });
  const parseMessageImpl = async (buf) => {
    const uid = Number(String(buf).split(':')[1]);
    return messagesByUid[uid];
  };
  return { imapClientFactory, parseMessageImpl };
}

const ENV = {
  CM_IMAP_ENABLED: 'true',
  CM_IMAP_USER: 'info@fazli.se',
  CM_IMAP_PASSWORD: 'x',
  CM_IMAP_SINCE: '2026-01-01',
};

test('imap: fail-closed utan env-creds', async () => {
  const cmStore = await tmpStore();
  const sync = createCmImapSync({ cmStore, env: {} });
  const r = await sync.syncInbox();
  assert.equal(r.ok, false);
  assert.match(r.error, /CM_IMAP_ENABLED/);

  const sync2 = createCmImapSync({ cmStore, env: { CM_IMAP_ENABLED: 'true' } });
  const r2 = await sync2.syncInbox();
  assert.equal(r2.ok, false);
  assert.match(r2.error, /CM_IMAP_USER/);
});

test('imap: importerar ALLA mail (ORD-74), extraherar belopp, olöst för icke-köp, cursor sätts', async () => {
  const cmStore = await tmpStore();
  const storage = fakeSecureStorage();
  const { imapClientFactory, parseMessageImpl } = makeFixtures({
    11: {
      subject: 'Orderbekräftelse #4711',
      from: 'shop@leverantor.se',
      date: '2026-07-01T10:00:00Z',
      messageId: '<order-4711@shop>',
      text: 'Tack för ditt köp! Totalt: 8 463,00 kr inkl. moms 1 692,60 kr',
      html: '',
      attachments: [],
    },
    12: {
      subject: 'Nyhetsbrev vecka 27',
      from: 'nyheter@blogg.se',
      date: '2026-07-02T10:00:00Z',
      messageId: '<nb27@blogg>',
      text: 'Kul saker har hänt i veckan!',
      html: '',
      attachments: [],
    },
  });
  const sync = createCmImapSync({
    cmStore,
    secureStorage: storage,
    imapClientFactory,
    parseMessageImpl,
    env: ENV,
    extractDocumentImpl: async (inp) => {
      // ORD-74: extraktorn ser BÅDA mailen — kvittot ger data, nyhetsbrevet unknown
      if (/8 463,00 kr/.test(inp.text)) {
        return {
          ok: true,
          extraction: {
            documentType: 'receipt',
            supplier: 'Leverantör AB',
            amountIncVat: 8463,
            vatAmount: 1692.6,
            date: '2026-07-01',
            confidenceScore: 92,
          },
        };
      }
      return { ok: true, extraction: { documentType: 'unknown', confidenceScore: 5 } };
    },
  });

  const r = await sync.syncInbox();
  assert.equal(r.ok, true);
  assert.equal(r.imported, 2); // ORD-74: nyhetsbrevet importeras också
  assert.equal(r.nonEconomy, 1);
  assert.equal(r.records, 1);
  assert.equal(r.unresolved, 1); // nyhetsbrevet → olöst record i granska-kön
  assert.equal(r.errors.length, 0);

  const rec = cmStore
    .getInbox()
    .concat(cmStore.getNeedsReview())
    .find((x) => x.amountIncVat === 8463);
  assert.equal(rec.supplierName, 'Leverantör AB');
  const olost = cmStore.getNeedsReview().find((x) => x.expenseType === 'unknown');
  assert.equal(olost.supplierName, 'nyheter@blogg.se');

  // Original arkiverat (BFN) + cursor persisterad
  assert.ok(storage.objects.some((o) => o.key.startsWith('cm/raw-mail/')));
  assert.equal(cmStore.getSyncState('info@fazli.se', 'imap-inbox').lastUid, 12);

  // Andra körningen: inget nytt (cursor-läge)
  const r2 = await sync.syncInbox();
  assert.equal(r2.imported, 0);
  assert.equal(r2.duplicates, 0);
});

test('imap: PDF-bilaga sparas + dokument skapas, dedupe på messageId', async () => {
  const cmStore = await tmpStore();
  const storage = fakeSecureStorage();
  const msg = {
    subject: 'Er faktura',
    from: 'faktura@leverantor.se',
    date: '2026-07-03T10:00:00Z',
    messageId: '<fak-1@lev>',
    text: 'Se bifogad faktura.',
    html: '',
    attachments: [
      {
        filename: 'faktura.pdf',
        contentType: 'application/pdf',
        size: 13,
        content: Buffer.from('%PDF-1.4 fake'),
      },
    ],
  };
  const { imapClientFactory, parseMessageImpl } = makeFixtures({ 21: msg });
  const sync = createCmImapSync({
    cmStore,
    secureStorage: storage,
    imapClientFactory,
    parseMessageImpl,
    env: ENV,
    extractDocumentImpl: async () => ({ ok: false, error: 'OPENAI_API_KEY saknas' }),
  });
  const r = await sync.syncInbox();
  assert.equal(r.imported, 1);
  assert.ok(storage.objects.some((o) => o.key.startsWith('cm/receipts/')));
  assert.equal(cmStore.getDashboard().totalDocuments, 1);
  assert.ok(r.errors.some((e) => /OPENAI_API_KEY saknas/.test(e.error)));

  // Samma messageId via annan uid → dedupe
  const { imapClientFactory: f2, parseMessageImpl: p2 } = makeFixtures({ 22: msg });
  const sync2 = createCmImapSync({
    cmStore,
    secureStorage: storage,
    imapClientFactory: f2,
    parseMessageImpl: p2,
    env: ENV,
    extractDocumentImpl: async () => ({ ok: false, error: 'x' }),
  });
  const r2 = await sync2.syncInbox();
  assert.equal(r2.duplicates, 1);
});

test('imap: backlog utöver batchtaket rapporteras och cursorn stannar rätt', async () => {
  const cmStore = await tmpStore();
  const many = {};
  for (let uid = 100; uid < 130; uid++) {
    many[uid] = {
      subject: `Kvitto ${uid}`,
      from: 'shop@x.se',
      date: '2026-07-01T10:00:00Z',
      messageId: `<kv-${uid}@x>`,
      text: `Kvitto på köp nummer ${uid}. Totalt 100 kr jämnt att betala.`,
      html: '',
      attachments: [],
    };
  }
  const { imapClientFactory, parseMessageImpl } = makeFixtures(many);
  const sync = createCmImapSync({
    cmStore,
    imapClientFactory,
    parseMessageImpl,
    env: ENV,
    extractDocumentImpl: async () => ({ ok: false, error: 'budget-test' }),
  });
  const r = await sync.syncInbox();
  assert.equal(r.scanned, 25); // MAX_MESSAGES_PER_RUN
  assert.equal(r.remainingBacklog, 5);
  assert.equal(cmStore.getSyncState('info@fazli.se', 'imap-inbox').lastUid, 124);
});

// ─── ORD-74 · Full historik från 2024 + varje mail räknas ───

test('ORD-74: since flyttad bakåt nollar cursorn för om-skanning', async () => {
  const cmStore = await tmpStore();
  cmStore.setSyncState('info@fazli.se', 'imap-inbox', {
    lastUid: 500,
    backfillSince: '2026-01-01',
  });
  const { imapClientFactory, parseMessageImpl } = makeFixtures({
    3: {
      subject: 'Orderbekräftelse gammalt köp',
      from: 'shop@x.se',
      date: '2024-03-01T10:00:00Z',
      messageId: '<gammal-3@x>',
      text: 'Tack för din order! Totalt 100 kr betalas med kort.',
      html: '',
      attachments: [],
    },
    501: {
      subject: 'Kvitto nytt köp',
      from: 'shop@x.se',
      date: '2026-07-01T10:00:00Z',
      messageId: '<ny-501@x>',
      text: 'Kvitto: totalt 200 kr inkl. moms.',
      html: '',
      attachments: [],
    },
  });
  const sync = createCmImapSync({
    cmStore,
    imapClientFactory,
    parseMessageImpl,
    env: { ...ENV, CM_IMAP_SINCE: '2024-01-01' },
    extractDocumentImpl: async () => ({
      ok: true,
      extraction: {
        documentType: 'receipt',
        supplier: 'X',
        amountIncVat: 100,
        confidenceScore: 80,
      },
    }),
  });
  const r = await sync.syncInbox();
  // Cursor nollad → 2024-mailet (uid 3 < gamla cursorn 500) skannades OCKSÅ
  assert.equal(r.scanned, 2);
  assert.equal(r.imported, 2);
  assert.equal(cmStore.getSyncState('info@fazli.se', 'imap-inbox').backfillSince, '2024-01-01');

  // Andra körningen: samma since → ingen ny om-skanning (cursor-läge)
  const r2 = await sync.syncInbox();
  assert.equal(r2.imported, 0);
});

test('ORD-74: tekniskt AI-fel skapar INTE olöst record (retry via reprocess)', async () => {
  const cmStore = await tmpStore();
  const { imapClientFactory, parseMessageImpl } = makeFixtures({
    8: {
      subject: 'Kvitto på köp',
      from: 'shop@y.se',
      date: '2026-07-02T10:00:00Z',
      messageId: '<k-8@y>',
      text: 'Ditt kvitto: totalt 250 kr inklusive moms och frakt.',
      html: '',
      attachments: [],
    },
  });
  const sync = createCmImapSync({
    cmStore,
    imapClientFactory,
    parseMessageImpl,
    env: ENV,
    extractDocumentImpl: async () => ({ ok: false, error: 'OPENAI 429 rate limit' }),
  });
  const r = await sync.syncInbox();
  assert.equal(r.imported, 1);
  assert.equal(r.unresolved || 0, 0); // inget olöst-record vid tekniskt fel
  assert.ok(r.errors.some((e) => /429/.test(e.error)));
  // rawItem utan record → reprocess-kandidat (retry när AI:n mår bra igen)
  assert.equal(cmStore.listUnprocessedRawItems({ limit: 5 }).length, 1);
});
