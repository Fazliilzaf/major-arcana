'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-242 — portalens djupspråk ska gälla hela vägen ner.
 *
 * BAKGRUNDEN: Fazli sa att förslaget såg platt ut. Han hade rätt, och
 * mätningen efteråt visade varför — SEX AV ÅTTA små komponenter hade ingen
 * box-shadow alls. Problemet var aldrig kulören; att byta rgba(198,85,74) mot
 * rgba(var(--danger-rgb)) gör källan ärligare och skärmen exakt lika platt.
 *
 * Portalen HAR ett djupspråk sedan ORD-230: tre lager — vit inset-highlight
 * överst, tajt kontaktskugga, bred mjuk skugga, alla i komponentens EGEN kulör.
 * Det applicerades bara på de åtta kortklasserna och nådde aldrig delarna inuti
 * dem. Samma ofullständighet som --cc-rgb, .a11y-skip och färgtripletterna.
 *
 * Testerna nedan håller receptet på ETT ställe och hindrar att komponenterna
 * blir platta igen.
 */

const ROT = path.join(__dirname, '..', '..');
const PORTAL = fs.readFileSync(path.join(ROT, 'public', 'staff-portal.html'), 'utf8');

/** Kommentarer bort före konstruktionsmätning. Sjätte gången regeln behövs. */
const KOD = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function regel(selektor) {
  const i = KOD.indexOf(`\n      ${selektor} {`);
  assert.notEqual(i, -1, `hittar inte ${selektor}`);
  return KOD.slice(i, KOD.indexOf('}', i) + 1);
}

const ROOT = KOD.slice(KOD.indexOf(':root {'), KOD.indexOf('}', KOD.indexOf(':root {')));

/* ── §1 Receptet finns på ett ställe ──────────────────────────────────── */

test('T-101: de fyra djuptokens är definierade', () => {
  for (const t of ['--djup-liten', '--djup-mellan', '--djup-lyft', '--djup-nedsankt']) {
    assert.ok(ROOT.includes(`${t}:`), `${t} saknas i :root`);
  }
});

test('T-102: de upphöjda recepten har alla TRE lagren', () => {
  // Vit inset-highlight överst (ljuset kommer uppifrån), tajt kontaktskugga,
  // bred mjuk skugga. Tappar man ett lager blir det en generisk drop shadow och
  // komponenten slutar tillhöra samma värld som korten.
  for (const t of ['--djup-liten', '--djup-mellan', '--djup-lyft']) {
    const rad = ROOT.slice(ROOT.indexOf(`${t}:`), ROOT.indexOf(';', ROOT.indexOf(`${t}:`)));
    assert.match(rad, /inset 0 1px 0 rgba\(255, 255, 255/, `${t} saknar sin vita highlight`);
    assert.ok(
      (rad.match(/rgba\(var\(--ton\)/g) || []).length >= 2,
      `${t} har inte två skuggor i komponentens egen kulör`
    );
  }
});

test('T-103: skuggan bär komponentens EGEN kulör via --ton', () => {
  // Samma mekanik som kortreceptets --alder-rgb. Ett custom property ärvs, så
  // varje komponent kan bära sin färg utan att receptet dupliceras.
  assert.match(ROOT, /--ton:\s*var\(--brand-rgb\)/, '--ton saknar sitt grundvärde');
  const satta = (KOD.match(/--ton: var\(--[a-z-]+\)/g) || []).length;
  assert.ok(satta >= 12, `bara ${satta} komponenter sätter --ton — receptet används knappt`);
});

/* ── §2 Urgröpningen ──────────────────────────────────────────────────── */

test('T-201: den nedsänkta ytan har både skuggkant och ljus läpp', () => {
  // Det tog tre försök och de två felen var olika sorter.
  //
  // Försök 1 var för svag: inset 0 1px 3px vid 9 % läste som en smutsig
  // överkant. Försök 2 lade den ljusa kanten som "inset 0 -1px 0 vit" — och
  // den blev osynlig, eftersom kortet under redan är nästan vitt och en vit
  // linje INUTI lådan inte har något att kontrastera mot. Det syntes först när
  // fixen renderades och tittades på, inte när den lästes.
  //
  // Försök 3: ljuslinjen ligger UTANFÖR lådan, mot den nedsänkta ytans mörka
  // botten. Det är läppen som gör att ögat läser "urgröpt" och inte "grå ruta".
  const rad = ROOT.slice(
    ROOT.indexOf('--djup-nedsankt:'),
    ROOT.indexOf(';', ROOT.indexOf('--djup-nedsankt:'))
  );
  assert.match(
    rad,
    /inset 0 2px \d+px rgba\(var\(--brand-rgb\), 0\.1[5-9]\)/,
    'överkanten skuggar inte nog'
  );
  assert.match(
    rad,
    /(^|,)\s*0 1px 0 rgba\(255, 255, 255/,
    'ljuslinjen saknas eller ligger kvar som inset — då är den osynlig mot kortet'
  );
});

test('T-202: den nedsänkta toningen går MÖRKARE upptill', () => {
  // Inversen av det upphöjda kortet. Det är inversionen som säljer djupet;
  // opaciteten ensam gav bara en gråare ruta.
  const yta = ROOT.slice(
    ROOT.indexOf('--nedsankt-yta:'),
    ROOT.indexOf(');', ROOT.indexOf('--nedsankt-yta:'))
  );
  const stopp = [...yta.matchAll(/rgba\(var\(--brand-rgb\), (0?\.\d+)\)/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(stopp.length, 2, 'toningen har inte två stopp');
  assert.ok(stopp[0] > stopp[1], `toningen går ljusare upptill (${stopp[0]} -> ${stopp[1]})`);
});

test('T-203: de fem lådorna INUTI kort är nedsänkta, inte upphöjda', () => {
  // Två upphöjda ytor på varandra läser som brus. Kortet är föremålet, lådan är
  // en urgröpning i det — och hierarkin uppstår av ljuset självt, utan färg.
  for (const sel of [
    '.case-detail-box',
    '.checklist-progress-row',
    '.ordination-decision-cell',
    '.ordination-timeline-chip',
    '.ordination-timeline-row',
  ]) {
    const r = regel(sel);
    assert.match(r, /box-shadow: var\(--djup-nedsankt\)/, `${sel} är inte nedsänkt`);
    assert.ok(!/box-shadow:[^;]*\binset 0 1px 0\b/.test(r), `${sel} har en upphöjd highlight`);
  }
});

/* ── §3 Ingen av de platta får bli platt igen ─────────────────────────── */

test('T-301: de sex tidigare platta komponenterna har djup', () => {
  // Mätningen som startade allt: .pill, .queue-priority, .session-banner,
  // .case-detail-box, .conv-lane och .alder-marke hade noll box-shadow.
  for (const sel of [
    '.pill',
    '.queue-priority',
    '.session-banner',
    '.case-detail-box',
    '.conv-lane',
    '.ordination-signoff',
  ]) {
    assert.match(regel(sel), /box-shadow: var\(--djup-/, `${sel} är platt igen`);
  }
});

test('T-302: statusvarianterna har toning, inte platt fyllning', () => {
  // En platt fyllning gör pillret till en färgad rektangel igen, oavsett skugga.
  for (const sel of [
    '.pill.sage',
    '.pill.amber',
    '.pill.danger',
    '.pill.info',
    '.queue-priority.urgent',
    '.queue-priority.today',
    '.queue-priority.waiting',
    '.conv-lane.act-now',
  ]) {
    const r = regel(sel);
    assert.match(r, /--ton: var\(--[a-z-]+\)/, `${sel} sätter ingen --ton`);
    assert.match(r, /background: linear-gradient\(/, `${sel} har platt fyllning`);
  }
});

/**
 * Runda märken. En cirkel på 38–40 px behöver en tätare, mer centrerad skugga
 * än en låda — receptets breda 12px-lager lägger sig som en ring runt en liten
 * cirkel och ser fel ut. De fyra har egna, medvetna recept.
 *
 * Undantaget är en LISTA, men det är undantaget och inte regeln, och varje
 * post måste kunna motiveras. Testet nedan täcker allt annat.
 */
const RUNDA_MARKEN = ['.item-icon', '.doc-icon', '.conv-avatar', 'tomt-tillstand::before'];

/**
 * Fyllda kontroller (ORD-243). .btn.primary och .role-btn.active har MÖRK
 * botten, och receptets highlight på 0,7–0,92 alfa är kalibrerad mot ljusa
 * ytor — på mörkt försvinner den. De skriver därför ut en egen, ljusare
 * highlight (0,26–0,28 mot mörkt ger samma upplevda kant som 0,9 mot ljust).
 *
 * Det är ett undantag av samma sort som de runda märkena: receptet är rätt för
 * det det gjordes för, och fel utanför det. Att tvinga in dem hade gett två
 * knappar som ser oslipade ut — och att i stället sänka receptets alfa hade
 * förstört de tjugo ljusa komponenterna för två mörkas skull.
 */
const FYLLDA_KONTROLLER = ['.btn.primary', '.role-btn.active'];

test('T-303: MOTPROV — receptet är återanvänt, inte kopierat', () => {
  // Om någon skriver ut "inset 0 1px 0 rgba(255,255,255,...)" för hand i en
  // komponent har vi fyrtio deklarationer igen i stället för fyra tokens.
  //
  // Testet hittade fem sådana första gången det kördes, och de var inte lika:
  // .next-action-box hade highlighten men INGEN skugga — en tredjedel av
  // receptet, alltså en ruta som ser upplyft ut utan att lyfta. Den fick
  // token. De fyra runda märkena har egna medvetna recept och står i listan
  // ovan.
  // Kortreceptets selektor sträcker sig över åtta rader, så regel() hittar den
  // inte — den slår upp på "\n      .sel {" och här står klammern långt senare.
  // Blocket klipps därför ut från den första selektorn till dess klammer.
  const i = KOD.indexOf('\n      .item-card,');
  assert.notEqual(i, -1, 'hittar inte kortreceptet');
  const kortreceptet = KOD.slice(i, KOD.indexOf('}', i) + 1);
  const handskrivna = [];
  for (const m of KOD.matchAll(/inset 0 1px 0 rgba\(255, 255, 255/g)) {
    const start = KOD.lastIndexOf('{', m.index);
    const selStart = Math.max(KOD.lastIndexOf('}', start), KOD.lastIndexOf('{', start - 1)) + 1;
    const sel = KOD.slice(selStart, start).replace(/\s+/g, ' ').trim();
    if (sel.includes(':root')) continue; // tokendefinitionerna själva
    if (sel.startsWith('.item-card,')) continue; // kortreceptet från ORD-230
    if (RUNDA_MARKEN.some((r) => sel.includes(r))) continue;
    if (FYLLDA_KONTROLLER.some((f) => sel.includes(f))) continue;
    handskrivna.push(sel.slice(-46));
  }
  assert.deepEqual(
    handskrivna,
    [],
    `${handskrivna.length} komponent(er) skriver ut highlighten för hand:\n  ${handskrivna.join('\n  ')}`
  );
});

/* ── §4 Bannerns kulörremsa ───────────────────────────────────────────── */

test('T-401: bannern bär sin status även utan färgseende', () => {
  // WCAG 1.4.1 — färg får aldrig vara enda signalen. Remsan är en form, och
  // den fungerar för den som inte skiljer gult från rött.
  const r = regel('.session-banner');
  assert.match(r, /position: relative/, 'remsan kan inte positioneras');
  assert.match(KOD, /\.session-banner::before \{[^}]*width: 4px/s, 'kulörremsan saknas');
});

test('T-402: ingen Tailwind-hex finns kvar någonstans', () => {
  // Testet var först skrivet bara för bannern — och blev rött på ett ställe jag
  // inte visste om. rgba-svepet hade missat tre färger eftersom de står som HEX
  // och inte som rgba: .thread-status.error (red-800), .thread-status.ok:s
  // fallback (lime-800) och .conv-avatar.ton-violet (violet-800). Ett test som
  // bara letar där man redan tittat hittar bara det man redan vet.
  //
  // Ersättarna är portalens egna nedskalade toner och samtliga MER kontrastrika
  // än de de ersatte, mätt mot alla tre ytorna: 8,72 mot 7,73 · 7,32 mot 6,58 ·
  // 9,53 mot 8,00. WCAG AA kräver 4,5.
  const TAILWIND = {
    '#92400e': 'amber-800',
    '#991b1b': 'red-800',
    '#3f6212': 'lime-800',
    '#5b28b8': 'violet-800',
    '#1e293b': 'slate-800',
  };
  const kvar = Object.entries(TAILWIND)
    .filter(([hex]) => KOD.toLowerCase().includes(hex))
    .map(([hex, namn]) => `${hex} (${namn})`);
  assert.deepEqual(kvar, [], `Tailwind-färger står kvar: ${kvar.join(', ')}`);
});

/* ── §5 Färgen ────────────────────────────────────────────────────────── */

test('T-501: den främmande paletten är borta', () => {
  // slate-900, red-600, amber-600, violet-500 och de tre egna röd/gul/blå.
  for (const t of [
    '30, 41, 59',
    '220, 38, 38',
    '217, 119, 6',
    '106, 91, 190',
    '126, 87, 194',
    '211, 75, 132',
    '198, 85, 74',
    '201, 132, 70',
    '66, 133, 166',
  ]) {
    assert.ok(!KOD.includes(`rgba(${t}`), `rgba(${t}) står kvar`);
  }
});

test('T-502: MOTPROV — de varma neutralerna är KVAR', () => {
  // Nivå 3. De är inte fel palett utan avsiktliga varma neutraler som ingen
  // token motsvarar: sidans bakgrundsglöd och den gräddvita ytan på väntande
  // kort. Närmaste token är --rose-top, som är rosa. Ett svep som bytte även
  // dem hade gjort väntekorten och bakgrunden rosa — det är en designändring,
  // inte en städning, och den ska tas medvetet.
  for (const t of ['255, 225, 200', '255, 210, 225', '252, 245, 235', '255, 248, 230']) {
    assert.ok(KOD.includes(`rgba(${t}`), `den varma neutralen rgba(${t}) har svepts bort`);
  }
});
