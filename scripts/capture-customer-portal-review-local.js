#!/usr/bin/env node
/* global document, window */
/**
 * K40 local screenshot evidence for customer portal/offert.
 * Captures mobile, iPad and desktop PNGs without customer writes or real token traffic.
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const outDir = process.env.OUT_DIR || path.join(os.tmpdir(), 'major-arcana-customer-portal-k40');

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'ipad', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 940 },
];

const portalContext = {
  staffPreview: true,
  quoteStatus: 'sent',
  esignStatus: 'pending',
  offerDocumentPdfUrl: '/assets/demo-offer.pdf',
  offerDocumentUrl: '/assets/demo-offer.html',
  coolingOff: {
    active: true,
    remainingDays: 5,
    endsAt: '2030-07-04T12:00:00.000Z',
  },
  portalPhotos: [
    {
      label: 'Konsultationsbild framifrån',
      href: '/major-arcana-preview/assets/placeholder-scalp-front.svg',
      takenAt: '2030-06-29',
      hasAnnotation: true,
    },
  ],
  portalFiles: [
    {
      label: 'Offertunderlag',
      href: '/assets/demo-offer.pdf',
      type: 'pdf',
      format: 'PDF',
    },
  ],
  trustLog: {
    statusLabel: 'Preview',
    sharingLabel: 'Klinikpreview',
  },
};

const offerPlan = {
  schemaVersion: 'offer-plan.v1',
  customerName: 'Amina Larsson',
  treatment: 'Hårtransplantation DHI',
  method: 'DHI',
  zones: [
    { key: 'hairline', label: 'Hårlinje', grafts: 500 },
    { key: 'mid', label: 'Mittparti', grafts: 1000 },
    { key: 'crown', label: 'Krona', grafts: 2000 },
  ],
  totalGrafts: 3500,
  price: {
    gross: 59000,
    discount: 5000,
    total: 54000,
    currency: 'SEK',
  },
  planningNote: 'Planering från konsultation och ritade bilder.',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(publicDir, safePath === '/' ? 'customer-quote.html' : safePath);
  if (
    !filePath.startsWith(publicDir) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const ext = path.extname(filePath);
  const type =
    ext === '.html'
      ? 'text/html; charset=utf-8'
      : ext === '.css'
        ? 'text/css; charset=utf-8'
        : ext === '.js'
          ? 'application/javascript; charset=utf-8'
          : ext === '.svg'
            ? 'image/svg+xml'
            : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  fs.createReadStream(filePath).pipe(res);
}

async function capturePage(browser, baseURL, viewport, target) {
  const context = await browser.newContext({
    baseURL,
    locale: 'sv-SE',
    viewport: { width: viewport.width, height: viewport.height },
  });
  await context.addInitScript(
    ({ contextData, planData }) => {
      window.ARCANA_CUSTOMER_OFFER_CONTEXT = contextData;
      window.ARCANA_CUSTOMER_OFFER_PLAN = planData;
    },
    { contextData: portalContext, planData: offerPlan }
  );

  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  try {
    await page.goto(target.path, { waitUntil: 'networkidle' });
    if (target.waitFor) await page.waitForSelector(target.waitFor, { timeout: 10000 });
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
      text: document.body.innerText,
    }));
    if (metrics.overflow > 2) {
      throw new Error(`${target.key} ${viewport.name}: horizontal overflow ${metrics.overflow}px`);
    }
    if (!target.mustInclude.every((needle) => metrics.text.includes(needle))) {
      throw new Error(`${target.key} ${viewport.name}: missing expected Swedish review copy`);
    }
    const outPath = path.join(outDir, `${target.key}-${viewport.name}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`CAPTURE ${target.key} ${viewport.name}: ${outPath}`);
    return outPath;
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const targets = [
    {
      key: 'customer-portal',
      path: '/major-arcana-preview/cco-patient-offer-portal-v3.html',
      waitFor: '[data-staff-preview-banner]',
      mustInclude: ['Betänketid', 'hårsäckar', 'Din portal är säkrad'],
    },
    {
      key: 'quote-demo',
      path: '/customer-quote.html',
      mustInclude: ['Betänketid', 'hårsäckar', 'behandlingsoffert'],
    },
  ];

  try {
    for (const viewport of viewports) {
      for (const target of targets) {
        await capturePage(browser, baseURL, viewport, target);
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`K40 customer portal screenshots: PASS (${outDir})`);
}

main().catch((error) => {
  console.error(`FAIL customer portal screenshots: ${error.message || error}`);
  process.exit(1);
});
