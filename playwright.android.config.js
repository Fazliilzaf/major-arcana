/**
 * Playwright — Android mobil UX (Pixel 5 / BL.3).
 */
const {
  resolveAndroidDeviceProfile,
  mobileBrowserContextOptions,
} = require('./scripts/lib/mobilePlaywrightDevices');

const profile = resolveAndroidDeviceProfile(process.env.ARCANA_ANDROID_DEVICE);

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
