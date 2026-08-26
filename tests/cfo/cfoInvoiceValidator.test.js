'use strict';

// ORD-117 · Tester för bilagevalideringen.
const test = require('node:test');
const assert = require('node:assert/strict');

// Mocka pdf-parse så vi kan mata kontrollerad text.
let currentMockPdfText = '';
function mockPdfText(text) {
  currentMockPdfText = text;
}
const pdfParsePath = require.resolve('pdf-parse');
delete require.cache[pdfParsePath];
require.cache[pdfParsePath] = {
  id: pdfParsePath,
  filename: pdfParsePath,
  loaded: true,
  exports: async () => ({ text: currentMockPdfText }),
};

const {
  validatePdfAttachment,
  supplierMatches,
  extractAmountCandidates,
  extractDateCandidates,
} = require('../../src/cfo/cfoInvoiceValidator');

test('validatePdfAttachment: godkänner faktura som stämmer med transaktion', async () => {
  mockPdfText('Faktura från Meta\nDatum: 2026-08-11\nAtt betala: 7 096,00 kr\n');
  const result = await validatePdfAttachment({
    buffer: Buffer.from('x'),
    tx: { description: 'FACEBK *FOO', amountSek: 7096, date: '2026-08-11' },
  });
  assert.equal(result.ok, true);
  assert.ok(result.score >= 0.75);
  assert.ok(result.reasons.includes('amount_ok'));
  assert.ok(result.reasons.includes('date_ok'));
});

test('validatePdfAttachment: avvisar patientdokument', async () => {
  mockPdfText('Behandlingsavtal\nPatient: Anna Andersson\nDatum: 2026-08-11\n');
  const result = await validatePdfAttachment({
    buffer: Buffer.from('x'),
    tx: { description: 'FACEBK *FOO', amountSek: 7096, date: '2026-08-11' },
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.startsWith('strong_reject_signal')));
});

test('validatePdfAttachment: avvisar fel belopp', async () => {
  mockPdfText('Faktura från Meta\nDatum: 2026-08-11\nAtt betala: 1 000,00 kr\n');
  const result = await validatePdfAttachment({
    buffer: Buffer.from('x'),
    tx: { description: 'FACEBK *FOO', amountSek: 7096, date: '2026-08-11' },
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('amount_mismatch'));
});

test('validatePdfAttachment: avvisar fel leverantör', async () => {
  mockPdfText('Faktura från Apple\nDatum: 2026-08-11\nAtt betala: 7 096,00 kr\n');
  const result = await validatePdfAttachment({
    buffer: Buffer.from('x'),
    tx: { description: 'FACEBK *FOO', amountSek: 7096, date: '2026-08-11' },
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.startsWith('supplier_mismatch')));
});

test('supplierMatches: träffar Meta mot FACEBK-beskrivning', () => {
  const result = supplierMatches('Meta Platforms Ireland Ltd', 'FACEBK *FOO');
  assert.equal(result.matches, true);
});

test('supplierMatches: avvisar fel leverantör', () => {
  const result = supplierMatches('Apple Inc', 'FACEBK *FOO');
  assert.equal(result.matches, false);
});

test('extractAmountCandidates: hittar svenska belopp', () => {
  const candidates = extractAmountCandidates('Att betala: 7 096,00 kr. Total 1.234,56.');
  assert.ok(candidates.includes(7096));
  assert.ok(candidates.includes(1234.56));
});

test('extractDateCandidates: hittar ISO- och europeiska datum', () => {
  const candidates = extractDateCandidates('Datum: 2026-08-11 och 12/08/2026.');
  assert.ok(candidates.includes('2026-08-11'));
  assert.ok(candidates.includes('2026-08-12'));
});
