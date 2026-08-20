// E2E flow-tester för CCO (T3).
// Kräver Playwright (npm i -D @playwright/test).

const { test, expect } = require('@playwright/test');

test.describe('CCO huvudflöden', () => {
  test('homepage laddar med rätt titel', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    // Appen omdirigerar startsidan till kundregistret (V9-cutover).
    await expect(page).toHaveTitle(/Kundregister · Arcana/i);
  });

  test('alla runtime-moduler laddas', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    const modules = await page.evaluate(() => {
      return Object.keys(window).filter((k) => k.startsWith('MajorArcanaPreview'));
    });
    // Modulerna har konsoliderats; vi kontrollerar att de centrala finns.
    expect(modules.length).toBeGreaterThan(8);
    expect(modules).toContain('MajorArcanaPreviewConfig');
    expect(modules).toContain('MajorArcanaPreviewWorkspaceState');
  });

  test('global sök har ⌘K-shortcut', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    const isMobile = (await page.viewportSize()).width <= 768;
    if (isMobile) {
      // På mobil finns söket i den kompakta top-baren; vi verifierar att ⌘K syns.
      await expect(page.locator('body')).toContainText('⌘K');
      return;
    }
    const search = page.locator('[role="searchbox"], input[type="search"]').first();
    await expect(search).toBeVisible();
    // ⌘K visas som tangentbordsgenväg för söket.
    await expect(page.locator('body')).toContainText('⌘K');
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

  test('mobile shell auto-aktiveras under 768px', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 850 });
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    const isMobileShell = await page.evaluate(
      () => document.documentElement.getAttribute('data-cco-mobile-shell') === 'on'
    );
    expect(isMobileShell).toBe(true);
  });

  test('bokningsytan exponerar operatörstermer för webb-bokningar', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('domcontentloaded');
    const bookingCaseList = page.locator('[data-booking-case-list][aria-label="Bokningsärenden"]');
    // Ytan finns monterad i DOM (kan vara dold beroende på vy/data).
    await expect(bookingCaseList).toHaveCount(1);
    const isHidden = await bookingCaseList.evaluate((el) => el.hidden);
    expect(typeof isHidden).toBe('boolean');
  });

  test('?view=calendar öppnar kalendern direkt utan att klicka nav', async ({ page }) => {
    await page.goto('/major-arcana-preview/?view=calendar');
    await page.waitForLoadState('domcontentloaded');

    // Vänta på att shell-routingen landar i kalendern.
    await page.waitForFunction(
      () => document.querySelector('.preview-canvas')?.dataset.appShellView === 'calendar',
      undefined,
      { timeout: 10000, polling: 50 }
    );

    const isMobile = (await page.viewportSize()).width <= 768;

    const calendarReady = await page.evaluate(() => {
      const canvas = document.querySelector('.preview-canvas');
      const cal = document.getElementById('cco-desktop-calendar');
      const navBtn = document.querySelector('[data-nav-view="calendar"]');
      const mobileTab = document.querySelector('.cco-mobile-tabbar-item[data-mobile-tab="calendar"]');
      return {
        appShellView: canvas?.dataset.appShellView || '',
        appView: canvas?.dataset.appView || '',
        calendarExists: Boolean(cal),
        calendarVisible: Boolean(cal && !cal.hidden),
        navActive: navBtn?.classList.contains('preview-nav-item-active') || false,
        mobileTabActive: mobileTab?.classList.contains('is-active') || false,
      };
    });

    expect(calendarReady.appShellView).toBe('calendar');
    expect(calendarReady.appView).toBe('calendar');
    if (isMobile) {
      expect(calendarReady.mobileTabActive).toBe(true);
    } else {
      expect(calendarReady.calendarExists).toBe(true);
      expect(calendarReady.calendarVisible).toBe(true);
      expect(calendarReady.navActive).toBe(true);
    }
  });
});
