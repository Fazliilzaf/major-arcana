'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-153 §6, spegelvänt.
 *
 * De befintliga testerna (ccoCommercialMailDispatch, ccoComposeSend,
 * ccoPatientOutreach, offerAutoFlow) bevisar att de KOMMERSIELLA vägarna ÄR
 * grindade. check-dead-send-quarantine.js failar om en död sändväg börjar
 * användas. Ingenting kontrollerade det omvända: att DRIFTVÄGARNA inte är
 * grindade.
 *
 * Den luckan var inte teoretisk. verify-ord153-s6-prod.js påstod sig göra just
 * den kontrollen (S6-06), men läste två fält som inte finns i svaret och
 * passerade därför på enbart HTTP 200 — och kan sedan ORD-74 inte ens köras mot
 * prod, eftersom ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false stänger den publika
 * bokningen. Assertionen fanns alltså på papperet men aldrig i verkligheten.
 *
 * Felet som ska fångas: någon lindar in bokningsbekräftelsen (eller en annan
 * driftväg) i isCcoSendLive() "för säkerhets skull" under frysen, och kliniken
 * slutar tyst skicka bekräftelser till patienter som bokat tid. Det märks inte
 * i loggarna — mailet blir en dry-run, inte ett fel.
 *
 * Statisk kontroll, medvetet: den kör vid varje commit utan ägartoken, öppen
 * webbokning eller prod-uppkoppling. Se ccoSendLiveGate.js docstring för
 * listan över avsiktliga driftvägar.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');

// Filer som bär en driftväg. Att stå med här betyder: "den här vägen ska
// fortsätta skicka under exportfrysen". Lägg till en fil när en ny driftväg
// tillkommer — och ta ALDRIG bort en härifrån för att göra testet grönt.
const DRIFT_PATHS = [
  {
    file: path.join('src', 'routes', 'publicBookingEngine.js'),
    label: 'bokningsbekräftelse + operatörsnotis',
  },
  {
    file: path.join('src', 'ops', 'bookingReminderScheduler.js'),
    label: 'bokningspåminnelser',
  },
  {
    file: path.join('src', 'ops', 'ccoJournalBookingBridge.js'),
    label: 'journalbrygga för webbokning',
  },
  {
    file: path.join('src', 'sms', 'smsConnector.js'),
    label: 'SMS-transport (staff-SMS, påminnelser)',
  },
  {
    file: path.join('src', 'infra', 'transactionalMailer.js'),
    label: 'transaktionell mailer (delas av driftvägarna)',
  },
];

// Grindens avtryck: importen, avläsningen och skäl-strängen den producerar.
const GATE_MARKERS = [
  { pattern: /ccoSendLiveGate/, label: 'import av grindmodulen' },
  { pattern: /isCcoSendLive/, label: 'avläsning av grinden' },
  { pattern: /send_gate_off/, label: 'grindens skäl-sträng' },
];

test('driftvägarna konsulterar inte CCO_SEND_LIVE-grinden', () => {
  const violations = [];

  for (const { file, label } of DRIFT_PATHS) {
    const absolute = path.join(REPO_ROOT, file);
    assert.ok(
      fs.existsSync(absolute),
      `${file} finns inte längre — driftvägen "${label}" har flyttat eller tagits bort. ` +
        'Uppdatera DRIFT_PATHS medvetet, ta inte bort raden för att bli grön.'
    );

    const source = fs.readFileSync(absolute, 'utf8');
    for (const { pattern, label: marker } of GATE_MARKERS) {
      if (pattern.test(source)) {
        violations.push(`${file} (${label}) innehåller ${marker} — ${pattern}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    'En driftväg har grindats under CCO_SEND_LIVE. Det tystar bekräftelser till ' +
      'patienter utan att något felar — mailet blir dry-run, inte error.\n' +
      violations.map((v) => `  - ${v}`).join('\n')
  );
});

// Skyddar testet mot sig självt: går grinden att hitta överhuvudtaget? Utan den
// här kontrollen blir testet ovan tyst grönt den dag modulen byter namn, och
// vi tror vi har ett skydd vi inte har.
test('grindmodulen finns och exporterar isCcoSendLive', () => {
  const gate = require(path.join(REPO_ROOT, 'src', 'ops', 'ccoSendLiveGate.js'));
  assert.equal(typeof gate.isCcoSendLive, 'function');
  assert.equal(gate.isCcoSendLive({ CCO_SEND_LIVE: 'true' }), true);
  assert.equal(gate.isCcoSendLive({ CCO_SEND_LIVE: 'off' }), false);
  assert.equal(gate.isCcoSendLive({}), false);
});
