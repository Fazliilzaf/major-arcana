/**
 * Playwright — mobil UX (iPhone 13 / 390px).
 */
const { devices } = require('@playwright/test');

module.exports = {
  testDir: './tests/visual',
  testMatch: 'mobile-customers.spec.js',
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
    ...devices['iPhone 13'],
    locale: 'sv-SE',
  },
  reporter: [['list']],
  retries: 0,
};
