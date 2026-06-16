#!/usr/bin/env node
'use strict';

/* eslint-disable no-undef -- page.evaluate() callbacks run in the browser */

/**
 * ORD-29 prod browser UAT — HD ready state on kundkort.
 *   node scripts/capture-ord29-browser-uat.js
 *   CAPTURE_PILOT=omar node scripts/capture-ord29-browser-uat.js
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
const OUT_DIR = path.join(__dirname, '..', 'data', 'reports', 'ord29-browser-uat');

const PILOTS = [
  {
    id: 'omar',
    file: 'u29-omar-hd.png',
    scenario: 'U29.1 Omar HD positive',
    patientId: '3cdf4d6c-8f3d-4b2a-9c1e-2a4f8b0e9d12',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=3cdf4d6c-8f3d-4b2a-9c1e-2a4f8b0e9d12`,
    expectName: /omar/i,
  },
  {
    id: 'jonas',
    file: 'u29-jonas-signed-hd.png',
    scenario: 'U29.2 Jonas signed HD in medicinskt',
    patientId: 'a6a55cae-8c12-4d7d-83da-adbcdd368b00',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=a6a55cae-8c12-4d7d-83da-adbcdd368b00`,
    expectName: /jonas/i,
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

async function fetchPatientMissingHd(token, patientId) {
  const res = await fetch(
    `${BASE}/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-arcana-client': 'major_arcana_admin',
      },
    }
  );
  if (!res.ok) return { apiOk: false, missingHealthDeclaration: null };
  const payload = await res.json();
  const patient = payload.patient || {};
  return {
    apiOk: true,
    missingHealthDeclaration: patient.missingHealthDeclaration,
    hasHealthDeclaration: patient.hasHealthDeclaration,
  };
}

function readOrd29VisualState() {
  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 24) return false;
    const style = window.getComputedStyle(el);
    return (
      style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0.05
    );
  }
  const rail = document.querySelector('[data-patient-master-rail]');
  const railText = rail?.innerText || '';
  const runtime = window.ArcanaPatientMasterUi?.getRuntime?.();
  const readyBlock =
    rail?.querySelector('[data-kk-ord48-ready]') || document.querySelector('[data-kk-ord48-ready]');
  const hdPill =
    readyBlock?.querySelector('.kk-ready-pill--success') ||
    [].slice.call(readyBlock?.querySelectorAll('.kk-ready-pill') || []).find(function (el) {
      return /hälsodekl/i.test(el.textContent || '');
    });
  const hdPillSuccess =
    Boolean(hdPill) &&
    (hdPill.classList.contains('kk-ready-pill--success') ||
      /success/i.test(hdPill.className || ''));
  const card = runtime?.detail?.card || {};
  return {
    hasReadyRow: Boolean(readyBlock),
    readyRowVisible: isVisible(readyBlock),
    hdPillSuccess,
    readyForTreatment: readyBlock?.getAttribute('data-ready') === 'true',
    cardMissingHd: card.missingHealthDeclaration,
    cardHasHd: card.hasHealthDeclaration,
    nameOk: Boolean(card.displayName || card.name),
    isError: /Patienten hittades inte|Kunde inte ladda kund|HTTP 502|HTTP 503/i.test(railText),
    isLoading: Boolean(
      rail?.querySelector('[data-patient-loading="true"]') ||
      /Laddar kund|Läser kundregister|detail-loading/i.test(railText)
    ),
    railSnippet: railText.slice(0, 400),
  };
}

function isOrd29Pass(state, pilot, apiProbe) {
  if (!state || state.isError || state.isLoading || !state.nameOk) return false;
  if (!pilot.expectName.test(state.railSnippet)) return false;
  const hdVisualOk = state.hdPillSuccess || (state.hasReadyRow && state.readyRowVisible);
  if (!hdVisualOk) return false;
  if (apiProbe?.apiOk && apiProbe.missingHealthDeclaration !== false) return false;
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

async function capturePilot(page, pilot, apiProbe) {
  await page.goto(pilot.url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(5000);
  await ensurePatientOpen(page, pilot.patientId);
  const deadline = Date.now() + 90000;
  let state = await page.evaluate(readOrd29VisualState);
  while (Date.now() < deadline && !isOrd29Pass(state, pilot, apiProbe)) {
    await dismissCaptureOverlays(page);
    await page.waitForTimeout(1500);
    state = await page.evaluate(readOrd29VisualState);
  }
  state.pass = isOrd29Pass(state, pilot, apiProbe);
  state.apiProbe = apiProbe;

  await dismissCaptureOverlays(page);
  const outPath = path.join(OUT_DIR, pilot.file);
  const target = page
    .locator(
      '[data-kk-ord48-ready]:visible, [data-patient-master-rail] .v10-dossier-referens:visible'
    )
    .first();
  if (await target.count()) {
    await target.screenshot({ path: outPath, timeout: 30000 }).catch(async () => {
      await page.screenshot({ path: outPath, fullPage: false });
    });
  } else {
    await page.screenshot({ path: outPath, fullPage: false });
  }

  const label = state.pass ? 'PASS' : 'PARTIAL';
  console.log(
    `${label} ${pilot.file} [${pilot.scenario}] ready=${state.hasReadyRow} hdPill=${state.hdPillSuccess} apiMissingHd=${apiProbe?.missingHealthDeclaration}`
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
    const apiProbe = await fetchPatientMissingHd(token, pilot.patientId);
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
      ...(await capturePilot(page, pilot, apiProbe)),
    });
    await browser.close();
  }

  const passCount = results.filter((r) => r.pass).length;
  const manifest = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    prodCommit,
    summary: `${passCount}/${results.length} PASS (HD ready row / pill + API missingHealthDeclaration=false)`,
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
