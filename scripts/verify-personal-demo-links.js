#!/usr/bin/env node
/**
 * verify-personal-demo-links.js
 *
 * Preflight-skript för personal-demo.html. Kontrollerar:
 *  - alla href:s i sidan
 *  - status 200 eller expected auth response (401/403/400)
 *  - inga 404
 *  - inga webcal://localhost
 *  - inga Drive-länkar
 *  - inga externa mock-länkar
 *  - inga disabled kort med href
 *
 * Kör:
 *   node scripts/verify-personal-demo-links.js [--base=https://arcana.hairtpclinic.com]
 *
 * Exit-kod 0 om allt OK, 1 om något fel.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const args = process.argv.slice(2);
const baseArg = args.find((a) => a.startsWith('--base='));
const BASE = baseArg ? baseArg.split('=')[1] : 'https://arcana.hairtpclinic.com';

const SOURCE_FILE = path.join(__dirname, '..', 'public', 'personal-demo.html');

function probe(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      headers: { 'User-Agent': 'arcana-personal-demo-preflight' },
      timeout: timeoutMs,
    }, (res) => {
      resolve({ ok: true, status: res.statusCode, url });
      res.resume();
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message, url }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout', url }); });
    req.end();
  });
}

function extractAttrs(html, attr) {
  const re = new RegExp(`${attr}=["']([^"']+)["']`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function extractDisabledWithHref(html) {
  // Find any element with data-paused="true" or disabled attribute that ALSO has an href
  const out = [];
  const re = /<a[^>]*(?:data-paused=["']true["']|disabled)[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const hrefMatch = /href=["']([^"']+)["']/.exec(tag);
    if (hrefMatch && hrefMatch[1] && hrefMatch[1] !== '#' && !hrefMatch[1].startsWith('javascript:')) {
      out.push({ tag, href: hrefMatch[1] });
    }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    console.error(`[ERROR] ${SOURCE_FILE} saknas`);
    process.exit(2);
  }
  const html = fs.readFileSync(SOURCE_FILE, 'utf8');

  console.log(`[verify-personal-demo-links] BASE = ${BASE}`);
  console.log(`[verify-personal-demo-links] Source = ${path.relative(process.cwd(), SOURCE_FILE)}\n`);

  // 1. Hitta alla href
  const hrefs = extractAttrs(html, 'href').filter((h) => !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('javascript:'));
  const externalHrefs = hrefs.filter((h) => /^https?:/i.test(h));
  const internalHrefs = hrefs.filter((h) => h.startsWith('/'));

  let fails = 0;
  const failures = [];

  // 2. Förbjudna mönster
  console.log('--- Förbjudna mönster ---');
  const blocked = [
    { kind: 'webcal_localhost', re: /webcal:\/\/localhost/i },
    { kind: 'drive_link', re: /drive\.google\.com/i },
    { kind: 'docs_link', re: /docs\.google\.com/i },
    { kind: 'localhost_link', re: /https?:\/\/localhost/i },
  ];
  for (const { kind, re } of blocked) {
    if (re.test(html)) {
      console.error(`  ✗ Hittade förbjudet mönster: ${kind}`);
      failures.push(`Förbjudet mönster: ${kind}`);
      fails += 1;
    } else {
      console.log(`  ✓ Inga ${kind}`);
    }
  }

  // 3. Disabled element med href
  console.log('\n--- Disabled/Pausade element med href ---');
  const badDisabled = extractDisabledWithHref(html);
  if (badDisabled.length > 0) {
    for (const b of badDisabled) {
      console.error(`  ✗ Pausat/disabled element har href: ${b.href}`);
      failures.push(`Disabled element med href: ${b.href}`);
      fails += 1;
    }
  } else {
    console.log('  ✓ Alla disabled/pausade element är utan href');
  }

  // 4. Externa länkar — varna om misstänkta mock-domäner
  console.log('\n--- Externa länkar ---');
  if (externalHrefs.length === 0) {
    console.log('  ✓ Inga externa länkar (förutom fonts/CDN i <link>)');
  } else {
    for (const href of externalHrefs) {
      // Tillåt fonts.googleapis.com och fonts.gstatic.com (i <link rel="preconnect">)
      if (/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(href)) {
        console.log(`  ✓ (font) ${href}`);
        continue;
      }
      // Andra externa: varna men inte fail
      console.warn(`  ⚠ extern: ${href}`);
    }
  }

  // 5. Probe interna länkar mot BASE
  console.log('\n--- Probe interna routes ---');
  for (const href of internalHrefs) {
    const url = BASE.replace(/\/$/, '') + href;
    const res = await probe(url);
    if (!res.ok) {
      console.error(`  ✗ ${href} — ${res.error}`);
      failures.push(`${href} — ${res.error}`);
      fails += 1;
      continue;
    }
    const code = res.status;
    // OK-koder: 200 (publik), 401/403/400 (skyddad/auth), 302/301 (redirect)
    const acceptable = code >= 200 && code < 400 || code === 401 || code === 403;
    if (code === 404) {
      console.error(`  ✗ ${code}  ${href}  — 404 ej tillåtet`);
      failures.push(`${href} — 404`);
      fails += 1;
    } else if (acceptable) {
      console.log(`  ✓ ${code}  ${href}`);
    } else if (code === 400) {
      // 400 = route mounted men behöver query params, OK
      console.log(`  ✓ ${code}  ${href}  (route mounted, behöver params)`);
    } else if (code >= 500) {
      console.error(`  ✗ ${code}  ${href}  — server error`);
      failures.push(`${href} — ${code}`);
      fails += 1;
    } else {
      console.warn(`  ⚠ ${code}  ${href}  — oväntad kod`);
    }
  }

  // 6. Sammanfattning
  console.log('\n========================================');
  if (fails === 0) {
    console.log('✅ ALL CHECKS PASS — personal-demo.html är presentation-säker');
    process.exit(0);
  }
  console.error(`❌ ${fails} FAIL`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(3);
});
