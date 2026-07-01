#!/usr/bin/env node
/**
 * K38 local link sanity check for customer portal/offert.
 * Verifies the URLs a human should open before sharing screenshots or reviewing locally.
 */
const http = require('node:http');
const https = require('node:https');

const DEFAULT_BASE = 'http://127.0.0.1:3100';

const checks = [
  {
    label: 'Offertdemo',
    path: '/customer-quote.html',
    mustInclude: ['Din offert', 'Betänketid', 'hårsäckar'],
  },
  {
    label: 'Kundportal preview',
    path: '/major-arcana-preview/cco-patient-offer-portal-v3.html',
    mustInclude: ['Din portal', 'Betänketid', 'hårsäckar'],
  },
  {
    label: 'Staff/kundvy',
    path: '/staff?view=customers',
    mustInclude: ['Kunder'],
  },
];

function normalizeBase(raw) {
  const base = String(raw || DEFAULT_BASE)
    .trim()
    .replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) {
    throw new Error(`BASE måste börja med http:// eller https://. Fick: ${base}`);
  }
  if (/^file:/i.test(base)) {
    throw new Error(
      'file:// kan inte användas för live API/fetch. Starta servern och använd http://127.0.0.1:3100.'
    );
  }
  return base;
}

function fetchText(url) {
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, { timeout: 10000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          text: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout vid ${url}`));
    });
    req.on('error', reject);
  });
}

async function checkUrl(base, check) {
  const url = `${base}${check.path}`;
  const result = await fetchText(url);
  if (result.status !== 200) {
    throw new Error(`${check.label}: ${url} gav HTTP ${result.status}`);
  }
  for (const needle of check.mustInclude) {
    if (!result.text.includes(needle)) {
      throw new Error(`${check.label}: saknar "${needle}" i HTML`);
    }
  }
  return { ...check, url, status: result.status };
}

async function main() {
  const base = normalizeBase(process.env.BASE || process.env.ARCANA_LOCAL_URL || DEFAULT_BASE);
  const results = [];
  for (const check of checks) {
    results.push(await checkUrl(base, check));
  }

  console.log('K38 customer portal local links: PASS');
  for (const result of results) {
    console.log(`- ${result.label}: ${result.url}`);
  }
}

main().catch((error) => {
  console.error(`FAIL customer portal local links: ${error.message || error}`);
  console.error('Starta servern med: npm run dev:offline');
  console.error(`Öppna sedan: ${DEFAULT_BASE}/customer-quote.html`);
  process.exit(1);
});
