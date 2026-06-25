/**
 * V12 Customer Workspace · GAP-1 — deep-link → V12-sektion screenshot-/verifierings-
 * generator. Laddar fixturen, klickar en RIKTIG V11-rail-deep-link
 * (data-v9-section-link="upcoming") och verifierar att rätt V12-modul
 * (data-v12-module="bookings") flashas (is-nav-target) — dvs. att deep-linken
 * hoppade till rätt V12-sektion via den riktiga scrollDossierSection. Fångar
 * screenshot på 390 / 820 / 1440.
 *
 * Kör: npm run shots:v12workspace:deeplink   (kräver chromium)
 * Output: docs/handover/MOCKUPS/v12-workspace-deeplink/<viewport>.png
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fixture = pathToFileURL(join(root, 'tests/visual/fixtures/v12-workspace-deeplink.html')).href;
const outDir = join(root, 'docs/handover/MOCKUPS/v12-workspace-deeplink');
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
];

let allOk = true;
const browser = await chromium.launch();
try {
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(fixture, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-v12-module="bookings"]', { timeout: 10000 });

    // Klicka den riktiga rail-deep-linken "upcoming" → ska hoppa till V12 bookings.
    const clicked = await page.evaluate(() => window.__clickRailDeepLink('upcoming'));
    // Verifiera att rätt V12-modul flashades (is-nav-target) av scrollDossierSection.
    const flashedBookings = await page.evaluate(() => {
      const el = document.querySelector('[data-v12-module="bookings"]');
      return !!(el && el.classList.contains('is-nav-target'));
    });
    const ok = clicked === true && flashedBookings === true;
    if (!ok) allOk = false;
    console.log(
      `${vp.name}: rail deep-link "upcoming" clicked=${clicked}, bookings flashed=${flashedBookings} → ${ok ? 'PASS' : 'FAIL'}`
    );

    const out = join(outDir, `${vp.name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`✓ ${vp.name} → ${out}`);
    await page.close();
  }
} finally {
  await browser.close();
}
if (!allOk) {
  console.error('Deep-link verifiering MISSLYCKADES på minst en viewport.');
  process.exit(1);
}
console.log('Klart — deep-link → V12-sektion verifierad på 390/820/1440.');
