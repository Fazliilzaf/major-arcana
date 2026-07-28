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

test('VAKT: hela src/ — varje kvarvarande .se har ett uppräknat skäl', () => {
  // Första versionen listade sex kundvända moduler. Den missade en
  // JSDoc-rad i uptimeMonitor.js som fortfarande dokumenterade .se som
  // default — alltså precis den mekanism som skapade ORD-86: någon läser
  // dokumentationen, sätter .se, och uppevakten mäter en redirect.
  //
  // En vakt som täcker utvalda filer skyddar bara det man redan tänkt på.
  // Den här täcker hela trädet, och tvingar fram ett skrivet skäl per undantag.
  const fs = require('node:fs');
  const path = require('node:path');
  const srcDir = path.join(__dirname, '..', '..', 'src');

  // Fil -> varför .se får stå kvar. Saknas posten är det ett fel.
  const MEDVETNA = {
    'brand/resolveLegacyHostRedirectUrl.js': 'redirect-tabellens NYCKEL — domänigenkänning',
    'brand/brandConfig.js': 'domains[] — domänigenkänning',
    'brand/canonicalPublicOrigin.js': 'dokumentation av varför .se inte får användas',
    'config.js': 'redirect-tabell, MFA-nekandelista och prod-värdlista — igenkänning',
    'ops/icalExport.js': 'iCal-UID — stabil identifierare, inte en adress',
  };

  const hittade = [];
  const gå = (dir) => {
    for (const post of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, post.name);
      if (post.isDirectory()) { gå(p); continue; }
      if (!post.name.endsWith('.js')) continue;
      if (!fs.readFileSync(p, 'utf8').includes('arcana.hairtpclinic.se')) continue;
      hittade.push(path.relative(srcDir, p));
    }
  };
  gå(srcDir);

  const oväntade = hittade.filter((rel) => !(rel in MEDVETNA));
  assert.deepEqual(
    oväntade,
    [],
    `nya .se i src/ utan skäl: ${oväntade.join(', ')}. Gäller även kommentarer och JSDoc — dokumentationen är det folk läser.`
  );

  const föråldrade = Object.keys(MEDVETNA).filter((rel) => !hittade.includes(rel));
  assert.deepEqual(föråldrade, [], `MEDVETNA har poster utan .se kvar: ${föråldrade.join(', ')}`);
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
