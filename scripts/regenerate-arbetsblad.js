#!/usr/bin/env node
'use strict';

/**
 * Regenererar underlag-per-tjanst-ARBETSBLAD.csv ur tjänstekatalogen.
 *
 * Regeln (ORD-135/137/138/139):
 *   - En rad per TJÄNST SOM INTE ÄRVER (reviewable). Ärvda tjänster får
 *     sitt underlag från huvudtjänsten och ska INTE vara i bladet.
 *   - Dokumentkolumnerna är journal-/process-dokumenten (inte auto-utskick).
 *   - Befintliga x/?-svar bevaras; nya tjänster ärvas som "?"-förslag från
 *     en malltjänst.
 *
 * Default: dry-run (rapporterar, skriver inget). `--write` skriver bladet.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ARBETSLAD = path.join(ROOT, 'docs', 'workflow', 'underlag-per-tjanst-ARBETSBLAD.csv');
const SERVICE_CATALOG = path.join(ROOT, 'src', 'ops', 'cco-service-catalog.json');
const INHERITANCE = path.join(ROOT, 'src', 'ops', 'cco-service-inheritance.json');

// Nya tjänster (ORD-137 §9) ärver "?"-mönstret från en malltjänst.
const NEW_SERVICE_TEMPLATE = Object.freeze({
  'cco-btx5': '7382', // Rynkbehandling BTX 5 -> Botox: 1 område
  'cco-filler1ml': '7378', // Filler 1 ml -> Fillers: Läppar 1 ml
});

function splitRow(line) {
  return String(line)
    .replace(/^\uFEFF/, '')
    .split(';')
    .map((cell) => cell.trim());
}

function asServices(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.services)) return raw.services;
  return [];
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(SERVICE_CATALOG, 'utf8'));
  const services = asServices(catalog).filter((s) => s.apiId != null);

  const inheritance = JSON.parse(fs.readFileSync(INHERITANCE, 'utf8'));
  const inherited = new Set(Object.keys(inheritance.inheritsFrom || {}));

  // Nuvarande blad — bevara x/?-svar.
  const raw = fs.readFileSync(ARBETSLAD, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const oldHeader = splitRow(lines[0]);
  const oldDocCols = oldHeader.filter((h) => h.toLowerCase() !== 'serviceid' && h.toLowerCase() !== 'varumarke' && h.toLowerCase() !== 'tjanst' && h.toLowerCase() !== 'pris' && h !== '');
  const oldRows = new Map();
  for (const line of lines.slice(1)) {
    const cells = splitRow(line);
    if (!cells[0]) continue;
    oldRows.set(cells[0], cells);
  }

  // Dokumentkolumner: befintliga + journal_estetik_follow (ORD-139 §1).
  const docCols = [...oldDocCols];
  if (!docCols.includes('journal_estetik_follow')) docCols.push('journal_estetik_follow');

  // Tjänster att gå igenom = katalogens tjänster minus ärvda.
  const reviewable = services.filter((s) => !inherited.has(String(s.apiId)));

  const header = ['serviceId', 'varumarke', 'tjanst', 'pris', ...docCols];
  const outRows = [];

  for (const s of reviewable) {
    const serviceId = String(s.apiId);
    const existing = oldRows.get(serviceId);
    let cells;
    if (existing) {
      // Behåll befintliga x/?-svar; fyll i saknade kolumner (ny kolumn) med "".
      const oldCells = existing.slice(4); // efter de fyra identitetskolumnerna
      cells = docCols.map((_, i) => (oldCells[i] ?? ''));
    } else {
      // Ny tjänst: kopiera "?"-mönstret från malltjänsten.
      const templateId = NEW_SERVICE_TEMPLATE[serviceId];
      const template = templateId ? oldRows.get(templateId) : null;
      const tplCells = template ? template.slice(4) : [];
      cells = docCols.map((_, i) => (tplCells[i] ?? '?'));
    }
    const identity = [
      serviceId,
      typeof s.brand === 'string' ? s.brand.trim() : '',
      typeof s.name === 'string' ? s.name.trim() : '',
      typeof s.price === 'string' ? s.price.trim() : String(s.price ?? ''),
    ];
    outRows.push([...identity, ...cells]);
  }

  const body = outRows.map((cells) => cells.join(';')).join('\n');
  const csv = `\uFEFF${header.join(';')}\n${body}\n`;

  const write = process.argv.includes('--write');
  const qCount = body.split('').filter((ch) => ch === '?').length;
  console.log(`Bladet: ${reviewable.length} tjänster (reviewable) · ${docCols.length} dokument · ${inherited.size} ärvda exkluderade · ${qCount} ?`);
  const added = reviewable.filter((s) => !oldRows.has(String(s.apiId))).map((s) => s.apiId);
  const removed = [...oldRows.keys()].filter((id) => inherited.has(id));
  console.log(`  Nya rader: ${added.length > 0 ? added.join(', ') : 'inga'}`);
  console.log(`  Borttagna (ärvda): ${removed.length > 0 ? removed.join(', ') : 'inga'}`);

  if (!write) {
    console.log('\nDRY-RUN — kör med --write för att skriva bladet.');
    return;
  }
  fs.writeFileSync(ARBETSLAD, csv, 'utf8');
  console.log(`\nSkrev ${ARBETSLAD}`);
}

main();
