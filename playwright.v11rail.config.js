/**
 * Playwright — V11-RAIL Fas 3 · Block 0 screenshot/structure-harness.
 *
 * Tre viewporter enligt canon §7 acceptance:
 *   mobile  390×844
 *   tablet  820×1180
 *   desktop 1440×1000
 *
 * Kör (kräver preview-server på baseURL, default 127.0.0.1:3100):
 *   npm run test:visual:v11rail
 *
 * Uppdatera baseline-screenshots:
 *   UPDATE_V11RAIL_SNAPSHOTS=1 npm run test:visual:v11rail -- --update-snapshots
 */
module.exports = {
  testDir: './tests/visual',
  testMatch: 'v11-rail-block0.spec.js',
  timeout: 45000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.04,
      threshold: 0.25,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100',
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet-820', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 1000 } } },
  ],
  reporter: [['list']],
  retries: 0,
};
