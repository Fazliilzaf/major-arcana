/**
 * Playwright — mobil UX (iPhone 13 / 390px).
 */
const {
  resolveMobileDeviceProfile,
  mobileBrowserContextOptions,
} = require('./scripts/lib/mobilePlaywrightDevices');

const profile = resolveMobileDeviceProfile(process.env.ARCANA_MOBILE_DEVICE);

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
    ...mobileBrowserContextOptions(profile),
  },
  reporter: [['list']],
  retries: 0,
};
