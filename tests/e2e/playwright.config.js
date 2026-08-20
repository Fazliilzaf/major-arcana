// Playwright config för E2E-tester (T3 Test enterprise).
// Kör: npx playwright test --config=tests/e2e/playwright.config.js
//
// Förutsätter: npm i -D @playwright/test + npx playwright install chromium

const BAS_URL = process.env.CCO_E2E_BASE_URL || 'http://localhost:3000';

/**
 * Startar servern själv när testerna körs mot localhost.
 *
 * ── Varför ──────────────────────────────────────────────────────────────────
 *
 * Configen saknade `webServer` och förutsatte att någon redan startat servern.
 * Gjorde man inte det failade varje test med
 *
 *     Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/...
 *
 * Det ser ut som tio trasiga tester, inte som en server som inte körde. Vid
 * körningen 2026-08-20 rapporterades "10 röda E2E-tester" och gissningen blev
 * ett bundle- eller hash-problem. Med servern igång blev samma svit 58 gröna
 * och 0 röda — det fanns ingenting att felsöka.
 *
 * ── Två saker som är medvetna ───────────────────────────────────────────────
 *
 * `reuseExistingServer` gör att en server du redan startat i en egen terminal
 * används i stället för att Playwright vägrar starta.
 *
 * Servern startas bara när baseURL pekar på localhost. Sätter någon
 * CCO_E2E_BASE_URL mot en riktig miljö ska vi inte starta en lokal server
 * bredvid och testa fel sak.
 *
 * NODE_ENV sätts uttryckligen till 'test'. Ärvs `production` in i skalet
 * slutar `x-cco-role` fungera och devDependencies rensas bort — testerna faller
 * då på ett sätt som inte har med koden att göra.
 */
const arLokal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BAS_URL);

module.exports = {
  testDir: '.',
  testIgnore: 'cco-v2-virtualization.spec.js',
  timeout: 30000,
  retries: 1,
  workers: 1,
  ...(arLokal
    ? {
        webServer: {
          command: 'node server.js',
          url: BAS_URL,
          cwd: require('path').resolve(__dirname, '..', '..'),
          reuseExistingServer: true,
          // Servern läser in scheduler, mailkö och asset-pipeline vid start.
          // Mätt uppstartstid ~12 s; 120 s ger marginal på en långsam maskin.
          timeout: 120000,
          stdout: 'ignore',
          stderr: 'pipe',
          env: { ...process.env, NODE_ENV: 'test' },
        },
      }
    : {}),
  use: {
    baseURL: BAS_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    extraHTTPHeaders: {
      Authorization: process.env.CCO_E2E_TOKEN ? `Bearer ${process.env.CCO_E2E_TOKEN}` : '',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-iphone',
      use: { browserName: 'chromium', viewport: { width: 414, height: 850 } },
    },
  ],
};
