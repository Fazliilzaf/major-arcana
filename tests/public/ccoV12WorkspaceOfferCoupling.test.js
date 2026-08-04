'use strict';

/**
 * V12-ARBETSYTAN VISADE ALLTID "INGA OFFERTER ÄNNU".
 *
 * Samma blindfläck som rättades i rk-railen (`ccoV11RailOfferCoupling.test.js`),
 * fast ett lager längre in. `buildOffersFromPayload` läste bara
 * `payload.offers`, `dossierBundle.documents.offers` och `card.offers` — aldrig
 * `commercialCase`. Och `commercialCase` är ETT ärende, inte en lista:
 * `normalizeCommercialCase` (`ccoCommercialStore.js:494`) ger ett platt objekt
 * med `quoteStatus`, `quotedAmount`, `esignToken`.
 *
 * Dessutom byggdes v12:s ctx (`patient-master-ui.js:6993`) helt utan
 * `commercialCase`, trots att `railCtx` på `:6880` redan fick det. Utan BÅDA
 * leden syns ingen offert — därför vaktas båda.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PREVIEW_APP = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app');

function loadAdapters() {
  const source = fs.readFileSync(path.join(PREVIEW_APP, 'cco-v11-rail-adapters.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${source}\n;this.adapters = window.CcoV11RailAdapters;`, sandbox);
  return sandbox.adapters;
}

const COMMERCIAL_CASE = {
  offerType: 'DHI',
  quoteStatus: 'sent',
  quotedAmount: '45 000 kr',
  quoteSentAt: '2026-07-01',
  esignToken: 'tok-abc-123',
};

test('ett offert-ärende blir en offertrad när ingen äkta lista finns', () => {
  const adapters = loadAdapters();
  const result = adapters.buildOffersFromPayload({}, null, COMMERCIAL_CASE);

  assert.equal(result.count, 1, 'ärendet ska ge exakt en rad');
  assert.equal(result.items[0].title, 'DHI');
  assert.equal(result.items[0].amount, '45 000 kr');
  assert.equal(result.items[0].status, 'sent');
});

test('statusetiketten går via den befintliga mappningen, inte råvärdet', () => {
  const adapters = loadAdapters();
  const result = adapters.buildOffersFromPayload({}, null, COMMERCIAL_CASE);
  assert.equal(
    result.items[0].statusLabel,
    'Skickad',
    'OFFER_STATUS_LABELS ska ge svensk etikett i stället för "sent"'
  );
});

test('en äkta offertlista vinner över det syntetiserade ärendet', () => {
  const adapters = loadAdapters();
  const result = adapters.buildOffersFromPayload(
    { offers: [{ title: 'Äkta offert', amount: '9 000 kr', status: 'sent' }] },
    null,
    COMMERCIAL_CASE
  );

  assert.equal(result.count, 1);
  assert.equal(result.items[0].title, 'Äkta offert');
  assert.notEqual(result.items[0].amount, '45 000 kr', 'ärendet ska inte tränga undan listan');
});

test('ärendet läses även från bundeln när ctx saknar det', () => {
  const adapters = loadAdapters();
  const result = adapters.buildOffersFromPayload({}, { commercialCase: COMMERCIAL_CASE });
  assert.equal(result.count, 1);
  assert.equal(result.items[0].title, 'DHI');
});

test('utan ärende är tomtillståndet oförändrat', () => {
  const adapters = loadAdapters();
  assert.equal(adapters.buildOffersFromPayload({}, null).count, 0);
  assert.equal(adapters.buildOffersFromPayload({}, null, null).count, 0);
});

test('ett tomt ärende syntetiserar ingen rad', () => {
  const adapters = loadAdapters();
  // Varken status eller belopp — det finns ingenting att visa.
  assert.equal(adapters.buildOffersFromPayload({}, null, { offerType: 'DHI' }).count, 0);
  assert.equal(adapters.buildOfferRowFromCommercialCase({ offerType: 'DHI' }), null);
  assert.equal(adapters.buildOfferRowFromCommercialCase(null), null);
});

test('v12-arbetsytan skickar vidare ctx.commercialCase till adaptern', () => {
  // Utan tredje argumentet är hela grenen ovan död i praktiken.
  const source = fs.readFileSync(path.join(PREVIEW_APP, 'cco-v12-workspace.js'), 'utf8');
  const callStart = source.indexOf('buildOffersFromPayload(');
  assert.notEqual(callStart, -1, 'anropet till buildOffersFromPayload ska finnas');
  const callBlock = source.slice(callStart, callStart + 260);
  assert.match(
    callBlock,
    /ctx\.commercialCase/,
    'buildOffersFromPayload måste anropas med ctx.commercialCase'
  );
});

test('patient-master-ui lägger commercialCase på v12:s ctx', () => {
  // Wiring-ledet. railCtx (:6880) fick det i #1285; v12:s ctx (:6993) saknade
  // det fortfarande.
  const source = fs.readFileSync(path.join(PREVIEW_APP, 'patient-master-ui.js'), 'utf8');
  // Ankra på den ctx som faktiskt går till v12: den närmast FÖRE
  // CcoV12Canon-renderingen. Att bara räkna förekomster i hela filen guardar
  // ingenting — strängen fanns redan på andra ställen före den här fixen.
  const canonAt = source.indexOf('window.CcoV12Canon && typeof window.CcoV12Canon.render');
  assert.notEqual(canonAt, -1, 'CcoV12Canon-renderingen ska finnas');
  const ctxAt = source.lastIndexOf('const ctx = {', canonAt);
  assert.notEqual(ctxAt, -1, 'v12:s ctx ska finnas före canon-renderingen');

  const v12CtxBlock = source.slice(ctxAt, canonAt);
  assert.match(
    v12CtxBlock,
    /commercialCase: runtime\.commercialCase \|\| null/,
    'v12:s ctx måste bära commercialCase'
  );
});
