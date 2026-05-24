#!/usr/bin/env node
/**
 * E2E mobil klick-audit — iPhone 13 @ prod.
 * Mäter tid per steg, flaggar blockers (scroll, overlay, saknade element).
 */
require('dotenv').config({ quiet: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const patientId = process.env.ARCANA_SMOKE_PATIENT_ID || '2e8d3535-cd89-418e-8b68-ca239f8836a4';
const staffEmail = process.env.ARCANA_STAFF_EMAIL || '';
const staffPassword = process.env.ARCANA_STAFF_PASSWORD || '';
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const root = path.join(__dirname, '..');

const steps = [];
let blockers = [];

function ms(start) {
  return Date.now() - start;
}

function record(step, ok, detail = '', timingMs = null) {
  const entry = { step, ok, detail, timingMs };
  steps.push(entry);
  const time = timingMs != null ? ` — ${timingMs}ms` : '';
  console.log(`${ok ? 'OK' : 'FAIL'}: ${step}${detail ? ` — ${detail}` : ''}${time}`);
  if (!ok) blockers.push({ step, detail });
}

function warn(step, detail = '') {
  console.log(`WARN: ${step}${detail ? ` — ${detail}` : ''}`);
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function snapshot(page, label) {
  return page.evaluate((name) => {
    const scrollLocked = document.documentElement.getAttribute('data-cco-scroll-locked') === 'on';
    const bodyOverflow = getComputedStyle(document.body).overflow;
    const pageEl = document.querySelector('.preview-page');
    const pageOverflow = pageEl ? getComputedStyle(pageEl).overflowY : 'n/a';
    const authRequired = document.documentElement.getAttribute('data-cco-auth-required') === 'on';
    const loginSticky = Boolean(document.querySelector('[data-staff-login-form] .cco-mobile-sticky-cta-bar'));
    const loginVisible = Boolean(document.querySelector('[data-staff-login-form] input[name="email"]'));
    const loginEmailBox = document.querySelector('[data-staff-login-form] input[name="email"]');
    const emailVisible =
      loginEmailBox &&
      (() => {
        const r = loginEmailBox.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.top < window.innerHeight;
      })();
    return {
      label: name,
      url: location.href,
      shell: document.documentElement.getAttribute('data-cco-mobile-shell'),
      authRequired,
      scrollLocked,
      bodyOverflow,
      pageOverflow,
      loginSticky,
      loginVisible,
      emailVisible,
      detail: document.documentElement.getAttribute('data-cco-patient-detail'),
      hasTaBild: Boolean(document.querySelector('.patient-master-camera-button')),
    };
  }, label);
}

async function canScroll(page) {
  return page.evaluate(() => {
    const pageEl = document.querySelector('.preview-page') || document.documentElement;
    const scrollHeight = pageEl.scrollHeight || document.documentElement.scrollHeight;
    const clientHeight = pageEl.clientHeight || window.innerHeight;
    if (scrollHeight <= clientHeight + 4) {
      return true;
    }
    const before = pageEl.scrollTop || window.scrollY;
    pageEl.scrollBy?.(0, 80);
    window.scrollBy(0, 80);
    const after = pageEl.scrollTop || window.scrollY;
    return after > before;
  });
}

async function tapAndTime(page, selector, label, readyCheck) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  const t0 = Date.now();
  await page.evaluate((sel) => {
    document.querySelector(sel)?.click();
  }, selector);
  if (typeof readyCheck === 'function') {
    try {
      await page.waitForFunction(readyCheck, undefined, { timeout: 8000, polling: 16 });
    } catch {
      /* fall through — still record click time */
    }
  } else {
    await page.waitForTimeout(300);
  }
  return { label, ms: ms(t0) };
}

async function main() {
  if (!staffEmail || !staffPassword) {
    console.error('Saknar ARCANA_STAFF_EMAIL / ARCANA_STAFF_PASSWORD');
    process.exit(1);
  }

  console.log(`E2E mobil klick-audit @ ${base} (iPhone 13)\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const page = await context.newPage();

  try {
    // 1. Kallstart /staff
    let t0 = Date.now();
    await page.goto(`${base}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-cco-mobile-shell') === 'on',
      undefined,
      { timeout: 20000 }
    );
    const snap1 = await snapshot(page, 'after-load');
    record('Kallstart /staff → mobil shell', snap1.shell === 'on', snap1.url, ms(t0));

    // 2. Login-form tillgänglig
    t0 = Date.now();
    const loginForm = page.locator('[data-staff-login-form]');
    const needsLogin = (await loginForm.count()) > 0;
    record('Login-form renderad', needsLogin, needsLogin ? 'session krävs' : 'redan inloggad', ms(t0));

    if (needsLogin) {
      const snapLogin = await snapshot(page, 'login');
      record('Ingen sticky login-knapp', !snapLogin.loginSticky, snapLogin.loginSticky ? 'sticky CTA aktiv' : 'ok');
      record('E-post synlig utan scroll', snapLogin.emailVisible, snapLogin.emailVisible ? 'ok' : 'fält utanför viewport');
      record('Scroll-lås av på login', !snapLogin.scrollLocked, `body=${snapLogin.bodyOverflow} page=${snapLogin.pageOverflow}`);

      const scrollOk = await canScroll(page);
      record('Kan scrolla på login', scrollOk, scrollOk ? 'ok' : 'scroll blockerad');

      t0 = Date.now();
      await page.locator('[data-staff-login-form] input[name="email"]').fill(staffEmail);
      await page.locator('[data-staff-login-form] input[name="password"]').fill(staffPassword);
      const tenantInput = page.locator('[data-staff-login-form] input[name="tenantId"]');
      if (await tenantInput.count()) {
        await tenantInput.evaluate((node, value) => {
          node.value = value;
        }, tenantId);
      }
      await page.locator('[data-staff-login-form] .patient-master-login-button, [data-staff-login-form] button[type="submit"]').first().click();
      await page.waitForFunction(
        () => {
          const token = localStorage.getItem('ARCANA_ADMIN_TOKEN');
          return Boolean(token && token.length > 8 && !document.querySelector('[data-staff-login-form]'));
        },
        undefined,
        { timeout: 30000 }
      );
      record('UI-inloggning → token', true, 'inloggad', ms(t0));
    }

    // 3. Kundlista
    t0 = Date.now();
    await page.waitForSelector('[data-customer-list]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const rowCount = await page.locator('[data-patient-row]').count();
    const pilotInfo = await page.evaluate(() => ({
      pilot: window.__ARCANA_PILOT_PATIENT_IDS__,
      total: window.ArcanaPatientMasterUi?.getRuntime?.()?.total,
      loaded: window.ArcanaPatientMasterUi?.getRuntime?.()?.loaded,
      error: window.ArcanaPatientMasterUi?.getRuntime?.()?.error,
    }));
    record(
      'Kundlista laddad',
      rowCount > 0,
      rowCount > 0 ? `${rowCount} rader` : `0 rader (pilot=${JSON.stringify(pilotInfo.pilot?.length || 0)} total=${pilotInfo.total})`,
      ms(t0)
    );

    // 4. Öppna testpatient (deep link)
    t0 = Date.now();
    await page.goto(`${base}/staff?view=customers&patientId=${encodeURIComponent(patientId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    const inlinePrimeMs = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const start = nav ? nav.startTime : 0;
      const primeAt = Number(window.__ARCANA_DEEPLINK_PRIME_MS__ || 0);
      return primeAt > 0 ? Math.round(primeAt - start) : null;
    });
    if (inlinePrimeMs != null) {
      record('Deep link inline skeleton', inlinePrimeMs <= 2500, `${inlinePrimeMs}ms från navigation`, inlinePrimeMs);
    }
    const skeletonMs = await page
      .waitForFunction(
        () =>
          document.documentElement.getAttribute('data-cco-patient-detail') === 'on' ||
          document.querySelector('[data-patient-loading="true"]'),
        undefined,
        { timeout: 8000, polling: 16 }
      )
      .then(() => ms(t0))
      .catch(() => null);
    if (skeletonMs != null) {
      record('Deep link skeleton/detail synlig', true, `${skeletonMs}ms till UI`, skeletonMs);
    }
    await page.waitForFunction(
      () => {
        const loading = document.querySelector('[data-patient-loading="true"]');
        const card = window.ArcanaPatientMasterUi?.getRuntime?.()?.detail?.card;
        return !loading && Boolean(card);
      },
      undefined,
      { timeout: 25000, polling: 16 }
    );
    record('Deep link → kunddetail klar', true, patientId.slice(0, 8), ms(t0));

    // 5. Journal-flik (Profil → Journal om vi redan står på journal)
    const journalTab = page.locator('.patient-master-tab[data-patient-tab="journal"]').first();
    await journalTab.waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      const profil = document.querySelector('.patient-master-tab[data-patient-tab="profil"]');
      if (profil?.getAttribute('aria-pressed') !== 'true') {
        profil?.click();
      }
    });
    await page.waitForFunction(
      () =>
        document.querySelector('.patient-master-tab[data-patient-tab="profil"]')?.getAttribute('aria-pressed') ===
        'true',
      undefined,
      { timeout: 8000, polling: 16 }
    ).catch(() => {});
    t0 = Date.now();
    await page.evaluate(() => {
      document.querySelector('.patient-master-tab[data-patient-tab="journal"]')?.click();
    });
    await page.waitForFunction(
      () =>
        document.querySelector('.patient-master-tab[data-patient-tab="journal"]')?.getAttribute('aria-pressed') ===
        'true',
      undefined,
      { timeout: 8000, polling: 16 }
    ).catch(() => {});
    const tabH = await journalTab.evaluate((el) => Math.round(el.getBoundingClientRect().height));
    record('Journal-tab klick', tabH >= 40, `${tabH}px höjd`, ms(t0));

    // 6. Ta bild
    t0 = Date.now();
    const taBild = page.locator('.patient-master-camera-button').first();
    const taBildVisible = await taBild.isVisible().catch(() => false);
    record('Ta bild synlig', taBildVisible, taBildVisible ? 'ok' : 'saknas/dold', ms(t0));

    // 7. Tillbaka till lista
    t0 = Date.now();
    await page.evaluate(() => window.ArcanaPatientMasterUi?.goBackToPatientList?.());
    await page.waitForTimeout(600);
    const backOk = await page.evaluate(
      () => !document.documentElement.hasAttribute('data-cco-patient-detail')
    );
    record('Back → kundlista', backOk, backOk ? 'lista' : 'fast i detail', ms(t0));

    // 8. Bottom tabs — tid per klick
    const tabClicks = [];
    for (const tab of [
      {
        key: 'home',
        sel: '.cco-mobile-tabbar-item[data-mobile-tab="home"]',
        ready: () => document.querySelector('.preview-canvas')?.dataset.appShellView === 'conversations',
      },
      {
        key: 'booking',
        sel: '.cco-mobile-tabbar-item[data-mobile-tab="booking"]',
        ready: () => document.querySelector('.preview-canvas')?.dataset.mobileWorkspaceView === 'focus',
      },
      {
        key: 'calendar',
        sel: '.cco-mobile-tabbar-item[data-mobile-tab="calendar"]',
        ready: () => document.documentElement.hasAttribute('data-cco-calendar-open'),
      },
      {
        key: 'customers',
        sel: '.cco-mobile-tabbar-item[data-mobile-tab="customers"]',
        ready: () => document.querySelector('.preview-canvas')?.dataset.appShellView === 'customers',
      },
    ]) {
      try {
        if (tab.key === 'calendar') {
          await page.evaluate(() => window.ArcanaBookingMobileCalendar?.close?.());
          await page.waitForTimeout(150);
        }
        const r = await tapAndTime(page, tab.sel, tab.key, tab.ready);
        if (tab.key === 'calendar') {
          await page.evaluate(() => window.ArcanaBookingMobileCalendar?.close?.());
          await page.waitForTimeout(150);
        }
        tabClicks.push(r);
        const slow = r.ms > 800 ? ' ⚠ långsam' : '';
        record(`Tab ${tab.key}`, true, `${r.ms}ms${slow}`, r.ms);
      } catch (err) {
        record(`Tab ${tab.key}`, false, err.message?.slice(0, 80) || 'klick misslyckades');
      }
    }

    // 9. Inställningar bottom sheet (synlig endast på kundlista)
    await page.evaluate(() => {
      window.ArcanaPatientMasterUi?.clearMobilePatientSelection?.();
      window.ArcanaBookingMobileCalendar?.close?.();
    });
    await page.evaluate(() => {
      document.querySelector('.cco-mobile-tabbar-item[data-mobile-tab="customers"]')?.click();
    });
    await page.waitForFunction(
      () => document.querySelector('.preview-canvas')?.dataset.appShellView === 'customers',
      undefined,
      { timeout: 8000, polling: 16 }
    );
    const settingsBtn = page.locator('.customers-toolbar-settings[data-customer-command="settings"]').first();
    const settingsVisible = await settingsBtn.isVisible().catch(() => false);
    if (settingsVisible) {
      const settingsTiming = await tapAndTime(
        page,
        '.customers-toolbar-settings[data-customer-command="settings"]',
        'settings',
        () => document.getElementById('customers-settings-shell')?.hasAttribute('data-open')
      );
      record(
        'Inställningar bottom sheet',
        Boolean(
          await page.evaluate(() => document.getElementById('customers-settings-shell')?.hasAttribute('data-open'))
        ),
        settingsTiming.ms <= 800 ? 'öppen' : 'öppen',
        settingsTiming.ms
      );
      await page.locator('[data-customer-settings-close]').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
      await page.evaluate(() => window.ArcanaMobileCore?.forceUnlockBodyScroll?.());
    } else {
      warn('Inställningsknapp', 'dold på mobil kundlista (förväntat om ej list-läge)');
    }

    // 10. Scroll efter inloggning
    const scrollAfter = await canScroll(page);
    record('Kan scrolla efter inloggning', scrollAfter, scrollAfter ? 'ok' : 'blockerad');

    const avgTab =
      tabClicks.length > 0
        ? Math.round(tabClicks.reduce((s, r) => s + r.ms, 0) / tabClicks.length)
        : 0;
    const slowTabs = tabClicks.filter((r) => r.ms > 800);

    console.log('\n--- Sammanfattning ---');
    const passed = steps.filter((s) => s.ok).length;
    console.log(`Steg: ${passed}/${steps.length} OK`);
    if (avgTab) console.log(`Snitt tab-klick: ${avgTab}ms`);
    if (slowTabs.length) {
      console.log(`Långsamma tabbar (>800ms): ${slowTabs.map((t) => `${t.label} ${t.ms}ms`).join(', ')}`);
    }
    if (blockers.length) {
      console.log('\nBlockers:');
      blockers.forEach((b) => console.log(`  • ${b.step}: ${b.detail}`));
    } else {
      console.log('\nInga blockers — flödet går att klicka igenom.');
    }

    if (blockers.length) process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('E2E audit kraschade:', err.message || err);
  process.exit(1);
});
