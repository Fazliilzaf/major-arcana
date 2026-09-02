'use strict';

/**
 * Kör /cm/reextract-missing mot prod för poster som saknar belopp.
 *
 * Användning:
 *   node scripts/cfo/cmReextractMissingApi.js --audit tmp/cm-audit-prod.json --batch-size 50 --dry-run
 *
 * --dry-run: logga bara vilka poster som skulle rättas, gör inga API-anrop.
 * --confirm: kör riktiga reextract-anrop.
 */

const fs = require('node:fs');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseArgs(argv) {
  const out = { dryRun: true, batchSize: 50 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--audit') out.auditPath = argv[++i];
    else if (arg === '--batch-size') out.batchSize = Number(argv[++i]) || 50;
    else if (arg === '--confirm') out.dryRun = false;
    else if (arg === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpJson(url, { method = 'GET', headers = {}, body, retries = 5 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (res.status === 429 && attempt < retries) {
      let wait = 2000;
      try {
        const parsed = JSON.parse(text);
        if (parsed.retryAfterSec) wait = parsed.retryAfterSec * 1000;
      } catch {
        wait = (attempt + 1) * 2000;
      }
      console.warn(`[reextract] 429 för ${url}, väntar ${wait}ms`);
      await sleep(wait);
      continue;
    }
    lastErr = new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 200)}`);
    break;
  }
  throw lastErr;
}

async function login(baseUrl, email, password) {
  const res = await httpJson(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    body: { email, password },
  });
  if (!res.token) throw new Error('Ingen token från login');
  return res.token;
}

function main() {
  const args = parseArgs(process.argv);
  const auditPath = args.auditPath || 'tmp/cm-audit-prod.json';
  const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
  const email = process.env.CFO_EMAIL;
  const password = process.env.CFO_PASSWORD;

  if (!email || !password) {
    console.error('[reextract] CFO_EMAIL och CFO_PASSWORD krävs');
    process.exit(1);
  }

  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  const missingAmountIds = [
    ...new Set(
      (audit.issues || [])
        .filter((i) => i.kind === 'MISSING_AMOUNT' && i.recordId)
        .map((i) => i.recordId)
    ),
  ];

  console.log(`[reextract] ${missingAmountIds.length} poster saknar belopp`);
  console.log(`[reextract] dryRun=${args.dryRun}, batchSize=${args.batchSize}`);

  if (args.dryRun) {
    console.log(
      '[reextract] skulle köra med recordIds:',
      missingAmountIds.slice(0, 10).join(', '),
      '...'
    );
    return;
  }

  (async () => {
    const token = await login(baseUrl, email, password);
    console.log('[reextract] inloggad');

    const results = [];
    for (let i = 0; i < missingAmountIds.length; i += args.batchSize) {
      const batch = missingAmountIds.slice(i, i + args.batchSize);
      console.log(
        `[reextract] batch ${i + 1}-${Math.min(i + batch.length, missingAmountIds.length)} (${batch.length} st)`
      );
      const res = await httpJson(`${baseUrl}/api/v1/cm/reextract-missing`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { recordIds: batch, limit: batch.length, force: true },
      });
      results.push(res);
      console.log(
        '[reextract] resultat:',
        JSON.stringify({
          candidates: res.candidates,
          attempted: res.attempted,
          updatedRecords: res.updatedRecords,
          updatedCfo: res.updatedCfo,
          skippedNoSource: res.skippedNoSource,
          errors: res.errors?.length || 0,
        })
      );
      // Vänta mellan batchar för att inte trigga rate limiting
      if (i + args.batchSize < missingAmountIds.length) {
        await sleep(3000);
      }
    }

    fs.writeFileSync(
      `tmp/cm-reextract-results-${Date.now()}.json`,
      JSON.stringify(results, null, 2),
      'utf8'
    );
    const totalUpdated = results.reduce((a, r) => a + (r.updatedRecords || 0), 0);
    console.log(
      `[reextract] totalt uppdaterade poster: ${totalUpdated}/${missingAmountIds.length}`
    );
  })().catch((err) => {
    console.error('[reextract] fatal:', err.message);
    process.exit(1);
  });
}

main();
