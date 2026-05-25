#!/usr/bin/env node
/**
 * Tablet regression @820px — split shell ska aktiveras; mobil shell av.
 */
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const root = path.join(__dirname, '..');
let hardFail = false;

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function main() {
  const token = getStaffToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 820, height: 1024 }, locale: 'sv-SE' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  try {
    await page.goto(`${base}/staff`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate((t) => {
      localStorage.setItem('ARCANA_ADMIN_TOKEN', t);
      sessionStorage.setItem('ARCANA_ADMIN_TOKEN', t);
    }, token);
    await page.goto(`${base}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1500);

    const flags = await page.evaluate(() => ({
      mobileShell: document.documentElement.getAttribute('data-cco-mobile-shell') === 'on',
      tabletShell: document.documentElement.getAttribute('data-cco-tablet-shell') === 'on',
    }));
    record('Mobil shell av @820', !flags.mobileShell);
    record('Tablet shell på @820', flags.tabletShell);

    const split = await page.evaluate(() => {
      const list = document.querySelector('.customers-list');
      const rail = document.querySelector('.customers-rail');
      if (!list || !rail) return { ok: false, reason: 'missing nodes' };
      const listBox = list.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();
      const sideBySide = listBox.right <= railBox.left + 4 && listBox.width >= 200 && railBox.width >= 200;
      return { ok: sideBySide, listW: Math.round(listBox.width), railW: Math.round(railBox.width) };
    });
    record(
      'Kundvy split @820',
      split.ok,
      split.ok ? `${split.listW}px + ${split.railW}px` : split.reason || 'ej side-by-side'
    );
  } finally {
    await browser.close();
  }

  if (hardFail) process.exit(1);
  console.log('✅ Tablet shell verify (820px) klar');
}

main().catch((err) => {
  console.error('❌ Tablet shell verify:', err.message || err);
  process.exit(1);
});
