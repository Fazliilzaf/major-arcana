const { chromium } = require('playwright');
require('dotenv').config({ path: '/Users/fazlikrasniqi/Desktop/Arcana/.env' });
(async () => {
  const baseUrl = 'http://localhost:3000';
  const email = process.env.ARCANA_OWNER_EMAIL;
  const password = String(process.env.ARCANA_OWNER_PASSWORD || '').replace(/^['\"]|['\"]$/g, '');
  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-host': 'arcana-staging.onrender.com' },
    body: JSON.stringify({ email, password, tenantId: 'hair-tp-clinic' }),
  });
  const payload = await loginResponse.json();
  if (!payload?.token) throw new Error(`login failed: ${JSON.stringify(payload)}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1720, height: 1120 } });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem('ARCANA_ADMIN_TOKEN', String(t || ''));
  }, payload.token);
  const getCounts = async () => page.evaluate(() => {
    const map = {};
    document.querySelectorAll('#ccoNextPreviewRoot .cco-next-preview-scenario-btn').forEach((btn) => {
      map[btn.getAttribute('data-cco-next-scenario') || 'unknown'] = btn.querySelector('.cco-next-preview-scenario-count')?.textContent?.trim() || '';
    });
    return map;
  });
  await page.goto(`${baseUrl}/cco-next`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#ccoNextPreviewRoot .cco-next-preview-workspace', { timeout: 30000 });
  await page.waitForTimeout(1200);
  const before = await getCounts();
  await page.click('#ccoNextPreviewRoot [data-cco-next-action="send-preview"]');
  await page.waitForTimeout(700);
  const afterSend = {
    counts: await getCounts(),
    activeThread: await page.locator('#ccoNextPreviewRoot .cco-next-preview-thread.is-active .cco-next-preview-thread-sender').first().textContent(),
  };
  await page.goto(`${baseUrl}/cco`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(1000);
  const legacy = await page.evaluate(() => ({
    legacyDisplay: getComputedStyle(document.getElementById('ccoWorkspaceSection')).display,
    previewDisplay: getComputedStyle(document.getElementById('ccoNextWorkspaceSection')).display,
  }));
  console.log(JSON.stringify({ before, afterSend, legacy }, null, 2));
  await browser.close();
})();
