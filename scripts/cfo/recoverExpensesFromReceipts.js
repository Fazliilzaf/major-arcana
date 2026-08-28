#!/usr/bin/env node
'use strict';

/**
 * Återställer expenses från receipts efter att expenses.json korrumperats.
 *
 * Läser alla receipts med status 'exported' (dvs. de som tidigare promotats
 * till expenses) och skapar nya expenses via POST /api/v1/cco-cf/expenses.
 * Kör AI-förslagsmotorn på varje ny expense.
 *
 * Användning:
 *   TOKEN=$(cat /tmp/cfo_token.txt) node scripts/cfo/recoverExpensesFromReceipts.js
 */

const fs = require('fs');
const path = require('path');
const BASE_URL = process.env.BASE_URL || 'https://cfo.hairtpclinic.com';
const TOKEN = process.env.TOKEN || fs.readFileSync('/tmp/cfo_token.txt', 'utf8').trim();
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 20;
const DELAY_MS = parseInt(process.env.DELAY_MS, 10) || 1000;
const RETRY_FILE =
  process.env.RETRY_FILE || path.join(__dirname, 'recoverExpensesFromReceipts.retry.json');

async function apiWithRetry(path, options = {}, { retries = 3, backoff = 2000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await api(path, options);
    } catch (err) {
      lastError = err;
      const isServerError =
        err.message.includes('502') ||
        err.message.includes('503') ||
        err.message.includes('504') ||
        err.message.includes('429') ||
        err.message.includes('fetch failed');
      if (!isServerError || attempt === retries) throw err;
      const wait = backoff * Math.pow(2, attempt);
      console.log(`    ⚠ retry ${attempt + 1}/${retries} efter ${wait}ms (${err.message})`);
      await sleep(wait);
    }
  }
  throw lastError;
}

async function api(path, { method = 'GET', body = null } = {}) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllExportedReceipts() {
  // cfoReceiptStore.listReceipts stöder inte offset, bara status + limit.
  // Max limit är 1000, så vi hämtar alla exported på en gång.
  const limit = 1000;
  const data = await api(`/api/v1/cco-cf/receipts?status=exported&limit=${limit}`);
  const items = data.receipts || [];
  if (items.length >= limit) {
    console.warn(
      'Varning: fler än 1000 exported receipts finns; offset stöds inte så vissa kan missas.'
    );
  }
  return items;
}

async function main() {
  console.log('Hämtar exporterade receipts...');
  const receipts = await fetchAllExportedReceipts();
  console.log(`Hittade ${receipts.length} exporterade receipts.`);

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const failed = [];

  for (let i = 0; i < receipts.length; i += BATCH_SIZE) {
    const batch = receipts.slice(i, i + BATCH_SIZE);
    console.log(
      `\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(receipts.length / BATCH_SIZE)} (${batch.length} st)`
    );

    for (const r of batch) {
      try {
        // Skapa expense från receipt-data
        const result = await apiWithRetry('/api/v1/cco-cf/expenses', {
          method: 'POST',
          body: {
            receiptId: r.id,
            supplier: r.supplier,
            amountSek: r.amountSek,
            date: r.date,
            vatRatePercent: r.vatRatePercent,
            paymentMethod: r.paymentMethod || 'card',
            notes: r.notes || `Återställd från receipt ${r.id}`,
            source: r.source,
          },
        });
        created++;
        console.log(
          `  ✓ ${r.supplier || '(okänd)'} ${r.amountSek} kr → ${result.expense.id} ${result.expense.status}`
        );
      } catch (err) {
        if (err.message.includes('already_promoted')) {
          skipped++;
          console.log(`  ⊘ ${r.supplier || '(okänd)'} redan promotad`);
        } else {
          errors++;
          failed.push({
            id: r.id,
            supplier: r.supplier,
            amountSek: r.amountSek,
            date: r.date,
            error: err.message,
          });
          console.error(`  ✗ ${r.supplier || '(okänd)'} ${r.amountSek} kr: ${err.message}`);
        }
      }
      await sleep(DELAY_MS);
    }
  }

  if (failed.length) {
    fs.writeFileSync(RETRY_FILE, JSON.stringify(failed, null, 2));
    console.log(`\n${failed.length} misslyckade sparade till ${RETRY_FILE}`);
  }
  console.log(`\nKlart. Skapade: ${created}, hoppade över: ${skipped}, fel: ${errors}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
