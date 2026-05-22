'use strict';

async function renderHtmlToPdfBuffer(html, options = {}) {
  let browser;
  try {
    const playwright = require('playwright');
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: options.viewport || { width: 1280, height: 1800 },
    });
    await page.setContent(String(html || ''), { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => {
      const doc = globalThis.document;
      if (doc?.fonts?.ready) {
        await doc.fonts.ready;
      }
    });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: {
        top: '14mm',
        right: '14mm',
        bottom: '14mm',
        left: '14mm',
      },
      ...(options.pdfOptions && typeof options.pdfOptions === 'object' ? options.pdfOptions : {}),
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  renderHtmlToPdfBuffer,
};
