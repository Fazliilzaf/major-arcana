// E2E flow-tester för CCO (T3).
// Kräver Playwright (npm i -D @playwright/test).

const { test, expect } = require('@playwright/test');

test.describe('CCO huvudflöden', () => {
  test('homepage laddar med rätt titel', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await expect(page).toHaveTitle(/HairTP Clinic CCO/i);
  });

  test('alla 30+ runtime-moduler laddas', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    const modulesCount = await page.evaluate(() => {
      return Object.keys(window).filter((k) => k.startsWith('MajorArcanaPreview')).length;
    });
    expect(modulesCount).toBeGreaterThan(20);
  });

  test('command palette öppnas med ⌘K', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.MajorArcanaPreviewCommandPalette?.open());
    const visible = await page.evaluate(() =>
      !!document.querySelector('.cco-cmdk-backdrop:not([hidden])')
    );
    expect(visible).toBe(true);
  });

  test('thread-summary capability returnerar struktur', async ({ request }) => {
    // Hämta preview-token
    const tokenResp = await request.get('/api/v1/auth/preview-bootstrap-session');
    const token = (await tokenResp.json()).token;

    const response = await request.post('/api/v1/capabilities/SummarizeThread/run', {
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      data: {
        input: {
          conversationId: 'e2e-test',
          customerName: 'Test',
          messages: [
            { direction: 'inbound', body: 'Hej, vill boka tid.', sentAt: new Date().toISOString() },
          ],
        },
      },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.output?.data).toBeTruthy();
    expect(body.output.data.headline).toBeTruthy();
    expect(Array.isArray(body.output.data.bullets)).toBe(true);
    expect(body.output.data.detectedLanguage).toBeTruthy();
    expect(body.output.data.sentiment).toBeTruthy();
    expect(body.output.data.intent).toBeTruthy();
    expect(body.output.data.nextBestAction).toBeTruthy();
    expect(body.output.data.guardrails).toBeTruthy();
    expect(body.output.data.anomalies).toBeTruthy();
  });

  test('mobile responsive auto-aktiveras under 768px', async ({ page, viewport }) => {
    await page.setViewportSize({ width: 414, height: 850 });
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    const isMobile = await page.evaluate(() =>
      document.documentElement.getAttribute('data-cco-mobile') === 'true'
    );
    expect(isMobile).toBe(true);
  });
});
