'use strict';

/**
 * STORA KUNDKORTET VISADE ALLTID "INGA OFFERTER ÄNNU".
 *
 * `cco-v11-rk.js` (den enda rail-renderaren som faktiskt laddas — se
 * `v11v12PortWiringGuard`) läste offerter ur
 * `bundle.commercialCase.offers`. Men `commercialCase` är ETT ärende, inte en
 * lista: `normalizeCommercialCase` (`ccoCommercialStore.js:494`) ger ett platt
 * objekt med `quoteStatus`, `quotedAmount`, `esignToken` — det finns inget
 * `.offers`-fält. Grenen var alltså död mot verklig payload.
 *
 * Dessutom byggdes `railCtx` (`patient-master-ui.js:6880`) helt utan
 * `commercialCase`, trots att lilla referenskortet redan fick det på `:6837`.
 *
 * Två saker vaktas här:
 *   1. Ärendet renderas som en offertrad med quoteStatus-badge.
 *   2. Kundportalen är nåbar — den har aldrig varit det från någon av de
 *      stora vyerna (`esignToken` gav noll träffar i rk, referenskortet och
 *      v12-workspace).
 *
 * Rigg och sandbox är samma som `ccoV11RailHealthTruth.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function render(ctx) {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-v11-rk.js'),
    'utf8'
  );
  const sandbox = { window: { CcoV11RailAdapters: {} }, console };
  vm.runInNewContext(`${source}\n;this.renderer = window.CcoV11RailKomplett;`, sandbox);
  return sandbox.renderer.render({ card: { displayName: 'Testkund' }, ...ctx });
}

test('ett skickat offert-ärende renderas som offertrad, inte som "Inga offerter ännu"', () => {
  const html = render({
    commercialCase: {
      offerType: 'DHI',
      quoteStatus: 'sent',
      quotedAmount: '45 000 kr',
      quoteSentAt: '2026-07-01',
    },
  });
  assert.doesNotMatch(html, /Inga offerter ännu/);
  assert.match(html, /q-row/, 'ska använda den befintliga offertrads-markupen');
  assert.match(html, /q-status/, 'quoteStatus ska renderas som badge');
  assert.match(html, /sent/i);
  assert.match(html, /45 000 kr/);
});

test('accepterad offert får grön badge via befintlig accept-logik', () => {
  const html = render({
    commercialCase: { offerType: 'DHI', quoteStatus: 'accepted', quotedAmount: '45 000 kr' },
  });
  assert.match(html, /q-status green/, 'befintlig /accept/i-test ska ge grön status');
  assert.match(html, /q-pill green/);
});

test('kundportalen är nåbar när esignToken finns', () => {
  const html = render({
    commercialCase: { offerType: 'DHI', quoteStatus: 'sent', esignToken: 'tok-abc-123' },
  });
  assert.match(html, /customer-offer-portal\?token=tok-abc-123/);
  assert.match(html, /class="file-row"/, 'ska återanvända befintligt länkmönster');
});

test('ingen portal-länk utan token — inget trasigt anrop renderas', () => {
  const html = render({
    commercialCase: { offerType: 'DHI', quoteStatus: 'draft', quotedAmount: '10 kr' },
  });
  assert.doesNotMatch(html, /customer-offer-portal/);
});

test('utan commercialCase är tomtillståndet oförändrat', () => {
  const html = render({});
  assert.match(html, /Inga offerter ännu/);
  assert.doesNotMatch(html, /customer-offer-portal/);
});

test('en äkta offertlista i bundeln vinner över det syntetiserade ärendet', () => {
  // bundle.offers-grenen lämnades orörd med flit: den är korrekt den dag
  // bundeln faktiskt bär en lista, och en äkta lista ska alltid vinna.
  const html = render({
    dossierBundle: {
      offers: [{ kind: 'PRP', title: 'Äkta offert', amount: '9 000 kr', status: 'sent' }],
    },
    commercialCase: { offerType: 'DHI', quoteStatus: 'accepted', quotedAmount: '45 000 kr' },
  });
  assert.match(html, /Äkta offert/);
  assert.doesNotMatch(html, /45 000 kr/, 'det syntetiserade ärendet ska inte tränga undan listan');
});

test('ett tomt commercialCase syntetiserar ingen rad', () => {
  const html = render({ commercialCase: { offerType: 'DHI' } });
  assert.match(html, /Inga offerter ännu/, 'utan status eller belopp finns inget att visa');
});
