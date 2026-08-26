'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEPOSIT_RATIO,
  FINAL_INVOICE_RATIO,
  parseSekNumber,
  formatSekAmount,
  computeDepositFromAcceptedPrice,
  computeFinalInvoiceAmount,
  computeOutstandingBalance,
  buildFinalInvoiceSignal,
} = require('../../src/ops/ccoCommercialEconomics');
const { buildCommercialCaseReadout } = require('../../src/ops/ccoCommercialStore');

test('parseSekNumber normaliserar siffror och formaterade belopp', () => {
  assert.equal(parseSekNumber(38400), 38400);
  assert.equal(parseSekNumber('38400'), 38400);
  assert.equal(parseSekNumber('38 400'), 38400);
  assert.equal(parseSekNumber('38 400 kr'), 38400);
  assert.equal(parseSekNumber('7680,50'), 7680.5);
  assert.equal(parseSekNumber(''), null);
  assert.equal(parseSekNumber('ej tillgängligt'), null);
});

test('formatSekAmount formaterar belopp svensk stil med kr-suffix', () => {
  const nb = '\u00a0'; // sv-SE använder icke-brytande mellanslag som tusentalsavskiljare
  assert.equal(formatSekAmount(38400), `38${nb}400 kr`);
  assert.equal(formatSekAmount(7680), `7${nb}680 kr`);
  assert.equal(formatSekAmount(30720), `30${nb}720 kr`);
  assert.equal(formatSekAmount(10.5), '10,50 kr');
  assert.equal(formatSekAmount('ej siffra'), '');
});

test('deposition = 20 % av accepterat pris', () => {
  assert.equal(computeDepositFromAcceptedPrice(38400), 7680);
  assert.equal(computeDepositFromAcceptedPrice('38 400 kr'), 7680);
  assert.equal(computeDepositFromAcceptedPrice(''), null);
});

test('slutfaktura = accepterat pris - deposition (80 %)', () => {
  assert.equal(computeFinalInvoiceAmount(38400, 7680), 30720);
  assert.equal(computeFinalInvoiceAmount(10000, null), 10000);
  assert.equal(computeFinalInvoiceAmount(''), null);
  // clampad ≥ 0 (aldrig negativ när deposition överstiger pris)
  assert.equal(computeFinalInvoiceAmount(5000, 8000), 0);
});

test('utestående balans = accepterat pris - deposition - betalt', () => {
  assert.equal(computeOutstandingBalance({ acceptedPrice: 38400, deposit: 7680, paid: 0 }), 30720);
  assert.equal(
    computeOutstandingBalance({ acceptedPrice: 38400, deposit: 7680, paid: 7680 }),
    23040
  );
  assert.equal(computeOutstandingBalance({ acceptedPrice: 38400, deposit: 7680, paid: 38400 }), 0);
  // ingen accepterad offert → okänd (null), aldrig en fejkad 0
  assert.equal(computeOutstandingBalance({ acceptedPrice: '', deposit: '', paid: 0 }), null);
});

test('buildFinalInvoiceSignal ger signal för accepterad behandlingsoffert', () => {
  const signal = buildFinalInvoiceSignal(
    { quoteStatus: 'accepted', quotedAmount: '38 400 kr', depositAmount: '7 680 kr' },
    { journalSignedAt: '2026-08-01T10:00:00Z', journalType: 'tp_treatment' }
  );
  assert.ok(signal, 'förväntade en signal');
  assert.match(signal.ruleId, /final_invoice_due/);
  assert.equal(signal.status, 'active');
  assert.equal(signal.metadata.invoiceAmount, 30720);
  assert.equal(signal.metadata.invoiceRatio, FINAL_INVOICE_RATIO);
  assert.match(signal.what, /slutfaktura/i);
  assert.match(signal.what, /30\s*720 kr/);
});

test('buildFinalInvoiceSignal ger ingen signal utan accepterad offert', () => {
  assert.equal(
    buildFinalInvoiceSignal({ quoteStatus: 'sent', quotedAmount: '38 400 kr' }, {}),
    null
  );
  assert.equal(buildFinalInvoiceSignal({ quoteStatus: 'accepted', quotedAmount: '' }, {}), null);
});

test('konstanter är korrekt relaterade (80 % = 1 - 20 %)', () => {
  assert.equal(DEPOSIT_RATIO, 0.2);
  assert.ok(Math.abs(FINAL_INVOICE_RATIO - 0.8) < 1e-9);
});

test('buildCommercialCaseReadout härleder depositAmount för accepterad offert', () => {
  const readout = buildCommercialCaseReadout({
    tenantId: 't',
    workspaceId: 'w',
    conversationId: 'c',
    customerId: 'p1',
    quoteStatus: 'accepted',
    commercialStatus: 'ready',
    quotedAmount: '38 400 kr',
  });
  assert.equal(readout.quoteStatus, 'accepted');
  // 20 % av 38 400 = 7 680
  assert.ok(/7\s*680 kr/.test(readout.depositAmount), `depositAmount=${readout.depositAmount}`);
});

test('isInFinalInvoiceWindow: sant inom 14 dagar före OP, falskt utanför', () => {
  const { isInFinalInvoiceWindow } = require('../../src/ops/ccoCommercialEconomics');
  const now = new Date('2026-08-11T10:00:00Z');
  // OP om 0 dagar (idag)
  assert.equal(isInFinalInvoiceWindow({ opDate: '2026-08-11', now }), true);
  // OP om 13 dagar
  assert.equal(isInFinalInvoiceWindow({ opDate: '2026-08-24', now }), true);
  // OP om 14 dagar (gräns)
  assert.equal(isInFinalInvoiceWindow({ opDate: '2026-08-25', now }), true);
  // OP om 15 dagar (utanför fönstret, gräns är 14)
  assert.equal(isInFinalInvoiceWindow({ opDate: '2026-08-26', now }), false);
  // OP om 16 dagar (utanför)
  assert.equal(isInFinalInvoiceWindow({ opDate: '2026-08-27', now }), false);
  // OP för länge sedan / i det förflutna
  assert.equal(isInFinalInvoiceWindow({ opDate: '2026-08-01', now }), false);
  // Saknas datum
  assert.equal(isInFinalInvoiceWindow({ opDate: '', now }), false);
});

test('buildFinalInvoiceSignalFromOp: bygger 80%-signal när OP är i fönstret', () => {
  const { buildFinalInvoiceSignalFromOp } = require('../../src/ops/ccoCommercialEconomics');
  const now = new Date('2026-08-11T10:00:00Z');
  const commercialCase = {
    quoteStatus: 'accepted',
    quoteAcceptedAt: '2026-08-01T00:00:00Z',
    quotedAmount: '38 400 kr',
    depositAmount: '7 680 kr',
  };
  const signal = buildFinalInvoiceSignalFromOp({
    opDate: '2026-08-24',
    commercialCase,
    now,
  });
  assert.ok(signal, 'förväntade signal i fönstret');
  assert.equal(signal.ruleId, 'customer.final_invoice_due');
  assert.equal(signal.metadata.invoiceAmount, 30720); // 80 % av 38400
  assert.equal(signal.metadata.opInDays, 13);
  assert.equal(signal.metadata.trigger, 'op_window');
  assert.match(signal.what, /OP om 13 dag/);
});

test('buildFinalInvoiceSignalFromOp: ingen signal utanför fönstret eller ej accepterad', () => {
  const { buildFinalInvoiceSignalFromOp } = require('../../src/ops/ccoCommercialEconomics');
  const now = new Date('2026-08-11T10:00:00Z');
  const commercialCase = {
    quoteStatus: 'accepted',
    quotedAmount: '38 400 kr',
    depositAmount: '7 680 kr',
  };
  // OP för långt bort
  assert.equal(buildFinalInvoiceSignalFromOp({ opDate: '2026-09-20', commercialCase, now }), null);
  // Ej accepterad
  assert.equal(
    buildFinalInvoiceSignalFromOp({
      opDate: '2026-08-24',
      commercialCase: { ...commercialCase, quoteStatus: 'draft' },
      now,
    }),
    null
  );
});

test('parseSekNumber: rimlighetsgrind — :-, tvetydigt komma, negativ', () => {
  const { parseSekNumber } = require('../../src/ops/ccoCommercialEconomics');
  // Svensk "12 500:-"-notation ska hanteras (var null).
  assert.equal(parseSekNumber('12 500:-'), 12500);
  // "38,400" är tvetydigt (38 400 kr ELLER 38,40 kr) — gissar inte, avvisar.
  assert.equal(parseSekNumber('38,400'), null);
  // Negativt belopp avvisas (aldrig en deposition < 0).
  assert.equal(parseSekNumber('-5000'), null);
  // Normala skrivsätt oförändrade.
  assert.equal(parseSekNumber('38 400 kr'), 38400);
  assert.equal(parseSekNumber('38.400 kr'), 38400);
  assert.equal(parseSekNumber('7 096,50'), 7096.5);
  assert.equal(parseSekNumber(38400), 38400);
  assert.equal(parseSekNumber(-5000), null);
});
