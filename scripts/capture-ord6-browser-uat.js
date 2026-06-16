#!/usr/bin/env node
'use strict';

/* eslint-disable no-undef -- page.evaluate() callbacks run in the browser */

/**
 * ORD-6 prod browser UAT — legal review gate on kundkort / smart next step.
 *   node scripts/capture-ord6-browser-uat.js
 *   CAPTURE_PILOT=axel node scripts/capture-ord6-browser-uat.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

const BASE = String(process.env.ARCANA_BASE_URL || 'https://arcana.hairtpclinic.com').replace(
  /\/$/,
  ''
);
const OUT_DIR = path.join(__dirname, '..', 'data', 'reports', 'ord6-browser-uat');

const PILOTS = [
  {
    id: 'axel',
    file: 'u6-axel-legal-gate.png',
    scenario: 'U6.2/U6.4 Axel legal gate (no demoSkipSteg7)',
    patientId: '54a658c8-7412-4f10-877e-9e607e03b74f',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=54a658c8-7412-4f10-877e-9e607e03b74f`,
    expectName: /axel/i,
  },
];

async function fetchProdCommit() {
  try {
    const res = await fetch(`${BASE}/api/v1/_diag/version`);
    if (!res.ok) return '';
    const payload = await res.json();
    return String(payload?.commit || '').slice(0, 8);
  } catch {
    return '';
  }
}

async function loginToken() {
  const email = String(process.env.ARCANA_OWNER_EMAIL || '');
  const password = String(process.env.ARCANA_OWNER_PASSWORD || '');
  const tenant = String(process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic');
  if (!email || !password) {
    throw new Error('Saknar ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD');
  }
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client: 'major_arcana_admin',
        email,
        password,
        tenantId: tenant,
      }),
    });
    const raw = await res.text();
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      if (attempt < 12 && (res.status === 502 || res.status === 503)) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      throw new Error(`Login svarade inte JSON (${res.status})`);
    }
    const token = String(payload?.token || '');
    if (res.ok && token) return token;
    if (attempt < 12 && res.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    throw new Error(`Login misslyckades (${res.status}): ${payload?.error || 'okänt'}`);
  }
  throw new Error('Login misslyckades efter retries');
}

function readOrd6VisualState() {
  const bodyText = document.body?.innerText || '';
  const legalGate =
    document.getElementById('cco-steg7-bundle-gate-scrim') ||
    document.querySelector('[aria-label="Avtal väntar juridisk granskning"]') ||
    document.querySelector('.demo-kicker');
  const legalGateVisible =
    Boolean(legalGate) &&
    /legal_review|juridisk granskning/i.test(
      legalGate.innerText || legalGate.textContent || bodyText
    );
  const smartNext =
    document.querySelector('[data-kk-smart-next]') ||
    document.querySelector('.kk-smart-next') ||
    document.querySelector('[data-kk-sigact]');
  const smartText = smartNext?.innerText || '';
  const missingAgreement = /missing_agreement|avtal saknas|avtal \+ samtycke/i.test(
    bodyText + smartText
  );
  const utkastOpen = Boolean(
    document.querySelector('.kk-sigact') ||
    document.querySelector('[data-kk-sig-preview]') ||
    document.querySelector('.kk-sigact-draft')
  );
  return {
    legalGateVisible,
    missingAgreement,
    utkastOpen,
    hasKontrolleraGate: /Kontrollera gate/i.test(bodyText),
    hasGodkannMall: /Godkänn mall-version/i.test(bodyText),
    hasAktiveraSignering: /Aktivera signering/i.test(bodyText),
    bodySnippet: bodyText.slice(0, 800),
  };
}

function isOrd6Pass(state) {
  const gateOrSmart = state.legalGateVisible || state.missingAgreement;
  if (!gateOrSmart && !state.utkastOpen) return false;
  if (!state.hasKontrolleraGate && !state.hasGodkannMall) return false;
  return true;
}

async function dismissCaptureOverlays(page) {
  await page.evaluate(() => {
    try {
      window.localStorage.setItem('cco.onboardingTour.v1', 'done');
      window.sessionStorage.setItem('cco.onboardingTour.v1', 'done');
    } catch {}
    document.querySelector('[data-tour-skip]')?.click();
    document
      .querySelectorAll('.arcana-tour-overlay, .arcana-tour-spotlight, .arcana-tour-card')
      .forEach((el) => {
        el.remove();
      });
    document.querySelector('.customers-layout')?.setAttribute('data-v9-dossier-open', 'on');
  });
  await page.keyboard.press('Escape').catch(() => {});
}

async function ensurePatientOpen(page, patientId) {
  await page.waitForFunction(
    () =>
      typeof window.ArcanaPatientMasterUi?.openPatient === 'function' &&
      Boolean(document.querySelector('[data-patient-master-rail]')),
    null,
    { timeout: 120000 }
  );
  await page.evaluate(async (pid) => {
    const api = window.ArcanaPatientMasterUi;
    if (!api?.openPatient) return;
    document.querySelector('.customers-layout')?.setAttribute('data-v9-dossier-open', 'on');
    await api.openPatient(pid);
    await api.refreshV10KundkortFacit?.();
  }, patientId);
}

async function tryOpenSmartNextUtkast(page) {
  await page.evaluate(() => {
    const arrow =
      document.querySelector('[data-kk-smart-next-arrow]') ||
      document.querySelector('[data-kk-smart-next] button') ||
      document.querySelector('.kk-smart-next-toggle');
    arrow?.click();
    const sigBtn = [].slice
      .call(document.querySelectorAll('button, [role="button"]'))
      .find(function (el) {
        return /avtal|samtycke|smart/i.test(el.textContent || '');
      });
    sigBtn?.click();
  });
  await page.waitForTimeout(2000);
  const previewBtn = page
    .locator('[data-kk-sig-preview], button:has-text("Kontrollera gate")')
    .first();
  if (await previewBtn.count()) {
    await previewBtn.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
}

async function capturePilot(page, pilot) {
  await page.goto(pilot.url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(5000);
  await ensurePatientOpen(page, pilot.patientId);
  await dismissCaptureOverlays(page);
  await tryOpenSmartNextUtkast(page);
  await dismissCaptureOverlays(page);

  let state = await page.evaluate(readOrd6VisualState);
  if (!isOrd6Pass(state)) {
    const bundleBtn = page
      .locator('button:has-text("Avtal"), button:has-text("steg 7"), [data-kk-open-bundle]')
      .first();
    if (await bundleBtn.count()) {
      await bundleBtn.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(3000);
      state = await page.evaluate(readOrd6VisualState);
    }
  }
  state.pass = isOrd6Pass(state);

  const outPath = path.join(OUT_DIR, pilot.file);
  const modal = page
    .locator(
      '#cco-steg7-bundle-gate-scrim, .kk-sigact, [data-kk-ord48-ready], [data-patient-master-rail]'
    )
    .first();
  if (await modal.count()) {
    await modal.screenshot({ path: outPath, timeout: 30000 }).catch(async () => {
      await page.screenshot({ path: outPath, fullPage: false });
    });
  } else {
    await page.screenshot({ path: outPath, fullPage: false });
  }

  const label = state.pass ? 'PASS' : 'PARTIAL';
  console.log(
    `${label} ${pilot.file} [${pilot.scenario}] legalGate=${state.legalGateVisible} utkast=${state.utkastOpen} kontrollera=${state.hasKontrolleraGate} godkann=${state.hasGodkannMall}`
  );
  return state;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const prodCommit = await fetchProdCommit();
  const token = await loginToken();
  const filter = String(process.env.CAPTURE_PILOT || '')
    .trim()
    .toLowerCase();
  const pilots = filter
    ? PILOTS.filter((p) => p.id.includes(filter) || p.file.includes(filter))
    : PILOTS;
  const results = [];

  for (const pilot of pilots) {
    const browser = await chromium.launch({
      headless: true,
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    });
    const context = await browser.newContext({
      viewport: { width: 1512, height: 900 },
      locale: 'sv-SE',
    });
    await context.addInitScript((sessionToken) => {
      window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
      window.sessionStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
      window.localStorage.setItem('cco.onboardingTour.v1', 'done');
      window.sessionStorage.setItem('cco.onboardingTour.v1', 'done');
    }, token);
    const page = await context.newPage();
    results.push({
      scenario: pilot.scenario,
      file: pilot.file,
      patientId: pilot.patientId,
      ...(await capturePilot(page, pilot)),
    });
    await browser.close();
  }

  const passCount = results.filter((r) => r.pass).length;
  const manifest = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    prodCommit,
    summary: `${passCount}/${results.length} PASS (legal gate / smart next + gate copy in DOM)`,
    results,
    outDir: OUT_DIR,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${manifest.summary}`);
  console.log(`Screenshots: ${OUT_DIR}`);
  if (passCount < results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
