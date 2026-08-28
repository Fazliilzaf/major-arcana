#!/usr/bin/env node
'use strict';

/**
 * Importerar serviceIds-kopplingarna ur arbetsbladet
 * (underlag-per-tjanst-ARBETSBLAD.csv) till katalogen
 * (hairtp-document-types.catalog.json).
 *
 * Semantik (Fazlis bedömning, ej gissning):
 *   - 'x' → tjänsten kräver dokumentet → serviceId läggs i dokumentets `serviceIds`.
 *   - '?' → obesvarat förslag → ignoreras (behandlas INTE som ja).
 *   - tom → nej → ignoreras.
 *
 * Default: dry-run (rapporterar vad som skulle skrivas, skriver inget).
 * `--write` → skriver katalogen.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ARBETSLAD =
  process.env.UNDERLAG_PER_TJANST_CSV ||
  path.join(ROOT, 'docs', 'workflow', 'underlag-per-tjanst-ARBETSBLAD.csv');
const CATALOG = path.join(ROOT, 'src', 'ops', 'hairtp-document-types.catalog.json');
const INHERITANCE = path.join(ROOT, 'src', 'ops', 'cco-service-inheritance.json');

const IDENTITY_COLUMNS = new Set(['serviceid', 'varumarke', 'tjanst', 'pris']);

function loadInheritedIds() {
  try {
    const t = JSON.parse(fs.readFileSync(INHERITANCE, 'utf8'));
    return new Set(Object.keys(t.inheritsFrom || {}));
  } catch {
    return new Set();
  }
}

function splitRow(line) {
  return String(line)
    .replace(/^\uFEFF/, '') // BOM
    .split(/[;,\t]/)
    .map((cell) => cell.trim());
}

function main() {
  const raw = fs.readFileSync(ARBETSLAD, 'utf8');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    console.error('Arbetsbladet är tomt.');
    process.exit(1);
  }

  const header = splitRow(lines[0]);
  const docCols = [];
  header.forEach((h, i) => {
    if (IDENTITY_COLUMNS.has(h.toLowerCase())) return;
    docCols.push({ index: i, id: h });
  });

  const serviceIdsByDoc = new Map(docCols.map((c) => [c.id, []]));

  let xCount = 0;
  let qCount = 0;
  let reviewedCount = 0; // rader utan något ? kvar (= genomgångna)
  const unfinished = []; // rader med ? kvar (tjanst-namn)
  let inheritedCount = 0; // ärvda (ORD-135) — räknas inte som obesvarade
  const inheritedIds = loadInheritedIds();
  for (const line of lines.slice(1)) {
    const cells = splitRow(line);
    const serviceId = cells[0];
    if (!serviceId) continue;
    if (inheritedIds.has(serviceId)) {
      // Ärvd tjänst: underlaget kommer från huvudtjänsten, inte från bladet.
      // ? här räknas INTE som obesvarat.
      inheritedCount += 1;
      continue;
    }
    let hasQuestion = false;
    for (const col of docCols) {
      const cell = (cells[col.index] || '').toLowerCase();
      if (cell === 'x') {
        serviceIdsByDoc.get(col.id).push(serviceId);
        xCount += 1;
      } else if (cell === '?') {
        qCount += 1;
        hasQuestion = true;
      }
    }
    if (hasQuestion) {
      unfinished.push(cells[2] || serviceId);
    } else {
      reviewedCount += 1;
    }
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const write = process.argv.includes('--write');

  const totalReviewable = lines.length - 1 - inheritedCount;
  console.log(
    `Arbetsblad: ${lines.length - 1} tjänster · ${docCols.length} dokument · ${xCount} x · ${qCount} ? · ${inheritedCount} ärvda`
  );
  console.log(
    `Genomgånget: ${reviewedCount} av ${totalReviewable} tjänster helt genomgångna · ${unfinished.length} har ? kvar`
  );
  if (unfinished.length) {
    console.log(`  Första oavslutade: ${unfinished.slice(0, 8).join(' · ')}`);
  }

  let changed = 0;
  for (const [docId, serviceIds] of serviceIdsByDoc) {
    const row = (catalog.types || []).find((t) => t.id === docId);
    if (!row) {
      console.log(`  ⚠ ${docId}: saknas i katalogen`);
      continue;
    }
    const before = JSON.stringify(row.serviceIds || []);
    const after = JSON.stringify(serviceIds);
    if (before !== after) {
      console.log(`  ${docId}: ${before} → ${after} (${serviceIds.length} tjänster)`);
      if (write) row.serviceIds = serviceIds;
      changed += 1;
    }
  }

  if (!write) {
    console.log(
      `\nDRY-RUN — ${changed} dokument skulle uppdateras. Kör med --write för att skriva.`
    );
    return;
  }

  // Skriv med bevarat format: ersätt varje dokuments `serviceIds`-rad via en
  // id-förankrad regex i stället för att re-serialisera hela filen (som skulle
  // expandera inline-arrayer och skapa en massiv diff).
  let text = fs.readFileSync(CATALOG, 'utf8');
  let written = 0;
  for (const [docId, serviceIds] of serviceIdsByDoc) {
    const row = (catalog.types || []).find((t) => t.id === docId);
    if (!row) continue;
    const oldArr = JSON.stringify(row.serviceIds || []);
    const newArr = JSON.stringify(serviceIds);
    if (oldArr === newArr) continue;
    const re = new RegExp(`("id": "${docId}",[\\s\\S]*?"serviceIds": )\\[[^\\]]*\\]`, 'm');
    const replaced = text.replace(re, `$1${newArr}`);
    if (replaced !== text) {
      text = replaced;
      written += 1;
    }
  }
  fs.writeFileSync(CATALOG, text, 'utf8');
  console.log(`\nSkrev katalogen: ${written} dokument uppdaterade.`);
}

main();
