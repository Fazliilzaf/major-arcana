/**
 * Playwright-config för V2-inkorgens virtualiserings-browsertest.
 *
 * Startar en lokal statisk preview-server och kör samma spec i två viewportar:
 *  - mobile  390x844  → ≤768px: .inbox-shell max-height:none ⇒ SIDAN scrollar
 *  - ipad   1024x768  → >768px: .inbox-shell höjd-bounded ⇒ .inbox-list scrollar
 *
 * Kör: npx playwright test --config=tests/e2e/playwright.virtualization.config.js
 */
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.V2_HARNESS_PORT || 3210);

/**
 * Vissa miljöer har Chromium förinstallerad under en annan revision än den
 * @playwright/test-versionen pinnar (och får inte ladda ned nya browsers).
 * Hittar vi en förinstallerad binär pekar vi ut den; annars låter vi Playwright
 * använda sin egen upplösning.
 */
function resolvePreinstalledChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersRoot || !fs.existsSync(browsersRoot)) return undefined;
  const candidates = fs
    .readdirSync(browsersRoot)
    .filter((entry) => entry.startsWith('chromium'))
    .map((entry) => path.join(browsersRoot, entry, 'chrome-linux', 'chrome'))
    .filter((candidate) => fs.existsSync(candidate));
  return candidates[0];
}

const chromiumExecutable = resolvePreinstalledChromium();
const launchOptions = chromiumExecutable ? { executablePath: chromiumExecutable } : {};

module.exports = {
  testDir: '.',
  testMatch: 'cco-v2-virtualization.spec.js',
  timeout: 45000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-390',
      grep: /mobil 390x844/,
      use: {
        browserName: 'chromium',
        launchOptions,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'ipad-1024',
      grep: /iPad\/desktop/,
      use: {
        browserName: 'chromium',
        launchOptions,
        viewport: { width: 1024, height: 768 },
      },
    },
  ],
  webServer: {
    command: 'node scripts/serve-v2-virtualization-harness.js',
    // Kommandot körs annars relativt configens katalog — servern ligger i repo-roten.
    cwd: require('node:path').resolve(__dirname, '..', '..'),
    url: `http://127.0.0.1:${PORT}/tests/e2e/cco-v2-virtualization-harness.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: { V2_HARNESS_PORT: String(PORT) },
  },
};
