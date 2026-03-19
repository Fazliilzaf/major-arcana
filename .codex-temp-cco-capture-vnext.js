const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTDIR = process.argv[2];
const LABEL = process.argv[3] || 'before';
const base = 'http://127.0.0.1:3100/cco?evidence=1';

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  const resolveReplySelector = async () => {
    const rightRail = page.locator('#ccoRightRail').first();
    if (await rightRail.count()) return '#ccoRightRail';
    return '#ccoReplyColumn';
  };
  const save = async (selector, name) => {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 30000 });
    await el.screenshot({ path: path.join(OUTDIR, `${LABEL}-${name}.png`) });
  };
  const clickIf = async (selector) => {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      await loc.click();
      await page.waitForTimeout(700);
    }
  };

  await save('#adminHeader', 'top-shell');
  await save('#ccoWorkspaceSection .cco-toolbar', 'utility-rail');
  await save('#ccoWorkspaceLayout', 'left-center-balance');
  await save('#ccoMailWorkbench', 'center-list');

  await clickIf('#ccoInboxModeToggle button[data-cco-mail-view="inbound"]');
  await clickIf('.cco-feed-item-btn');
  await save(await resolveReplySelector(), 'right-read-only');

  await clickIf('#ccoInboxModeToggle button[data-cco-mail-view="queue"]');
  await clickIf('.cco-thread-btn');
  await save(await resolveReplySelector(), 'right-work-mode');

  await browser.close();
})();
