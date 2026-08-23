'use strict';

/**
 * Cliento-tjänstens ID bär varumärket när namnet inte kan.
 *
 * Bakgrund, mätt i Dataexport 1 maj 2021 – 16 juni 2027 (40 256 rader):
 *
 *   "Tjänste-id" finns på 28 507 rader (70,8 %), 82 unika ID.
 *   "Uppföljning via telefon" bärs av TVÅ ID med olika varumärke:
 *       srvId 60041 → Hair TP Clinic  (87 bokningar)
 *       srvId 60223 → Curatiio        ( 3 bokningar)
 *
 * Namnuppslaget lämnar därför namnet medvetet omappat (''). Det är rätt beslut
 * när bara namnet finns — men fel att stanna där när raden faktiskt bär ID:t.
 *
 * Testerna är mutationsprövade: byt tillbaka till enbart namnuppslag och
 * "Hair TP behåller sin telefonuppföljning även i Curatiio-vyn" faller.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  brandForClientoServiceId,
  brandForClientoServiceLabel,
} = require('../../src/brand/clientoServiceBrand');

test('srvId skiljer de två "Uppföljning via telefon" åt', () => {
  assert.equal(brandForClientoServiceId('60041'), 'hair-tp-clinic');
  assert.equal(brandForClientoServiceId('60223'), 'curatiio');

  // Namnet ensamt kan det inte — och ska inte låtsas kunna.
  assert.equal(brandForClientoServiceLabel('Uppföljning via telefon'), '');
});

test('okänt eller saknat srvId ger tomt, inte en gissning', () => {
  for (const v of ['', '   ', null, undefined, '999999', 'inte-ett-id']) {
    assert.equal(brandForClientoServiceId(v), '', `srvId=${JSON.stringify(v)}`);
  }
});

test('importen läser Tjänste-id ur Cliento-CSV:n', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../src/ops/clientoBookingCsvImport.js'),
    'utf8'
  );
  assert.match(src, /row\['Tjänste-id'\]/, 'kolumnnamnet i exporten är "Tjänste-id"');
  assert.match(src, /\bserviceId,/, 'serviceId ska följa med på bokningsobjektet');
});

test('storen persisterar serviceId och nollställer det inte vid blank uppdatering', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../src/ops/clientoBookingStore.js'),
    'utf8'
  );
  assert.match(src, /serviceId: normalizeText\(safe\.serviceId \|\| safe\.srvId\)/);
  assert.match(
    src,
    /PRESERVE_WHEN_BLANK_FIELDS[\s\S]*'serviceId'/,
    'ett tomt serviceId i en senare import får inte radera ett känt'
  );
});

test('kalendervyn frågar srvId före namn', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../src/ops/clinicCalendarView.js'),
    'utf8'
  );
  assert.match(src, /function brandForClientoEntry/);
  assert.match(
    src,
    /brandForClientoServiceId\(entry\?\.serviceId\) \|\| brandForClientoServiceLabel/,
    'srvId först, namnet som fallback'
  );
  assert.doesNotMatch(
    src,
    /brandForClientoServiceLabel\(entry\.serviceLabel\)/,
    'filtret ska gå via brandForClientoEntry, inte direkt på namnet'
  );
  assert.doesNotMatch(
    src,
    /serviceId: '',/,
    'serviceId var hårdkodat till tomt — ska läsas ur raden'
  );
});
