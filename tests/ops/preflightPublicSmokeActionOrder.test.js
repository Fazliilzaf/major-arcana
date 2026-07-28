'use strict';

/**
 * Drift-gatens felsökningsordning: BASE_URL före credentials.
 *
 * BAKGRUND — två gånger fel, på olika sätt.
 *
 * Först pekade rapporten ut OWNER credentials som P0. Drift-gaten larmade sex
 * gånger på två dygn med den texten medan orsaken var att BASE_URL pekade på en
 * legacy-värd som 301:ade. Åtgärd: credentials degraderades till P1 och en P0
 * om att läsa smoke-loggens felrad lades till.
 *
 * Men den nya texten sa "Först när felet ligger i ett auth-steg är credentials
 * rätt spår." Det var också fel, och på ett farligare sätt — för det lät rimligt.
 *
 * 2026-07-28 bevisades motsatsen i prod. Drift-gaten föll på auth/me med
 * {"error":"Inloggning krävs."} — ett auth-steg. Credentials var oförändrade och
 * korrekta. Orsaken var ARCANA_PUBLIC_BASE_URL på .se: sessionskakan är
 * värdbunden, så login lyckas (curl följer 301 och kakan sätts på .com) medan
 * nästa anrop går till .se utan kaka. Bytet till .com löste det utan att röra
 * credentials.
 *
 * Ett auth-fel med rätt credentials och fel värd ser ALLTID ut som ett auth-fel
 * med fel credentials. Därför måste ordningen vara låst i test, inte i en
 * kommentar som nästa person kan omformulera i god tro.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SKRIPT = path.join(__dirname, '..', '..', 'scripts', 'preflight-report-actions.js');

function körMotRapport(rapport) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-actions-'));
  const fil = path.join(dir, 'preflight.json');
  fs.writeFileSync(fil, JSON.stringify(rapport));
  try {
    const ut = execFileSync(process.execPath, [SKRIPT, '--file', fil, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, DOTENV_CONFIG_QUIET: 'true' },
    });
    // dotenv skriver en banner till stdout ("[dotenv@…] injecting env …") som
    // ligger före JSON:en. Klipp från första { i stället för att lita på att
    // bannern är avstängd — den har dykt upp och försvunnit mellan versioner.
    const start = ut.indexOf('{');
    assert.ok(start >= 0, `ingen JSON i utdatan: ${ut.slice(0, 200)}`);
    return JSON.parse(ut.slice(start));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const RAPPORT_SMOKE_FEL = {
  exit: { code: 1, reason: 'public_smoke_failed' },
  options: { publicUrl: 'https://arcana.hairtpclinic.com' },
  diagnostics: {},
};

test('BASE_URL-åtgärden är P0, credentials-åtgärden är P1', () => {
  const { actions } = körMotRapport(RAPPORT_SMOKE_FEL);
  const läs = actions.find((a) => a.id === 'public_smoke_read_failure');
  const cred = actions.find((a) => a.id === 'public_smoke_credentials');

  assert.ok(läs, 'åtgärden att läsa smoke-loggen ska finnas');
  assert.ok(cred, 'credentials-åtgärden ska finnas');
  assert.equal(läs.priority, 'P0');
  assert.equal(cred.priority, 'P1');
});

test('läs-åtgärden kommer före credentials-åtgärden i utdatan', () => {
  const { actions } = körMotRapport(RAPPORT_SMOKE_FEL);
  const iLäs = actions.findIndex((a) => a.id === 'public_smoke_read_failure');
  const iCred = actions.findIndex((a) => a.id === 'public_smoke_credentials');

  assert.ok(iLäs < iCred, `läs-åtgärden (${iLäs}) ska ligga före credentials (${iCred})`);
});

test('P0-texten säger uttryckligen att ett auth-fel INTE utesluter BASE_URL', () => {
  // Det här är regressionen. Den gamla texten sa motsatsen och lät rimlig.
  const { actions } = körMotRapport(RAPPORT_SMOKE_FEL);
  const läs = actions.find((a) => a.id === 'public_smoke_read_failure');
  const text = String(läs.details || '');

  assert.match(
    text,
    /auth-steg/i,
    'texten måste ta upp auth-steget explicit — annars är fällan osynlig'
  );
  assert.ok(
    /INTE|inte betyder|utesluter inte/i.test(text),
    'texten måste säga att ett auth-fel inte utesluter BASE_URL som orsak'
  );
  assert.match(
    text,
    /kak|cookie/i,
    'mekanismen (värdbunden sessionskaka) ska stå, inte bara slutsatsen'
  );

  // Den gamla, falsifierade formuleringen får inte återuppstå.
  assert.doesNotMatch(
    text,
    /Först när felet ligger i ett auth-steg är credentials rätt spår/,
    'den formuleringen är motbevisad 2026-07-28 — auth/me föll på fel BASE_URL, inte fel credentials'
  );
});

test('credentials-åtgärden anger BASE_URL-kontrollen som förutsättning', () => {
  const { actions } = körMotRapport(RAPPORT_SMOKE_FEL);
  const cred = actions.find((a) => a.id === 'public_smoke_credentials');
  const text = String(cred.details || '') + ' ' + String(cred.title || '');

  assert.match(
    text,
    /BASE_URL/,
    'credentials-åtgärden ska peka tillbaka på BASE_URL-kontrollen'
  );
  assert.match(
    text,
    /hairtpclinic\.com/,
    'den kanoniska värden ska stå utskriven — "rätt värd" räcker inte som instruktion'
  );
});

test('inga smoke-åtgärder när smoken inte föll', () => {
  const { actions } = körMotRapport({
    exit: { code: 0, reason: '' },
    options: { publicUrl: 'https://arcana.hairtpclinic.com' },
    diagnostics: {},
  });
  assert.equal(
    actions.filter((a) => a.id.startsWith('public_smoke_')).length,
    0,
    'åtgärderna ska bara föreslås när exit.reason är public_smoke_failed'
  );
});
