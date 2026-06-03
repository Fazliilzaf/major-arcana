#!/usr/bin/env node
'use strict';

/**
 * P0 gate: Hair TP canonical 9-step kundresa + 2d betänketid.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const CODE_PATHS = [
  'src/ops/ccoTreatmentAgreementStore.js',
  'src/ops/ccoOfferEsign.js',
  'src/ops/ccoOfferTemplateStore.js',
  'src/ops/ccoHairTpCoolingOffPolicy.js',
  'src/routes/ccoTreatmentAgreement.js',
  'src/routes/ccoCommercial.js',
  'public/cco-kunder-real.js',
  'public/cco-kunder-mobil-real.js',
  'src/ops/ccoKunderEnrichment.js',
].filter((rel) => fs.existsSync(path.join(ROOT, rel)));

const CONFIG_PATH = 'config/cco-treatment-document-requirements.json';

const DOC_PATHS = [
  'docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md',
  'docs/strategy/CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md',
  'docs/strategy/CCO-KUNDRESA-FAZLI-PLAN-MAPPING-2026-06-03.md',
  'docs/strategy/CCO-SMART-NEXT-STEP-UX-SPEC-V2-9-STEG-2026-06-03.md',
];

let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

function readSafe(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function scanCode(rel, text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line) || /legacy|superseded|ogiltig/i.test(line)) continue;
    if (/coolingOffDays:\s*14\b/.test(line)) fail(`${rel}:${i + 1}: coolingOffDays: 14`);
    if (/DEFAULT_COOLING_OFF_DAYS\s*=\s*14/.test(line))
      fail(`${rel}:${i + 1}: DEFAULT_COOLING_OFF_DAYS = 14`);
    if (/id:\s*['"]missing_form['"]/.test(line)) fail(`${rel}:${i + 1}: segment missing_form`);
    if (/case\s+['"]missing_form['"]/.test(line))
      fail(`${rel}:${i + 1}: matchSegment missing_form`);
    if (/T-48h.*frisk|friskförsäkran.*T-48/i.test(line))
      fail(`${rel}:${i + 1}: T-48 friskförsäkran`);
  }
}

function scanConfig(text) {
  for (const key of ['fue', 'dhi']) {
    const block = text.match(new RegExp(`"${key}":\\s*\\{[\\s\\S]*?\\n    \\},`));
    if (block && /deadlineHoursBefore":\s*48/.test(block[0])) {
      fail(`config: ${key} fitness_certificate still has deadlineHoursBefore 48`);
    }
  }
  const fue = text.match(/"fue":\s*\{[\s\S]*?"coolingOffDays":\s*(\d+)/);
  const dhi = text.match(/"dhi":\s*\{[\s\S]*?"coolingOffDays":\s*(\d+)/);
  if (!fue || fue[1] !== '2') fail('config: fue.coolingOffDays must be 2');
  if (!dhi || dhi[1] !== '2') fail('config: dhi.coolingOffDays must be 2');
}

function scanDocs(rel, text) {
  if (!/Betänketid.*2 dag|2 dagar.*betänke/i.test(text)) {
    fail(`${rel}: must document 2-day betänketid`);
  }
  if (!/missing_health_declaration/.test(text)) {
    fail(`${rel}: must reference missing_health_declaration`);
  }
}

console.log('== verify-kundresa-canonical-9-step ==\n');

const policy = readSafe('src/ops/ccoHairTpCoolingOffPolicy.js');
if (!policy || !/HAIR_TP_COOLING_OFF_DAYS/.test(policy) || !/return 2;/.test(policy)) {
  fail('ccoHairTpCoolingOffPolicy.js missing or wrong default');
} else {
  pass('ccoHairTpCoolingOffPolicy.js (2d default)');
}

for (const rel of CODE_PATHS) {
  const text = readSafe(rel);
  if (!text) fail(`missing: ${rel}`);
  else scanCode(rel, text);
}

const cfg = readSafe(CONFIG_PATH);
if (!cfg) fail(`missing: ${CONFIG_PATH}`);
else scanConfig(cfg);

for (const rel of DOC_PATHS) {
  const text = readSafe(rel);
  if (!text) fail(`missing: ${rel}`);
  else scanDocs(rel, text);
}

const registry = readSafe('docs/strategy/CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md');
if (registry && !/missing_agreement_consent_bundle/.test(registry)) {
  fail('registry missing bundle rule');
}

console.log('');
if (failed > 0) {
  console.error(`== ${failed} failure(s) ==`);
  process.exit(1);
}
console.log('== All checks passed ==');
