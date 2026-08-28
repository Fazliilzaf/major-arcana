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

const IDENTITY_COLUMNS = new Set(['serviceid', 'varumarke', 'tjanst', 'pris']);

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
  for (const line of lines.slice(1)) {
    const cells = splitRow(line);
    const serviceId = cells[0];
    if (!serviceId) continue;
    for (const col of docCols) {
      const cell = (cells[col.index] || '').toLowerCase();
      if (cell === 'x') {
        serviceIdsByDoc.get(col.id).push(serviceId);
        xCount += 1;
      } else if (cell === '?') {
        qCount += 1;
      }
    }
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const write = process.argv.includes('--write');

  console.log(
    `Arbetsblad: ${lines.length - 1} tjänster · ${docCols.length} dokument · ${xCount} x · ${qCount} ?`
  );

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
