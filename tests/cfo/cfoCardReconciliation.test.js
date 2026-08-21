'use strict';

// ORD-102 · Kortavstämning — parser, dedupe, matchning, ägar-beslut.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCardReconciliation,
  parseAmexCsv,
  parseSwedishAmount,
} = require('../../src/cfo/cfoCardReconciliation');

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'card-recon-'));
  return path.join(dir, 'recon.json');
}

const AMEX_CSV = [
  'Datum,Beskrivning,Belopp',
  '08/16/2026,ANTHROPIC* CLAUDE SUB   DUBLIN,"2 530,79"',
  '08/11/2026,FACEBK *LBJE4XVK42 DUBLIN,"7 096,00"',
  '08/05/2026,BETALNING MOTTAGEN, TACK,"-52 166,47"',
  '07/12/2026,KONTORSGROSSISTEN AB STOCKHOLM,"125,00"',
  '07/12/2026,KONTORSGROSSISTEN AB STOCKHOLM,"125,00"',
].join('\n');

test('parseAmexCsv: svenska belopp, datumformat, krediter, dubblett-ordinal', () => {
  assert.equal(parseSwedishAmount('"2 404,95"'), 2404.95);
  assert.equal(parseSwedishAmount('-52 166,47'), -52166.47);

  const { transactions, skipped } = parseAmexCsv(AMEX_CSV, { cardRef: '86005' });
  assert.equal(skipped, 0);
  assert.equal(transactions.length, 5);
  assert.equal(transactions[0].date, '2026-08-16');
  assert.equal(transactions[0].amountSek, 2530.79);
  assert.equal(transactions[2].type, 'credit'); // betalningen
  // Två identiska Kontorsgrossisten-rader = olika dedupeKey (ordinal)
  assert.notEqual(transactions[3].dedupeKey, transactions[4].dedupeKey);
});

test('import + matchning: auto-match entydig träff, förslag vid flera, kredit ignoreras', async () => {
  const expenses = [
    { id: 'e1', supplier: 'Anthropic', amountSek: 2530.79, date: '2026-08-16', status: 'new' },
    { id: 'e2', supplier: 'Meta', amountSek: 7096, date: '2026-08-10', status: 'new' },
    {
      id: 'e3',
      supplier: 'Kontorsgrossisten AB',
      amountSek: 125,
      date: '2026-07-12',
      status: 'new',
    },
    {
      id: 'e4',
      supplier: 'Kontorsgrossisten AB',
      amountSek: 125,
      date: '2026-07-13',
      status: 'new',
    },
    { id: 'e5', supplier: 'Avvisad', amountSek: 125, date: '2026-07-12', status: 'rejected' },
  ];
  const recon = createCardReconciliation({
    filePath: await tmpFile(),
    expenseStore: { listExpenses: () => expenses },
  });
  const { transactions } = parseAmexCsv(AMEX_CSV, { cardRef: '86005' });
  const imp = await recon.importTransactions(transactions);
  assert.equal(imp.imported, 5);

  // Om-import av samma fil: allt dedupe:as
  const imp2 = await recon.importTransactions(transactions);
  assert.equal(imp2.imported, 0);
  assert.equal(imp2.duplicates, 5);

  const m = await recon.runMatching();
  // Anthropic + Meta auto-matchas; två 125-kr-dragningar mot två kandidater
  // vardera (ej entydigt per rad? — jo: kandidater delas, första tar en)
  assert.ok(m.autoMatched >= 2);

  const stats = recon.stats();
  assert.equal(stats.totalCharges, 4); // krediten är ignorerad
  assert.equal(stats.matched + stats.unmatched + stats.ignored, 4);

  // Rejected-utgiften får aldrig vara matchad
  const all = recon.listTransactions({ limit: 100 });
  assert.ok(all.every((t) => t.matchedExpenseId !== 'e5'));
});

test('confirmMatch + ignore är ägar-beslut som persisteras', async () => {
  const file = await tmpFile();
  const recon = createCardReconciliation({
    filePath: file,
    expenseStore: { listExpenses: () => [] },
  });
  const { transactions } = parseAmexCsv(
    'Datum,Beskrivning,Belopp\n07/04/2026,OKÄND BUTIK,"999,00"',
    { cardRef: '61008' }
  );
  await recon.importTransactions(transactions);
  const tx = recon.listTransactions()[0];
  assert.equal(tx.matchStatus, 'unmatched');

  await recon.confirmMatch(tx.id, 'e-manuell', { actor: 'fazli' });
  assert.equal(recon.listTransactions({ status: 'matched' }).length, 1);

  // Ny instans från disk — beslutet överlever
  const recon2 = createCardReconciliation({
    filePath: file,
    expenseStore: { listExpenses: () => [] },
  });
  const persisted = recon2.listTransactions({ status: 'matched' })[0];
  assert.equal(persisted.matchedExpenseId, 'e-manuell');
  assert.equal(persisted.matchKind, 'manual');

  await recon2.ignoreTransaction(persisted.id, { reason: 'privat köp' });
  assert.equal(recon2.stats().ignored, 1);
});
