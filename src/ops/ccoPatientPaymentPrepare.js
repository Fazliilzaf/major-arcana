'use strict';

const crypto = require('node:crypto');
const { createStripeClient } = require('../billing/stripeClient');
const { createSwishPaymentRequest } = require('./ccoSwishPayments');
const { formatAmountLabel } = require('./ccoPatientPaymentHistory');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requireConfirmText(body, expected) {
  const confirmText = normalizeText(body?.confirmText);
  if (confirmText !== expected) {
    const error = new Error(`Bekräfta med confirmText: "${expected}"`);
    error.statusCode = 400;
    throw error;
  }
}

function parsePositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('amount måste vara ett positivt tal.');
    error.statusCode = 400;
    throw error;
  }
  return amount;
}

async function prepareSwishPayment({
  body = {},
  actor,
  config,
  swishStore,
  patientMasterStore,
} = {}) {
  requireConfirmText(body, 'PREPARE SWISH PAYMENT');
  const patientId = normalizeText(body.patientId);
  if (!patientId) {
    const error = new Error('patientId krävs.');
    error.statusCode = 400;
    throw error;
  }
  const patient = await patientMasterStore.getPatient({
    tenantId: actor.tenantId,
    patientId,
  });
  if (!patient) {
    const error = new Error('Patienten hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  const amount = parsePositiveAmount(body.amount);
  const result = await createSwishPaymentRequest({
    config,
    swishStore,
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    amount,
    message: body.message || `Betalning ${patient.displayName || ''}`.trim(),
    patientId,
    commercialCaseId: normalizeText(body.commercialCaseId),
    payerAlias: body.payerAlias || patient.primaryPhone,
    payeePaymentReference: body.payeePaymentReference,
  });
  return {
    ok: true,
    mode: 'prepare_only',
    requiresHumanAction: true,
    autoExecuted: false,
    payment: result.payment,
    instructionUUID: result.instructionUUID,
    paymentRequestToken: result.paymentRequestToken,
    swishUrl: result.swishUrl,
    message:
      'Swish-förfrågan skapad. Personal skickar/länkar manuellt — ingen automatisk debitering.',
  };
}

async function prepareCardPaymentLink({
  body = {},
  actor,
  config,
  patientMasterStore,
  integrationStore = null,
} = {}) {
  requireConfirmText(body, 'PREPARE CARD PAYMENT');
  const patientId = normalizeText(body.patientId);
  if (!patientId) {
    const error = new Error('patientId krävs.');
    error.statusCode = 400;
    throw error;
  }
  const patient = await patientMasterStore.getPatient({
    tenantId: actor.tenantId,
    patientId,
  });
  if (!patient) {
    const error = new Error('Patienten hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  const stripe = createStripeClient({ apiKey: config?.stripeSecretKey });
  if (!stripe) {
    const error = new Error('Stripe är inte konfigurerat (STRIPE_SECRET_KEY saknas).');
    error.statusCode = 503;
    throw error;
  }
  if (integrationStore?.getTenantIntegrations) {
    const integrations = await integrationStore.getTenantIntegrations({ tenantId: actor.tenantId });
    const stripeRecord = integrations.find((item) => item.id === 'stripe');
    if (stripeRecord && stripeRecord.isConnected === false) {
      const error = new Error('Stripe är markerad som frånkopplad i integrationspanelen.');
      error.statusCode = 503;
      throw error;
    }
  }
  const amount = parsePositiveAmount(body.amount);
  const amountOre = Math.round(amount * 100);
  const description =
    normalizeText(body.description) ||
    `Betalning ${patient.displayName || 'patient'}`.slice(0, 120);
  const link = await stripe.paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: 'sek',
          product_data: { name: description },
          unit_amount: amountOre,
        },
        quantity: 1,
      },
    ],
    metadata: {
      tenantId: actor.tenantId,
      patientId,
      commercialCaseId: normalizeText(body.commercialCaseId),
      preparedBy: actor.userId,
    },
  });
  return {
    ok: true,
    mode: 'prepare_only',
    requiresHumanAction: true,
    autoExecuted: false,
    paymentLinkId: link.id,
    paymentLinkUrl: link.url,
    amountLabel: formatAmountLabel(amount),
    message: 'Betalningslänk skapad. Skicka länken manuellt till kunden — ingen auto-debet.',
  };
}

async function prepareInvoiceDraft({
  body = {},
  actor,
  patientMasterStore,
  commercialStore = null,
} = {}) {
  requireConfirmText(body, 'PREPARE INVOICE DRAFT');
  const patientId = normalizeText(body.patientId);
  if (!patientId) {
    const error = new Error('patientId krävs.');
    error.statusCode = 400;
    throw error;
  }
  const patient = await patientMasterStore.getPatient({
    tenantId: actor.tenantId,
    patientId,
  });
  if (!patient) {
    const error = new Error('Patienten hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  const card = patientMasterStore.buildPatientCardReadout(patient);
  const fortnoxCustomerId = normalizeText(card.fortnoxCustomerId);
  if (!fortnoxCustomerId) {
    const error = new Error('Patienten saknar Fortnox-kundnummer. Synka patienten först.');
    error.statusCode = 409;
    throw error;
  }
  const amount = parsePositiveAmount(body.amount);
  let commercialCase = null;
  if (commercialStore?.getPatientRegisterCase) {
    commercialCase = await commercialStore.getPatientRegisterCase({
      tenantId: actor.tenantId,
      patientId,
    });
  }
  const draftRef = `inv-draft-${crypto.randomUUID()}`;
  return {
    ok: true,
    mode: 'prepare_only',
    requiresHumanAction: true,
    autoExecuted: false,
    invoiceDraftRef: draftRef,
    draft: {
      patientId,
      fortnoxCustomerId,
      amount,
      amountLabel: formatAmountLabel(amount),
      currency: 'SEK',
      description:
        normalizeText(body.description) ||
        normalizeText(commercialCase?.quotedAmount && `Offert ${commercialCase.quotedAmount}`) ||
        'Behandling enligt offert',
      commercialCaseId: normalizeText(body.commercialCaseId || commercialCase?.commercialCaseId),
    },
    message:
      'Fakturautkast förberett lokalt. Skapa/skicka faktura manuellt i Fortnox — ingen auto-bokföring i Arcana.',
    fortnoxWriteSupported: false,
  };
}

function getMedicalFinanceInfo() {
  return {
    ok: true,
    mode: 'external_financing',
    requiresHumanAction: true,
    autoExecuted: false,
    provider: 'Medical Finance',
    contact: {
      label: 'Medical Finance — extern finansiering',
      phone: '',
      email: '',
      url: 'https://www.medicalfinance.se/',
    },
    message:
      'Medical Finance har inget API i Arcana. Kontakta finansieringspartnern manuellt och dokumentera beslut i patientkortet.',
  };
}

module.exports = {
  getMedicalFinanceInfo,
  prepareCardPaymentLink,
  prepareInvoiceDraft,
  prepareSwishPayment,
  requireConfirmText,
};
