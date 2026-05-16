/**
 * playwright.config.js — visual-regression-test för CCO thread-card.
 *
 * Setup: kör `npm run test:visual` för att jämföra mot baseline.
 * Första run: lägg till `--update-snapshots` för att skapa baseline.
 *
 * Default target: live preview på arcana.hairtpclinic.se. Override
 * via env-var PLAYWRIGHT_BASE_URL för lokal test (t.ex.
 * http://localhost:3000).
 */
module.exports = {
  testDir: './tests/visual',
  timeout: 30000,
  expect: {
    toHaveScreenshot: {
      // Tolerans: max 1% pixel-diff (fångar layout-skifte men inte
      // anti-aliasing-jitter mellan körningar).
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://arcana.hairtpclinic.se',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  // Inga retries — visual tests är deterministiska
  retries: 0,
};
