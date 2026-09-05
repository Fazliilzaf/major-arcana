'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-239 — personalportalen ska fungera i handen, inte bara på skärm.
 *
 * BAKGRUNDEN, ÄRLIGT: jag påstod att fyra brytpunkter var för lite för 48
 * sektioner. Mätningen motbevisade mig. Mobilblocket under 640px skriver om 45
 * selektorer, och alla tre breda gridar täcks. Rubriken var en gissning klädd
 * som en siffra.
 *
 * Så portalen renderades i Chromium på 375x812, 360x740 och 768x1024 med
 * hasTouch. Layouten höll — noll horisontell scroll, noll element utanför
 * viewporten. Två andra saker höll inte:
 *
 * 1. NIO DEKLARATIONER PÅ 9-9,5px. ORD-231 höjde brödtext under 11px men
 *    undantog versaletiketter medvetet. Undantaget höll på en 27-tums skärm
 *    och inte i handen. Bland dem: .pill (statuspillret) och .nav-section.
 *
 * 2. TRETTIOTVÅ TRÄFFYTOR UNDER 44x44. Läkarens .ordination-mode-btn var 34px
 *    hög, rollknapparna 32, hamburgaren 36x36. Alla klarar WCAG 2.5.8 AA
 *    (24x24). Ingen nådde 2.5.5 AAA:s 44x44, och 44 är måttet på en tumme.
 *
 * Testerna nedan mäter INVARIANTER, inte de enskilda värdena — annars måste
 * testet skrivas om varje gång någon lägger till en knapp, och ett test man
 * skriver om varje vecka slutar man lita på.
 */

const ROT = path.join(__dirname, '..', '..');
const PORTAL = fs.readFileSync(path.join(ROT, 'public', 'staff-portal.html'), 'utf8');

/**
 * Kommentarer bort före konstruktionsmätning.
 *
 * Det här har nu inträffat FYRA gånger i den här kodbasen, och den fjärde
 * gången var åt andra hållet: ORD-239:s svep bytte "font-size: 11px" mot en
 * token även inuti en kommentar som förklarade problemet. Koden blev rätt,
 * texten blev nonsens. Regeln gäller alltså i båda riktningarna — mät aldrig
 * konstruktioner i rå källtext, och skriv aldrig om rå källtext utan att först
 * maska kommentarerna.
 */
const KOD = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Klipp ut en regel från selektorn till dess avslutande klammer. Ett gissat
 *  teckenfönster klipper mitt i deklarationen så fort prettier sorterar om. */
function cssRegel(kalla, selektor) {
  const i = kalla.indexOf(selektor);
  assert.notEqual(i, -1, `hittar inte selektorn ${selektor}`);
  return kalla.slice(i, kalla.indexOf('}', i) + 1);
}

/**
 * Hämta det @media-block vars innehåll matchar ett ankare, och räkna klamrar
 * i stället för att gissa en längd.
 *
 * Det finns TVÅ (pointer: coarse)-block: ett som sätter token i :root och ett
 * som ger elementtyperna sin höjd. indexOf() på mediafrågan hittar det första
 * och testet mätte fel block — exakt samma fel som när en grep på "card-title"
 * matchade det redan befintliga ".qms-card-title" och gav ett falskt godkänt
 * deploy tidigare i dag. Ett ankare måste vara unikt för det man mäter.
 */
function mediaBlockMed(kalla, mediafraga, ankare) {
  let i = -1;
  for (;;) {
    i = kalla.indexOf(mediafraga, i + 1);
    assert.notEqual(i, -1, `hittar inget ${mediafraga}-block som innehåller ${ankare}`);
    let j = kalla.indexOf('{', i) + 1;
    let djup = 1;
    while (djup && j < kalla.length) {
      if (kalla[j] === '{') djup += 1;
      else if (kalla[j] === '}') djup -= 1;
      j += 1;
    }
    const block = kalla.slice(i, j);
    if (block.includes(ankare)) return block;
  }
}

/* ── §1 Textgolvet ────────────────────────────────────────────────────── */

test('T-101: INGEN rå font-size under 12px finns kvar', () => {
  // Den starka invarianten. Inte "inget värde under 10" — då hade nästa
  // etikett på 10px passerat. Noll råa värden betyder att golvet inte GÅR att
  // underskrida utan att först ändra token.
  const raa = KOD.match(/font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/g) || [];
  assert.deepEqual(
    raa,
    [],
    `${raa.length} rå font-size under 12px — de undkommer golvet: ${raa.slice(0, 6).join(', ')}`
  );
});

test('T-102: de två tokens finns och har de mätta värdena', () => {
  const rot = cssRegel(KOD, ':root {');
  assert.match(rot, /--txt-etikett:\s*10\.5px/, 'versaletikettgolvet saknas eller har flyttats');
  assert.match(rot, /--txt-liten:\s*11\.5px/, 'gemena golvet saknas eller har flyttats');
});

test('T-103: versalgolvet får aldrig hamna över det gemena', () => {
  // Versaler bär mindre höjdvariation än gemener och tål ett par tiondelar
  // mindre. Om någon råkar kasta om värdena blir etiketterna större än
  // brödtexten och hierarkin står på huvudet.
  const rot = cssRegel(KOD, ':root {');
  const etikett = parseFloat(rot.match(/--txt-etikett:\s*([\d.]+)px/)[1]);
  const liten = parseFloat(rot.match(/--txt-liten:\s*([\d.]+)px/)[1]);
  assert.ok(etikett <= liten, `versalgolvet ${etikett}px är större än det gemena ${liten}px`);
  assert.ok(etikett >= 10.5, `versalgolvet sänkt till ${etikett}px — mätningen satte 10,5`);
});

test('T-104: tokens ANVÄNDS, de är inte bara definierade', () => {
  // Samma fel som --cc-rgb, .a11y-skip och kortreceptet: infrastruktur som
  // byggdes och aldrig kopplades in. Det felet har den här kodbasen gjort en
  // gång för mycket för att inte testas.
  const etikett = (KOD.match(/font-size:\s*var\(--txt-etikett\)/g) || []).length;
  const liten = (KOD.match(/font-size:\s*var\(--txt-liten\)/g) || []).length;
  assert.ok(etikett >= 15, `bara ${etikett} användningar av --txt-etikett`);
  assert.ok(liten >= 50, `bara ${liten} användningar av --txt-liten`);
});

/* ── §2 Träffytorna ───────────────────────────────────────────────────── */

test('T-201: träffytegolvet är villkorat på POINTER, inte på skärmbredd', () => {
  // Frågan är vilket don som pekar, inte hur bred skärmen är. En
  // pekskärmslaptop behöver ytan; ett smalt musfönster på skrivbordet gör det
  // inte. En px-brytpunkt hade svarat på fel fråga.
  assert.match(KOD, /@media\s*\(pointer:\s*coarse\)/, 'pointer: coarse-frågan saknas');
  const block = mediaBlockMed(KOD, '@media (pointer: coarse)', '--traffyta-golv');
  assert.match(block, /--traffyta-golv:\s*44px/, 'golvet sätts inte till 44px för ett grovt don');
});

test('T-202: MOTPROV — golvet är 0 för ett don som pekar exakt', () => {
  // Utan det här testet kan någon "förenkla" genom att sätta 44px i :root, och
  // då växer varje knapp på skrivbordet. Skrivbordsläget mättes: noll element
  // ska ändra höjd där.
  const rot = cssRegel(KOD, ':root {');
  assert.match(rot, /--traffyta-golv:\s*0px/, 'grundvärdet är inte 0 — skrivbordet påverkas');
});

test('T-203: regeln gäller ELEMENTTYPER, inte en lista över klasser', () => {
  // Samma lärdom som fokusringen i ORD-237. Den första fokusregeln räknade upp
  // tretton klasser; mätningen efteråt hittade 26 interaktiva element som inte
  // stod i listan. En lista över klasser blir aldrig färdig.
  const block = mediaBlockMed(KOD, '@media (pointer: coarse)', 'min-height: 44px');
  for (const typ of ['button', 'select', 'summary', 'textarea', 'input']) {
    assert.ok(
      new RegExp(`(^|[,{\\s])${typ}\\b`, 'm').test(block),
      `elementtypen ${typ} saknas i träffyteregeln`
    );
  }
  assert.match(block, /min-height:\s*44px/, 'ingen höjd på 44px');
  assert.match(block, /min-width:\s*44px/, 'ingen bredd på 44px — hamburgaren var 36x36');
});

test('T-204: kryssrutor och radioknappar är undantagna', () => {
  // De renderas av operativsystemet och går inte att sträcka på ett vettigt
  // sätt; min-height på dem ger en tom yta under rutan, inte en större ruta.
  const block = mediaBlockMed(KOD, '@media (pointer: coarse)', 'min-height: 44px');
  assert.match(block, /input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\)/);
});

/**
 * Rent dekorativa mått mellan 20 och 44px. Ingen av dem är en träffyta:
 * avatarer, ikonrutor och tomma tillståndets cirkel. De räknas bort med namn
 * och motivering, inte tyst.
 *
 * Undantaget är en LISTA och listor blir aldrig färdiga — men det är
 * undantaget som är en lista här, inte regeln. Regeln nedan täcker allt; den
 * som lägger till ett nytt mått måste antingen gå via golvet eller skriva in
 * sig här och därmed förklara varför måttet inte är något man rör.
 */
const DEKORATIVA = ['.avatar', '.conv-avatar', '.item-icon', '.doc-icon', '::before', '::after'];

test('T-205: INGET mått under 44px kringgår golvet, utom det uttalat dekorativa', () => {
  // Kärnan i fyndet. Tio regler satte sin EGEN höjd (32, 34, 36, 38, 40, 42)
  // och en elementregel på `button` eller `textarea` förlorar
  // specificitetsstriden mot var och en av dem. Ett custom property ärvs och
  // deltar inte i den striden alls, därför max(eget mått, var(--traffyta-golv)).
  //
  // Den första versionen av det här testet räknade upp kontrollnamn — btn,
  // nav-item, chip — och mutationskörningen visade omedelbart varför det inte
  // dög: mutationen träffade .deep-link, som inte stod i listan, och testet
  // förblev grönt. Tre formulärfält (.offer-filter-search och två textareas)
  // var kvar under 44 av samma skäl, och Chromium-mätningen missade dem för att
  // de inte fanns i det renderade urvalet. Regeln måste alltså vara heltäckande.
  const kvar = [];
  const re = /(min-height|height):\s*(\d+)px/g;
  let m;
  while ((m = re.exec(KOD))) {
    const px = Number(m[2]);
    if (px >= 44 || px < 20) continue;
    const start = KOD.lastIndexOf('{', m.index);
    // start - 1, inte start: lastIndexOf('{', start) hittar klammern SJÄLV och
    // ger ett tomt selektornamn. Felet syntes direkt i mätvärdet — fem regler
    // rapporterades utan namn — vilket är skälet att låta felmeddelandet skriva
    // ut det den mätte i stället för bara ett antal.
    const selStart = Math.max(KOD.lastIndexOf('}', start), KOD.lastIndexOf('{', start - 1)) + 1;
    const sel = KOD.slice(selStart, start).replace(/\s+/g, ' ').trim();
    if (DEKORATIVA.some((d) => sel.includes(d))) continue;
    kvar.push(`${sel.slice(-44)} → ${m[1]}: ${px}px`);
  }
  assert.deepEqual(
    kvar,
    [],
    `${kvar.length} regel/regler sätter en fast höjd under 44px och kringgår golvet:\n  ${kvar.join('\n  ')}`
  );
});

test('T-206: golvet används via max(), så skrivbordsstorleken bevaras', () => {
  // Alternativet hade varit att ge alla kontroller samma höjd. Skillnaden
  // mellan chip (32), knapp (34) och navpost (40) är avsiktlig hierarki och
  // ska inte plattas ut av en tillgänglighetsfix.
  const anvandningar = KOD.match(/max\(\s*\d+px,\s*var\(--traffyta-golv\)\s*\)/g) || [];
  assert.ok(
    anvandningar.length >= 7,
    `bara ${anvandningar.length} kontroller går via max() — mätningen hittade sju som behövde det`
  );
  const matt = new Set(anvandningar.map((x) => x.match(/(\d+)px/)[1]));
  assert.ok(
    matt.size >= 3,
    `alla max() använder samma mått (${[...matt]}) — hierarkin är utplattad`
  );
});

/* ── §3 Inget av det tidigare får ha gått sönder ──────────────────────── */

test('T-301: fokusregeln från ORD-237 står kvar', () => {
  const block = cssRegel(KOD, 'a:focus-visible');
  assert.match(block, /outline:\s*2px solid/);
  for (const typ of ['button', 'input', 'select', 'textarea']) {
    assert.ok(new RegExp(`(^|,\\s*)${typ}:focus-visible`, 'm').test(block), `${typ} tappades`);
  }
});

test('T-302: mobilblocket under 640px är kvar och skriver om sina selektorer', () => {
  // Det var det här blocket mätningen visade att jag hade fel om. Det ska inte
  // tunnas ut av misstag i ett framtida svep.
  const i = KOD.indexOf('@media (max-width: 640px)');
  assert.notEqual(i, -1, 'mobilblocket saknas');
  const selektorer = (KOD.slice(i, i + 4000).match(/[^{};]+\{/g) || []).length;
  assert.ok(selektorer >= 20, `mobilblocket har krympt till ${selektorer} selektorer`);
});

test('T-303: viewport-metan tillåter fortfarande att sidan skalar', () => {
  // user-scalable=no eller maximum-scale=1 hade låst zoom för den som behöver
  // förstora. Golvet vi just lade in ersätter inte den möjligheten.
  const meta = PORTAL.match(/name="viewport"[^>]*content="([^"]*)"/);
  assert.ok(meta, 'viewport-metan saknas');
  assert.ok(!/user-scalable\s*=\s*no/.test(meta[1]), 'zoom är avstängd');
  assert.ok(!/maximum-scale\s*=\s*1\b/.test(meta[1]), 'maximal zoom är låst till 1');
});
