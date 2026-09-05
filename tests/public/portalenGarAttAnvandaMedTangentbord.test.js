'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');

/**
 * ORD-236 — portalen ska gå att använda med tangentbord och skärmläsare.
 *
 * Tre fynd, alla mätta mot en standard och inte mot smak:
 *
 * 1. FOKUSRINGEN VAR SLÄCKT PÅ KLINIKENS TVÅ VIKTIGASTE FORMULÄR.
 *    cco-polish.css ger *:focus-visible till allt, men portalen hade fyra
 *    outline: none — bland dem .ordination-write (läkaren skriver en
 *    ordination) och .deviation-form (avvikelserapport till QMS). En
 *    tangentbordsanvändare kunde tabba genom dem utan att se vilket fält hen
 *    stod i.
 *
 * 2. SKIP-LÄNKEN FANNS STYLED MEN ANVÄNDES INTE.
 *    .a11y-skip har regler i cco-polish.css och förekom i noll HTML-filer.
 *    Samma mönster som --cc-rgb, kortreceptet och färgtripletterna: en
 *    infrastruktur som byggdes och aldrig kopplades in.
 *
 * 3. INGEN ARIA-LIVE, TROTS 50 STÄLLEN SOM SKRIVER OM INNEHÅLL.
 *    Men lösningen är inte aria-live överallt: 27 listcontainrar som alla
 *    uppdateras samtidigt hade lästs upp i sin helhet, och tjugo kort på en
 *    gång är värre än tystnad. T-303 är motprovet mot den frestelsen.
 */

const ROT = path.join(__dirname, '..', '..');
const PORTAL = fs.readFileSync(path.join(ROT, 'public', 'staff-portal.html'), 'utf8');
const POLISH = fs.readFileSync(path.join(ROT, 'public', 'cco-polish.css'), 'utf8');

const MARKUP = PORTAL.slice(0, PORTAL.indexOf('<script'));

/**
 * Kommentarer bort före konstruktionsmätning.
 *
 * TREDJE GÅNGEN i den här kodbasen som ett test blir rött av sin egen
 * dokumentation: kommentaren som förklarar att outline: none togs bort
 * INNEHÅLLER strängen "outline: none". Ett test som greppar källkod kan inte
 * skilja koden från texten som beskriver den, så att förklara felet ordentligt
 * gör testet rött. Regeln är enkel och bör inte behöva läras om igen: mät
 * aldrig konstruktioner i rå källtext.
 */
const PORTAL_KOD = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Klipp ut en CSS-regel från selektorn till dess avslutande klammer, i stället
 *  för ett gissat antal tecken. Ett fast fönster på 400 tecken klippte mitt i
 *  deklarationen sedan prettier sorterat om selektorlistan. */
function cssRegel(kalla, selektor) {
  const i = kalla.indexOf(selektor);
  assert.notEqual(i, -1, `hittar inte selektorn ${selektor}`);
  const slut = kalla.indexOf('}', i);
  return kalla.slice(i, slut + 1);
}
const { document } = parseHTML(PORTAL.replace(/<script[\s\S]*?<\/script>/g, ''));

/* ── §1 Fokus ─────────────────────────────────────────────────────────── */

test('T-101: ingen regel släcker fokusringen', () => {
  const traffar = PORTAL_KOD.match(/outline:\s*(none|0)\b/g) || [];
  assert.deepEqual(
    traffar,
    [],
    `${traffar.length} regel(er) släcker fokusringen — en tangentbordsanvändare ser inte var hen står`
  );
});

test('T-102: regeln gäller ELEMENTTYPER, inte en lista över klasser', () => {
  // ORD-237. Den första versionen räknade upp tretton klasser. Mätningen
  // efteråt hittade 26 interaktiva element som inte fanns i listan — 25 utan
  // klass, plus hamburgerknappen. En lista över klasser blir aldrig färdig:
  // nästa knapp någon lägger till står inte i den.
  const block = cssRegel(PORTAL_KOD, 'a:focus-visible');
  for (const typ of ['a', 'button', 'input', 'select', 'textarea']) {
    assert.ok(
      new RegExp(`(^|,\\s*)${typ}:focus-visible`, 'm').test(block),
      `${typ} saknas i fokusregeln — element av den typen får ingen egen ring`
    );
  }
});

test('T-103: ringen är EXPLICIT, inte bara ärvd från cco-polish.css', () => {
  const block = cssRegel(PORTAL_KOD, 'a:focus-visible');
  assert.ok(/outline:\s*2px solid/.test(block), 'ingen egen outline-bredd');
  assert.ok(/outline-offset/.test(block), 'ingen outline-offset — ringen klibbar vid kanten');
});

test('T-104: ordinations- och avvikelsefälten omfattas av regeln', () => {
  // De två formulären som hade outline: none är input/select/textarea och
  // täcks därmed av elementregeln. Testet kör mätningen i stället för att
  // lita på resonemanget.
  const interaktiva = Array.from(
    document.querySelectorAll('input, select, textarea, button, a[href]')
  );
  assert.ok(interaktiva.length > 20, 'hittade misstänkt få interaktiva element');
  const typer = new Set(interaktiva.map((e) => e.tagName.toLowerCase()));
  const block = cssRegel(PORTAL_KOD, 'a:focus-visible');
  for (const t of typer) {
    assert.ok(
      block.includes(`${t}:focus-visible`),
      `elementtypen ${t} förekommer i markupen men saknas i fokusregeln`
    );
  }
});

test('T-106: längdfältet är en klass, inte fem inlinade deklarationer', () => {
  // ORD-194:s fält där personalen skriver in behandlingslängd. Det var den
  // enda av de kvarvarande inline-stilarna som var en riktig komponent.
  assert.ok(/\.langdfalt\s*\{/.test(PORTAL_KOD), '.langdfalt saknas i CSS');
  assert.ok(PORTAL.includes('class="langdfalt"'), 'fältet använder inte klassen');
  assert.ok(!/style="width: 82px; padding: 6px 8px/.test(PORTAL), 'den inlinade stilen finns kvar');
});

test('T-105: cco-polish.css ger fortfarande den generella ringen', () => {
  assert.ok(
    /\*:focus-visible/.test(POLISH),
    'den universella fokusringen försvann ur cco-polish.css'
  );
});

/* ── §2 Skip-länken ───────────────────────────────────────────────────── */

test('T-201: skip-länken finns i markupen', () => {
  const skip = document.querySelector('.a11y-skip');
  assert.ok(skip, 'skip-länken saknas');
  assert.equal(skip.getAttribute('href'), '#mainContent');
  assert.ok(skip.textContent.trim().length > 0, 'skip-länken har ingen text');
});

test('T-202: den är FÖRSTA tabbstoppet i body', () => {
  const fokuserbara = document.querySelectorAll('a[href], button, input, select, textarea');
  assert.ok(fokuserbara.length > 0, 'hittade inga fokuserbara element');
  assert.ok(
    fokuserbara[0].classList.contains('a11y-skip'),
    'något annat kommer före skip-länken — då hjälper den inte'
  );
});

test('T-203: målet den pekar på existerar', () => {
  assert.ok(document.getElementById('mainContent'), 'skip-länken pekar på ett id som inte finns');
});

test('T-204: den har styling — annars syns den aldrig vid fokus', () => {
  assert.ok(/\.a11y-skip\s*\{/.test(POLISH), '.a11y-skip saknar regler');
  assert.ok(/\.a11y-skip:focus\s*\{/.test(POLISH), '.a11y-skip syns inte vid fokus');
});

/* ── §3 aria-live ─────────────────────────────────────────────────────── */

test('T-301: sektionstalet annonseras', () => {
  const kod = PORTAL.slice(PORTAL.indexOf('function uppdateraSektioner'));
  assert.ok(/setAttribute\('role', 'status'\)/.test(kod), 'talet saknar role=status');
  assert.ok(/setAttribute\('aria-live', 'polite'\)/.test(kod), 'talet saknar aria-live');
});

test('T-302: annonseringen är polite, inte assertive', () => {
  // assertive avbryter det användaren håller på med. Ett uppdaterat antal är
  // aldrig så viktigt att det får avbryta någon mitt i en ordination.
  assert.ok(
    !/aria-live', 'assertive'/.test(PORTAL_KOD),
    'något annonseras assertive och avbryter användaren'
  );
});

test('T-303: MOTPROV — aria-live sitter INTE på listcontainrarna', () => {
  // 27 listor som alla uppdateras samtidigt hade lästs upp i sin helhet.
  // Tjugo kort på en gång är värre än tystnad.
  const listor = Array.from(document.querySelectorAll('[id^="live"]'));
  const medLive = listor.filter((e) => e.hasAttribute('aria-live'));
  assert.deepEqual(
    medLive.map((e) => e.id),
    [],
    `${medLive.length} listcontainer(s) annonserar hela sitt innehåll vid varje uppdatering`
  );
});

/* ── Allmänt: inget av detta får ha gått sönder ───────────────────────── */

test('T-401: main-elementet finns kvar och är unikt', () => {
  const mains = document.querySelectorAll('main');
  assert.equal(mains.length, 1, 'det ska finnas exakt ett main-element');
  assert.equal(mains[0].id, 'mainContent');
});

test('T-402: hamburgermenyn behåller sin etikett', () => {
  const h = document.getElementById('hamburgerBtn');
  assert.ok(h, 'hamburgerknappen saknas');
  assert.ok(h.getAttribute('aria-label'), 'hamburgerknappen har ingen aria-label');
});

test('T-403: sidan deklarerar svenska som språk', () => {
  // En skärmläsare uttalar svensk text med engelsk röst om lang saknas.
  assert.ok(/<html[^>]+lang="sv"/.test(MARKUP), 'lang="sv" saknas på html-elementet');
});
