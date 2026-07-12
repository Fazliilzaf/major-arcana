'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cacheKey(tenantId, customerNumber) {
  return `${normalizeText(tenantId)}::${normalizeText(customerNumber)}`;
}

function createCfoFortnoxInvoiceLister({
  createClientFor,
  cacheTtlMs = 60_000,
  periodCacheTtlMs = 10 * 60 * 1000,
} = {}) {
  if (typeof createClientFor !== 'function') {
    throw new Error('createClientFor krävs för cfoFortnoxInvoiceLister.');
  }
  const cache = new Map();
  const periodCache = new Map();

  async function listInvoicesForCustomer({ tenantId, customerNumber } = {}) {
    const customer = normalizeText(customerNumber);
    if (!customer) {
      return { ok: false, invoices: [], payments: [], error: 'customerNumber saknas.' };
    }
    const key = cacheKey(tenantId, customer);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < cacheTtlMs) {
      return { ...cached.value, cached: true };
    }
    try {
      const client = await createClientFor(tenantId);
      const invoicePayload = await client.listInvoices({ customerNumber: customer, page: 1 });
      let paymentPayload = { InvoicePayments: [] };
      try {
        paymentPayload = await client.listInvoicePayments({ customerNumber: customer, page: 1 });
      } catch {
        paymentPayload = { InvoicePayments: [] };
      }
      const value = {
        ok: true,
        invoices: Array.isArray(invoicePayload?.Invoices) ? invoicePayload.Invoices : [],
        payments: Array.isArray(paymentPayload?.InvoicePayments)
          ? paymentPayload.InvoicePayments
          : [],
        cached: false,
        error: null,
      };
      cache.set(key, { at: Date.now(), value });
      return value;
    } catch (error) {
      return {
        ok: false,
        invoices: [],
        payments: [],
        cached: false,
        error: error?.message || 'Fortnox invoice list misslyckades.',
      };
    }
  }

  async function listAllInvoicePayments({ tenantId, fromDate, toDate } = {}) {
    const from = normalizeText(fromDate);
    const to = normalizeText(toDate);
    if (!from || !to) {
      return {
        ok: false,
        payments: [],
        error: 'fromDate och toDate krävs för listAllInvoicePayments.',
      };
    }
    const periodKey = `${normalizeText(tenantId)}::${from}::${to}`;
    const cached = periodCache.get(periodKey);
    if (cached && Date.now() - cached.at < periodCacheTtlMs) {
      return { ...cached.value, cached: true };
    }
    try {
      const client = await createClientFor(tenantId);
      const payments = [];
      let page = 1;
      while (page <= 50) {
        const payload = await client.listInvoicePayments({ fromDate: from, toDate: to, page });
        const batch = Array.isArray(payload?.InvoicePayments) ? payload.InvoicePayments : [];
        payments.push(...batch);
        if (batch.length < 100) break;
        page += 1;
      }
      const value = { ok: true, payments, cached: false, error: null };
      periodCache.set(periodKey, { at: Date.now(), value });
      return value;
    } catch (error) {
      return {
        ok: false,
        payments: [],
        cached: false,
        error: error?.message || 'Fortnox invoice payment list misslyckades.',
      };
    }
  }

  function clearCache() {
    cache.clear();
    periodCache.clear();
  }

  return {
    clearCache,
    listInvoicesForCustomer,
    listAllInvoicePayments,
  };
}

module.exports = {
  createCfoFortnoxInvoiceLister,
};
