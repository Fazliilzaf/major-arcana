'use strict';

/**
 * ORD-87 — Snitt LTV i Översikt.
 *
 * Noden `[data-v9-snitt-ltv-value]` fanns redan i markupen. Den läste
 * `stats.totalRevenue` — ett fält getTenantStats ALDRIG har skickat. Den har
 * alltså visat "—" hela tiden medan 41 489 801 kr låg uträknade per kund och
 * renderades på varje kundkort.
 *
 * Det här testet läser källan i stället för att rendera. Klientbundeln är en
 * IIFE utan exporter och kan inte laddas i test — men de tre villkor som
 * faktiskt kan gå sönder är läsbara i texten:
 *
 *   1. Den läser de NYA fälten, inte det som aldrig fanns.
 *   2. Nämnaren SKRIVS UT. Snittet är vunnet delat med hela registret; med de
 *      726 som nämnare blir talet tio gånger större och besvarar en annan fråga.
 *   3. Trendraden kallar ALDRIG öppna affärer för intäkt. Ordvalet är Fazlis
 *      beslut och är hela skillnaden mellan ett beslutsunderlag och en lögn.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROT = path.join(__dirname, '..', '..');
const UI = fs.readFileSync(
  path.join(ROT, 'public', 'major-arcana-preview', 'app', 'patient-master-ui.js'),
  'utf8'
);
const HTML = fs.readFileSync(
  path.join(ROT, 'public', 'major-arcana-preview', 'index.html'),
  'utf8'
);
const CSS = fs.readFileSync(
  path.join(ROT, 'public', 'major-arcana-preview', 'cco-v9-customers.css'),
  'utf8'
);

function renderHeaderKropp() {
  const start = UI.indexOf('function renderV9MetricHeader');
  assert.ok(start > 0, 'renderV9MetricHeader ska finnas');
  const slut = UI.indexOf('\n  function ', start + 10);
  return UI.slice(start, slut > start ? slut : undefined);
}

test('läser aggregatet, inte fältet som aldrig fanns', () => {
  const kropp = renderHeaderKropp();
  assert.match(kropp, /lifetimeValueAverage/, 'snittet ska komma från aggregatet');
  assert.match(kropp, /lifetimeValueDenominator/, 'nämnaren ska läsas explicit');
  assert.match(kropp, /wonDealsTotal/, 'vunnet ska läsas');
});

test('NÄMNAREN skrivs ut i UI:t — talet får inte stå ensamt', () => {
  const kropp = renderHeaderKropp();
  assert.match(
    kropp,
    /snitt över \$\{formatMetricNumber\(denominator\)\} kunder/,
    'antalet kunder snittet vilar på ska synas för användaren'
  );
});

test('trendraden bär PIPEN och kallar den offert, aldrig intäkt', () => {
  const kropp = renderHeaderKropp();
  assert.match(kropp, /openDealsTotal/, 'trendraden ska läsa öppna affärer');
  assert.match(kropp, /öppna offerter/, 'ordvalet ska vara offert');

  // Det farliga felet: att presentera pipen som pengar som kommit in.
  const radMedÖppet = kropp
    .split('\n')
    .filter((rad) => /openDealsTotal|öppna offerter/.test(rad))
    .join('\n');
  assert.doesNotMatch(
    radMedÖppet,
    /intäkt|omsättning|inkomst/i,
    'öppna affärer får ALDRIG presenteras som intäkt'
  );
});

test('golvet framgår — talet är inte ett facit', () => {
  const kropp = renderHeaderKropp();
  assert.match(kropp, /[Gg]olv/, 'att summan är ett golv ska framgå för användaren');
  assert.match(
    kropp,
    /aldrig matchats/,
    'skälet ska stå: kunder vars affärer aldrig matchats saknas'
  );
});

test('trendnoden finns i markupen och har CSS', () => {
  assert.match(HTML, /data-v9-snitt-ltv-trend/, 'noden ska finnas i index.html');
  assert.match(CSS, /\.v9-snitt-ltv-trend\b/, 'noden ska ha en stilregel');
});

test('DESIGN: trendraden inför inga nya färger eller typsnitt', () => {
  // Fazlis regel: följ befintlig design exakt, aldrig en ny. Regeln får bara
  // återanvända tokens som redan finns i filen.
  const start = CSS.indexOf('.v9-snitt-ltv-trend {');
  assert.ok(start > 0, 'stilregeln ska finnas');
  const block = CSS.slice(start, CSS.indexOf('}', start));

  const hårdkodadFärg = block.match(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.equal(hårdkodadFärg, null, `ingen hårdkodad färg tillåten, hittade: ${hårdkodadFärg}`);
  assert.doesNotMatch(block, /font-family/, 'inget nytt typsnitt');
  assert.match(block, /var\(--v9-/, 'ska använda befintliga v9-tokens');
});

test('bakåt-kompat: äldre svar utan aggregat ger inte NaN', () => {
  const kropp = renderHeaderKropp();
  // Fallbacken finns kvar så en gammal cachad payload inte skriver "NaN kr"
  // i huvudet under de sextio sekunder cachen lever efter en deploy.
  assert.match(kropp, /stats\.totalRevenue/, 'gamla fältnamnet ska finnas kvar som fallback');
  assert.match(kropp, /denominator > 0/, 'division ska skyddas mot noll');
});
