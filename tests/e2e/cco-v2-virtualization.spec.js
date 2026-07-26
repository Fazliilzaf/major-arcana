/**
 * Browser-test för V2-inkorgens scroll-virtualisering (riktig Chromium).
 *
 * Varför detta finns: JSDOM-testerna kan inte reproducera verkliga
 * browsermått. Spacers, fasta radhöjder och skillnaden mellan "listan
 * scrollar internt" (desktop/iPad) och "sidan scrollar" (mobil ≤768px, där
 * .inbox-shell får max-height:none) syns bara med riktig layout.
 *
 * Kör: npx playwright test --config=tests/e2e/playwright.virtualization.config.js
 */
const { test, expect } = require('@playwright/test');

const THREADS = 220;
const HARNESS = `/tests/e2e/cco-v2-virtualization-harness.html?threads=${THREADS}`;

/** Läser virtualiseringens faktiska tillstånd ur DOM. */
async function readState(page) {
  return page.evaluate(() => {
    const inbox = document.querySelector('[data-v2-inbox]');
    const mount = inbox.querySelector('[data-v2-inbox-mount]');
    const top = inbox.querySelector('[data-v2-inbox-spacer-top]');
    const bottom = inbox.querySelector('[data-v2-inbox-spacer-bottom]');
    const rows = Array.from(mount.querySelectorAll('[data-thread-id]'));
    const px = (el) => parseInt(String(el && el.style.height) || '0', 10) || 0;
    return {
      domRowCount: rows.length,
      firstRowId: rows.length ? rows[0].getAttribute('data-thread-id') : null,
      lastRowId: rows.length ? rows[rows.length - 1].getAttribute('data-thread-id') : null,
      topSpacer: px(top),
      bottomSpacer: px(bottom),
      rowHeight: rows.length ? Math.round(rows[0].getBoundingClientRect().height) : 0,
      inboxScrollTop: Math.round(inbox.scrollTop),
      inboxScrollHeight: Math.round(inbox.scrollHeight),
      inboxClientHeight: Math.round(inbox.clientHeight),
      pageScrollY: Math.round(window.scrollY),
      pageScrollHeight: Math.round(document.documentElement.scrollHeight),
      innerHeight: Math.round(window.innerHeight),
    };
  });
}

async function gotoHarness(page) {
  await page.goto(HARNESS, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__v2HarnessReady === true);
  await page.waitForSelector('[data-v2-inbox-mount] [data-thread-id]');
}

test.describe('V2-inkorgens virtualisering i riktig browser', () => {
  test('mobil 390x844: sidans scroll driver fönstret hela vägen till sista tråden', async ({
    page,
  }) => {
    await gotoHarness(page);

    const atTop = await readState(page);

    // Grundkrav: riktiga spacers finns och bara ett litet fönster ligger i DOM.
    expect(atTop.domRowCount).toBeGreaterThan(0);
    expect(atTop.domRowCount).toBeLessThan(THREADS);
    expect(atTop.bottomSpacer).toBeGreaterThan(0);
    expect(atTop.firstRowId).toBe('t-0');

    // Fast radhöjd (virtualiseringens kontrakt) — comfortable = 92px.
    expect(atTop.rowHeight).toBe(92);

    // Riktiga spacers: listan är lika hög som HELA den virtuella listan
    // (220 rader × 95px = 20900px), trots att bara ~30 rader finns i DOM.
    const virtualHeight = THREADS * 95;
    expect(atTop.inboxScrollHeight).toBeGreaterThanOrEqual(Math.round(virtualHeight * 0.95));

    // Mobil-layouten: SIDAN är scroll-containern. .inbox-list växer till hela
    // innehållet (scrollHeight ≈ clientHeight) så den scrollar INTE internt —
    // därför måste fönstret drivas av sidans scroll.
    expect(atTop.pageScrollHeight).toBeGreaterThan(atTop.innerHeight);
    expect(atTop.inboxScrollHeight).toBeLessThanOrEqual(atTop.inboxClientHeight + 2);

    // ── Scrolla till MITTEN via sidans scroll ──
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-v2-inbox-mount] [data-thread-id]')
          .getAttribute('data-thread-id') !== 't-0'
    );
    const middle = await readState(page);

    expect(middle.pageScrollY).toBeGreaterThan(0);
    expect(middle.firstRowId).not.toBe('t-0');
    expect(middle.topSpacer).toBeGreaterThan(0);
    expect(middle.domRowCount).toBeLessThan(THREADS);
    // Listan har aldrig scrollat internt — sidan gjorde jobbet.
    expect(middle.inboxScrollTop).toBe(0);

    // ── Scrolla till BOTTEN via sidans scroll ──
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(
      () => !!document.querySelector(`[data-v2-inbox-mount] [data-thread-id="t-${219}"]`)
    );
    const bottom = await readState(page);

    // Sista tråden finns i DOM, är synlig, och botten-spacern är slut.
    const lastRow = page.locator('[data-v2-inbox-mount] [data-thread-id="t-219"]');
    await expect(lastRow).toBeVisible();
    expect(bottom.bottomSpacer).toBe(0);
    expect(bottom.inboxScrollTop).toBe(0);
    expect(bottom.domRowCount).toBeLessThan(THREADS);
  });

  test('iPad/desktop: intern .inbox-list-scroll styr fönstret (sidan scrollar inte)', async ({
    page,
  }) => {
    await gotoHarness(page);

    const atTop = await readState(page);
    expect(atTop.firstRowId).toBe('t-0');
    expect(atTop.domRowCount).toBeLessThan(THREADS);
    expect(atTop.bottomSpacer).toBeGreaterThan(0);

    // Här är .inbox-list en verklig, höjdbegränsad scroll-container.
    expect(atTop.inboxScrollHeight).toBeGreaterThan(atTop.inboxClientHeight);

    // ── Intern scroll till mitten ──
    await page.evaluate(() => {
      const inbox = document.querySelector('[data-v2-inbox]');
      inbox.scrollTop = inbox.scrollHeight / 2;
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-v2-inbox-mount] [data-thread-id]')
          .getAttribute('data-thread-id') !== 't-0'
    );
    const middle = await readState(page);

    expect(middle.inboxScrollTop).toBeGreaterThan(0);
    expect(middle.firstRowId).not.toBe('t-0');
    expect(middle.topSpacer).toBeGreaterThan(0);
    // Sidan ska inte vara den som scrollar i detta spann.
    expect(middle.pageScrollY).toBe(0);

    // ── Intern scroll till botten ──
    await page.evaluate(() => {
      const inbox = document.querySelector('[data-v2-inbox]');
      inbox.scrollTop = inbox.scrollHeight;
    });
    await page.waitForFunction(
      () => !!document.querySelector('[data-v2-inbox-mount] [data-thread-id="t-219"]')
    );
    const bottom = await readState(page);

    await expect(page.locator('[data-v2-inbox-mount] [data-thread-id="t-219"]')).toBeVisible();
    expect(bottom.bottomSpacer).toBe(0);
    expect(bottom.domRowCount).toBeLessThan(THREADS);
  });
});
