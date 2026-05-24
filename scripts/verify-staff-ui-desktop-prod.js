#!/usr/bin/env node
/**
 * Desktop regression @1280 — mobil shell ska INTE aktiveras; desktop chrome kvar.
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
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  return '';
}

async function main() {
  const token = getStaffToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'sv-SE' });
  const page = await context.newPage();

  try {
    await page.goto(`${base}/staff`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate((t) => {
      localStorage.setItem('ARCANA_ADMIN_TOKEN', t);
      sessionStorage.setItem('ARCANA_ADMIN_TOKEN', t);
    }, token);
    await page.goto(`${base}/staff?view=conversations`, { waitUntil: 'networkidle', timeout: 90000 });

    const shellOff = await page.evaluate(
      () => document.documentElement.getAttribute('data-cco-mobile-shell') !== 'on'
    );
    record('Mobil shell av @1280', shellOff);

    const navVisible = await page.locator('.preview-topbar-left .preview-nav').isVisible();
    record('Desktop nav synlig', navVisible);

    const tabbarHidden = await page.locator('.cco-mobile-tabbar').isHidden();
    record('Bottom tab bar dold', tabbarHidden);

    await page.goto(`${base}/staff?view=customers`, { waitUntil: 'networkidle', timeout: 90000 });
    const listAndRail = await page.evaluate(() => {
      const list = document.querySelector('[data-customer-list]');
      const rail = document.querySelector('.customers-rail');
      if (!list || !rail) return false;
      const listBox = list.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();
      return listBox.width > 200 && railBox.width > 200 && Math.abs(listBox.top - railBox.top) < 80;
    });
    record('Kundvy tvåkolumn @1280', listAndRail);

    const topbar = await page.evaluate(() => {
      const bar = document.querySelector('.preview-topbar');
      return bar ? Math.round(bar.getBoundingClientRect().height) : 0;
    });
    record('Topbar desktop höjd > 56px', topbar > 56, `${topbar}px`);
  } finally {
    await browser.close();
  }

  if (hardFail) process.exit(1);
  console.log('✅ Desktop UI verify (1280px) klar');
}

main().catch((err) => {
  console.error('❌ Desktop UI verify:', err.message || err);
  process.exit(1);
});
