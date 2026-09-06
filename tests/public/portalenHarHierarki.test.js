'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-243 — djup är HIERARKI, inte dekoration.
 *
 * ORD-242 gav portalen ett djupspråk. Den här omgången placerar det i resten
 * av vyerna, och den intressanta frågan är inte "har komponenten en skugga"
 * utan "pekar skuggan åt rätt håll".
 *
 * Inventeringen som föregick: tre rollvyer, 48 sektionsrubriker, 27 ytor med
 * bakgrund och padding. Nitton av dem var platta — men det var inte nitton
 * beslut: .btn (61 förekomster) och .live-note (60) var 121 av 180.
 *
 * PRINCIPEN, och det är den testerna nedan bevakar:
 *   lyft   det användaren agerar på och det som kräver uppmärksamhet
 *   sänk   det som är sammanhang
 *   lämna  appens ram
 * Om allt poppar poppar ingenting.
 */

const ROT = path.join(__dirname, '..', '..');
const PORTAL = fs.readFileSync(path.join(ROT, 'public', 'staff-portal.html'), 'utf8');

/** Kommentarer bort före konstruktionsmätning. Sjunde gången regeln behövs. */
const KOD = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function regel(selektor) {
  const i = KOD.indexOf(`\n      ${selektor} {`);
  assert.notEqual(i, -1, `hittar inte ${selektor}`);
  return KOD.slice(i, KOD.indexOf('}', i) + 1);
}

/** Lyft, sänkt eller platt — läst ur regeln, inte antaget. */
function riktning(selektor) {
  const r = regel(selektor);
  if (/box-shadow: var\(--djup-nedsankt\)/.test(r)) return 'sänkt';
  if (/box-shadow:[^;]*inset 0 2px \d+px/.test(r)) return 'sänkt';
  if (/box-shadow: var\(--djup-(liten|mellan|lyft)\)/.test(r)) return 'lyft';
  if (/box-shadow:[^;]*inset 0 1px 0 rgba\(255, 255, 255/.test(r)) return 'lyft';
  return 'platt';
}

/* ── §1 Kontrollernas hierarki ────────────────────────────────────────── */

test('T-101: den primära knappen lyfter, den sekundära sjunker', () => {
  // Kärnan i förslaget. .btn har background: none och är en spökknapp; sextioen
  // lyfta spökknappar blir knappsoppa. Genom att sänka den sekundära och lyfta
  // den primära blir hierarkin synlig utan en enda ny färg.
  assert.equal(riktning('.btn'), 'sänkt', 'den sekundära knappen sjunker inte');
  assert.equal(riktning('.btn.primary'), 'lyft', 'den primära knappen lyfter inte');
  // Samma skydd som T-301: en andra box-shadow i samma block kan vinna i
  // kaskaden medan mätningen läser den första.
  for (const sel of ['.btn', '.btn.primary']) {
    const antal = (regel(sel).match(/box-shadow:/g) || []).length;
    assert.equal(antal, 1, `${sel} har ${antal} box-shadow-deklarationer, ska ha exakt en`);
  }
});

test('T-102: aktivt läge lyfter ALLTID över inaktivt', () => {
  // Det här testet finns för att felet gjordes. Första versionen av förslaget
  // la bakgrunden på .role-btn utan att undanta .active, och den aktiva rollen
  // gick från solid violett med vit text till blek lavendel — den tappade både
  // sin punch och sin kontrast. En djupfix får aldrig göra portalens viktigaste
  // kontroll svagare. Felet syntes på renderingen, inte i koden.
  for (const [inaktiv, aktiv] of [
    ['.role-btn:not(.active)', '.role-btn.active'],
    ['.ordination-mode-btn', '.ordination-mode-btn.active'],
  ]) {
    assert.equal(riktning(inaktiv), 'sänkt', `${inaktiv} sjunker inte`);
    assert.equal(riktning(aktiv), 'lyft', `${aktiv} lyfter inte`);
  }
});

test('T-103: den aktiva rollen behåller vit text på mörk botten', () => {
  // Kontrasten kommer från att knappen är fylld, inte från kulören. Blir den
  // en ljus toning tappar den vita texten sitt underlag.
  const r = regel('.role-btn.active');
  assert.match(r, /color: #fff/, 'den aktiva rollen har inte längre vit text');
  assert.match(
    r,
    /background: linear-gradient\(135deg, var\(--violet\)/,
    'fyllningen är inte mörk'
  );
});

test('T-104: djuplänken lyfter', () => {
  assert.equal(riktning('.deep-link'), 'lyft', 'djuplänken är inte lyft');
});

/* ── §2 Varningarna ───────────────────────────────────────────────────── */

test('T-201: säkerhetsnotisen har samma form som sessionsbannern', () => {
  const r = regel('.safety-notice');
  assert.equal(riktning('.safety-notice'), 'lyft');
  assert.match(r, /position: relative/, 'kulörremsan kan inte positioneras');
  assert.match(KOD, /\.safety-notice::before \{[^}]*width: 4px/s, 'kulörremsan saknas');
});

test('T-202: varningarnas textfärg klarar AA mot sin EGNA yta', () => {
  // Mätt mot bannerns mörkaste punkt, inte mot vit. Den nya ytan går ner till
  // danger 12 %, och där landar var(--danger) på 4,26:1 — UNDER AA. Att bara
  // byta bakgrund hade alltså gjort säkerhetsnotisen mindre läsbar, vilket är
  // precis fel komponent att försämra. #7a2d2d ger 7,88:1.
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const kvot = (a, b) => {
    const [la, lb] = [lum(a), lum(b)];
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  // danger 12 % över nästan vitt = bannerns mörkaste punkt
  const yta = '#f7e8e7';
  for (const sel of ['.safety-notice', '.session-banner.danger']) {
    const m = regel(sel).match(/color: (#[0-9a-fA-F]{6})/);
    assert.ok(m, `${sel} sätter ingen explicit textfärg`);
    const k = kvot(m[1], yta);
    assert.ok(k >= 4.5, `${sel}: ${m[1]} mot ${yta} ger ${k.toFixed(2)}:1, under AA 4,5`);
  }
});

/* ── §3 Sammanhanget ──────────────────────────────────────────────────── */

test('T-301: de åtta sammanhangsytorna är nedsänkta — och bara det', () => {
  // Mutationskörningen avslöjade en lucka i första versionen. Den letade efter
  // att den nedsänkta token FANNS i regeln, och en mutation som la
  // "box-shadow: var(--djup-mellan) !important" högst upp i samma block
  // överlevde: i webbläsaren vann !important och ytan lyfte, men token stod
  // kvar längre ner så testet förblev grönt.
  //
  // En regel får därför ha EXAKT EN box-shadow. Då kan ingen smyga in en andra
  // som vinner i kaskaden medan mätningen tittar på den första.
  for (const sel of [
    '.live-note',
    '.check-item',
    '.handoff-step',
    '.signal-tile',
    '.offer-workmode-step',
    '.schedule-day',
    '.thread-panel',
    '.ord-header',
  ]) {
    const r = regel(sel);
    const antal = (r.match(/box-shadow:/g) || []).length;
    assert.equal(antal, 1, `${sel} har ${antal} box-shadow-deklarationer, ska ha exakt en`);
    assert.equal(riktning(sel), 'sänkt', `${sel} är inte nedsänkt`);
    assert.ok(!/!important/.test(r), `${sel} använder !important och kringgår kaskaden`);
  }
});

test('T-302: live-notisens text klarar AA mot sin nedsänkta yta', () => {
  // ETT KONTRASTFEL SOM FANNS FÖRE OSS. var(--sage) mot 8 % sage-yta gav
  // 3,81:1 — redan under AA, i sextio förekomster. Det upptäcktes för att den
  // NYA ytan mättes innan något ändrades, och den gamla råkade mätas på köpet.
  const r = regel('.live-note');
  assert.match(r, /color: #2e5a47/, 'live-notisen har inte fått sin mörkare ton');
  assert.ok(!/color: var\(--sage\)/.test(r), 'den gamla ljusa sage-texten är tillbaka');
});

/* ── §4 Motprov ───────────────────────────────────────────────────────── */

test('T-401: MOTPROV — appens ram lämnas platt med avsikt', () => {
  // Sidopanelen, mobiltoppen och demoraden är ram, inte innehåll. Ger man dem
  // skugga konkurrerar de med det man faktiskt ska titta på. Utan det här
  // testet blir "lägg skugga på allt" nästa persons tolkning av ORD-243.
  for (const sel of ['.sidebar', '.mobile-topbar', '.demo-bar']) {
    assert.equal(riktning(sel), 'platt', `${sel} har fått skugga — ramen ska vara tyst`);
  }
});

test('T-402: MOTPROV — allt är inte lyft', () => {
  // Om allt poppar poppar ingenting. Kontrollen är att det finns FLER
  // nedsänkta ytor än lyfta bland de vi rört: sammanhang är vanligare än
  // handling, och djupet ska spegla det.
  const lyfta = (KOD.match(/box-shadow: var\(--djup-(liten|mellan|lyft)\)/g) || []).length;
  const sankta = (KOD.match(/box-shadow: var\(--djup-nedsankt\)/g) || []).length;
  assert.ok(sankta >= lyfta, `${lyfta} lyfta mot ${sankta} sänkta — portalen poppar överallt`);
});

test('T-403: receptet används, det kopieras inte', () => {
  // Samma invariant som ORD-242, utsträckt till de nya komponenterna: en
  // handskriven "inset 0 1px 0 vit" betyder att någon slutat ärva receptet.
  // Undantagen är namngivna och måste kunna motiveras.
  const UNDANTAG = [
    ':root',
    '.item-card,',
    '.item-icon',
    '.doc-icon',
    '.conv-avatar',
    'tomt-tillstand::before',
    '.btn.primary', // mörk botten kräver vitare highlight än receptets
    '.role-btn.active', // samma skäl
  ];
  const handskrivna = [];
  for (const m of KOD.matchAll(/inset 0 1px 0 rgba\(255, 255, 255/g)) {
    const start = KOD.lastIndexOf('{', m.index);
    const selStart = Math.max(KOD.lastIndexOf('}', start), KOD.lastIndexOf('{', start - 1)) + 1;
    const sel = KOD.slice(selStart, start).replace(/\s+/g, ' ').trim();
    if (UNDANTAG.some((u) => sel.includes(u))) continue;
    handskrivna.push(sel.slice(-46));
  }
  assert.deepEqual(handskrivna, [], `handskriven highlight i: ${handskrivna.join(', ')}`);
});
