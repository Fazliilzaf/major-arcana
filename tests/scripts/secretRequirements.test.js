'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  KRAVS_NAR,
  flaggaPaslagen,
  hemlighetKravs,
  vilandeSkal,
} = require('../../scripts/lib/secretRequirements.js');

/**
 * ORD-156 §3/§4 — den här logiken avgör om en deploy stoppas.
 *
 * Fällan den finns för att undvika: en kontroll som aldrig går att uppfylla.
 * Första versionen krävde alla sync:false-nycklar oavsett läge och larmade
 * därför om elva hemligheter som ska vara tomma — marknadsföringen kör
 * fixture, SharePoint är inte provisionerad, BankID inte live. En permanent
 * röd kontroll blir ignorerad, precis som larmet som skrek i sju timmar
 * 2026-08-31 utan att någon läste det.
 *
 * Den motsatta fällan är lika illa: en kontroll som tyst släpper igenom en
 * påslagen funktion utan credentials. Båda mäts här.
 */

const AV = {
  ARCANA_MARKETING_GOOGLE_ADS_ENABLED: 'true',
  ARCANA_MARKETING_CONNECTORS_LIVE_FETCH: 'false',
  ARCANA_GRAPH_SHAREPOINT_ENABLED: 'false',
  PORTAL_BANKID_LIVE: 'false',
};

test('fixture-läge kräver inga annonstokens — även när kanalen är "enabled"', () => {
  // Det verkliga läget i prod 2026-09-01: kanalerna står true, men
  // MODE=fixture och LIVE_FETCH=false gör att inget API anropas.
  assert.equal(hemlighetKravs('ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN', AV), false);
  assert.equal(hemlighetKravs('ARCANA_MARKETING_META_ACCESS_TOKEN', AV), false);
  assert.deepEqual(vilandeSkal('ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN', AV), [
    'ARCANA_MARKETING_CONNECTORS_LIVE_FETCH=av',
  ]);
});

test('slås live-hämtningen på krävs tokens direkt', () => {
  const live = { ...AV, ARCANA_MARKETING_CONNECTORS_LIVE_FETCH: 'true' };
  assert.equal(hemlighetKravs('ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN', live), true);
  // Meta-kanalen är däremot inte påslagen i AV → fortfarande vilande.
  assert.equal(hemlighetKravs('ARCANA_MARKETING_META_ACCESS_TOKEN', live), false);
});

test('båda flaggorna måste vara på — en räcker inte', () => {
  const baraKanal = { ARCANA_MARKETING_LINKEDIN_ENABLED: 'true' };
  const baraHamtning = { ARCANA_MARKETING_CONNECTORS_LIVE_FETCH: 'true' };
  const bada = { ...baraKanal, ...baraHamtning };
  assert.equal(hemlighetKravs('ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN', baraKanal), false);
  assert.equal(hemlighetKravs('ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN', baraHamtning), false);
  assert.equal(hemlighetKravs('ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN', bada), true);
});

test('BankID krävs först när portalen går live', () => {
  assert.equal(hemlighetKravs('BANKID_API_KEY', { PORTAL_BANKID_LIVE: 'false' }), false);
  assert.equal(hemlighetKravs('BANKID_API_KEY', { PORTAL_BANKID_LIVE: '1' }), true);
});

test('okänd hemlighet krävs alltid — okänt är inte samma sak som valfritt', () => {
  // En ny sync:false-nyckel utan koppling ska INTE tyst bli frivillig.
  assert.equal(hemlighetKravs('NAGON_HELT_NY_HEMLIGHET', {}), true);
  assert.deepEqual(vilandeSkal('NAGON_HELT_NY_HEMLIGHET', {}), []);
});

test('flaggtolkningen följer samma regel som sändgrinden', () => {
  for (const på of ['1', 'true', 'yes', 'on', 'TRUE', '  On  ']) {
    assert.equal(flaggaPaslagen({ F: på }, 'F'), true, `${JSON.stringify(på)} ska vara på`);
  }
  for (const av of ['0', 'false', 'off', 'nej', '', undefined, null]) {
    assert.equal(flaggaPaslagen({ F: av }, 'F'), false, `${JSON.stringify(av)} ska vara av`);
  }
});

test('fungerar med Map lika väl som med objekt', () => {
  const m = new Map([['PORTAL_BANKID_LIVE', 'true']]);
  assert.equal(hemlighetKravs('BANKID_API_KEY', m), true);
});

test('varje kopplad flagga finns i render.yaml — annars är villkoret dött', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const yaml = fs.readFileSync(path.join(__dirname, '..', '..', 'render.yaml'), 'utf8');
  const deklarerade = new Set([...yaml.matchAll(/^\s*-\s*key:\s*(\S+)/gm)].map((m) => m[1]));

  const doda = [];
  for (const [hemlighet, flaggor] of Object.entries(KRAVS_NAR)) {
    for (const f of flaggor) if (!deklarerade.has(f)) doda.push(`${hemlighet} → ${f}`);
  }
  assert.deepEqual(
    doda,
    [],
    'Kopplingar mot flaggor som inte finns i render.yaml är alltid "av" och gör ' +
      'hemligheten permanent vilande — alltså aldrig kontrollerad:\n' +
      doda.map((d) => `  - ${d}`).join('\n')
  );
});
