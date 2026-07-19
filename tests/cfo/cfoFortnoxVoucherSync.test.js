'use strict';

// CF.9 · voucher-sync scaffold: fail-closed gates + balanserad payload. Inget nät.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCfoFortnoxVoucherSync,
  buildVoucherPayload,
  DEFAULT_ACCOUNT_MAP,
} = require('../../src/cfo/cfoFortnoxVoucherSync');

const SAMPLE_EXPENSE = {
  id: 'exp_test1',
  status: 'exported',
  fortnoxExportPending: true,
  fortnoxSyncStatus: 'pending',
  supplier: 'Telia AB',
  amountSek: 1000,
  vatSek: 200,
  date: '2026-07-01',
  category: 'it_telefoni',
};

function fakeExpenseStore(expenses = [SAMPLE_EXPENSE]) {
  return { listExpenses: () => expenses };
}

test('buildVoucherPayload: balanserad kontering (netto + moms = brutto)', () => {
  const { Voucher, meta } = buildVoucherPayload(SAMPLE_EXPENSE);
  assert.equal(meta.balanced, true);
  assert.equal(meta.accountSource, 'default_suggestion');
  assert.equal(Voucher.VoucherRows.length, 3);
  const debit = Voucher.VoucherRows.reduce((s, r) => s + r.Debit, 0);
  const credit = Voucher.VoucherRows.reduce((s, r) => s + r.Credit, 0);
  assert.equal(debit, credit);
  assert.equal(Voucher.VoucherRows[0].Account, DEFAULT_ACCOUNT_MAP.it_telefoni);
});

test('gate 1: disabled env → fail-closed med pendingCount + dry-run-payloads', async () => {
  const sync = createCfoFortnoxVoucherSync({ expenseStore: fakeExpenseStore(), env: {} });
  const result = await sync.run({ dryRun: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'disabled');
  assert.equal(result.pendingCount, 1);
  assert.equal(result.dryRunPayloads.length, 1);
});

test('gate 2: enabled men Fortnox ej ansluten → fortnox_not_connected', async () => {
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: fakeExpenseStore(),
    fortnoxStore: { getConnection: async () => ({ connected: false }) },
    env: { ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED: 'true' },
  });
  const result = await sync.run({ dryRun: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'fortnox_not_connected');
});

test('gate 3: ansluten men klienten saknar createVoucher → ärligt scaffold-svar', async () => {
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: fakeExpenseStore(),
    fortnoxStore: { getConnection: async () => ({ connected: true, accessToken: 'x' }) },
    fortnoxClient: {},
    env: { ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED: 'true' },
  });
  const result = await sync.run({ dryRun: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'fortnox_client_missing_createVoucher');
});

test('dryRun med alla gates gröna → payloads utan write', async () => {
  let writes = 0;
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: fakeExpenseStore(),
    fortnoxStore: { getConnection: async () => ({ connected: true, accessToken: 'x' }) },
    fortnoxClient: {
      createVoucher: async () => {
        writes++;
        return {};
      },
    },
    env: { ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED: 'true' },
  });
  const result = await sync.run({ dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.payloads.length, 1);
  assert.equal(writes, 0);
});

test('skarp körning (ORD-67): syncing FÖRE write + markFortnoxSynced kvitterar', async () => {
  const synced = [];
  const events = [];
  const store = {
    listExpenses: () => [SAMPLE_EXPENSE],
    markFortnoxSyncing: async ({ id }) => {
      events.push(`syncing:${id}`);
    },
    markFortnoxSynced: async ({ id, fortnoxVoucherId }) => {
      events.push(`synced:${id}`);
      synced.push({ id, fortnoxVoucherId });
    },
    markFortnoxError: async () => {
      events.push('error');
    },
  };
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: store,
    fortnoxStore: { getConnection: async () => ({ connected: true, accessToken: 'x' }) },
    fortnoxClient: {
      createVoucher: async (voucher) => {
        assert.equal(voucher.VoucherRows.length, 3);
        return { Voucher: { VoucherNumber: 'A-42' } };
      },
    },
    env: { ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED: 'true' },
  });
  const result = await sync.run({ dryRun: false });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, false);
  assert.equal(result.results[0].ok, true);
  assert.equal(result.results[0].voucherId, 'A-42');
  assert.deepEqual(synced, [{ id: 'exp_test1', fortnoxVoucherId: 'A-42' }]);
  // Bugbot HIGH: syncing måste persisteras FÖRE write
  assert.deepEqual(events, ['syncing:exp_test1', 'synced:exp_test1']);
});

test('skarp körning: svar utan VoucherNumber → error, INTE synced (Bugbot)', async () => {
  const marks = [];
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: {
      listExpenses: () => [SAMPLE_EXPENSE],
      markFortnoxSyncing: async () => marks.push('syncing'),
      markFortnoxSynced: async () => marks.push('synced'),
      markFortnoxError: async ({ error }) => marks.push(`error:${error}`),
    },
    fortnoxStore: { getConnection: async () => ({ connected: true, accessToken: 'x' }) },
    fortnoxClient: { createVoucher: async () => ({ Voucher: {} }) },
    env: { ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED: 'true' },
  });
  const result = await sync.run({ dryRun: false });
  assert.equal(result.results[0].ok, false);
  assert.equal(result.results[0].error, 'voucher_id_missing_in_response');
  assert.deepEqual(marks, ['syncing', 'error:voucher_id_missing_in_response']);
});

test('syncing-status exkluderas ur pending-kön (dubbelskydd över processer)', async () => {
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: {
      listExpenses: () => [{ ...SAMPLE_EXPENSE, fortnoxSyncStatus: 'syncing' }],
    },
    env: {},
  });
  const pending = await sync.listPendingExpenses();
  assert.equal(pending.length, 0);
});

test('skarp körning: klientfel kvitterar INTE + rapporteras per expense', async () => {
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: { listExpenses: () => [SAMPLE_EXPENSE] },
    fortnoxStore: { getConnection: async () => ({ connected: true, accessToken: 'x' }) },
    fortnoxClient: {
      createVoucher: async () => {
        throw new Error('Fortnox API 403');
      },
    },
    env: { ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED: 'true' },
  });
  const result = await sync.run({ dryRun: false });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].ok, false);
  assert.match(result.results[0].error, /403/);
});

test('bara exported + pending plockas upp', async () => {
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: fakeExpenseStore([
      SAMPLE_EXPENSE,
      { ...SAMPLE_EXPENSE, id: 'exp_2', status: 'approved' },
      { ...SAMPLE_EXPENSE, id: 'exp_3', fortnoxSyncStatus: 'synced' },
    ]),
    env: {},
  });
  const pending = await sync.listPendingExpenses();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, 'exp_test1');
});

// ── ORD-CM-14 · vatMode-medveten kontering ──────────────────────────────────
test('reverse_charge_eu: fiktiv moms 25 % som 2645 D / 2614 K, balanserad', () => {
  const { buildVoucherPayload } = require('../../src/cfo/cfoFortnoxVoucherSync');
  const p = buildVoucherPayload({
    id: 'exp_rc',
    supplier: 'Meta Platforms Ireland Limited',
    amountSek: 7096,
    vatSek: 0,
    category: 'marknadsforing',
    date: '2026-07-10',
    vatMode: 'reverse_charge_eu',
  });
  const rows = p.Voucher.VoucherRows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { Account: 5900, Debit: 7096, Credit: 0 });
  assert.deepEqual(rows[1], { Account: 2645, Debit: 1774, Credit: 0 });
  assert.deepEqual(rows[2], { Account: 2614, Debit: 0, Credit: 1774 });
  assert.deepEqual(rows[3], { Account: 1930, Debit: 0, Credit: 7096 });
  assert.equal(p.meta.accountSource, 'vat_mode_reverse_charge_eu');
  assert.equal(p.meta.balanced, true);
  const debet = rows.reduce((a, r) => a + r.Debit, 0);
  const kredit = rows.reduce((a, r) => a + r.Credit, 0);
  assert.equal(debet, kredit);
});

test('representation_limited med deductibleVatSek: endast avdragsgill moms bryts ut', () => {
  const { buildVoucherPayload } = require('../../src/cfo/cfoFortnoxVoucherSync');
  const p = buildVoucherPayload({
    id: 'exp_rep',
    supplier: 'Foodora AB',
    amountSek: 588,
    vatSek: 63,
    category: 'mat_representation',
    vatMode: 'representation_limited',
    deductibleVatSek: 36,
  });
  const rows = p.Voucher.VoucherRows;
  assert.deepEqual(rows[rows.length - 1], { Account: 1930, Debit: 0, Credit: 588 });
  const vatRow = rows.find((r) => r.Account === 2641);
  assert.deepEqual(vatRow, { Account: 2641, Debit: 36, Credit: 0 });
  const costRow = rows[0];
  assert.equal(costRow.Debit, 552);
  assert.equal(p.meta.balanced, true);
});

test('representation_limited UTAN deductibleVatSek: default-kontering + manuell-not', () => {
  const { buildVoucherPayload } = require('../../src/cfo/cfoFortnoxVoucherSync');
  const p = buildVoucherPayload({
    id: 'exp_rep2',
    supplier: 'Foodora AB',
    amountSek: 588,
    vatSek: 0,
    category: 'mat_representation',
    vatMode: 'representation_limited',
    deductibleVatSek: null,
  });
  assert.equal(p.meta.accountSource, 'default_suggestion');
  assert.ok(p.meta.notes.some((n) => n.includes('granska momsavdraget manuellt')));
});

// ── ORD-CM-16 · gate-override från persistenta disken ───────────────────────
test('gate-override: fil med voucherSyncEnabled=true öppnar gaten utan env', async () => {
  const os = require('node:os');
  const path = require('node:path');
  const fsp = require('node:fs/promises');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vso-'));
  await fsp.writeFile(
    path.join(dir, 'voucher-sync-override.json'),
    JSON.stringify({ voucherSyncEnabled: true })
  );
  const { createCfoFortnoxVoucherSync } = require('../../src/cfo/cfoFortnoxVoucherSync');
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: { listExpenses: () => [] },
    fortnoxStore: { getConnection: async () => ({ connected: false }) },
    fortnoxClient: null,
    env: { ARCANA_STATE_ROOT: dir },
  });
  const r = await sync.run({ dryRun: true });
  // Gaten öppen (reason inte 'disabled') — nästa gate (OAuth) tar vid.
  assert.notEqual(r.reason, 'disabled');
});

test('gate-override: saknad/ogiltig fil = gate stängd (fail-closed)', async () => {
  const os = require('node:os');
  const path = require('node:path');
  const fsp = require('node:fs/promises');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vso2-'));
  const { createCfoFortnoxVoucherSync } = require('../../src/cfo/cfoFortnoxVoucherSync');
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: { listExpenses: () => [] },
    env: { ARCANA_STATE_ROOT: dir },
  });
  const r1 = await sync.run({ dryRun: true });
  assert.equal(r1.reason, 'disabled');
  await fsp.writeFile(path.join(dir, 'voucher-sync-override.json'), 'trasig json');
  const r2 = await sync.run({ dryRun: true });
  assert.equal(r2.reason, 'disabled');
});

// ── ORD-CM-30 · resolveSyncing: syncing-limbo källavstäms mot Fortnox ───────
test('resolveSyncing: verifikat hittat i Fortnox → marked_synced med verifikat-nr', async () => {
  const { createCfoFortnoxVoucherSync } = require('../../src/cfo/cfoFortnoxVoucherSync');
  const synced = [];
  const sync = createCfoFortnoxVoucherSync({
    expenseStore: {
      listExpenses: () => [
        {
          id: 'exp_abc123',
          status: 'exported',
          fortnoxSyncStatus: 'syncing',
          supplier: 'Meta',
          amountSek: 135.45,
          date: '2026-07-13',
        },
      ],
      markFortnoxSynced: async (x) => {
        synced.push(x);
        return x;
      },
    },
    fortnoxStore: { getConnection: async () => ({ connected: true, accessToken: 't' }) },
    fortnoxClient: {
      createVoucher: async () => ({}),
      listVouchers: async () => ({
        MetaInformation: { '@TotalPages': 1 },
        Vouchers: [
          { VoucherSeries: 'A', VoucherNumber: 345, Description: 'CF abc123 Meta' },
          { VoucherSeries: 'A', VoucherNumber: 1, Description: 'Annat verifikat' },
        ],
      }),
    },
    env: {},
  });
  const r = await sync.resolveSyncing({ dryRun: false });
  assert.equal(r.ok, true);
  assert.equal(r.results[0].foundVoucher, 'A345');
  assert.equal(r.results[0].action, 'marked_synced');
  assert.equal(synced[0].fortnoxVoucherId, 'A345');
});

test('resolveSyncing: inget verifikat → reset_to_pending; dryRun rör ingenting', async () => {
  const { createCfoFortnoxVoucherSync } = require('../../src/cfo/cfoFortnoxVoucherSync');
  const calls = { pending: 0, synced: 0 };
  const mkStore = () => ({
    listExpenses: () => [
      {
        id: 'exp_def456',
        status: 'exported',
        fortnoxSyncStatus: 'syncing',
        supplier: 'Verisure',
        amountSek: 10462,
        date: '2022-01-19',
      },
    ],
    markFortnoxSynced: async () => {
      calls.synced += 1;
    },
    markFortnoxSyncingToPending: async () => {
      calls.pending += 1;
    },
  });
  const mkSync = () =>
    createCfoFortnoxVoucherSync({
      expenseStore: mkStore(),
      fortnoxStore: { getConnection: async () => ({ connected: true, accessToken: 't' }) },
      fortnoxClient: {
        createVoucher: async () => ({}),
        listVouchers: async () => ({
          MetaInformation: { '@TotalPages': 1 },
          Vouchers: [{ VoucherSeries: 'A', VoucherNumber: 9, Description: 'Ej vår post' }],
        }),
      },
      env: {},
    });
  const dry = await mkSync().resolveSyncing({ dryRun: true });
  assert.equal(dry.results[0].action, 'none');
  assert.equal(calls.pending + calls.synced, 0);
  const skarp = await mkSync().resolveSyncing({ dryRun: false });
  assert.equal(skarp.results[0].action, 'reset_to_pending');
  assert.equal(calls.pending, 1);
  assert.equal(calls.synced, 0);
});
