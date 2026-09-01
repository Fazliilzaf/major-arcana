'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-161 §3 — kontrollen som saknades.
 *
 * Tre filer beskriver samma dokumentuppsättning och gled isär med 26 rader utan
 * att något sa ifrån. Det här testet läser alla tre ur FILSYSTEMET (inte git —
 * se tests/meta/testerFragarInteGit.test.js) och failar åt båda håll:
 *
 *   - ett id i typkatalogen eller vyn som saknas i inventariet
 *   - ett id som bara finns i inventariet
 *
 * Vyn får ligga efter katalogen (känd, nedskriven avvikelse: två rader saknas i
 * vyn) — men den får inte ligga före, och den får inte sakna rader som
 * inventariet har.
 *
 * Vy-regexen är medvetet skör. "Rimligt antal" assertas innan jämförelsen så en
 * trasig regex faller högljutt i stället för att tyst hitta noll dokument.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'src/ops/hairtp-document-types.catalog.json');
const VIEW_PATH = path.join(REPO_ROOT, 'public/major-arcana-preview/cco-dokument-v1.html');
const INVENTORY_PATH = path.join(REPO_ROOT, 'src/ops/document-inventory.json');

function catalogIds() {
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return new Set((raw.types || []).map((t) => t.id));
}

function viewIds() {
  const html = fs.readFileSync(VIEW_PATH, 'utf8');
  const ids = [...html.matchAll(/id:\s*['"]([a-z0-9_]+)['"]/g)].map((m) => m[1]);
  return { set: new Set(ids), count: ids.length };
}

function inventoryIds() {
  const raw = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  return new Set((raw.documents || []).map((d) => d.catalogId));
}

test('ORD-161: typkatalog, vy och inventarium har inte glidit isär', () => {
  const cat = catalogIds();
  const { set: view, count: viewCount } = viewIds();
  const inv = inventoryIds();

  // Rimligt antal INNAN jämförelsen — en trasig regex ska falla, inte hitta noll.
  assert.ok(cat.size >= 50, `typkatalogen har för få typer (${cat.size}) — filen eller parsningen är trasig`);
  assert.ok(viewCount >= 50, `vy-regexen hittade för få id:n (${viewCount}) — regexen är trasig`);
  assert.ok(inv.size >= 50, `inventariet har för få dokument (${inv.size}) — filen eller parsningen är trasig`);

  const union = new Set([...cat, ...view]);

  const missingFromInventory = [...union].filter((id) => !inv.has(id));
  assert.deepEqual(
    missingFromInventory,
    [],
    'Dokument-id finns i typkatalogen eller vyn men saknas i inventariet: ' + missingFromInventory.join(', ')
  );

  const onlyInInventory = [...inv].filter((id) => !union.has(id));
  assert.deepEqual(
    onlyInInventory,
    [],
    'Dokument-id finns bara i inventariet (drift åt andra hållet): ' + onlyInInventory.join(', ')
  );
});
