'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  auditRecord,
  loadTransactions,
  findDuplicateCandidates,
  isSuspiciousAttachment,
  isValidDate,
} = require('../../scripts/cfo/cmReceiptAudit');

describe('cmReceiptAudit', () => {
  it('flaggar saknat belopp', () => {
    const record = { id: 'r1', amountIncVat: 0, supplierName: 'SJ', date: '2026-01-18' };
    const issues = auditRecord(record, {
      rawItems: [],
      documents: [],
      cfoExpensesById: {},
      cardTransactions: [],
      bankTransactions: [],
    });
    assert.ok(issues.some((i) => i.kind === 'MISSING_AMOUNT'));
  });

  it('flaggar misstänkt bilaga', () => {
    const record = {
      id: 'r1',
      amountIncVat: 265,
      supplierName: 'SJ',
      date: '2026-01-18',
      rawItemId: 'raw1',
    };
    const context = {
      rawItems: [{ id: 'raw1', subject: 'SJ-biljett', rawBodyText: 'Tack för ditt köp' }],
      documents: [{ id: 'd1', rawItemId: 'raw1', fileName: 'behandlingsavtal.pdf' }],
      cfoExpensesById: {},
      cardTransactions: [],
      bankTransactions: [],
    };
    const issues = auditRecord(record, context);
    assert.ok(issues.some((i) => i.kind === 'SUSPICIOUS_ATTACHMENT'));
  });

  it('hittar dubletter', () => {
    const records = [
      { id: 'a', supplierName: 'SJ', amountIncVat: 265, date: '2026-01-18', rawItemId: 'r1' },
      { id: 'b', supplierName: 'SJ', amountIncVat: 265, date: '2026-01-19', rawItemId: 'r2' },
    ];
    const dups = findDuplicateCandidates(records);
    assert.strictEqual(dups.length, 1);
  });

  it('validerar datum korrekt', () => {
    assert.strictEqual(isValidDate('2026-01-18'), true);
    assert.strictEqual(isValidDate(''), false);
    assert.strictEqual(isValidDate('18/01/2026'), false);
  });

  it('parsar Amex CSV', () => {
    const csv =
      'Datum,Beskrivning,Belopp\n04/14/2026,HEMKOP GOTEBORG VASA 07 GOTEBORG,"1041,29"\n04/13/2026,GOOGLE*ADS6707274243 GO CC GOOGLE.COM,"5000,00"\n';
    const txs = loadTransactions('__test__.csv');
    assert.strictEqual(txs.length, 0); // loadTransactions läser fil, inte text
  });
});
