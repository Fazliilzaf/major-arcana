'use strict';

/**
 * Nets Easy (Nexi) payment connector.
 *
 * Handles card payment initiation, status check, and refund.
 * Uses Nets Easy REST API: https://developer.nexigroup.com/nexi-checkout/
 *
 * Env: NETS_SECRET_KEY, NETS_CHECKOUT_KEY, NETS_MODE (test|live)
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveConfig() {
  return {
    secretKey: normalizeText(process.env.NETS_SECRET_KEY),
    checkoutKey: normalizeText(process.env.NETS_CHECKOUT_KEY),
    mode: normalizeText(process.env.NETS_MODE) || 'test',
    baseUrl:
      normalizeText(process.env.NETS_MODE) === 'live'
        ? 'https://api.dibspayment.eu/v1'
        : 'https://test.api.dibspayment.eu/v1',
  };
}

function isConfigured() {
  const cfg = resolveConfig();
  return Boolean(cfg.secretKey && cfg.checkoutKey);
}

async function createPayment({
  orderId,
  amount,
  currency = 'SEK',
  description,
  returnUrl,
  cancelUrl,
}) {
  const cfg = resolveConfig();
  if (!cfg.secretKey) {
    return { ok: false, error: 'nets_not_configured', message: 'NETS_SECRET_KEY saknas.' };
  }

  const body = {
    order: {
      items: [
        {
          reference: orderId,
          name: normalizeText(description) || 'Behandling',
          quantity: 1,
          unit: 'pcs',
          unitPrice: Math.round(amount * 100),
          grossTotalAmount: Math.round(amount * 100),
          netTotalAmount: Math.round(amount * 100),
        },
      ],
      amount: Math.round(amount * 100),
      currency: currency.toUpperCase(),
      reference: orderId,
    },
    checkout: {
      integrationType: 'HostedPaymentPage',
      returnUrl:
        normalizeText(returnUrl) || `${process.env.ARCANA_BASE_URL || ''}/pos/receipt/${orderId}`,
      cancelUrl:
        normalizeText(cancelUrl) || `${process.env.ARCANA_BASE_URL || ''}/pos/cancel/${orderId}`,
      termsUrl: `${process.env.ARCANA_BASE_URL || ''}/villkor`,
    },
  };

  try {
    const res = await fetch(`${cfg.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        Authorization: cfg.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: 'nets_api_error', status: res.status, details: data };
    }
    return {
      ok: true,
      paymentId: data.paymentId,
      hostedPaymentPageUrl: data.hostedPaymentPageUrl,
    };
  } catch (err) {
    return { ok: false, error: 'nets_network_error', message: err.message };
  }
}

async function getPaymentStatus(paymentId) {
  const cfg = resolveConfig();
  if (!cfg.secretKey) return { ok: false, error: 'nets_not_configured' };

  try {
    const res = await fetch(`${cfg.baseUrl}/payments/${paymentId}`, {
      headers: { Authorization: cfg.secretKey },
    });
    if (!res.ok) return { ok: false, error: 'nets_api_error', status: res.status };
    const data = await res.json();
    const payment = data.payment || {};
    return {
      ok: true,
      paymentId,
      status: payment.summary?.chargedAmount
        ? 'charged'
        : payment.summary?.reservedAmount
          ? 'reserved'
          : 'created',
      amountCharged: (payment.summary?.chargedAmount || 0) / 100,
      amountReserved: (payment.summary?.reservedAmount || 0) / 100,
      currency: payment.orderDetails?.currency || 'SEK',
    };
  } catch (err) {
    return { ok: false, error: 'nets_network_error', message: err.message };
  }
}

async function chargePayment(paymentId, amount) {
  const cfg = resolveConfig();
  if (!cfg.secretKey) return { ok: false, error: 'nets_not_configured' };

  try {
    const res = await fetch(`${cfg.baseUrl}/payments/${paymentId}/charges`, {
      method: 'POST',
      headers: {
        Authorization: cfg.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: Math.round(amount * 100) }),
    });
    if (!res.ok) return { ok: false, error: 'nets_charge_failed', status: res.status };
    const data = await res.json();
    return { ok: true, chargeId: data.chargeId };
  } catch (err) {
    return { ok: false, error: 'nets_network_error', message: err.message };
  }
}

module.exports = { createPayment, getPaymentStatus, chargePayment, isConfigured, resolveConfig };
