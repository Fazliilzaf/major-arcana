'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const reg = require('../../src/ops/patientDocumentLiveRegistry');

/**
 * ORD-157 — betänketiden i avtalen mäts mot Nordbros källfiler, inte mot en
 * kopia i det här testet.
 *
 * Bakgrunden: ögonlocksplastik är ett kirurgiskt ingrepp och kräver enligt lag
 * 2021:363 minst sju dagars betänketid. Avtalet angav två. Felet syntes inte i
 * någon kontroll — det hittades för att någon råkade jämföra dokumenten.
 *
 * Testet läser meningen ur .docx-filerna under docs/legal/nordbro/ och kräver
 * att repots HTML bär exakt samma sträng. En kopia i testet hade bara flyttat
 * problemet: då kan källan ändras utan att något säger ifrån.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');
const NORDBRO = path.join(REPO_ROOT, 'docs', 'legal', 'nordbro');

// Ägarbeslut 2026-09-01: kirurgi får sju dagar, allt annat två.
const KIRURGISKA = new Set(['offert_op']);

const OFFERTER = [
  'offert_tp',
  'offert_prp_hair',
  'offert_prp_skin',
  'offert_botox',
  'offert_filler',
  'offert_op',
  'offert_ortopedi',
];

/** Plockar ut löptexten ur en .docx utan externa beroenden. */
function docxText(fil) {
  const xml = execFileSync('unzip', ['-p', fil, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function betanketidsmening(fil) {
  const t = docxText(fil);
  const m = t.match(/Tjänsteutövaren tillämpar betänketid[^.]*\.[^.]*\./);
  assert.ok(m, `hittade ingen betänketidsmening i ${path.basename(fil)}`);
  return m[0].replace(/\s+/g, ' ').trim();
}

function repoText(registryId) {
  const html = fs.readFileSync(reg.resolveLiveDocumentAbsolutePath(registryId), 'utf8');
  return html.replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
}

test('källfilerna finns och skiljer sig på exakt en mening', () => {
  const tva = path.join(NORDBRO, '2025-12-03-behandlingsavtal-dhi-2-dagar.docx');
  const sju = path.join(NORDBRO, '2025-12-03-behandlingsavtal-dhi-7-dagar.docx');
  assert.ok(fs.existsSync(tva), 'tvådagarsversionen saknas i docs/legal/nordbro/');
  assert.ok(fs.existsSync(sju), 'sjudagarsversionen saknas i docs/legal/nordbro/');

  const a = docxText(tva).split(' ');
  const b = docxText(sju).split(' ');
  assert.equal(a.length, b.length, 'versionerna ska ha samma längd');
  const skiljer = a.filter((ord, i) => ord !== b[i]);
  // "två (2)" mot "sju (7)" — två ord skiljer, inget annat.
  assert.deepEqual(skiljer, ['två', '(2)'], `oväntad skillnad: ${skiljer.join(' ')}`);
});

test('varje avtal bär rätt betänketid, ordagrant ur Nordbros källa', () => {
  const meningar = {
    2: betanketidsmening(path.join(NORDBRO, '2025-12-03-behandlingsavtal-dhi-2-dagar.docx')),
    7: betanketidsmening(path.join(NORDBRO, '2025-12-03-behandlingsavtal-dhi-7-dagar.docx')),
  };

  const fel = [];
  for (const id of OFFERTER) {
    let html;
    try {
      html = repoText(id);
    } catch {
      continue; // dokumentet saknas i registret — fångas av andra tester
    }
    const forvantad = KIRURGISKA.has(id) ? 7 : 2;
    const oforvantad = forvantad === 7 ? 2 : 7;

    if (!html.includes(meningar[forvantad])) {
      fel.push(
        `${id}: saknar ${forvantad}-dagarsmeningen` +
          (html.includes(meningar[oforvantad])
            ? ` — har ${oforvantad} dagar i stället`
            : ' — ingen matchande mening alls')
      );
    }
  }

  assert.deepEqual(
    fel,
    [],
    'Betänketid som inte stämmer med lag 2021:363 (7 dagar kirurgi, 2 dagar injektioner):\n' +
      fel.map((f) => `  - ${f}`).join('\n')
  );
});

test('ögonlocksplastiken är det enda avtalet med sju dagar', () => {
  const sju = betanketidsmening(path.join(NORDBRO, '2025-12-03-behandlingsavtal-dhi-7-dagar.docx'));
  const medSju = OFFERTER.filter((id) => {
    try {
      return repoText(id).includes(sju);
    } catch {
      return false;
    }
  });
  assert.deepEqual(
    medSju,
    ['offert_op'],
    'Bara kirurgi ska ha sju dagars betänketid (ägarbeslut 2026-09-01)'
  );
});
