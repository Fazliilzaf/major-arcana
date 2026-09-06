'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-240 — portalen ska tåla ett ofullständigt svar, och löptexten ska gå att
 * läsa.
 *
 * Fyra fynd, alla mätta i Chromium med axe-core och egna mätningar. Vad som
 * INTE var trasigt är lika viktigt att skriva ner: axe-core rapporterade noll
 * regelbrott mot WCAG 2.1 AA, noll trångt radavstånd, noll rörelse utan
 * hänsyn, noll positiva tabindex och noll kontroller utan tillgängligt namn.
 * Det som återstod var detta:
 *
 * 1. TVÅ AVLÄSNINGAR SOM KRASCHADE I DRIFT.
 *    loadAudit och loadDelegation kontrollerade data.ok men dereferencerade
 *    data.entries respektive data.documents utan skydd. Ett svar med ok: true
 *    utan listan kastade TypeError. Sex andra ställen i samma fil läste redan
 *    sina listor med ?. — mönstret fanns, det var inte tillämpat överallt.
 *
 * 2. RADLÄNGD PÅ ~202 TECKEN.
 *    Åtta element, i .safety-notice, .hjalptext och .live-note. Läsbart spann
 *    är 45-75 tecken. Det är säkerhetsnotiser och hjälptext — de texter någon
 *    ska läsa noga — som var knappt tre gånger för breda.
 *
 * 3. NIO FÄRGDUBBLETTER.
 *    Av 101 rgba() var 64 vita glasöverlägg (legitima) och 3 nära svart. Åtta
 *    av de återstående var samma färg som en befintlig token, skriven för
 *    hand. De byttes; resten är en FRÄMMANDE PALETT och ett designbeslut, inte
 *    en städning — se noten längst ned.
 *
 * 4. SEXTON INLINE-STILAR.
 *    Två stannade med skäl, och ett tredje försök återställdes efter mätning.
 */

const ROT = path.join(__dirname, '..', '..');
const PORTAL = fs.readFileSync(path.join(ROT, 'public', 'staff-portal.html'), 'utf8');

/** Kommentarer bort före konstruktionsmätning. Femte gången regeln behövs. */
const KOD = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── §1 Robusthet mot ofullständiga svar ──────────────────────────────── */

test('T-101: inget API-svar dereferenceras utan ?.', () => {
  // Invarianten är heltäckande med flit. "Fixa de två" hade lämnat nästa
  // renderare fri att göra om felet; det här gör att en ny oskyddad avläsning
  // faller ut som ett rött test i stället för som ett TypeError hos en läkare.
  //
  // Kontexten mäts i RADER och inte i tecken. Första versionen tittade 340
  // tecken bakåt och missade ett av fyra skyddade ställen, eftersom raderna
  // emellan är mallsträngar på 400+ tecken — testet rapporterade ett fel som
  // inte fanns. Ett teckenfönster är en gissning om kodens form; en radräkning
  // är det inte.
  const rader = KOD.split('\n');
  const oskyddade = [];
  rader.forEach((rad, i) => {
    for (const m of rad.matchAll(/\bdata\.(\w+)\.(length|slice|map|forEach|filter|join)\b/g)) {
      const fore = rad.slice(Math.max(0, m.index - 3), m.index + 6 + m[1].length);
      if (fore.includes('?.')) continue;
      // Ternären "data.reviews?.length ? … data.reviews.slice(…)" är skyddad av
      // sitt eget villkor; samma sak för "if (data.items?.length) {" ovanför.
      const kontext = rader.slice(Math.max(0, i - 12), i + 1).join('\n');
      if (new RegExp(`data\\.${m[1]}\\?\\.length`).test(kontext)) continue;
      oskyddade.push(`rad ${i + 1}: data.${m[1]}.${m[2]}`);
    }
  });
  assert.deepEqual(
    oskyddade,
    [],
    `${oskyddade.length} oskyddad(e) avläsning(ar) av ett API-svar: ${oskyddade.join(', ')}`
  );
});

test('T-102: de två kända kraschställena är skyddade', () => {
  // Namngivna för att felmeddelandet ska peka på rätt funktion om någon
  // "förenklar" tillbaka.
  assert.match(KOD, /data\?\.ok && data\.entries\?\.length/, 'loadAudit är oskyddad igen');
  assert.match(
    KOD,
    /!data\?\.ok \|\| !data\.documents\?\.length/,
    'loadDelegation är oskyddad igen'
  );
});

/* ── §2 Läsbar radlängd ───────────────────────────────────────────────── */

test('T-201: löptextens bredd är EN token, inte tre värden', () => {
  assert.match(KOD, /--lopande-text:\s*\d+ch/, 'löptextbredden saknas som token');
});

test('T-202: måttet står i ch, inte i px', () => {
  // Ett ch är bredden på en nolla i elementets EGEN font-size, så gränsen
  // följer med när texten ändrar storlek. En px-gräns hade behövt räknas om
  // vid varje typografiändring och tyst blivit fel vid nästa.
  const m = KOD.match(/--lopande-text:\s*([^;]+);/);
  assert.ok(m, 'token saknas');
  assert.match(m[1].trim(), /^\d+ch$/, `måttet är "${m[1].trim()}" och inte i ch`);
  const ch = parseInt(m[1], 10);
  assert.ok(ch >= 45 && ch <= 80, `${ch}ch ligger utanför det läsbara spannet 45-75`);
});

test('T-203: de tre uppmätta klasserna använder token', () => {
  const i = KOD.indexOf('max-width: var(--lopande-text)');
  assert.notEqual(i, -1, 'token används inte av någon');
  const selektorer = KOD.slice(Math.max(0, i - 220), i);
  for (const k of ['.safety-notice', '.hjalptext', '.live-note']) {
    assert.ok(selektorer.includes(k), `${k} bär löptext men saknar bredd`);
  }
});

/* ── §3 Färg ──────────────────────────────────────────────────────────── */

test('T-301: --text2 är byggd av sin egen triplett', () => {
  // Samma mönster som --brand-rgb och de andra. Utan tripletten kan färgen
  // inte återanvändas med annan opacitet utan att skrivas av för hand, vilket
  // var precis hur dubbletten uppstod.
  const rot = KOD.slice(KOD.indexOf(':root {'), KOD.indexOf('}', KOD.indexOf(':root {')));
  assert.match(rot, /--text2-rgb:\s*\d+,\s*\d+,\s*\d+/, '--text2-rgb saknas');
  assert.match(rot, /--text2:\s*rgba\(var\(--text2-rgb\)/, '--text2 bygger inte på sin triplett');
});

test('T-302: ingen handskriven kopia av en tokenfärg vid låg opacitet', () => {
  // Bara låg opacitet mäts. Vid alfa över ~0,15 är en RGB-skillnad synlig och
  // därmed ett designbeslut som ska tas medvetet, inte städas bort av ett test.
  const TOKENS = {
    '--brand-rgb': [43, 37, 31],
    '--accent-rgb': [187, 71, 121],
    '--sage-rgb': [74, 130, 104],
    '--amber-rgb': [200, 130, 30],
    '--info-rgb': [74, 123, 168],
    '--danger-rgb': [185, 74, 74],
    '--violet-rgb': [124, 58, 237],
    '--text2-rgb': [70, 60, 50],
  };
  const dubbletter = [];
  for (const m of KOD.matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+)\s*\)/g)) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if (Number(m[4]) > 0.15) continue;
    for (const [namn, t] of Object.entries(TOKENS)) {
      const d = Math.hypot(r - t[0], g - t[1], b - t[2]);
      if (d < 8) dubbletter.push(`${m[0]} ≈ var(${namn}) (avstånd ${d.toFixed(1)})`);
    }
  }
  assert.deepEqual(
    dubbletter,
    [],
    `${dubbletter.length} handskriven kopia av en token vid låg opacitet:\n  ${dubbletter.join('\n  ')}`
  );
});

/* ── §4 Inline-stilar och kaskadordning ───────────────────────────────── */

test('T-401: högst fem inline style= finns kvar, och var och en har ett skäl', () => {
  // Siffran är mätt, inte gissad — första versionen av testet skrev "tre" och
  // blev röd av sin egen förväntan. De fem är:
  //   1-2  två per-instans-overrides av .img-grid (se noten i CSS:en om varför
  //        en klass antingen förlorar på källordning eller slår ut mobilen)
  //   3    samma override men genererad av JS med photos.length kolumner
  //   4    width:${percent}% — räknas ut vid rendering
  //   5    display:none på ett element vars synlighet JS sätter via style
  const kvar = [...PORTAL.matchAll(/\sstyle="([^"]{0,160})"/g)].map((m) => m[1]);
  assert.ok(kvar.length <= 5, `${kvar.length} inline-stilar kvar: ${kvar.join(' | ')}`);
  const text = kvar.join(' | ');
  assert.match(text, /width:\$\{/, 'den dynamiska procentbredden försvann');
  assert.match(text, /display:\s*none/, 'det JS-styrda dolda tillståndet försvann');
  assert.match(
    text,
    /grid-template-columns: repeat\(\d, 52px\)/,
    'bildrutnätets override försvann'
  );
  // Ingen av dem får vara en marginal eller en färg — det var precis den sorten
  // som skulle bort, och den sorten har inget skäl att stå inline.
  for (const s of kvar) {
    assert.ok(
      !/^\s*(margin|color|opacity|padding)\s*:/.test(s),
      `en marginal/färg står kvar inline: "${s}"`
    );
  }
});

test('T-402: nyttoklasserna står EFTER komponentreglerna', () => {
  // Det här testet finns för att felet gjordes. Första placeringen var högt
  // upp i filen, och två av sexton konverteringar förlorade tyst på
  // källordning: .doc-row åt upp .utan-avstand-under och .ord-field-val åt upp
  // .kursiv-notis färg. Inline-stilen hade vunnit; klassen gjorde det inte.
  // En nyttoklass som inte kan åsidosätta en komponent är inte en nyttoklass.
  const nytta = KOD.indexOf('.avstand-under {');
  assert.notEqual(nytta, -1, '.avstand-under saknas');
  for (const komponent of ['.doc-row {', '.ord-field-val {', '.ord-card {', '.item-card {']) {
    const i = KOD.indexOf(komponent);
    assert.notEqual(i, -1, `hittar inte ${komponent}`);
    assert.ok(i < nytta, `${komponent} deklareras EFTER nyttoklasserna och äter upp dem tyst`);
  }
});

test('T-403: MOTPROV — nyttoklasserna står FÖRE mediafrågorna', () => {
  // Andra riktningen av samma balans. Hamnar de efter mobilblocken vinner en
  // marginalklass över de responsiva reglerna, och layouten på telefon går
  // sönder utan att någon regel ser fel ut.
  const nytta = KOD.indexOf('.avstand-under {');
  const mobil = KOD.indexOf('@media (min-width: 641px)');
  assert.notEqual(mobil, -1, 'layout-mediafrågan saknas');
  assert.ok(nytta < mobil, 'nyttoklasserna slår ut mobilreglerna');
});

test('T-404: inga dubbla eller tomma class-attribut', () => {
  // ORD-231 lade class= på taggar som redan hade ett, och webbläsaren
  // ignorerar tyst det andra. 52 taggar var trasiga innan det upptäcktes.
  const dubbla = PORTAL.match(/<[^>]*\sclass="[^"]*"[^>]*\sclass="/g) || [];
  assert.deepEqual(dubbla, [], `${dubbla.length} tagg(ar) har två class-attribut`);
  const tomma = PORTAL.match(/\sclass=""/g) || [];
  assert.deepEqual(tomma, [], `${tomma.length} tomt/tomma class-attribut`);
});
