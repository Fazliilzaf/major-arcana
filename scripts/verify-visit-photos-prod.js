#!/usr/bin/env node
'use strict';

/* eslint-disable no-undef -- page.evaluate() callbacks run in the browser */

/**
 * Prod read-only verify: bilder per besök i V11 rail + V12 workspace overlay.
 *   node scripts/verify-visit-photos-prod.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveProdAuthToken, normalizeBase } = require('./lib/resolve-prod-auth-token');

const BASE = normalizeBase(process.env.ARCANA_PROD_URL || process.env.ARCANA_BASE_URL);
const PATIENT_ID = String(
  process.env.VERIFY_VISIT_PATIENT_ID || '50b39b3c-6b6c-46b1-990b-72e2aeead59e'
).trim();
const OUT_DIR = path.join(__dirname, '..', 'data', 'reports', 'visit-photos-prod');

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-834', width: 834, height: 1194 },
  { name: 'desktop-1024', width: 1024, height: 900 },
];

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

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function waitForDeploy(token, expectedPrefix) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const { status, body } = await fetchJson(`${BASE}/api/v1/_diag/version`, token);
    const commit = String(body?.commit || '').slice(0, 8);
    if (status === 200 && (!expectedPrefix || commit.startsWith(expectedPrefix.slice(0, 8)))) {
      return commit;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error('Deploy timeout');
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

async function dismissTour(page) {
  const skip = page.locator('.arcana-tour-btn--ghost, .arcana-tour-btn--next').first();
  for (let i = 0; i < 6; i += 1) {
    if (!(await page.locator('.arcana-tour-card').count())) return;
    if (await skip.count()) {
      await skip.click({ timeout: 3000 }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => {
    document
      .querySelectorAll('.arcana-tour-overlay, .arcana-tour-card, .arcana-tour-spotlight')
      .forEach((el) => {
        el.remove();
      });
  });
}

async function openV12BesokModule(page) {
  await dismissTour(page);
  await page.waitForSelector('[data-v11-rk-besok-sec]:not([hidden])', { timeout: 120000 });
  await page.evaluate(() => {
    const link =
      document.querySelector('[data-v11-rk-besok] .v11-rk__visit-open') ||
      document.querySelector('[data-v9-section-link="besok-tillfallen"]');
    link?.scrollIntoView({ block: 'center', inline: 'nearest' });
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('[data-v12-workspace-shell="1"]', {
    timeout: 120000,
    state: 'attached',
  });
  await page.waitForTimeout(1500);
}

async function waitForDetail(page, patientId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate((pid) => {
      const rt = window.ArcanaPatientMasterUi?.getRuntime?.();
      const rail = document.querySelector('[data-patient-master-rail]');
      const hidden = rail ? rail.hidden || rail.getAttribute('aria-hidden') === 'true' : true;
      return {
        selected: rt?.selectedPatientId || '',
        hasDetail: Boolean(rt?.detail?.card),
        railHidden: hidden,
      };
    }, patientId);
    if (state.hasDetail && state.selected === patientId && !state.railHidden) return state;
    await page.waitForTimeout(1500);
  }
  throw new Error('Kundkort laddades inte');
}

async function waitForDecodedImages(selector, page, timeoutMs = 180000) {
  await page.waitForFunction(
    (sel) => {
      const imgs = [...document.querySelectorAll(sel)];
      if (!imgs.length) return false;
      return imgs.every((img) => img.complete && img.naturalWidth > 0);
    },
    selector,
    { timeout: timeoutMs }
  );
}

async function auditVisitPhotos(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-patient-master-rail]');
    const besok = rail?.querySelector('[data-v11-rk-besok]');
    const v11Tiles = Array.from(
      besok?.querySelectorAll('.photo-tile img[data-patient-file-id]') || []
    );
    const v11Loaded = v11Tiles.filter((img) => {
      const src = String(img.currentSrc || img.src || '');
      return src.startsWith('blob:') && img.naturalWidth > 0;
    });
    const v11Broken = v11Tiles.filter((img) => img.classList.contains('is-broken'));
    const v11Drive = Array.from(
      besok?.querySelectorAll('[href*="drive.google"], [src*="drive.google"]') || []
    );

    const v12Root =
      document.querySelector(
        '[data-v9-dossier-deep]:not([hidden]) [data-v12-visit-segments="1"]'
      ) || document.querySelector('[data-v12-visit-segments="1"]');
    const v12Tiles = Array.from(
      v12Root?.querySelectorAll('img[data-patient-file-id], video[data-patient-file-id]') || []
    );
    const v12Loaded = v12Tiles.filter((img) => {
      const src = String(img.currentSrc || img.src || '');
      return src.startsWith('blob:') && (img.tagName !== 'IMG' || img.naturalWidth > 0);
    });
    const v12Drive = Array.from(
      v12Root?.querySelectorAll('[href*="drive.google"], [src*="drive.google"]') || []
    );

    const v11Occasions = besok ? besok.querySelectorAll('.hist-row').length : 0;
    const v12Occasions = v12Root ? v12Root.querySelectorAll('.v12-canon-visit-segment').length : 0;

    return {
      v11Occasions,
      v11PhotoTiles: v11Tiles.length,
      v11Loaded: v11Loaded.length,
      v11Broken: v11Broken.length,
      v11DriveLinks: v11Drive.length,
      v12Occasions,
      v12PhotoTiles: v12Tiles.length,
      v12Loaded: v12Loaded.length,
      v12DriveLinks: v12Drive.length,
    };
  });
}

async function runViewport(browser, token, viewport, commit) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  await context.addInitScript((authToken) => {
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', authToken);
    window.sessionStorage.setItem('ARCANA_ADMIN_TOKEN', authToken);
    // Visual evidence must show the customer product, not the first-run tour.
    window.localStorage.setItem('cco.onboardingTour.v1', 'done');
  }, token);

  const page = await context.newPage();
  const url = `${BASE}/staff?view=customers&v9=on&v12workspace=on&patientId=${encodeURIComponent(PATIENT_ID)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await ensurePatientOpen(page, PATIENT_ID);
  await waitForDetail(page, PATIENT_ID);
  await dismissTour(page);
  await page.waitForFunction(() => document.querySelector('[data-v11-rk-besok] .hist-row'), {
    timeout: 120000,
  });
  await waitForDecodedImages('[data-v11-rk-besok] img[data-patient-file-id]', page);

  const v11Shot = path.join(OUT_DIR, `${viewport.name}-v11-besok-${commit}.png`);
  const besokSec = page.locator('[data-v11-rk-besok]');
  if (await besokSec.count()) {
    await besokSec.first().scrollIntoViewIfNeeded();
    await besokSec.first().screenshot({ path: v11Shot });
  } else {
    await page.locator('[data-patient-master-rail]').first().screenshot({ path: v11Shot });
  }

  await openV12BesokModule(page);
  await page.waitForSelector('[data-v12-visit-segments="1"]', {
    timeout: 120000,
    state: 'attached',
  });
  await waitForDecodedImages('[data-v12-visit-segments="1"] img[data-patient-file-id]', page);

  const v12Shot = path.join(OUT_DIR, `${viewport.name}-v12-besok-${commit}.png`);
  const v12Block = page.locator('[data-v12-visit-segments="1"]').first();
  if (await v12Block.count()) {
    await v12Block.scrollIntoViewIfNeeded();
    await v12Block.screenshot({ path: v12Shot });
  } else {
    await page.locator('[data-v9-dossier-deep]').first().screenshot({ path: v12Shot });
  }

  const metrics = await auditVisitPhotos(page);
  await context.close();
  return { viewport: viewport.name, metrics, shots: { v11: v11Shot, v12: v12Shot } };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const token = await resolveProdAuthToken({ baseUrl: BASE, preferOwner: true });
  const expectedCommit = String(process.env.VERIFY_EXPECT_COMMIT || '').trim();
  const commit = expectedCommit
    ? await waitForDeploy(token, expectedCommit)
    : String((await fetchJson(`${BASE}/api/v1/_diag/version`, token)).body?.commit || '').slice(
        0,
        8
      );

  const api = await fetchJson(
    `${BASE}/api/v1/cco-patient-master/patient/visit-segments?patientId=${encodeURIComponent(PATIENT_ID)}&includeDriveFiles=1`,
    token
  );
  const segments = Array.isArray(api.body?.visitSegments) ? api.body.visitSegments : [];
  const dated = segments.filter((s) => s?.date);
  const imageCount = dated.reduce((sum, s) => sum + (s.images?.length || 0), 0);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of VIEWPORTS) {
      results.push(await runViewport(browser, token, viewport, commit));
    }
  } finally {
    await browser.close();
  }

  const report = {
    ok: true,
    at: new Date().toISOString(),
    base: BASE,
    commit,
    patientId: PATIENT_ID,
    api: { segments: segments.length, dated: dated.length, images: imageCount },
    viewports: results,
  };

  for (const row of results) {
    const m = row.metrics;
    const pass =
      m.v11PhotoTiles > 0 &&
      m.v11Loaded === m.v11PhotoTiles &&
      m.v11Broken === 0 &&
      m.v11DriveLinks === 0 &&
      m.v12PhotoTiles > 0 &&
      m.v12Loaded === m.v12PhotoTiles &&
      m.v12DriveLinks === 0 &&
      m.v11Occasions === 1 &&
      m.v12Occasions === dated.length;
    row.pass = pass;
    if (!pass) report.ok = false;
  }

  const outJson = path.join(OUT_DIR, `visit-photos-${commit}.json`);
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
