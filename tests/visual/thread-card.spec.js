/**
 * tests/visual/thread-card.spec.js — visual-regression-test.
 *
 * Fångar layout-regressions på thread-card-komponenten. Vid varje
 * körning: ladda CCO, vänta tills appen är settled, ta screenshot av
 * första thread-card, jämför med baseline.
 *
 * Första run: kör `npm run test:visual -- --update-snapshots` för att
 * skapa baseline. Efterföljande runs jämför och fail vid diff > 1%.
 */
const { test, expect } = require('@playwright/test');

test.describe('Thread-card visual-regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/major-arcana-preview/?visual-test=1', { waitUntil: 'networkidle' });
    // Vänta tills första thread-card är renderad
    await page.waitForSelector('.queue-history-list .thread-card[data-runtime-thread]', {
      timeout: 15000,
    });
    // Aktivera alla mailboxar så vi har full data
    await page.evaluate(() => {
      document.querySelectorAll('.mailbox-option-input[data-runtime-mailbox]').forEach((i) => {
        if (!i.checked) {
          i.checked = true;
          i.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
    // Vänta tills signal-bar är applicerad
    await page.waitForTimeout(3500);
    await page.evaluate(() => window.__SignalBar?.apply?.());
    await page.waitForTimeout(500);
  });

  test('första thread-card matchar baseline', async ({ page }) => {
    const card = page
      .locator('.queue-history-list .thread-card[data-runtime-thread]:not([data-runtime-thread="runtime-unified-empty"])')
      .first();
    await card.scrollIntoViewIfNeeded();
    // Maska timestamp så test inte failar pga klock-skifte
    await expect(card).toHaveScreenshot('thread-card-primary.png', {
      mask: [page.locator('.meta-date')],
    });
  });

  test('inbox-list (3 första cards) matchar baseline', async ({ page }) => {
    const list = page.locator('.queue-history-list');
    await expect(list).toHaveScreenshot('inbox-list-top.png', {
      mask: [page.locator('.meta-date')],
      // Begränsa till 3 första card för stabilitet
      clip: { x: 0, y: 0, width: 760, height: 350 },
    });
  });

  test('mailbox-dropdown öppen — pill-styling matchar baseline', async ({ page }) => {
    const toggle = page.locator('#mailbox-menu-toggle');
    await toggle.evaluate((el) => {
      el.checked = true;
    });
    await page.waitForTimeout(300);
    const menu = page.locator('.mailbox-menu').first();
    await expect(menu).toHaveScreenshot('mailbox-dropdown-open.png');
  });
});
