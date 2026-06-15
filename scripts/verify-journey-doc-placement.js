#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(repoRoot, 'src/ops/hairtp-document-types.catalog.json');
const resolverPath = path.join(
  repoRoot,
  'public/major-arcana-preview/app/cco-journey-doc-resolver.js'
);
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const allowedCards = new Set([
  'bokning',
  'halsa',
  'behandling',
  'juridik',
  'operation',
  'foto',
  'uppfoljning',
  'ekonomi',
  'anteckningar_policy',
]);

const expectedPrimaryCounts = {
  bokning: 4,
  halsa: 7,
  behandling: 9,
  juridik: 3,
  operation: 4,
  foto: 1,
  uppfoljning: 4,
  ekonomi: 1,
  anteckningar_policy: 3,
};

const offerIds = new Set([
  'offert_tp',
  'offert_prp_hair',
  'offert_prp_skin',
  'offert_microneedling',
  'offert_prf',
  'offert_profilo',
]);

const errors = [];
const types = Array.isArray(catalog.types) ? catalog.types : [];
const primaryCounts = Object.fromEntries(Array.from(allowedCards).map((card) => [card, 0]));

function stableStep(value) {
  return Array.isArray(value) ? value.join('+') : String(value);
}

function hasCard(row, card) {
  return Array.isArray(row.uiCards) && row.uiCards.includes(card);
}

if (types.length !== 36) {
  errors.push(`Expected 36 document types, got ${types.length}`);
}

for (const row of types) {
  const label = `${row.number || '?'}:${row.id || '(missing id)'}`;
  if (!row.id) errors.push(`${label} missing id`);
  if (!Number.isInteger(row.number)) errors.push(`${label} missing numeric number`);
  if (!row.uiCard) errors.push(`${label} missing uiCard`);
  if (!allowedCards.has(row.uiCard)) errors.push(`${label} has invalid uiCard ${row.uiCard}`);
  if (!Array.isArray(row.uiCards) || !row.uiCards.length) errors.push(`${label} missing uiCards`);
  for (const card of row.uiCards || []) {
    if (!allowedCards.has(card)) errors.push(`${label} has invalid uiCards entry ${card}`);
  }
  if (row.journeyStepDisplay === undefined) errors.push(`${label} missing journeyStepDisplay`);
  if (row.journeyStepAction === undefined) errors.push(`${label} missing journeyStepAction`);
  if (!row.actionKind) errors.push(`${label} missing actionKind`);
  if (!row.uiLayerA) errors.push(`${label} missing uiLayerA`);
  if (row.hiddenFromRegistryDefault !== true)
    errors.push(`${label} must set hiddenFromRegistryDefault=true`);
  if (row.uiCard && primaryCounts[row.uiCard] !== undefined) primaryCounts[row.uiCard] += 1;

  if (offerIds.has(row.id)) {
    if (row.journeyStep !== 7) errors.push(`${label} offer catalog journeyStep must stay 7`);
    if (row.journeyStepDisplay !== 5) errors.push(`${label} offer journeyStepDisplay must be 5`);
    if (row.journeyStepAction !== 7) errors.push(`${label} offer journeyStepAction must be 7`);
    if (!hasCard(row, 'behandling')) errors.push(`${label} offer missing behandling uiCard`);
    if (!hasCard(row, 'juridik')) errors.push(`${label} offer missing juridik uiCard`);
  }
}

for (const [card, expected] of Object.entries(expectedPrimaryCounts)) {
  if (primaryCounts[card] !== expected) {
    errors.push(`Primary card ${card} expected ${expected}, got ${primaryCounts[card]}`);
  }
}

try {
  const vm = require('vm');
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(resolverPath, 'utf8'), context, {
    filename: resolverPath,
  });
  const resolver = context.window.CcoJourneyDocResolver;
  if (!resolver) {
    errors.push('Resolver did not attach window.CcoJourneyDocResolver');
  } else {
    for (const fn of [
      'resolveActiveFlow',
      'resolvePatientJourneyStep',
      'uiCardForStep',
      'filterOffersByFlow',
      'listDocsForUiCard',
      'railStatusLine',
    ]) {
      if (typeof resolver[fn] !== 'function') errors.push(`Resolver missing ${fn}()`);
    }
    if (typeof resolver?.uiCardForStep === 'function') {
      const expectedCards = {
        2: 'bokning',
        3: 'halsa',
        4: 'halsa',
        5: 'behandling',
        6: 'juridik',
        7: 'juridik',
        8: 'operation',
        9: 'foto',
      };
      for (const [step, card] of Object.entries(expectedCards)) {
        if (resolver.uiCardForStep(step) !== card) {
          errors.push(`Resolver uiCardForStep(${step}) expected ${card}`);
        }
      }
    }
    if (typeof resolver?.filterOffersByFlow === 'function') {
      const offers = [{ registryId: 'offert_tp' }, { registryId: 'offert_prp_hair' }];
      const prp = resolver.filterOffersByFlow(offers, 'prp_hair');
      if (prp.length !== 1 || prp[0].registryId !== 'offert_prp_hair') {
        errors.push('Resolver filterOffersByFlow(prp_hair) did not select PRP offer');
      }
    }
  }
} catch (error) {
  errors.push(`Resolver compatibility check failed: ${error.message}`);
}

if (errors.length) {
  console.error('ORD-47 journey doc placement verify: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('ORD-47 journey doc placement verify: PASS');
console.log(`catalog types: ${types.length}/36`);
console.log(
  `ui metadata: ${types.filter((row) => row.uiCard && row.journeyStepDisplay !== undefined && row.journeyStepAction !== undefined).length}/36`
);
console.log(`offer 5/7 split: PASS (${types.filter((row) => offerIds.has(row.id)).length}/6)`);
console.log('primary card coverage:');
for (const [card, count] of Object.entries(primaryCounts)) {
  console.log(`- ${card}: ${count} docs`);
}
console.log('journey display coverage:');
const byDisplay = new Map();
for (const row of types) {
  const key = stableStep(row.journeyStepDisplay);
  byDisplay.set(key, (byDisplay.get(key) || 0) + 1);
}
for (const [step, count] of Array.from(byDisplay.entries()).sort(([a], [b]) =>
  a.localeCompare(b, 'sv')
)) {
  console.log(`- ${step}: ${count} docs`);
}
