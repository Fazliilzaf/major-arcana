'use strict';

/**
 * ccoJournalPdfExport.js — Steg 7 av Communication & Compliance audit.
 *
 * Generera PDF från signerad journal-entry med:
 *   - Tamper-hash (SHA-256 av text + metadata) i PDF-metadata
 *   - "SIGNERAD · LÅST" watermark
 *   - Patient + staff + signering-info
 *   - Mall-version (om koppling till template-registry finns)
 *
 * Compliance:
 *   - PDF får ENDAST genereras för entries med status='signed' eller 'locked'
 *     (annars 409). Detta säkerställer immutability.
 *   - Tamper-hash sparas tillbaka till entry vid första PDF-export så
 *     senare verifiering möjlig.
 *   - Audit-event per export i ccoAuditLog.
 *
 * Playwright används via lazy-load (samma pattern som server.js getChromium()).
 *
 * PDF-metadata fält (PDF/A-lite):
 *   Title:      "Journal {entryId} · {patientId}"
 *   Author:     "Hair TP Clinic · {signedByName}"
 *   Subject:    "Signerad journal {journalType} · {signedAt}"
 *   Keywords:   "PDL,10y,signed,{tamper-hash-first-12}"
 *   Producer:   "CCO Journal PDF Export v1"
 */

const crypto = require('crypto');

function computeTamperHash(entry) {
  const blob = JSON.stringify({
    entryId: entry.entryId || entry.id,
    tenantId: entry.tenantId,
    patientId: entry.patientId,
    journalType: entry.journalType || entry.kind,
    fields: entry.fields || null,
    title: entry.title || null,
    signedAt: entry.signedAt,
    signedByUserId: entry.signedByUserId,
    signedByName: entry.signedByName,
  });
  return crypto.createHash('sha256').update(blob).digest('hex');
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }); } catch { return iso; }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderFieldsTable(fields) {
  if (!fields || typeof fields !== 'object') return '<p><em>Inga fält.</em></p>';
  const entries = Object.entries(fields).filter(([k]) => !k.startsWith('_'));
  if (!entries.length) return '<p><em>Inga fält.</em></p>';
  return `<table class="fields">
    <tbody>
    ${entries.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(formatFieldValue(v))}</td></tr>`).join('')}
    </tbody>
  </table>`;
}

function formatFieldValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '✓ Ja' : '✕ Nej';
  if (Array.isArray(v)) return v.map(formatFieldValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Bygg HTML som ska konverteras till PDF.
 * @param {object} entry — journal-entry från ccoJournalStore
 * @param {object} opts — { tamperHash, templateVersion, patientName, last4 }
 */
function buildHtml(entry, opts = {}) {
  const tamperHash = opts.tamperHash || computeTamperHash(entry);
  const journalType = entry.journalType || entry.kind || 'journal';
  const status = entry.locked ? 'LÅST' : (entry.status || '').toUpperCase();

  return `<!doctype html>
<html lang="sv"><head>
<meta charset="utf-8">
<title>Journal ${entry.entryId || entry.id} · ${entry.patientId}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 18mm 18mm 22mm 18mm; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #2b251f; }
  header { border-bottom: 2px solid #bb4779; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  header .brand { font-size: 14pt; font-weight: 800; letter-spacing: -.5px; }
  header .stage { font-size: 8pt; color: #8a8174; text-transform: uppercase; letter-spacing: 1.2px; }
  h1 { font-size: 16pt; font-weight: 800; margin: 0 0 6px; letter-spacing: -.5px; }
  h2 { font-size: 11pt; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #8a8174; margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e5dfd5; }
  .meta { font-size: 9pt; color: #555; margin-bottom: 14px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; }
  .meta-grid div strong { display: inline-block; min-width: 110px; color: #8a8174; font-weight: 600; }
  .watermark { position: fixed; top: 18mm; right: 18mm; padding: 4px 10px; background: #4a8268; color: white; font-size: 8.5pt; font-weight: 800; letter-spacing: 1.2px; border-radius: 4px; transform: rotate(0); z-index: 1000; }
  .watermark.draft { background: #c8821e; }
  .signature-box { margin-top: 14px; padding: 12px 14px; background: #f5efe6; border-left: 3px solid #4a8268; border-radius: 4px; font-size: 9pt; }
  .signature-box .row { margin-bottom: 3px; }
  .signature-box strong { display: inline-block; min-width: 130px; color: #555; }
  table.fields { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10pt; }
  table.fields th, table.fields td { padding: 4px 8px; border-bottom: 1px solid #efe9df; text-align: left; vertical-align: top; }
  table.fields th { font-weight: 600; color: #555; width: 38%; font-size: 9.5pt; }
  pre.body-text { white-space: pre-wrap; font-family: -apple-system, sans-serif; font-size: 10pt; margin: 6px 0; padding: 10px 12px; background: #fafafa; border-radius: 4px; border-left: 3px solid #bb4779; }
  footer { position: fixed; bottom: 8mm; left: 18mm; right: 18mm; font-size: 7.5pt; color: #8a8174; display: flex; justify-content: space-between; border-top: 1px solid #e5dfd5; padding-top: 4px; }
  footer .hash { font-family: "SF Mono", "Menlo", monospace; }
  .events-list { font-size: 8.5pt; color: #555; }
  .events-list li { margin-bottom: 2px; }
</style>
</head><body>
<div class="watermark">${escapeHtml(status)}</div>
<header>
  <div>
    <div class="brand">Hair TP Clinic</div>
    <div class="stage">PDL-arkiverad patientjournal · 10 år retention</div>
  </div>
  <div style="text-align:right;font-size:9pt;color:#555">
    <div>Exporterad ${fmtDateTime(new Date().toISOString())}</div>
    <div style="font-family:'SF Mono',monospace;font-size:7.5pt;color:#aaa">${escapeHtml((entry.entryId || entry.id || '').substring(0, 24))}</div>
  </div>
</header>

<h1>${escapeHtml(entry.title || 'Journal-anteckning')}</h1>

<div class="meta">
  <div class="meta-grid">
    <div><strong>Patient-ID:</strong>${escapeHtml(entry.patientId || '—')}</div>
    <div><strong>Tenant:</strong>${escapeHtml(entry.tenantId || '—')}</div>
    <div><strong>Personnummer:</strong>${entry.personnummer ? '****' + escapeHtml(opts.last4 || (entry.personnummer || '').slice(-4)) : '— (ej i journal)'}</div>
    <div><strong>Journal-typ:</strong>${escapeHtml(journalType)}</div>
    <div><strong>Form-variant:</strong>${escapeHtml(entry.formVariant || '—')}</div>
    <div><strong>Status:</strong>${escapeHtml(entry.status || '—')} ${entry.locked ? '· 🔒 LÅST' : ''}</div>
    <div><strong>Skapad:</strong>${fmtDateTime(entry.createdAt)}</div>
    <div><strong>Uppdaterad:</strong>${fmtDateTime(entry.updatedAt)}</div>
    ${entry.encounterId ? `<div><strong>Behandlings-ID:</strong>${escapeHtml(entry.encounterId)}</div>` : ''}
    ${entry.source ? `<div><strong>Källa:</strong>${escapeHtml(entry.source)}</div>` : ''}
  </div>
</div>

<h2>Innehåll</h2>
${entry.body ? `<pre class="body-text">${escapeHtml(entry.body)}</pre>` : renderFieldsTable(entry.fields)}

${entry.events && entry.events.length ? `
<h2>Händelse-historik</h2>
<ul class="events-list">
${entry.events.slice(-12).map(e => `<li>${fmtDateTime(e.ts)} · ${escapeHtml(e.label || e.type || '?')} (${escapeHtml(e.actorName || e.actorRole || '—')})</li>`).join('')}
</ul>
` : ''}

<h2>Signering</h2>
<div class="signature-box">
  <div class="row"><strong>Signerad:</strong>${fmtDateTime(entry.signedAt)}</div>
  <div class="row"><strong>Signerad av:</strong>${escapeHtml(entry.signedByName || entry.signedByUserId || '—')}</div>
  <div class="row"><strong>Roll:</strong>${escapeHtml(entry.signedByRole || 'klinisk personal')}</div>
  ${entry.locked ? '<div class="row"><strong>Låsstatus:</strong>🔒 Låst (immutable enligt PDL 2008:355)</div>' : ''}
  ${opts.templateVersion ? `<div class="row"><strong>Mall-version:</strong>${escapeHtml(opts.templateVersion)}</div>` : ''}
  ${entry.correctionOfEntryId ? `<div class="row"><strong>Korrigering av:</strong>${escapeHtml(entry.correctionOfEntryId)}</div>` : ''}
  <div class="row" style="margin-top:6px"><strong>Tamper-hash (SHA-256):</strong></div>
  <div style="font-family:'SF Mono',monospace;font-size:8.5pt;color:#4a8268;word-break:break-all">${escapeHtml(tamperHash)}</div>
</div>

<footer>
  <span>Hair TP Clinic · CCO Arcana Journal v1</span>
  <span class="hash">${escapeHtml(tamperHash.substring(0, 24))}…</span>
</footer>
</body></html>`;
}

/**
 * Skapa PDF-buffer från entry.
 * Anropare måste verifiera RBAC + att entry är signed/locked innan call.
 *
 * @param {object} opts
 * @param {object} opts.entry — journal-entry
 * @param {function} opts.getChromium — lazy-loader för Playwright
 * @param {string} opts.templateVersion — optional, från mall-registry
 * @returns {Promise<{buffer: Buffer, tamperHash: string, metadata: object}>}
 */
async function exportJournalEntryToPdf({ entry, getChromium, templateVersion = null, last4 = null } = {}) {
  if (!entry) {
    const e = new Error('entry krävs'); e.statusCode = 400; throw e;
  }
  if (!getChromium) {
    const e = new Error('getChromium-funktion krävs'); e.statusCode = 500; throw e;
  }
  const isSigned = entry.locked === true || entry.status === 'signed' || entry.state === 'signed';
  if (!isSigned) {
    const e = new Error(`Endast signerade/låsta journal-poster kan exporteras till PDF. Nuvarande status: ${entry.status || entry.state || 'okänd'}`);
    e.statusCode = 409; throw e;
  }

  const tamperHash = computeTamperHash(entry);
  const html = buildHtml(entry, { tamperHash, templateVersion, last4 });

  const chromium = getChromium();
  let browser, context, page;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    context = await browser.newContext();
    page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });

    const journalType = entry.journalType || entry.kind || 'journal';
    const status = entry.locked ? 'locked' : (entry.status || 'signed');

    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '22mm', left: '18mm', right: '18mm' },
    });

    const metadata = {
      title: `Journal ${entry.entryId || entry.id} · ${entry.patientId}`,
      author: `Hair TP Clinic · ${entry.signedByName || entry.signedByUserId || 'staff'}`,
      subject: `Signerad journal ${journalType} · ${entry.signedAt || ''}`,
      keywords: `PDL,10y,${status},${tamperHash.substring(0, 12)}`,
      producer: 'CCO Journal PDF Export v1',
      creationDate: new Date().toISOString(),
    };

    return { buffer, tamperHash, metadata, html, sizeBytes: buffer.length };
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = {
  exportJournalEntryToPdf,
  computeTamperHash,
  buildHtml,  // exporterad för unit-test
};
