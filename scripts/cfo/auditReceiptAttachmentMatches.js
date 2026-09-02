#!/usr/bin/env node
'use strict';

/**
 * auditReceiptAttachmentMatches — torrkörning som kontrollerar att varje
 * CFO-kvitto verkligen innehåller rätt underlag (leverantör, belopp, datum).
 *
 * Använder prod-API:t, laddar hem varje PDF, extraherar text och kör samma
 * validering som CM/CFO-flödet använder. Resultatet skrivs till en JSON-rapport.
 *
 * Torrkörning som standard — skriptet ändrar ingen data.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const { validatePdfAttachment } = require('../../src/cfo/cfoInvoiceValidator');

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const outputDir =
  process.env.OUTPUT_DIR || path.join(__dirname, '..', '..', 'tmp', 'receipt-audit');
const limit = Number(process.env.AUDIT_LIMIT || 0);
const minScore = Number(process.env.AUDIT_MIN_SCORE || 0.75);
const concurrency = Number(process.env.AUDIT_CONCURRENCY || 5);
const fetchTimeoutMs = Number(process.env.AUDIT_TIMEOUT || 30000);

if (!token) {
  console.error(
    '[audit] CFO_AUTH_TOKEN saknas. Hämta en token via /api/v1/auth/login och sätt env-variabeln.'
  );
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function apiFetch({ method = 'GET', path, headers = {} }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = https.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...headers,
        },
        timeout: fetchTimeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(buf.toString('utf8')) });
            } catch {
              resolve({ status: res.statusCode, body: buf });
            }
          } else {
            reject(
              new Error(`HTTP ${res.statusCode} ${path}: ${buf.toString('utf8').slice(0, 200)}`)
            );
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`timeout ${path}`));
    });
    req.end();
  });
}

function downloadPdf(receiptId) {
  return new Promise((resolve, reject) => {
    const url = new URL(
      `/api/v1/cco-cf/receipts/${encodeURIComponent(receiptId)}/download`,
      baseUrl
    );
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        timeout: fetchTimeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(buf);
          } else {
            reject(
              new Error(
                `HTTP ${res.statusCode} download ${receiptId}: ${buf.toString('utf8').slice(0, 200)}`
              )
            );
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`timeout download ${receiptId}`)));
    req.end();
  });
}

async function runInBatches(items, fn, batchSize) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      console.log(`[audit] ${Math.min(i + batchSize, items.length)}/${items.length} klara…`);
    }
  }
  return results;
}

function normalizeSupplier(s) {
  return typeof s === 'string' ? s.trim() : '';
}

function amountFromReceipt(r) {
  const n = Number(r.amountSek ?? r.amountIncVat ?? null);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function inspectReceipt(receipt) {
  const out = {
    receiptId: receipt.id,
    supplier: normalizeSupplier(receipt.supplier),
    amountSek: amountFromReceipt(receipt),
    date: receipt.date || null,
    status: receipt.status || null,
    storageKey: receipt.storageKey || null,
    originalFileName: receipt.originalFileName || null,
    fetchOk: false,
    validation: null,
  };

  try {
    const buffer = await downloadPdf(receipt.id);
    out.fetchOk = true;
    out.pdfSizeBytes = buffer.length;

    const syntheticRecord = {
      supplierName: out.supplier,
      amountIncVat: out.amountSek,
      date: out.date,
    };

    const validation = await validatePdfAttachment({ buffer, record: syntheticRecord });
    out.validation = validation;
    out.suspectMismatch = !validation.ok || validation.score < minScore;
  } catch (err) {
    out.fetchOk = false;
    out.error = err.message;
    out.suspectMismatch = true;
  }

  return out;
}

async function main() {
  console.log(
    `[audit] start — baseUrl=${baseUrl}, minScore=${minScore}, limit=${limit || 'none'}, concurrency=${concurrency}`
  );

  // Hämta kvitton. API:t har en intern max-limit; paginera om det behövs.
  let page = 1;
  let allReceipts = [];
  let more = true;
  while (more) {
    const { body } = await apiFetch({ path: `/api/v1/cco-cf/receipts?limit=1000&page=${page}` });
    const receipts = body?.receipts || [];
    allReceipts = allReceipts.concat(receipts);
    more = receipts.length === 1000;
    if (more) page += 1;
  }

  console.log(`[audit] receipts loaded: ${allReceipts.length}`);

  if (limit > 0) {
    allReceipts = allReceipts.slice(0, limit);
    console.log(`[audit] begränsad till: ${allReceipts.length}`);
  }

  const results = await runInBatches(allReceipts, inspectReceipt, concurrency);

  const inspected = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      inspected.push(r.value);
    } else {
      inspected.push({ error: r.reason?.message || String(r.reason), suspectMismatch: true });
    }
  }

  const suspect = inspected.filter((i) => i.suspectMismatch);
  const ok = inspected.filter((i) => !i.suspectMismatch);
  const fetchFailed = inspected.filter((i) => !i.fetchOk && !i.error);

  const report = {
    runAt: new Date().toISOString(),
    baseUrl,
    minScore,
    total: inspected.length,
    ok: ok.length,
    suspectMismatch: suspect.length,
    fetchFailed: fetchFailed.length,
    otherErrors: inspected.filter((i) => i.error && i.fetchOk === undefined).length,
    suspectDetails: suspect.map((i) => ({
      receiptId: i.receiptId,
      supplier: i.supplier,
      amountSek: i.amountSek,
      date: i.date,
      status: i.status,
      storageKey: i.storageKey,
      originalFileName: i.originalFileName,
      score: i.validation?.score ?? null,
      reasons: i.validation?.reasons ?? [i.error],
    })),
    okSample: ok.slice(0, 5).map((i) => ({
      receiptId: i.receiptId,
      supplier: i.supplier,
      amountSek: i.amountSek,
      score: i.validation?.score,
    })),
  };

  const reportPath = path.join(
    outputDir,
    `receipt-attachment-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n[audit] resultat:');
  console.log(`  totalt granskade: ${report.total}`);
  console.log(`  OK (score ≥ ${minScore}): ${report.ok}`);
  console.log(`  misstänkt felkopplade: ${report.suspectMismatch}`);
  console.log(`  kunde inte ladda PDF: ${report.fetchFailed}`);
  console.log(`  andra fel: ${report.otherErrors}`);
  console.log(`\n[audit] rapport sparad: ${reportPath}`);

  // Skriv även en kort CSV för enkel granskning i Excel/Numbers.
  const csvPath = path.join(
    outputDir,
    `receipt-attachment-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
  );
  const csvRows = [
    [
      'receiptId',
      'supplier',
      'amountSek',
      'date',
      'status',
      'score',
      'reasons',
      'storageKey',
      'originalFileName',
    ].join(';'),
    ...suspect.map((i) =>
      [
        i.receiptId,
        i.supplier,
        i.amountSek,
        i.date,
        i.status,
        i.validation?.score ?? '',
        (i.validation?.reasons ?? [i.error]).join(','),
        i.storageKey,
        i.originalFileName,
      ].join(';')
    ),
  ];
  fs.writeFileSync(csvPath, csvRows.join('\n'));
  console.log(`[audit] CSV sparad: ${csvPath}`);
}

main().catch((err) => {
  console.error('[audit] fatal:', err);
  process.exit(1);
});
