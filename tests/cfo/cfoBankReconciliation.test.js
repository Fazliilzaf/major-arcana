'use strict';

// ORD-103 · Bankavstämning Handelsbanken mot Fortnox-verifikat — tester.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCfoBankReconciliation,
  parseHandelsbankenCsv,
} = require('../../src/cfo/cfoBankReconciliation');

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bank-recon-'));
  return path.join(dir, 'recon.json');
}

const HANDBANKEN_CSV = [
  'sep=;',
  'Kontohavare;Kontonr;IBAN;BIC;Kontoform;Valuta;Kontoförande kontor;Datum intervall;Kontor;Bokföringsdag;Reskontradag;Valutadag;Referens;Insättning/Uttag;Bokfört saldo;Aktuellt saldo;Valutadagssaldo;Referens Swish;Avsändar-id Swish;',
  'HAIR TP CLINIC GBG AB;558698131;SE8160000000000558698131;HANDSESS;Affärskonto;SEK;6694 Göteborg Avenyn;2026-07-01 - 2026-08-21;;;;;;;;3001886,04;3001886,04;;;',
  'HAIR TP CLINIC GBG AB;558698131;SE8160000000000558698131;HANDSESS;Affärskonto;SEK;6694 Göteborg Avenyn;2026-07-01 - 2026-08-21;6091;2026-08-20;2026-08-20;2026-08-21;619-8840 00142;54376,00;3001886,04;;;;;',
  'HAIR TP CLINIC GBG AB;558698131;SE8160000000000558698131;HANDSESS;Affärskonto;SEK;6694 Göteborg Avenyn;2026-07-01 - 2026-08-21;6694;2026-08-20;2026-08-20;2026-08-20;utlägg klinike;-120000,00;2932224,04;;;;;',
  'HAIR TP CLINIC GBG AB;558698131;SE8160000000000558698131;HANDSESS;Affärskonto;SEK;6694 Göteborg Avenyn;2026-07-01 - 2026-08-21;6885;2026-08-19;2026-08-19;2026-08-19;Bankavgifter;-307,00;2996840,36;;;;;',
].join('\n');

test('parseHandelsbankenCsv: svenska belopp, datumformat, summarad hoppas', () => {
  const transactions = parseHandelsbankenCsv(HANDBANKEN_CSV);
  assert.equal(transactions.length, 3);
  assert.equal(transactions[0].bookingDay, '2026-08-20');
  assert.equal(transactions[0].reference, '619-8840 00142');
  assert.equal(transactions[0].amountSek, 54376.0);
  assert.equal(transactions[0].type, 'income');
  assert.equal(transactions[1].amountSek, -120000.0);
  assert.equal(transactions[1].type, 'expense');
  assert.equal(transactions[2].amountSek, -307.0);
  assert.equal(transactions[2].type, 'expense');
});

test('import + matchning: auto-match entydig träff, förslag vid flera, ignored kvar', async () => {
  const vouchers = [
    {
      VoucherId: 'v1',
      VoucherNumber: 1001,
      VoucherSeries: 'A',
      TransactionDate: '2026-08-20',
      Description: 'Kundbetalning',
      Amount: 54376,
    },
    {
      VoucherId: 'v2',
      VoucherNumber: 1002,
      VoucherSeries: 'A',
      TransactionDate: '2026-08-20',
      Description: 'Utlägg',
      Amount: 120000,
    },
    {
      VoucherId: 'v3',
      VoucherNumber: 1003,
      VoucherSeries: 'A',
      TransactionDate: '2026-08-19',
      Description: 'Bankavgift',
      Amount: 307,
    },
    // Ytterligare en med samma belopp+datum för att skapa förslag
    {
      VoucherId: 'v4',
      VoucherNumber: 1004,
      VoucherSeries: 'A',
      TransactionDate: '2026-08-20',
      Description: 'Annan insättning',
      Amount: 54376,
    },
  ];
  const recon = createCfoBankReconciliation({
    filePath: await tmpFile(),
  });
  const transactions = parseHandelsbankenCsv(HANDBANKEN_CSV);
  const imp = await recon.importTransactions(transactions);
  assert.equal(imp.added, 3);

  const fetchResult = await recon.fetchVouchers(
    { listVouchers: async () => ({ Vouchers: vouchers }) },
    {}
  );
  assert.equal(fetchResult.count, 4);

  const matchResult = recon.runMatching();
  assert.ok(matchResult.matched >= 1);
  assert.ok(matchResult.suggestions >= 1);

  const stats = recon.stats();
  assert.equal(stats.total, 3);
  assert.equal(stats.matched + stats.unmatched + stats.suggestions + stats.ignored, 3);
});

test('confirmMatch + ignore är ägar-beslut som persisteras', async () => {
  const file = await tmpFile();
  const recon = createCfoBankReconciliation({ filePath: file });
  const transactions = parseHandelsbankenCsv(HANDBANKEN_CSV);
  await recon.importTransactions(transactions);
  const tx = recon.listTransactions()[0];
  assert.equal(tx.matchStatus, 'unmatched');

  // Mock-voucher måste finnas innan confirmMatch
  await recon.fetchVouchers(
    {
      listVouchers: async () => ({
        Vouchers: [
          {
            VoucherId: 'v9',
            VoucherNumber: 999,
            VoucherSeries: 'A',
            TransactionDate: tx.bookingDay,
            Description: 'Test',
            Amount: Math.abs(tx.amountSek),
          },
        ],
      }),
    },
    {}
  );

  await recon.confirmMatch(tx.id, 'v9', { actor: 'fazli' });
  assert.equal(recon.listTransactions({ status: 'matched' }).length, 1);
  await recon.persist();

  const recon2 = createCfoBankReconciliation({ filePath: file });
  const persisted = recon2.listTransactions({ status: 'matched' })[0];
  assert.equal(persisted.matchedVoucherId, 'v9');
  assert.equal(persisted.matchKind, 'manual');

  await recon2.ignoreTransaction(recon2.listTransactions({ status: 'unmatched' })[0].id, {
    reason: 'intern överföring',
  });
  assert.equal(recon2.stats().ignored, 1);
});

test('dedupe: samma transaktion importeras bara en gång', async () => {
  const recon = createCfoBankReconciliation({ filePath: await tmpFile() });
  const transactions = parseHandelsbankenCsv(HANDBANKEN_CSV);
  const imp1 = await recon.importTransactions(transactions);
  const imp2 = await recon.importTransactions(transactions);
  assert.equal(imp1.added, 3);
  assert.equal(imp2.added, 0);
  assert.equal(imp2.skipped, 3);
});
