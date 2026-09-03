#!/usr/bin/env node
'use strict';

/**
 * Konvertera Handelsbanken HTML-tabellrader (JSON) till Handelsbanken-CSV
 * som cfoBankReconciliation.parseHandelsbankenCsv förväntar sig:
 *   sep=;
 *   header med 19+ kolumner (;-separerade)
 *   kolumner:
 *     0  Kontohavare
 *     1  Kontonummer
 *     2  IBAN
 *     3  BIC
 *     4  Kontotyp
 *     5  Valuta
 *     6-8 (tomma/ifyllda platshållare)
 *     9  Bokföringsdag
 *     10 Reskontradag
 *     11 Valutadag
 *     12 Referens
 *     13 Insättning/Uttag (belopp)
 *     14 Bokfört saldo
 *     15 Aktuellt saldo
 *     16 Valutadagssaldo
 *     17 Swish-referens
 *     18 Swish-sändare
 *
 * Teckenkonvention:
 *   Handelsbanken använder negativt tecken för uttag, positivt för insättning.
 *   cfoBankReconciliation behåller samma tecken (negativ = utgift/expense).
 */

const fs = require('node:fs');
const path = require('node:path');

const HEADERS = [
  'Kontohavare',
  'Kontonummer',
  'IBAN',
  'BIC',
  'Kontotyp',
  'Valuta',
  'Reserverad1',
  'Reserverad2',
  'Reserverad3',
  'Bokföringsdag',
  'Reskontradag',
  'Valutadag',
  'Referens',
  'Insättning/Uttag',
  'Bokfört saldo',
  'Aktuellt saldo',
  'Valutadagssaldo',
  'Swish referens',
  'Swish sändare',
];

function escapeField(value) {
  const s = String(value ?? '');
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Användning: node scripts/cfo/handelsbankenToBankCsv.js <raw.json> [out.csv]');
    process.exit(1);
  }
  const outputPath = process.argv[3] || inputPath.replace(/\.json$/i, '-bank.csv');

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(raw.rows)) {
    throw new Error('raw.json måste ha en "rows"-array');
  }

  // Fast kontoinformation från sidan där datan hämtades.
  const accountHolder = raw.accountHolder || 'HAIR TP CLINIC GBG AB';
  const accountNumber = raw.accountNumber || '558 698 131';
  const iban = raw.iban || 'SE81 6000 0000 0005 5869 8131';
  const bic = raw.bic || 'HANDSESS';
  const accountType = raw.accountType || 'Affärskonto';
  const currency = raw.currency || 'SEK';
  const currentBalance = raw.currentBalance || '2 971 882,74';
  const valueBalance = raw.valueBalance || '2 971 882,74';

  const lines = ['sep=;', HEADERS.map(escapeField).join(';')];
  for (const row of raw.rows) {
    const [kontor, bokforingsdag, reskontradag, valutadag, referens, belopp, bokfortSaldo] = row;
    const cols = [
      accountHolder,
      accountNumber,
      iban,
      bic,
      accountType,
      currency,
      '', // Reserverad1
      '', // Reserverad2
      '', // Reserverad3
      bokforingsdag,
      reskontradag,
      valutadag,
      referens,
      belopp,
      bokfortSaldo,
      currentBalance,
      valueBalance,
      '', // Swish referens
      '', // Swish sändare
    ];
    lines.push(cols.map(escapeField).join(';'));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\r\n') + '\r\n', 'utf8');
  console.log(`Skrev ${raw.rows.length} rader till ${outputPath}`);
}

main();
