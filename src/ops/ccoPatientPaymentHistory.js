'use strict';

const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatAmountLabel(amount, currency = 'SEK') {
  const parsed = Number(
    String(amount)
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')
  );
  if (!Number.isFinite(parsed)) return normalizeText(amount) || '—';
  const formatted = parsed.toLocaleString('sv-SE', {
    minimumFractionDigits: parsed % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const suffix = normalizeText(currency).toUpperCase() === 'SEK' ? ' kr' : ` ${currency}`;
  return `${formatted}${suffix}`;
}

function mapSwishHistoryStatus(status) {
  const token = normalizeText(status).toUpperCase();
  if (token === 'PAID' || token === 'DEBITED') return 'paid';
  if (token === 'ERROR' || token === 'CANCELLED' || token === 'DECLINED') return 'failed';
  return 'pending';
}

function mapFortnoxInvoiceStatus(invoice = {}) {
  if (invoice.Cancelled) return 'cancelled';
  const balance = Number(invoice.Balance ?? invoice.Total ?? 0);
  const total = Number(invoice.Total ?? 0);
  if (Number.isFinite(balance) && balance <= 0 && total > 0) return 'paid';
  const dueDate = normalizeText(invoice.DueDate);
  if (dueDate && balance > 0) {
    const due = Date.parse(dueDate);
    if (Number.isFinite(due) && due < Date.now()) return 'overdue';
  }
  if (balance > 0 && balance < total) return 'partially_paid';
  return 'pending';
}

function swishPaymentToHistoryEntry(payment = {}) {
  const dateIso =
    normalizeText(payment.paidAt) ||
    normalizeText(payment.updatedAt) ||
    normalizeText(payment.createdAt) ||
    new Date().toISOString();
  return {
    id: normalizeText(payment.id) || crypto.randomUUID(),
    dateIso,
    method: 'swish',
    amountLabel: formatAmountLabel(payment.amount, payment.currency || 'SEK'),
    status: mapSwishHistoryStatus(payment.status),
    ref: normalizeText(payment.paymentReference || payment.instructionUUID || payment.id),
    source: 'swish',
  };
}

function fortnoxInvoiceToHistoryEntry(invoice = {}) {
  const dateIso =
    normalizeText(invoice.InvoiceDate) ||
    normalizeText(invoice.DueDate) ||
    new Date().toISOString();
  return {
    id: `fortnox-invoice-${normalizeText(invoice.DocumentNumber) || crypto.randomUUID()}`,
    dateIso: dateIso.includes('T') ? dateIso : `${dateIso}T12:00:00.000Z`,
    method: 'invoice',
    amountLabel: formatAmountLabel(invoice.Total, invoice.Currency || 'SEK'),
    status: mapFortnoxInvoiceStatus(invoice),
    ref: normalizeText(invoice.DocumentNumber || invoice.InvoiceNumber),
    source: 'fortnox',
  };
}

function fortnoxPaymentToHistoryEntry(payment = {}) {
  const dateIso =
    normalizeText(payment.PaymentDate) ||
    normalizeText(payment.BookkeepingDate) ||
    new Date().toISOString();
  return {
    id: `fortnox-payment-${normalizeText(payment.DocumentNumber) || crypto.randomUUID()}`,
    dateIso: dateIso.includes('T') ? dateIso : `${dateIso}T12:00:00.000Z`,
    method: 'invoice',
    amountLabel: formatAmountLabel(payment.Amount || payment.Total, payment.Currency || 'SEK'),
    status: 'paid',
    ref: normalizeText(payment.DocumentNumber || payment.InvoiceNumber),
    source: 'fortnox',
  };
}

function sortHistoryDesc(items) {
  return asArray(items)
    .slice()
    .sort((a, b) => Date.parse(b.dateIso || 0) - Date.parse(a.dateIso || 0));
}

async function listSwishPaymentsForPatient({ swishStore, tenantId, patientId } = {}) {
  if (!swishStore?.listPayments) return [];
  const payments = await swishStore.listPayments({ tenantId, limit: 500 });
  const pid = normalizeText(patientId);
  return payments.filter((item) => normalizeText(item.patientId) === pid);
}

async function buildPatientPaymentHistory({
  tenantId,
  patientId,
  patientCard = {},
  swishStore = null,
  fortnoxInvoiceLister = null,
  fortnoxStore = null,
} = {}) {
  const items = [];
  const meta = {
    swishCount: 0,
    fortnoxInvoiceCount: 0,
    fortnoxPaymentCount: 0,
    fortnoxAvailable: false,
    fortnoxCustomerId: normalizeText(patientCard.fortnoxCustomerId),
    sources: [],
    notes: [],
  };

  const swishPayments = await listSwishPaymentsForPatient({ swishStore, tenantId, patientId });
  meta.swishCount = swishPayments.length;
  if (swishPayments.length) meta.sources.push('swish');
  for (const payment of swishPayments) {
    items.push(swishPaymentToHistoryEntry(payment));
  }

  const customerNumber = meta.fortnoxCustomerId;
  if (customerNumber && fortnoxInvoiceLister?.listInvoicesForCustomer) {
    const fortnoxConnected = fortnoxStore?.getPublicStatus
      ? Boolean((await fortnoxStore.getPublicStatus({ tenantId }))?.connected)
      : true;
    if (fortnoxConnected) {
      const listed = await fortnoxInvoiceLister.listInvoicesForCustomer({
        tenantId,
        customerNumber,
      });
      meta.fortnoxAvailable = listed.ok;
      if (listed.ok) {
        meta.fortnoxInvoiceCount = listed.invoices.length;
        meta.fortnoxPaymentCount = listed.payments.length;
        if (listed.invoices.length || listed.payments.length) meta.sources.push('fortnox');
        for (const invoice of listed.invoices) {
          items.push(fortnoxInvoiceToHistoryEntry(invoice));
        }
        for (const payment of listed.payments) {
          items.push(fortnoxPaymentToHistoryEntry(payment));
        }
      } else if (listed.error) {
        meta.notes.push(listed.error);
      }
    } else {
      meta.notes.push('fortnox_not_connected');
    }
  } else if (!customerNumber) {
    meta.notes.push('fortnox_customer_missing');
  }

  return {
    items: sortHistoryDesc(items),
    meta,
  };
}

function buildCommercialPaymentReadout(commercialCase = null) {
  const safe = commercialCase && typeof commercialCase === 'object' ? commercialCase : {};
  return {
    paymentStatus: normalizeText(safe.paymentStatus) || null,
    quotedAmount: normalizeText(safe.quotedAmount) || null,
    depositAmount: normalizeText(safe.depositAmount) || null,
    commercialCaseId: normalizeText(safe.commercialCaseId) || null,
  };
}

module.exports = {
  buildCommercialPaymentReadout,
  buildPatientPaymentHistory,
  formatAmountLabel,
  fortnoxInvoiceToHistoryEntry,
  mapSwishHistoryStatus,
  swishPaymentToHistoryEntry,
};
