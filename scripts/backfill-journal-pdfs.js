#!/usr/bin/env node
'use strict';

/**
 * scripts/backfill-journal-pdfs.js
 *
 * P0.5 backfill — generera PDF för alla redan signerade journal-entries som
 * saknar `pdfPath`. Resultat: 8 av 8 signed entries får sin lock-PDF.
 *
 * Compliance:
 *   - Inga patientnamn / personnummer / email loggas — counts only.
 *   - Atomic writes (json-fil) via applyPdfArtifact() (samma flow som auto-gen).
 *   - Tamper-hash sparas så senare verifiering möjlig.
 *   - Backup-tag inför destruktiva ändringar via --commit (state-fil-kopia).
 *
 * Usage:
 *   node scripts/backfill-journal-pdfs.js                # dry-run
 *   node scripts/backfill-journal-pdfs.js --commit       # write to disk
 *   node scripts/backfill-journal-pdfs.js --commit --limit 3
 *   node scripts/backfill-journal-pdfs.js --tenant hairtpclinic
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JOURNAL_PATH = path.join(ROOT, 'data', 'cco-journal.json');
const PDF_DIR = path.join(ROOT, 'data', 'cco-journal-pdfs');
const AUDIT_PATH = path.join(ROOT, 'data', 'cco-audit.jsonl');

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const tenantIdx = args.indexOf('--tenant');
const TENANT_FILTER = tenantIdx >= 0 ? args[tenantIdx + 1] : null;
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

function log(...rest) {
  // eslint-disable-next-line no-console
  console.log('[backfill-journal-pdfs]', ...rest);
}

async function getChromiumOrSkip() {
  try {
    const pw = require('playwright');
    return pw.chromium;
  } catch (err) {
    log('Playwright/chromium ej tillgängligt:', err.message);
    return null;
  }
}

async function appendAudit(event) {
  try {
    await fs.mkdir(path.dirname(AUDIT_PATH), { recursive: true });
    await fs.appendFile(AUDIT_PATH, JSON.stringify(event) + '\n');
  } catch (err) {
    log('audit-append fel (icke-blockerande):', err.message);
  }
}

async function backupJournalFile() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dst = `${JOURNAL_PATH}.pre-pdf-backfill-${ts}.bak`;
  await fs.copyFile(JOURNAL_PATH, dst);
  log('backup:', path.basename(dst));
}

async function main() {
  const { createCcoJournalStore } = require('../src/ops/ccoJournalStore');
  const { exportJournalEntryToPdf } = require('../src/ops/ccoJournalPdfExport');

  const store = await createCcoJournalStore({ filePath: JOURNAL_PATH });
  const allEntries = await store.listAllEntries({});
  const signedNoPdf = allEntries.filter(
    (e) =>
      e.locked === true &&
      !e.pdfPath &&
      (!TENANT_FILTER || e.tenantId === TENANT_FILTER)
  );

  log('mode:', COMMIT ? 'COMMIT' : 'DRY-RUN');
  log('totalEntries:', allEntries.length);
  log('signedEntries:', allEntries.filter((e) => e.locked).length);
  log('alreadyHavePdf:', allEntries.filter((e) => e.pdfPath).length);
  log('targets (signed without pdf):', signedNoPdf.length);
  if (TENANT_FILTER) log('tenantFilter:', TENANT_FILTER);
  if (LIMIT !== Infinity) log('limit:', LIMIT);

  if (!signedNoPdf.length) {
    log('inget att backfilla — exit.');
    return;
  }

  if (!COMMIT) {
    log('dry-run klar. Kör med --commit för att skriva PDFs.');
    return;
  }

  const chromium = await getChromiumOrSkip();
  if (!chromium) {
    log('FATAL: kan inte committa utan chromium. avbryter.');
    process.exitCode = 1;
    return;
  }
  const getChromium = () => chromium;

  await backupJournalFile();
  await fs.mkdir(PDF_DIR, { recursive: true });

  let success = 0;
  let failed = 0;
  let bytesTotal = 0;

  const targets = signedNoPdf.slice(0, LIMIT);
  for (const entry of targets) {
    try {
      const result = await exportJournalEntryToPdf({
        entry,
        getChromium,
      });
      const pdfPath = path.join(PDF_DIR, `${entry.entryId}.pdf`);
      await fs.writeFile(pdfPath, result.buffer);
      await store.applyPdfArtifact({
        tenantId: entry.tenantId,
        patientId: entry.patientId,
        entryId: entry.entryId,
        pdfPath,
        pdfTamperHash: result.tamperHash,
        pdfSizeBytes: result.sizeBytes,
      });
      await appendAudit({
        ts: new Date().toISOString(),
        actor: { role: 'system', userId: 'backfill-job' },
        action: 'journal.pdf_generated_at_signing',
        target: { kind: 'journal_entry', id: entry.entryId, tenantId: entry.tenantId },
        result: 'ok',
        detail: {
          backfill: true,
          tamperHash: result.tamperHash,
          sizeBytes: result.sizeBytes,
          signedAt: entry.signedAt,
        },
      });
      success += 1;
      bytesTotal += result.sizeBytes;
    } catch (err) {
      failed += 1;
      log('FAIL entry', entry.entryId, '·', err.message);
      await appendAudit({
        ts: new Date().toISOString(),
        actor: { role: 'system', userId: 'backfill-job' },
        action: 'journal.pdf_generated_at_signing',
        target: { kind: 'journal_entry', id: entry.entryId, tenantId: entry.tenantId },
        result: 'error',
        detail: { error: err.message, backfill: true },
      });
    }
  }

  log('done · success:', success, '· failed:', failed, '· bytes:', bytesTotal);
}

main().catch((err) => {
  log('CRASH:', err.message);
  process.exitCode = 1;
});
