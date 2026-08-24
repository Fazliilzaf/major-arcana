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

function supplierMatches(txDescription, invoiceSupplier) {
  const desc = normalizeText(txDescription).toLowerCase();
  const supplier = normalizeText(invoiceSupplier).toLowerCase();
  if (!desc || !supplier) return false;
  // Google Ads-drabningar har typiskt "GOOGLE*ADS" eller "GOOGLE ADS" i beskrivningen.
  const aliases = {
    'google ads': ['google*ads', 'google ads', 'googleads'],
    'meta / facebook': ['facebk', 'facebook', 'meta'],
    apple: ['apple.com/bill', 'apple.com/se'],
    microsoft: ['microsoft', 'msbill'],
  };
  const tokens = aliases[supplier] || [supplier];
  return tokens.some((t) => desc.includes(t));
}

async function uploadInvoiceAsReceipt({ invoice, receiptStore, actor }) {
  if (!receiptStore || typeof receiptStore.uploadReceipt !== 'function') {
    return null;
  }
  // API-fakturor har ingen PDF-buffer än — vi sparar metadata-receipt som placeholder.
  // Nästa iteration kan hämta PDF via leverantörens dokument-API.
  const receipt = await receiptStore.uploadReceipt({
    buffer: Buffer.from(JSON.stringify(invoice.raw || {}, null, 2)),
    mimeType: 'application/json',
    originalFileName: `${invoice.supplier.replace(/\s+/g, '_')}_${invoice.invoiceNumber || 'invoice'}.json`,
    sourceSystem: 'vendor_api_import',
    actor,
    metadata: {
      supplier: invoice.supplier,
      amountSek: invoice.amountSek,
      date: invoice.date,
      notes: `Hämtat från ${invoice.supplier} API. Invoice# ${invoice.invoiceNumber || 'n/a'}`,
      vendorApiSource: invoice.sourceUrl,
    },
  });
  return receipt;
}

async function createExpenseFromInvoice({ tx, invoice, receiptStore, expenseStore, actor }) {
  const receipt = await uploadInvoiceAsReceipt({ invoice, receiptStore, actor });
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
      results.push({
        name: adapter.name,
        displayName: adapter.displayName,
        ok: res.ok,
        error: res.error || null,
        invoices: res.invoices || [],
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
  actor,
  threshold = 1000,
  fromDate,
  toDate,
} = {}) {
  const registry = createVendorRegistry(config?.vendors || {}, { connectorStore });
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

module.exports = {
  vendorFetchForTransaction,
  autoFetchVendorInvoices,
  fetchVendorInvoices,
  createVendorRegistry,
};
