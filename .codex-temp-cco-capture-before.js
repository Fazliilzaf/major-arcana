const { chromium } = require('playwright');
const path = require('path');
(async() => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3100/cco?evidence=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const resolveReplySelector = async () => {
    const rightRail = page.locator('#ccoRightRail').first();
    if (await rightRail.count()) return '#ccoRightRail';
    return '#ccoReplyColumn';
  };
  const out = path.join(process.cwd(), 'docs/ops/evidence/vnext-cleanup');
  const shots = [
    ['top-shell-before.png', '#adminHeader'],
    ['utility-rail-before.png', '#ccoWorkspaceSection .cco-toolbar'],
    ['left-center-balance-before.png', '#ccoWorkspaceLayout'],
    ['center-list-before.png', '#ccoMailWorkbench'],
    ['right-work-before.png', await resolveReplySelector()],
  ];
  for (const [name, sel] of shots) {
    await page.locator(sel).screenshot({ path: path.join(out, name) });
  }
  const inboundBtn = page.locator('[data-cco-mail-view="inbound"]');
  if (await inboundBtn.count()) {
    await inboundBtn.click();
    await page.waitForTimeout(900);
    await page.locator(await resolveReplySelector()).screenshot({ path: path.join(out, 'right-readonly-before.png') });
  }
  await browser.close();
})();
