#!/usr/bin/env node
/**
 * CCO Mail-lik start verify — mäter tid till första tråd + lane-stabilitet.
 */
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');

const base = (process.env.ARCANA_PROD_URL || process.env.PLAYWRIGHT_BASE_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const root = path.join(__dirname, '..');
const COLD_MS = Number(process.env.CCO_MAIL_START_COLD_MS || 2000);
const WARM_MS = Number(process.env.CCO_MAIL_START_WARM_MS || 500);

let hardFail = false;

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) {
    return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
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

async function injectToken(page, token) {
  await page.evaluate((t) => {
    localStorage.setItem('ARCANA_ADMIN_TOKEN', t);
    sessionStorage.setItem('ARCANA_ADMIN_TOKEN', t);
  }, token);
}

async function measureFirstThreadMs(page, { warm = false } = {}) {
  if (warm) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  } else {
    await page.goto(`${base}/staff?view=conversations`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  }

  const startedAt = Date.now();
  await page.waitForFunction(
    () => {
      const cards = document.querySelectorAll('.thread-card, arcana-thread-card');
      if (!cards.length) return false;
      return Array.from(cards).some((card) => {
        const source = card.dataset?.worklistSource || card.getAttribute('data-worklist-source') || '';
        if (source && source.toLowerCase() === 'demo') return false;
        return card.getBoundingClientRect().height > 0;
      });
    },
    undefined,
    { timeout: Math.max(COLD_MS + 8000, 12000) }
  );
  return Date.now() - startedAt;
}

async function readActiveLane(page) {
  return page.evaluate(() => {
    const ws = window.__ccoWorkspace;
    const lane =
      (typeof ws?.getActiveLaneId === 'function' && ws.getActiveLaneId()) ||
      ws?.getState?.()?.selection?.laneId ||
      ws?.getState?.()?.runtime?.activeLaneId ||
      'all';
    return String(lane || 'all').toLowerCase();
  });
}

async function main() {
  const token = getStaffToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'sv-SE' });
  const page = await context.newPage();

  try {
    await page.goto(`${base}/staff`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await injectToken(page, token);

    const coldMs = await measureFirstThreadMs(page, { warm: false });
    record(`Kallstart: första tråd < ${COLD_MS} ms`, coldMs < COLD_MS, `${coldMs} ms`);

    const warmMs = await measureFirstThreadMs(page, { warm: true });
    record(`Warm reload: första tråd < ${WARM_MS} ms`, warmMs < WARM_MS, `${warmMs} ms`);

    await page.waitForTimeout(3000);
    const laneAfterSync = await readActiveLane(page);
    record('Lane förblir all efter sync', laneAfterSync === 'all', laneAfterSync);

    const loadingCleared = await page.evaluate(
      () => !document.body.classList.contains('is-runtime-loading')
    );
    record('is-runtime-loading borttagen', loadingCleared);
  } finally {
    await browser.close();
  }

  if (hardFail) process.exit(1);
  console.log('✅ CCO Mail-lik start verify klar');
}

main().catch((err) => {
  console.error('❌ CCO Mail-lik start verify:', err.message || err);
  process.exit(1);
});
