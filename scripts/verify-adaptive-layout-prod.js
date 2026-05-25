#!/usr/bin/env node
'use strict';

/**
 * BL.5 Fas 4 — adaptive layout smoke at canonical viewports.
 * 320, 390 (mobile), 768 (iPad), 1024, 1440 (desktop).
 */
require('dotenv').config({ quiet: true });

const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'https://arcana.hairtpclinic.se'
).replace(/\/+$/, '');

const VIEWPORTS = [
  { id: 'AL-01', label: '320 mobile', width: 320, height: 640, expectMobile: true, expectTablet: false },
  { id: 'AL-02', label: '390 iPhone', width: 390, height: 844, expectMobile: true, expectTablet: false },
  { id: 'AL-03', label: '834 iPad', width: 834, height: 1194, expectMobile: false, expectTablet: true },
  { id: 'AL-04', label: '1024 desktop', width: 1024, height: 768, expectMobile: false, expectTablet: false },
  { id: 'AL-05', label: '1440 desktop', width: 1440, height: 900, expectMobile: false, expectTablet: false },
];

function pass(name, detail = '') {
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  return true;
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  const isLocal = /localhost|127\.0\.0\.1/.test(BASE);
  if (isLocal) return '__preview_local__';
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function injectToken(context, token) {
  await context.addInitScript(
    ({ storageKey, value }) => {
      try {
        window.localStorage.setItem(storageKey, value);
        window.sessionStorage.setItem(storageKey, value);
      } catch {
        /* ignore */
      }
    },
    { storageKey: 'ARCANA_ADMIN_TOKEN', value: token }
  );
}

async function main() {
  let hardFail = false;
  const markFail = (name, detail) => {
    if (fail(name, detail)) hardFail = true;
  };

  console.log(`Adaptive layout verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (ready.ready !== true) markFail('AL-00 readyz');
  else pass('AL-00 readyz');

  const token = getStaffToken();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'sv-SE',
        ignoreHTTPSErrors: true,
      });
      await injectToken(context, token);
      const page = await context.newPage();
      const response = await page.goto(`${BASE}/major-arcana-preview/?view=customers`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      if (!response || response.status() >= 400) {
        markFail(`${vp.id} load`, String(response?.status() || 'no response'));
        await context.close();
        continue;
      }
      await page.waitForFunction(() => document.body?.classList?.contains('is-preview-ready'), null, {
        timeout: 30000,
      }).catch(() => {});

      const flags = await page.evaluate(() => ({
        mobile: document.documentElement.hasAttribute('data-cco-mobile-shell'),
        tablet: document.documentElement.hasAttribute('data-cco-tablet-shell'),
        tabletCalBtn: Boolean(document.querySelector('[data-cco-tablet-calendar-open]')),
        calendarApi: typeof window.ArcanaBookingMobileCalendar?.isCalendarViewport === 'function',
      }));

      if (flags.mobile !== vp.expectMobile) {
        markFail(`${vp.id} mobile shell`, `got ${flags.mobile} expected ${vp.expectMobile}`);
      } else {
        pass(`${vp.id} mobile shell`, String(flags.mobile));
      }

      if (flags.tablet !== vp.expectTablet) {
        markFail(`${vp.id} tablet shell`, `got ${flags.tablet} expected ${vp.expectTablet}`);
      } else {
        pass(`${vp.id} tablet shell`, String(flags.tablet));
      }

      if (!flags.calendarApi) markFail(`${vp.id} calendar API`, 'missing isCalendarViewport');
      else pass(`${vp.id} calendar API`, 'ok');

      if (vp.expectTablet) {
        if (!flags.tabletCalBtn) markFail(`${vp.id} tablet calendar btn`, 'missing');
        else pass(`${vp.id} tablet calendar btn`, 'present');

        await page.locator('[data-cco-tablet-calendar-open]').click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(400);
        const cal = await page.evaluate(() => ({
          open: document.documentElement.hasAttribute('data-cco-calendar-open'),
          grid: Boolean(document.querySelector('[data-calendar-grid]')),
          split: document.documentElement.hasAttribute('data-cco-tablet-calendar-split'),
        }));
        if (!cal.open || !cal.grid) markFail(`${vp.id} calendar open`, JSON.stringify(cal));
        else pass(`${vp.id} calendar open`, `split=${cal.split}`);
        await page.locator('[data-calendar-close]').first().click({ timeout: 5000 }).catch(() => {});
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(hardFail ? '\n❌ Adaptive layout verify FAIL' : '\n✅ Adaptive layout verify PASS');
  process.exit(hardFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
