#!/usr/bin/env node
'use strict';

/**
 * measure-ord160-plats-prod — ORD-160 punkt 1: används deliveryMode='plats' i
 * prod, och hur många av dem är ögonlocksplastik (bleph)?
 *
 * Read-only. Skriver inget. Läser en kopia av behandlingsavtals-filen och
 * räknar. Körs av den som har prod-filen — t.ex. via Render-shell
 * (`cat /var/data/cco-treatment-agreements.json` → lokal fil) eller på servern.
 *
 * Usage: node scripts/measure-ord160-plats-prod.js [--file <path>]
 *   default: data/cco-treatment-agreements.json
 *
 * OBS bleph-detektionen är heuristisk: storen slänger `serviceId` (det är
 * §4-fyndet), så vi matchar på treatmentType/offerType/templateId i stället.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILE = path.join(ROOT, 'data', 'cco-treatment-agreements.json');

function readArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}

function asArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.agreements)) return raw.agreements;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

const BLEPH_RE = /bleph|ögonlock|ogonlock|eyelid|ogonlocksplastik/i;

function isBleph(agreement = {}) {
  const hay = [
    agreement.treatmentType,
    agreement.offerType,
    agreement.templateId,
    agreement.patientName,
  ]
    .filter(Boolean)
    .join(' ');
  return BLEPH_RE.test(hay);
}

function main() {
  const file = readArg('file') || DEFAULT_FILE;
  if (!fs.existsSync(file)) {
    console.error(`FEL: filen "${file}" finns inte.`);
    console.error('Ladda ner prod-filen (data/cco-treatment-agreements.json) eller ange --file.');
    process.exit(2);
  }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const agreements = asArray(raw);

  const byMode = {};
  let blephTotal = 0;
  let blephPlats = 0;
  const blephPlatsSamples = [];

  for (const a of agreements) {
    const mode = String(a.deliveryMode || 'plats').trim();
    byMode[mode] = (byMode[mode] || 0) + 1;
    if (isBleph(a)) {
      blephTotal += 1;
      if (mode === 'plats') {
        blephPlats += 1;
        if (blephPlatsSamples.length < 10) {
          blephPlatsSamples.push({
            patientId: String(a.patientId || '').slice(0, 8),
            treatmentType: a.treatmentType || '',
            offerType: a.offerType || '',
          });
        }
      }
    }
  }

  console.log(`ORD-160 punkt 1 · mätning mot ${file}`);
  console.log(`totalt avtal: ${agreements.length}`);
  console.log(`deliveryMode-fördelning: ${JSON.stringify(byMode)}`);
  console.log(`ögonlocksplastik (bleph, heuristik): ${blephTotal}`);
  console.log(`  varav plats: ${blephPlats}`);
  if (blephPlats > 0) {
    console.log('AKUT: plats-signerad ögonlocksplastik kan accepteras utan betänketid.');
    console.log('exempel:');
    for (const s of blephPlatsSamples) console.log(`  ${JSON.stringify(s)}`);
  } else {
    console.log('LATENT: ingen plats-signerad ögonlocksplastik — grinden är fel men ingen drabbad ännu.');
  }
}

main();
