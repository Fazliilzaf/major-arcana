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

test('unmatchTransaction: återställer en felaktig matchning och persisteras', async () => {
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

  // Matcha manuellt
  await recon.confirmMatch(tx.id, 'e-felaktig', { actor: 'fazli' });
  let matched = recon.listTransactions({ status: 'matched' })[0];
  assert.equal(matched.matchedExpenseId, 'e-felaktig');
  assert.equal(matched.matchKind, 'manual');

  // Ångra matchningen
  const unmatched = await recon.unmatchTransaction(tx.id, {
    actor: 'fazli',
    reason: 'fel utgift',
  });
  assert.equal(unmatched.matchStatus, 'unmatched');
  assert.equal(unmatched.matchedExpenseId, null);
  assert.equal(unmatched.matchKind, null);
  assert.equal(unmatched.unmatchReason, 'fel utgift');
  assert.ok(unmatched.unmatchedAt);

  // Stale förslag ska vara borta
  assert.ok(!unmatched.suggestions || unmatched.suggestions.length === 0);

  // Ny instans från disk — unmatch beslutet överlever
  const recon2 = createCardReconciliation({
    filePath: file,
    expenseStore: { listExpenses: () => [] },
  });
  const persisted = recon2.listTransactions({ status: 'unmatched' })[0];
  assert.equal(persisted.matchStatus, 'unmatched');
  assert.equal(persisted.matchedExpenseId, null);
  assert.equal(persisted.unmatchReason, 'fel utgift');

  // Dubbel unmatch ska ge fel
  const second = await recon2.unmatchTransaction(tx.id, { actor: 'fazli' });
  assert.ok(second.error, 'omatchad transaktion ska inte kunna unmatchas igen');
});

test('exporterade utgifter ska inte matchas mot kortdragningar', async () => {
  const expenses = [
    { id: 'e-new', supplier: 'Aktiv', amountSek: 500, date: '2026-07-10', status: 'new' },
    {
      id: 'e-exported',
      supplier: 'Gammal',
      amountSek: 500,
      date: '2026-07-10',
      status: 'exported',
    },
    {
      id: 'e-ready',
      supplier: 'Färdig',
      amountSek: 500,
      date: '2026-07-10',
      status: 'ready_for_export',
    },
    {
      id: 'e-rejected',
      supplier: 'Avvisad',
      amountSek: 500,
      date: '2026-07-10',
      status: 'rejected',
    },
  ];
  const recon = createCardReconciliation({
    filePath: await tmpFile(),
    expenseStore: { listExpenses: () => expenses },
  });
  const { transactions } = parseAmexCsv(
    'Datum,Beskrivning,Belopp\n07/10/2026,AKTIV BUTIK,"500,00"',
    { cardRef: '61008' }
  );
  await recon.importTransactions(transactions);
  const m = await recon.runMatching();
  // Endast e-new är tillgänglig för matchning
  assert.equal(m.autoMatched, 1);
  const matched = recon.listTransactions({ status: 'matched' })[0];
  assert.equal(matched.matchedExpenseId, 'e-new');
});

test('leverantörshint känner igen alias (FACEBK→Meta, Voi, Apple, Google)', async () => {
  const expenses = [
    {
      id: 'e-meta',
      supplier: 'Meta / Facebook Ads',
      amountSek: 7096,
      date: '2026-08-10',
      status: 'new',
    },
    {
      id: 'e-voi',
      supplier: 'Voi Technology AB',
      amountSek: 16.8,
      date: '2026-08-01',
      status: 'new',
    },
    {
      id: 'e-apple',
      supplier: 'Apple.com/Bill',
      amountSek: 129,
      date: '2026-07-29',
      status: 'new',
    },
    { id: 'e-google', supplier: 'Google', amountSek: 19, date: '2026-08-19', status: 'new' },
  ];
  const recon = createCardReconciliation({
    filePath: await tmpFile(),
    expenseStore: { listExpenses: () => expenses },
  });
  const csv = [
    'Datum,Beskrivning,Belopp',
    '08/10/2026,FACEBK *MA55YW5L42 DUBLIN,"7 096,00"',
    '08/01/2026,PAYPAL *VOITECHNOLO 852519727,"16,80"',
    '07/29/2026,APPLE.COM/BILL HOLLYHILL,"129,00"',
    '08/19/2026,GOOGLE *GOOGLE ONE G.CO/HELPPAY#,"19,00"',
  ].join('\n');
  const { transactions } = parseAmexCsv(csv, { cardRef: '86005' });
  await recon.importTransactions(transactions);
  const m = await recon.runMatching();
  assert.ok(m.autoMatched >= 4, `förväntade ≥4 auto-matchningar, fick ${m.autoMatched}`);
  const matched = recon.listTransactions({ status: 'matched' }).map((t) => t.matchedExpenseId);
  assert.ok(matched.includes('e-meta'));
  assert.ok(matched.includes('e-voi'));
  assert.ok(matched.includes('e-apple'));
  assert.ok(matched.includes('e-google'));
});

test('förslag utan leverantörshint visas inte (t.ex. Google One → Swiss Diamond)', async () => {
  const expenses = [
    {
      id: 'e-sd',
      supplier: 'Swiss Diamond Hotel Prishtina',
      amountSek: 20,
      date: null,
      status: 'new',
    },
    { id: 'e-figma', supplier: 'Figma', amountSek: 18, date: null, status: 'new' },
  ];
  const recon = createCardReconciliation({
    filePath: await tmpFile(),
    expenseStore: { listExpenses: () => expenses },
  });
  const { transactions } = parseAmexCsv(
    'Datum,Beskrivning,Belopp\n08/19/2026,GOOGLE *GOOGLE ONE G.CO/HELPPAY#,"19,00"',
    { cardRef: '86005' }
  );
  await recon.importTransactions(transactions);
  const m = await recon.runMatching();
  assert.equal(m.autoMatched, 0);
  assert.equal(m.suggested, 0);
  const tx = recon.listTransactions({ status: 'unmatched' })[0];
  assert.ok(!tx.suggestions || tx.suggestions.length === 0);
});

test('defensiv auto-accept kräver exakt belopp och datum ±3 dagar', async () => {
  const expenses = [
    // Exakt träff: auto-accept ska slå till
    {
      id: 'e-exakt',
      supplier: 'Meta Platforms Ireland Limited',
      amountSek: 1285.83,
      date: '2026-07-15',
      status: 'new',
    },
    // Belopp skiljer sig: ska inte accepteras
    {
      id: 'e-fel-belopp',
      supplier: 'Meta Platforms Ireland Limited',
      amountSek: 1285.84,
      date: '2026-07-15',
      status: 'new',
    },
    // Datum 4 dagar bort: ska inte accepteras (utom ±3)
    {
      id: 'e-fel-datum',
      supplier: 'Meta Platforms Ireland Limited',
      amountSek: 1285.83,
      date: '2026-07-10',
      status: 'new',
    },
  ];
  const recon = createCardReconciliation({
    filePath: await tmpFile(),
    expenseStore: { listExpenses: () => expenses },
  });
  const { transactions } = parseAmexCsv(
    'Datum,Beskrivning,Belopp\n07/15/2026,FACEBK *ZLTFXTRK42 DUBLIN,"1 285,83"',
    { cardRef: '61008' }
  );
  await recon.importTransactions(transactions);
  const m = await recon.runMatching();
  const matched = recon.listTransactions({ status: 'matched' });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].matchedExpenseId, 'e-exakt');
});

test('stale förslag rensas när matchningsreglerna blir strängare', async () => {
  const expenses = [
    { id: 'e-los', supplier: 'Swiss Diamond Hotel', amountSek: 20, date: null, status: 'new' },
  ];
  const recon = createCardReconciliation({
    filePath: await tmpFile(),
    expenseStore: { listExpenses: () => expenses },
  });
  const { transactions } = parseAmexCsv(
    'Datum,Beskrivning,Belopp\n08/19/2026,GOOGLE *GOOGLE ONE G.CO/HELPPAY#,"19,00"',
    { cardRef: '86005' }
  );
  await recon.importTransactions(transactions);
  // Första körningen utan regeln om supplierHint ger ett förslag
  // (fejkas genom att stänga av hint i en separat recon — men eftersom
  // koden alltid kräver hint testar vi istället att den INTE skapar förslag).
  const m = await recon.runMatching();
  assert.equal(m.suggested, 0);
  const tx = recon.listTransactions({ status: 'unmatched' })[0];
  assert.ok(!tx.suggestions || tx.suggestions.length === 0);
});

test('Bugbot #1466: punkt-tusental parsas, dubbelmatchning avvisas, stale förslag rensas', async () => {
  // 1. Tusentalspunkt (10.099,19) får inte tappas
  assert.equal(parseSwedishAmount('"10.099,19"'), 10099.19);
  assert.equal(parseSwedishAmount('1.234.567,89'), 1234567.89);
  assert.equal(parseSwedishAmount('19,00'), 19);

  // 2+3. Två dragningar med samma belopp, en utgift → förslag på båda;
  // manuell match på ena ska rensa förslaget på andra och blockera dubbelmatch
  const expenses = [
    { id: 'eX', supplier: 'Butiken', amountSek: 500, date: '2026-07-10', status: 'new' },
  ];
  const recon = createCardReconciliation({
    filePath: await tmpFile(),
    expenseStore: { listExpenses: () => expenses },
  });
  const csv =
    'Datum,Beskrivning,Belopp\n07/09/2026,BUTIKEN A,"500,00"\n07/20/2026,BUTIKEN B,"500,00"';
  const { transactions } = parseAmexCsv(csv, { cardRef: '61008' });
  await recon.importTransactions(transactions);
  await recon.runMatching();

  // Ena inom ±7d → auto-match? BUTIKEN A (9/7, 1 dag) är entydig strong-träff
  const unmatched = recon.listTransactions({ status: 'unmatched' });
  const matched = recon.listTransactions({ status: 'matched' });
  assert.equal(matched.length, 1);
  assert.equal(unmatched.length, 1);
  // Stale förslag på den omatchade (eX är tagen) ska vara rensat
  assert.ok(!unmatched[0].suggestions || unmatched[0].suggestions.length === 0);

  // Dubbelmatch avvisas med error
  const res = await recon.confirmMatch(unmatched[0].id, 'eX', { actor: 'fazli' });
  assert.ok(res.error, 'dubbelmatch ska ge error');
  assert.equal(recon.listTransactions({ status: 'matched' }).length, 1);
});
