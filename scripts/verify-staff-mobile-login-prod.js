#!/usr/bin/env node
/**
 * STAFF mobil inloggning @390px — formulär → kundvy (prod).
 * OWNER verifieras via API (MFA) i samma körning.
 */
require('dotenv').config({ quiet: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');

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

async function verifyStaffMobileLogin(page) {
  await page.goto(`${base}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.removeItem('ARCANA_ADMIN_TOKEN');
    sessionStorage.removeItem('ARCANA_ADMIN_TOKEN');
  });
  await page.context().clearCookies();
  await page.goto(`${base}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const loginForm = page.locator('[data-staff-login-form]');
  const needsLogin = (await loginForm.count()) > 0;
  if (!needsLogin) {
    record('STAFF mobil login-form visas', false, 'open access eller redan inloggad');
    return;
  }

  const blurLeaks = await page.evaluate(() => {
    const overlayClasses = [
      'later-backdrop',
      'truth-worklist-surface',
      'studio-surface',
      'note-surface',
      'schedule-surface',
      'customers-modal-backdrop',
      'mailbox-admin-backdrop',
      'note-mode-backdrop',
    ];
    return [...document.querySelectorAll('*')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
        if (!bf || bf === 'none') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 80) return false;
        if (el.classList.contains('cco-mobile-tabbar')) return false;
        if (el.closest('[aria-hidden="true"]')) return true;
        return overlayClasses.some((name) => el.classList.contains(name));
      })
      .slice(0, 5)
      .map((el) => ({
        shell: el.closest('section[id$="-shell"], .customers-modal-shell, .mailbox-admin-shell')?.id || '-',
        className: String(el.className || '').slice(0, 48),
      }));
  });
  record(
    'iOS blur-leak (stängda overlays)',
    blurLeaks.length === 0,
    blurLeaks.length ? JSON.stringify(blurLeaks) : 'ingen'
  );

  const scrollDiag = await page.evaluate(() => {
    const pageEl = document.querySelector('.preview-page');
    if (!pageEl) return { missingPreviewPage: true };
    const cs = getComputedStyle(pageEl);
    const before = pageEl.scrollTop;
    pageEl.scrollTop = before + 120;
    const after = pageEl.scrollTop;
    pageEl.scrollTop = before;
    return {
      overflowY: cs.overflowY,
      height: cs.height,
      maxHeight: cs.maxHeight,
      scrollH: pageEl.scrollHeight,
      clientH: pageEl.clientHeight,
      canScroll: pageEl.scrollHeight > pageEl.clientHeight + 4,
      moved: after > before,
    };
  });
  if (scrollDiag.missingPreviewPage) {
    record('Mobil scroll (.preview-page)', false, 'saknar preview-page — fel entry URL?');
  } else {
    record(
      'Mobil scroll (.preview-page)',
      scrollDiag.overflowY === 'auto' && (scrollDiag.canScroll ? scrollDiag.moved : true),
      scrollDiag.canScroll
        ? `moved=${scrollDiag.moved} ${scrollDiag.scrollH}/${scrollDiag.clientH}px`
        : `overflow=${scrollDiag.overflowY} h=${scrollDiag.height}`
    );
  }

  const loginFormCount = await page.locator('[data-staff-login-form]').count();
  record('STAFF mobil en login-form', loginFormCount === 1, loginFormCount === 1 ? '' : `${loginFormCount} st`);

  if (!staffEmail || !staffPassword) {
    record('STAFF mobil login-form visas', true);
    record('STAFF mobil UI-inloggning', false, 'saknar ARCANA_STAFF_* i .env');
    return;
  }

  record('STAFF mobil login-form visas', true);
  const loginFormFirst = loginForm.first();
  await loginFormFirst.locator('input[name="email"]').fill(staffEmail);
  await loginFormFirst.locator('input[name="password"]').fill(staffPassword);
  const tenantInput = loginFormFirst.locator('input[name="tenantId"]');
  if (await tenantInput.isVisible()) {
    await tenantInput.fill(tenantId);
  } else {
    const preset = await tenantInput.inputValue().catch(() => '');
    if (preset !== tenantId) {
      await tenantInput.evaluate((node, value) => {
        node.value = value;
      }, tenantId);
    }
  }
  const started = Date.now();
  await page.locator('[data-staff-login-form]').first().locator('.cco-mobile-sticky-cta-button, button[type="submit"]').first().click();
  await page.waitForFunction(
    () => {
      const token = localStorage.getItem('ARCANA_ADMIN_TOKEN') || sessionStorage.getItem('ARCANA_ADMIN_TOKEN');
      const loggedIn = Boolean(token && token.length > 8 && !document.querySelector('[data-staff-login-form]'));
      const customersReady = Boolean(
        document.querySelector('[data-customer-list], [data-patient-detail], .customers-layout')
      );
      return loggedIn && customersReady;
    },
    undefined,
    { timeout: 30000 }
  );
  const elapsedMs = Date.now() - started;
  record('STAFF mobil UI-inloggning → kundlista', true, `${elapsedMs}ms`);
  record('STAFF mobil login ≤10s', elapsedMs <= 10000, `${elapsedMs}ms`);
}

function verifyOwnerApiLogin() {
  const script = `node "${path.join(root, 'scripts/get-prod-auth-token.js')}" --owner`;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const token = execSync(script, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      record('OWNER API-inloggning (MFA)', token.length > 20);
      return;
    } catch (err) {
      if (attempt === 2) {
        record('OWNER API-inloggning (MFA)', false, err.stderr?.toString()?.trim()?.slice(0, 80) || err.message?.slice(0, 80) || 'fel');
      }
    }
  }
}

function verifyStaffApiLogin() {
  try {
    const token = execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    record('STAFF API-inloggning', token.length > 20);
  } catch (err) {
    record('STAFF API-inloggning', false, err.message?.slice(0, 80) || 'fel');
  }
}

function verifyPwaManifest() {
  try {
    const manifest = execSync(`curl -fsS "${base}/major-arcana-preview/manifest.json"`, { encoding: 'utf8' });
    const data = JSON.parse(manifest);
    const ok =
      data.display === 'standalone' &&
      String(data.start_url || '').includes('view=customers') &&
      Array.isArray(data.icons) &&
      data.icons.length > 0;
    record('PWA manifest (Add to Home Screen-ready)', ok, data.start_url || '');
  } catch (err) {
    record('PWA manifest (Add to Home Screen-ready)', false, err.message?.slice(0, 60) || 'fel');
  }
}

async function main() {
  console.log(`Base: ${base} (iPhone 13 viewport)`);
  verifyPwaManifest();
  verifyStaffApiLogin();
  verifyOwnerApiLogin();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const page = await context.newPage();
  try {
    await verifyStaffMobileLogin(page);
  } finally {
    await browser.close();
  }

  if (hardFail) process.exit(1);
  console.log('✅ STAFF mobil login verify klar');
}

main().catch((err) => {
  console.error('❌ STAFF mobil login verify:', err.message || err);
  process.exit(1);
});
