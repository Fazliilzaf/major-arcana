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
