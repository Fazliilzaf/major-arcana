'use strict';

const {
  buildInstructionUuid,
  buildSwishDeepLink,
  createSwishClient,
  extractPaymentIdFromLocation,
} = require('../infra/swishClient');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSwishPhone(value) {
  const digits = normalizeText(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('46')) return digits;
  if (digits.startsWith('0')) return `46${digits.slice(1)}`;
  return digits;
}

function formatSwishAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('amount måste vara ett positivt tal.');
    error.statusCode = 400;
    throw error;
  }
  return amount.toFixed(2);
}

function normalizeSwishMessage(value, fallback = 'Arcana betalning') {
  const message = normalizeText(value) || fallback;
  return message.slice(0, 50);
}

function mapSwishPaymentStatus(payload = {}) {
  return {
    status: normalizeText(payload.status) || 'CREATED',
    paymentReference: normalizeText(payload.paymentReference),
    errorCode: normalizeText(payload.errorCode),
    errorMessage: normalizeText(payload.errorMessage),
    paidAt: normalizeText(payload.datePaid),
  };
}

async function createSwishPaymentRequest({
  config,
  swishStore,
  tenantId,
  actorUserId = '',
  amount,
  message,
  patientId = '',
  commercialCaseId = '',
  payerAlias = '',
  payeePaymentReference = '',
} = {}) {
  const connection = await swishStore.getConnection({ tenantId });
  const payeeAlias = normalizeText(connection.payeeAlias);
  if (!payeeAlias) {
    const error = new Error('Swish är inte anslutet för denna tenant.');
    error.statusCode = 503;
    throw error;
  }

  const client = createSwishClient(config);
  const instructionUUID = buildInstructionUuid();
  const formattedAmount = formatSwishAmount(amount);
  const payer = normalizeSwishPhone(payerAlias);

  const created = await client.createPaymentRequest({
    instructionUUID,
    payeeAlias,
    amount: formattedAmount,
    message: normalizeSwishMessage(message),
    payerAlias: payer,
    payeePaymentReference: normalizeText(payeePaymentReference),
  });

  const paymentId =
    extractPaymentIdFromLocation(created.location) || created.instructionUUID || instructionUUID;
  const swishUrl = buildSwishDeepLink({
    paymentRequestToken: created.paymentRequestToken,
    callbackUrl: config.swishCallbackUrl,
  });

  const payment = await swishStore.savePayment({
    tenantId,
    payment: {
      id: paymentId,
      instructionUUID: created.instructionUUID || instructionUUID,
      patientId,
      commercialCaseId,
      amount: formattedAmount,
      currency: 'SEK',
      message: normalizeSwishMessage(message),
      status: 'CREATED',
      paymentRequestToken: created.paymentRequestToken,
      swishUrl,
      payerAlias: payer,
      payeeAlias,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  await swishStore.saveConnection({
    tenantId,
    actorUserId,
    connection: {
      ...connection,
      connected: true,
      lastError: '',
    },
  });

  return {
    payment,
    instructionUUID: payment.instructionUUID,
    paymentRequestToken: payment.paymentRequestToken,
    swishUrl: payment.swishUrl,
  };
}

async function refreshSwishPaymentStatus({ config, swishStore, tenantId, paymentId } = {}) {
  const existing = await swishStore.getPayment({ tenantId, paymentId });
  if (!existing) {
    const error = new Error('Swish-betalning hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  const client = createSwishClient(config);
  const remote = await client.getPaymentRequest(existing.instructionUUID || existing.id);
  const mapped = mapSwishPaymentStatus(remote);
  const payment = await swishStore.savePayment({
    tenantId,
    payment: {
      ...existing,
      ...mapped,
      updatedAt: new Date().toISOString(),
    },
  });
  return payment;
}

async function applySwishCallback({ config, swishStore, instructionUUID } = {}) {
  const match = await swishStore.findPaymentByInstruction({ instructionUUID });
  if (!match?.tenantId) {
    const error = new Error('Swish-betalning hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  return refreshSwishPaymentStatus({
    config,
    swishStore,
    tenantId: match.tenantId,
    paymentId: match.payment.id,
  });
}

module.exports = {
  applySwishCallback,
  createSwishPaymentRequest,
  formatSwishAmount,
  mapSwishPaymentStatus,
  normalizeSwishMessage,
  normalizeSwishPhone,
  refreshSwishPaymentStatus,
};
