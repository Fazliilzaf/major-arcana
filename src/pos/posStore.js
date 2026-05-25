'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

const ORDER_STATUSES = Object.freeze([
  'draft',
  'pending_payment',
  'paid',
  'partially_paid',
  'refunded',
  'cancelled',
]);
const PAYMENT_METHODS = Object.freeze([
  'card_nets',
  'invoice_fortnox',
  'cash',
  'swish',
  'gift_card',
]);

function createPosStore({ filePath }) {
  let state = { orders: [], products: [], giftCards: [] };

  async function load() {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      state = JSON.parse(raw);
    } catch {
      /* first run */
    }
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  function createOrder({
    tenantId,
    patientId,
    encounterId,
    items = [],
    operatorId,
    paymentMethod = 'card_nets',
  }) {
    const orderId = crypto.randomUUID();
    const lineItems = items.map((item, idx) => ({
      lineId: `${orderId}-${idx}`,
      productId: normalizeText(item.productId),
      label: normalizeText(item.label) || 'Tjänst',
      quantity: Math.max(1, Number(item.quantity) || 1),
      unitPrice: Number(item.unitPrice) || 0,
      vatRate: Number(item.vatRate) || 0.25,
      total: (Number(item.unitPrice) || 0) * Math.max(1, Number(item.quantity) || 1),
    }));
    const subtotal = lineItems.reduce((sum, li) => sum + li.total, 0);
    const vatTotal = lineItems.reduce((sum, li) => sum + li.total * li.vatRate, 0);
    const order = {
      orderId,
      tenantId: normalizeText(tenantId),
      patientId: normalizeText(patientId),
      encounterId: normalizeText(encounterId),
      operatorId: normalizeText(operatorId),
      status: 'draft',
      paymentMethod: PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'card_nets',
      lineItems,
      subtotal,
      vatTotal,
      total: subtotal + vatTotal,
      currency: 'SEK',
      payments: [],
      invoiceRef: null,
      receiptId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.orders.push(order);
    return order;
  }

  function getOrder(orderId) {
    return state.orders.find((o) => o.orderId === orderId) || null;
  }

  function listOrdersByPatient(patientId) {
    return state.orders.filter((o) => o.patientId === normalizeText(patientId));
  }

  function recordPayment(orderId, { amount, method, transactionRef, provider }) {
    const order = getOrder(orderId);
    if (!order) return null;
    const payment = {
      paymentId: crypto.randomUUID(),
      amount: Number(amount) || order.total,
      method: PAYMENT_METHODS.includes(method) ? method : order.paymentMethod,
      transactionRef: normalizeText(transactionRef),
      provider: normalizeText(provider) || 'nets',
      paidAt: nowIso(),
    };
    order.payments.push(payment);
    const totalPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
    if (totalPaid >= order.total) {
      order.status = 'paid';
    } else {
      order.status = 'partially_paid';
    }
    order.updatedAt = nowIso();
    return payment;
  }

  function setInvoiceRef(orderId, invoiceRef) {
    const order = getOrder(orderId);
    if (!order) return null;
    order.invoiceRef = normalizeText(invoiceRef);
    order.status = 'pending_payment';
    order.updatedAt = nowIso();
    return order;
  }

  function cancelOrder(orderId) {
    const order = getOrder(orderId);
    if (!order) return null;
    order.status = 'cancelled';
    order.updatedAt = nowIso();
    return order;
  }

  function generateReceiptId(orderId) {
    const order = getOrder(orderId);
    if (!order) return null;
    order.receiptId = `REC-${Date.now().toString(36).toUpperCase()}-${orderId.slice(0, 4).toUpperCase()}`;
    order.updatedAt = nowIso();
    return order.receiptId;
  }

  function listProducts() {
    return state.products;
  }

  function upsertProduct({
    productId,
    label,
    unitPrice,
    vatRate = 0.25,
    category = 'service',
    active = true,
  }) {
    const id = normalizeText(productId) || crypto.randomUUID();
    const existing = state.products.findIndex((p) => p.productId === id);
    const product = {
      productId: id,
      label: normalizeText(label),
      unitPrice: Number(unitPrice) || 0,
      vatRate: Number(vatRate),
      category,
      active,
      updatedAt: nowIso(),
    };
    if (existing >= 0) {
      state.products[existing] = product;
    } else {
      state.products.push(product);
    }
    return product;
  }

  function getDailyReport(date) {
    const dayStr = normalizeText(date) || nowIso().slice(0, 10);
    const dayOrders = state.orders.filter(
      (o) => o.createdAt?.startsWith(dayStr) && o.status !== 'cancelled'
    );
    const totalRevenue = dayOrders
      .filter((o) => o.status === 'paid')
      .reduce((s, o) => s + o.total, 0);
    const totalVat = dayOrders
      .filter((o) => o.status === 'paid')
      .reduce((s, o) => s + o.vatTotal, 0);
    return {
      date: dayStr,
      orderCount: dayOrders.length,
      paidCount: dayOrders.filter((o) => o.status === 'paid').length,
      totalRevenue,
      totalVat,
      byMethod: PAYMENT_METHODS.reduce((acc, m) => {
        acc[m] = dayOrders
          .filter((o) => o.paymentMethod === m && o.status === 'paid')
          .reduce((s, o) => s + o.total, 0);
        return acc;
      }, {}),
    };
  }

  return {
    load,
    persist,
    createOrder,
    getOrder,
    listOrdersByPatient,
    recordPayment,
    setInvoiceRef,
    cancelOrder,
    generateReceiptId,
    listProducts,
    upsertProduct,
    getDailyReport,
    ORDER_STATUSES,
    PAYMENT_METHODS,
  };
}

module.exports = { createPosStore, ORDER_STATUSES, PAYMENT_METHODS };
