'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function notifyStaffBookingConfirmed({
  graphSendConnector,
  booking = {},
  toEmail = '',
  fromEmail = '',
} = {}) {
  if (!graphSendConnector || typeof graphSendConnector.sendNewMessage !== 'function') {
    return { skipped: true, reason: 'graph_send_unavailable' };
  }
  const recipient = normalizeText(toEmail);
  if (!recipient) {
    return { skipped: true, reason: 'no_recipient' };
  }
  const customer = normalizeText(booking.customerName) || normalizeText(booking.customerEmail) || 'Kund';
  const service = normalizeText(booking?.slot?.serviceLabel || booking.serviceId) || 'Tjänst';
  const startsAt = normalizeText(booking?.slot?.startsAt || booking.startsAt) || '—';
  const subject = `Intern notis: bokning bekräftad — ${customer}`;
  const html = `
    <p>Ny bokning bekräftad i CCO.</p>
    <ul>
      <li><strong>Kund:</strong> ${customer}</li>
      <li><strong>Tjänst:</strong> ${service}</li>
      <li><strong>Start:</strong> ${startsAt}</li>
    </ul>
  `.trim();
  const mailboxId = normalizeText(fromEmail) || 'kons@hairtpclinic.com';
  await graphSendConnector.sendNewMessage({
    mailboxId,
    sourceMailboxId: mailboxId,
    subject,
    bodyHtml: html,
    body: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    to: [{ emailAddress: { address: recipient } }],
  });
  return { skipped: false, to: recipient, subject };
}

async function notifyStaffBookingCancelled({
  graphSendConnector,
  booking = {},
  reason = '',
  toEmail = '',
  fromEmail = '',
} = {}) {
  if (!graphSendConnector || typeof graphSendConnector.sendNewMessage !== 'function') {
    return { skipped: true, reason: 'graph_send_unavailable' };
  }
  const recipient = normalizeText(toEmail);
  if (!recipient) {
    return { skipped: true, reason: 'no_recipient' };
  }
  const customer = normalizeText(booking.customerName) || normalizeText(booking.customerEmail) || 'Kund';
  const service = normalizeText(booking?.slot?.serviceLabel || booking.serviceId) || 'Tjänst';
  const startsAt = normalizeText(booking?.slot?.startsAt || booking.startsAt) || '—';
  const detail = normalizeText(reason) || 'Ingen orsak angiven.';
  const subject = `Intern notis: bokning avbokad — ${customer}`;
  const html = `
    <p>Bokning avbokad i CCO.</p>
    <ul>
      <li><strong>Kund:</strong> ${customer}</li>
      <li><strong>Tjänst:</strong> ${service}</li>
      <li><strong>Start:</strong> ${startsAt}</li>
      <li><strong>Orsak:</strong> ${detail}</li>
    </ul>
  `.trim();
  const mailboxId = normalizeText(fromEmail) || 'kons@hairtpclinic.com';
  await graphSendConnector.sendNewMessage({
    mailboxId,
    sourceMailboxId: mailboxId,
    subject,
    bodyHtml: html,
    body: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    to: [{ emailAddress: { address: recipient } }],
  });
  return { skipped: false, to: recipient, subject };
}

module.exports = {
  notifyStaffBookingCancelled,
  notifyStaffBookingConfirmed,
};
