'use strict';

/**
 * ORD-121 · Kundöversiktens tre avvikelser mot facit.
 *
 * De tre render-funktionerna ligger privata i patient-master-ui.js IIFE och
 * testas inte via DOM:stubbar utan genom att extrahera de rena hjälparna ur
 * källan och evaluera dem (samma mönster som övriga public-tester men med en
 * lokalt avgränsad funktionsbrytning). Det validerar det som faktiskt
 * renderar siffrorna — LTV-nämnaren, k-formatet och veckoetiketterna — mot
 * facits mått.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..', '..');
const source = fs.readFileSync(
  path.join(repoRoot, 'public', 'major-arcana-preview', 'app', 'patient-master-ui.js'),
  'utf8'
);

function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`helper not found: ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
  }
  return src.slice(start, i);
}

const helpers = [
  'formatMetricNumber',
  'formatV10CompactSek',
  'isoWeekNumber',
  'buildWeekAxisLabels',
  'resolveV9AggregateLtv',
].map((n) => extractFunction(source, n));

const sandbox = { console, Math, Number, Date };
vm.createContext(sandbox);
vm.runInContext(
  helpers.join('\n') +
    '\n;this.__api={formatV10CompactSek,isoWeekNumber,buildWeekAxisLabels,resolveV9AggregateLtv};',
  sandbox
);
const { formatV10CompactSek, isoWeekNumber, buildWeekAxisLabels, resolveV9AggregateLtv } =
  sandbox.__api;

test('ORD-121 · Avvikelse 1: "Snitt LTV" är k-format per accepterad kund', () => {
  // Facit = 24,8k. Summan av accepterade offerter är exakt mångfald av
  // accepterat antal, så snittet blir heltal och k-format.
  const stats = {
    commercialRevenueTotal: 496000,
    commercialAcceptedCount: 20,
    totalPatients: 7823,
  };
  const ltv = resolveV9AggregateLtv(stats, {});
  assert.equal(ltv.hasData, true);
  assert.equal(ltv.value, '24,8k');
});

test('ORD-121 · Avvikelse 1: acceptedCount används, inte hela registrets nedspädning', () => {
  // Den gamla nämnaren (hela registret) gav "96" utan enhet — en tiofaldigt för
  // liten siffra. Med samma total men acceptedCount-nämnare ska värdet vara
  // k-format och klart större än nedspädningen över hela registret.
  const total = 496000;
  const perAccepted = resolveV9AggregateLtv(
    { commercialRevenueTotal: total, commercialAcceptedCount: 20, totalPatients: 7823 },
    {}
  );
  assert.equal(perAccepted.hasData, true);
  assert.equal(perAccepted.value, '24,8k');

  const diluted = Math.round(total / 7823);
  assert.ok(diluted < 1000, `expected whole-register dilution to be small, got ${diluted}`);
});

test('ORD-121 · Avvikelse 1: ingen kommersiell intäkt -> "Intäkt ej kopplad"', () => {
  const ltv = resolveV9AggregateLtv({ commercialRevenueTotal: 0, totalPatients: 7823 }, {});
  assert.equal(ltv.hasData, false);
  assert.equal(ltv.value, '—');
  assert.equal(ltv.trend, 'Intäkt ej kopplad');
});

test('ORD-121 · Avvikelse 3: veckoetiketter är riktiga v.NN, inte relativa v-N', () => {
  const labels = buildWeekAxisLabels(12);
  assert.match(labels, /^<span>v\.\d+<\/span><span>v\.\d+<\/span><span>v\.\d+<\/span>$/);
  // Inga relativa "v-4"-etiketter kvar.
  assert.doesNotMatch(labels, /v-4|v-2|v-1/);
});

test('ORD-121 · Avvikelse 3: isoWeekNumber ger giltig ISO-vecka (1–53)', () => {
  const week = isoWeekNumber(new Date('2026-08-26T12:00:00Z'));
  assert.ok(week >= 1 && week <= 53, `expected ISO week 1..53, got ${week}`);
});

test('ORD-121 · k-format: 24 800 kr -> "24,8k"', () => {
  assert.equal(formatV10CompactSek(24800), '24,8k');
});
