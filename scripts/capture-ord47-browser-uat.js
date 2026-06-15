#!/usr/bin/env node
'use strict';

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
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=2e8d3535-cd89-418e-8b68-ca239f8836a4`,
    expectName: /axel/i,
  },
  {
    file: 'dino-placo.png',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=f8233fca-779c-488b-a980-0e41bc01c0c0`,
    expectName: /dino/i,
  },
  {
    file: 'jonas-lundvall.png',
    url: `${BASE}/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=cc07c972-49d9-4c99-928e-d750e79a82e9`,
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
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, tenantId: tenant }),
  });
  const payload = await res.json();
  const token = String(payload?.token || '');
  if (!res.ok || !token) {
    throw new Error(`Login misslyckades (${res.status}): ${payload?.error || 'okänt'}`);
  }
  return token;
}

async function waitForKundkort(page, expectName, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      /* global document */
      const card = document.querySelector(
        '.kkref, .kk-doc-cards, .patient-detail-panel, .v9-dossier'
      );
      const topbar = document.querySelector('.kk-ord47-topbar');
      const selected = document.querySelector('.customer-row.is-selected, .customer-row.selected');
      const bodyText = document.body?.innerText || '';
      return {
        hasCard: Boolean(card),
        hasTopbar: Boolean(topbar),
        hasSelected: Boolean(selected),
        snippet: bodyText.slice(0, 4000),
      };
    });
    if (state.hasCard || state.hasTopbar) return state;
    if (expectName.test(state.snippet) && state.hasSelected) return state;
    await page.waitForTimeout(1200);
  }
  throw new Error('Timeout: kundkort öppnades inte från patientId-deeplink');
}

async function capturePilot(page, pilot) {
  await page.goto(pilot.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  const state = await waitForKundkort(page, pilot.expectName);
  const outPath = path.join(OUT_DIR, pilot.file);
  const panel = page
    .locator('.kkref, .patient-detail-panel, .v9-dossier-panel, .intel-customer-view')
    .first();
  if (await panel.count()) {
    await panel.screenshot({ path: outPath, timeout: 30000 });
  } else {
    await page.screenshot({ path: outPath, fullPage: false });
  }
  console.log(`OK ${pilot.file} card=${state.hasCard} topbar=${state.hasTopbar}`);
  return state;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const token = await loginToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1512, height: 900 },
    locale: 'sv-SE',
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((sessionToken) => {
    /* global window */
    window.localStorage.clear();
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
  }, token);

  const results = [];
  for (const pilot of PILOTS) {
    results.push({ file: pilot.file, ...(await capturePilot(page, pilot)) });
  }
  await browser.close();

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
