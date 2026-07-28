'use strict';

/**
 * Tolkningen i report-scheduler-config-prod.js, mot rutthanterarnas EXAKTA former.
 *
 * VARFÖR DE HÄR TESTERNA FINNS:
 *
 * Första versionen läste statusen platt — `data.enabled`. Men
 * GET /api/v1/ops/scheduler/status svarar `{ ok, generatedAt, scheduler: {...} }`
 * (src/routes/ops.js:900). Statusen ligger NÄSTLAD.
 *
 * Konsekvensen hade inte varit en krasch. `enabled` blir `undefined`, tolkningen
 * faller igenom till "Otillräckligt underlag" — på fullgod data. Verktyget som
 * byggdes för att avgöra en fråga hade svarat "vet ej", och nästa steg hade
 * blivit att gissa igen.
 *
 * Ett diagnostikverktyg som tyst degraderar är sämre än inget verktyg, eftersom
 * man litar på dess "vet ej".
 *
 * Formerna nedan är kopierade från rutthanterarna, inte påhittade:
 *   src/routes/opsSchedulerOverride.js:44-61  (tre svarsformer)
 *   src/routes/ops.js:877-902                 (nästlad scheduler)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  tolkaLäge,
  plockaStatus,
} = require('../../scripts/report-scheduler-config-prod.js');

// --- Exakta former från rutthanterarna ---------------------------------------

const STATUS_AV = {
  ok: true,
  generatedAt: '2026-07-28T13:00:00.000Z',
  scheduler: { enabled: false, started: false, runOnStartup: false, jobs: [] },
};
const STATUS_PÅ = {
  ok: true,
  generatedAt: '2026-07-28T13:00:00.000Z',
  scheduler: { enabled: true, started: true, runOnStartup: true, jobs: [] },
};
const OVERRIDE_SAKNAS = { ok: true, path: '/var/data/scheduler-override.json', exists: false };
const OVERRIDE_TRASIG = {
  ok: true,
  path: '/var/data/scheduler-override.json',
  exists: true,
  valid: false,
};
const OVERRIDE_PÅ = {
  ok: true,
  path: '/var/data/scheduler-override.json',
  exists: true,
  valid: true,
  override: { schedulerEnabled: true, schedulerJobs: '' },
};
const OVERRIDE_AV = {
  ok: true,
  path: '/var/data/scheduler-override.json',
  exists: true,
  valid: true,
  override: { schedulerJobs: '' },
};

// -----------------------------------------------------------------------------

test('REGRESSION: statusen läses ur det nästlade scheduler-objektet', () => {
  // Faller det här läser tolkningen platt igen, och verktyget svarar
  // "otillräckligt underlag" på data som räcker gott.
  const s = plockaStatus(STATUS_AV);
  assert.ok(s, 'statusen ska hittas');
  assert.equal(s.enabled, false);
  assert.equal(s.started, false);

  assert.notEqual(
    tolkaLäge(OVERRIDE_PÅ, STATUS_AV).kod,
    'okänt',
    'med nästlad status och en override som säger true ska svaret INTE vara okänt'
  );
});

test('override säger true men schedulern är av → prod safe-mode vann', () => {
  const r = tolkaLäge(OVERRIDE_PÅ, STATUS_AV);
  assert.equal(r.kod, 'safe_mode');
  assert.match(r.text, /safe-mode/i);
  assert.match(r.text, /dashboarden/, 'åtgärden ska peka på dashboarden, inte render.yaml');
  assert.match(r.text, /inte i render\.yaml/, 'yaml-fällan ska nämnas — syncen är pausad');
});

test('ingen override-fil → env styr ensam', () => {
  const r = tolkaLäge(OVERRIDE_SAKNAS, STATUS_AV);
  assert.equal(r.kod, 'ingen_fil');
  assert.match(r.text, /raderades INNAN syncen/, 'hypotesen ska stå, den är testbar');
});

test('trasig override-fil är ett EGET läge, inte "saknas"', () => {
  // En fil med ogiltig JSON ignoreras helt av servern. Slås den ihop med
  // "ingen fil" får ägaren fel åtgärd: att sätta env i stället för att laga filen.
  const r = tolkaLäge(OVERRIDE_TRASIG, STATUS_AV);
  assert.equal(r.kod, 'trasig_fil');
  assert.match(r.text, /ogiltig JSON/i);
});

test('fil som finns men inte tänder → skriv om den', () => {
  const r = tolkaLäge(OVERRIDE_AV, STATUS_AV);
  assert.equal(r.kod, 'fil_tänder_inte');
  assert.match(r.text, /schedulerEnabled/);
});

test('schedulern på → ingen åtgärd, oavsett override', () => {
  for (const o of [OVERRIDE_PÅ, OVERRIDE_AV, OVERRIDE_SAKNAS, OVERRIDE_TRASIG, null]) {
    assert.equal(tolkaLäge(o, STATUS_PÅ).kod, 'på');
  }
});

test('GISSAR INTE: utan status blir svaret okänt, inte en slutsats', () => {
  // Det här är verktygets viktigaste egenskap. Hellre "vet ej" än en
  // trovärdig gissning — hela sessionen har handlat om vad en rimlig men
  // obelagd förklaring kostar.
  assert.equal(tolkaLäge(OVERRIDE_PÅ, null).kod, 'okänt');
  assert.equal(tolkaLäge(OVERRIDE_PÅ, {}).kod, 'okänt');
  assert.equal(tolkaLäge(OVERRIDE_PÅ, { ok: true }).kod, 'okänt');
});

test('status av + oläsbar override → okänt, inte "ingen fil"', () => {
  const r = tolkaLäge(null, STATUS_AV);
  assert.equal(r.kod, 'okänt');
  assert.match(r.text, /kunde inte läsas/i);
});

test('import kör inte rapporten mot prod', () => {
  // Modulen laddades överst i filen. Hade require.main-gardet saknats hade en
  // inloggning mot prod redan skett när det här testet nås.
  assert.equal(typeof tolkaLäge, 'function');
  assert.equal(typeof plockaStatus, 'function');
});
