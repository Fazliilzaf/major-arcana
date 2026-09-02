'use strict';

/**
 * Dokumentvakt — bevisar att patientdokumentens filer FINNS, inte bara att de
 * är registrerade. Dokumenten (samtycken, avtal, hälsodeklarationer) är
 * juridiskt kritiska: en raderad/omdöpt fil får inte passera CI tyst.
 *
 * Vaktar tre saker:
 *   1. Varje dokument i live-registret löser till en fil som existerar på disk.
 *   2. Signeringsregistret (E8) och personalregistret (E9) pekar bara på
 *      dokument som finns i live-registret.
 *   3. Dokumentöversikten (cco-dokument-v1.html) och live-registret listar
 *      exakt samma dokument-id:n, och sidans fil-länkar pekar på filer som finns.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildCatalogedManifest,
  resolveLiveDocumentAbsolutePath,
  listStaffLiveRegistryIds,
  STATIC_HTML_BY_REGISTRY,
} = require('../../src/ops/patientDocumentLiveRegistry');
const { buildSignManifest } = require('../../src/ops/patientDocumentSignRegistry');

const REPO_ROOT = path.join(__dirname, '..', '..');
const OVERVIEW_PAGE = path.join(
  REPO_ROOT,
  'public',
  'major-arcana-preview',
  'cco-dokument-v1.html'
);

function liveIds() {
  return buildCatalogedManifest().map((row) => row.registryId);
}

function parseOverviewDocs() {
  const html = fs.readFileSync(OVERVIEW_PAGE, 'utf8');
  const block = html.match(/const DOCS = \[([\s\S]*?)\n {6}\];/);
  assert.ok(block, 'cco-dokument-v1.html: DOCS-arrayen hittades inte');
  const entries = block[1].split(/\n {8}\{/).slice(1);
  return entries.map((entry) => ({
    id: (entry.match(/id: '([^']+)'/) || [])[1],
    file: (entry.match(/file: '([^']+)'/) || [])[1] || null,
  }));
}

test('live-registrets alla dokument löser till filer som existerar på disk', () => {
  const rows = buildCatalogedManifest();
  assert.ok(rows.length >= 36, `oväntat få dokument i live-registret: ${rows.length}`);
  const missing = [];
  for (const row of rows) {
    const abs = resolveLiveDocumentAbsolutePath(row.registryId);
    if (!abs || !fs.existsSync(abs)) {
      missing.push(`${row.registryId} → ${abs || '(ingen sökväg)'}`);
    }
  }
  assert.deepEqual(missing, [], `dokumentfiler saknas på disk:\n${missing.join('\n')}`);
});

test('signeringsregistret (E8) pekar bara på dokument som finns i live-registret', () => {
  const live = new Set(liveIds());
  const unknown = buildSignManifest()
    .map((row) => row.registryId)
    .filter((id) => !live.has(id));
  assert.deepEqual(unknown, [], `E8-dokument utanför live-registret: ${unknown.join(', ')}`);
});

test('personalregistret (E9) pekar bara på dokument som finns i live-registret', () => {
  const live = new Set(liveIds());
  const unknown = listStaffLiveRegistryIds().filter((id) => !live.has(id));
  assert.deepEqual(unknown, [], `E9-dokument utanför live-registret: ${unknown.join(', ')}`);
});

test('dokumentöversikten och live-registret listar exakt samma dokument', () => {
  const pageIds = parseOverviewDocs()
    .map((d) => d.id)
    .filter(Boolean)
    .sort();
  const registryIds = liveIds().slice().sort();
  assert.deepEqual(pageIds, registryIds, 'cco-dokument-v1.html och live-registret har glidit isär');
});

test('dokumentöversiktens fil-länkar pekar på filer som existerar', () => {
  const broken = parseOverviewDocs()
    .filter((d) => d.file)
    .filter((d) => !fs.existsSync(path.join(REPO_ROOT, 'public', 'major-arcana-preview', d.file)))
    .map((d) => `${d.id} → ${d.file}`);
  assert.deepEqual(broken, [], `brutna fil-länkar i dokumentöversikten:\n${broken.join('\n')}`);
});

/**
 * ORD-164 — en flagga som beskriver ett problem utan att stoppa det är inte en
 * kontroll. `DELAD_FIL` fanns i flagLegend men fällde inget; två kliniker kunde
 * peka på samma friskförsäkran (Hair TP:s text om hårsäckar) utan att något sa
 * ifrån. Det här testet fäller när två live-registerposter med OLIKA klinik
 * delar fil.
 *
 * Kliniken härleds ur katalogens `flowApplies` — inte ur id-namnet och inte ur
 * `clinic`-fältet (båda är opålitliga för Curatiio). "tp" är Hair TP, "all" är
 * delad och inte en konflikt, allt annat är Curatiio.
 */
function catalogFlowApplies() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'src/ops/hairtp-document-types.catalog.json'), 'utf8')
  );
  return new Map((raw.types || []).map((t) => [t.id, t.flowApplies || []]));
}

function clinicOf(flowApplies) {
  const flows = Array.isArray(flowApplies) ? flowApplies : [];
  if (flows.includes('all')) return 'shared';
  if (flows.includes('tp')) return 'hair_tp';
  return 'curatiio';
}

test('två registerposter med olika klinik delar inte fil (ORD-164)', () => {
  const flowById = catalogFlowApplies();
  const byFile = new Map();
  for (const [id, file] of Object.entries(STATIC_HTML_BY_REGISTRY)) {
    const f = typeof file === 'string' ? file : file.file;
    const clinic = clinicOf(flowById.get(id));
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push({ id, clinic });
  }

  const conflicts = [];
  for (const [file, entries] of byFile.entries()) {
    if (entries.length < 2) continue;
    const clinics = new Set(entries.map((e) => e.clinic));
    if (clinics.has('hair_tp') && clinics.has('curatiio')) {
      conflicts.push(`${file}: ${entries.map((e) => e.id).join(', ')}`);
    }
  }
  assert.deepEqual(conflicts, [], `två kliniker delar dokumentfil:\n${conflicts.join('\n')}`);
});
