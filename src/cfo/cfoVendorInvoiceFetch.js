'use strict';

/**
 * cfoVendorInvoiceFetch — auto-hämta fakturor direkt från leverantörers API.
 *
 * ORD-102d-2: för stora omatchade kortdragningar där underlaget inte finns i
 * mailbox/CFO/CM ska systemet kunna hämta fakturor direkt från leverantörers
 * API (Google Ads, Meta, Apple, Microsoft m.fl.).
 *
 * Designlås: vi skapar ALDRIG en expense ur en kortrad utan underlag.
 * Hämtad faktura blir underlaget; kortraden är bara bevis på betalning.
 */

const { createVendorRegistry } = require('./vendors/vendorRegistry');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function parseDate(value) {
  const str = normalizeText(value);
  if (!str) return null;
  const iso = str.replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso;
}

function deriveDateWindow(transactions, { marginDays = 7 } = {}) {
  const unmatched = (transactions || []).filter((t) => t.date);
  if (unmatched.length === 0) return null;
  const dates = unmatched.map((t) => t.date).sort();
  const min = dates[0];
  const max = dates[dates.length - 1];
  const dMin = new Date(`${min}T00:00:00Z`);
  const dMax = new Date(`${max}T00:00:00Z`);
  dMin.setUTCDate(dMin.getUTCDate() - marginDays);
  dMax.setUTCDate(dMax.getUTCDate() + marginDays);
  return {
    fromDate: dMin.toISOString().slice(0, 10),
    toDate: dMax.toISOString().slice(0, 10),
  };
}

function amountMatches(a, b, tolerance = 1.0) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) <= tolerance;
}

function normalizeVendorKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function supplierMatches(txDescription, invoiceSupplier) {
  const desc = normalizeVendorKey(txDescription);
  const supplier = normalizeText(invoiceSupplier).toLowerCase();
  if (!desc || !supplier) return false;
  // Alias skrivs i normaliserad form (utan mellanslag/specialtecken) eftersom
  // både tx-beskrivning och leverantörsnamn normaliseras innan jämförelse.
  // T.ex. "GOOGLE *ADS6707274243 CC@GOOGLE.COM" → "googleads6707274243ccgooglecom".
  const aliases = {
    'google ads': ['googleads'],
    'meta / facebook': ['facebk', 'facebook', 'meta'],
    apple: ['applecom', 'applebill'],
    microsoft: ['microsoft', 'msbill'],
  };
  const tokens = aliases[supplier] || [normalizeVendorKey(invoiceSupplier)];
  return tokens.some((t) => t && desc.includes(t));
}

async function uploadInvoiceAsReceipt({ invoice, receiptStore, actor, registry = null }) {
  if (!receiptStore || typeof receiptStore.uploadReceipt !== 'function') {
    return null;
  }
  // Försök hämta själva faktura-PDF:en från leverantörens dokument-API
  // (t.ex. Google Ads invoice.pdfUrl). Fall tillbaka på JSON-metadata om
  // PDF inte går att hämta — då markeras kvittot för granskning.
  const pdf = await downloadInvoicePdf(invoice, registry);
  const isPdf = Boolean(pdf && pdf.ok && pdf.buffer);
  const receipt = await receiptStore.uploadReceipt({
    buffer: isPdf ? pdf.buffer : Buffer.from(JSON.stringify(invoice.raw || {}, null, 2)),
    mimeType: isPdf ? 'application/pdf' : 'application/json',
    originalFileName: isPdf
      ? `${invoice.supplier.replace(/\s+/g, '_')}_${invoice.invoiceNumber || 'invoice'}.pdf`
      : `${invoice.supplier.replace(/\s+/g, '_')}_${invoice.invoiceNumber || 'invoice'}.json`,
    sourceSystem: 'vendor_api_import',
    actor,
    metadata: {
      supplier: invoice.supplier,
      amountSek: invoice.amountSek,
      date: invoice.date,
      notes: `Hämtat från ${invoice.supplier} API. Invoice# ${invoice.invoiceNumber || 'n/a'}${isPdf ? '' : ' (PDF saknas — metadata-placeholder)'}`,
      vendorApiSource: invoice.sourceUrl,
    },
  });
  return receipt;
}

// Slår upp rätt adapter i registret och hämtar PDF om adaptern stödjer det.
async function downloadInvoicePdf(invoice, registry) {
  if (!invoice || !invoice.pdfUrl || !registry) return null;
  const adapter = (registry.adapters || []).find(
    (a) => a.name === invoice.vendorName && typeof a.fetchInvoicePdfBuffer === 'function'
  );
  if (!adapter) return null;
  try {
    return await adapter.fetchInvoicePdfBuffer(invoice.pdfUrl);
  } catch (err) {
    return { ok: false, error: err?.message || 'PDF-nedladdning misslyckades', buffer: null };
  }
}

async function createExpenseFromInvoice({
  tx,
  invoice,
  receiptStore,
  expenseStore,
  actor,
  registry = null,
}) {
  const receipt = await uploadInvoiceAsReceipt({ invoice, receiptStore, actor, registry });
  const expense = await expenseStore.createExpense({
    actor,
    receiptId: receipt?.id || null,
    fields: {
      supplier: invoice.supplier,
      amountSek:
        Number(invoice.amountSek) || Number(invoice.amountOriginal) || Number(tx.amountSek),
      vatSek: invoice.vatSek,
      date: tx.date,
      category: null,
      paymentMethod: 'card',
      notes: `Kortdragning ${tx.cardRef || ''} ${tx.date} ${tx.description}. Faktura från ${invoice.supplier} API: ${invoice.invoiceNumber || 'n/a'}`,
    },
  });
  return { expense, receipt };
}

async function fetchVendorInvoices({ registry, fromDate, toDate }) {
  const adapters = registry.listConfigured({ fromDate, toDate });
  const results = [];
  for (const adapter of adapters) {
    try {
      const res = await adapter.fetchInvoices({ fromDate, toDate });
      const invoices = (res.invoices || []).map((inv) => ({ ...inv, vendorName: adapter.name }));
      results.push({
        name: adapter.name,
        displayName: adapter.displayName,
        ok: res.ok,
        error: res.error || null,
        invoices,
      });
    } catch (err) {
      results.push({
        name: adapter.name,
        displayName: adapter.displayName,
        ok: false,
        error: err?.message || 'okänt fel',
        invoices: [],
      });
    }
  }
  return results;
}

async function vendorFetchForTransaction(
  tx,
  { registry, fromDate, toDate, receiptStore, expenseStore, reconciliation, actor } = {}
) {
  const result = {
    tx,
    matched: false,
    source: null,
    expenseId: null,
    receiptId: null,
    message: null,
    evidence: null,
  };

  const adapterResults = await fetchVendorInvoices({ registry, fromDate, toDate });
  const allInvoices = adapterResults.flatMap((r) => r.invoices || []);

  const candidates = allInvoices.filter((inv) => {
    if (!inv.date || !tx.date) return false;
    if (daysBetween(inv.date, tx.date) > 14) return false;
    if (!amountMatches(inv.amountSek ?? inv.amountOriginal, tx.amountSek)) return false;
    return supplierMatches(tx.description, inv.supplier);
  });

  if (candidates.length === 0) {
    result.message = 'Inga fakturor från leverantörs-API matchade transaktionen';
    return result;
  }

  // Välj den med minst beloppsdiff.
  candidates.sort((a, b) => {
    const da = Math.abs((a.amountSek ?? a.amountOriginal) - tx.amountSek);
    const db = Math.abs((b.amountSek ?? b.amountOriginal) - tx.amountSek);
    return da - db;
  });

  const invoice = candidates[0];

  const created = await createExpenseFromInvoice({
    tx,
    invoice,
    receiptStore,
    expenseStore,
    actor,
    registry,
  });

  result.matched = true;
  result.source = 'vendor_api';
  result.expenseId = created.expense.id;
  result.receiptId = created.receipt?.id || null;
  result.message = `Skapade CFO-expense + kvitto från ${invoice.supplier} API`;
  result.evidence = {
    supplier: invoice.supplier,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
  };

  // Bekräfta matchning om reconciliation finns.
  if (reconciliation && typeof reconciliation.confirmMatch === 'function') {
    try {
      const confirmed = await reconciliation.confirmMatch(tx.id, result.expenseId, { actor });
      if (confirmed?.error) {
        result.matchConfirmed = false;
        result.matchError = confirmed.error;
      } else {
        result.matchConfirmed = true;
        result.transaction = confirmed;
      }
    } catch (err) {
      result.matchConfirmed = false;
      result.matchError = err.message;
    }
  }

  return result;
}

async function autoFetchVendorInvoices({
  reconciliation,
  expenseStore,
  receiptStore,
  config,
  connectorStore = null,
  googleAdsConnectorStore = null,
  metaAdsConnectorStore = null,
  actor,
  threshold = 1000,
  fromDate,
  toDate,
} = {}) {
  const registry = createVendorRegistry(config?.vendorInvoiceFetch || config?.vendors || {}, {
    connectorStore,
    googleAdsConnectorStore,
    metaAdsConnectorStore,
  });
  const configured = registry.listConfigured({ fromDate, toDate });
  if (configured.length === 0) {
    return {
      ok: true,
      configuredVendors: registry.listAll(),
      scanned: 0,
      matched: 0,
      vendorResults: [],
      message: 'Inga leverantörs-API:er är konfigurerade',
    };
  }

  const unmatched = reconciliation.listTransactions({ status: 'unmatched', limit: 10000 });
  const targets = unmatched.filter((t) => Number(t.amountSek) >= threshold);
  if (targets.length === 0) {
    return {
      ok: true,
      configuredVendors: registry.listAll(),
      scanned: 0,
      matched: 0,
      vendorResults: [],
      message: 'Inga omatchade transaktioner över tröskeln',
    };
  }

  const window = !fromDate || !toDate ? deriveDateWindow(targets) : { fromDate, toDate };

  const vendorResults = await fetchVendorInvoices({
    registry,
    fromDate: window.fromDate,
    toDate: window.toDate,
  });

  const results = [];
  for (const tx of targets) {
    let r;
    try {
      r = await vendorFetchForTransaction(tx, {
        registry,
        fromDate: window.fromDate,
        toDate: window.toDate,
        receiptStore,
        expenseStore,
        reconciliation,
        actor,
      });
    } catch (err) {
      r = {
        tx,
        matched: false,
        source: null,
        expenseId: null,
        receiptId: null,
        message: `Fel vid vendor-sökning: ${err.message}`,
        evidence: null,
        error: err.message,
      };
    }
    results.push(r);
  }

  return {
    ok: true,
    configuredVendors: registry.listAll(),
    window,
    threshold,
    scanned: targets.length,
    matched: results.filter((r) => r.matched).length,
    vendorResults,
    results,
  };
}

// Matchar en faktura mot ett kvitto. Google Ads/Meta fakturerar månadsvis
// aggregerat medan kortet dras i 5000-kr-svängar — beloppet matchar därför
// ALDRIG per dragning. För dessa leverantörer räcker leverantör + samma
// kalendermånad som bevis på att fakturan är underlaget.
function invoiceMatchesReceipt(invoice, receipt) {
  const supplierOk =
    supplierMatches(receipt.notes || '', invoice.supplier) ||
    supplierMatches(receipt.supplier || '', invoice.supplier) ||
    supplierMatches(invoice.supplier || '', receipt.supplier || '');
  if (!supplierOk) return false;
  const monthlyVendors = ['google_ads', 'meta_ads'];
  if (monthlyVendors.includes(invoice.vendorName)) {
    const invMonth = String(invoice.invoicePeriod || invoice.date || '')
      .slice(0, 6)
      .replace('-', '');
    const rMonth = String(receipt.date || '')
      .slice(0, 7)
      .replace('-', '');
    if (!invMonth || !rMonth) return false;
    return invMonth === rMonth;
  }
  // Övriga: belopp + datumfönster som vid transaktionsmatchning.
  if (!invoice.date || !receipt.date) return false;
  if (daysBetween(invoice.date, receipt.date) > 14) return false;
  return amountMatches(invoice.amountSek ?? invoice.amountOriginal, receipt.amountSek);
}

/**
 * repairReceiptsFromVendorInvoices — reparerar kvitton med felkopplade
 * (delade) storageKeys genom att hämta riktiga faktura-PDF:er från
 * leverantörs-API:er och byta ut underlaget via repairStorageKey.
 *
 * dryRun=true som standard. Sätt dryRun=false för skarp körning.
 */
async function repairReceiptsFromVendorInvoices({
  receiptStore,
  registry,
  fromDate,
  toDate,
  actor,
  dryRun = true,
  limit = 0,
} = {}) {
  if (!receiptStore || typeof receiptStore.listReceipts !== 'function') {
    return { ok: false, error: 'receiptStore saknas' };
  }
  if (!receiptStore.repairStorageKey) {
    return { ok: false, error: 'receiptStore saknar repairStorageKey' };
  }
  if (!registry) {
    return { ok: false, error: 'vendor registry saknas' };
  }

  const receipts = receiptStore.listReceipts({ limit: 10000 });
  const keyCount = new Map();
  for (const r of receipts) {
    if (!r.storageKey) continue;
    keyCount.set(r.storageKey, (keyCount.get(r.storageKey) || 0) + 1);
  }
  let broken = receipts.filter((r) => r.storageKey && keyCount.get(r.storageKey) > 1);
  // Hoppa över kvitton som redan reparerats via denna väg.
  broken = broken.filter((r) => !String(r.notes || '').includes('[REPAIR-VENDOR]'));
  if (limit > 0) broken = broken.slice(0, limit);

  const vendorResults = await fetchVendorInvoices({ registry, fromDate, toDate });
  const allInvoices = vendorResults.flatMap((r) => r.invoices || []);

  const results = [];
  let repaired = 0;
  for (const r of broken) {
    const candidates = allInvoices.filter((inv) => invoiceMatchesReceipt(inv, r));
    if (candidates.length === 0) {
      results.push({
        receiptId: r.id,
        supplier: r.supplier,
        date: r.date,
        status: 'no_vendor_match',
      });
      continue;
    }
    const invoice = candidates[0];
    if (!invoice.pdfUrl) {
      results.push({
        receiptId: r.id,
        supplier: r.supplier,
        date: r.date,
        status: 'invoice_without_pdf',
        invoiceNumber: invoice.invoiceNumber || null,
      });
      continue;
    }
    if (dryRun) {
      results.push({
        receiptId: r.id,
        supplier: r.supplier,
        date: r.date,
        status: 'would_repair',
        invoiceNumber: invoice.invoiceNumber || null,
        vendor: invoice.vendorName,
      });
      continue;
    }
    try {
      const pdf = await downloadInvoicePdf(invoice, registry);
      if (!pdf || !pdf.ok || !pdf.buffer) {
        results.push({
          receiptId: r.id,
          supplier: r.supplier,
          date: r.date,
          status: 'pdf_download_failed',
          error: pdf?.error || 'okänt fel',
        });
        continue;
      }
      await receiptStore.repairStorageKey({
        id: r.id,
        buffer: pdf.buffer,
        mimeType: 'application/pdf',
        originalFileName: `${invoice.supplier.replace(/\s+/g, '_')}_${invoice.invoiceNumber || 'invoice'}.pdf`,
        actor,
        reason: `repair-from-vendors: ${invoice.vendorName} faktura ${invoice.invoiceNumber || 'n/a'}`,
      });
      await receiptStore.updateReceipt({
        id: r.id,
        patch: {
          notes:
            `${String(r.notes || '').trim()}\n[REPAIR-VENDOR] Underlag ersatt med ${invoice.supplier}-faktura ${invoice.invoiceNumber || 'n/a'} (${invoice.invoicePeriod || invoice.date})`.trim(),
        },
        actor,
      });
      repaired += 1;
      results.push({
        receiptId: r.id,
        supplier: r.supplier,
        date: r.date,
        status: 'repaired',
        invoiceNumber: invoice.invoiceNumber || null,
        vendor: invoice.vendorName,
      });
    } catch (err) {
      results.push({
        receiptId: r.id,
        supplier: r.supplier,
        date: r.date,
        status: 'error',
        error: err?.message || 'okänt fel',
      });
    }
  }

  return {
    ok: true,
    dryRun,
    window: { fromDate, toDate },
    brokenReceipts: broken.length,
    invoicesFound: allInvoices.length,
    vendorResults: vendorResults.map((r) => ({
      name: r.name,
      ok: r.ok,
      error: r.error,
      invoiceCount: (r.invoices || []).length,
    })),
    repaired,
    results,
  };
}

module.exports = {
  vendorFetchForTransaction,
  autoFetchVendorInvoices,
  fetchVendorInvoices,
  repairReceiptsFromVendorInvoices,
  createVendorRegistry,
};
