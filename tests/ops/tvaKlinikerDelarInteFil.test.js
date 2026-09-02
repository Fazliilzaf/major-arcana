'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const inv = require('../../src/ops/document-inventory.json');
const registry = require('../../src/ops/ccoDocumentTypeRegistry.js');

/**
 * ORD-164 §4 — två kliniker får inte dela ett patientdokument.
 *
 * Det hände: friskfoers_curatiio_op och friskfoers_tp pekade båda på
 * steg8-friskforsakran-final.html. En patient inför ögonlocksplastik hade
 * signerat en försäkran om att hon förstår att HÅRSÄCKAR kanske inte överlever,
 * under Hair TP Clinics namn. Det enda som hindrade det var att Curatiios
 * dokument inte gick att signera — alltså en bugg, inte en spärr.
 *
 * `DELAD_FIL` fanns redan som flagga i inventariets flagLegend. Men en flagga
 * beskriver. Den fäller ingen. Raden bar flaggan i månader.
 *
 * FÖRSTA VERSIONEN AV DET HÄR TESTET VAR TANDLÖS (2026-09-02). Den läste
 * katalogens `clinic` (singular). Auktoriteten är `clinics` (array) — 32 av 62
 * rader har den, och `resolveTypeClinics` föredrar den. Mutationstestet var
 * grönt när det skulle ha varit rött, och jag höll på att skriva "godkänt" på
 * en grind som inte grep. Testet läser nu registret, inte råfältet.
 *
 * Delning INOM samma publik är tillåten och förekommer: ett dokument kan vara
 * två tillfällen i kundresan (förberedelse + eftervård), eller två rättsliga
 * instrument på samma samtyckessida. Regeln är att klinikuppsättningarna ska
 * vara IDENTISKA — inte bara överlappa. ["hairtp"] och ["hairtp","curatiio"]
 * överlappar, men den ena raden vänder sig till en publik den andra inte når.
 */

/**
 * Kontaktblocket är den entydiga varumärkessignalen i ett patientdokument.
 * Curatiio: contact@curatiio.com · 031-88 22 44.
 * Hair TP:  contact@hairtpclinic.com · 031-88 11 66.
 *
 * Att räkna ordet "Curatiio" duger inte: tre av sidorna nämner båda
 * varumärkena en gång var och är genuint gemensamma. Första försöket 2026-09-02
 * gjorde just det och pekade ut dem som fel.
 */
const KONTAKT_CURATIIO =
  /contact@curatiio\.com|info@curatiio\.com|031[\s–-]*88[\s]*22[\s]*44|031-882244/gi;
const KONTAKT_HAIRTP = /contact@hairtpclinic\.com|031[\s–-]*88[\s]*11[\s]*66|031-881166/gi;

/**
 * Dokument som är registrerade på båda klinikerna men vars kontaktblock bara
 * bär den ena klinikens uppgifter. Mätt 2026-09-02, alla tre är riktiga fynd:
 *
 *   friskfoers_curatiio_op   2 Curatiio-kontakter, 0 Hair TP — men registrerad
 *                            på båda. ORD-164 gick ut på att dokumentet är
 *                            Curatiios; registreringen säger fortfarande båda.
 *
 *   samtycke_bokning_2d      0 Curatiio-kontakter, 5 Hair TP. En Curatiio-patient
 *   samtycke_angerratt       som bokar inom två dagar signerar alltså ett
 *                            samtycke om betänketid och ångerrätt där bara Hair
 *                            TP Clinic står som avsändare och mottagare.
 *
 * Ingen av dem rättar jag själv. Att ändra registreringen är ett ägarbeslut
 * (ORD-165: en tenant eller två). Att ändra kontaktuppgifterna i ett
 * samtyckesdokument är juridisk text — den frågan går till Nordbro tillsammans
 * med de sex Hair TP-avtal som redan visat sig bära contact@curatiio.com.
 *
 * Listan är bunden och FÅR BARA KRYMPA. En ny rad här fäller testet.
 */
const VANTAR_PA_AGARBESLUT = Object.freeze([
  'friskfoers_curatiio_op',
  'samtycke_bokning_2d',
  'samtycke_angerratt',
]);

function klinikerFor(catalogId) {
  const typ = registry.getDocumentTypeById(catalogId);
  return typ ? registry.resolveTypeClinics(typ) : null;
}

function nyckel(kliniker) {
  return [...kliniker].sort().join('+');
}

function filTillRader() {
  const perFil = new Map();
  for (const d of inv.documents) {
    for (const fil of d.repoFiles || []) {
      if (!perFil.has(fil)) perFil.set(fil, []);
      perFil.get(fil).push({ catalogId: d.catalogId, kliniker: klinikerFor(d.catalogId) });
    }
  }
  return perFil;
}

test('varje inventariepost finns i dokumenttypsregistret med minst en klinik', () => {
  const utan = inv.documents
    .filter((d) => {
      const k = klinikerFor(d.catalogId);
      return !k || k.length === 0;
    })
    .map((d) => d.catalogId);

  assert.deepEqual(
    utan,
    [],
    'Utan klinik kan delningstestet nedan inte avgöra något om de här raderna — ' +
      'de skulle passera tyst:\n  ' +
      utan.join('\n  ')
  );
});

test('två olika klinikpublik delar inte samma dokumentfil', () => {
  const brott = [];
  for (const [fil, rader] of filTillRader()) {
    const nycklar = new Set(rader.map((r) => nyckel(r.kliniker)));
    if (nycklar.size > 1) {
      brott.push(
        `${fil}\n      ` +
          rader.map((r) => `${nyckel(r.kliniker)} · ${r.catalogId}`).join('\n      ')
      );
    }
  }

  assert.deepEqual(
    brott,
    [],
    'Dokumentfiler som delas mellan olika klinikpublik. En patient hos den ena ' +
      'signerar då den andras text, under den andras namn:\n  ' +
      brott.join('\n  ')
  );
});

test('ett dokument med bara en kliniks kontaktuppgifter är inte registrerat på båda', () => {
  const nya = [];
  const lagade = [];

  for (const d of inv.documents) {
    const kliniker = klinikerFor(d.catalogId);
    if (!kliniker || kliniker.length < 2) continue;
    if (!d.canonicalFile) continue;
    const abs = path.join(REPO_ROOT, d.canonicalFile);
    if (!fs.existsSync(abs)) continue;

    const text = fs.readFileSync(abs, 'utf8');
    const curatiio = (text.match(KONTAKT_CURATIIO) || []).length;
    const hairtp = (text.match(KONTAKT_HAIRTP) || []).length;
    // Utan kontaktblock alls säger filen ingenting om varumärke — då mäter vi inte.
    const ensidig = curatiio > 0 !== hairtp > 0;

    const kant = VANTAR_PA_AGARBESLUT.includes(d.catalogId);
    if (ensidig) {
      if (!kant) {
        nya.push(
          `${d.catalogId} (${nyckel(kliniker)}) — Curatiio-kontakt ${curatiio} ggr, ` +
            `Hair TP-kontakt ${hairtp} ggr: ${d.canonicalFile}`
        );
      }
    } else if (kant) {
      lagade.push(d.catalogId);
    }
  }

  assert.deepEqual(
    nya,
    [],
    'Nytt dokument registrerat på båda klinikerna men med bara en kliniks ' +
      'kontaktuppgifter. Antingen är registreringen fel, eller så ska ' +
      'kontaktblocket bära båda:\n  ' +
      nya.join('\n  ')
  );

  assert.deepEqual(
    lagade,
    [],
    `Följande stämmer nu: ${lagade.join(', ')}. Ta bort dem ur VANTAR_PA_AGARBESLUT — ` +
      'listan får bara krympa.'
  );
});

test('delning inom samma publik är tillåten men måste vara nedskriven', () => {
  const odokumenterade = [];
  for (const [fil, rader] of filTillRader()) {
    if (rader.length < 2) continue;
    const ids = rader.map((r) => r.catalogId);
    for (const d of inv.documents.filter((x) => ids.includes(x.catalogId))) {
      const flaggor = d.legalFlags || [];
      const not = d.notes || '';
      const forklarad =
        flaggor.includes('DELAD_FIL') ||
        /delar (HTML-)?fil|två tillfällen|samma (sida|dokument)/i.test(not);
      if (!forklarad) odokumenterade.push(`${d.catalogId} delar ${fil} men säger inte varför`);
    }
  }

  assert.deepEqual(
    odokumenterade,
    [],
    'En delad fil utan förklaring blir till ett beslut om det ena dokumentet som ' +
      'tyst gäller det andra:\n  ' +
      odokumenterade.join('\n  ')
  );
});

test('filerna som pekas ut finns på disk', () => {
  const saknade = [];
  for (const fil of filTillRader().keys()) {
    if (!fs.existsSync(path.join(REPO_ROOT, fil))) saknade.push(fil);
  }
  assert.deepEqual(
    saknade,
    [],
    'repoFiles pekar på filer som inte finns:\n  ' + saknade.join('\n  ')
  );
});

test('testet mäter faktiskt något — inte en tom uppsättning', () => {
  const perFil = filTillRader();
  assert.ok(
    perFil.size >= 50,
    `Bara ${perFil.size} filer joinades. Om repoFiles eller registret byter form ` +
      'tystnar testet istället för att larma.'
  );

  const publik = new Set();
  for (const rader of perFil.values()) for (const r of rader) publik.add(nyckel(r.kliniker));
  assert.ok(
    publik.size >= 2,
    `Registret känner bara till publiken ${[...publik].join(', ')}. Med en enda ` +
      'publik kan delningstestet aldrig bli rött.'
  );

  // Grinden ska verkligen gripa: konstruera fallet den finns för.
  const konstruerat = new Map([
    [
      'delad.html',
      [
        { catalogId: 'a', kliniker: ['hairtp'] },
        { catalogId: 'b', kliniker: ['hairtp', 'curatiio'] },
      ],
    ],
  ]);
  const nycklar = new Set([...konstruerat.values()][0].map((r) => nyckel(r.kliniker)));
  assert.equal(
    nycklar.size,
    2,
    'Regeln känner inte igen ["hairtp"] mot ["hairtp","curatiio"] som olika publik. ' +
      'Det var precis det hålet som gjorde första versionen av testet tandlös.'
  );
});
