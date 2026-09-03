#!/usr/bin/env node
'use strict';

/**
 * backupCfoCmProd — säkerhetskopiera CFO/CM-proddata inför reparation.
 *
 * Hämtar via prod-API:t:
 *   - /api/v1/cco-cf/receipts
 *   - /api/v1/cco-cf/expenses
 *   - /api/v1/cco-cf/expenses-tree
 *   - /api/v1/cm/intake-tree
 *   - /api/v1/cm/raw-items/:id för varje raw item i trädet
 *
 * Skriver JSON-filer under data/backups/cfo-cm-prod-<timestamp>/.
 *
 * Användning:
 *   CFO_AUTH_TOKEN=<token> node scripts/cfo/backupCfoCmProd.js
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const backupRoot = path.join(__dirname, '..', '..', 'data', 'backups');

if (!token) {
  console.error('[backup] CFO_AUTH_TOKEN saknas.');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const outputDir = path.join(backupRoot, `cfo-cm-prod-${timestamp}`);
fs.mkdirSync(outputDir, { recursive: true });

function apiFetch({ method = 'GET', path: apiPath, body }) {
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
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(text) });
            } catch {
              resolve({ status: res.statusCode, body: text });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode} ${apiPath}: ${text.slice(0, 300)}`));
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

async function fetchPaginated(apiPath, resultKey) {
  const limit = 1000;
  const all = [];
  let offset = 0;
  let total = null;

  do {
    const pathWithQuery = `${apiPath}?limit=${limit}&offset=${offset}`;
    const res = await apiFetch({ path: pathWithQuery });
    const items = resultKey ? res.body[resultKey] : res.body;
    if (!Array.isArray(items)) {
      throw new Error(`Expected array from ${pathWithQuery}, got ${typeof items}`);
    }
    all.push(...items);
    total = res.body.total ?? items.length;
    offset += items.length;
    console.log(`[backup] ${apiPath}: ${all.length}/${total || '?'}`);
  } while (total === null || offset < total);

  return all;
}

async function run() {
  console.log(`[backup] Output directory: ${outputDir}`);

  // 1. Verify export gate is active before we touch data
  console.log('[backup] Verifying export block is active...');
  try {
    const exportTest = await apiFetch({
      method: 'POST',
      path: '/api/v1/cco-cf/expenses/export',
      body: {},
    });
    console.error('[backup] EXPORT GATE NOT ACTIVE — got', exportTest.status, exportTest.body);
    process.exit(1);
  } catch (err) {
    if (err.message.includes('export_blocked_until_repair')) {
      console.log('[backup] Export block confirmed ✓');
    } else {
      console.error('[backup] Unexpected export test error:', err.message);
      process.exit(1);
    }
  }

  // 2. Receipts
  console.log('[backup] Fetching receipts...');
  const receipts = await fetchPaginated('/api/v1/cco-cf/receipts', 'receipts');
  fs.writeFileSync(path.join(outputDir, 'receipts.json'), JSON.stringify(receipts, null, 2));

  // 3. Expenses
  console.log('[backup] Fetching expenses...');
  const expenses = await fetchPaginated('/api/v1/cco-cf/expenses', 'expenses');
  fs.writeFileSync(path.join(outputDir, 'expenses.json'), JSON.stringify(expenses, null, 2));

  // 4. Expenses tree
  console.log('[backup] Fetching expenses tree...');
  const expensesTree = await apiFetch({ path: '/api/v1/cco-cf/expenses-tree?limit=1000' });
  fs.writeFileSync(
    path.join(outputDir, 'expenses-tree.json'),
    JSON.stringify(expensesTree.body, null, 2)
  );

  // 5. CM queues (inbox + needs_review + exported + ready-for-bookkeeping)
  const cmQueues = {};
  for (const endpoint of ['inbox', 'needs-review', 'exported', 'ready-for-bookkeeping']) {
    console.log(`[backup] Fetching CM ${endpoint}...`);
    const res = await apiFetch({ path: `/api/v1/cm/${endpoint}` });
    cmQueues[endpoint] = res.body.items || [];
    fs.writeFileSync(
      path.join(outputDir, `cm-${endpoint.replace(/-/g, '_')}.json`),
      JSON.stringify(cmQueues[endpoint], null, 2)
    );
  }

  // 6. Raw items referenced by CM queues
  const rawItemIds = new Set();
  for (const items of Object.values(cmQueues)) {
    for (const item of items) {
      if (item.rawItemId) rawItemIds.add(item.rawItemId);
    }
  }

  const rawItems = [];
  console.log(`[backup] Fetching ${rawItemIds.size} raw items...`);
  for (const id of rawItemIds) {
    try {
      const raw = await apiFetch({ path: `/api/v1/cm/raw-items/${encodeURIComponent(id)}` });
      rawItems.push(raw.body);
    } catch (err) {
      console.error(`[backup] Failed to fetch raw-item ${id}:`, err.message);
    }
  }
  fs.writeFileSync(path.join(outputDir, 'cm-raw-items.json'), JSON.stringify(rawItems, null, 2));

  // 7. CM documents for raw items
  const rawItemDir = path.join(outputDir, 'cm-raw-item-documents');
  fs.mkdirSync(rawItemDir, { recursive: true });
  for (const raw of rawItems) {
    const docs = Array.isArray(raw.documents) ? raw.documents : [];
    for (const doc of docs) {
      if (!doc?.id) continue;
      try {
        const url = new URL(`/api/v1/cm/documents/${encodeURIComponent(doc.id)}/download`, baseUrl);
        const filePath = path.join(rawItemDir, `${raw.id}-${doc.id}.${doc.fileType || 'bin'}`);
        await new Promise((resolve, reject) => {
          const req = https.request(
            url,
            { method: 'GET', headers: { Authorization: `Bearer ${token}` }, timeout: 60000 },
            (res) => {
              if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} document ${doc.id}`));
                return;
              }
              const stream = fs.createWriteStream(filePath);
              res.pipe(stream);
              stream.on('finish', resolve);
              stream.on('error', reject);
            }
          );
          req.on('error', reject);
          req.on('timeout', () => req.destroy(new Error(`timeout document ${doc.id}`)));
          req.end();
        });
      } catch (err) {
        console.error(`[backup] Failed to download document ${doc.id}:`, err.message);
      }
    }
  }

  // 8. Summary
  const summary = {
    baseUrl,
    timestamp,
    receipts: receipts.length,
    expenses: expenses.length,
    cmInbox: cmQueues.inbox.length,
    cmNeedsReview: cmQueues['needs-review'].length,
    cmExported: cmQueues.exported.length,
    cmReadyForBookkeeping: cmQueues['ready-for-bookkeeping'].length,
    rawItems: rawItems.length,
    outputDir,
  };
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('[backup] Done:', summary);
}

run().catch((err) => {
  console.error('[backup] Fatal:', err.message);
  process.exit(1);
});
