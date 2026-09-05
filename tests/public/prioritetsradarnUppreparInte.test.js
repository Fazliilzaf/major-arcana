'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-233 — ett fält utan värde är inget fält.
 *
 * Prioritetsradarn renderar både arbetskö-poster (som har en patient) och
 * systemnotiser (som inte har det) genom samma kortmall. Detaljcellerna byggdes
 * med fallbacks i stället för villkor:
 *
 *   ['Kund',       detail.customer || item.title || '—']
 *   ['Behandling', detail.treatment || '—']
 *   ['Status',     detail.status || priorityLabel(priority)]
 *   ['Tid',        detail.timing ? formatDateTime(detail.timing) : '—']
 *
 * För en notis utan patientdata fyllde varje fallback luckan med antingen ett
 * streck eller något som redan stod ovanför i samma kort. Resultatet var att
 * titeln syntes två gånger (en gång som rubrik, en gång under "Kund"),
 * prioriteten två gånger (pill + "Status"), tiden två gånger, och att
 * "Behandling" alltid var tomt. Kortet såg ut att bära fyra fält information
 * men bar noll.
 *
 * DET HÄR ÄR INTE ETT STILPROBLEM. Ingen mängd luft eller skuggor gör ett
 * upprepat värde läsbart. Felet satt i vad som renderades, inte i hur.
 *
 * Testet är bundet till GRINDARNA, inte till strängarna. Ett test som bara
 * letar efter ordet "Kund" överlever att filtreringen tas bort, eftersom
 * etiketten står kvar i koden oavsett. Därför mäts i stället att fallback-
 * kedjorna är borta, att filtret finns, och att lådan har ett innehållsvillkor.
 */

const PORTAL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'staff-portal.html'),
  'utf8'
);

/**
 * Klipp ut en funktionskropp med balansräkning, så mätningen inte läser in
 * grannfunktionen. Startar på första klammern EFTER parameterlistan.
 */
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

/**
 * Kommentarer bort innan mätning.
 *
 * FÖRSTA VERSIONEN MÄTTE RÅ KÄLLKOD och blev röd direkt — inte för att koden
 * var fel, utan för att kommentaren som dokumenterar det gamla felet innehåller
 * mönstret `detail.customer || item.title || '—'`. Ett test som letar efter en
 * kodkonstruktion i rå text kan inte skilja koden från texten som beskriver
 * den, så att förklara buggen ordentligt skulle ha gjort testet rött.
 *
 * RADAR_KOD används för allt som mäter konstruktioner. RADAR (med kommentarer)
 * behålls för körningen i T-013/T-014, där kommentarer är harmlösa.
 */
function utanKommentarer(kod) {
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function konstblockLokal(kalla, namn) {
  const start = kalla.indexOf(`const ${namn} =`);
  const slut = kalla.indexOf('\n\n', start);
  return kalla.slice(start, slut === -1 ? start + 2000 : slut);
}

/**
 * ORD-235 lade till ett åldersmärke i alla tre kortrenderarna. Testerna här
 * bygger renderarna isolerat, så beroendet måste injiceras — annars faller de
 * på ReferenceError utan att något är fel i produkten.
 *
 * Den RIKTIGA hjälparen byggs ur källan, inte en stubbe. En stubbe hade gjort
 * testet grönt även om aldersMarke slutade fungera.
 */
const ALDERSKALLA = `${konstblockLokal(PORTAL, 'ALDERSSTEG')}
   function alderTimmar(varde, nu) ${funktionskropp(PORTAL, 'alderTimmar')}
   function aldersNyckel(timmar) ${funktionskropp(PORTAL, 'aldersNyckel')}
   function aldersEtikett(timmar) ${funktionskropp(PORTAL, 'aldersEtikett')}
   function aldersMarke(varde, nu) ${funktionskropp(PORTAL, 'aldersMarke')}`;

const RADAR = funktionskropp(PORTAL, 'renderPriorityRadarCard');
const RADAR_KOD = utanKommentarer(RADAR);

test('T-001: utklippet är renderPriorityRadarCard och inte grannen', () => {
  assert.ok(RADAR_KOD.includes('detailCells'), 'utklippet saknar detailCells');
  assert.ok(RADAR_KOD.includes('priority-card'), 'utklippet saknar priority-card');
  assert.ok(
    !RADAR_KOD.includes('function renderCaseCard'),
    'utklippet har svalt nästa funktion — balansräkningen är fel'
  );
});

test('T-002: Kund-cellen faller inte tillbaka på kortets egen titel', () => {
  assert.ok(
    !/\['Kund',\s*detail\.customer\s*\|\|\s*item\.title/.test(RADAR_KOD),
    'Kund faller fortfarande tillbaka på item.title — titeln skrivs ut två gånger'
  );
});

test('T-003: ingen detaljcell faller tillbaka på ett tankstreck', () => {
  const streckFallback = RADAR_KOD.match(/\|\|\s*'—'/g) || [];
  assert.deepEqual(
    streckFallback,
    [],
    `${streckFallback.length} cell(er) faller tillbaka på '—' i stället för att utelämnas`
  );
});

test('T-004: Status-cellen faller inte tillbaka på prioritetsetiketten', () => {
  assert.ok(
    !/\['Status',\s*detail\.status\s*\|\|\s*priorityLabel/.test(RADAR_KOD),
    'Status faller tillbaka på priorityLabel — samma värde som pillen ovanför'
  );
});

test('T-005: cellerna filtreras mot tomma värden', () => {
  assert.ok(
    /\.filter\(/.test(RADAR_KOD) && /if \(!t \|\| t === '—'\) return false;/.test(RADAR_KOD),
    'filtret som utelämnar tomma celler saknas'
  );
});

test('T-006: cellerna filtreras mot värden som redan syns i kortet', () => {
  assert.ok(RADAR_KOD.includes('redanVisat'), 'mängden redanVisat saknas');
  assert.ok(
    /redanVisat\.has\(/.test(RADAR_KOD),
    'redanVisat byggs men konsulteras aldrig — dubbletter släpps igenom'
  );
});

test('T-007: redanVisat innehåller titel, prioritet och tid', () => {
  const block = RADAR_KOD.slice(RADAR_KOD.indexOf('redanVisat'), RADAR_KOD.indexOf('detailCells'));
  assert.ok(/item\.title/.test(block), 'titeln ingår inte i redanVisat');
  assert.ok(/priorityLabel\(priority\)/.test(block), 'prioriteten ingår inte i redanVisat');
  assert.ok(/formatDateTime\(when\)/.test(block), 'tiden ingår inte i redanVisat');
});

test('T-008: jämförelsen är skiftlägesokänslig och trimmad', () => {
  assert.ok(
    /const jamfor = \(v\) =>[\s\S]{0,120}toLowerCase\(\)/.test(RADAR_KOD),
    'jamfor normaliserar inte — "Notis" och "notis" skulle räknas som olika'
  );
  assert.ok(/\.trim\(\)/.test(RADAR_KOD), 'jamfor trimmar inte');
});

test('T-009: ärendedetaljlådan öppnas bara när den har innehåll', () => {
  assert.ok(RADAR_KOD.includes('harDetaljinnehall'), 'innehållsvillkoret saknas');
  assert.ok(
    /detail\.kind && harDetaljinnehall/.test(RADAR_KOD),
    'lådan grindas fortfarande på detail.kind ensamt och kan ritas tom'
  );
});

test('T-010: rutnätet utelämnas när alla celler filtrerats bort', () => {
  assert.ok(
    /detailCells\.length\s*\n?\s*\?\s*`<div class="case-detail-grid">/.test(RADAR_KOD) ||
      /detailCells\.length[\s\S]{0,40}case-detail-grid/.test(RADAR_KOD),
    'case-detail-grid ritas även när detailCells är tom'
  );
});

test('T-011: kickern upprepar inte källetiketten som redan står som pill', () => {
  assert.ok(
    !/next-action-kicker">Nästa bästa steg · \$\{escapeHtml\(roleCard\?\.badge \|\| sourceLabel\)\}/.test(
      RADAR_KOD
    ),
    'kickern skriver fortfarande ut sourceLabel, som redan syns som pill'
  );
  assert.ok(RADAR_KOD.includes('kickerSuffix'), 'kickerSuffix saknas');
});

test('T-012: sourceLabel används fortfarande — pillen får inte försvinna', () => {
  assert.ok(
    /<span class="pill info">\$\{escapeHtml\(sourceLabel\)\}<\/span>/.test(RADAR_KOD),
    'källetiketten är helt borta; den ska visas en gång, inte noll'
  );
});

/**
 * T-013 mäter det som faktiskt gick fel, inte bara att koden ser rätt ut:
 * kör renderingen för en notis utan patientdata och räkna förekomsterna.
 */
test('T-013: en notis utan patientdata upprepar ingenting', () => {
  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const formatDateTime = () => '2026-09-05 14:20';
  const priorityLabel = (p) => ({ urgent: 'Akut', today: 'Idag', waiting: 'Väntar' })[p] || p;
  const actionPill = () => '';
  const currentRole = 'nurse';

  const fn = new Function(
    'escapeHtml',
    'formatDateTime',
    'priorityLabel',
    'actionPill',
    'currentRole',
    `${ALDERSKALLA}
     return function renderPriorityRadarCard(item) ${RADAR}`
  )(escapeHtml, formatDateTime, priorityLabel, actionPill, currentRole);

  const html = fn({
    source: 'notification',
    priority: 'urgent',
    title: '3 516 mejl väntar i review-kön',
    body: '3 514 saknar patientmatchning.',
    createdAt: '2026-09-05T14:20:00Z',
    detail: { kind: 'system' },
    nextBestAction: { label: 'Öppna mailkön', href: '/x' },
  });

  const antal = (n) => html.split(n).length - 1;

  assert.equal(antal('3 516 mejl väntar i review-kön'), 1, 'titeln skrivs ut mer än en gång');
  assert.equal(antal('Notis'), 1, '"Notis" skrivs ut mer än en gång');
  assert.equal(antal('Akut'), 1, 'prioriteten skrivs ut mer än en gång');
  assert.equal(antal('>—<'), 0, 'ett tomt fält renderas fortfarande');
  assert.equal(antal('case-detail-grid'), 0, 'tomt detaljrutnät renderas');
  assert.equal(antal('Ärendedetalj'), 0, 'tom ärendedetaljlåda renderas');
});

/**
 * T-014 är motprovet till T-013. Ett filter som tar bort ALLT skulle klara
 * varje assertion ovan — den som filtrerar bort hela innehållet upprepar
 * förvisso ingenting. Ett riktigt ärende med patientdata måste fortfarande
 * visa sina celler.
 */
test('T-014: ett riktigt ärende med patientdata behåller sina celler', () => {
  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const formatDateTime = (v) =>
    v === '2026-09-12T09:00:00Z' ? '2026-09-12 09:00' : '2026-09-05 14:20';
  const priorityLabel = (p) => ({ urgent: 'Akut', today: 'Idag', waiting: 'Väntar' })[p] || p;
  const actionPill = () => '';
  const currentRole = 'nurse';

  const fn = new Function(
    'escapeHtml',
    'formatDateTime',
    'priorityLabel',
    'actionPill',
    'currentRole',
    `${ALDERSKALLA}
     return function renderPriorityRadarCard(item) ${RADAR}`
  )(escapeHtml, formatDateTime, priorityLabel, actionPill, currentRole);

  const html = fn({
    source: 'queue',
    priority: 'today',
    title: 'Magnus E. — förberedelse',
    createdAt: '2026-09-05T14:20:00Z',
    detail: {
      kind: 'case',
      customer: 'Magnus Eriksson',
      treatment: 'FUE 3000 grafter',
      status: 'Väntar på ordination',
      timing: '2026-09-12T09:00:00Z',
    },
  });

  assert.ok(html.includes('case-detail-grid'), 'rutnätet försvann för ett riktigt ärende');
  assert.ok(html.includes('Magnus Eriksson'), 'kundnamnet filtrerades bort');
  assert.ok(html.includes('FUE 3000 grafter'), 'behandlingen filtrerades bort');
  assert.ok(html.includes('Väntar på ordination'), 'statusen filtrerades bort');
  assert.ok(html.includes('2026-09-12 09:00'), 'tiden filtrerades bort');
  assert.ok(html.includes('Ärendedetalj'), 'detaljlådan öppnades inte för ett riktigt ärende');
});
