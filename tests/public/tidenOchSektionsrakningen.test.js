'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');

/**
 * ORD-235 §1–§3 — tiden, talet och tomheten.
 *
 * §1 TIDEN SOM SYNLIG AXEL
 * Portalens fem färger sa vad något ÄR — bokning, avvikelse, notis. Men i en
 * klinik avgör nästan aldrig kategorin vad man gör härnäst; det gör väntetiden.
 * Mätt före ändringen styrde ålder utseendet på exakt ETT ställe i hela filen
 * (en SLA-pill), trots att createdAt/startsAt/timing.* fanns överallt.
 *
 * §2 RUBRIKEN SKA BÄRA ETT TAL
 * Noll av femtio rubriker visade hur mycket de rymde. Räkningen sker på det som
 * FAKTISKT renderats — ett tal som räknas vid sidan av listan börjar ljuga
 * första gången någon filtrerar listan utan att uppdatera talet.
 *
 * §3 DET TOMMA TILLSTÅNDET
 * 248 gråa rader formulerade som fel. Men "Inga aktiva konversationer" är det
 * tillstånd en välskött klinik är i för det mesta. Texten är riktig och rörs
 * inte; presentationen gjorde en prestation till en ursäkt.
 *
 * DEN FARLIGA MUTATIONEN, som flera tester nedan finns till för:
 * en åldersmarkering som visas ÄVEN när tiden är okänd. Då påstår kortet en
 * väntetid det inte vet något om — och i ett kliniskt verktyg är ett påhittat
 * "4 d försenad" värre än ingen markering alls.
 */

const PORTAL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'staff-portal.html'),
  'utf8'
);

function funktionskropp(kalla, namn) {
  const start = kalla.indexOf(`function ${namn}(`);
  assert.notEqual(start, -1, `hittar inte function ${namn}(`);
  const parStart = kalla.indexOf('(', start);
  let par = 0;
  let i = parStart;
  for (; i < kalla.length; i += 1) {
    if (kalla[i] === '(') par += 1;
    else if (kalla[i] === ')') {
      par -= 1;
      if (par === 0) break;
    }
  }
  const kroppStart = kalla.indexOf('{', i);
  let djup = 0;
  for (let j = kroppStart; j < kalla.length; j += 1) {
    if (kalla[j] === '{') djup += 1;
    else if (kalla[j] === '}') {
      djup -= 1;
      if (djup === 0) return kalla.slice(kroppStart, j + 1);
    }
  }
  throw new Error(`obalanserade klamrar i ${namn}`);
}

function konstblock(kalla, namn) {
  const start = kalla.indexOf(`const ${namn} =`);
  assert.notEqual(start, -1, `hittar inte const ${namn}`);
  const slut = kalla.indexOf('\n\n', start);
  return kalla.slice(start, slut === -1 ? start + 2000 : slut);
}

function utanKommentarer(kod) {
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Bygg åldershjälparna körbara. */
const alder = new Function(
  'escapeHtml',
  `${konstblock(PORTAL, 'ALDERSSTEG')}
   function alderTimmar(varde, nu) ${funktionskropp(PORTAL, 'alderTimmar')}
   function aldersNyckel(timmar) ${funktionskropp(PORTAL, 'aldersNyckel')}
   function aldersEtikett(timmar) ${funktionskropp(PORTAL, 'aldersEtikett')}
   function aldersMarke(varde, nu) ${funktionskropp(PORTAL, 'aldersMarke')}
   return { alderTimmar, aldersNyckel, aldersEtikett, aldersMarke };`
)((s) => String(s));

/** Bygg sektionsräknaren körbar. */
const sektion = new Function(
  `${konstblock(PORTAL, 'KORTVALJARE')}
   ${konstblock(PORTAL, 'TOMMONSTER')}
   let sektionsuppdateringPagar = false;
   function sektionsText(totalt, forsenade) ${funktionskropp(PORTAL, 'sektionsText')}
   function arTomtBesked(text) ${funktionskropp(PORTAL, 'arTomtBesked')}
   function uppdateraSektioner(rot) ${funktionskropp(PORTAL, 'uppdateraSektioner')}
   return { sektionsText, arTomtBesked, uppdateraSektioner };`
)();

const NU = new Date('2026-09-05T12:00:00Z').getTime();
const timmarSedan = (h) => new Date(NU - h * 3600000).toISOString();

/* ── §1 Ålder ─────────────────────────────────────────────────────────── */

test('T-001: väntetiden räknas i timmar från tidpunkten', () => {
  assert.equal(Math.round(alder.alderTimmar(timmarSedan(5), NU)), 5);
  assert.equal(Math.round(alder.alderTimmar(timmarSedan(100), NU)), 100);
});

test('T-002: saknad eller ogiltig tid ger null — inte noll', () => {
  // Noll hade betytt "alldeles nyss" och gjort saknad data till det mest
  // lugnande tillståndet. Det är precis fel håll att gissa åt.
  assert.equal(alder.alderTimmar(null, NU), null);
  assert.equal(alder.alderTimmar('', NU), null);
  assert.equal(alder.alderTimmar(undefined, NU), null);
  assert.equal(alder.alderTimmar('inte ett datum', NU), null);
});

test('T-003: framtida tider är inte väntetid', () => {
  // En bokning nästa vecka har inte "väntat" i minus 168 timmar.
  assert.equal(alder.alderTimmar(timmarSedan(-168), NU), null);
});

test('T-004: stegen bryter vid 4, 24 och 72 timmar', () => {
  assert.equal(alder.aldersNyckel(0.5), 'fersk');
  assert.equal(alder.aldersNyckel(3.9), 'fersk');
  assert.equal(alder.aldersNyckel(4), 'idag');
  assert.equal(alder.aldersNyckel(23.9), 'idag');
  assert.equal(alder.aldersNyckel(24), 'vantat');
  assert.equal(alder.aldersNyckel(71.9), 'vantat');
  assert.equal(alder.aldersNyckel(72), 'forsenad');
  assert.equal(alder.aldersNyckel(1000), 'forsenad');
});

test('T-005: okänd ålder ger ingen nyckel alls', () => {
  assert.equal(alder.aldersNyckel(null), '');
  assert.equal(alder.aldersNyckel(undefined), '');
});

test('T-006: etiketten byter enhet vid en timme och två dygn', () => {
  assert.equal(alder.aldersEtikett(0.2), '12 m');
  assert.equal(alder.aldersEtikett(2), '2 h');
  assert.equal(alder.aldersEtikett(19), '19 h');
  assert.equal(alder.aldersEtikett(47), '47 h');
  assert.equal(alder.aldersEtikett(96), '4 d');
});

test('T-007: minutetiketten blir aldrig "0 m"', () => {
  assert.equal(alder.aldersEtikett(0.001), '1 m');
});

test('T-101: MOTPROV — okänd tid ger INGET åldersmärke', () => {
  // Den farligaste mutationen: ett kort som påstår en väntetid det inte vet
  // något om. Hellre ingen markering än ett påhittat "försenad".
  const m = alder.aldersMarke(null, NU);
  assert.equal(m.klass, '', 'en klass sattes trots okänd tid');
  assert.equal(m.html, '', 'ett märke renderades trots okänd tid');
});

test('T-102: MOTPROV — framtida tid ger inget åldersmärke', () => {
  const m = alder.aldersMarke(timmarSedan(-48), NU);
  assert.equal(m.klass, '');
  assert.equal(m.html, '');
});

test('T-008: märket bär både klass och läsbart tal', () => {
  const m = alder.aldersMarke(timmarSedan(96), NU);
  assert.equal(m.klass, 'alder-forsenad');
  assert.ok(m.html.includes('4 d'), 'talet saknas');
  assert.ok(m.html.includes('Försenad'), 'tillståndsordet saknas');
});

/* ── §2 Sektionsräkningen ─────────────────────────────────────────────── */

test('T-201: texten visar bara talet när inget är försenat', () => {
  assert.equal(sektion.sektionsText(12, 0), '12');
});

test('T-202: texten lyfter fram försenade när de finns', () => {
  assert.equal(sektion.sektionsText(12, 3), '12 · 3 försenade');
});

test('T-203: en tom sektion får ingen text', () => {
  assert.equal(sektion.sektionsText(0, 0), '');
});

function bygg(html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  return document;
}

test('T-204: rubriken får ett tal som räknar de faktiska korten', () => {
  const d = bygg(`
    <div class="section-title">Konversationer</div>
    <div class="conv-list">
      <div class="conv-row"></div>
      <div class="conv-row"></div>
      <div class="conv-row"></div>
    </div>
    <div class="section-title">Kliniknotiser</div>
    <div class="card-list"><div class="item-card"></div></div>
  `);
  sektion.uppdateraSektioner(d);
  const tal = Array.from(d.querySelectorAll('.sektionsrakning')).map((e) => e.textContent);
  assert.deepEqual(tal, ['3', '1']);
});

test('T-205: räkningen stannar vid nästa rubrik och läcker inte', () => {
  const d = bygg(`
    <div class="section-title">Först</div>
    <div class="card-list"><div class="item-card"></div></div>
    <div class="section-title">Sedan</div>
    <div class="card-list">
      <div class="item-card"></div><div class="item-card"></div>
    </div>
  `);
  sektion.uppdateraSektioner(d);
  const tal = Array.from(d.querySelectorAll('.sektionsrakning')).map((e) => e.textContent);
  assert.deepEqual(tal, ['1', '2'], 'korten räknades in i fel sektion');
});

test('T-206: försenade kort lyfts i rubriken', () => {
  const d = bygg(`
    <div class="section-title">Prioritetsradar</div>
    <div class="card-list">
      <div class="item-card alder-forsenad"></div>
      <div class="item-card alder-fersk"></div>
      <div class="item-card alder-forsenad"></div>
    </div>
  `);
  sektion.uppdateraSektioner(d);
  const r = d.querySelector('.sektionsrakning');
  assert.equal(r.textContent, '3 · 2 försenade');
  assert.ok(r.classList.contains('har-forsenade'), 'markeringsklassen saknas');
});

test('T-207: räkningen uppdateras vid ny körning, den staplas inte', () => {
  const d = bygg(`
    <div class="section-title">Konversationer</div>
    <div class="conv-list"><div class="conv-row"></div></div>
  `);
  sektion.uppdateraSektioner(d);
  sektion.uppdateraSektioner(d);
  sektion.uppdateraSektioner(d);
  assert.equal(d.querySelectorAll('.sektionsrakning').length, 1, 'flera tal staplades');
  assert.equal(d.querySelector('.sektionsrakning').textContent, '1');
});

test('T-208: talet tas bort när sektionen töms', () => {
  const d = bygg(`
    <div class="section-title">Konversationer</div>
    <div class="conv-list"><div class="conv-row"></div></div>
  `);
  sektion.uppdateraSektioner(d);
  assert.equal(d.querySelectorAll('.sektionsrakning').length, 1);
  d.querySelector('.conv-row').remove();
  sektion.uppdateraSektioner(d);
  assert.equal(d.querySelectorAll('.sektionsrakning').length, 0, 'ett stale tal blev kvar');
});

/* ── §3 Tomma tillståndet ─────────────────────────────────────────────── */

test('T-301: besked som börjar med Inga/Inget/Ingen känns igen', () => {
  assert.equal(sektion.arTomtBesked('Inga aktiva konversationer i inkorgen.'), true);
  assert.equal(sektion.arTomtBesked('Inget att göra här.'), true);
  assert.equal(sektion.arTomtBesked('Ingen kundkoppling'), true);
  assert.equal(sektion.arTomtBesked('Alla aktiva tjänster har tider.'), true);
});

test('T-302: MOTPROV — ett riktigt felmeddelande är inte ett tomt tillstånd', () => {
  // Att måla ett fel grönt med en bock vore värre än att inte göra något alls.
  assert.equal(sektion.arTomtBesked('Delegeringar kunde inte hämtas just nu.'), false);
  assert.equal(sektion.arTomtBesked('Konversationslistan är inte tillgänglig.'), false);
  assert.equal(sektion.arTomtBesked(''), false);
});

test('T-303: beskedet blir tomt tillstånd bara när sektionen faktiskt är tom', () => {
  const d = bygg(`
    <div class="section-title">Konversationer</div>
    <div class="conv-list">
      <div class="live-note">Inga aktiva konversationer i inkorgen.</div>
    </div>
  `);
  sektion.uppdateraSektioner(d);
  assert.ok(
    d.querySelector('.live-note').classList.contains('tomt-tillstand'),
    'tomma tillståndet märktes inte'
  );
});

test('T-304: MOTPROV — ett besked bredvid riktiga kort märks INTE som tomt', () => {
  const d = bygg(`
    <div class="section-title">Konversationer</div>
    <div class="conv-list">
      <div class="live-note">Inga olästa just nu.</div>
      <div class="conv-row"></div>
    </div>
  `);
  sektion.uppdateraSektioner(d);
  assert.equal(
    d.querySelector('.live-note').classList.contains('tomt-tillstand'),
    false,
    'en sektion med kort målades som tom'
  );
});

test('T-305: märkningen tas tillbaka när sektionen fylls', () => {
  const d = bygg(`
    <div class="section-title">Konversationer</div>
    <div class="conv-list"><div class="live-note">Inga aktiva konversationer.</div></div>
  `);
  sektion.uppdateraSektioner(d);
  assert.ok(d.querySelector('.live-note').classList.contains('tomt-tillstand'));

  const rad = d.createElement('div');
  rad.className = 'conv-row';
  d.querySelector('.conv-list').appendChild(rad);
  sektion.uppdateraSektioner(d);
  assert.equal(
    d.querySelector('.live-note').classList.contains('tomt-tillstand'),
    false,
    'märkningen satt kvar när sektionen fyllts'
  );
});

/* ── Kopplingar i portalen ────────────────────────────────────────────── */

const RADAR = utanKommentarer(funktionskropp(PORTAL, 'renderPriorityRadarCard'));
const CONV = utanKommentarer(funktionskropp(PORTAL, 'renderConvRow'));
const NOTIS = utanKommentarer(funktionskropp(PORTAL, 'renderNotificationCard'));

test('T-401: alla tre kortrenderarna använder åldersmärket', () => {
  for (const [namn, kod] of [
    ['renderPriorityRadarCard', RADAR],
    ['renderConvRow', CONV],
    ['renderNotificationCard', NOTIS],
  ]) {
    assert.ok(kod.includes('aldersMarke('), `${namn} härleder ingen ålder`);
    assert.ok(kod.includes('alder.klass'), `${namn} sätter ingen åldersklass`);
    assert.ok(kod.includes('alder.html'), `${namn} renderar inget åldersmärke`);
  }
});

test('T-402: skuggan läser åldern med kategorin som reserv', () => {
  assert.ok(
    PORTAL.includes(
      'rgba(var(--alder-rgb, var(--cc-rgb, var(--brand-rgb))), var(--alder-f, 0.16))'
    ),
    'kortskuggan läser inte --alder-rgb med reservkedja'
  );
});

test('T-403: ikonen behåller KATEGORIN — den ska inte åldras', () => {
  const ikon = PORTAL.slice(PORTAL.indexOf('.item-icon {'), PORTAL.indexOf('.item-body {'));
  assert.ok(ikon.includes('--cc-rgb'), 'ikonen läser inte kategorifärgen');
  assert.ok(!ikon.includes('--alder-rgb'), 'ikonen åldras — kategorin går förlorad');
});

test('T-404: observatören skyddar mot att trigga sig själv', () => {
  const obs = utanKommentarer(funktionskropp(PORTAL, 'startaSektionsobservator'));
  assert.ok(
    obs.includes('sektionsuppdateringPagar'),
    'observatören saknar loopskydd och skulle trigga sig själv i oändlighet'
  );
});
