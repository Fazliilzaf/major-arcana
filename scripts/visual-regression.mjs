#!/usr/bin/env node
'use strict';

/**
 * Visuell regressionssvit för CCO aux-ytor (preview-prototyper).
 *
 *   node scripts/visual-regression.mjs --capture          # skriv lokala baselines
 *   node scripts/visual-regression.mjs --compare          # diffa mot lokala baselines
 *   node scripts/visual-regression.mjs --vs-main          # diffa branch vs main (0 bytes i git)
 *   node scripts/visual-regression.mjs --vs-main --only cco-notiser-v3
 *
 * --vs-main: skapar git worktree för main i /tmp, renderar båda,
 *   diffa pixel-mot-pixel, skriver diff-bilder till test/visual/diffs/.
 *   Inga baselines behöver checkas in.
 */

import { readdirSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';
import playwright from 'playwright';

const { chromium } = playwright;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const PREVIEW = join(REPO, 'public', 'major-arcana-preview');
const BASE_DIR = join(REPO, 'test', 'visual', 'baselines');
const DIFF_DIR = join(REPO, 'test', 'visual', 'diffs');
const WORKTREE = '/tmp/visual-regression-main';

// Use pre-installed container chromium if available (Playwright version may not match).
// Falls back to undefined so Playwright resolves its own managed binary on CI.
const CHROME = existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
  ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  : undefined;

const CHANNEL_TOL = 24;
const MISMATCH_RATIO = 0.004;
const MAX_H = 2400;
const DEFLATE = 9;
const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
];

function parseArgs() {
  const a = process.argv.slice(2);
  const vsMain = a.includes('--vs-main');
  const capture = !vsMain && a.includes('--capture');
  const compare = !vsMain && (a.includes('--compare') || !capture);
  const onlyIdx = a.indexOf('--only');
  const only = onlyIdx >= 0 ? a[onlyIdx + 1] : null;
  return { vsMain, capture, compare, only };
}

function surfaces(previewDir, only) {
  return readdirSync(previewDir)
    .filter((f) => /^cco-.*-v3(-\d)?\.html$/.test(f))
    .filter((f) => (only ? f.includes(only) : true))
    .sort();
}

function keyFor(file, vp) {
  return `${file.replace(/\.html$/, '')}__${vp.id}.png`;
}

async function shoot(page, previewDir, file, vp) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(pathToFileURL(join(previewDir, file)).href, { waitUntil: 'load' });
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
  await page.waitForTimeout(150);
  const contentH = await page.evaluate(() => document.documentElement.scrollHeight);
  const clipH = Math.min(contentH, MAX_H);
  await page.setViewportSize({ width: vp.width, height: clipH });
  await page.waitForTimeout(50);
  const buf = await page.screenshot({ fullPage: false });
  return PNG.sync.read(buf);
}

function pixelDiff(basePng, curPng) {
  if (basePng.width !== curPng.width || basePng.height !== curPng.height) {
    return {
      dimMismatch: true,
      base: `${basePng.width}x${basePng.height}`,
      cur: `${curPng.width}x${curPng.height}`,
    };
  }
  const { width, height } = basePng;
  const total = width * height;
  const out = new PNG({ width, height });
  let changed = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const dr = Math.abs(basePng.data[o] - curPng.data[o]);
    const dg = Math.abs(basePng.data[o + 1] - curPng.data[o + 1]);
    const db = Math.abs(basePng.data[o + 2] - curPng.data[o + 2]);
    const da = Math.abs(basePng.data[o + 3] - curPng.data[o + 3]);
    if (dr > CHANNEL_TOL || dg > CHANNEL_TOL || db > CHANNEL_TOL || da > CHANNEL_TOL) {
      changed++;
      out.data[o] = 255;
      out.data[o + 1] = 0;
      out.data[o + 2] = 80;
      out.data[o + 3] = 255;
    } else {
      const v = (basePng.data[o] + basePng.data[o + 1] + basePng.data[o + 2]) / 3;
      const g = Math.round(v * 0.25 + 191);
      out.data[o] = g;
      out.data[o + 1] = g;
      out.data[o + 2] = g;
      out.data[o + 3] = 255;
    }
  }
  return { changed, total, ratio: changed / total, diffPng: out };
}

function setupWorktree() {
  if (existsSync(WORKTREE)) {
    try { execSync(`git worktree remove --force ${WORKTREE}`, { cwd: REPO, stdio: 'pipe' }); } catch {}
  }
  try {
    execSync(`git worktree add ${WORKTREE} main`, { cwd: REPO, stdio: 'pipe' });
  } catch {
    execSync(`git fetch origin main && git worktree add ${WORKTREE} origin/main`, { cwd: REPO, stdio: 'pipe' });
  }
}

function teardownWorktree() {
  try { execSync(`git worktree remove --force ${WORKTREE}`, { cwd: REPO, stdio: 'pipe' }); } catch {}
}

async function runVsMain(only) {
  setupWorktree();

  const mainPreview = join(WORKTREE, 'public', 'major-arcana-preview');
  const mainSet = new Set(surfaces(mainPreview, only));
  const branchFiles = surfaces(PREVIEW, only);

  const toCompare = branchFiles.filter((f) => mainSet.has(f));
  const newSurfaces = branchFiles.filter((f) => !mainSet.has(f));

  console.log(`== Visual diff (branch vs main) — ${toCompare.length} ytor × ${VIEWPORTS.length} breakpoints ==`);
  if (newSurfaces.length) {
    console.log(`   Nya ytor (saknas i main, hoppar över): ${newSurfaces.join(', ')}`);
  }
  console.log('');

  if (existsSync(DIFF_DIR)) rmSync(DIFF_DIR, { recursive: true, force: true });
  mkdirSync(DIFF_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, ...(CHROME && { executablePath: CHROME }) });
  const context = await browser.newContext({ locale: 'sv-SE', deviceScaleFactor: 1 });
  const page = await context.newPage();

  let failures = 0;
  const failed = [];

  for (const file of toCompare) {
    for (const vp of VIEWPORTS) {
      const key = keyFor(file, vp);
      const base = await shoot(page, mainPreview, file, vp);
      const cur = await shoot(page, PREVIEW, file, vp);
      const r = pixelDiff(base, cur);
      if (r.dimMismatch) {
        console.log(`DIM      ${key}  main=${r.base} branch=${r.cur}`);
        failures++;
        failed.push(`${key} (dimension ${r.base}→${r.cur})`);
        writeFileSync(join(DIFF_DIR, key), PNG.sync.write(cur, { deflateLevel: DEFLATE }));
        continue;
      }
      const pct = (r.ratio * 100).toFixed(3);
      if (r.ratio > MISMATCH_RATIO) {
        console.log(`DRIFT    ${key}  ${pct}% (${r.changed}/${r.total})`);
        failures++;
        failed.push(`${key} (${pct}%)`);
        writeFileSync(join(DIFF_DIR, key), PNG.sync.write(r.diffPng, { deflateLevel: DEFLATE }));
      } else {
        console.log(`OK       ${key}  ${pct}%`);
      }
    }
  }

  await browser.close();
  teardownWorktree();

  const total = toCompare.length * VIEWPORTS.length;
  console.log(`\n${total - failures}/${total} OK`);
  if (failures) {
    console.log(`\n${failures} ytor med drift:`);
    failed.forEach((f) => console.log('  - ' + f));
    console.log(`\nDiff-bilder: ${DIFF_DIR}`);
    process.exit(1);
  }
}

async function runCaptureCompare(capture, compare, only) {
  const files = surfaces(PREVIEW, only);
  if (!files.length) {
    console.error('Inga ytor matchade.');
    process.exit(1);
  }
  mkdirSync(BASE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, ...(CHROME && { executablePath: CHROME }) });
  const context = await browser.newContext({ locale: 'sv-SE', deviceScaleFactor: 1 });
  const page = await context.newPage();

  const mode = capture ? 'CAPTURE' : 'COMPARE';
  console.log(`== Visuell regression (${mode}) — ${files.length} ytor × ${VIEWPORTS.length} breakpoints ==\n`);

  let failures = 0;
  let captured = 0;
  const failed = [];

  if (compare) {
    if (existsSync(DIFF_DIR)) rmSync(DIFF_DIR, { recursive: true, force: true });
    mkdirSync(DIFF_DIR, { recursive: true });
  }

  for (const file of files) {
    for (const vp of VIEWPORTS) {
      const key = keyFor(file, vp);
      const basePath = join(BASE_DIR, key);
      const cur = await shoot(page, PREVIEW, file, vp);

      if (capture) {
        writeFileSync(basePath, PNG.sync.write(cur, { deflateLevel: DEFLATE }));
        captured++;
        continue;
      }

      if (!existsSync(basePath)) {
        console.log(`MISSING  ${key}  — ingen baseline (kör --capture)`);
        failures++;
        failed.push(`${key} (saknar baseline)`);
        continue;
      }
      const base = PNG.sync.read(readFileSync(basePath));
      const r = pixelDiff(base, cur);
      if (r.dimMismatch) {
        console.log(`DIM      ${key}  base=${r.base} cur=${r.cur}`);
        failures++;
        failed.push(`${key} (dimension ${r.base}→${r.cur})`);
        writeFileSync(join(DIFF_DIR, key), PNG.sync.write(cur, { deflateLevel: DEFLATE }));
        continue;
      }
      const pct = (r.ratio * 100).toFixed(3);
      if (r.ratio > MISMATCH_RATIO) {
        console.log(`DRIFT    ${key}  ${pct}% (${r.changed}/${r.total})`);
        failures++;
        failed.push(`${key} (${pct}%)`);
        writeFileSync(join(DIFF_DIR, key), PNG.sync.write(r.diffPng, { deflateLevel: DEFLATE }));
      } else {
        console.log(`OK       ${key}  ${pct}%`);
      }
    }
  }

  await browser.close();

  if (capture) {
    console.log(`\n${captured} baselines skrivna → ${BASE_DIR}`);
    return;
  }
  console.log(`\n${files.length * VIEWPORTS.length - failures}/${files.length * VIEWPORTS.length} OK`);
  if (failures) {
    console.log(`\n${failures} ytor med drift:`);
    failed.forEach((f) => console.log('  - ' + f));
    console.log(`\nDiff-bilder: ${DIFF_DIR}`);
    process.exit(1);
  }
}

async function main() {
  const { vsMain, capture, compare, only } = parseArgs();
  if (vsMain) {
    await runVsMain(only);
  } else {
    await runCaptureCompare(capture, compare, only);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
