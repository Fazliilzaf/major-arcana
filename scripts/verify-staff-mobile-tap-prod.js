#!/usr/bin/env node
/**
 * Mobil STAFF — mät tap-respons end-to-end på prod (WebKit + Chromium).
 */
require('dotenv').config({ quiet: true });
const { webkit, chromium, devices } = require('playwright');

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const staffEmail = process.env.ARCANA_STAFF_EMAIL || '';
const staffPassword = process.env.ARCANA_STAFF_PASSWORD || '';

let hardFail = false;

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
}

async function loginIfNeeded(page) {
  const form = page.locator('[data-staff-login-form]:visible');
  if ((await form.count()) === 0) {
    if ((await page.locator('[data-patient-row]').count()) > 0) return;
    const hidden = page.locator('[data-staff-login-form]');
    if ((await hidden.count()) === 0) {
      throw new Error('varken login-form eller kundrader hittades');
    }
  }
  const loginForm = (await form.count()) > 0 ? form : page.locator('[data-staff-login-form]');
  if (!staffEmail || !staffPassword) {
    throw new Error('saknar ARCANA_STAFF_* i .env');
  }
  await loginForm.first().locator('input[name="email"]').fill(staffEmail);
  await loginForm.first().locator('input[name="password"]').fill(staffPassword);
  const tenantInput = loginForm.first().locator('input[name="tenantId"]');
  if (await tenantInput.isVisible()) {
    await tenantInput.fill(tenantId);
  }
  await loginForm.first().locator('button[type="submit"]').first().click();
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('[data-customer-list] [data-patient-row]') &&
          !document.querySelector('[data-staff-login-form]')
      ),
    undefined,
    { timeout: 30000 }
  );
}

async function measureTap(page, label, locator, expectFn, budgetMs) {
  const started = Date.now();
  await locator.first().click({ timeout: 10000 });
  await page.waitForFunction(expectFn, undefined, { timeout: budgetMs + 5000 });
  const elapsed = Date.now() - started;
  record(`[${label}] ${budgetMs}ms budget`, elapsed <= budgetMs, `${elapsed}ms`);
  return elapsed;
}

async function verifyEngine(engine, engineLabel) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const page = await context.newPage();

  try {
    await page.goto(`${base}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => {
      localStorage.removeItem('ARCANA_ADMIN_TOKEN');
      sessionStorage.removeItem('ARCANA_ADMIN_TOKEN');
    });
    await page.goto(`${base}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () =>
        Boolean(
          document.querySelector('[data-staff-login-form]') ||
            document.querySelector('[data-patient-row]')
        ),
      undefined,
      { timeout: 20000 }
    );
    await loginIfNeeded(page);

    const rowKind = await page.evaluate(() => ({
      patientRows: document.querySelectorAll('[data-patient-row]').length,
      legacyRows: document.querySelectorAll('[data-customer-row]').length,
    }));
    record(
      `[${engineLabel}] patient register äger listan`,
      rowKind.patientRows > 0 && rowKind.legacyRows === 0,
      `patient=${rowKind.patientRows} legacy=${rowKind.legacyRows}`
    );

    await measureTap(
      page,
      engineLabel,
      page.locator('[data-patient-row]').first(),
      () => Boolean(document.querySelector('[data-patient-detail]:not([data-patient-loading="true"])')),
      2500
    );

    await measureTap(
      page,
      `${engineLabel} tab Hem`,
      page.locator('[data-mobile-tab="home"]'),
      () => document.querySelector('.preview-canvas')?.dataset?.appShellView === 'conversations',
      1200
    );

    await measureTap(
      page,
      `${engineLabel} tab Kund`,
      page.locator('[data-mobile-tab="customers"]'),
      () =>
        document.querySelector('.preview-canvas')?.dataset?.appShellView === 'customers' &&
        document.querySelectorAll('[data-patient-row]').length > 0,
      1200
    );

    const tabSwitch = await measureTap(
      page,
      `${engineLabel} öppna kund #2`,
      page.locator('[data-patient-row]').nth(1),
      () => Boolean(document.querySelector('[data-patient-detail]:not([data-patient-loading="true"])')),
      2500
    );

    record(`[${engineLabel}] snitt tap ≤2.5s`, tabSwitch <= 2500, `${tabSwitch}ms`);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`Base: ${base} — mobil tap E2E`);
  if (!staffEmail || !staffPassword) {
    record('STAFF credentials', false, 'saknar ARCANA_STAFF_*');
    process.exit(1);
  }
  await verifyEngine(webkit, 'WebKit');
  await verifyEngine(chromium, 'Chromium');
  if (hardFail) process.exit(1);
  console.log('✅ Mobil tap verify klar');
}

main().catch((err) => {
  console.error('❌ Mobil tap verify:', err.message || err);
  process.exit(1);
});
