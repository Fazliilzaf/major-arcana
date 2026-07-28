'use strict';

/**
 * ORD-86 steg 1 — kanonisk bas-URL före autentiserade anrop.
 *
 * VARFÖR DET INTE RÄCKER ATT FÖLJA REDIRECTEN:
 *
 * curl släpper `Authorization` vid omdirigering över värdgräns. Ett skript som
 * loggar in mot legacy-värden FÅR en token — credentials ligger i POST-kroppen
 * och bevaras med --post301 — men varje efterföljande autentiserat anrop tappar
 * headern och svarar "Inloggning krävs.". Det är omöjligt att skilja från fel
 * lösenord, och drift-gaten föll så i 60 dagar.
 *
 * Därför måste värden vara rätt FRÅN BÖRJAN. `-L` är ett komplement.
 *
 * MAPPNINGEN FÅR INTE DUPLICERAS. Den läses ur
 * src/brand/resolveLegacyHostRedirectUrl.js, som också driver serverns 301.
 * Två källor hade drivit isär, och den ena hade varit den testerna skyddar.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { kanoniskBasUrl } = require('../../scripts/lib/canonical-base-url.js');
const {
  DEFAULT_LEGACY_HOST_REDIRECTS,
} = require('../../src/brand/resolveLegacyHostRedirectUrl');

const KANONISK = 'https://arcana.hairtpclinic.com';

test('båda legacy-värdarna kanoniseras — inte bara arcana.hairtpclinic.se', () => {
  // ma.hairtpclinic.se är lätt att missa. Den finns i redirect-tabellen och
  // måste följa med, annars fungerar fixen för den ena värden och inte den andra.
  assert.equal(kanoniskBasUrl('https://arcana.hairtpclinic.se'), KANONISK);
  assert.equal(kanoniskBasUrl('https://ma.hairtpclinic.se'), KANONISK);
});

test('VAKT: alla värdar i redirect-tabellen täcks', () => {
  // Läggs en ny legacy-värd till i tabellen ska den fungera här utan ändring.
  // Faller det här har någon duplicerat mappningen i stället för att läsa den.
  for (const värd of Object.keys(DEFAULT_LEGACY_HOST_REDIRECTS)) {
    const ut = kanoniskBasUrl(`https://${värd}`);
    assert.notEqual(ut, `https://${värd}`, `${värd} ska kanoniseras, inte lämnas orörd`);
    assert.match(ut, /^https:\/\//, `${värd} ska ge en absolut URL`);
  }
});

test('kanonisk värd lämnas orörd', () => {
  assert.equal(kanoniskBasUrl(KANONISK), KANONISK);
  assert.equal(kanoniskBasUrl(`${KANONISK}/`), KANONISK, 'avslutande slash normaliseras bort');
});

test('okända värdar lämnas orörda — lokal utveckling och staging ska fungera', () => {
  // Det här är inte en kontroll, det är en normalisering. Att fela på okänd
  // värd hade brutit varje lokal körning och varje staging-miljö.
  assert.equal(kanoniskBasUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(
    kanoniskBasUrl('https://arcana-staging.onrender.com'),
    'https://arcana-staging.onrender.com'
  );
  assert.equal(kanoniskBasUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
});

test('trasig indata går igenom orörd i stället för att kasta', () => {
  // Anroparen ska få sitt eget felmeddelande, inte en stacktrace härifrån.
  assert.equal(kanoniskBasUrl('inte-en-url'), 'inte-en-url');
  assert.equal(kanoniskBasUrl(''), '');
  assert.equal(kanoniskBasUrl(null), '');
  assert.equal(kanoniskBasUrl(undefined), '');
});

test('bara origin returneras, aldrig med path', () => {
  // resolveLegacyHostRedirectUrl svarar med path. Släpps den igenom blir
  // "$BASE_URL/api/v1/..." till ".../api/v1//api/v1/...".
  const ut = kanoniskBasUrl('https://arcana.hairtpclinic.se');
  assert.equal(new URL(ut).pathname, '/', 'ingen path i resultatet');
  assert.doesNotMatch(ut, /\/$/, 'ingen avslutande slash');
});

test('extract-owner-token.sh kanoniserar och säger till om det', () => {
  // Kanoniseringen sker FÖRE credential-kontrollen, så skriptet går att prova
  // utan hemligheter: det ska varna om värden och sedan fela på saknad e-post.
  const skript = path.join(__dirname, '..', '..', 'scripts', 'extract-owner-token.sh');
  let stderr = '';
  try {
    execFileSync('bash', [skript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_URL: 'https://arcana.hairtpclinic.se',
        ARCANA_OWNER_EMAIL: '',
        ARCANA_OWNER_PASSWORD: '',
      },
    });
    assert.fail('skriptet skulle ha felat på saknade credentials');
  } catch (error) {
    stderr = String(error.stderr || '');
  }

  assert.match(stderr, /legacy-värd/i, 'skriptet ska säga att värden byttes');
  assert.match(stderr, /arcana\.hairtpclinic\.com/, 'den nya värden ska stå utskriven');
  assert.match(stderr, /saknar ARCANA_OWNER_EMAIL/, 'och sedan fela på credentials');
});

test('VAKT: inga .se-defaults kvar i scripts/ — undantagen är uppräknade med skäl', () => {
  // 67 filer bytte i ORD-86 steg 3. Vakten finns för att nya inte ska smyga in,
  // och för att undantagen ska ha ett skrivet skäl i stället för att se ut som
  // förbisedda rader.
  const fs = require('node:fs');
  const scriptsDir = path.join(__dirname, '..', '..', 'scripts');

  // Sökväg -> varför .se får stå kvar. En rad utan post här är ett fel.
  const MEDVETNA = {
    'smoke-public.sh': 'kommentar som förklarar varför -L behövs mot legacy-värden',
    'setup-owner-mfa.js': 'x-forwarded-host väljs för att TVINGA MFA — värden ska ligga i nekandelistan',
    'lib/canonical-base-url.js': 'dokumentation av själva kanoniseringen',
    'verify-post-op-uppfoljning-prod.mjs': 'IS_PROD känner igen BÅDA prod-värdarna',
  };

  const hittade = [];
  const gå = (dir) => {
    for (const post of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, post.name);
      if (post.isDirectory()) { gå(p); continue; }
      if (!/\.(js|mjs|sh)$/.test(post.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      if (!src.includes('arcana.hairtpclinic.se')) continue;
      hittade.push(path.relative(scriptsDir, p));
    }
  };
  gå(scriptsDir);

  const oväntade = hittade.filter((rel) => !(rel in MEDVETNA));
  assert.deepEqual(
    oväntade,
    [],
    `nya .se i scripts/ utan skäl: ${oväntade.join(', ')}. Är den avsiktlig — lägg till den i MEDVETNA med en förklaring.`
  );

  // Och åt andra hållet: en post som inte längre behövs ska städas bort, annars
  // urholkas listan tills den inte betyder något.
  const föråldrade = Object.keys(MEDVETNA).filter((rel) => !hittade.includes(rel));
  assert.deepEqual(föråldrade, [], `MEDVETNA har poster utan .se kvar: ${föråldrade.join(', ')}`);
});

test('extract-owner-token.sh tiger när värden redan är rätt', () => {
  const skript = path.join(__dirname, '..', '..', 'scripts', 'extract-owner-token.sh');
  let stderr = '';
  try {
    execFileSync('bash', [skript], {
      encoding: 'utf8',
      env: { ...process.env, BASE_URL: KANONISK, ARCANA_OWNER_EMAIL: '', ARCANA_OWNER_PASSWORD: '' },
    });
    assert.fail('skriptet skulle ha felat på saknade credentials');
  } catch (error) {
    stderr = String(error.stderr || '');
  }
  assert.doesNotMatch(stderr, /legacy-värd/i, 'ingen varning när inget byttes');
});
