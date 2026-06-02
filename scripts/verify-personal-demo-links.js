#!/usr/bin/env node
'use strict';

/**
 * verify-personal-demo-links.js — preflight för personal-start-sida
 *
 * Kontrollerar:
 * - alla <a href> i sidan
 * - status 200 (sidor) eller förväntat auth-svar för API
 * - inga 404 / 5xx
 * - inga webcal://localhost, Drive-länkar, mock/redlist-paths
 * - disabled kort får inte ha aktiv href
 * - manifest pilotkunder: feed + timeline + forms
 *
 * Kör:
 *   node scripts/verify-personal-demo-links.js
 *   CCO_PERSONAL_DEMO_BASE=https://arcana.hairtpclinic.com node scripts/verify-personal-demo-links.js
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const REPO = path.join(__dirname, '..');
const HTML_CANDIDATES = [
  path.join(REPO, 'public/cco-personal-start.html'),
  path.join(REPO, 'public/personal-demo.html'),
];
const MANIFEST_PATH = path.join(REPO, 'data/reports/cco-personal-demo-manifest.json');
const BASE = process.env.CCO_PERSONAL_DEMO_BASE || 'https://arcana.hairtpclinic.com';
const ROLE = process.env.CCO_PERSONAL_DEMO_ROLE || 'owner';

const BLOCKED_HREF = [
  /drive\.google\.com/i,
  /docs\.google\.com/i,
  /webcal:\/\/localhost/i,
  /example\.com/i,
  /localhost/i,
];
const REDLIST_PATH = [/cco-demo\.html/i, /\/showcase/i, /\/automation/i, /\/watch/i, /\/analytics\.html/i];

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(
      url,
      {
        method: opts.method || 'GET',
        headers: {
          'x-cco-role': ROLE,
          'x-cco-tenant': 'hairtpclinic',
          ...(opts.headers || {}),
        },
        timeout: 15000,
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode || 0, url });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function pickHtmlPath() {
  for (const p of HTML_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Ingen personal-demo HTML hittades');
}

function extractHrefs(html) {
  const hrefs = [];
  const re = /<a[^>]+href="([^"#][^"]*)"/g;
  let m;
  while ((m = re.exec(html))) hrefs.push(m[1]);
  return [...new Set(hrefs)];
}

function extractDisabledWithHref(html) {
  const out = [];
  const re = /<a[^>]*(?:class="[^"]*card--disabled[^"]*"|data-paused=["']true["']|disabled)[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const hrefMatch = /href=["']([^"']+)["']/.exec(m[0]);
    if (hrefMatch?.[1] && !hrefMatch[1].startsWith('#')) out.push(hrefMatch[1]);
  }
  return out;
}

function resolveUrl(href) {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return BASE.replace(/\/$/, '') + href;
  return BASE.replace(/\/$/, '') + '/' + href;
}

async function main() {
  const htmlPath = pickHtmlPath();
  const html = fs.readFileSync(htmlPath, 'utf8');
  const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { pilotCustomers: [] };
  const hrefs = extractHrefs(html);
  let failed = 0;
  const results = [];

  console.log('=== verify-personal-demo-links ===');
  console.log('Base:', BASE);
  console.log('HTML:', htmlPath);
  console.log('Links:', hrefs.length);
  console.log('');

  for (const pat of BLOCKED_HREF) {
    if (pat.test(html)) {
      console.log('FAIL  blocked pattern in HTML:', pat);
      failed += 1;
    }
  }

  for (const href of extractDisabledWithHref(html)) {
    console.log('FAIL  disabled element has href:', href);
    failed += 1;
  }

  for (const href of hrefs) {
    const issues = [];
    for (const pat of [...BLOCKED_HREF, ...REDLIST_PATH]) {
      if (pat.test(href)) issues.push(String(pat));
    }

    let status = 0;
    try {
      const r = await fetchUrl(resolveUrl(href.split('#')[0]));
      status = r.status;
    } catch (err) {
      issues.push(err.message);
    }

    if (status === 404) issues.push('404');
    if (status >= 500) issues.push('5xx');
    if (status !== 200 && status !== 404 && status < 500) {
      /* pages only — auth not expected on static html */
    }
    if (status !== 200) issues.push('expected 200, got ' + status);

    const ok = issues.length === 0;
    if (!ok) failed += 1;
    results.push({ href, status, ok, issues });
    console.log(
      (ok ? 'PASS' : 'FAIL') + '  ' + status + '  ' + href + (issues.length ? ' → ' + issues.join('; ') : '')
    );
  }

  console.log('\n--- pilot customers ---');
  for (const p of manifest.pilotCustomers || []) {
    const feedUrl = resolveUrl(
      '/api/v1/cco-customers/' + p.customerId + '/journal-feed?tenantId=hairtpclinic'
    );
    const tlUrl = resolveUrl(
      '/api/v1/cco-customers/' + p.customerId + '/journal-timeline?tenantId=hairtpclinic'
    );
    const formsUrl = resolveUrl(
      '/api/v1/cco-forms/patient/' + p.customerId + '/missing?treatment=fue&tenantId=hairtpclinic'
    );
    try {
      const [feed, tl, forms] = await Promise.all([
        fetchUrl(feedUrl),
        fetchUrl(tlUrl),
        fetchUrl(formsUrl),
      ]);
      const ok = feed.status === 200 && tl.status === 200 && forms.status === 200;
      if (!ok) failed += 1;
      console.log(
        (ok ? 'PASS' : 'FAIL') +
          '  ' +
          p.redactedLabel +
          '  feed=' +
          feed.status +
          ' timeline=' +
          tl.status +
          ' forms=' +
          forms.status
      );
    } catch (err) {
      failed += 1;
      console.log('FAIL  ' + p.redactedLabel + '  ' + err.message);
    }
  }

  const reportPath = path.join(REPO, 'data/reports/cco-personal-demo-preflight.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, htmlPath, results, failed }, null, 2)
  );
  console.log('\nReport:', reportPath);
  console.log(failed === 0 ? '\n✓ ALL PASS' : '\n✗ FAILURES: ' + failed);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
