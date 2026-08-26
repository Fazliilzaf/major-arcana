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
