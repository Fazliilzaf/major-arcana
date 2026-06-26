#!/usr/bin/env node
'use strict';

/**
 * Visuell regressionssvit för CCO aux-ytor (preview-prototyper).
 *
 *   node scripts/visual-regression.mjs --capture        # skriv baselines
 *   node scripts/visual-regression.mjs --compare        # diffa mot baselines (exit 1 vid drift)
 *   node scripts/visual-regression.mjs --compare --only cco-notiser-v3
 *
 * Renderar varje yta i {desktop 1440, mobil 390}, tar helsidesbild och
 * jämför pixel-mot-pixel mot incheckad baseline med pngjs (ingen extern
 * diff-dependency). Skriver diff-bilder för fall som överskrider tröskeln.
 *
 * Tröskel: en pixel räknas som ändrad om någon RGBA-kanal skiljer >CHANNEL_TOL.
 * Hela ytan underkänns om andelen ändrade pixlar > MISMATCH_RATIO.
 */

import { readdirSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import playwright from 'playwright';

const { chromium } = playwright;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const PREVIEW = join(REPO, 'public', 'major-arcana-preview');
const BASE_DIR = join(REPO, 'test', 'visual', 'baselines');
const DIFF_DIR = join(REPO, 'test', 'visual', 'diffs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Konfig
const CHANNEL_TOL = 24; // tolerans per RGBA-kanal (anti-aliasing/subpixel)
const MISMATCH_RATIO = 0.004; // 0.4% av pixlarna får skilja innan en yta underkänns
const MAX_H = 2400; // tak för bildhöjd (≈2.5 skärmar) — håller baselines lätta i git
const DEFLATE = 9; // max PNG-komprimering
const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
];

function args() {
  const a = process.argv.slice(2);
  const capture = a.includes('--capture');
  const compare = a.includes('--compare') || !capture;
  const onlyIdx = a.indexOf('--only');
  const only = onlyIdx >= 0 ? a[onlyIdx + 1] : null;
  return { capture, compare, only };
}

function surfaces(only) {
  return readdirSync(PREVIEW)
    .filter((f) => /^cco-.*-v3(-\d)?\.html$/.test(f))
    .filter((f) => (only ? f.includes(only) : true))
    .sort();
}

function keyFor(file, vp) {
  return `${file.replace(/\.html$/, '')}__${vp.id}.png`;
}

async function shoot(page, file, vp) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(pathToFileURL(join(PREVIEW, file)).href, { waitUntil: 'load' });
  // Stabilisera: stoppa ev. animationer/övergångar och vänta in layout.
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
  await page.waitForTimeout(150);
  // Bunden höjd: fånga topp MAX_H px av ytan (täcker komponent-primitiverna,
  // håller baselines lätta). Lägre än taket om sidan är kortare.
  const contentH = await page.evaluate(() => document.documentElement.scrollHeight);
  const clipH = Math.min(contentH, MAX_H);
  await page.setViewportSize({ width: vp.width, height: clipH });
  await page.waitForTimeout(50);
  const buf = await page.screenshot({ fullPage: false });
  return PNG.sync.read(buf);
}

// Returnerar { changed, total, ratio, diffPng } eller dimensionsavvikelse.
function diff(basePng, curPng) {
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
    const isChanged = dr > CHANNEL_TOL || dg > CHANNEL_TOL || db > CHANNEL_TOL || da > CHANNEL_TOL;
    if (isChanged) {
      changed++;
      out.data[o] = 255;
      out.data[o + 1] = 0;
      out.data[o + 2] = 80;
      out.data[o + 3] = 255;
    } else {
      // dämpad gråskala-bakgrund för kontext
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

async function main() {
  const { capture, compare, only } = args();
  const files = surfaces(only);
  if (!files.length) {
    console.error('Inga ytor matchade.');
    process.exit(1);
  }
  mkdirSync(BASE_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
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
      const cur = await shoot(page, file, vp);

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
      const r = diff(base, cur);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
