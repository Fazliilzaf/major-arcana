#!/usr/bin/env node
/* global document, window */
/**
 * K36 local QA for customer portal/offert.
 * Verifies mobile, iPad and desktop rendering without customer writes or real token traffic.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

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

function createServer() {
  return http.createServer(serveStatic);
}

function assertNoOverflow(name, metrics) {
  const overflow = Math.max(metrics.docScrollWidth, metrics.bodyScrollWidth) - metrics.innerWidth;
  if (overflow > 2) {
    throw new Error(`${name}: horizontal overflow ${overflow}px`);
  }
}

async function evaluatePortal(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const doc = document.documentElement;
    const body = document.body;
    const banner = document.querySelector('[data-staff-preview-banner]');
    const visible = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return (
        box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      );
    };
    const renderedPanel = (selector) => {
      const node = document.querySelector(selector);
      if (!node || node.hidden) return false;
      return (
        Boolean(node.textContent.trim()) || node.querySelector('a, img, li, .portal-photo-card')
      );
    };
    return {
      innerWidth: window.innerWidth,
      docScrollWidth: doc.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      lang: doc.getAttribute('lang'),
      staffPreview: doc.dataset.staffPreview,
      title: document.title,
      hasBanner: Boolean(banner && !banner.hidden && visible('[data-staff-preview-banner]')),
      hasJourney: visible('.journey'),
      hasShareAction: visible('[data-sticky-sign-title]') || visible('[data-next-action-button]'),
      hasPhotos: renderedPanel('[data-portal-photos-panel]'),
      hasFiles: renderedPanel('[data-portal-files-panel]'),
      hasSwedishCopy:
        /Betänketid/.test(text) &&
        /hårsäckar/.test(text) &&
        /Ritade konsultationsbilder/.test(text) &&
        /Din portal är säkrad/.test(text),
      englishLeak: /\b(Download|Next step|Customer portal|Sign offer|Open document)\b/.test(text),
    };
  });
}

async function checkCustomerPortal(baseURL, viewport) {
  const browser = await chromium.launch({ headless: true });
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
    await page.goto('/major-arcana-preview/cco-patient-offer-portal-v3.html', {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('[data-staff-preview-banner]', { timeout: 10000 });
    const metrics = await evaluatePortal(page);
    assertNoOverflow(`customer portal ${viewport.name}`, metrics);
    if (metrics.lang !== 'sv') throw new Error(`${viewport.name}: expected html lang sv`);
    if (!metrics.hasBanner || metrics.staffPreview !== 'true') {
      throw new Error(`${viewport.name}: staff preview banner not active`);
    }
    if (!metrics.hasJourney) throw new Error(`${viewport.name}: journey not visible`);
    if (!metrics.hasShareAction) throw new Error(`${viewport.name}: share/sign action not visible`);
    if (!metrics.hasPhotos) throw new Error(`${viewport.name}: photo panel not visible`);
    if (!metrics.hasFiles) throw new Error(`${viewport.name}: file panel not visible`);
    if (!metrics.hasSwedishCopy) throw new Error(`${viewport.name}: missing Swedish portal copy`);
    if (metrics.englishLeak) throw new Error(`${viewport.name}: unexpected English UI copy`);
    console.log(
      `PASS customer portal ${viewport.name}: ${metrics.innerWidth}px · staff preview · overflow 0`
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

async function checkQuoteDemo(baseURL, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL,
    locale: 'sv-SE',
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  try {
    await page.goto('/customer-quote.html', { waitUntil: 'networkidle' });
    const metrics = await page.evaluate(() => {
      const text = document.body.innerText;
      const doc = document.documentElement;
      return {
        innerWidth: window.innerWidth,
        docScrollWidth: doc.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        hasSwedishCopy:
          /Betänketid/.test(text) && /hårsäckar/.test(text) && /Din offert/.test(document.title),
        hasSafeJourney: Boolean(document.querySelector('.journey')),
      };
    });
    assertNoOverflow(`quote demo ${viewport.name}`, metrics);
    if (!metrics.hasSwedishCopy)
      throw new Error(`${viewport.name}: quote demo missing Swedish copy`);
    if (!metrics.hasSafeJourney) throw new Error(`${viewport.name}: quote journey missing`);
    console.log(`PASS quote demo ${viewport.name}: ${metrics.innerWidth}px · overflow 0`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    for (const viewport of viewports) {
      await checkCustomerPortal(baseURL, viewport);
      await checkQuoteDemo(baseURL, viewport);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`FAIL customer portal responsive QA: ${error.message || error}`);
  process.exit(1);
});
