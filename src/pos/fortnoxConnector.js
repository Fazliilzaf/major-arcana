'use strict';

/**
 * Fortnox invoice connector.
 *
 * Creates and sends invoices via Fortnox REST API.
 * Env: FORTNOX_ACCESS_TOKEN, FORTNOX_CLIENT_SECRET, FORTNOX_MODE (test|live)
 *
 * Docs: https://developer.fortnox.se/documentation/
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveConfig() {
  return {
    accessToken: normalizeText(process.env.FORTNOX_ACCESS_TOKEN),
    clientSecret: normalizeText(process.env.FORTNOX_CLIENT_SECRET),
    mode: normalizeText(process.env.FORTNOX_MODE) || 'test',
    baseUrl: 'https://api.fortnox.se/3',
  };
}

function isConfigured() {
  const cfg = resolveConfig();
  return Boolean(cfg.accessToken);
}

async function createInvoice({
  customerNumber,
  customerName,
  email,
  items = [],
  dueInDays = 30,
  currency = 'SEK',
}) {
  const cfg = resolveConfig();
  if (!cfg.accessToken) {
    return { ok: false, error: 'fortnox_not_configured', message: 'FORTNOX_ACCESS_TOKEN saknas.' };
  }

  const invoiceRows = items.map((item) => ({
    Description: normalizeText(item.label) || 'Behandling',
    DeliveredQuantity: String(item.quantity || 1),
    Price: Number(item.unitPrice) || 0,
    VAT: Math.round((Number(item.vatRate) || 0.25) * 100),
    AccountNumber: item.accountNumber || 3001,
  }));

  const dueDate = new Date(Date.now() + dueInDays * 86400000).toISOString().slice(0, 10);

  const body = {
    Invoice: {
      CustomerNumber: normalizeText(customerNumber) || undefined,
      CustomerName: normalizeText(customerName) || 'Patient',
      EmailInformation: { EmailAddressTo: normalizeText(email) || '' },
      DueDate: dueDate,
      Currency: currency.toUpperCase(),
      InvoiceRows: invoiceRows,
      InvoiceType: 'INVOICE',
      Language: 'SV',
    },
  };

  try {
    const res = await fetch(`${cfg.baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: 'fortnox_api_error', status: res.status, details: data };
    }
    const invoice = data.Invoice || {};
    return {
      ok: true,
      invoiceNumber: invoice.DocumentNumber || invoice.InvoiceNumber || null,
      dueDate: invoice.DueDate || dueDate,
      total: invoice.Total || 0,
      currency: invoice.Currency || currency,
    };
  } catch (err) {
    return { ok: false, error: 'fortnox_network_error', message: err.message };
  }
}

async function sendInvoice(invoiceNumber) {
  const cfg = resolveConfig();
  if (!cfg.accessToken) return { ok: false, error: 'fortnox_not_configured' };

  try {
    const res = await fetch(`${cfg.baseUrl}/invoices/${invoiceNumber}/email`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    return { ok: res.ok, invoiceNumber };
  } catch (err) {
    return { ok: false, error: 'fortnox_network_error', message: err.message };
  }
}

async function getInvoiceStatus(invoiceNumber) {
  const cfg = resolveConfig();
  if (!cfg.accessToken) return { ok: false, error: 'fortnox_not_configured' };

  try {
    const res = await fetch(`${cfg.baseUrl}/invoices/${invoiceNumber}`, {
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return { ok: false, error: 'fortnox_api_error', status: res.status };
    const data = await res.json();
    const inv = data.Invoice || {};
    return {
      ok: true,
      invoiceNumber: inv.DocumentNumber,
      status: inv.Cancelled ? 'cancelled' : inv.Booked ? 'booked' : 'created',
      total: inv.Total || 0,
      balance: inv.Balance || 0,
      dueDate: inv.DueDate || '',
      sent: inv.Sent || false,
    };
  } catch (err) {
    return { ok: false, error: 'fortnox_network_error', message: err.message };
  }
}

module.exports = { createInvoice, sendInvoice, getInvoiceStatus, isConfigured, resolveConfig };
