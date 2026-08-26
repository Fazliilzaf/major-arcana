'use strict';

/**
 * CM Receipt Audit — end-to-end granskning av kvitto-inkorgen.
 *
 * Kör utan side-effects (read-only). Läser cm-expense.json, CFO-expenses,
 * kort- och bankavstämning, och producerar en JSON-rapport med problem som
 * behöver rättas.
 *
 * Användning:
 *   node scripts/cfo/cmReceiptAudit.js
 *     --cm-store data/cm-expense.json
 *     --cfo-expenses data/cco/expenses.json
 *     --card-reconciliation data/cfo-card-reconciliation.json
 *     --bank-reconciliation data/cfo-bank-reconciliation.json
 *     --output audit-report.json
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  parseAmexCsv,
  supplierHint,
  parseSwedishAmount,
} = require('../../src/cfo/cfoCardReconciliation');

const SUSPICIOUS_ATTACHMENT_SIGNALS = [
  /behandlingsavtal|hårtransplantation|patient:|hälsodeklaration/i,
  /målsägarkopia|polisanmälan|arbetstillstånd|ansökan om/i,
  /lönespecifikation|löneutbetalning|utbetalningslista/i,
  /bokningsbekräftelse|your booking documentation/i,
  /vårdavtal|patientavtal|behandlingsplan|intyg/i,
];

const SUPPLIER_BLACKLIST = [/patient/i, /vårdavtal/i, /behandling/i, /hårtransplantation/i];

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

function parseJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`[audit] kunde inte läsa ${filePath}: ${err.message}`);
    return null;
  }
}

function loadTransactions(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const first = raw.trim().slice(0, 1);

  // JSON-reconciliation store
  if (first === '{') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.transactions) ? parsed.transactions : [];
    } catch {
      return [];
    }
  }

  // Amex CSV
  if (/^datum,/i.test(raw.split(/\r?\n/)[0] || '')) {
    const { transactions } = parseAmexCsv(raw);
    return transactions;
  }

  // Semicolon or comma CSV with header
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(/[,;]/);
  const dateIdx = header.findIndex((h) => /datum|date/.test(h));
  const descIdx = header.findIndex((h) => /beskrivning|description|text/.test(h));
  const amountIdx = header.findIndex((h) => /belopp|amount/.test(h));
  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) return [];

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;]/);
    const date = normalizeText(cols[dateIdx]);
    const description = normalizeText(cols[descIdx]);
    const amountSek = parseSwedishAmount(cols[amountIdx]);
    if (!date || !description || amountSek === null) continue;
    out.push({ date, description, amountSek, type: amountSek < 0 ? 'credit' : 'charge' });
  }
  return out;
}

function isValidDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(d));
}

function isSuspiciousAttachment({ fileName, rawSubject, rawBodyText }) {
  const hay = normalizeText(`${fileName} ${rawSubject} ${rawBodyText}`);
  for (const rx of SUSPICIOUS_ATTACHMENT_SIGNALS) {
    if (rx.test(hay)) return true;
  }
  return false;
}

function isBlacklistedSupplier(name) {
  const n = normalizeText(name).toLowerCase();
  for (const rx of SUPPLIER_BLACKLIST) {
    if (rx.test(n)) return true;
  }
  return false;
}

function findMatchingTransactions(
  record,
  transactions,
  { amountTolerance = 1.0, dateTolerance = 7 } = {}
) {
  const matches = [];
  const recordAmount = Number(record.amountIncVat) || 0;
  if (!recordAmount || !isValidDate(record.date)) return matches;

  for (const tx of transactions) {
    if (tx.type === 'credit') continue; // inga krediter
    if (Math.abs(tx.amountSek - recordAmount) > amountTolerance) continue;
    if (daysBetween(record.date, tx.date) > dateTolerance) continue;
    matches.push(tx);
  }
  return matches;
}

function findSupplierMatch(record, transactions, { dateTolerance = 7 } = {}) {
  const matches = findMatchingTransactions(record, transactions, {
    amountTolerance: 1.0,
    dateTolerance,
  });
  if (!matches.length) return null;
  return (
    matches.find((tx) => supplierHint(tx.description, record.supplierName)) || matches[0] || null
  );
}

function gatherDocumentsForRecord(record, { rawItems, documents }) {
  const rawItem = record.rawItemId ? rawItems.find((r) => r.id === record.rawItemId) : null;
  const docs = rawItem
    ? documents.filter((d) => d.rawItemId === rawItem.id || d.id === record.documentId)
    : documents.filter((d) => d.id === record.documentId);
  // ORD-75: originalmailet räknas som underlag även om det inte finns ett
  // explicit document-objekt i storen.
  if (rawItem?.hasOriginal) {
    docs.push({
      id: `raw-${rawItem.id}`,
      rawItemId: rawItem.id,
      fileName: 'original_mail',
      mimeType: 'message/rfc822',
      source: 'original_mail',
    });
  }
  const uniqueDocs = [];
  const seen = new Set();
  for (const d of docs) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      uniqueDocs.push(d);
    }
  }
  return { rawItem, documents: uniqueDocs };
}

function auditRecord(record, context) {
  const issues = [];
  const { rawItem, documents } = gatherDocumentsForRecord(record, context);
  const { cardTransactions, bankTransactions, cfoExpensesById } = context;

  // 1. Saknat belopp
  const amount = Number(record.amountIncVat) || 0;
  if (!amount) {
    issues.push({
      kind: 'MISSING_AMOUNT',
      severity: 'high',
      message: 'Saknar totalbelopp — kan inte matchas mot korttransaktion eller bokföras.',
      suggestion: 'Kör om-extraktion på originalmailet/bilagan eller fyll i belopp manuellt.',
    });
  }

  // 2. Saknad eller ogiltig leverantör
  const supplier = normalizeText(record.supplierName);
  if (!supplier) {
    issues.push({
      kind: 'MISSING_SUPPLIER',
      severity: 'medium',
      message: 'Saknar leverantörsnamn.',
      suggestion: 'Härled leverantör från avsändaradress eller ämnesrad.',
    });
  } else if (isBlacklistedSupplier(supplier)) {
    issues.push({
      kind: 'WRONG_SUPPLIER',
      severity: 'high',
      message: `Leverantören "${supplier}" verkar vara en patient/vårdaktör, inte en fakturautställare.`,
      suggestion: 'Kontrollera bilagan — risk att patientdokument kopplats till fel transaktion.',
    });
  }

  // 3. Saknat eller ogiltigt datum
  if (!isValidDate(record.date)) {
    issues.push({
      kind: 'MISSING_DATE',
      severity: 'high',
      message: 'Saknar giltigt datum (YYYY-MM-DD).',
      suggestion: 'Extrahera datum från originalmalets ReceivedAt eller bilaga.',
    });
  }

  // 4. Saknat dokument / underlag
  if (!record.documentId && !record.rawItemId) {
    issues.push({
      kind: 'MISSING_DOCUMENT',
      severity: 'high',
      message: 'Varken dokument eller rå-mail är kopplat till record.',
      suggestion: 'Leta upp originalmailet i mailbox-truth eller importera underlag manuellt.',
    });
  } else if (!documents.length) {
    issues.push({
      kind: 'MISSING_ATTACHMENT',
      severity: 'high',
      message: 'Record har varken PDF- eller bildbilaga.',
      suggestion: 'Hämta bilaga från originalmailet (reprocess/imap-backfill).',
    });
  }

  // 5. Misstänkt bilaga (patientavtal etc.)
  for (const doc of documents) {
    if (
      isSuspiciousAttachment({
        fileName: doc.fileName,
        rawSubject: rawItem?.subject || '',
        rawBodyText: rawItem?.rawBodyText || '',
      })
    ) {
      issues.push({
        kind: 'SUSPICIOUS_ATTACHMENT',
        severity: 'high',
        message: `Bilagan "${doc.fileName}" innehåller signaler på patient/vård-dokument, inte kvitto.`,
        documentId: doc.id,
        suggestion: 'Granska bilaga och byt till rätt kvitto om nödvändigt.',
      });
    }
  }

  // 6. Promotad utan CFO-expense
  if (record.cfoExpenseId && !cfoExpensesById[record.cfoExpenseId]) {
    issues.push({
      kind: 'ORPHANED_CFO_LINK',
      severity: 'high',
      message: `Record är promotad till CFO-expense ${record.cfoExpenseId} men utgiften saknas.`,
      suggestion: 'Kör bulk-unpromote eller återskapa CFO-utgiften.',
    });
  }

  // 7. Matchning mot kort/bank
  const allTx = [...cardTransactions, ...bankTransactions];
  if (amount && isValidDate(record.date) && allTx.length) {
    const matches = findMatchingTransactions(record, allTx, {
      amountTolerance: 1.0,
      dateTolerance: 7,
    });
    if (!matches.length) {
      issues.push({
        kind: 'UNMATCHED_TO_BANK',
        severity: 'info',
        message: 'Ingen kort- eller banktransaktion hittades inom ±1 kr / ±7 dagar.',
        suggestion:
          'Kontrollera att betalningen verkligen skett på företagskort/konto, eller importera kortutdraget.',
      });
    } else {
      const supplierMatch = matches.find((tx) => supplierHint(tx.description, record.supplierName));
      if (!supplierMatch && record.supplierName) {
        issues.push({
          kind: 'BANK_DATE_AMOUNT_BUT_SUPPLIER_MISMATCH',
          severity: 'medium',
          message:
            'Belopp och datum matchar en transaktion, men leverantörsbeskrivningen stämmer inte.',
          suggestion: 'Kontrollera att rätt kvitto kopplats till transaktionen.',
        });
      }
    }
  }

  return issues;
}

function findDuplicateCandidates(records) {
  const groups = new Map();
  for (const r of records) {
    const supplier = normalizeText(r.supplierName).toLowerCase();
    const amount = Number(r.amountIncVat) || 0;
    if (!supplier || !amount || !isValidDate(r.date)) continue;
    const month = normalizeText(r.date).slice(0, 7);
    const key = `${supplier}|${amount}|${month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const dups = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    // Only flag if dates are within 7 days and not same rawItem
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (daysBetween(a.date, b.date) <= 7 && a.rawItemId !== b.rawItemId) {
          dups.push({ a: a.id, b: b.id, key });
        }
      }
    }
  }
  return dups;
}

function runAudit({
  cmStorePath,
  cfoExpensesPath,
  cardReconciliationPath,
  bankReconciliationPath,
} = {}) {
  const cmStore = parseJsonFile(cmStorePath) || { rawItems: [], documents: [], expenseRecords: [] };
  const cfoExpenses = parseJsonFile(cfoExpensesPath) || [];
  const cfoExpensesById = Object.fromEntries(
    (Array.isArray(cfoExpenses) ? cfoExpenses : cfoExpenses.items || []).map((e) => [e.id, e])
  );
  const cardTransactions = loadTransactions(cardReconciliationPath);
  const bankTransactions = loadTransactions(bankReconciliationPath);

  const records = cmStore.expenseRecords || [];
  const receipts = records.filter((r) => r.expenseType === 'receipt');
  const invoices = records.filter((r) => r.expenseType === 'invoice');
  const travel = records.filter((r) =>
    ['travel', 'flight_ticket', 'hotel', 'taxi'].includes(r.expenseType)
  );

  const context = {
    rawItems: cmStore.rawItems || [],
    documents: cmStore.documents || [],
    cfoExpensesById,
    cardTransactions,
    bankTransactions,
  };

  const issuesByRecord = new Map();
  const allIssues = [];
  const recordSummaries = [];
  for (const record of records) {
    const issues = auditRecord(record, context);
    if (issues.length) {
      issuesByRecord.set(record.id, issues);
      const summaryRec = {
        id: record.id,
        supplierName: record.supplierName || null,
        amountIncVat: record.amountIncVat || 0,
        date: record.date || null,
        expenseType: record.expenseType,
        sourceType: record.rawItemId
          ? 'mail_import'
          : record.documentId
            ? 'manual_upload'
            : 'unknown',
        issueCount: issues.length,
        issueKinds: [...new Set(issues.map((i) => i.kind))],
      };
      recordSummaries.push(summaryRec);
      for (const issue of issues) {
        allIssues.push({
          recordId: record.id,
          recordSummary: summaryRec,
          rawItemId: record.rawItemId || undefined,
          documentId: record.documentId || undefined,
          ...issue,
        });
      }
    }
  }

  const duplicatePairs = findDuplicateCandidates(records);
  for (const pair of duplicatePairs) {
    const a = records.find((r) => r.id === pair.a);
    allIssues.push({
      recordId: pair.a,
      relatedRecordId: pair.b,
      recordSummary: a
        ? {
            id: a.id,
            supplierName: a.supplierName || null,
            amountIncVat: a.amountIncVat || 0,
            date: a.date || null,
            expenseType: a.expenseType,
            sourceType: a.rawItemId ? 'mail_import' : a.documentId ? 'manual_upload' : 'unknown',
          }
        : null,
      kind: 'DUPLICATE_CANDIDATE',
      severity: 'medium',
      message: 'Potentiell dubblett av en annan record inom 7 dagar.',
      suggestion: 'Granska båda posterna och merge:a eller avvisa en av dem.',
    });
  }

  const summary = {
    totalRecords: records.length,
    receipts: receipts.length,
    invoices: invoices.length,
    travel: travel.length,
    recordsWithIssues: issuesByRecord.size,
    missingAmount: allIssues.filter((i) => i.kind === 'MISSING_AMOUNT').length,
    missingSupplier: allIssues.filter((i) => i.kind === 'MISSING_SUPPLIER').length,
    missingDate: allIssues.filter((i) => i.kind === 'MISSING_DATE').length,
    missingDocument: allIssues.filter((i) =>
      ['MISSING_DOCUMENT', 'MISSING_ATTACHMENT'].includes(i.kind)
    ).length,
    suspiciousAttachment: allIssues.filter((i) => i.kind === 'SUSPICIOUS_ATTACHMENT').length,
    orphanedCfoLink: allIssues.filter((i) => i.kind === 'ORPHANED_CFO_LINK').length,
    unmatchedToBank: allIssues.filter((i) => i.kind === 'UNMATCHED_TO_BANK').length,
    supplierMismatch: allIssues.filter((i) => i.kind === 'BANK_DATE_AMOUNT_BUT_SUPPLIER_MISMATCH')
      .length,
    duplicateCandidates: duplicatePairs.length,
  };

  return {
    generatedAt: nowIso(),
    inputs: {
      cmStorePath: path.resolve(cmStorePath || ''),
      cfoExpensesPath: path.resolve(cfoExpensesPath || ''),
      cardReconciliationPath: path.resolve(cardReconciliationPath || ''),
      bankReconciliationPath: path.resolve(bankReconciliationPath || ''),
    },
    summary,
    issues: allIssues,
    stats: {
      rawItems: (cmStore.rawItems || []).length,
      documents: (cmStore.documents || []).length,
      cardTransactions: cardTransactions.length,
      bankTransactions: bankTransactions.length,
      cfoExpenses: Object.keys(cfoExpensesById).length,
    },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cm-store') out.cmStorePath = argv[++i];
    else if (arg === '--cfo-expenses') out.cfoExpensesPath = argv[++i];
    else if (arg === '--card-reconciliation') out.cardReconciliationPath = argv[++i];
    else if (arg === '--bank-reconciliation') out.bankReconciliationPath = argv[++i];
    else if (arg === '--output') out.outputPath = argv[++i];
  }
  return out;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  const report = runAudit({
    cmStorePath: args.cmStorePath || 'data/cm-expense.json',
    cfoExpensesPath: args.cfoExpensesPath || 'data/cco/expenses.json',
    cardReconciliationPath: args.cardReconciliationPath || 'data/cfo-card-reconciliation.json',
    bankReconciliationPath: args.bankReconciliationPath || 'data/cfo-bank-reconciliation.json',
  });

  const out = JSON.stringify(report, null, 2);
  if (args.outputPath) {
    fs.writeFileSync(args.outputPath, out, 'utf8');
    console.log(`[audit] rapport skriven till ${args.outputPath}`);
  } else {
    console.log(out);
  }
  process.exit(0);
}

module.exports = {
  runAudit,
  auditRecord,
  loadTransactions,
  findDuplicateCandidates,
  isSuspiciousAttachment,
  isValidDate,
};
