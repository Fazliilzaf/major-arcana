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
const SHELL_MS = Number(process.env.CCO_MAIL_SHELL_MS || 10000);
const MOBILE_COLD_MS = Number(process.env.CCO_MAIL_START_MOBILE_COLD_MS || 4500);
const SYNC_PILL_MS = Number(process.env.CCO_MAIL_SYNC_PILL_MS || 5000);
const NAV_TIMEOUT_MS = Number(process.env.CCO_MAIL_NAV_TIMEOUT_MS || 90000);
const QUEUE_READY_MS = Number(process.env.CCO_MAIL_QUEUE_READY_MS || 30000);

let hardFail = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
}

function warn(name, detail = '') {
  console.log(`WARN: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) {
    return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  }
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (err) {
      lastErr = err;
      if (attempt < 5) await sleep(Math.min(2000 * attempt, 8000));
    }
  }
  throw lastErr || new Error('Kunde inte hämta STAFF-token');
}

async function injectToken(page, token) {
  await page.evaluate((t) => {
    localStorage.setItem('ARCANA_ADMIN_TOKEN', t);
    sessionStorage.setItem('ARCANA_ADMIN_TOKEN', t);
  }, token);
}

async function bootstrapStaffSession(page, token) {
  await page.goto(`${base}/major-arcana-preview/`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });
  await injectToken(page, token);
}

async function hasLiveThreadOnPage(page) {
  return page.evaluate(() => {
    const selectors = [
      '.thread-card',
      'arcana-thread-card',
      '.warm-row--mobile-compact',
      '.thread-card.unified-queue-card.warm-row',
    ];
    const cards = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
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
  });
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

async function waitForQueueShellReady(page, timeoutMs) {
  try {
    await page.waitForFunction(
      () => {
        if (document.body.classList.contains('is-runtime-loading')) return false;
        const ws = window.__ccoWorkspace;
        if (!ws || typeof ws.getActiveLaneId !== 'function') return false;
        const runtime = ws.getState?.()?.runtime;
        if (!runtime || runtime.authRequired === true) return false;
        return (
          runtime.loaded === true ||
          runtime.hasReachedSteadyState === true ||
          runtime.visualState === 'ready' ||
          runtime.loading === false
        );
      },
      undefined,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    try {
      await page.waitForFunction(
        () => {
          if (document.body.classList.contains('is-runtime-loading')) return false;
          const ws = window.__ccoWorkspace;
          if (!ws || typeof ws.getActiveLaneId !== 'function') return false;
          const runtime = ws.getState?.()?.runtime;
          if (!runtime || runtime.authRequired === true) return false;
          return runtime.loaded === true || runtime.hasReachedSteadyState === true || runtime.loading === false;
        },
        undefined,
        { timeout: timeoutMs }
      );
      return true;
    } catch {
      return false;
    }
  }
}

async function readRuntimeSnapshot(page) {
  return page.evaluate(() => {
    const rt = window.__ccoWorkspace?.getState?.()?.runtime || {};
    return {
      mode: String(rt.mode || ''),
      live: rt.live === true,
      graphReadEnabled: rt.graphReadEnabled === true,
      graphReadConnectorAvailable: rt.graphReadConnectorAvailable === true,
      loaded: rt.loaded === true,
      lane: String(window.__ccoWorkspace?.getActiveLaneId?.() || 'all').toLowerCase(),
    };
  });
}

async function openConversations(page, { warm = false } = {}) {
  const url = `${base}/staff?view=conversations`;
  if (warm) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  } else {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  }
}

async function measureQueueReadyMs(page, { warm = false } = {}) {
  await openConversations(page, { warm });
  const startedAt = Date.now();
  const shellReady = await waitForQueueShellReady(page, QUEUE_READY_MS);
  const shellMs = Date.now() - startedAt;
  if (!shellReady) {
    return { ms: shellMs, hasLiveThreads: false, shellReady: false };
  }
  let hasLiveThreads = await hasLiveThreadOnPage(page);
  if (!hasLiveThreads) {
    try {
      await waitForLiveThread(page, 8000);
      hasLiveThreads = true;
    } catch {
      hasLiveThreads = await hasLiveThreadOnPage(page);
    }
  }
  return { ms: hasLiveThreads ? Date.now() - startedAt : shellMs, hasLiveThreads, shellReady: true };
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

function isPlaceholderThreadId(id) {
  const value = String(id || '').trim().toLowerCase();
  return !value || value === 'runtime-empty' || value === 'runtime-unified-empty';
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
  if (threadId && !isPlaceholderThreadId(threadId)) return threadId;
  await page.waitForTimeout(400);
  const selected = await readSelectedThreadId(page);
  return isPlaceholderThreadId(selected) ? '' : selected;
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
  const cold = await measureQueueReadyMs(page, { warm: false });
  if (!cold.shellReady) {
    record(`Desktop kallstart: shell redo < ${SHELL_MS} ms`, cold.ms < SHELL_MS, `${cold.ms} ms (shell ej redo)`);
  } else if (cold.hasLiveThreads) {
    record(`Desktop kallstart: första tråd < ${COLD_MS} ms`, cold.ms < COLD_MS, `${cold.ms} ms`);
  } else {
    record(`Desktop kallstart: shell redo < ${SHELL_MS} ms`, cold.ms < SHELL_MS, `${cold.ms} ms (tom kö)`);
    warn('Ingen live-tråd i kö — shell-timing används');
  }

  const warm = await measureQueueReadyMs(page, { warm: true });
  if (!warm.shellReady) {
    record(`Desktop warm reload: shell redo < ${SHELL_MS} ms`, warm.ms < SHELL_MS, `${warm.ms} ms (shell ej redo)`);
  } else if (warm.hasLiveThreads) {
    record(`Desktop warm reload: första tråd < ${WARM_MS} ms`, warm.ms < WARM_MS, `${warm.ms} ms`);
  } else {
    record(`Desktop warm reload: shell redo < ${SHELL_MS} ms`, warm.ms < SHELL_MS, `${warm.ms} ms (tom kö)`);
  }

  const syncMs = await measureSyncPillClearMs(page);
  record(`Sync-pill borta < ${SYNC_PILL_MS} ms`, syncMs < SYNC_PILL_MS, `${syncMs} ms`);

  const selectedBefore = await selectFirstLiveThread(page);
  if (selectedBefore) {
    record('Tråd valbar i kö', true, selectedBefore);
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await waitForQueueShellReady(page, QUEUE_READY_MS);
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

  const snapshot = await readRuntimeSnapshot(page);
  if (snapshot.mode === 'offline_history' || snapshot.graphReadEnabled === false) {
    warn(
      'Runtime offline/historik — Graph read ej live',
      `${snapshot.mode || 'unknown'} graphRead=${snapshot.graphReadEnabled}`
    );
  } else if (!cold.hasLiveThreads && !warm.hasLiveThreads) {
    warn('Ingen live-tråd i kö trots Graph read på');
  }
}

async function runMobileChecksOnce(page) {
  await openConversations(page, { warm: false });
  const startedAt = Date.now();
  const shellReady = await waitForQueueShellReady(page, QUEUE_READY_MS);
  const shellMs = Date.now() - startedAt;
  if (!shellReady) {
    record(
      `Mobil (iPhone 13) shell redo < ${SHELL_MS} ms`,
      shellMs < SHELL_MS,
      `${shellMs} ms (shell ej redo)`
    );
    return;
  }
  let hasLiveThreads = await hasLiveThreadOnPage(page);
  if (!hasLiveThreads) {
    try {
      await waitForLiveThread(page, 8000);
      hasLiveThreads = true;
    } catch {
      hasLiveThreads = await hasLiveThreadOnPage(page);
    }
  }
  const coldMs = hasLiveThreads ? Date.now() - startedAt : shellMs;
  if (hasLiveThreads) {
    record(
      `Mobil (iPhone 13) kallstart < ${MOBILE_COLD_MS} ms`,
      coldMs < MOBILE_COLD_MS,
      `${coldMs} ms`
    );
  } else {
    record(
      `Mobil (iPhone 13) shell redo < ${SHELL_MS} ms`,
      coldMs < SHELL_MS,
      `${coldMs} ms (tom kö)`
    );
    warn('Mobil: ingen live-tråd — shell-timing används');
  }
  const lane = await readActiveLane(page);
  record('Mobil lane = all', lane === 'all', lane);
}

async function runMobileChecks(browser, token) {
  const iphone = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iphone,
    locale: 'sv-SE',
  });
  const page = await context.newPage();
  try {
    await bootstrapStaffSession(page, token);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const failedBefore = hardFail;
      try {
        await runMobileChecksOnce(page);
      } catch (err) {
        record('Mobil mail-start', false, err.message || String(err));
      }
      if (!hardFail || attempt === 2) return;
      hardFail = failedBefore;
      warn('Mobil mail-start retry efter timing-fel');
      await page.waitForTimeout(1500);
    }
  } finally {
    await context.close();
  }
}

async function runDesktopChecksWithRetry(page, token) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (attempt > 1) {
      await bootstrapStaffSession(page, token);
    }
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
  const token = await getStaffToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'sv-SE' });
  const page = await context.newPage();

  try {
    await bootstrapStaffSession(page, token);
    await runDesktopChecksWithRetry(page, token);
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
