'use strict';

// ORD-103d · Automatisk bokföring av bankinkomster i Fortnox — tester.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCfoBankReconciliation } = require('../../src/cfo/cfoBankReconciliation');
const {
  createIncomeVouchers,
  buildVoucherPayload,
  detectIncomeSubtype,
  hasScopeBookkeeping,
} = require('../../src/cfo/cfoBankIncomeAutoBook');

const DEFAULT_ACCOUNTS = {
  swish: { credit: 3001 },
  card: { credit: 3020 },
  bank_transfer: { credit: 1510 },
  unknown: { credit: 3001 },
  bank: 1930,
};

function mockTx(overrides = {}) {
  return {
    id: 'tx_test_1',
    bookingDay: '2026-08-20',
    reference: 'SWISH 123456',
    amountSek: 2500,
    type: 'income',
    swishReference: '',
    ...overrides,
  };
}

function mockFortnoxClient(overrides = {}) {
  const created = [];
  return {
    created,
    listFinancialYears: async () => ({
      FinancialYears: [{ Id: '1', FromDate: '2026-01-01', ToDate: '2026-12-31' }],
    }),
    getAccount: async () => ({ Account: { Active: true } }),
    activateAccount: async () => ({ Account: { Active: true } }),
    createVoucher: async (payload) => {
      created.push(payload);
      return { Voucher: { VoucherNumber: 1000 + created.length, VoucherSeries: 'A' } };
    },
    ...overrides,
  };
}

function mockReconciliation(transactions = []) {
  return {
    listTransactions: () => transactions,
    _state: () => ({ transactions }),
  };
}

test('detectIncomeSubtype: swish, card, bank_transfer, unknown', () => {
  assert.equal(detectIncomeSubtype(mockTx({ reference: 'SWISH 12345' })), 'swish');
  assert.equal(detectIncomeSubtype(mockTx({ reference: 'KORTBETALNING 123' })), 'card');
  assert.equal(detectIncomeSubtype(mockTx({ reference: 'KORTINBETALNING terminal' })), 'card');
  assert.equal(
    detectIncomeSubtype(mockTx({ reference: 'BETALNING MOTTAGEN, TACK' })),
    'bank_transfer'
  );
  assert.equal(detectIncomeSubtype(mockTx({ reference: 'FRAKT OCH POST' })), 'unknown');
});

test('buildVoucherPayload: balanserat verifikat med rätt konton', () => {
  const tx = mockTx({ amountSek: 2500, reference: 'SWISH 12345' });
  const { Voucher, meta } = buildVoucherPayload(tx, { accounts: DEFAULT_ACCOUNTS });
  assert.equal(Voucher.VoucherSeries, 'A');
  assert.equal(Voucher.TransactionDate, '2026-08-20');
  assert.ok(Voucher.Description.includes('SWISH'));
  assert.equal(Voucher.VoucherRows.length, 2);
  assert.deepEqual(Voucher.VoucherRows[0], { Account: 1930, Debit: 2500, Credit: 0 });
  assert.deepEqual(Voucher.VoucherRows[1], { Account: 3001, Debit: 0, Credit: 2500 });
  assert.equal(meta.subtype, 'swish');
  assert.equal(meta.incomeAccount, 3001);
});

test('buildVoucherPayload: negativ inkomst spegelvänder inte kontona', () => {
  const tx = mockTx({ amountSek: -2500, reference: 'KORTINBETALNING refund' });
  const { Voucher } = buildVoucherPayload(tx, { accounts: DEFAULT_ACCOUNTS });
  assert.equal(Voucher.VoucherRows[0].Debit, 2500);
  assert.equal(Voucher.VoucherRows[1].Credit, 2500);
});

test('hasScopeBookkeeping: true endast om scope innehåller bookkeeping', () => {
  assert.equal(hasScopeBookkeeping({ scope: 'customer invoice payment bookkeeping' }), true);
  assert.equal(hasScopeBookkeeping({ scope: 'customer invoice payment' }), false);
  assert.equal(hasScopeBookkeeping({ scope: 'bookkeeping' }), true);
  assert.equal(hasScopeBookkeeping({}), false);
});

test('createIncomeVouchers: misslyckas om Fortnox saknar createVoucher', async () => {
  const result = await createIncomeVouchers({
    reconciliation: mockReconciliation([mockTx()]),
    fortnoxClient: { listFinancialYears: async () => ({}) },
    connection: { connected: true, scope: 'bookkeeping' },
    accounts: DEFAULT_ACCOUNTS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'fortnox_client_missing_createVoucher');
});

test('createIncomeVouchers: misslyckas om scope saknar bookkeeping', async () => {
  const result = await createIncomeVouchers({
    reconciliation: mockReconciliation([mockTx()]),
    fortnoxClient: mockFortnoxClient(),
    connection: { connected: true, scope: 'customer invoice payment' },
    accounts: DEFAULT_ACCOUNTS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'fortnox_scope_missing_bookkeeping');
});

test('createIncomeVouchers: dryRun skapar ingen verifikat men returnerar payloads', async () => {
  const client = mockFortnoxClient();
  const tx = mockTx();
  const result = await createIncomeVouchers({
    reconciliation: mockReconciliation([tx]),
    fortnoxClient: client,
    connection: { connected: true, scope: 'bookkeeping' },
    accounts: DEFAULT_ACCOUNTS,
    dryRun: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].dryRun, true);
  assert.deepEqual(client.created, []);
  assert.equal(tx.matchStatus, undefined);
});

test('createIncomeVouchers: skapar verifikat och markerar transaktioner auto_booked', async () => {
  const client = mockFortnoxClient();
  const tx = mockTx();
  const result = await createIncomeVouchers({
    reconciliation: mockReconciliation([tx]),
    fortnoxClient: client,
    connection: { connected: true, scope: 'bookkeeping' },
    accounts: DEFAULT_ACCOUNTS,
    dryRun: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.created.length, 1);
  assert.equal(client.created.length, 1);
  assert.equal(tx.matchStatus, 'auto_booked');
  assert.equal(tx.autoBookedVoucherNumber, '1001');
  assert.equal(tx.autoBookedVoucherSeries, 'A');
});

test('createIncomeVouchers: hoppar över redan bokförda och expenses', async () => {
  const client = mockFortnoxClient();
  const income = mockTx({ id: 'tx_income', amountSek: 1000 });
  const expense = mockTx({ id: 'tx_expense', amountSek: -500, type: 'expense' });
  const already = mockTx({ id: 'tx_already', autoBookedVoucherNumber: '999' });
  const result = await createIncomeVouchers({
    reconciliation: mockReconciliation([income, expense, already]),
    fortnoxClient: client,
    connection: { connected: true, scope: 'bookkeeping' },
    accounts: DEFAULT_ACCOUNTS,
    dryRun: false,
  });
  assert.equal(result.created.length, 1);
  assert.equal(client.created.length, 1);
  assert.equal(result.created[0].txId, 'tx_income');
});

test('createIncomeVouchers: retry vid 429 rate-limit', async () => {
  let calls = 0;
  const client = mockFortnoxClient({
    createVoucher: async (payload) => {
      calls++;
      if (calls === 1) {
        const err = new Error('rate limit');
        err.statusCode = 429;
        throw err;
      }
      return { Voucher: { VoucherNumber: 2001, VoucherSeries: 'A' } };
    },
  });
  const tx = mockTx();
  const result = await createIncomeVouchers({
    reconciliation: mockReconciliation([tx]),
    fortnoxClient: client,
    connection: { connected: true, scope: 'bookkeeping' },
    accounts: DEFAULT_ACCOUNTS,
    dryRun: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.created.length, 1);
  assert.equal(calls, 2);
});

test('createIncomeVouchers: returnerar fel utan att krascha vid API-fel', async () => {
  const client = mockFortnoxClient({
    createVoucher: async () => {
      const err = new Error('invalid account');
      err.statusCode = 400;
      throw err;
    },
  });
  const tx = mockTx();
  const result = await createIncomeVouchers({
    reconciliation: mockReconciliation([tx]),
    fortnoxClient: client,
    connection: { connected: true, scope: 'bookkeeping' },
    accounts: DEFAULT_ACCOUNTS,
    dryRun: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.created.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].txId, 'tx_test_1');
});

test('integration med createCfoBankReconciliation: autoBookIncomeTransactions persisterar state', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bank-income-'));
  const recon = createCfoBankReconciliation({ filePath: path.join(dir, 'recon.json') });
  const tx = mockTx();
  await recon.importTransactions([tx]);
  const client = mockFortnoxClient();
  const result = await recon.autoBookIncomeTransactions(
    client,
    { connected: true, scope: 'bookkeeping' },
    {
      accounts: DEFAULT_ACCOUNTS,
      dryRun: false,
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.created.length, 1);
  const stats = recon.stats();
  assert.equal(stats.autoBooked, 1);
  assert.equal(stats.unmatched, 0);
});
