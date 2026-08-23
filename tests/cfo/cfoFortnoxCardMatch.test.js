'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createCardReconciliation } = require('../../src/cfo/cfoCardReconciliation');
const {
  fetchFortnoxVouchers,
  matchCardTransactions,
  applyMatches,
  runFortnoxCardMatch,
} = require('../../src/cfo/cfoFortnoxCardMatch');

describe('cfoFortnoxCardMatch', () => {
  let tmpDir;
  let reconciliation;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-fortnox-card-match-'));
    reconciliation = createCardReconciliation({
      filePath: path.join(tmpDir, 'card-recon.json'),
    });
  });

  function makeFortnoxClient(vouchers) {
    return {
      listVouchers: async () => ({
        Vouchers: vouchers.map((v) => ({
          VoucherSeries: v.series || 'A',
          VoucherNumber: v.number,
          VoucherId: v.voucherId || `${v.series || 'A'}|${v.number}`,
          TransactionDate: v.date,
          Description: v.description || '',
        })),
        MetaInformation: { '@TotalPages': 1 },
      }),
      getVoucher: async (series, number) => {
        const v = vouchers.find(
          (x) => (x.series || 'A') === series && String(x.number) === String(number)
        );
        if (!v) return { Voucher: { VoucherRows: [] } };
        return {
          Voucher: {
            VoucherRows: v.rows || [],
          },
        };
      },
    };
  }

  it('hämtar och detaljerar verifikat från Fortnox', async () => {
    const client = makeFortnoxClient([
      {
        number: 1,
        date: '2026-08-15',
        description: 'Kontorsmaterial',
        rows: [
          { Account: 5460, Debit: 1000, Credit: 0 },
          { Account: 2641, Debit: 250, Credit: 0 },
          { Account: 1930, Debit: 0, Credit: 1250 },
        ],
      },
    ]);
    const result = await fetchFortnoxVouchers(client, {
      financialYearDate: '2026-08-15',
      throttleMs: 0,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.vouchers.length, 1);
    assert.strictEqual(result.vouchers[0].amount, 1250);
    assert.strictEqual(result.vouchers[0].description, 'Kontorsmaterial');
  });

  it('matchar en entydig korttransaktion mot ett Fortnox-verifikat', async () => {
    await reconciliation.importTransactions([
      {
        cardRef: '86005',
        date: '2026-08-15',
        description: 'KONTORSMATERIAL',
        amountSek: 1250,
        type: 'charge',
        dedupeKey: 'a',
      },
    ]);

    const vouchers = [
      {
        voucherId: 'v1',
        amount: 1250,
        transactionDate: '2026-08-15',
        voucherSeries: 'A',
        voucherNumber: 1,
        description: 'Kontorsmaterial',
      },
    ];

    const { matches, suggestions } = matchCardTransactions(
      reconciliation.listTransactions({ status: 'unmatched', limit: 100 }),
      vouchers
    );
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(suggestions.length, 0);
    assert.strictEqual(matches[0].transactionAmountSek, 1250);
    assert.strictEqual(matches[0].voucherId, 'v1');
  });

  it('lämnar flertydiga träffar som förslag', async () => {
    await reconciliation.importTransactions([
      {
        cardRef: '86005',
        date: '2026-08-15',
        description: 'KONTORSMATERIAL',
        amountSek: 1250,
        type: 'charge',
        dedupeKey: 'a',
      },
    ]);

    const vouchers = [
      {
        voucherId: 'v1',
        amount: 1250,
        transactionDate: '2026-08-15',
        voucherSeries: 'A',
        voucherNumber: 1,
      },
      {
        voucherId: 'v2',
        amount: 1250,
        transactionDate: '2026-08-14',
        voucherSeries: 'A',
        voucherNumber: 2,
      },
    ];

    const { matches, suggestions } = matchCardTransactions(
      reconciliation.listTransactions({ status: 'unmatched', limit: 100 }),
      vouchers
    );
    assert.strictEqual(matches.length, 0);
    assert.strictEqual(suggestions.length, 1);
    assert.strictEqual(suggestions[0].candidates.length, 2);
  });

  it('ett verifikat kan inte matchas mot två transaktioner', async () => {
    await reconciliation.importTransactions([
      {
        cardRef: '86005',
        date: '2026-08-15',
        description: 'KÖP A',
        amountSek: 1250,
        type: 'charge',
        dedupeKey: 'a',
      },
      {
        cardRef: '86005',
        date: '2026-08-15',
        description: 'KÖP B',
        amountSek: 1250,
        type: 'charge',
        dedupeKey: 'b',
      },
    ]);

    const vouchers = [
      {
        voucherId: 'v1',
        amount: 1250,
        transactionDate: '2026-08-15',
        voucherSeries: 'A',
        voucherNumber: 1,
      },
    ];

    const { matches } = matchCardTransactions(
      reconciliation.listTransactions({ status: 'unmatched', limit: 100 }),
      vouchers
    );
    assert.strictEqual(matches.length, 1);
  });

  it('applicerar bara entydiga träffar och uppdaterar store', async () => {
    await reconciliation.importTransactions([
      {
        cardRef: '86005',
        date: '2026-08-15',
        description: 'KÖP A',
        amountSek: 1250,
        type: 'charge',
        dedupeKey: 'a',
      },
    ]);

    const matches = [
      {
        transactionId: reconciliation.listTransactions({ status: 'unmatched', limit: 100 })[0].id,
        transactionAmountSek: 1250,
        transactionDate: '2026-08-15',
        transactionDescription: 'KÖP A',
        voucherId: 'v1',
        voucherSeries: 'A',
        voucherNumber: 1,
        voucherDescription: 'Kontorsmaterial',
        voucherDate: '2026-08-15',
        voucherAmountSek: 1250,
      },
    ];

    const { applied } = await applyMatches(reconciliation, matches, { actor: 'test' });
    assert.strictEqual(applied, 1);
    const tx = reconciliation.listTransactions({ status: 'matched', limit: 100 })[0];
    assert.strictEqual(tx.matchStatus, 'matched');
    assert.strictEqual(tx.matchKind, 'fortnox');
    assert.strictEqual(tx.fortnoxVoucherId, 'v1');
  });

  it('runFortnoxCardMatch: dryRun applicerar inget, autoApply applicerar', async () => {
    await reconciliation.importTransactions([
      {
        cardRef: '86005',
        date: '2026-08-15',
        description: 'KÖP A',
        amountSek: 1250,
        type: 'charge',
        dedupeKey: 'a',
      },
    ]);

    const client = makeFortnoxClient([
      {
        number: 1,
        date: '2026-08-15',
        description: 'Kontorsmaterial',
        rows: [
          { Account: 5460, Debit: 1000, Credit: 0 },
          { Account: 2641, Debit: 250, Credit: 0 },
          { Account: 1930, Debit: 0, Credit: 1250 },
        ],
      },
    ]);

    const dry = await runFortnoxCardMatch({
      fortnoxClient: client,
      reconciliation,
      financialYearDate: '2026-08-15',
      dryRun: true,
      autoApply: false,
      throttleMs: 0,
    });
    assert.strictEqual(dry.ok, true);
    assert.strictEqual(dry.matched, 1);
    assert.strictEqual(dry.autoApplied, 0);
    assert.strictEqual(reconciliation.stats().matched, 0);

    const applied = await runFortnoxCardMatch({
      fortnoxClient: client,
      reconciliation,
      financialYearDate: '2026-08-15',
      dryRun: false,
      autoApply: true,
      throttleMs: 0,
    });
    assert.strictEqual(applied.ok, true);
    assert.strictEqual(applied.autoApplied, 1);
    assert.strictEqual(reconciliation.stats().matched, 1);
  });
});
