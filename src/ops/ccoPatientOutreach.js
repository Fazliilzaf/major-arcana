'use strict';

const { createTransactionalMailer } = require('../infra/transactionalMailer');

const OUTREACH_TYPES = Object.freeze([
  'health_declaration',
  'fitness_certificate',
  'consent',
  'file',
  'custom',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildOutreachMessage({ outreachType, patientName = '', linkUrl = '', note = '' } = {}) {
  const name = normalizeText(patientName) || 'där';
  const link = normalizeText(linkUrl) || 'https://hairtpclinic.com/screen';
  const extra = normalizeText(note);

  const subjects = {
    health_declaration: 'Fyll i hälsodeklaration — Hair TP Clinic',
    fitness_certificate: 'Fyll i friskförsäkran — Hair TP Clinic',
    consent: 'Signera samtycke — Hair TP Clinic',
    file: 'Handling att granska — Hair TP Clinic',
    custom: 'Information från Hair TP Clinic',
  };

  const bodies = {
    health_declaration: `Hej ${name},\n\nVänligen fyll i hälsodeklarationen före ditt besök:\n${link}\n\n${extra}`.trim(),
    fitness_certificate: `Hej ${name},\n\nVänligen fyll i friskförsäkran:\n${link}\n\n${extra}`.trim(),
    consent: `Hej ${name},\n\nVänligen signera samtycket via länken:\n${link}\n\n${extra}`.trim(),
    file: `Hej ${name},\n\nEn fil eller handling väntar:\n${link}\n\n${extra}`.trim(),
    custom: `Hej ${name},\n\n${extra || link}`.trim(),
  };

  const type = OUTREACH_TYPES.includes(outreachType) ? outreachType : 'custom';
  return {
    subject: subjects[type],
    text: bodies[type],
    html: `<p>${bodies[type].replace(/\n/g, '<br>')}</p>`,
  };
}

function defaultLinkForType(outreachType, origin = '') {
  const base = normalizeText(origin) || 'https://hairtpclinic.com';
  if (outreachType === 'fitness_certificate') return `${base.replace(/\/$/, '')}/friskforsakran`;
  if (outreachType === 'health_declaration') return `${base.replace(/\/$/, '')}/screen`;
  return base;
}

async function sendPatientOutreach({
  patient,
  outreachType = 'custom',
  linkUrl = '',
  note = '',
  toEmail = '',
  fromEmail = '',
  graphSendConnector = null,
  origin = '',
} = {}) {
  const recipient = normalizeText(toEmail || patient?.primaryEmail || patient?.email);
  if (!recipient) {
    const error = new Error('Patient saknar e-post för utskick.');
    error.statusCode = 400;
    throw error;
  }
  const type = OUTREACH_TYPES.includes(outreachType) ? outreachType : 'custom';
  const resolvedLink = normalizeText(linkUrl) || defaultLinkForType(type, origin);
  const message = buildOutreachMessage({
    outreachType: type,
    patientName: patient?.displayName || patient?.fullName || patient?.firstName,
    linkUrl: resolvedLink,
    note,
  });
  const mailer = createTransactionalMailer({ graphSendConnector });
  const result = await mailer.sendEmail({
    to: recipient,
    from: fromEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return {
    outreachType: type,
    to: recipient,
    linkUrl: resolvedLink,
    delivery: result,
  };
}

module.exports = {
  OUTREACH_TYPES,
  buildOutreachMessage,
  sendPatientOutreach,
};
