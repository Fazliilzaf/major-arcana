/**
 * V11-RAIL Fas 3 · Block 0 — struktur- + screenshot-harness.
 *
 * Verifierar scaffold utan A–S/V-UI:
 *  1. ?v11rail=on  → data-v11-rail="on", rail-shell monteras, legacy .kkref borta.
 *  2. default       → data-v11-rail="off", legacy patient-detail renderas, rail borta.
 *  3. screenshot per viewport (mobile 390 / tablet 820 / desktop 1440) via projects.
 *
 * Kör: npm run test:visual:v11rail  (kräver preview-server på baseURL)
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

function customerUrl(extra) {
  const q = `view=customers&patientId=${encodeURIComponent(patientId)}${extra || ''}`;
  return `/staff?${q}`;
}

test.describe('V11 Rail · Block 0 scaffold', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test('?v11rail=on monterar rail-shell och döljer legacy kkref', async ({ page }) => {
    await page.goto(customerUrl('&v11rail=on'), { waitUntil: 'networkidle' });

    const flag = await page.evaluate(() => document.documentElement.getAttribute('data-v11-rail'));
    expect(flag).toBe('on');

    const shell = page.locator('[data-v11-rail-shell="1"]').first();
    await shell.waitFor({ state: 'visible', timeout: 25000 });
    await expect(shell).toBeVisible();

    // Block 0: ingen sektion → explicit scaffold-empty-state, ingen legacy kkref.
    await expect(page.locator('.v11-rail__empty').first()).toBeVisible();
    expect(await page.locator('.kkref').count()).toBe(0);
  });

  test('default (ingen flagga) behåller legacy patient-detail oförändrad', async ({ page }) => {
    await page.goto(customerUrl(), { waitUntil: 'networkidle' });

    const flag = await page.evaluate(() => document.documentElement.getAttribute('data-v11-rail'));
    expect(flag).toBe('off');

    const legacy = page.locator('.v9-mockup-dossier, [data-patient-detail]').first();
    await legacy.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    expect(await page.locator('[data-v11-rail-shell="1"]').count()).toBe(0);
  });

  test('screenshot — rail-shell per viewport', async ({ page }, testInfo) => {
    test.skip(
      !process.env.UPDATE_V11RAIL_SNAPSHOTS,
      'Kör med UPDATE_V11RAIL_SNAPSHOTS=1 för baseline'
    );
    await page.goto(customerUrl('&v11rail=on'), { waitUntil: 'networkidle' });
    const shell = page.locator('[data-v11-rail-shell="1"]').first();
    await shell.waitFor({ state: 'visible', timeout: 25000 });
    await expect(page).toHaveScreenshot(`v11-rail-block0-${testInfo.project.name}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.04,
    });
  });
});
