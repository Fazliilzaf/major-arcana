#!/usr/bin/env node
/**
 * CCO Mail-lik start verify — desktop + mobil, sync-pill, tråd/lane-stabilitet.
 */
require('dotenv').config({ quiet: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');

const base = (process.env.ARCANA_PROD_URL || process.env.PLAYWRIGHT_BASE_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const root = path.join(__dirname, '..');
const COLD_MS = Number(process.env.CCO_MAIL_START_COLD_MS || 3500);
const WARM_MS = Number(process.env.CCO_MAIL_START_WARM_MS || 3000);
const MOBILE_COLD_MS = Number(process.env.CCO_MAIL_START_MOBILE_COLD_MS || 4500);
const SYNC_PILL_MS = Number(process.env.CCO_MAIL_SYNC_PILL_MS || 5000);
const NAV_TIMEOUT_MS = Number(process.env.CCO_MAIL_NAV_TIMEOUT_MS || 90000);

let hardFail = false;

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
}

function warn(name, detail = '') {
  console.log(`WARN: ${name}${detail ? ` — ${detail}` : ''}`);
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

async function waitForLiveThread(page, timeoutMs) {
  await page.waitForFunction(
    () => {
      const selectors = [
        '.thread-card',
        'arcana-thread-card',
        '.warm-row--mobile-compact',
        '.thread-card.unified-queue-card.warm-row',
      ];
      const cards = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
      if (!cards.length) return false;
      return cards.some((card) => {
        const source = card.dataset?.worklistSource || card.getAttribute('data-worklist-source') || '';
        if (source && source.toLowerCase() === 'demo') return false;
        const id = card.dataset?.runtimeThread || card.getAttribute('data-runtime-thread') || '';
        if (id === 'runtime-empty' || id === 'runtime-unified-empty') return false;
        const name =
          card.querySelector('.thread-card-name, [data-thread-name], .warm-row-name, .warm-title')
            ?.textContent || '';
        if (/synkar/i.test(name)) return false;
        return card.getBoundingClientRect().height > 0;
      });
    },
    undefined,
    { timeout: timeoutMs }
  );
}

async function openConversations(page, { warm = false } = {}) {
  const url = `${base}/staff?view=conversations`;
  if (warm) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  } else {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function measureFirstThreadMs(page, { warm = false } = {}) {
  await openConversations(page, { warm });
  const startedAt = Date.now();
  await waitForLiveThread(page, Math.max(COLD_MS + 10000, 15000));
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

async function readSelectedThreadId(page) {
  return page.evaluate(() => {
    const ws = window.__ccoWorkspace;
    const id =
      (typeof ws?.getSelectedThreadId === 'function' && ws.getSelectedThreadId()) ||
      ws?.getState?.()?.selection?.threadId ||
      '';
    return String(id || '').trim();
  });
}

async function selectFirstLiveThread(page) {
  const threadId = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.thread-card, arcana-thread-card'));
    const live = cards.find((card) => {
      const source = card.dataset?.worklistSource || card.getAttribute('data-worklist-source') || '';
      if (source && source.toLowerCase() === 'demo') return false;
      const id = card.dataset?.runtimeThread || card.getAttribute('data-runtime-thread') || '';
      if (id === 'runtime-empty' || id === 'runtime-unified-empty') return false;
      const name = card.querySelector('.thread-card-name, [data-thread-name]')?.textContent || '';
      if (/synkar/i.test(name)) return false;
      return card.getBoundingClientRect().height > 0;
    });
    if (!live) return '';
    live.click();
    return (
      live.dataset?.runtimeThread ||
      live.getAttribute('data-runtime-thread') ||
      live.dataset?.historyConversation ||
      ''
    );
  });
  if (threadId) return threadId;
  await page.waitForTimeout(400);
  return readSelectedThreadId(page);
}

async function measureSyncPillClearMs(page) {
  const startedAt = Date.now();
  try {
    await page.waitForFunction(
      () => {
        const bodyLoading = document.body.classList.contains('is-runtime-loading');
        const syncCards = Array.from(document.querySelectorAll('.thread-card, arcana-thread-card')).filter(
          (card) => {
            const name = card.querySelector('.thread-card-name, [data-thread-name]')?.textContent || '';
            return /synkar/i.test(name);
          }
        );
        return !bodyLoading && syncCards.length === 0;
      },
      undefined,
      { timeout: SYNC_PILL_MS + 3000 }
    );
    return Date.now() - startedAt;
  } catch {
    return SYNC_PILL_MS + 3000;
  }
}

async function runDesktopChecks(page) {
  const coldMs = await measureFirstThreadMs(page, { warm: false });
  record(`Desktop kallstart: första tråd < ${COLD_MS} ms`, coldMs < COLD_MS, `${coldMs} ms`);

  const warmMs = await measureFirstThreadMs(page, { warm: true });
  record(`Desktop warm reload: första tråd < ${WARM_MS} ms`, warmMs < WARM_MS, `${warmMs} ms`);

  const syncMs = await measureSyncPillClearMs(page);
  record(`Sync-pill borta < ${SYNC_PILL_MS} ms`, syncMs < SYNC_PILL_MS, `${syncMs} ms`);

  const selectedBefore = await selectFirstLiveThread(page);
  if (selectedBefore) {
    record('Tråd valbar i kö', true, selectedBefore);
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'commit', timeout: NAV_TIMEOUT_MS });
    await waitForLiveThread(page, 20000);
    const selectedAfter = await readSelectedThreadId(page);
    record('Sparad tråd efter reload', selectedAfter === selectedBefore, `${selectedAfter || 'tom'}`);
  } else {
    warn('Tråd-restore hoppad — ingen valbar live-tråd i kö');
  }

  await page.waitForTimeout(1500);
  const laneAfterSync = await readActiveLane(page);
  record('Lane förblir all efter sync', laneAfterSync === 'all', laneAfterSync);

  const loadingCleared = await page.evaluate(
    () => !document.body.classList.contains('is-runtime-loading')
  );
  record('is-runtime-loading borttagen', loadingCleared);
}

async function runMobileChecks(browser, token) {
  const iphone = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iphone,
    locale: 'sv-SE',
  });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/staff`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await injectToken(page, token);
    await openConversations(page, { warm: false });
    const startedAt = Date.now();
    await waitForLiveThread(page, Math.max(MOBILE_COLD_MS + 15000, 30000));
    const coldMs = Date.now() - startedAt;
    record(
      `Mobil (iPhone 13) kallstart < ${MOBILE_COLD_MS} ms`,
      coldMs < MOBILE_COLD_MS,
      `${coldMs} ms`
    );
    const lane = await readActiveLane(page);
    record('Mobil lane = all', lane === 'all', lane);
  } catch (err) {
    record('Mobil mail-start', false, err.message || String(err));
  } finally {
    await context.close();
  }
}

async function runDesktopChecksWithRetry(page) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    hardFail = false;
    await runDesktopChecks(page);
    if (!hardFail) return;
    if (attempt === 1) {
      warn('Desktop mail-start retry efter timing-fel');
      await page.waitForTimeout(1500);
    }
  }
}

async function main() {
  const token = getStaffToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'sv-SE' });
  const page = await context.newPage();

  try {
    await page.goto(`${base}/staff`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await injectToken(page, token);
    await runDesktopChecksWithRetry(page);
  } finally {
    await context.close();
  }

  await runMobileChecks(browser, token);
  await browser.close();

  if (hardFail) process.exit(1);
  console.log('✅ CCO Mail-lik start verify klar (desktop + mobil)');
}

main().catch((err) => {
  console.error('❌ CCO Mail-lik start verify:', err.message || err);
  process.exit(1);
});
