'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-244 — en kontroll har FYRA lägen, inte ett.
 *
 * ORD-243 gav portalen djup i viloläge och stannade där. Frågan "har vi missat
 * något" gav fyra svar, och det första var en regression jag själv just infört:
 *
 * 1. HOVER SLOG UT DJUPET. .btn:hover satte en platt fyllning som ersatte
 *    gradienten — den sekundära knappen TAPPADE sin fördjupning i samma sekund
 *    musen kom över den. Och .role-btn:hover undantog inte .active, så den
 *    aktiva violetta rollknappen bleknade vid hover. Det är exakt samma fel som
 *    rättades i grundregeln, tillbaka via ett annat tillstånd. En komponent har
 *    fyra lägen, och en fix på ett av dem är en fix på en fjärdedel.
 *
 * 2. FYRTIOFEM disabled-attribut och NOLL :disabled-styling. En låst knapp såg
 *    identisk ut med en aktiv, i en portal där knappar grindas kliniskt.
 *    "Trasig app" och "medveten spärr" ser likadana ut när ingen skillnad visas.
 *
 * 3. INGEN :active. Mellan hover och resultat hände visuellt ingenting.
 *
 * 4. prefers-reduced-motion saknades trots sidopanelens transform 0.25s.
 */

const ROT = path.join(__dirname, '..', '..');
const PORTAL = fs.readFileSync(path.join(ROT, 'public', 'staff-portal.html'), 'utf8');

/** Kommentarer bort före konstruktionsmätning. Åttonde gången regeln behövs. */
const KOD = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function regel(selektor) {
  const i = KOD.indexOf(`\n      ${selektor} {`);
  assert.notEqual(i, -1, `hittar inte ${selektor}`);
  return KOD.slice(i, KOD.indexOf('}', i) + 1);
}

/* ── §1 Hover får inte platta ut ──────────────────────────────────────── */

test('T-101: hover försvagar aldrig djupet, den förstärker det', () => {
  // Kärnan i regressionen — men invarianten måste formuleras rätt, och första
  // versionen gjorde det inte. Den sa "ingen platt bakgrund i hover" och blev
  // röd på .deep-link:hover, som är HELT korrekt: en LYFT kontroll bär sitt
  // djup i skuggan, inte i toningen, så en ljusare platt fyllning där är rätt
  // så länge skuggan följer med.
  //
  // Regeln är alltså inte "aldrig platt bakgrund" utan "tappa aldrig
  // djupsignalen": en nedsänkt kontroll ska behålla sin toning, en lyft ska
  // behålla eller öka sin skugga.
  for (const sel of ['.btn:hover', '.role-btn:not(.active):hover']) {
    assert.match(
      regel(sel),
      /background: linear-gradient\(/,
      `${sel} ersätter den nedsänkta toningen med en platt fyllning`
    );
  }
  assert.match(
    regel('.deep-link:hover'),
    /box-shadow: var\(--djup-(mellan|lyft)\)/,
    '.deep-link:hover tappar sitt lyft'
  );
});

test('T-102: hover på den AKTIVA rollen bleker den inte', () => {
  // Selektorn måste undanta .active. Utan :not(.active) ersätts den mörka
  // fyllningen med en 10-procentig ton och den vita texten tappar sitt
  // underlag — samma fel som rättades i grundregeln, en gång till.
  assert.ok(
    KOD.includes('.role-btn:not(.active):hover'),
    'hover-regeln undantar inte den aktiva rollen'
  );
  assert.ok(
    !/\.role-btn:hover\s*\{/.test(KOD),
    'den ovillkorade .role-btn:hover finns kvar och träffar även .active'
  );
  assert.match(regel('.role-btn.active:hover'), /filter: brightness/, 'aktiv hover saknar respons');
});

/* ── §2 Avstängt ──────────────────────────────────────────────────────── */

test('T-201: avstängda kontroller har en egen, platt form', () => {
  // Djupspråket ger svaret: en avstängd kontroll är varken lyft eller nedsänkt.
  // Den ligger PLATT — inte ett föremål man kan trycka på, inte en grop man
  // skriver i. Ingen skugga är i det här systemet en betydelse, inte ett glömt
  // värde.
  const i = KOD.indexOf('.btn:disabled');
  assert.notEqual(i, -1, 'ingen :disabled-styling alls');
  const block = KOD.slice(i, KOD.indexOf('}', i) + 1);
  assert.match(block, /box-shadow: none/, 'avstängt läge är inte platt');
  assert.match(block, /cursor: not-allowed/, 'pekaren avslöjar inte att knappen är låst');
  assert.match(block, /color: var\(--text3\)/, 'texten är inte dämpad');
});

test('T-202: hover luras inte tillbaka liv i något avstängt', () => {
  assert.ok(KOD.includes('.btn:disabled:hover'), 'en avstängd knapp reagerar fortfarande på hover');
});

test('T-203: den avstängda texten går fortfarande att LÄSA', () => {
  // WCAG undantar inaktiva kontroller från kontrastkravet, men undantaget
  // handlar om regeluppfyllnad och inte om läsbarhet. Personalen ska kunna läsa
  // vad knappen de inte får trycka på heter — annars går det inte att förstå
  // VAD som är spärrat. --text3 ger 4,82:1 mot den dämpade ytan.
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const kvot = (a, b) => {
    const [la, lb] = [lum(a), lum(b)];
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const rot = KOD.slice(KOD.indexOf(':root {'), KOD.indexOf('}', KOD.indexOf(':root {')));
  const text3 = rot.match(/--text3:\s*(#[0-9a-fA-F]{6})/)[1];
  const k = kvot(text3, '#f0eeeb'); // brand 4,5 % över sidbakgrunden
  assert.ok(k >= 4.5, `avstängd text ger ${k.toFixed(2)}:1, under AA 4,5`);
});

/* ── §3 Nedtryckt ─────────────────────────────────────────────────────── */

test('T-301: det som lyfter sjunker när man trycker', () => {
  assert.ok(KOD.includes(':active'), 'ingen :active-styling alls');
  const i = KOD.indexOf('.btn.primary:not(:disabled):active');
  assert.notEqual(i, -1, 'den primära knappen har inget nedtryckt läge');
  const block = KOD.slice(i, KOD.indexOf('}', i) + 1);
  assert.match(block, /translateY\(1px\)/, 'knappen rör sig inte nedåt');
  assert.ok(!/0 1[02]px \d+px/.test(block), 'den breda skuggan finns kvar — knappen lyfter ännu');
});

test('T-302: en avstängd knapp reagerar INTE på tryck', () => {
  // :not(:disabled) på VARJE selektor. Ett tryck som ändå inte leder någonstans
  // ska inte få den fysiska bekräftelse som säger "det där gick igenom".
  //
  // Första versionen mätte hela selektorGRUPPER och missade därför en mutation:
  // regexen matchade "a:not(:disabled):active, b:not(:disabled):active,
  // c:active {" som EN sträng, hittade ett ":not(:disabled)" i den, och lät
  // hela gruppen passera — trots att den sista selektorn saknade skyddet.
  // En grupp är inte en selektor. Varje del måste mätas för sig.
  const utanSkydd = [];
  for (const m of KOD.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const grupp = m[1];
    if (!grupp.includes(':active')) continue;
    // prefers-reduced-motion-blocket nollställer bara rörelse och är undantaget
    if (/transform: none/.test(m[0])) continue;
    for (const sel of grupp.split(',').map((x) => x.trim())) {
      if (!sel.includes(':active')) continue;
      if (sel.includes(':not(:disabled)')) continue;
      if (sel.startsWith('.deep-link')) continue; // en länk kan inte vara disabled
      utanSkydd.push(sel);
    }
  }
  assert.deepEqual(
    utanSkydd,
    [],
    `${utanSkydd.length} :active-selektor(er) saknar :not(:disabled): ${utanSkydd.join(' | ')}`
  );
});

/* ── §4 Rörelse ───────────────────────────────────────────────────────── */

test('T-401: prefers-reduced-motion respekteras', () => {
  assert.match(KOD, /@media \(prefers-reduced-motion: reduce\)/, 'inställningen ignoreras');
  const i = KOD.indexOf('@media (prefers-reduced-motion: reduce)');
  const block = KOD.slice(i, i + 700);
  assert.match(block, /\.sidebar \{\s*transition: none/, 'sidopanelen glider fortfarande in');
  assert.match(block, /transform: none/, 'nedtryckningens rörelse stängs inte av');
});

test('T-402: MOTPROV — färgövergångar behålls', () => {
  // Rörelse stängs av, inte allt. En färg- eller bakgrundsövergång FLYTTAR
  // ingenting på skärmen. Att svepa bort även dem hade gjort portalen ryckigare
  // för alla som slog på inställningen — alltså straffat dem för att de bad om
  // mindre rörelse.
  const i = KOD.indexOf('@media (prefers-reduced-motion: reduce)');
  const block = KOD.slice(i, i + 700);
  assert.ok(
    !/transition-duration:\s*0\.01ms\s*!important/.test(block),
    'alla övergångar nollställs, även de som inte rör sig'
  );
});

/* ── §5 Alla fyra lägen finns för de viktiga kontrollerna ─────────────── */

test('T-501: de tre viktigaste kontrollerna har alla fyra lägen', () => {
  // Vila, hover, nedtryckt, avstängt. Saknas ett läge är komponenten
  // ofärdig — och det var precis så hover kunde slå ut djupet utan att någon
  // märkte det.
  const LAGEN = {
    '.btn': ['.btn {', '.btn:hover', ':active', ':disabled'],
    '.role-btn': ['.role-btn {', '.role-btn:not(.active):hover', ':active', ':disabled'],
    '.ordination-mode-btn': ['.ordination-mode-btn {', ':active', ':disabled'],
  };
  for (const [namn, delar] of Object.entries(LAGEN)) {
    for (const d of delar) {
      assert.ok(KOD.includes(d), `${namn} saknar läget ${d}`);
    }
  }
});
