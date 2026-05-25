#!/usr/bin/env node
/**
 * BL.3 — Android enhetstest @ prod (Playwright Pixel 5 + valfri Galaxy).
 * Kräver ARCANA_STAFF_* i .env för login-flöde.
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const {
  listAndroidDeviceProfiles,
  mobileBrowserContextOptions,
  resolveAndroidDeviceProfile,
} = require('./lib/mobilePlaywrightDevices');

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const staffEmail = process.env.ARCANA_STAFF_EMAIL || '';
const staffPassword = process.env.ARCANA_STAFF_PASSWORD || '';
const root = path.join(__dirname, '..');

let hardFail = false;

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
}

async function verifyAndroidProfile(page, profile) {
  const tag = `[${profile.label}]`;
  await page.goto(`${base}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.removeItem('ARCANA_ADMIN_TOKEN');
    sessionStorage.removeItem('ARCANA_ADMIN_TOKEN');
  });
  await page.context().clearCookies();
  await page.goto(`${base}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page
    .waitForFunction(
      () => document.documentElement.getAttribute('data-cco-mobile-shell') === 'on',
      undefined,
      { timeout: 20000 }
    )
    .catch(() => {});

  const shellOn = await page.evaluate(
    () => document.documentElement.getAttribute('data-cco-mobile-shell') === 'on'
  );
  record(`${tag} mobil shell`, shellOn);

  const tabbar = (await page.locator('.cco-mobile-tabbar').count()) > 0;
  record(`${tag} bottom tabbar`, tabbar);

  const userAgent = await page.evaluate(() => navigator.userAgent);
  record(`${tag} Android user-agent`, /Android/i.test(userAgent), userAgent.slice(0, 72));

  const loginForm = page.locator('[data-staff-login-form]:visible');
  const needsLogin = (await loginForm.count()) > 0;
  if (needsLogin) {
    if (!staffEmail || !staffPassword) {
      record(`${tag} STAFF login`, false, 'saknar ARCANA_STAFF_* i .env');
      return;
    }
    await loginForm.first().locator('input[name="email"]').fill(staffEmail);
    await loginForm.first().locator('input[name="password"]').fill(staffPassword);
    const tenantInput = loginForm.first().locator('input[name="tenantId"]');
    if (await tenantInput.isVisible()) {
      await tenantInput.fill(tenantId);
    }
    await loginForm.first().locator('button[type="submit"]').first().click();
    await page
      .waitForFunction(
        () =>
          Boolean(
            document.querySelector('[data-customer-list] [data-patient-row]') &&
              !document.querySelector('[data-staff-login-form]:visible')
          ),
        undefined,
        { timeout: 30000 }
      )
      .catch(() => {});
  }

  const rows = await page.locator('[data-patient-row]').count();
  record(`${tag} kundlista efter login`, rows > 0, `${rows} rader`);

  const tabTargets = [
    ['customers', '[data-mobile-tab="customers"]'],
    ['booking', '[data-mobile-tab="booking"]'],
    ['calendar', '[data-mobile-tab="calendar"]'],
  ];
  for (const [name, selector] of tabTargets) {
    const tab = page.locator(selector).first();
    if ((await tab.count()) === 0) {
      record(`${tag} tab ${name}`, false, 'saknas');
      continue;
    }
    const box = await tab.boundingBox();
    record(`${tag} tab ${name} ≥44px`, (box?.height || 0) >= 44, `${Math.round(box?.height || 0)}px`);
  }
}

async function runProfile(profile) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(mobileBrowserContextOptions(profile));
  const page = await context.newPage();
  try {
    await verifyAndroidProfile(page, profile);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`BL.3 Android verify @ ${base}\n`);
  execSync(`node "${path.join(root, 'scripts/lib/wait-for-prod-ready.js')}"`, { stdio: 'inherit' });

  const profiles = listAndroidDeviceProfiles();
  const only = normalizeDeviceFilter(process.env.ARCANA_ANDROID_DEVICE);
  const selected = only
    ? profiles.filter((item) => item.id === only)
    : profiles.filter((item) => item.id === resolveAndroidDeviceProfile().id);

  for (const profile of selected) {
    console.log(`\n--- ${profile.label} (${profile.id}) ---`);
    await runProfile(profile);
  }

  if (String(process.env.ARCANA_ANDROID_INCLUDE_E2E || '').trim() === '1') {
    console.log('\n--- E2E klick-audit (Android, valfritt) ---');
    const device = selected[0]?.id || resolveAndroidDeviceProfile().id;
    execSync(`node "${path.join(root, 'scripts/e2e-mobile-staff-click-audit-prod.js')}"`, {
      stdio: 'inherit',
      env: { ...process.env, ARCANA_MOBILE_DEVICE: device },
    });
  } else {
    console.log('\nℹ️ Hoppar E2E (sätt ARCANA_ANDROID_INCLUDE_E2E=1 för full klick-audit på Pixel).');
  }

  if (hardFail) process.exit(1);
  console.log('\n✅ BL.3 Android staff verify klar');
}

function normalizeDeviceFilter(value = '') {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return key || '';
}

main().catch((err) => {
  console.error('❌ verify-android-staff-prod:', err.message || err);
  process.exit(1);
});
