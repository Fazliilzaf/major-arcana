'use strict';

/* Auto-nudge vid ny inbound (följdsteg). Två nivåer:
 *  1) Hook-adaptern: resolverar stores lazy och kallar preparePortalNudge.
 *  2) Pipeline-integrationen: processRawMessage kallar portalNudge.onInboundMatched
 *     för ett MATCHAT inbound-mail — men INTE i dry_run och INTE för omatchat.
 * Servicen skapar bara needs_approval-utkast; ingestionen får aldrig störas. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { createPortalNudgeIngestionHook } = require('../../src/ops/ccoPortalNudgeIngestionHook');
const { processRawMessage } = require('../../src/ops/ccoMailIngestion/pipeline');
const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');
const { createCcoPortalNudgeStore } = require('../../src/ops/ccoPortalNudgeStore');
const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

function tmp(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-hook-'));
  return path.join(dir, n);
}

// ── 1) Hook-adaptern ────────────────────────────────────────────────────────

test('hook förbereder nudge via lazy-resolverade stores', async () => {
  const stores = {
    accessStore: await createCcoPortalAccessStore({ filePath: tmp('a.json') }),
    nudgeStore: await createCcoPortalNudgeStore({ filePath: tmp('n.json') }),
    draftStore: await createCcoCommDraftStore({ filePath: tmp('d.json') }),
  };
  const hook = createPortalNudgeIngestionHook({
    getStores: () => stores,
    baseUrl: 'https://p.ex',
  });
  const res = await hook.onInboundMatched({
    tenantId: 'hairtpclinic',
    customerId: 'PAT-1',
    customerEmail: 'pat@ex.se',
  });
  assert.equal(res.status, 'prepared');
  assert.match(res.url, /^https:\/\/p\.ex\/portal-chat\//);
  // Andra gången (samma kund) → idempotent skip.
  const again = await hook.onInboundMatched({ tenantId: 'hairtpclinic', customerId: 'PAT-1' });
  assert.equal(again.status, 'skipped');
});

test('hook utan stores → skipped stores_unavailable (stör aldrig ingestion)', async () => {
  const hook = createPortalNudgeIngestionHook({ getStores: () => ({}) });
  const res = await hook.onInboundMatched({ customerId: 'PAT-2' });
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'stores_unavailable');
});

test('saknad getStores → returnerar null (funktionen av)', () => {
  assert.equal(createPortalNudgeIngestionHook({}), null);
});

// ── 2) Pipeline-integrationen ───────────────────────────────────────────────

async function seedInbound(store, { id, fromEmail }) {
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id });
  return store.saveRawMessageFromTruth({
    truthMessage: {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'inbox',
      graphMessageId: id,
      internetMessageId: `<${id}@example.com>`,
      subject: 'Kan jag boka tid?',
      bodyPreview: 'Hej, jag vill boka.',
      from: { address: fromEmail },
      receivedAt: '2026-05-26T11:00:00.000Z',
    },
    mailAccountId: account.id,
    importRunId: run.id,
  });
}

const DIRECTORY = [
  { id: 'patient-1', primaryEmail: 'patient@example.com', emails: ['patient@example.com'] },
];

test('pipeline kallar portalNudge för MATCHAT inbound (read_only)', async () => {
  const file = tmp('ing.json');
  const store = await createCcoMailIngestionStore({ filePath: file });
  const saved = await seedInbound(store, { id: 'g-match', fromEmail: 'patient@example.com' });
  const calls = [];
  const portalNudge = { onInboundMatched: async (a) => calls.push(a) };

  const res = await processRawMessage({
    store,
    rawMessage: saved.rawMessage,
    ledger: saved.ledger,
    mode: 'read_only',
    patientDirectory: DIRECTORY,
    portalNudge,
  });
  assert.equal(res.patientMatch.status, 'MATCHED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].customerId, 'patient-1');
  assert.equal(calls[0].customerEmail, 'patient@example.com');
  await fsp.unlink(file).catch(() => {});
});

test('pipeline kallar INTE portalNudge i dry_run', async () => {
  const file = tmp('ing2.json');
  const store = await createCcoMailIngestionStore({ filePath: file });
  const saved = await seedInbound(store, { id: 'g-dry', fromEmail: 'patient@example.com' });
  const calls = [];
  await processRawMessage({
    store,
    rawMessage: saved.rawMessage,
    ledger: saved.ledger,
    mode: 'dry_run',
    patientDirectory: DIRECTORY,
    portalNudge: { onInboundMatched: async (a) => calls.push(a) },
  });
  assert.equal(calls.length, 0);
  await fsp.unlink(file).catch(() => {});
});

test('pipeline kallar INTE portalNudge för OMATCHAT inbound', async () => {
  const file = tmp('ing3.json');
  const store = await createCcoMailIngestionStore({ filePath: file });
  const saved = await seedInbound(store, { id: 'g-unmatch', fromEmail: 'okand@example.com' });
  const calls = [];
  const res = await processRawMessage({
    store,
    rawMessage: saved.rawMessage,
    ledger: saved.ledger,
    mode: 'read_only',
    patientDirectory: DIRECTORY,
    portalNudge: { onInboundMatched: async (a) => calls.push(a) },
  });
  assert.notEqual(res.patientMatch.status, 'MATCHED');
  assert.equal(calls.length, 0);
  await fsp.unlink(file).catch(() => {});
});

test('portalNudge-fel stör ALDRIG ingestionen (sväljs)', async () => {
  const file = tmp('ing4.json');
  const store = await createCcoMailIngestionStore({ filePath: file });
  const saved = await seedInbound(store, { id: 'g-throw', fromEmail: 'patient@example.com' });
  const res = await processRawMessage({
    store,
    rawMessage: saved.rawMessage,
    ledger: saved.ledger,
    mode: 'read_only',
    patientDirectory: DIRECTORY,
    logger: { warn: () => {}, log: () => {} },
    portalNudge: {
      onInboundMatched: async () => {
        throw new Error('nudge nere');
      },
    },
  });
  // Ingestionen slutförs ändå.
  assert.equal(res.skipped, false);
  assert.equal(res.patientMatch.status, 'MATCHED');
  await fsp.unlink(file).catch(() => {});
});
