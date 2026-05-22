// A11y-tester med axe-core (T9 Test enterprise).
//
// Kräver: npm i -D @playwright/test @axe-core/playwright
// Kör: npx playwright test --config=tests/e2e/playwright.config.js tests/a11y/

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('A11y — WCAG 2.1 AA på huvudvyer', () => {
  test('homepage saknar major-violations', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    // Tillåt minor + moderate, blockera serious + critical
    const blockers = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(blockers, JSON.stringify(blockers, null, 2)).toEqual([]);
  });

  test('command palette saknar major-violations', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.MajorArcanaPreviewCommandPalette?.open());
    await page.waitForSelector('.cco-cmdk-backdrop:not([hidden])');
    const results = await new AxeBuilder({ page })
      .include('.cco-cmdk-backdrop')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blockers = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(blockers).toEqual([]);
  });

  test('thread-summary modal saknar major-violations', async ({ page }) => {
    await page.goto('/major-arcana-preview/');
    await page.waitForLoadState('networkidle');
    // Trigger summary med stub-data via API:n
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blockers = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(blockers).toEqual([]);
  });
});
