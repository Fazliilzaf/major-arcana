'use strict';

/**
 * ORD-86 — två sorters `.se`, och de får inte behandlas lika.
 *
 * 1. GENERERADE LÄNKAR (patientportal, bokningslänk, signatur-assets,
 *    post-op-granskning). Ska peka på den kanoniska värden. En genererad länk
 *    till legacy fungerar i en webbläsare tack vare 301:an, men inte för
 *    mailklienter som hämtar bilder utan att följa redirects, och inte för
 *    curl med Authorization-header.
 *
 * 2. DOMÄNIGENKÄNNING (redirect-tabellen, brandConfig.domains). MÅSTE behålla
 *    `.se`. Tas den bort slutar gamla länkar i patienternas inkorgar att
 *    fungera — vi bryter precis det redirecten finns för att skydda.
 *
 * Det här testet finns för att någon ska kunna "städa bort de sista .se" utan
 * att råka riva igenkänningen. Faller det andra testet nedan har det hänt.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { CANONICAL_PUBLIC_ORIGIN } = require('../../src/brand/canonicalPublicOrigin');
const {
  DEFAULT_LEGACY_HOST_REDIRECTS,
  resolveLegacyHostRedirectUrl,
} = require('../../src/brand/resolveLegacyHostRedirectUrl');
const brandConfig = require('../../src/brand/brandConfig');

const brands = brandConfig.BRANDS || brandConfig.brands || {};
const hairTp = brands['hair-tp-clinic'];

test('den kanoniska origin är .com och saknar avslutande slash', () => {
  assert.equal(CANONICAL_PUBLIC_ORIGIN, 'https://arcana.hairtpclinic.com');
  assert.doesNotMatch(CANONICAL_PUBLIC_ORIGIN, /\/$/, 'trailing slash ger dubbla snedstreck i länkar');
});

test('BEHÅLL .se: domänigenkänningen får inte städas bort', () => {
  // Faller det här har någon tagit bort legacy-värden i tron att den var en
  // fallback. Den är inte det — den är det som får gamla patientlänkar att
  // fortsätta fungera.
  assert.ok(
    Object.keys(DEFAULT_LEGACY_HOST_REDIRECTS).includes('arcana.hairtpclinic.se'),
    'arcana.hairtpclinic.se måste finnas kvar som NYCKEL i redirect-tabellen'
  );
  assert.ok(
    hairTp.domains.includes('arcana.hairtpclinic.se'),
    'brandConfig.domains måste känna igen legacy-värden'
  );
  assert.ok(
    hairTp.domains.includes('hairtpclinic.se'),
    'även hairtpclinic.se ska kännas igen'
  );

  // Och redirecten ska faktiskt fungera, inte bara finnas i en tabell.
  const träff = resolveLegacyHostRedirectUrl({
    requestHost: 'arcana.hairtpclinic.se',
    requestPath: '/admin',
    requestSearch: '?v9=on',
  });
  assert.equal(träff, 'https://arcana.hairtpclinic.com/admin?v9=on');
});

test('redirect-tabellens VÄRDEN kommer från den enda källan', () => {
  for (const [värd, mål] of Object.entries(DEFAULT_LEGACY_HOST_REDIRECTS)) {
    assert.equal(mål, CANONICAL_PUBLIC_ORIGIN, `${värd} ska peka på den kanoniska origin`);
  }
});

test('BYT .se: genererade patientlänkar pekar på den kanoniska värden', () => {
  assert.equal(hairTp.patientPortalUrl, `${CANONICAL_PUBLIC_ORIGIN}/patient/`);
  assert.doesNotMatch(
    hairTp.patientPortalUrl,
    /hairtpclinic\.se/,
    'patientportalen är en genererad länk, inte domänigenkänning'
  );
});

test('logoUrl i mejl pekar redan rätt — och ska fortsätta göra det', () => {
  // Mailklienter följer inte redirects för bilder. En logotyp på legacy hade
  // helt enkelt inte visats hos mottagaren, utan felmeddelande någonstans.
  assert.doesNotMatch(hairTp.logoUrl, /hairtpclinic\.se/);
  assert.match(hairTp.logoUrl, /^https:\/\/arcana\.hairtpclinic\.com\//);
});

test('VAKT: inga genererade .se-länkar kvar i de kundvända modulerna', () => {
  // Källnivå-vakt. Modulerna nedan bygger länkar och bilder som når patienter.
  // Ett nytt hårdkodat .se här är tyst i test men syns i mottagarens inkorg.
  const fs = require('node:fs');
  const path = require('node:path');
  const moduler = [
    'src/ops/offerAutoFlow.js',
    'src/ops/postOpAutoTrigger.js',
    'src/capabilities/requestPostOpReview.js',
    'src/routes/postOpReview.js',
    'src/ops/ccoMailboxSettingsDocument.js',
    'src/capabilities/executionService.js',
  ];
  for (const rel of moduler) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
    const träffar = src
      .split('\n')
      .map((rad, i) => [i + 1, rad])
      .filter(([, rad]) => /arcana\.hairtpclinic\.se/.test(rad));
    assert.deepEqual(
      träffar,
      [],
      `${rel} har kvar genererade .se-länkar: ${träffar.map(([n, r]) => `${n}: ${r.trim()}`).join(' | ')}`
    );
  }
});

test('VAKT: klientbundlens signatur- och asset-baser är kanoniska', () => {
  // public/ kan inte require:a konstanten, så literalerna måste hållas i synk.
  // Den här vakten är hela synk-mekanismen.
  const fs = require('node:fs');
  const path = require('node:path');
  for (const rel of [
    'public/major-arcana-preview/app.js',
    'public/major-arcana-preview/runtime-focus-intel-renderers.js',
  ]) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
    const träffar = src
      .split('\n')
      .map((rad, i) => [i + 1, rad])
      .filter(([, rad]) => /["'`]https:\/\/arcana\.hairtpclinic\.se/.test(rad));
    assert.deepEqual(
      träffar,
      [],
      `${rel} har kvar en .se-bas: ${träffar.map(([n, r]) => `rad ${n}`).join(', ')}`
    );
  }
});
