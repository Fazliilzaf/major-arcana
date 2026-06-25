'use strict';

const crypto = require('node:crypto');
const { formatSwishAmount } = require('./ccoSwishPayments');

const CONFIRM_TEXT = Object.freeze({
  swish: 'SKAPA SWISH-FÖRFRÅGAN',
  card: 'FÖRBERED KORTLÄNK',
  invoice: 'FÖRBERED FAKTURAUTKAST',
  medicalFinance: 'FÖRBERED MEDICAL FINANCE',
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requireConfirm(kind, confirmText) {
  const expected = CONFIRM_TEXT[kind];
  if (normalizeText(confirmText) !== expected) {
    const error = new Error(`confirmText måste vara exakt "${expected}".`);
    error.statusCode = 400;
    error.metadata = { expectedConfirmText: expected };
    throw error;
  }
  return true;
}

function requirePatientId(patientId) {
  const id = normalizeText(patientId);
  if (!id) {
    const error = new Error('patientId krävs.');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function buildPreparedReference(prefix = 'pay') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function buildCardLinkDraft({
  patientId,
  amount,
  message = '',
  commercialCaseId = '',
  returnUrl = '',
} = {}) {
  requirePatientId(patientId);
  const formattedAmount = formatSwishAmount(amount);
  return {
    ok: true,
    prepared: true,
    provider: 'stripe',
    status: 'draft_only',
    ref: buildPreparedReference('cardlink'),
    amount: formattedAmount,
    currency: 'SEK',
    patientId: normalizeText(patientId),
    commercialCaseId: normalizeText(commercialCaseId),
    message: normalizeText(message).slice(0, 120),
    paymentLink: null,
    returnUrl: normalizeText(returnUrl),
    requiresHumanSend: true,
    moneySafety: 'Ingen kortdebitering görs. Detta är underlag för att skapa/skicka kortlänk.',
  };
}

function buildFortnoxInvoiceDraft({
  patientId,
  amount,
  commercialCaseId = '',
  fortnoxCustomerNumber = '',
  description = '',
  dueDateIso = '',
} = {}) {
  requirePatientId(patientId);
  const formattedAmount = formatSwishAmount(amount);
  return {
    ok: true,
    prepared: true,
    provider: 'fortnox',
    status: 'draft_only',
    ref: buildPreparedReference('invoice'),
    amount: formattedAmount,
    currency: 'SEK',
    patientId: normalizeText(patientId),
    commercialCaseId: normalizeText(commercialCaseId),
    fortnoxCustomerNumber: normalizeText(fortnoxCustomerNumber),
    description: normalizeText(description).slice(0, 200),
    dueDateIso: normalizeText(dueDateIso),
    invoiceNumber: null,
    requiresHumanSend: true,
    moneySafety:
      'Ingen faktura bokförs eller skickas. Fortnox invoice-write/sync saknas som patientflöde.',
  };
}

function buildMedicalFinanceInfo({ patientId, amount = '', commercialCaseId = '' } = {}) {
  requirePatientId(patientId);
  return {
    ok: true,
    prepared: true,
    provider: 'medical_finance',
    status: 'external_manual',
    ref: buildPreparedReference('mf'),
    amount: normalizeText(amount),
    currency: 'SEK',
    patientId: normalizeText(patientId),
    commercialCaseId: normalizeText(commercialCaseId),
    contactPath: 'Kontakta Medical Finance via klinikens manuella finansieringsrutin.',
    requiresHumanSend: true,
    moneySafety: 'Ingen finansieringsansökan skickas från Arcana.',
  };
}

module.exports = {
  CONFIRM_TEXT,
  buildCardLinkDraft,
  buildFortnoxInvoiceDraft,
  buildMedicalFinanceInfo,
  requireConfirm,
  requirePatientId,
};
