'use strict';

/**
 * CM Receipt Repair — applicerar säkra, automatiska rättningar på CM-records.
 *
 * Kör alltid med --dry-run först. Skarp körning kräver --confirm.
 *
 * Användning:
 *   node scripts/cfo/cmReceiptRepair.js \
 *     --cm-store data/cm-expense.json \
 *     --audit audit-report.json \
 *     --dry-run
 */

const fs = require('node:fs');
const path = require('node:path');

const { parseSwedishAmount, tokenSet } = require('../../src/cfo/cfoCardReconciliation');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

function loadJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[repair] kunde inte läsa ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

function parseArgs(argv) {
  const out = { dryRun: true };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cm-store') out.cmStorePath = argv[++i];
    else if (arg === '--audit') out.auditPath = argv[++i];
    else if (arg === '--output') out.outputPath = argv[++i];
    else if (arg === '--confirm') out.dryRun = false;
    else if (arg === '--dry-run') out.dryRun = true;
  }
  return out;
}

function findRecordById(store, id) {
  return (store.expenseRecords || []).find((r) => r.id === id) || null;
}

function findRawItemById(store, id) {
  return (store.rawItems || []).find((r) => r.id === id) || null;
}

function findDocumentsForRawItem(store, rawItemId) {
  return (store.documents || []).filter((d) => d.rawItemId === rawItemId);
}

function domainFromEmail(email) {
  const m = normalizeText(email).match(/@(.+)$/);
  return m ? m[1].toLowerCase() : '';
}

function supplierFromDomain(domain) {
  const map = {
    'apple.com': 'Apple',
    'figma.com': 'Figma',
    'google.com': 'Google',
    'microsoft.com': 'Microsoft',
    'adobe.com': 'Adobe',
    'canva.com': 'Canva',
    'facebook.com': 'Meta',
    'meta.com': 'Meta',
    'uber.com': 'Uber',
    'booking.com': 'Booking.com',
    'sj.se': 'SJ',
    'hemkop.se': 'Hemköp',
    'pipedrive.com': 'Pipedrive',
    'zapier.com': 'Zapier',
    'openai.com': 'OpenAI',
    'anthropic.com': 'Anthropic',
    'render.com': 'Render',
    'loopia.se': 'Loopia',
    'paypal.com': 'PayPal',
    'netflix.com': 'Netflix',
    'spotify.com': 'Spotify',
  };
  return map[domain] || domain.replace(/^www\./, '').replace(/\.[a-z]{2,}$/i, '');
}

function extractAmountFromRawItem(rawItem) {
  const text = normalizeText(`${rawItem?.subject || ''}\n${rawItem?.rawBodyText || ''}`);
  const amounts = [];
  for (const m of text.matchAll(
    /(?:belopp|total|att betala|kostar|kr|SEK)\s*[:]?\s*([0-9]{1,3}(?:[\s.,][0-9]{2,3}){1,5})/gi
  )) {
    const n = parseSwedishAmount(m[1]);
    if (n !== null && n > 0) amounts.push(n);
  }
  for (const m of text.matchAll(/([0-9]{1,3}(?:[\s.,][0-9]{2,3}){1,5})\s*(?:kr|SEK)/gi)) {
    const n = parseSwedishAmount(m[1]);
    if (n !== null && n > 0) amounts.push(n);
  }
  if (!amounts.length) return null;
  // välj mest frekventa eller största
  amounts.sort((a, b) => b - a);
  return amounts[0];
}

function repairRecord(record, store, issues) {
  const rawItem = record.rawItemId ? findRawItemById(store, record.rawItemId) : null;
  const actions = [];

  const missingAmount = issues.some((i) => i.kind === 'MISSING_AMOUNT');
  if (missingAmount && rawItem) {
    const amount = extractAmountFromRawItem(rawItem);
    if (amount) {
      actions.push({ field: 'amountIncVat', old: record.amountIncVat, new: amount });
      actions.push({ field: 'amountExVat', old: record.amountExVat, new: amount });
      record.amountIncVat = amount;
      record.amountExVat = amount;
      record.vatAmount = 0;
      record.flags = record.flags.filter((f) => f !== 'MISSING_TOTAL_AMOUNT');
      actions.push({ field: 'flags', note: 'removed MISSING_TOTAL_AMOUNT' });
    }
  }

  const missingSupplier = issues.some((i) => i.kind === 'MISSING_SUPPLIER');
  if (missingSupplier && rawItem) {
    const domain = domainFromEmail(rawItem.fromEmail);
    if (domain) {
      const supplier = supplierFromDomain(domain);
      actions.push({ field: 'supplierName', old: record.supplierName, new: supplier });
      record.supplierName = supplier;
    }
  }

  const wrongSupplier = issues.find((i) => i.kind === 'WRONG_SUPPLIER');
  if (wrongSupplier && rawItem) {
    const domain = domainFromEmail(rawItem.fromEmail);
    if (domain) {
      const supplier = supplierFromDomain(domain);
      if (supplier) {
        actions.push({ field: 'supplierName', old: record.supplierName, new: supplier });
        record.supplierName = supplier;
      }
    }
  }

  const missingDate = issues.some((i) => i.kind === 'MISSING_DATE');
  if (missingDate && rawItem?.receivedAt) {
    const d = normalizeText(rawItem.receivedAt).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      actions.push({ field: 'date', old: record.date, new: d });
      record.date = d;
    }
  }

  if (actions.length) {
    record.updatedAt = nowIso();
  }
  return actions;
}

function main() {
  const args = parseArgs(process.argv);
  const cmStorePath = args.cmStorePath || 'data/cm-expense.json';
  const auditPath = args.auditPath || 'audit-report.json';
  const outputPath =
    args.outputPath || `data/cm-expense.repaired-${new Date().toISOString().slice(0, 10)}.json`;

  const store = loadJson(cmStorePath);
  const audit = loadJson(auditPath);

  if (!store || !audit) {
    console.error('[repair] cm-store eller audit-rapport saknas');
    process.exit(1);
  }

  const issuesByRecord = new Map();
  for (const issue of audit.issues || []) {
    if (!issue.recordId) continue;
    if (!issuesByRecord.has(issue.recordId)) issuesByRecord.set(issue.recordId, []);
    issuesByRecord.get(issue.recordId).push(issue);
  }

  const report = {
    dryRun: args.dryRun,
    cmStorePath: path.resolve(cmStorePath),
    auditPath: path.resolve(auditPath),
    repairedAt: nowIso(),
    repaired: [],
    skipped: [],
    unchanged: [],
  };

  for (const [recordId, issues] of issuesByRecord) {
    const record = findRecordById(store, recordId);
    if (!record) {
      report.skipped.push({ recordId, reason: 'record finns inte' });
      continue;
    }
    const actions = repairRecord(record, store, issues);
    if (actions.length) {
      report.repaired.push({ recordId, actions });
    } else {
      report.unchanged.push({ recordId, reason: 'inga säkra rättningar kunde tillämpas' });
    }
  }

  if (!args.dryRun) {
    const tmp = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, outputPath);
    console.log(`[repair] skrev reparerad store till ${outputPath}`);
  } else {
    console.log('[repair] dry-run — inga ändringar skrivna');
  }

  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { repairRecord, extractAmountFromRawItem, supplierFromDomain };
