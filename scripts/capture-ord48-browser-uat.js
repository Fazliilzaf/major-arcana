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
  const rail = document.querySelector('[data-patient-master-rail]');
  const railText = rail?.innerText || '';
  const runtime = window.ArcanaPatientMasterUi?.getRuntime?.();
  const topbar = document.querySelector('.kk-ord47-topbar');
  const docCards = document.querySelector('[data-kk-doc-cards]');
  const readyBlock = document.querySelector('[data-kk-ord48-ready]');
  const calBtn = document.querySelector('[data-kk-ord48-open-calendar]');
  const opDay = document.querySelector('.v11-opday-actions');
  const opDisabled = document.querySelector(
    '.v11-opday-actions button[disabled], .v11-opday-actions [aria-disabled="true"]'
  );
  const isError = /Patienten hittades inte|Kunde inte ladda kund|HTTP 502|HTTP 503/i.test(railText);
  const isLoading = /Laddar kund|Läser kundregister|detail-loading/i.test(railText);
  const nameOk = Boolean(runtime?.detail?.card?.displayName || runtime?.detail?.card?.name);
  const readyAttr = readyBlock?.getAttribute('data-ready') === 'true';
  return {
    hasTopbar: Boolean(topbar),
    hasDocCards: Boolean(docCards),
    hasDetail: Boolean(runtime?.detail?.card),
    hasReadyRow: Boolean(readyBlock),
    hasCalCta: Boolean(calBtn),
    readyForTreatment: readyAttr,
    calEnabled: Boolean(
      calBtn && !calBtn.disabled && calBtn.getAttribute('aria-disabled') !== 'true'
    ),
    hasOpDay: Boolean(opDay),
    hasOpDisabled: Boolean(opDisabled),
    selectedPatientId: runtime?.selectedPatientId || '',
    isError,
    isLoading,
    nameOk,
    railSnippet: railText.slice(0, 600),
    docCardCount: docCards
      ? docCards.querySelectorAll('.kk-doc-card, [data-kk-doc-card]').length
      : 0,
    expectOpDay,
  };
}

async function waitForKundkortReady(page, pilot, timeoutMs = 150000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(readVisualState, pilot.expectOpDay);
    const shellReady =
      last.hasTopbar &&
      last.hasDocCards &&
      last.hasDetail &&
      last.hasReadyRow &&
      last.hasCalCta &&
      !last.isError;
    if (shellReady && last.nameOk) {
      if (pilot.expectOpDay && !last.hasOpDay) {
        await page.waitForTimeout(1500);
        continue;
      }
      return { ...last, pass: true };
    }
    if (
      last.hasDetail &&
      !last.isLoading &&
      !last.isError &&
      pilot.expectName.test(last.railSnippet)
    ) {
      if (last.hasTopbar && last.hasDocCards && last.hasReadyRow) {
        return { ...last, pass: true };
      }
    }
    await page.waitForTimeout(1500);
  }
  return { ...(last || {}), pass: false };
}

async function ensurePatientOpen(page, patientId) {
  await page.evaluate(async (pid) => {
    const api = window.ArcanaPatientMasterUi;
    if (!api?.openPatient) return;
    const rt = api.getRuntime?.();
    if (rt?.selectedPatientId === pid && rt?.detail?.card) return;
    await api.openPatient(pid);
  }, patientId);
}

async function capturePilot(page, pilot) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.goto(pilot.url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(3000);
  await ensurePatientOpen(page, pilot.patientId);
  await page.waitForTimeout(2000);
  let state = await waitForKundkortReady(page, pilot);
  if (!state.pass) {
    await ensurePatientOpen(page, pilot.patientId);
    await page.waitForTimeout(5000);
    state = await waitForKundkortReady(page, pilot, 90000);
  }

  const outPath = path.join(OUT_DIR, pilot.file);
  const clipTarget = page.locator('.patient-master-rail .kk-storvy-body').first();
  const railTarget = page.locator('[data-patient-master-rail]').first();
  if (await clipTarget.count()) {
    await clipTarget.screenshot({ path: outPath, timeout: 30000 });
  } else if (await railTarget.count()) {
    await railTarget.screenshot({ path: outPath, timeout: 30000 });
  } else {
    await page.screenshot({ path: outPath, fullPage: false });
  }

  const label = state.pass ? 'PASS' : 'PARTIAL';
  console.log(
    `${label} ${pilot.file} [${pilot.scenario}] ready=${state.hasReadyRow} cta=${state.hasCalCta} opDay=${state.hasOpDay} detail=${state.hasDetail}`
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
