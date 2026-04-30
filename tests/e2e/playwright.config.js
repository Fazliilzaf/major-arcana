// Playwright config för E2E-tester (T3 Test enterprise).
// Kör: npx playwright test --config=tests/e2e/playwright.config.js
//
// Förutsätter: npm i -D @playwright/test + npx playwright install chromium

module.exports = {
  testDir: '.',
  timeout: 30000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: process.env.CCO_E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    extraHTTPHeaders: {
      'Authorization': process.env.CCO_E2E_TOKEN
        ? `Bearer ${process.env.CCO_E2E_TOKEN}`
        : '',
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
