#!/usr/bin/env node
'use strict';

/**
 * Konvertera Handelsbanken kontotransaktioner (HTML-tabell-rader) till
 * CFO-kompatibelt Amex-CSV: Datum,Beskrivning,Belopp (MM/DD/YYYY).
 *
 * Kolumner i rådatan:
 *   [Kontor, Bokföringsdag, Reskontradag, Valutadag, Referens, Insättning/Uttag, Bokfört saldo]
 *
 * Handelsbanken använder:
 *   - negativt belopp = uttag (kostnad)
 *   - positivt belopp = insättning (intäkt/överföring in)
 * Amex-parsern i CFO förväntar sig motsatt tecken:
 *   - positivt belopp = charge (kostnad)
 *   - negativt belopp = credit (kredit/betalning in)
 * Därför inverteras beloppen.
 *
 * Filtrering:
 *   - Löneposter exkluderas (bör inte paras med kvitton).
 *   - Interna överföringar/investeringar exkluderas.
 *   - Insättningar (positivt ursprungsbelopp) exkluderas — de är inga utgifter.
 */

const fs = require('node:fs');
const path = require('node:path');

const EXCLUDE_DESCRIPTIONS = [/^lön\b/i, /^utlägg\b/i, /^investering$/i, /^hb kort$/i];

function shouldExclude(description) {
  return EXCLUDE_DESCRIPTIONS.some((re) => re.test(description));
}

function invertAmount(raw) {
  // Handelsbanken: space as thousands separator, comma as decimal.
  // Strip spaces, replace comma with dot, invert sign.
  const clean = String(raw || '')
    .replace(/[\u2212\u2013]/g, '-') // Unicode minus/en dash -> hyphen
    .replace(/[\s\u00a0]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return -n; // invert to Amex sign convention
}

function formatAmount(n) {
  // Always output with Swedish formatting (space thousands, comma decimal)
  // because parseSwedishAmount handles it best.
  const [intPart, decPart] = Math.abs(n).toFixed(2).split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = n < 0 ? '-' : '';
  return `${sign}${withSpaces},${decPart}`;
}

function convertDate(raw) {
  // YYYY-MM-DD -> MM/DD/YYYY
  const m = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function escapeCsvField(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Användning: node scripts/cfo/handelsbankenToAmex.js <raw.json> [out.csv]');
    process.exit(1);
  }
  const outputPath = process.argv[3] || inputPath.replace(/\.json$/i, '.csv');

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(raw.rows)) {
    throw new Error('raw.json måste ha en "rows"-array');
  }

  const included = [];
  const excluded = [];
  for (const row of raw.rows) {
    const [kontor, bokforingsdag, , , referens, belopp] = row;
    const amount = invertAmount(belopp);
    if (amount === null) {
      excluded.push({ reason: 'obegripligt belopp', row });
      continue;
    }
    if (amount <= 0) {
      // Original was positive (insättning) -> after invert credit. Skip.
      excluded.push({
        reason: 'insättning/intäkt',
        date: bokforingsdag,
        description: referens,
        amount,
      });
      continue;
    }
    if (shouldExclude(referens)) {
      excluded.push({
        reason: 'exkluderad beskrivning',
        date: bokforingsdag,
        description: referens,
        amount,
      });
      continue;
    }
    const date = convertDate(bokforingsdag);
    if (!date) {
      excluded.push({ reason: 'obegripligt datum', date: bokforingsdag, description: referens });
      continue;
    }
    included.push({ date, description: referens, amountSek: amount });
  }

  const lines = ['Datum,Beskrivning,Belopp'];
  for (const { date, description, amountSek } of included) {
    lines.push(`${date},${escapeCsvField(description)},${escapeCsvField(formatAmount(amountSek))}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');

  const sum = included.reduce((a, r) => a + r.amountSek, 0);
  console.log(`Inkluderade: ${included.length} rader (summa ${sum.toFixed(2)} SEK)`);
  console.log(`Exkluderade: ${excluded.length} rader`);
  console.log(`Skrev: ${outputPath}`);
}

main();
