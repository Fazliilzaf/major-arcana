#!/usr/bin/env node
'use strict';

/* eslint-disable no-undef -- page.evaluate() callbacks run in the browser */

/**
 * ORD-47 prod browser UAT — 3 pilot deep links → kundkort screenshots.
 *   node scripts/capture-ord47-browser-uat.js
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
const OUT_DIR = path.join(__dirname, '..', 'data', 'reports', 'ord47-browser-uat');

const PILOTS = [
  {
    file: 'axel-meijer.png',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=54a658c8-7412-4f10-877e-9e607e03b74f`,
    expectName: /axel/i,
  },
  {
    file: 'dino-placo.png',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=4db24289-7f9e-431e-b7f3-bd9014d8c9f3`,
    expectName: /dino/i,
  },
  {
    file: 'jonas-lundvall.png',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=a6a55cae-8c12-4d7d-83da-adbcdd368b00`,
    expectName: /jonas/i,
  },
];

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

async function waitForKundkort(page, expectName, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const card = document.querySelector(
        '.kkref, .kk-doc-cards, .patient-detail-panel, .v9-dossier, .patient-master-rail .kk-storvy-body'
      );
      const topbar = document.querySelector('.kk-ord47-topbar');
      const selected = document.querySelector('.customer-row.is-selected, .customer-row.selected');
      const bodyText = document.body?.innerText || '';
      const runtime = window.ArcanaPatientMasterUi?.getRuntime?.();
      return {
        hasCard: Boolean(card),
        hasTopbar: Boolean(topbar),
        hasSelected: Boolean(selected),
        hasDetail: Boolean(runtime?.detail?.card),
        selectedPatientId: runtime?.selectedPatientId || '',
        snippet: bodyText.slice(0, 4000),
      };
    });
    if (state.hasCard || state.hasTopbar || state.hasDetail) return state;
    if (state.selectedPatientId && state.hasDetail) return state;
    if (expectName.test(state.snippet) && state.hasDetail) return state;
    await page.waitForTimeout(1500);
  }
  throw new Error('Timeout: kundkort öppnades inte från patientId-deeplink');
}

async function capturePilot(page, pilot) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.goto(pilot.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  const state = await waitForKundkort(page, pilot.expectName);
  const outPath = path.join(OUT_DIR, pilot.file);
  const panel = page.locator('[data-patient-master-rail]').first();
  if (await panel.count()) {
    await panel.screenshot({ path: outPath, timeout: 30000 });
  } else {
    await page.screenshot({ path: outPath, fullPage: false });
  }
  console.log(
    `OK ${pilot.file} card=${state.hasCard} topbar=${state.hasTopbar} detail=${state.hasDetail}`
  );
  return state;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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
    results.push({ file: pilot.file, ...(await capturePilot(page, pilot)) });
    await browser.close();
  }

  const manifest = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    commit: '9e69bda4',
    results,
    outDir: OUT_DIR,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nScreenshots: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
