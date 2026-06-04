/**
 * Mobil visual/structure — iPhone 13 (390×844) kundvy + journal.
 *
 * Kör lokalt:
 *   npm run test:visual:mobile
 *
 * Snapshot baseline (valfritt):
 *   UPDATE_MOBILE_SNAPSHOTS=1 npm run test:visual:mobile -- --update-snapshots
 */
const { test, expect } = require('@playwright/test');

const patientId = process.env.ARCANA_SMOKE_PATIENT_ID || '2e8d3535-cd89-418e-8b68-ca239f8836a4';
const bearerToken = process.env.ARCANA_SMOKE_BEARER_TOKEN || '__preview_local__';

async function seedAuth(page) {
  await page.goto('/staff', { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    localStorage.setItem('ARCANA_ADMIN_TOKEN', token);
    sessionStorage.setItem('ARCANA_ADMIN_TOKEN', token);
  }, bearerToken);
}

test.describe('Mobil kundvy (390px)', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await page.goto(`/staff?view=customers&patientId=${encodeURIComponent(patientId)}`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-cco-mobile-shell') === 'on',
      undefined,
      { timeout: 20000 }
    );
  });

  test('mobil shell attribut och tabbar', async ({ page }) => {
    await expect(page.locator('.cco-mobile-tabbar')).toBeVisible();
    await expect(page.locator('.preview-topbar-left .preview-nav')).toBeHidden();
    await expect(page.locator('#cco-mobile-app-title')).toBeVisible();
    await expect(page.locator('.cco-mobile-tabbar-item[data-mobile-tab="customers"]')).toBeVisible();
  });

  test('kund detail-läge när patient laddas', async ({ page }) => {
    const detail = page.locator('[data-patient-detail], [data-patient-master-rail]').first();
    await detail.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    const hasDetail = await page.evaluate(() =>
      document.documentElement.hasAttribute('data-cco-patient-detail')
    );
    expect(hasDetail).toBe(true);
  });

  test('journal-tab och ta bild när journal renderas', async ({ page }) => {
    const journalTab = page.locator('.patient-master-tab[data-patient-tab="journal"]').first();
    const tabCount = await journalTab.count();
    test.skip(tabCount === 0, 'Ingen journal-tab (patient ej laddad i fixture)');

    await journalTab.click();
    const box = await journalTab.boundingBox();
    expect(box?.height || 0).toBeGreaterThanOrEqual(38);

    const taBild = page.locator('.patient-master-camera-button').first();
    const taBildCount = await taBild.count();
    if (taBildCount > 0) {
      await expect(taBild).toBeVisible();
    }
  });

  test('kund-journal viewport screenshot', async ({ page }) => {
    test.skip(!process.env.UPDATE_MOBILE_SNAPSHOTS, 'Kör med UPDATE_MOBILE_SNAPSHOTS=1 för baseline');
    const rail = page.locator('[data-patient-master-rail]').first();
    await rail.waitFor({ state: 'visible', timeout: 25000 });
    await rail.scrollIntoViewIfNeeded();
    await expect(rail).toHaveScreenshot('mobile-customers-journal-rail.png', {
      maxDiffPixelRatio: 0.04,
    });
  });
});
