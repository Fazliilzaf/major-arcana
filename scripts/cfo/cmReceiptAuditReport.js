'use strict';

/**
 * Genererar en läsbar Markdown/HTML-rapport från cmReceiptAudit JSON.
 *
 * Användning:
 *   node scripts/cfo/cmReceiptAuditReport.js --audit tmp/cm-audit-prod.json --output tmp/cm-audit-report.md
 */

const fs = require('node:fs');
const path = require('node:path');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--audit') out.auditPath = argv[++i];
    else if (arg === '--output') out.outputPath = argv[++i];
  }
  return out;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function severityEmoji(severity) {
  return { high: '🔴', medium: '🟡', info: '🔵' }[severity] || '⚪';
}

function groupByKind(issues) {
  const groups = new Map();
  for (const issue of issues) {
    if (!groups.has(issue.kind)) groups.set(issue.kind, []);
    groups.get(issue.kind).push(issue);
  }
  return groups;
}

function groupBySupplier(issues, kind) {
  const suppliers = new Map();
  for (const issue of issues.filter((i) => i.kind === kind)) {
    const name = normalizeText(issue.recordSummary?.supplierName || 'okänd');
    if (!suppliers.has(name)) suppliers.set(name, []);
    suppliers.get(name).push(issue);
  }
  return [...suppliers.entries()].sort((a, b) => b[1].length - a[1].length);
}

function main() {
  const args = parseArgs(process.argv);
  const auditPath = args.auditPath || 'tmp/cm-audit-prod.json';
  const outputPath = args.outputPath || 'tmp/cm-audit-report.md';

  const report = loadJson(auditPath);
  const summary = report.summary;
  const issues = report.issues || [];
  const groups = groupByKind(issues);

  const lines = [];
  lines.push('# CM/CFO Receipt Audit — Rapport');
  lines.push('');
  lines.push(`Genererad: ${new Date(report.generatedAt).toLocaleString('sv-SE')}`);
  lines.push(`Datakällor: CM-records, CFO-expenses, kortavstämning (prod).`);
  lines.push('');

  lines.push('## Sammanfattning');
  lines.push('');
  lines.push('| Mätvärde | Antal |');
  lines.push('|----------|-------|');
  lines.push(`| Totalt poster | ${summary.totalRecords} |`);
  lines.push(`| Kvitton | ${summary.receipts} |`);
  lines.push(`| Fakturor | ${summary.invoices} |`);
  lines.push(`| Resor | ${summary.travel} |`);
  lines.push(`| Poster med problem | ${summary.recordsWithIssues} |`);
  lines.push(`| CFO-expenses | ${report.stats?.cfoExpenses || 'n/a'} |`);
  lines.push(`| Korttransaktioner | ${report.stats?.cardTransactions || 'n/a'} |`);
  lines.push('');

  lines.push('## Problem per kategori');
  lines.push('');
  lines.push('| Problem | Antal | Allvarlighet | Förklaring |');
  lines.push('|---------|-------|--------------|------------|');
  const kindOrder = [
    ['MISSING_AMOUNT', '🔴', 'Saknar belopp — kan inte matchas/bokföras'],
    ['MISSING_DATE', '🔴', 'Saknar giltigt datum'],
    ['MISSING_ATTACHMENT', '🔴', 'Saknar bilaga/underlag'],
    ['MISSING_DOCUMENT', '🔴', 'Saknar dokument eller rå-mail'],
    ['SUSPICIOUS_ATTACHMENT', '🟡', 'Bilaga ser ut att vara patientdokument, inte kvitto'],
    ['MISSING_SUPPLIER', '🟡', 'Saknar leverantörsnamn'],
    ['ORPHANED_CFO_LINK', '🟡', 'Kopplad till CFO-expense som inte finns'],
    ['UNMATCHED_TO_BANK', '🔵', 'Hittar ingen kort/banktransaktion inom ±1 kr / ±7 dagar'],
    [
      'BANK_DATE_AMOUNT_BUT_SUPPLIER_MISMATCH',
      '🟡',
      'Matchar transaktion men leverantörsnamn stämmer inte',
    ],
    ['DUPLICATE_CANDIDATE', '🔵', 'Möjlig dubblett (samma leverantör, belopp, månad)'],
  ];
  for (const [kind, emoji, explanation] of kindOrder) {
    const count = groups.get(kind)?.length || 0;
    if (count > 0) {
      lines.push(`| ${emoji} ${kind} | ${count} | ${emoji} | ${explanation} |`);
    }
  }
  lines.push('');

  // Saknar belopp — top suppliers
  lines.push('## Saknar belopp (top leverantörer)');
  lines.push('');
  const missingAmountBySupplier = groupBySupplier(issues, 'MISSING_AMOUNT');
  lines.push('| Leverantör | Antal |');
  lines.push('|------------|-------|');
  for (const [supplier, items] of missingAmountBySupplier.slice(0, 20)) {
    lines.push(`| ${supplier} | ${items.length} |`);
  }
  lines.push('');

  // Misstänkta bilagor
  lines.push('## Misstänkta bilagor (patientdokument etc.)');
  lines.push('');
  const suspicious = groups.get('SUSPICIOUS_ATTACHMENT') || [];
  lines.push('| Leverantör | Datum | Belopp | Bilaga |');
  lines.push('|------------|-------|--------|--------|');
  for (const issue of suspicious.slice(0, 30)) {
    const s = issue.recordSummary || {};
    lines.push(
      `| ${s.supplierName || ''} | ${s.date || ''} | ${s.amountIncVat || ''} | ${issue.documentId || ''} |`
    );
  }
  if (suspicious.length > 30) lines.push(`| ... | | | (${suspicious.length - 30} till) |`);
  lines.push('');

  // Duplikat
  lines.push('## Duplikatkandidater (exempel)');
  lines.push('');
  const dups = groups.get('DUPLICATE_CANDIDATE') || [];
  lines.push('| A | B | Leverantör | Belopp | Nyckel |');
  lines.push('|---|---|------------|--------|--------|');
  for (const issue of dups.slice(0, 20)) {
    lines.push(
      `| ${issue.a} | ${issue.b} | ${issue.recordSummary?.supplierName || ''} | ${issue.recordSummary?.amountIncVat || ''} | ${issue.key} |`
    );
  }
  if (dups.length > 20) lines.push(`| ... | | | | (${dups.length - 20} till) |`);
  lines.push('');

  // Rekommendationer
  lines.push('## Rekommendationer');
  lines.push('');
  lines.push(
    '1. **Åtgärda saknade belopp först** — 971 poster kan varken matchas mot kort eller bokföras.'
  );
  lines.push(
    '2. **Importera kompletta kortutdrag** — 975 poster saknar matchning. Det nuvarande kortutdraget har 703 transaktioner.'
  );
  lines.push(
    '3. **Granska misstänkta bilagor** — 158 poster har troligen fel bilaga (patientdokument istället för kvitto).'
  );
  lines.push(
    '4. **Kör bulk-reextract på poster med saknat belopp/datum/leverantör** — använd `cmReceiptRepair.js` i dry-run först.'
  );
  lines.push('5. **Godkänn eller avvisa duplikat** — 242 kandidater behöver manuell granskning.');
  lines.push('');

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`[report] rapport sparad: ${outputPath}`);
}

main();
