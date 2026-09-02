'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { matProvenance, REPO_ROOT } = require('../../src/ops/nordbroProvenance');

/**
 * Inventariet påstod tre saker som inte längre var sanna, och ingen kontroll
 * mätte någon av dem:
 *
 *   1  offert_tp bar SAKNAS_FIL för en steg7-fil som lagts till en vecka
 *      tidigare (92fa859d, 2026-08-25).
 *   2  GRANSKNINGSKRAV beskrevs på tre olika sätt i tre filer. Ägaren fattade
 *      2026-09-01 ett beslut om flaggan mot en av beskrivningarna — den som
 *      bara stämde för de medicinska dokumenten.
 *   3  contentSource var ett enda ord. offert_prp_hair stod som "klinik" och
 *      offert_tp som "Nordbro", trots identisk juridisk kärna.
 *
 * Ett inventarium som ingen mäter blir en samling påståenden från den dag det
 * skrevs. Testet mäter dem.
 */

const INVENTARIUM = path.join(REPO_ROOT, 'src', 'ops', 'document-inventory.json');
const OVERSIKT = path.join(REPO_ROOT, 'public', 'major-arcana-preview', 'cco-dokument-v1.html');

const inv = JSON.parse(fs.readFileSync(INVENTARIUM, 'utf8'));

test('SAKNAS_FIL sitter bara på dokument vars filer faktiskt saknas', () => {
  const felaktiga = [];
  for (const d of inv.documents) {
    if (!(d.legalFlags || []).includes('SAKNAS_FIL')) continue;
    const filer = d.repoFiles || [];
    const saknade = filer.filter((f) => !fs.existsSync(path.join(REPO_ROOT, f)));
    if (filer.length > 0 && saknade.length === 0) {
      felaktiga.push(`${d.catalogId}: bär SAKNAS_FIL men alla ${filer.length} filer finns`);
    }
  }
  assert.deepEqual(
    felaktiga,
    [],
    'Flaggan säger att något saknas som finns. Den som läser översikten tror att ' +
      'ett dokument är ofullständigt och letar efter en fil som redan ligger där:\n' +
      felaktiga.map((f) => `  - ${f}`).join('\n')
  );
});

/**
 * Sju flaggor beskrevs olika i JSON och HTML redan innan någon tittade. De
 * flesta säger samma sak med andra ord — men det upptäcktes först när det här
 * testet skrevs, och ingen av dem har granskats mot vad flaggan faktiskt
 * betyder.
 *
 * Jag skriver inte om sju juridiska och medicinska formuleringar på eget
 * bevåg. GRANSKNINGSKRAV är rättad, för den fattades ett ägarbeslut mot
 * 2026-09-01 mot fel lydelse. Resten står här som synlig, avgränsad skuld:
 * listan får krympa, aldrig växa.
 */
const KAND_AVVIKELSE = [
  'PATIENTDATA',
  'GDPR',
  '14_DAG_FEL',
  '14_DAG_ANGERATT',
  '14_DAG_AVBOKNING',
  'SAKNAS_FIL',
  'SAKNAS_KALLA',
  'DELAD_FIL',
];

test('flaggbeskrivningarna i JSON och i översikten säger samma sak', () => {
  const html = fs.readFileSync(OVERSIKT, 'utf8');
  const avvikelser = [];

  for (const [flagga, text] of Object.entries(inv.flagLegend || {})) {
    // FLAG_META i HTML:en är JS-literaler; en beskrivning kan vara skarvad över
    // flera rader med +. Normalisera bort skarvarna innan jämförelsen.
    const block = html.match(
      new RegExp(`['"]?${flagga}['"]?\\s*:\\s*\\{[\\s\\S]*?\\n\\s*\\},`, 'm')
    );
    if (!block) continue; // flaggan visas inte i översikten — inget att jämföra

    const desc = block[0].match(/desc:\s*([\s\S]*?),\n\s*cls:/);
    if (!desc) {
      avvikelser.push(`${flagga}: hittar ingen desc i FLAG_META`);
      continue;
    }
    const iHtml = desc[1]
      .replace(/'\s*\+\s*\n\s*'/g, '')
      .replace(/^\s*'|'\s*$/g, '')
      .trim();

    if (iHtml !== text.trim()) {
      avvikelser.push(
        `${flagga} beskrivs olika:\n` + `      JSON:  ${text.trim()}\n` + `      HTML:  ${iHtml}`
      );
    }
  }

  const glidande = avvikelser.map((a) => a.split(' ')[0]).sort();
  const nya = glidande.filter((f) => !KAND_AVVIKELSE.includes(f));
  const lagade = KAND_AVVIKELSE.filter((f) => !glidande.includes(f));

  assert.deepEqual(
    nya,
    [],
    'En flaggbeskrivning har börjat glida isär mellan JSON och översikten. Samma ' +
      'flagga betyder då olika saker beroende på var man läser, och ett ägarbeslut ' +
      'fattas mot den beskrivning som råkar synas:\n' +
      avvikelser
        .filter((a) => nya.includes(a.split(' ')[0]))
        .map((a) => `  - ${a}`)
        .join('\n')
  );

  // Listan får bara krympa. Rättas en flagga ska raden bort härifrån, annars
  // blir listan en soptunna som växer tyst.
  assert.deepEqual(
    lagade,
    [],
    `Följande flaggor stämmer nu överens: ${lagade.join(', ')}. ` + 'Ta bort dem ur KAND_AVVIKELSE.'
  );
});

test('den nedskrivna proveniensen stämmer med vad filerna faktiskt bär', () => {
  const avvikelser = [];
  // Proveniens finns i två sorter. Nordbro-sorten räknar ordagranna meningar mot
  // ett juristdokument. Meridiq-sorten säger vilket questionary-id fälten kommer
  // ur — där finns inga meningar att räkna. Meningsräkningen nedan gäller bara
  // den första sorten; att köra den på den andra jämför tal mot undefined och
  // gör testet rött av fel skäl (hände 2026-09-02).
  const medProvenance = inv.documents.filter(
    (d) => d.provenance && typeof d.provenance.ordagrannaMeningar === 'number'
  );
  const medMeridiqProvenance = inv.documents.filter(
    (d) => d.provenance && typeof d.provenance.meridiqQuestionaryId === 'number'
  );

  assert.ok(
    medProvenance.length > 0,
    'Ingen post bär provenance. Antingen har fältet tagits bort, eller så har ' +
      'testet slutat hitta det — båda ska larma, inte passera tyst.'
  );

  assert.equal(
    inv.documents.filter((d) => d.provenance).length,
    medProvenance.length + medMeridiqProvenance.length,
    'En post bär provenance som varken är Nordbro-sorten (ordagrannaMeningar) ' +
      'eller Meridiq-sorten (meridiqQuestionaryId). Då mäter testet den inte alls. ' +
      'Lägg till sorten här istället för att låta den passera tyst.'
  );

  // Meridiq-sorten: fältetiketterna i filen ska komma ur det questionary som anges.
  for (const d of medMeridiqProvenance) {
    const fil = d.provenance.matFil || d.canonicalFile;
    const abs = fil && path.join(REPO_ROOT, fil);
    if (!abs || !fs.existsSync(abs)) {
      avvikelser.push(`${d.catalogId}: ${fil || '(ingen fil)'} finns inte`);
      continue;
    }
    const katalog = require(path.join(REPO_ROOT, 'migration/meridiq/journal-schema-catalog.json'));
    const schema = (katalog.schemas || katalog).find(
      (s) => s.meridiqQuestionaryId === d.provenance.meridiqQuestionaryId
    );
    if (!schema) {
      avvikelser.push(
        `${d.catalogId}: proveniensen anger Meridiq ${d.provenance.meridiqQuestionaryId}, ` +
          'men inget schema i journal-schema-catalog.json har det id:t.'
      );
      continue;
    }
    const falt = schema.sections.flatMap((s) => s.fields);
    if (falt.length !== d.provenance.faltAntal) {
      avvikelser.push(
        `${d.catalogId}: proveniensen säger ${d.provenance.faltAntal} fält, schemat har ${falt.length}.`
      );
    }
    const html = fs.readFileSync(abs, 'utf8');
    const saknade = falt.filter((f) => !html.includes(f.label)).map((f) => f.key);
    if (saknade.length) {
      avvikelser.push(
        `${d.catalogId}: fältetiketterna ${saknade.join(', ')} finns i Meridiq ` +
          `${d.provenance.meridiqQuestionaryId} men inte i ${fil}.`
      );
    }
  }

  for (const d of medProvenance) {
    const fil = d.provenance.matFil || d.canonicalFile;
    if (!fil) {
      avvikelser.push(`${d.catalogId}: provenance utan fil att mäta mot`);
      continue;
    }
    const abs = path.join(REPO_ROOT, fil);
    if (!fs.existsSync(abs)) {
      avvikelser.push(`${d.catalogId}: ${fil} finns inte`);
      continue;
    }

    const matt = matProvenance(abs);
    const p = d.provenance;

    if (matt.ordagranna !== p.ordagrannaMeningar) {
      avvikelser.push(
        `${d.catalogId}: inventariet säger ${p.ordagrannaMeningar} ordagranna ` +
          `Nordbro-meningar, filen bär ${matt.ordagranna}. Texten har ändrats ` +
          'sedan proveniensen skrevs.'
      );
    }
    if (matt.totalt !== p.totaltMeningar) {
      avvikelser.push(
        `${d.catalogId}: inventariet säger ${p.totaltMeningar} meningar totalt, ` +
          `filen bär ${matt.totalt}.`
      );
    }
    if (matt.dagar !== p.betanketidDagar) {
      avvikelser.push(
        `${d.catalogId}: inventariet pekar på ${p.betanketidDagar}-dagarsversionen, ` +
          `texten matchar ${matt.dagar} dagar bäst.`
      );
    }
    if (p.nordbroKalla && !fs.existsSync(path.join(REPO_ROOT, p.nordbroKalla))) {
      avvikelser.push(`${d.catalogId}: källfilen ${p.nordbroKalla} finns inte i repot`);
    }
  }

  assert.deepEqual(
    avvikelser,
    [],
    'Proveniensen påstår något om texten som inte längre stämmer. Det är precis ' +
      'så frågan "är den här texten godkänd?" får fel svar om ett halvår:\n' +
      avvikelser.map((a) => `  - ${a}`).join('\n')
  );
});
