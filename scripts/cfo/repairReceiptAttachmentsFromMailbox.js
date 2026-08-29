#!/usr/bin/env node
'use strict';

/**
 * repairReceiptAttachmentsFromMailbox
 *
 * Återhämtar rätt bilaga för CFO-kvitton som pekar på fel delad lagringsfil.
 *
 * Algoritm:
 *   1. Ladda backup-filen med kvitton.
 *   2. Hitta kvitton som delar storageKey med andra (misstänkt felkopplade).
 *   3. För varje sådant kvitto, anropa serverns repair-from-mailbox endpoint
 *      som letar upp korttransaktionen, söker mailbox truth och validerar en
 *      ny PDF-bilaga.
 *
 * Torrkörning som standard (DRY_RUN=true). Sätt DRY_RUN=false för skarp körning.
 *
 * Användning:
 *   CFO_AUTH_TOKEN=<token> node scripts/cfo/repairReceiptAttachmentsFromMailbox.js
 *   DRY_RUN=false CFO_AUTH_TOKEN=<token> node scripts/cfo/repairReceiptAttachmentsFromMailbox.js
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());
const batchSize = Number(process.env.BATCH_SIZE || 10);
const delayMs = Number(process.env.DELAY_MS || 2000);
const limit = Number(process.env.LIMIT || 0);
const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'data', 'backups');

if (!token) {
  console.error('[repair] CFO_AUTH_TOKEN saknas.');
  process.exit(1);
}

function findLatestBackupDir() {
  const dirs = fs
    .readdirSync(backupDir)
    .filter((d) => d.startsWith('cfo-cm-prod-'))
    .map((d) => path.join(backupDir, d))
    .filter((d) => fs.statSync(d).isDirectory())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!dirs.length) throw new Error('Ingen backup-katalog hittades');
  return dirs[0];
}

function apiFetch({ method = 'POST', path: apiPath, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, baseUrl);
    const req = https.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          try {
            const json = JSON.parse(text);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ status: res.statusCode, body: json });
            } else {
              reject({ status: res.statusCode, body: json });
            }
          } catch {
            reject({ status: res.statusCode, body: text });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`timeout ${apiPath}`)));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dir = findLatestBackupDir();
  const receiptsPath = path.join(dir, 'receipts.json');
  console.log(`[repair] backup: ${receiptsPath}`);

  const receipts = JSON.parse(fs.readFileSync(receiptsPath, 'utf8'));
  if (!Array.isArray(receipts)) throw new Error('receipts.json är inte en array');

  // Identifiera kvitton som delar storageKey.
  const byKey = receipts.reduce((m, r) => {
    m[r.storageKey] = (m[r.storageKey] || []).concat(r);
    return m;
  }, {});
  let candidates = receipts.filter((r) => (byKey[r.storageKey] || []).length > 1);

  // Sortera så att de med flest delade nycklar körs sist (eller tvärtom — vi kör en i taget).
  candidates.sort((a, b) => a.id.localeCompare(b.id));

  if (limit > 0) {
    candidates = candidates.slice(0, limit);
  }

  console.log(`[repair] dryRun=${dryRun}, baseUrl=${baseUrl}`);
  console.log(
    `[repair] candidates: ${candidates.length} av ${receipts.length} kvitton delar storageKey`
  );

  const results = [];
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    console.log(`[repair] batch ${i + 1}-${Math.min(i + batch.length, candidates.length)}`);

    for (const r of batch) {
      const logPrefix = `[repair] ${r.id} ${r.supplier || '(no supplier)'} ${r.amountSek} ${r.date}`;
      if (dryRun) {
        console.log(`${logPrefix} — SKULLE reparera (torrkörning)`);
        results.push({
          receiptId: r.id,
          supplier: r.supplier,
          amountSek: r.amountSek,
          date: r.date,
          status: 'dry_run',
          storageKey: r.storageKey,
        });
        continue;
      }

      try {
        // 1. Prova lokalt lagrade CM-dokument först (info@fazli.se IMAP-import)
        //    — billigt, snabbt och redan nedladdade original.
        let res = null;
        let source = 'cm';
        try {
          res = await apiFetch({
            path: `/api/v1/cco-cf/receipts/${encodeURIComponent(r.id)}/repair-from-cm`,
            body: {},
          });
        } catch (cmErr) {
          // 2. Fallback: sök i M365 mailbox truth + hämta bilaga via Graph.
          source = 'mailbox';
          res = await apiFetch({
            path: `/api/v1/cco-cf/receipts/${encodeURIComponent(r.id)}/repair-from-mailbox`,
            body: {},
          });
        }
        console.log(`${logPrefix} — OK (${source}): ${res.body.ok}`);
        results.push({
          receiptId: r.id,
          supplier: r.supplier,
          amountSek: r.amountSek,
          date: r.date,
          status: 'repaired',
          source,
          newStorageKey: res.body.receipt?.storageKey,
          transaction: res.body.transaction || res.body.cmRecord,
        });
      } catch (err) {
        const detail = err.body?.error || err.body || err.message || 'okänt fel';
        console.log(`${logPrefix} — MISSLYCKADES: ${detail}`);
        results.push({
          receiptId: r.id,
          supplier: r.supplier,
          amountSek: r.amountSek,
          date: r.date,
          status: 'failed',
          error: typeof detail === 'string' ? detail : JSON.stringify(detail),
        });
      }
      await sleep(delayMs);
    }

    if (i + batchSize < candidates.length) {
      console.log(`[repair] paus ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }

  const summary = {
    runAt: new Date().toISOString(),
    dryRun,
    baseUrl,
    candidates: candidates.length,
    repaired: results.filter((x) => x.status === 'repaired').length,
    failed: results.filter((x) => x.status === 'failed').length,
    dryRunCount: results.filter((x) => x.status === 'dry_run').length,
  };

  const reportPath = path.join(
    dir,
    `repair-receipt-attachments-${dryRun ? 'dryrun' : 'live'}-${Date.now()}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2));
  console.log('\n[repair] sammanfattning:', summary);
  console.log(`[repair] rapport sparad: ${reportPath}`);
}

main().catch((err) => {
  console.error('[repair] fatal:', err);
  process.exit(1);
});
