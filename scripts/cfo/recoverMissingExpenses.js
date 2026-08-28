#!/usr/bin/env node
'use strict';

const fs = require('fs');
const BASE_URL = process.env.BASE_URL || 'https://cfo.hairtpclinic.com';
const TOKEN = process.env.TOKEN || fs.readFileSync('/tmp/cfo_token.txt', 'utf8').trim();
const DELAY_MS = parseInt(process.env.DELAY_MS, 10) || 1500;

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
  const data = await api('/api/v1/cco-cf/receipts?status=exported&limit=1000');
  return data.receipts || [];
}

async function fetchAllExpenses() {
  const limit = 1000;
  const data = await api(`/api/v1/cco-cf/expenses?limit=${limit}`);
  const items = data.expenses || [];
  if (items.length >= limit) {
    console.warn('Varning: fler än 1000 expenses finns; offset stöds inte så vissa kan missas.');
  }
  return items;
}

async function createExpense(r) {
  return api('/api/v1/cco-cf/expenses', {
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
}

async function main() {
  console.log('Hämtar exported receipts och nuvarande expenses...');
  const receipts = await fetchAllExportedReceipts();
  const expenses = await fetchAllExpenses();
  const existingReceiptIds = new Set(expenses.map((e) => e.receiptId).filter(Boolean));
  const missing = receipts.filter((r) => !existingReceiptIds.has(r.id));
  console.log(
    `Receipts: ${receipts.length}, Expenses: ${expenses.length}, Saknade: ${missing.length}`
  );

  let created = 0;
  let errors = 0;
  for (const r of missing) {
    try {
      const result = await createExpense(r);
      created++;
      console.log(`✓ ${r.supplier || '(okänd)'} ${r.amountSek} kr → ${result.expense.id}`);
    } catch (err) {
      errors++;
      console.error(`✗ ${r.supplier || '(okänd)'} ${r.amountSek} kr: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`\nKlart. Skapade: ${created}, fel: ${errors}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
