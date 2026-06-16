#!/usr/bin/env node
'use strict';

/* eslint-disable no-undef -- page.evaluate() callbacks run in the browser */

/**
 * ORD-48 prod browser UAT — 3 pilot deep links → kundkort + ready/CTA screenshots.
 *   node scripts/capture-ord48-browser-uat.js
 *
 * Pass = detail + ord47 shell + ORD-48 ready row + kalender CTA present.
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

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
const OUT_DIR = path.join(__dirname, '..', 'data', 'reports', 'ord48-browser-uat');

const PILOTS = [
  {
    file: 'u1-axel-bundle.png',
    scenario: 'U1 bundle steg7',
    patientId: '54a658c8-7412-4f10-877e-9e607e03b74f',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=54a658c8-7412-4f10-877e-9e607e03b74f`,
    expectName: /axel/i,
    expectOpDay: false,
  },
  {
    file: 'u3-dino-opdag.png',
    scenario: 'U3/U4 ops-dag FC',
    patientId: '4db24289-7f9e-431e-b7f3-bd9014d8c9f3',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=4db24289-7f9e-431e-b7f3-bd9014d8c9f3`,
    expectName: /dino/i,
    expectOpDay: true,
  },
  {
    file: 'u5-jonas-ready.png',
    scenario: 'U5 ready composite',
    patientId: 'a6a55cae-8c12-4d7d-83da-adbcdd368b00',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=a6a55cae-8c12-4d7d-83da-adbcdd368b00`,
    expectName: /jonas/i,
    expectOpDay: false,
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
      body: JSON.stringify({ email, password, tenantId: tenant }),
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

function readVisualState(expectOpDay) {
  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 80) return false;
    const style = window.getComputedStyle(el);
    return (
      style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0.05
    );
  }
  const rail = document.querySelector('[data-patient-master-rail]');
  const railText = rail?.innerText || '';
  const runtime = window.ArcanaPatientMasterUi?.getRuntime?.();
  const referensShell =
    rail?.querySelector('.v10-dossier-referens') || rail?.querySelector('.kkref');
  const topbar =
    rail?.querySelector('.kk-ord47-topbar') || document.querySelector('.kk-ord47-topbar');
  const docCards =
    rail?.querySelector('[data-kk-doc-cards]') || document.querySelector('[data-kk-doc-cards]');
  const readyBlock =
    rail?.querySelector('[data-kk-ord48-ready]') || document.querySelector('[data-kk-ord48-ready]');
  const calBtn =
    rail?.querySelector('[data-kk-ord48-open-calendar]') ||
    document.querySelector('[data-kk-ord48-open-calendar]');
  const opDay =
    rail?.querySelector('.v11-opday-actions') || document.querySelector('.v11-opday-actions');
  const opDisabled = document.querySelector(
    '.v11-opday-actions button[disabled], .v11-opday-actions [aria-disabled="true"]'
  );
  const storvyOpen = Boolean(document.getElementById('kk-storvy')?.classList.contains('open'));
  const bundleOpen = Boolean(
    document.getElementById('cco-steg7-bundle-scrim') ||
    document.getElementById('cco-steg7-bundle-gate-scrim')
  );
  const isError = /Patienten hittades inte|Kunde inte ladda kund|HTTP 502|HTTP 503/i.test(railText);
  const isLoading = Boolean(
    rail?.querySelector('[data-patient-loading="true"]') ||
    /Laddar kund|Läser kundregister|detail-loading/i.test(railText)
  );
  const nameOk = Boolean(runtime?.detail?.card?.displayName || runtime?.detail?.card?.name);
  const readyAttr = readyBlock?.getAttribute('data-ready') === 'true';
  const docCardCount = docCards
    ? docCards.querySelectorAll('.kk-doc-card, [data-kk-doc-card]').length
    : 0;
  const captureTarget =
    rail?.querySelector('.v10-dossier-referens') ||
    rail?.querySelector('[data-kk-doc-cards]')?.closest('.kkref') ||
    referensShell;
  const captureRect = captureTarget?.getBoundingClientRect?.();
  return {
    hasReferensShell: Boolean(referensShell),
    hasTopbar: Boolean(topbar),
    hasDocCards: Boolean(docCards),
    docCardsVisible: isVisible(docCards),
    hasDetail: Boolean(runtime?.detail?.card),
    hasReadyRow: Boolean(readyBlock),
    readyRowVisible: isVisible(readyBlock),
    hasCalCta: Boolean(calBtn),
    readyForTreatment: readyAttr,
    calEnabled: Boolean(
      calBtn && !calBtn.disabled && calBtn.getAttribute('aria-disabled') !== 'true'
    ),
    hasOpDay: Boolean(opDay),
    hasOpDisabled: Boolean(opDisabled),
    storvyOpen,
    bundleOpen,
    selectedPatientId: runtime?.selectedPatientId || '',
    isError,
    isLoading,
    nameOk,
    railSnippet: railText.slice(0, 600),
    docCardCount,
    captureWidth: captureRect ? Math.round(captureRect.width) : 0,
    captureHeight: captureRect ? Math.round(captureRect.height) : 0,
    expectOpDay,
  };
}

function isCaptureReady(state, pilot) {
  if (!state || state.isError || state.isLoading || !state.nameOk) return false;
  if (state.storvyOpen || state.bundleOpen) return false;
  if (!state.hasReferensShell || !state.hasDetail) return false;
  if (!state.hasDocCards || !state.docCardsVisible || (state.docCardCount || 0) < 4) return false;
  if (!state.hasReadyRow || !state.hasCalCta) return false;
  if ((state.captureWidth || 0) < 280 || (state.captureHeight || 0) < 200) return false;
  if (!pilot.expectName.test(state.railSnippet)) return false;
  if (pilot.expectOpDay && !state.hasOpDay) return false;
  return true;
}

async function dismissCaptureOverlays(page) {
  await page.evaluate(() => {
    document.getElementById('kk-storvy')?.classList.remove('open');
    document.getElementById('cco-steg7-bundle-scrim')?.remove();
    document.getElementById('cco-steg7-bundle-gate-scrim')?.remove();
    document.querySelector('.customers-layout')?.setAttribute('data-v9-dossier-open', 'on');
  });
  await page.keyboard.press('Escape').catch(() => {});
}

async function waitForKundkortReady(page, pilot, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await dismissCaptureOverlays(page);
    last = await page.evaluate(readVisualState, pilot.expectOpDay);
    if (isCaptureReady(last, pilot)) return { ...last, pass: true };
    await page.waitForTimeout(1500);
  }
  return { ...(last || {}), pass: false };
}

async function ensurePatientOpen(page, patientId) {
  await page.waitForFunction(
    () =>
      typeof window.ArcanaPatientMasterUi?.openPatient === 'function' &&
      Boolean(document.querySelector('[data-patient-master-rail]')),
    null,
    { timeout: 60000 }
  );
  await page.evaluate(async (pid) => {
    const api = window.ArcanaPatientMasterUi;
    if (!api?.openPatient) return;
    const rt = api.getRuntime?.();
    const rail = document.querySelector('[data-patient-master-rail]');
    const hasShell = Boolean(rail?.querySelector('.v10-dossier-referens [data-kk-doc-cards]'));
    if (rt?.selectedPatientId === pid && rt?.detail?.card && hasShell) return;
    await api.openPatient(pid);
    await api.refreshV10KundkortFacit?.();
  }, patientId);
}

async function waitForReferensShell(page, pilot, timeoutMs = 90000) {
  try {
    await page.waitForFunction(
      ({ pid, namePattern }) => {
        function normalizeText(value) {
          return String(value || '').trim();
        }
        const rail = document.querySelector('[data-patient-master-rail]');
        const referens = rail?.querySelector('.v10-dossier-referens [data-kk-doc-cards]');
        const ready = rail?.querySelector('[data-kk-ord48-ready]');
        const runtime = window.ArcanaPatientMasterUi?.getRuntime?.();
        const displayName = runtime?.detail?.card?.displayName || runtime?.detail?.card?.name || '';
        if (normalizeText(runtime?.selectedPatientId) !== normalizeText(pid)) return false;
        if (!referens || !ready) return false;
        if (!new RegExp(namePattern, 'i').test(displayName)) return false;
        const rect = referens.getBoundingClientRect();
        return rect.width >= 200 && rect.height >= 80;
      },
      {
        pid: pilot.patientId,
        namePattern: pilot.expectName.source.replace(/^\^|\$$/g, '').replace(/\\b/g, ''),
      },
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function capturePilot(page, pilot) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.goto(pilot.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);
  await ensurePatientOpen(page, pilot.patientId);
  await page.waitForTimeout(2000);
  let opened = await waitForReferensShell(page, pilot, 90000);
  if (!opened) {
    await ensurePatientOpen(page, pilot.patientId);
    await page.waitForTimeout(3000);
    opened = await waitForReferensShell(page, pilot, 45000);
  }
  let state = await page.evaluate(readVisualState, pilot.expectOpDay);
  state.pass = opened && isCaptureReady(state, pilot);

  await dismissCaptureOverlays(page);
  state = { ...(await page.evaluate(readVisualState, pilot.expectOpDay)), pass: state.pass };

  const outPath = path.join(OUT_DIR, pilot.file);
  const captureSelectors = [
    '[data-patient-master-rail] .v10-dossier-referens',
    '[data-patient-master-rail] .kkref .doss',
    '[data-patient-master-rail] [data-kk-doc-cards]',
    '[data-patient-master-rail]',
  ];
  let shot = false;
  for (const selector of captureSelectors) {
    const target = page.locator(selector).first();
    if (!(await target.count())) continue;
    const box = await target.boundingBox().catch(() => null);
    if (!box || box.width < 280 || box.height < 200) continue;
    await target.screenshot({ path: outPath, timeout: 30000 });
    shot = true;
    break;
  }
  if (!shot) {
    await page.screenshot({ path: outPath, fullPage: false });
  }

  const label = state.pass ? 'PASS' : 'PARTIAL';
  console.log(
    `${label} ${pilot.file} [${pilot.scenario}] referens=${state.hasReferensShell} docCards=${state.docCardCount} visible=${state.docCardsVisible} ready=${state.readyRowVisible} capture=${state.captureWidth}x${state.captureHeight} storvy=${state.storvyOpen}`
  );
  return state;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const prodCommit = await fetchProdCommit();
  const token = await loginToken();
  const results = [];
  for (const pilot of PILOTS) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1512, height: 900 },
      locale: 'sv-SE',
    });
    await context.addInitScript((sessionToken) => {
      window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
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
    summary: `${passCount}/${results.length} PASS (ready row + kalender CTA + kundkort)`,
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
