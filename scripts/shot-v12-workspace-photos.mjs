/**
 * V12 Customer Workspace · Block 11 — Bilder / före–efter-modul screenshot-generator.
 *
 * Fångar RIKTIGA screenshot-artefakter på 390 / 820 / 1440 från fixturen
 * tests/visual/fixtures/v12-workspace-photos.html i headless chromium.
 *
 * Kör: npm run shots:v12workspace:photos   (kräver chromium)
 * Output: docs/handover/MOCKUPS/v12-workspace-photos/<viewport>.png
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fixture = pathToFileURL(join(root, 'tests/visual/fixtures/v12-workspace-photos.html')).href;
const outDir = join(root, 'docs/handover/MOCKUPS/v12-workspace-photos');
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
];

const browser = await chromium.launch();
try {
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(fixture, { waitUntil: 'networkidle' });
    await page.waitForSelector('.v12-workspace__photos', { timeout: 10000 });
    const out = join(outDir, `${vp.name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`✓ ${vp.name} → ${out}`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('Klart.');
