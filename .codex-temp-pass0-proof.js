/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForIdle(page, ms = 1200) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
}

async function main() {
  const baseUrl = process.env.ARCANA_BASE_URL || 'http://127.0.0.1:3000';
  const outDir = process.env.ARCANA_OUT_DIR
    || path.join(process.cwd(), 'artifacts', 'pass0-local-proof');
  await ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });

  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  }).catch(() => {});

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto(`${baseUrl}/cco`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 45000 });
  const ccoSectionNav = page.locator('.sectionNavBtn[data-target="ccoWorkspaceSection"]');
  if (await ccoSectionNav.count()) {
    await ccoSectionNav.first().click().catch(() => {});
  }
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'visible', timeout: 45000 });
  await waitForIdle(page, 2200);

  // Ensure queue/work view is active, then select the first row for read/reply captures.
  const queueMode = page.locator('#ccoInboxModeToggle [data-cco-mail-view="queue"]');
  if (await queueMode.count()) {
    await queueMode.first().click().catch(() => {});
    await waitForIdle(page, 800);
  }
  const workDensity = page.locator('#ccoInboxDensityFilters [data-cco-density-mode="work"]');
  if (await workDensity.count()) {
    await workDensity.first().click().catch(() => {});
    await waitForIdle(page, 600);
  }
  const firstRow = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn').first();
  if (await firstRow.count()) {
    await firstRow.click().catch(() => {});
    await waitForIdle(page, 1200);
  }

  await page.screenshot({ path: path.join(outDir, 'full.png'), fullPage: false });

  await page.locator('.cco-center-title').screenshot({
    path: path.join(outDir, 'arbetsko-top.png'),
  }).catch(async () => {
    await page.locator('#ccoCenterColumn').screenshot({ path: path.join(outDir, 'arbetsko-top.png') });
  });

  await page.locator('#ccoInboxWorklist').screenshot({
    path: path.join(outDir, 'lista.png'),
  });

  await page.locator('#ccoConversationColumn').screenshot({
    path: path.join(outDir, 'laspanel-historik.png'),
  });

  await page.locator('#ccoComposeStudio').screenshot({
    path: path.join(outDir, 'svarsstudio.png'),
  });

  const diagnostics = await page.evaluate(() => {
    const byId = (id) => {
      const node = document.getElementById(id);
      if (!node) return null;
      const styles = window.getComputedStyle(node);
      return {
        id,
        hiddenAttr: node.hasAttribute('hidden'),
        display: styles.display,
        position: styles.position,
        opacity: styles.opacity,
        visibility: styles.visibility,
      };
    };
    return {
      bodyClasses: document.body.className,
      replyState: document.querySelector('.cco-reply')?.getAttribute('data-cco-reply-state') || null,
      mainBlocks: byId('ccoReplyMainBlocks'),
      conversation: byId('ccoConversationColumn'),
      compose: byId('ccoComposeStudio'),
    };
  });
  await fs.writeFile(
    path.join(outDir, 'diagnostics.json'),
    JSON.stringify(diagnostics, null, 2)
  );

  await browser.close();
  console.log(outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
