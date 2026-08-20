'use strict';

/**
 * Playwright ska starta servern sjalv nar testerna kors mot localhost.
 *
 * ── Bakgrunden ──────────────────────────────────────────────────────────────
 *
 * Configen saknade `webServer`. Kordes sviten utan att nagon startat servern
 * failade varje test med
 *
 *     Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/...
 *
 * Det ser ut som trasiga tester, inte som en server som inte kor. Vid
 * korningen 2026-08-20 rapporterades "10 roda E2E-tester" med gissningen att
 * det var ett bundle- eller hash-problem. Med servern igang blev samma svit
 * 58 grona och 0 roda — det fanns ingenting att felsoka.
 *
 * En felaktig diagnos kostar mer an ett rott test, eftersom nasta person borjar
 * leta pa fel stalle. Darfor lases beteendet fast har.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, 'playwright.config.js');

function laddaConfig(env = {}) {
  const original = { ...process.env };
  Object.assign(process.env, env);
  delete require.cache[require.resolve(CONFIG_PATH)];
  try {
    return require(CONFIG_PATH);
  } finally {
    // Modulen laser process.env vid import, sa miljon maste aterstallas
    // helt — inte bara de nycklar vi satte.
    for (const nyckel of Object.keys(process.env)) delete process.env[nyckel];
    Object.assign(process.env, original);
    delete require.cache[require.resolve(CONFIG_PATH)];
  }
}

test('startar servern nar baseURL ar localhost', () => {
  const cfg = laddaConfig({ CCO_E2E_BASE_URL: '' });
  assert.ok(cfg.webServer, 'webServer saknas — sviten failar med ERR_CONNECTION_REFUSED');
  assert.match(cfg.webServer.command, /server\.js/);
});

test('aterbrukar en server som redan kor', () => {
  // Utan detta vagrar Playwright starta nar man har servern igang i en egen
  // terminal, vilket ar det vanligaste satter att jobba lokalt.
  const cfg = laddaConfig({ CCO_E2E_BASE_URL: '' });
  assert.equal(cfg.webServer.reuseExistingServer, true);
});

test('startar INTE en lokal server nar man testar mot en riktig miljo', () => {
  // Annars startas en localhost-server bredvid och man tror att man testat
  // den riktiga miljon.
  const cfg = laddaConfig({ CCO_E2E_BASE_URL: 'https://arcana.hairtpclinic.com' });
  assert.equal(cfg.webServer, undefined);
  assert.equal(cfg.use.baseURL, 'https://arcana.hairtpclinic.com');
});

test('kanner igen 127.0.0.1 som lokalt', () => {
  const cfg = laddaConfig({ CCO_E2E_BASE_URL: 'http://127.0.0.1:3000' });
  assert.ok(cfg.webServer, '127.0.0.1 ar ocksa localhost');
});

test('later inte NODE_ENV=production folja med in i servern', () => {
  // Med production slutar x-cco-role fungera och devDependencies rensas bort.
  // Testerna faller da pa ett satt som inte har med koden att gora.
  const cfg = laddaConfig({ CCO_E2E_BASE_URL: '', NODE_ENV: 'production' });
  assert.equal(cfg.webServer.env.NODE_ENV, 'test');
});

test('vantar tillrackligt lange pa uppstarten', () => {
  // Servern laser in scheduler, mailko och asset-pipeline. Uppmatt ~12 s.
  const cfg = laddaConfig({ CCO_E2E_BASE_URL: '' });
  assert.ok(cfg.webServer.timeout >= 60000, 'for kort timeout ger falska fel pa en langsam maskin');
});

test('configen ar i ovrigt orord', () => {
  const cfg = laddaConfig({ CCO_E2E_BASE_URL: '' });
  assert.equal(cfg.workers, 1);
  assert.equal(cfg.retries, 1);
  assert.equal(cfg.projects.length, 2);
  assert.deepEqual(
    cfg.projects.map((p) => p.name),
    ['chromium', 'mobile-iphone']
  );
});
