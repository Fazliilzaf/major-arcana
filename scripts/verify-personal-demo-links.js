#!/usr/bin/env node
'use strict';

/**
 * verify-personal-demo-links.js — presentation preflight (Välkommen till CCO)
 *
 * Primär start: /cco-demo.html (Välkommen till CCO → Kunder → Kundkort → Journal)
 * Legacy: /cco-personal-start.html (redirect only)
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
const PRIMARY_WELCOME = path.join(REPO, 'public/cco-demo.html');
const SECONDARY_HTML = [
  path.join(REPO, 'public/cco-personal-start.html'),
  path.join(REPO, 'public/cco-staff-go-live-control.html'),
  path.join(REPO, 'public/cco-staff-training-completion.html'),
  path.join(REPO, 'public/cco-ops-workbench.html'),
];
const MANIFEST_PATH = path.join(REPO, 'data/reports/cco-personal-demo-manifest.json');
const PUBLIC_MANIFEST_PATH = path.join(REPO, 'public/cco-personal-demo-manifest.json');
const BASE = process.env.CCO_PERSONAL_DEMO_BASE || 'https://arcana.hairtpclinic.com';
const ROLE = process.env.CCO_PERSONAL_DEMO_ROLE || 'owner';
const PRIMARY_START_URL = '/cco-demo.html';

const BLOCKED_HREF = [
  /drive\.google\.com/i,
  /docs\.google\.com/i,
  /webcal:\/\/localhost/i,
  /example\.com/i,
  /localhost/i,
];
const REDLIST_PATH = [/\/showcase/i, /\/automation/i, /\/watch/i, /\/analytics\.html/i];
/** Forbidden copy on Välkommen-sidan (cco-demo.html) */
const WELCOME_BLOCKED_CLAIMS = [
  /CCO Demo-portal/i,
  /simulerad data/i,
  /alla har simulerad/i,
  /1\s*247\s*demo/i,
  /1\s*247\s*kunder/i,
  /49\s*MSEK/i,
  /full cutover/i,
  /mail.*dagligt verktyg/i,
  /mail-worklist.*dagligt/i,
  /Photo Review klar/i,
  /Aisia live/i,
  /Fortnox kopplat/i,
  /AI används på journal/i,
  /no-show.*färdig/i,
  /triage.*färdigt/i,
  /automation hub.*live/i,
  /watch app.*live/i,
];
const MOCK_HTML = [/847\s*kunder/i, /12\s*no-show/i, /Manifest ej publicerat/i];
const MOCK_HTML_PAUSED_ONLY = [/AI\s*coach/i, /automation\s*hub/i];

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

function pickHtmlPaths() {
  const paths = [];
  if (fs.existsSync(PRIMARY_WELCOME)) paths.push(PRIMARY_WELCOME);
  for (const p of SECONDARY_HTML) {
    if (fs.existsSync(p)) paths.push(p);
  }
  return paths;
}

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

function extractHrefs(html) {
  const hrefs = [];
  const re = /<a[^>]+href="([^"#][^"]*)"/g;
  let m;
  const body = stripScripts(html);
  while ((m = re.exec(body))) hrefs.push(m[1]);
  return [...new Set(hrefs)];
}

function extractDisabledWithHref(html) {
  const out = [];
  const re =
    /<a[^>]*(?:class="[^"]*card--disabled[^"]*"|data-paused=["']true["']|disabled)[^>]*>/gi;
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

function isWelcomePage(htmlPath) {
  return path.basename(htmlPath) === 'cco-demo.html';
}

async function verifyHtmlPage(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const htmlBody = stripScripts(html);
  const hrefs = extractHrefs(html);
  let failed = 0;
  const results = [];

  console.log('\n=== ' + path.basename(htmlPath) + ' ===');
  console.log('Links:', hrefs.length);

  for (const pat of [...BLOCKED_HREF, ...MOCK_HTML]) {
    if (pat.test(htmlBody)) {
      console.log('FAIL  blocked pattern in HTML:', pat);
      failed += 1;
    }
  }

  if (isWelcomePage(htmlPath)) {
    for (const pat of WELCOME_BLOCKED_CLAIMS) {
      if (pat.test(htmlBody)) {
        console.log('FAIL  forbidden claim on welcome page:', pat);
        failed += 1;
      }
    }
    if (/href=["'][^"']*cco-personal-start\.html["']/i.test(htmlBody)) {
      console.log('FAIL  welcome page links to legacy personal-start as main flow');
      failed += 1;
    }
    if (!/href=["'][^"']*\/kunder\.html/i.test(htmlBody)) {
      console.log('FAIL  welcome page missing primary /kunder.html link');
      failed += 1;
    }
  }

  for (const pat of MOCK_HTML_PAUSED_ONLY) {
    if (pat.test(htmlBody) && !/data-paused=["']true["']/i.test(htmlBody)) {
      console.log('FAIL  live-looking blocked pattern in HTML:', pat);
      failed += 1;
    }
  }

  for (const href of extractDisabledWithHref(htmlBody)) {
    console.log('FAIL  disabled element has href:', href);
    failed += 1;
  }

  for (const href of hrefs) {
    const issues = [];
    for (const pat of [...BLOCKED_HREF, ...REDLIST_PATH]) {
      if (pat.test(href)) issues.push(String(pat));
    }

    let status = 0;
    const probeHref = href.split('#')[0];
    if (!probeHref) {
      results.push({ href, status: 0, ok: true, issues: [] });
      continue;
    }
    try {
      const r = await fetchUrl(resolveUrl(probeHref));
      status = r.status;
    } catch (err) {
      issues.push(err.message);
    }

    if (status === 404) issues.push('404');
    if (status >= 500) issues.push('5xx');
    if (status !== 200) issues.push('expected 200, got ' + status);

    const ok = issues.length === 0;
    if (!ok) failed += 1;
    results.push({ href, status, ok, issues });
    console.log(
      (ok ? 'PASS' : 'FAIL') +
        '  ' +
        status +
        '  ' +
        href +
        (issues.length ? ' → ' + issues.join('; ') : '')
    );
  }

  return { htmlPath, results, failed };
}

async function main() {
  const htmlPaths = pickHtmlPaths();
  if (!htmlPaths.some((p) => isWelcomePage(p))) {
    throw new Error('Primär Välkommen-sida saknas: public/cco-demo.html');
  }
  const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { pilotCustomers: [] };
  let failed = 0;
  const pageReports = [];

  console.log('=== verify-presentation-demo-links ===');
  console.log('Base:', BASE);
  console.log('Primary start:', PRIMARY_START_URL);
  console.log('Pages:', htmlPaths.map((p) => path.basename(p)).join(', '));

  if (manifest.primaryStartUrl && manifest.primaryStartUrl !== PRIMARY_START_URL) {
    console.log(
      'FAIL  manifest primaryStartUrl is not',
      PRIMARY_START_URL,
      'got',
      manifest.primaryStartUrl
    );
    failed += 1;
  }

  for (const htmlPath of htmlPaths) {
    const report = await verifyHtmlPage(htmlPath);
    pageReports.push(report);
    failed += report.failed;
  }

  console.log('\n--- public manifest ---');
  try {
    const manifestUrl = resolveUrl('/cco-personal-demo-manifest.json');
    const r = await fetchUrl(manifestUrl);
    const ok = r.status === 200;
    if (!ok) failed += 1;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + r.status + '  /cco-personal-demo-manifest.json');
    if (ok && fs.existsSync(PUBLIC_MANIFEST_PATH)) {
      const local = JSON.parse(fs.readFileSync(PUBLIC_MANIFEST_PATH, 'utf8'));
      const pilots = local.pilotCustomers?.length || 0;
      if (pilots < 3) {
        failed += 1;
        console.log('FAIL  manifest has fewer than 3 pilotCustomers');
      }
      if (local.primaryStartUrl !== PRIMARY_START_URL) {
        failed += 1;
        console.log('FAIL  public manifest primaryStartUrl:', local.primaryStartUrl);
      }
    }
  } catch (err) {
    failed += 1;
    console.log('FAIL  manifest  ' + err.message);
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
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base: BASE,
        primaryStartUrl: PRIMARY_START_URL,
        pageReports,
        failed,
      },
      null,
      2
    )
  );
  console.log('\nReport:', reportPath);
  console.log(failed === 0 ? '\n✓ ALL PASS' : '\n✗ FAILURES: ' + failed);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
