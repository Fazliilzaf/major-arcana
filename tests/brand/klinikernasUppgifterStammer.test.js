'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const brand = require('../../src/brand/brandConfig');
const AVBOKNING = require('../../config/avbokning-kontakt.json');

/**
 * ORD-202 §3 — klinikernas kontaktuppgifter ska stämma överallt.
 *
 * BAKGRUND. Ägaren bad om avbokningskontakt per klinik. Jag hittade
 * `info@curatiio.com` och Hair TP:s telefonnummer på Curatiio i brandConfig,
 * antog att det var sanningen, och satte en osäkerhetsflagga. Ägaren: "nej dem
 * har olika nummer, sök på hemsidorna."
 *
 * Hämtat 2026-09-04:
 *   hairtpclinic.com/kontakt   031 88 11 66   contact@hairtpclinic.com
 *   curatiio.com/kontakt       031-88 22 44   contact@curatiio.com
 *
 * OCH DET STÖRRE FYNDET. brandConfig.js styr ingenting. Ingen produktionskod
 * require:ar den; `emailFrom` och `smsFrom` har noll användningar utanför
 * filen. Filhuvudet påstod att den styr "kontaktinfo, SMS-avsändare,
 * e-postmallar" — vilket är farligare än fel data, eftersom den som rättar ett
 * nummer där tror att jobbet är gjort.
 *
 * Testerna nedan gör två saker: håller uppgifterna lika mellan filerna, och
 * går rött den dag brandConfig BÖRJAR användas — så att varningen tas bort då,
 * och inte står kvar och ljuger åt andra hållet.
 */

const ROT = path.join(__dirname, '..', '..');

const FACIT = {
  'hair-tp-clinic': { epost: 'contact@hairtpclinic.com', telefon: '+4631881166' },
  curatiio: { epost: 'contact@curatiio.com', telefon: '+4631882244' },
};

test('avbokningsfacit stämmer med klinikernas hemsidor', () => {
  for (const [id, v] of Object.entries(FACIT)) {
    const k = AVBOKNING.kliniker[id];
    assert.ok(k, `${id} saknas i avbokning-kontakt.json`);
    assert.equal(k.epost, v.epost, `${id} e-post`);
    assert.equal(k.telefon, v.telefon, `${id} telefon`);
  }
});

test('brandConfig säger samma sak — annars finns två sanningar', () => {
  // Två filer med olika telefonnummer för samma klinik är exakt den sortens
  // tyst avvikelse som kostade en halvtimme att hitta i dag.
  for (const [id, v] of Object.entries(FACIT)) {
    const b = brand.BRANDS[id];
    assert.ok(b, `${id} saknas i brandConfig`);
    assert.equal(b.contact.email, v.epost, `${id} e-post i brandConfig`);
    assert.equal(b.contact.phone, v.telefon, `${id} telefon i brandConfig`);
  }
});

test('klinikerna har OLIKA nummer — det var hela ägarens poäng', () => {
  const htp = brand.BRANDS['hair-tp-clinic'].contact;
  const cur = brand.BRANDS.curatiio.contact;
  assert.notEqual(htp.phone, cur.phone);
  assert.notEqual(htp.email, cur.email);
});

test('filhuvudet varnar för att brandConfig inte styr något', () => {
  // Den gamla texten sa att filen styr kontaktinfo, SMS-avsändare och
  // e-postmallar. Den gör inget av det. Ett filhuvud som lovar mer än filen
  // håller får nästa person att sluta leta för tidigt.
  const kod = fs.readFileSync(path.join(ROT, 'src', 'brand', 'brandConfig.js'), 'utf8');
  assert.match(kod, /STYR INGENTING I DRIFT/, 'varningen ska stå kvar');
  assert.match(kod, /resendConfig\.js/, 'och peka på var det faktiskt bestäms');
  assert.ok(
    !/Styr: logga, färger, kontaktinfo, SMS-avsändare, e-postmallar\./.test(kod),
    'den gamla, felaktiga beskrivningen ska vara borta'
  );
});

test('brandConfig används fortfarande INTE av produktionskod', () => {
  // Går det här testet rött är det goda nyheter — men då måste varningen i
  // filhuvudet bort, annars ljuger den åt andra hållet.
  const träffar = [];
  const hoppa = new Set(['node_modules', '.git', 'tests', 'data', 'public']);
  (function gå(dir) {
    for (const post of fs.readdirSync(dir, { withFileTypes: true })) {
      if (hoppa.has(post.name)) continue;
      const p = path.join(dir, post.name);
      if (post.isDirectory()) gå(p);
      else if (post.name.endsWith('.js') && !p.endsWith('brandConfig.js')) {
        const kod = fs.readFileSync(p, 'utf8');
        if (/require\([^)]*brand\/brandConfig/.test(kod)) träffar.push(path.relative(ROT, p));
      }
    }
  })(ROT);
  assert.deepEqual(
    träffar,
    [],
    `brandConfig används nu av: ${träffar.join(', ')} — ta bort varningen i filhuvudet`
  );
});

test('avsändaren är fortfarande Hair TP för ALL post, även Curatiios', () => {
  // Uppmätt i prod: varken RESEND_FROM eller ARCANA_GRAPH_DEFAULT_SENDER är
  // satt, så standardvärdet gäller. En Curatiio-patient får alltså mejl från
  // contact@hairtpclinic.com. Det är ett verksamhetsbeslut ägaren inte fattat,
  // och det ska inte försvinna in i en JSON-fil.
  const kod = fs.readFileSync(path.join(ROT, 'src', 'infra', 'resendConfig.js'), 'utf8');
  assert.match(
    kod,
    /DEFAULT_GRAPH_FROM = 'contact@hairtpclinic\.com'/,
    'standardavsändaren är Hair TP'
  );
  assert.ok(
    !/curatiio/i.test(kod),
    'ingen Curatiio-gren finns — avsändaren är densamma för båda klinikerna'
  );
});
