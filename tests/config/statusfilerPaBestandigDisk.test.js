'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');

/**
 * ORD-168 — ingen store får bo på containerns flyktiga disk.
 *
 * DET HÄR VAR LÄGET 2026-09-03:
 *
 *   Arton skrivvägar stod kvar med en LITERAL path.join(__dirname, 'data', …)
 *   i server.js. ORD-67d hade flyttat `config.dataDir` till stateRoot och
 *   ORD-110 hade byggt migrateLegacyCcoState — men ingetdera nådde en literal.
 *
 *   Prod-mätning samma dag: containerns data/ innehöll bara cco-mailboxes.json
 *   och reports/. Alla arton började alltså tomma vid varje boot, och allt som
 *   skrevs mellan två deployer var borta efter nästa.
 *
 *   Bland dem: cco-id-verifications (identitetskontroller),
 *   cco-treatment-plans (behandlingsplaner), cco-portal-links (kundens väg in
 *   i portalen) och cco-feedback.jsonl (personalens felrapporter).
 *
 * Testet läser server.js FRÅN FILSYSTEMET, inte från git-indexet
 * (tests/meta/testerFragarInteGit.test.js förklarar varför).
 */

const SERVER = path.join(root, 'server.js');

/**
 * De enda tillåtna literalerna. Varje undantag ska ha ett skäl som håller.
 */
const TILLATNA = [
  {
    // Själva migreringen MÅSTE läsa den gamla platsen — det är hela dess syfte.
    match: "const legacy = path.join(__dirname, 'data', legacyName);",
    varfor: 'migrateLegacyCcoState läser legacy-platsen för att kunna flytta därifrån',
  },
  {
    // Skickas till public/major-arcana-preview/customers/server-patch.js, som
    // är en stub (server-patch.js:43 sätter { stub: true }). Inget skrivs.
    match: "dataDir: path.join(__dirname, 'data'),",
    varfor: 'går till customers/server-patch, som är en stub och inte skriver något',
  },
  {
    match: "uploadDir: path.join(__dirname, 'data', 'photos'),",
    varfor: 'samma stub som ovan',
  },
];

function hittaLiteraler(kall) {
  const rader = kall.split('\n');
  const traffar = [];
  rader.forEach((rad, i) => {
    if (!/path\.join\(\s*__dirname\s*,\s*['"]data['"]/.test(rad)) return;
    const trimmad = rad.trim();
    if (TILLATNA.some((t) => trimmad.includes(t.match))) return;
    traffar.push({ rad: i + 1, text: trimmad });
  });
  return traffar;
}

test('ingen ny statusfil hamnar på containerns flyktiga disk', () => {
  const kall = fs.readFileSync(SERVER, 'utf8');
  const traffar = hittaLiteraler(kall);

  assert.deepEqual(
    traffar,
    [],
    'server.js har en path.join(__dirname, "data", …) som inte står i undantagslistan.\n' +
      'På Render är den katalogen flyktig: filen börjar tom vid varje boot och allt\n' +
      'som skrivits sedan förra deployen är borta.\n' +
      'Lägg i stället till en resolveStatePath-post i src/config.js och anropa\n' +
      'migrateLegacyCcoState(label, legacyNamn, config.<din>Path) innan storen skapas.\n' +
      'Träffar:\n' +
      traffar.map((t) => `  server.js:${t.rad}  ${t.text}`).join('\n')
  );
});

test('vakten hittar en literal som smugit in — annars bevisar den ingenting', () => {
  // Mutationstest i testet självt: samma regex mot en påhittad rad. Utan det
  // här fallet skulle en trasig regex ge grönt på tom lista och se korrekt ut.
  const smuget = "      filePath: path.join(__dirname, 'data', 'cco-nytt.json'),";
  assert.equal(hittaLiteraler(smuget).length, 1);
});

test('undantagen är tre, och var och en har ett skrivet skäl', () => {
  // Listan får bara växa medvetet. Ett nytt undantag ska synas i granskningen.
  assert.equal(TILLATNA.length, 3);
  for (const t of TILLATNA) {
    assert.ok(t.varfor && t.varfor.trim().length > 10, `undantaget "${t.match}" saknar skäl`);
  }
});

test('de arton sökvägarna följer ARCANA_STATE_ROOT', () => {
  const stateRoot = path.join('/tmp', 'arcana-ord168-config-test');
  const nycklar = [
    ['ccoBookingCaseStorePath', 'cco-booking-cases.json'],
    ['ccoPhotoAnnotationStorePath', 'cco-photo-annotations.json'],
    ['ccoTreatmentPlanStorePath', 'cco-treatment-plans.json'],
    ['ccoPortalLinkStorePath', 'cco-portal-links.json'],
    ['ccoIncidentLogStorePath', 'cco-incident-log.json'],
    ['ccoDataflowMapStorePath', 'cco-dataflow-map.json'],
    ['ccoOfferDocumentPackageStorePath', 'cco-offer-document-packages.json'],
    ['ccoVendorRegisterStorePath', 'cco-vendor-register.json'],
    ['ccoPolicyStorePath', 'cco-policies.json'],
    ['ccoMailSnoozeStorePath', 'cco-mail-snoozes.json'],
    ['ccoTelemetryStorePath', 'cco-telemetry.json'],
    ['ccoCollaborationStorePath', 'cco-collaboration.json'],
    ['ccoBrandStorePath', 'cco-brands.json'],
    ['ccoIdVerificationStorePath', 'cco-id-verifications.json'],
    ['ccoNotificationReadStorePath', 'cco-notification-reads.json'],
    ['ccoSendActionStorePath', 'cco-send-actions.json'],
    ['ccoMailboxAdminStorePath', 'cco-mailboxes.json'],
    ['ccoFeedbackPath', 'cco-feedback.jsonl'],
  ];

  const uttryck = nycklar.map(([k]) => `config.${k}`).join(",'|',");
  const ut = execFileSync(
    process.execPath,
    ['-e', `const {config}=require('./src/config');process.stdout.write([${uttryck}].join('|'));`],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test', ARCANA_STATE_ROOT: stateRoot },
      encoding: 'utf8',
    }
  );

  const varden = ut.split('|').filter((v) => v !== "'" && v !== '');
  assert.equal(varden.length, nycklar.length, 'antalet sökvägar stämmer inte');
  nycklar.forEach(([nyckel, filnamn], i) => {
    assert.equal(varden[i], path.join(stateRoot, filnamn), `${nyckel} pekar fel`);
  });
});
