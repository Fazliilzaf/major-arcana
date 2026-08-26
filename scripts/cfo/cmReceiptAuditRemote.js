'use strict';

/**
 * CM Receipt Audit (Remote) — hämtar CM-data från cfo.hairtpclinic.com via API
 * och kör samma auditmotor som cmReceiptAudit.js.
 *
 * Env:
 *   CFO_BASE_URL=https://cfo.hairtpclinic.com
 *   CFO_EMAIL=fazli@hairtpclinic.com
 *   CFO_PASSWORD=...
 *
 * Användning:
 *   node scripts/cfo/cmReceiptAuditRemote.js --output tmp/cm-audit-prod.json
 */

const fs = require('node:fs');
const { runAudit } = require('./cmReceiptAudit');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output') out.outputPath = argv[++i];
    else if (arg === '--concurrency') out.concurrency = Number(argv[++i]) || 3;
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
      console.warn(`[remote] 429 för ${url}, väntar ${wait}ms (försök ${attempt + 1}/${retries})`);
      await sleep(wait);
      continue;
    }
    lastErr = new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 200)}`);
    break;
  }
  throw lastErr;
}

async function login(baseUrl, email, password) {
  const url = `${baseUrl}/api/v1/auth/login`;
  const res = await httpJson(url, {
    method: 'POST',
    body: { email, password },
  });
  if (!res.token) throw new Error('Ingen token från login');
  return res.token;
}

async function fetchAllRecords(baseUrl, token) {
  const endpoints = [
    'cm/inbox',
    'cm/needs-review',
    'cm/invoices',
    'cm/receipts',
    'cm/travel',
    'cm/approvals',
    'cm/ready-for-bookkeeping',
    'cm/exported',
  ];
  const all = [];
  const seen = new Set();
  for (const ep of endpoints) {
    try {
      const res = await httpJson(`${baseUrl}/api/v1/${ep}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const items = Array.isArray(res.items) ? res.items : [];
      for (const item of items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        }
      }
      console.log(`[remote] ${ep}: ${items.length} items`);
    } catch (err) {
      console.warn(`[remote] ${ep}: ${err.message}`);
    }
  }
  return all;
}

async function fetchAllExpenses(baseUrl, token) {
  // /expenses är cap:ad till 1000 utan offset. expenses-tree har obegränsad
  // aggregering per månad och returnerar fulla objekt vid year+month.
  const tree = await httpJson(`${baseUrl}/api/v1/cco-cf/expenses-tree`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!tree.ok || !Array.isArray(tree.years)) {
    throw new Error('Kunde inte hämta expenses-tree');
  }
  const all = [];
  const seen = new Set();
  for (const year of tree.years) {
    for (const month of year.months || []) {
      const res = await httpJson(
        `${baseUrl}/api/v1/cco-cf/expenses-tree?year=${year.year}&month=${month.month}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const expenses = Array.isArray(res.expenses) ? res.expenses : [];
      for (const e of expenses) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          all.push(e);
        }
      }
      console.log(`[remote] expenses ${year.year}-${month.month}: ${expenses.length}`);
    }
  }
  console.log(`[remote] totalt expenses: ${all.length}`);
  return all;
}

async function fetchCardReconciliation(baseUrl, token) {
  // /cco-cf/card-reconciliation returnerar max 500 transaktioner.
  // Vi hämtar status för status tills vi får med allt.
  const all = [];
  const seen = new Set();
  const statuses = ['unmatched', 'matched', 'ignored', 'suggested'];
  for (const status of statuses) {
    const res = await httpJson(
      `${baseUrl}/api/v1/cco-cf/card-reconciliation?status=${status}&limit=500`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const transactions = Array.isArray(res.transactions) ? res.transactions : [];
    for (const tx of transactions) {
      if (!seen.has(tx.id)) {
        seen.add(tx.id);
        all.push(tx);
      }
    }
    console.log(`[remote] card ${status}: ${transactions.length}`);
  }
  console.log(`[remote] totalt card-transaktioner: ${all.length}`);
  return { transactions: all };
}

async function fetchRawItems(baseUrl, token, records, concurrency = 10) {
  const rawById = new Map();
  const ids = [...new Set(records.map((r) => r.rawItemId).filter(Boolean))];
  console.log(`[remote] hämtar ${ids.length} rawItems med concurrency ${concurrency}`);

  let done = 0;
  async function fetchOne(id) {
    try {
      const res = await httpJson(`${baseUrl}/api/v1/cm/raw-items/${id}?full=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok && res.id) rawById.set(id, res);
    } catch (err) {
      console.warn(`[remote] rawItem ${id}: ${err.message}`);
    }
    done++;
    if (done % 50 === 0) console.log(`[remote] ${done}/${ids.length} rawItems`);
  }

  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    await Promise.all(batch.map((id) => fetchOne(id)));
  }
  console.log(`[remote] rawItems klara: ${rawById.size}/${ids.length}`);
  return rawById;
}

function buildPseudoStore(records, rawById) {
  const rawItems = [];
  const documents = [];
  for (const [id, raw] of rawById) {
    rawItems.push(raw);
    if (Array.isArray(raw.attachmentNames)) {
      // raw-items/:id ger inte documentId, bara attachmentNames och originalStorageKey.
      // Vi skapar pseudodokument för suspicious-attachment-check.
      for (const name of raw.attachmentNames) {
        documents.push({
          id: `${raw.id}-att-${documents.length}`,
          rawItemId: raw.id,
          fileName: normalizeText(name),
          mimeType: '',
          storagePath: raw.originalStorageKey || '',
          source: 'remote_pseudo',
          ocrStatus: 'pending',
          aiExtractionStatus: 'pending',
          confidenceScore: null,
          createdAt: raw.receivedAt || '',
        });
      }
    }
  }
  return { rawItems, documents, expenseRecords: records };
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
  const email = process.env.CFO_EMAIL;
  const password = process.env.CFO_PASSWORD;

  if (!email || !password) {
    console.error('[remote] CFO_EMAIL och CFO_PASSWORD krävs');
    process.exit(1);
  }

  console.log('[remote] loggar in...');
  const token = await login(baseUrl, email, password);
  console.log('[remote] inloggad');

  const records = await fetchAllRecords(baseUrl, token);
  console.log(`[remote] totalt ${records.length} unika records`);

  const rawById = await fetchRawItems(baseUrl, token, records, args.concurrency || 3);
  const pseudoStore = buildPseudoStore(records, rawById);

  // Spara pseudo-store för framtida felsökning
  const pseudoStorePath = 'tmp/cm-pseudo-store-prod.json';
  fs.writeFileSync(pseudoStorePath, JSON.stringify(pseudoStore), 'utf8');
  console.log(`[remote] pseudo-store sparad: ${pseudoStorePath}`);

  // Hämta alla CFO-expenses för att kunna verifiera länkar och matchningar
  const expenses = await fetchAllExpenses(baseUrl, token);
  const cfoExpensesPath = `tmp/cfo-expenses-prod-${Date.now()}.json`;
  fs.writeFileSync(cfoExpensesPath, JSON.stringify(expenses), 'utf8');
  console.log(`[remote] CFO-expenses sparade: ${cfoExpensesPath}`);

  // Hämta kortavstämningsdata för matchning
  const cardReconciliation = await fetchCardReconciliation(baseUrl, token);
  const cardReconciliationPath = `tmp/card-reconciliation-prod-${Date.now()}.json`;
  fs.writeFileSync(cardReconciliationPath, JSON.stringify(cardReconciliation), 'utf8');
  console.log(`[remote] kortavstämning sparad: ${cardReconciliationPath}`);

  // Kör audit: skriv temp-filer för transaktionsdata
  const tmpStorePath = `tmp/cm-store-prod-${Date.now()}.json`;
  fs.writeFileSync(tmpStorePath, JSON.stringify(pseudoStore), 'utf8');

  const report = runAudit({
    cmStorePath: tmpStorePath,
    cfoExpensesPath,
    cardReconciliationPath,
    bankReconciliationPath: '',
  });

  const outputPath = args.outputPath || 'tmp/cm-audit-prod.json';
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[remote] audit-rapport sparad: ${outputPath}`);
  console.log('summary:', JSON.stringify(report.summary, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[remote] fatal:', err.message);
    process.exit(1);
  });
}

module.exports = {
  fetchAllRecords,
  fetchRawItems,
  fetchAllExpenses,
  fetchCardReconciliation,
  buildPseudoStore,
};
