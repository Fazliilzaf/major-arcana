#!/usr/bin/env node
/**
 * Full CCO desktop klick-audit @ prod.
 * Mäter: klick-tid, hop-tid mellan steg, saknade/blockerade vyer.
 */
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { injectStaffToken, waitForPatientDetailReady } = require('./lib/mobile-patient-deeplink-prod');
const { resolveSmokePatientId } = require('./lib/resolve-smoke-patient-prod');

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const staffEmail = process.env.ARCANA_STAFF_EMAIL || '';
const staffPassword = process.env.ARCANA_STAFF_PASSWORD || '';
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const root = path.join(__dirname, '..');
const SLOW_CLICK_MS = Number(process.env.ARCANA_E2E_SLOW_CLICK_MS || 800);
const SLOW_HOP_MS = Number(process.env.ARCANA_E2E_SLOW_HOP_MS || 400);

const steps = [];
const hops = [];
let blockers = [];
let lastStepEnd = null;

function record(step, ok, detail = '', timingMs = null) {
  steps.push({ step, ok, detail, timingMs });
  const time = timingMs != null ? ` — ${timingMs}ms` : '';
  console.log(`${ok ? 'OK' : 'FAIL'}: ${step}${detail ? ` — ${detail}` : ''}${time}`);
  if (!ok) blockers.push({ step, detail });
}

function warn(step, detail = '') {
  console.log(`WARN: ${step}${detail ? ` — ${detail}` : ''}`);
}

function recordSkip(step, detail = '', timingMs = null) {
  record(step, true, `SKIP: ${detail}`, timingMs);
  warn(step, detail);
}

function recordHop(label, ms) {
  hops.push({ label, ms });
  const flag = ms > SLOW_HOP_MS ? ' ⚠ långt hop' : '';
  console.log(`HOP: ${label} — ${ms}ms${flag}`);
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function ensureLoggedIn(page) {
  const needsLogin = (await page.locator('[data-staff-login-form]').count()) > 0;
  if (!needsLogin) return;
  await page.locator('[data-staff-login-form] input[name="email"]').fill(staffEmail);
  await page.locator('[data-staff-login-form] input[name="password"]').fill(staffPassword);
  const tenantInput = page.locator('[data-staff-login-form] input[name="tenantId"]');
  if (await tenantInput.count()) {
    await tenantInput.evaluate((node, value) => {
      node.value = value;
    }, tenantId);
  }
  await page
    .locator('[data-staff-login-form] .patient-master-login-button, [data-staff-login-form] button[type="submit"]')
    .first()
    .click();
  await page.waitForFunction(
    () => {
      const token = localStorage.getItem('ARCANA_ADMIN_TOKEN');
      return Boolean(token && token.length > 8 && !document.querySelector('[data-staff-login-form]'));
    },
    undefined,
    { timeout: 30000 }
  );
}

function shellViewForNav(view) {
  const map = {
    conversations: 'conversations',
    customers: 'customers',
    calendar: 'calendar',
    automation: 'automation',
    analytics: 'analytics',
    later: 'later',
    sent: 'sent',
    integrations: 'integrations',
    macros: 'macros',
    settings: 'settings',
    showcase: 'showcase',
  };
  return map[view] || view;
}

async function readNavState(page, view) {
  const shellView = shellViewForNav(view);
  return page.evaluate((expectedShell) => {
    const canvas = document.querySelector('.preview-canvas');
    return {
      appShellView: canvas?.dataset.appShellView || '',
      appView: canvas?.dataset.appView || '',
      shellHidden: document.querySelector(`[data-shell-view="${expectedShell}"]`)?.hidden,
      urlView: new URLSearchParams(location.search).get('view') || '',
    };
  }, shellView);
}

async function clickNav(page, view, { viaMore = false, readyFn, readyArg, timeout = 12000 } = {}) {
  if (lastStepEnd != null) {
    recordHop(`→ ${view}`, Date.now() - lastStepEnd);
  }
  const t0 = Date.now();
  if (viaMore) {
    await page.locator('[data-more-toggle]').first().click();
    await page.waitForTimeout(120);
    await page.locator(`.preview-more-item[data-nav-view="${view}"]`).first().click();
  } else {
    await page.locator(`.preview-nav-item[data-nav-view="${view}"]`).first().click();
  }
  if (typeof readyFn === 'function') {
    await page.waitForFunction(readyFn, readyArg, { timeout, polling: 16 });
  } else {
    await page.waitForTimeout(250);
  }
  const timingMs = Date.now() - t0;
  return timingMs;
}

async function main() {
  if (!staffEmail || !staffPassword) {
    console.error('Saknar ARCANA_STAFF_EMAIL / ARCANA_STAFF_PASSWORD');
    process.exit(1);
  }

  execSync(`node "${path.join(root, 'scripts/lib/wait-for-prod-ready.js')}"`, { stdio: 'inherit' });
  const staffToken = getStaffToken();

  console.log(`E2E full desktop klick-audit @ ${base}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    let t0 = Date.now();
    await page.goto(`${base}/staff`, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForSelector('.preview-canvas', { timeout: 20000 });
    record('Kallstart /staff', true, page.url(), Date.now() - t0);
    lastStepEnd = Date.now();

    t0 = Date.now();
    await ensureLoggedIn(page);
    record('Inloggning', true, 'session klar', Date.now() - t0);
    lastStepEnd = Date.now();
    await injectStaffToken(page, staffToken);

    await injectStaffToken(page, staffToken);
    const resolvedPatientId = await resolveSmokePatientId({
      base,
      token: staffToken,
      preferredId: process.env.ARCANA_SMOKE_PATIENT_ID || '',
    });

    const primaryViews = [
      {
        view: 'conversations',
        ready: () => document.querySelector('.preview-canvas')?.dataset.appShellView === 'conversations',
        detail: 'konversationsvy',
      },
      {
        view: 'customers',
        ready: () => document.querySelector('.preview-canvas')?.dataset.appShellView === 'customers',
        assert: async () => {
          await page.waitForSelector('[data-customer-list]', { timeout: 15000 });
          await page.waitForFunction(
            () => (document.querySelectorAll('[data-patient-row]').length || 0) > 0,
            undefined,
            { timeout: 15000, polling: 16 }
          );
          return true;
        },
        detail: 'kundlista',
      },
      {
        view: 'calendar',
        ready: () =>
          document.querySelector('.preview-canvas')?.dataset.appShellView === 'calendar' &&
          document.getElementById('cco-desktop-calendar') &&
          !document.getElementById('cco-desktop-calendar').hidden,
        assert: async () => {
          await page.waitForFunction(() => window.ArcanaBookingDesktopWeek, undefined, { timeout: 15000 });
          await page.waitForFunction(
            () => {
              const cal = document.getElementById('cco-desktop-calendar');
              if (!cal || cal.hidden) return false;
              return Boolean(
                cal.querySelector('.cco-cal-week-grid, .cco-cal-day-timeline, .cco-cal-resource-timeline')
              );
            },
            undefined,
            { timeout: 25000, polling: 16 }
          );
          return true;
        },
        detail: 'desktop kalender',
        timeout: 30000,
      },
      {
        view: 'automation',
        ready: () => document.querySelector('.preview-canvas')?.dataset.appShellView === 'automation',
        detail: 'automatisering',
      },
      {
        view: 'analytics',
        ready: () => document.querySelector('.preview-canvas')?.dataset.appShellView === 'analytics',
        detail: 'analys',
      },
    ];

    for (const item of primaryViews) {
      const timingMs = await clickNav(page, item.view, {
        readyFn: item.ready,
        timeout: item.timeout || 12000,
      });
      let ok = true;
      let detail = item.detail;
      if (item.assert) {
        try {
          ok = await item.assert();
          if (!ok) detail = `${item.detail} — assert misslyckades`;
        } catch (err) {
          ok = false;
          detail = err.message?.slice(0, 100) || item.detail;
        }
      }
      const navState = await readNavState(page, item.view);
      if (navState.shellHidden === true) {
        detail = `${detail} · shell DOM hidden (staff-layout)`;
      }
      record(`Nav ${item.view}`, ok, detail, timingMs);
      lastStepEnd = Date.now();
    }

    const moreViews = ['later', 'sent', 'integrations', 'macros', 'settings', 'showcase'];
    for (const view of moreViews) {
      const timingMs = await clickNav(page, view, {
        viaMore: true,
        readyFn: (expected) => document.querySelector('.preview-canvas')?.dataset.appShellView === expected,
        readyArg: view,
      });
      const navState = await readNavState(page, view);
      const detail =
        navState.shellHidden === true
          ? 'appShellView OK · shell DOM hidden (staff-layout)'
          : 'shell synlig';
      record(`Nav ${view} (Mer)`, true, detail, timingMs);
      lastStepEnd = Date.now();
    }

    // Kalender sub-vyer
    await clickNav(page, 'calendar', {
      readyFn: () => {
        const cal = document.getElementById('cco-desktop-calendar');
        return cal && !cal.hidden;
      },
    });
    for (const mode of ['day', 'resource', 'week']) {
      if (lastStepEnd != null) recordHop(`kalender → ${mode}`, Date.now() - lastStepEnd);
      t0 = Date.now();
      await page.locator(`#cco-desktop-calendar [data-cal-view="${mode}"]`).first().click();
      await page.waitForFunction(
        (m) => document.getElementById('cco-desktop-calendar')?.dataset.calViewMode === m,
        mode,
        { timeout: 8000, polling: 16 }
      );
      lastStepEnd = Date.now();
      record(`Kalender ${mode}`, true, 'vy aktiv', Date.now() - t0);
    }

    // Klicka första bokade event om det finns
    if (lastStepEnd != null) recordHop('kalender → event', Date.now() - lastStepEnd);
    t0 = Date.now();
    const booked = page.locator('#cco-desktop-calendar .cco-cal-event.is-booked').first();
    const hasBooked = (await booked.count()) > 0;
    if (hasBooked) {
      await booked.click();
      await page.waitForFunction(
        () => document.querySelector('[data-cal-detail]:not([hidden])'),
        undefined,
        { timeout: 5000, polling: 16 }
      );
      const detailOpen = await page.evaluate(
        () => !document.querySelector('[data-cal-detail]')?.hidden
      );
      record('Kalender event → detalj', detailOpen, 'detaljpanel', Date.now() - t0);
      lastStepEnd = Date.now();

      const signalRows = await page.evaluate(() => {
        const items = [...document.querySelectorAll('[data-cal-detail-meta] li strong')].map((n) =>
          n.textContent?.trim()
        );
        return items.filter(Boolean);
      });
      record(
        'Kalender signalrader',
        true,
        signalRows.length ? signalRows.slice(0, 4).join(' · ') : 'inga signaler på vald bokning'
      );
    } else {
      recordSkip(
        'Kalender event → detalj',
        'ingen bokad tid i aktuell vecka — signal-ikoner kräver testbokning',
        Date.now() - t0
      );
      lastStepEnd = Date.now();
    }

    // Kund → journal via deep link (staff-layout döljer ofta listrader efter nav-tur)
    if (lastStepEnd != null) recordHop('→ kund journal', Date.now() - lastStepEnd);
    t0 = Date.now();
    await injectStaffToken(page, staffToken);
    await page.goto(`${base}/staff?view=customers&patientId=${encodeURIComponent(resolvedPatientId)}`, {
      waitUntil: 'commit',
      timeout: 60000,
    });
    await injectStaffToken(page, staffToken);
    const detailReady = await waitForPatientDetailReady(page, {
      timeout: 20000,
      patientId: resolvedPatientId,
    });
    record(
      'Deep link → kunddetalj',
      detailReady,
      resolvedPatientId.slice(0, 8),
      Date.now() - t0
    );
    lastStepEnd = Date.now();

    if (detailReady) {
      if (lastStepEnd != null) recordHop('profil → journal', Date.now() - lastStepEnd);
      t0 = Date.now();
      await page.evaluate(() => window.ArcanaPatientMasterUi?.setPatientTab?.('journal'));
      await page.waitForTimeout(400);
      const journalOk = await page.evaluate(
        () => !document.querySelector('[data-patient-tab-panel="journal"]')?.hasAttribute('hidden')
      );
      record('Journal-flik', journalOk, journalOk ? 'panel synlig' : 'panel dold', Date.now() - t0);
      lastStepEnd = Date.now();
    }

    const slowClicks = steps.filter((s) => s.timingMs != null && s.timingMs > SLOW_CLICK_MS);
    const slowHops = hops.filter((h) => h.ms > SLOW_HOP_MS);
    const passed = steps.filter((s) => s.ok).length;

    const report = {
      base,
      at: new Date().toISOString(),
      passed,
      total: steps.length,
      slowClickBudgetMs: SLOW_CLICK_MS,
      slowHopBudgetMs: SLOW_HOP_MS,
      steps,
      hops,
      blockers,
      slowClicks,
      slowHops,
    };

    const outPath = path.join(root, 'artifacts', 'e2e-full-click-audit.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log('\n--- Sammanfattning ---');
    console.log(`Steg: ${passed}/${steps.length} OK`);
    if (slowClicks.length) {
      console.log(`Långsamma klick (>${SLOW_CLICK_MS}ms):`);
      slowClicks.forEach((s) => console.log(`  • ${s.step}: ${s.timingMs}ms`));
    }
    if (slowHops.length) {
      console.log(`Långa hopp (>${SLOW_HOP_MS}ms):`);
      slowHops.forEach((h) => console.log(`  • ${h.label}: ${h.ms}ms`));
    }
    if (blockers.length) {
      console.log('\nBlockers:');
      blockers.forEach((b) => console.log(`  • ${b.step}: ${b.detail}`));
    } else {
      console.log('\nInga hårda blockers i nav-flödet.');
    }
    console.log(`\nRapport: ${outPath}`);

    if (blockers.length) process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('E2E full audit kraschade:', err.message || err);
  process.exit(1);
});
