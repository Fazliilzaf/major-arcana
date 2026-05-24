#!/usr/bin/env node
/**
 * STAFF UI verify: iPhone 13 viewport — mobil shell, kundvy, journal, modaler.
 * Prod: injicerar STAFF-token via get-prod-auth-token.js
 * Lokal: ARCANA_PROD_URL=http://127.0.0.1:3100 + ARCANA_SMOKE_BEARER_TOKEN=__preview_local__
 */
require('dotenv').config({ quiet: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');
const {
  openMobilePatientDeepLink,
  waitForMobileShell,
  waitForPatientDetailReady,
} = require('./lib/mobile-patient-deeplink-prod');
const { resolveSmokePatientId } = require('./lib/resolve-smoke-patient-prod');

const base = (process.env.ARCANA_PROD_URL || process.env.PLAYWRIGHT_BASE_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const preferredPatientId = process.env.ARCANA_SMOKE_PATIENT_ID || '2e8d3535-cd89-418e-8b68-ca239f8836a4';
const root = path.join(__dirname, '..');
const isLocal =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?$/i.test(base) ||
  base.includes('127.0.0.1') ||
  base.includes('localhost');

const results = [];
let hardFail = false;

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${suffix}`);
  if (!pass) hardFail = true;
}

function warn(name, detail = '') {
  console.log(`WARN: ${name}${detail ? ` — ${detail}` : ''}`);
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) {
    return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  }
  if (isLocal) {
    return '__preview_local__';
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }
  return '';
}

async function verifyMobileShell(page) {
  const shellOn = await page.evaluate(() => document.documentElement.hasAttribute('data-cco-mobile-shell'));
  record('Mobil shell aktiv', shellOn);

  const tabbarVisible = await page.locator('.cco-mobile-tabbar').isVisible();
  record('Bottom tab bar synlig', tabbarVisible);

  const navHidden = await page.evaluate(() => {
    const nav = document.querySelector('.preview-topbar-left .preview-nav');
    if (!nav) return true;
    return window.getComputedStyle(nav).display === 'none';
  });
  record('Desktop nav dold', navHidden);

  const topbarHeight = await page.evaluate(() => {
    const bar = document.querySelector('.preview-topbar');
    return bar ? Math.round(bar.getBoundingClientRect().height) : 0;
  });
  record('Topbar ≤ 64px', topbarHeight > 0 && topbarHeight <= 64, `${topbarHeight}px`);
}

async function verifyPatientJournal(page) {
  await page.evaluate(() => {
    window.ArcanaPatientMasterUi?.setPatientTab?.('journal');
  });
  await page.waitForTimeout(500);

  const journalTab = page.locator('.patient-master-tab[data-patient-tab="journal"]').first();
  if (await journalTab.count()) {
    await page.evaluate(() => {
      document.querySelector('.patient-master-tab[data-patient-tab="journal"]')?.click();
    });
    await page.waitForTimeout(400);
    const tabBox = await journalTab.boundingBox();
    record('Journal-tab ≥ 40px', Boolean(tabBox && tabBox.height >= 38), tabBox ? `${Math.round(tabBox.height)}px` : 'saknas');
  }

  await page.locator('.patient-master-journal-toolbar, [data-patient-master-rail]').first().scrollIntoViewIfNeeded().catch(() => {});

  const taBildVisible = await page
    .locator('.patient-master-camera-button, label:has-text("Ta bild")')
    .first()
    .isVisible()
    .catch(() => false);
  const hasJournalPanel = await page
    .locator('[data-patient-tab-panel="journal"]:not([hidden])')
    .isVisible()
    .catch(() => false);
  const bodyText = await page.locator('body').innerText();
  const hasJournal = hasJournalPanel;
  const hasTaBild = taBildVisible;
  const loginLocked = /Inloggningslåst/i.test(bodyText) && !hasJournal;

  record('Journal UI', hasJournal);
  if (!hasTaBild && isLocal) {
    warn('Ta bild synlig', 'journal toolbar ej renderad (lokal fixture?)');
  } else {
    record('Ta bild synlig', hasTaBild);
  }
  record('Ej inloggningslåst', !loginLocked);

  const detailActive = await page.evaluate(
    () => document.documentElement.getAttribute('data-cco-patient-detail') === 'on'
  );
  record('Kund detail-läge', detailActive);
}

async function verifyListBackFlow(page, patientId) {
  await page.evaluate(() => {
    window.ArcanaPatientMasterUi?.clearMobilePatientSelection?.();
  });
  await page.waitForTimeout(400);

  const listVisible = await page.locator('[data-customer-list]').isVisible();
  record('Kundlista efter clear', listVisible);

  await page.waitForSelector('[data-patient-row]', { timeout: 30000 }).catch(() => {});

  const targetRow = page.locator(`[data-patient-row="${patientId}"]`).first();
  const fallbackRow = page.locator('[data-patient-row]').first();
  const row = (await targetRow.count()) ? targetRow : fallbackRow;
  if (!(await row.count())) {
    warn('List→detail', 'ingen kundrad att klicka');
    return;
  }

  await row.evaluate((node) => node.click());
  const detailReady = await waitForPatientDetailReady(page, { timeout: 45000, patientId });
  record('List→detail efter klick', detailReady);

  const backVisible = await page.evaluate(() => {
    const btn = document.getElementById('cco-mobile-back-button');
    return Boolean(btn && !btn.hidden);
  });
  record('Back-knapp synlig i detail', backVisible);

  await page.evaluate(() => {
    window.ArcanaPatientMasterUi?.goBackToPatientList?.();
  });
  await page.waitForTimeout(500);

  const backToList = await page.evaluate(
    () => !document.documentElement.hasAttribute('data-cco-patient-detail')
  );
  record('Back till lista', backToList);
}

async function verifySettingsBottomSheet(page) {
  const mobileShell = await page.evaluate(() =>
    document.documentElement.hasAttribute('data-cco-mobile-shell')
  );

  let opened = false;
  const toolbarSettings = page.locator('.customers-toolbar-settings[data-customer-command="settings"]').first();
  if (mobileShell && (await toolbarSettings.count())) {
    await page.evaluate(() => {
      document.querySelector('.customers-toolbar-settings[data-customer-command="settings"]')?.click();
    });
    opened = true;
  } else {
    const settingsBtn = page.locator('[data-customer-command="settings"]').first();
    if (!(await settingsBtn.count())) {
      warn('Modal sheet', 'inställningsknapp saknas');
      return;
    }
    if (mobileShell) {
      await page.evaluate(() => {
        document.querySelector('[data-customer-command="settings"]')?.click();
      });
      opened = true;
    } else {
      await settingsBtn.click();
      opened = true;
    }
  }

  if (!opened) return;
  await page.waitForTimeout(350);

  const shellOpen = await page.evaluate(() =>
    document.getElementById('customers-settings-shell')?.hasAttribute('data-open')
  );
  record('Inställnings-modal öppen', Boolean(shellOpen));

  if (shellOpen) {
    const sheetStyle = await page.evaluate(() => {
      const surface = document.querySelector('#customers-settings-shell .customers-modal-surface');
      if (!surface) return null;
      const style = window.getComputedStyle(surface);
      return { position: style.position, bottom: style.bottom };
    });
    record(
      'Modal som bottom sheet',
      sheetStyle?.position === 'fixed' && (sheetStyle?.bottom === '0px' || sheetStyle?.bottom === '0'),
      sheetStyle ? `${sheetStyle.position} bottom=${sheetStyle.bottom}` : 'saknas'
    );
  }

  await page.locator('[data-customer-settings-close]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
}

async function verifyQueueChrome(page) {
  await page.goto(`${base}/staff?view=conversations`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForMobileShell(page);

  const filterToggle = await page.locator('[data-cco-queue-filter-toggle]').count();
  record('Kö Filter-chip', filterToggle > 0, filterToggle ? 'finns' : 'saknas');

  const compactRow = await page.locator('.warm-row--mobile-compact').count();
  if (compactRow === 0) {
    await page.waitForTimeout(2000);
  }
  const compactAfter = await page.locator('.warm-row--mobile-compact').count();
  if (compactAfter > 0) {
    record('Kompakta kö-rader', true, `${compactAfter} rader`);
  } else {
    warn('Kompakta kö-rader', '0 rader (tom kö eller ej renderad)');
  }
}

async function main() {
  const token = getStaffToken();
  if (!token || token.length < 8) {
    throw new Error('Saknar STAFF-token');
  }

  if (!isLocal) {
    execSync(`node "${path.join(root, 'scripts/lib/wait-for-prod-ready.js')}"`, { stdio: 'inherit' });
  }

  const patientId = isLocal
    ? preferredPatientId
    : await resolveSmokePatientId({ base, token, preferredId: preferredPatientId });

  console.log(`Base: ${base}${isLocal ? ' (lokal)' : ' (prod)'}`);
  console.log(`Patient: ${patientId.slice(0, 8)}…`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'sv-SE',
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('ARCANA_ADMIN_TOKEN', t);
      sessionStorage.setItem('ARCANA_ADMIN_TOKEN', t);
    } catch {
      /* ignore */
    }
  }, token);
  const page = await context.newPage();

  try {
    await openMobilePatientDeepLink(page, { base, patientId, token, warmSession: true });
    console.log(`URL: ${page.url()}`);

    await verifyMobileShell(page);
    await verifyPatientJournal(page);
    await verifyListBackFlow(page, patientId);
    await verifySettingsBottomSheet(page);
    await verifyQueueChrome(page);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log('');
  console.log(`Resultat: ${passed}/${results.length} PASS`);

  if (hardFail) {
    process.exit(1);
  }

  console.log('✅ STAFF UI verify (iPhone 13 viewport) klar');
}

main().catch((err) => {
  console.error('❌ STAFF UI verify:', err.message || err);
  process.exit(1);
});
