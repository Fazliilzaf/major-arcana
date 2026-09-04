'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-220 — de fem panelerna utan data.
 *
 * No-show-AI, Ny bokning, Patient-hub, Signaturer och Svarstudio hade noll
 * `fetch(` och visade hårdkodad demodata: 7 200 rader gränssnitt utan något
 * bakom.
 *
 * EN RÄTTELSE AV MIN EGEN INVENTERING FÖRST. `svarstudio-v2.html` är inget
 * fristående gränssnitt utan ett FRAGMENT som injiceras i shadow-DOM av
 * `konversationer-bottom-actions.js`. Att den saknar fetch är avsiktligt —
 * värden hämtar. Jag räknade den som kuliss på fel grund. Luckan där var en
 * annan: värden band exempelmeddelandena bara i två av tre fall.
 *
 * DEN GEMENSAMMA REGELN i allt nedan: hårdkodade siffror och namn som ser ut
 * som mätvärden eller patienter får inte visas i en skarp vy. Där en källa
 * finns hämtas den; där ingen finns skrivs det ut att den saknas. Ett fält som
 * säger "vet inte" är mer användbart än ett som gissar.
 */

const ROT = path.join(__dirname, '..', '..');
const PREVIEW = path.join(ROT, 'public', 'major-arcana-preview');

function las(p) {
  return fs.readFileSync(p, 'utf8');
}
const HJALPARE = las(path.join(PREVIEW, 'cco-panel-data.js'));
const NOSHOW = las(path.join(PREVIEW, 'cco-no-show-ai-v3.html'));
const BOKNING = las(path.join(PREVIEW, 'cco-ny-bokning.html'));
const HUB = las(path.join(PREVIEW, 'cco-patient-hub-v3.html'));
const SIGN = las(path.join(PREVIEW, 'cco-signaturer-v3.html'));
const VARD = las(path.join(ROT, 'public', 'konversationer-bottom-actions.js'));

const PANELER = [
  ['cco-no-show-ai-v3.html', NOSHOW],
  ['cco-ny-bokning.html', BOKNING],
  ['cco-patient-hub-v3.html', HUB],
  ['cco-signaturer-v3.html', SIGN],
];

test('DATAHJÄLPAREN skiljer laddar, fel och tomt — tre tillstånd, inte två', () => {
  /**
   * Skälet den finns. Fem paneler med var sin fetch hade gett fem varianter
   * av `catch { visa tomt }` — buggen i Skickat-panelen (ORD-214) och i
   * mallistan (ORD-216) uppstod oberoende av varandra, i olika filer, av
   * samma anledning.
   */
  for (const tillstand of ['laddar', 'fel', 'tom']) {
    assert.ok(
      HJALPARE.includes(`tillstand === '${tillstand}'`),
      `tillståndet ${tillstand} hanteras inte`
    );
  }
  /**
   * FEL- OCH TOMGRENEN MÅSTE SKILJA SIG ÅT, inte bara innehålla rätt ord.
   *
   * Första versionen letade efter strängen "okänd, inte tom". En mutation som
   * bytte ut rubriken mot "Inget att visa" men lämnade resten överlevde —
   * strängen fanns kvar, men grenen ritade nu samma sak som tomtillståndet.
   * Det är precis buggen kontrollen finns för.
   */
  function gren(namn) {
    const i = HJALPARE.indexOf(`tillstand === '${namn}'`);
    assert.notEqual(i, -1, `grenen ${namn} hittades inte`);
    return HJALPARE.slice(i, i + 700);
  }
  const felGren = gren('fel');
  const tomGren = gren('tom');
  assert.match(felGren, /Kunde inte hämta data/, 'felgrenen säger inte att något gick fel');
  assert.match(felGren, /cco-state--fel/, 'felgrenen är inte märkt som fel');
  assert.ok(
    !/Inget att visa/.test(felGren.slice(0, felGren.indexOf("tillstand === 'tom'") + 1 || 400)),
    'felgrenen ritar tomtext'
  );
  assert.match(tomGren, /cco-state--tom/, 'tomgrenen är inte märkt som tom');
  // ccoFetch måste KASTA vid icke-2xx. Sväljs felet där är hela poängen borta.
  assert.match(HJALPARE, /if \(!res\.ok\) \{[\s\S]{0,120}throw err;/, 'ccoFetch sväljer fel');
});

test('HJÄLPAREN skickar aldrig sentineltoken som auth', () => {
  // `__preview_local__` betyder "ingen riktig session". Skickas den får man
  // 401 på något som inte var ett inloggningsförsök — och felsökningen leds
  // fel.
  assert.match(HJALPARE, /token !== '__preview_local__'/);
});

test('ALLA FYRA panelerna laddar hjälparen FÖRE sina egna skript', () => {
  /**
   * Ordningsfel jag gjorde först: taggen hamnade sist i body, alltså efter
   * panelens egen IIFE. Panelen föll då tillbaka på "datahjälparen saknas"
   * varje gång — och det hade sett ut som ett laddningsfel, inte som ett
   * ordningsfel.
   */
  for (const [namn, kall] of PANELER) {
    const iHjalpare = kall.indexOf('cco-panel-data.js');
    const iBody = kall.indexOf('<body');
    assert.notEqual(iHjalpare, -1, `${namn} laddar inte hjälparen`);
    assert.ok(iHjalpare < iBody, `${namn}: hjälparen laddas efter body`);
  }
});

test('NO-SHOW: ingen påhittad riskprocent, och skälet står utskrivet', () => {
  /**
   * Panelen visade "7 högrisk", "14 200 kr besparing", "87% modell-precision"
   * och "-38% no-show-rate sedan modellen togs in (mars)". Det finns ingen
   * no-show-modell i CCO — mätt 2026-09-04.
   *
   * En påhittad riskprocent på en namngiven patient är samma sorts fel som
   * demopatienterna i ORD-212, fast värre: den ser ut som ett underlag för
   * att ringa någon.
   */
  /**
   * De påhittade värdena finns kvar i markupen — men INTE synliga.
   *
   * Min första version krävde att de var borta. Det hade betytt att slänga
   * designarbetet. Testet mäter i stället att de ligger bakom en spärr:
   * hela utkastet är `hidden` tills någon aktivt ber om det, och knappen
   * säger att siffrorna är påhittade.
   *
   * Det farligaste var inte KPI-raden utan korten: "Ring Henrik nu — 87%
   * no-show-risk för dagens 15:00" är en uppmaning att kontakta en patient,
   * byggd på en siffra ingen modell räknat fram. Ett varningsband ovanför
   * räcker inte — man agerar på kortet, inte på bandet.
   */
  assert.match(NOSHOW, /<div class="layout" id="nsUtkast" hidden>/, 'utkastet är inte dolt');
  assert.match(NOSHOW, /påhittade siffror/, 'knappen säger inte vad utkastet är');
  assert.match(NOSHOW, /Ingen riskmodell är byggd/, 'panelen säger inte att modellen saknas');
  assert.match(NOSHOW, /ingen modell finns ännu/, 'fälten utan källa förklaras inte');

  // Och KPI-raden överst får inte innehålla de påhittade värdena — den är
  // synlig utan att någon klickat på något.
  const overUtkast = NOSHOW.slice(0, NOSHOW.indexOf('id="nsUtkast"'));
  for (const pahittat of ['87%<', '14 200 kr<', '-38%<']) {
    assert.ok(!overUtkast.includes(pahittat), `"${pahittat}" visas utan spärr`);
  }
  // Det som FINNS mätt ska hämtas.
  assert.match(NOSHOW, /monitor\/clinic-performance/, 'den riktiga KPI-källan används inte');
});

test('NY BOKNING: inga hårdkodade lediga tider', () => {
  /**
   * Dagarna var låsta till 25–31 och tiderna till nio klockslag. Den som
   * bokade utifrån dem lovade en tid kliniken inte hade.
   */
  assert.ok(!/<div class="slot">08:30<\/div>/.test(BOKNING), 'de hårdkodade tiderna står kvar');
  assert.ok(!/<div class="num">25<\/div>/.test(BOKNING), 'de hårdkodade dagarna står kvar');
  assert.match(BOKNING, /cco-bookings\/slots/, 'tiderna hämtas inte');

  /**
   * OCH DEN VIKTIGASTE RADEN: bara det servern kallar ledigt får ritas som
   * ledigt. Att gissa åt fel håll bokar en patient på en upptagen tid.
   */
  assert.match(
    BOKNING,
    /sl\.available === true \|\| sl\.status === 'available'/,
    'tider filtreras inte på ledig-status'
  );
});

test('PATIENT-HUB: siffrorna är tankstreck tills de hämtats', () => {
  // 2 olästa / 3 avsnitt / 1 återbesök var hårdkodat och såg ut som mätvärden.
  assert.match(HUB, /id="phOlasta">—</, 'olästa startar inte som okänt');
  assert.match(HUB, /id="phAterbesok">—</, 'återbesök startar inte som okänt');
  assert.match(HUB, /portal-messages/, 'olästa hämtas inte');
  assert.match(HUB, /dossier-bundle/, 'kommande besök hämtas inte');

  // "Avsnitt att läsa" har ingen källa per kund. Det ska förbli okänt.
  assert.match(HUB, /satt\('phAvsnitt', null\)/, 'ett fält utan källa fylls med något');
});

test('SIGNATURER: de nio påhittade ärendena visas inte längre', () => {
  /**
   * REQS var nio signeringsförfrågningar med namn, tokens och BankID-loggar.
   * Det finns ingen tenant-bred signeringslista i CCO — mätt 2026-09-04.
   * Rapporten över SAKNADE formulär svarar på samma fråga från andra hållet.
   */
  assert.match(SIGN, /ops\/cco-care\/missing-forms-report/, 'ingen riktig källa används');
  assert.match(SIGN, /var RIKTIGA = null;/, 'listan initieras inte som okänd');
  assert.match(SIGN, /Listan är <em>okänd<\/em>, inte tom/, 'fel renderas som tomt');

  // Token och BankID-logg går inte att härleda ur rapporten och ska lämnas
  // tomma — en påhittad BankID-logg i en signeringsvy är värre än ingen.
  const fn = SIGN.slice(SIGN.indexOf('function franRapport('), SIGN.indexOf('function render()'));
  assert.match(fn, /token: '',/, 'token hittas på');
  assert.match(fn, /signedAt: '',/, 'signeringstid hittas på');
});

test('SVARSTUDIO: exempelmeddelanden kan inte visas i en riktig tråd', () => {
  /**
   * Fragmentet har tre exempelmeddelanden i markupen. Värden skrev över dem i
   * två fall av tre — men inte när tråden var riktig och saknade meddelanden
   * i kontexten. Då stod "Går fredag bra? Tack för snabbt svar 🙏" kvar under
   * en riktig kunds namn.
   */
  assert.match(
    VARD,
    /\} else if \(msgsWrap && ctx\.conversationKey\) \{/,
    'det tredje fallet hanteras inte'
  );
  assert.match(VARD, /Inga meddelanden kunde läsas in för den här tråden/);

  // Motprovet: exemplen finns kvar i fragmentet, annars mäter testet en tom
  // fil i stället för en spärr.
  const FRAGMENT = las(path.join(ROT, 'public', 'svarstudio-v2.html'));
  assert.match(FRAGMENT, /Går fredag bra/, 'exempeldatan är borta — skriv om testet');
});

test('INGEN av panelerna sväljer fel som tomt', () => {
  /**
   * Regressionsspärren mot hela familjen. Ett `catch` som ritar tomstatus är
   * det återkommande felet i den här kodbasen — tre oberoende förekomster
   * hittades på ett dygn (ORD-214, ORD-216 och den här punkten).
   */
  for (const [namn, kall] of PANELER) {
    const tomtICatch =
      /catch\s*(\([^)]*\))?\s*\{[^}]{0,200}(tomText|Inga|innerHTML = ''\s*;?\s*\})/s;
    const traffar = kall.match(/catch\s*(\([^)]*\))?\s*\{[\s\S]{0,300}?\}/g) || [];
    for (const block of traffar) {
      if (!/CCOPanelData|D\.fetch|apiFetch|fetch\(/.test(block) && /Inga /.test(block)) {
        assert.fail(`${namn}: ett catch-block ritar tomstatus\n${block}`);
      }
    }
    void tomtICatch;
  }
});
