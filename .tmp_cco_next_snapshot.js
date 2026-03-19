const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const baseUrl = 'http://localhost:3000';
  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-host': 'arcana-staging.onrender.com' },
    body: JSON.stringify({ email: 'fazli@hairtpclinic.com', password: 'ArcanaPilot!2026', tenantId: 'hair-tp-clinic' }),
  });
  const loginPayload = await loginResponse.json();
  const token = String(loginPayload?.token || '');
  if (!token) throw new Error('no token');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1720, height: 1200 } });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem('ARCANA_ADMIN_TOKEN', String(t || ''));
  }, token);
  await page.goto(`${baseUrl}/cco-next`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ccoNextPreviewRoot .cco-next-preview-workspace', { timeout: 30000 });
  await page.screenshot({ path: '/tmp/cco-next-current.png', fullPage: true });
  const summary = await page.evaluate(() => {
    const root = document.querySelector('#ccoNextPreviewRoot .cco-next-preview-workspace');
    const panels = Array.from(document.querySelectorAll('#ccoNextPreviewRoot .cco-next-preview-surface')).map((el) => {
      const r = el.getBoundingClientRect();
      return { cls: el.className, x: r.x, y: r.y, w: r.width, h: r.height, scrollH: el.scrollHeight, clientH: el.clientHeight };
    });
    const response = document.querySelector('#ccoNextPreviewRoot .cco-next-preview-response-surface');
    const rr = response?.getBoundingClientRect();
    return {
      root: root ? { display: getComputedStyle(root).display, cols: getComputedStyle(root).gridTemplateColumns, gap: getComputedStyle(root).gap } : null,
      response: rr ? { x: rr.x, y: rr.y, w: rr.width, h: rr.height, scrollH: response.scrollHeight, clientH: response.clientHeight } : null,
      panels,
    };
  });
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
})();
