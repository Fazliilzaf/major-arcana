'use strict';

const crypto = require('node:crypto');

const SWEDISH_MONTHS = Object.freeze({
  januari: 0,
  februari: 1,
  mars: 2,
  april: 3,
  maj: 4,
  juni: 5,
  juli: 6,
  augusti: 7,
  september: 8,
  oktober: 9,
  november: 10,
  december: 11,
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^mailto:/, '');
}

function stripHtml(value) {
  return normalizeText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function matchBodyLabel(body, labels) {
  const source = normalizeText(body);
  if (!source) return '';
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\n\\r])\\s*${escaped}\\s*[:：]\\s*([^\\n\\r]+)`, 'im');
    const match = source.match(re);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return '';
}

function parseSwedishDateTime(text) {
  const source = normalizeText(text);
  if (!source) return null;
  const match = source.match(
    /(?:\w+\s+)?(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i
  );
  if (!match) return null;
  const day = Number(match[1]);
  const month = SWEDISH_MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  const hour = Number(match[4] ?? 12);
  const minute = Number(match[5] ?? 0);
  if (!Number.isFinite(day) || !Number.isFinite(year) || month == null) return null;
  return new Date(Date.UTC(year, month, day, hour, minute, 0)).toISOString();
}

function parseNameFromSubject(subject) {
  const source = normalizeText(subject);
  if (!source) return '';
  const webMatch = source.match(/ny bokning\s*\(web\)\s*[:-]\s*([^,]+)/i);
  if (webMatch?.[1]) return normalizeText(webMatch[1]);
  const genericMatch = source.match(
    /(?:bokning|bekräftelse|booking)[\s·:,-]+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i
  );
  if (genericMatch?.[1]) return normalizeText(genericMatch[1]);
  return '';
}

function addMinutes(iso, minutes) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + minutes * 60000).toISOString();
}

function buildClientoWebBookingId({ internetMessageId, messageId, customerEmail, startsAt }) {
  const internetId = normalizeText(internetMessageId);
  if (internetId) return `cliento-web:${internetId.toLowerCase()}`;
  const rawId = normalizeText(messageId);
  if (rawId) return `cliento-web:raw:${rawId}`;
  const hash = crypto
    .createHash('sha256')
    .update([normalizeEmail(customerEmail), normalizeText(startsAt)].join('|'))
    .digest('hex')
    .slice(0, 24);
  return `cliento-web:${hash}`;
}

function isClientoSender(fromEmail) {
  const email = normalizeEmail(fromEmail);
  return email.endsWith('@cliento.com') || email.includes('cliento.com');
}

function isClientoBookingMail(rawMessage = {}) {
  if (!isClientoSender(rawMessage.fromEmail)) return false;
  const subject = normalizeText(rawMessage.subject).toLowerCase();
  if (/ny bokning/.test(subject)) return true;
  if (/bokning ·/.test(subject)) return true;
  if (/bekräftelse/.test(subject) && /bok/.test(subject)) return true;
  return false;
}

function parseClientoWebBookingMail(rawMessage = {}) {
  if (!isClientoBookingMail(rawMessage)) return null;

  const subject = normalizeText(rawMessage.subject);
  const body = stripHtml(rawMessage.bodyText || rawMessage.bodyPreview || '');

  const customerName =
    matchBodyLabel(body, ['Namn', 'Name', 'Kund', 'Customer']) || parseNameFromSubject(subject);
  const customerEmail = normalizeEmail(
    matchBodyLabel(body, ['E-post', 'Epost', 'Email', 'E-mail'])
  );
  const customerPhone = matchBodyLabel(body, ['Telefon', 'Phone', 'Mobil']);
  const serviceLabel = matchBodyLabel(body, ['Tjänst', 'Tjanst', 'Service']) || 'Cliento-bokning';
  const staffName = matchBodyLabel(body, ['Resurs', 'Behandlare', 'Staff']);
  const startsAt =
    parseSwedishDateTime(matchBodyLabel(body, ['Tidpunkt', 'Tid', 'Time'])) ||
    parseSwedishDateTime(subject);

  if (!customerEmail || !startsAt) {
    return {
      ok: false,
      reason: !customerEmail ? 'missing_customer_email' : 'missing_starts_at',
      customerName,
      customerEmail: customerEmail || null,
      startsAt,
    };
  }

  const bookingId = buildClientoWebBookingId({
    internetMessageId: rawMessage.internetMessageId,
    messageId: rawMessage.id || rawMessage.graphMessageId,
    customerEmail,
    startsAt,
  });

  const startsMs = Date.parse(startsAt);
  const status =
    Number.isFinite(startsMs) && startsMs < Date.now() - 6 * 60 * 60 * 1000
      ? 'completed'
      : 'upcoming';

  return {
    ok: true,
    bookingId,
    customerEmail,
    customerName,
    customerPhone: customerPhone || null,
    serviceLabel,
    staffName: staffName || null,
    startsAt,
    endsAt: addMinutes(startsAt, 45),
    status,
    source: 'cliento_web_mail',
    notes: subject || null,
    receivedAt: normalizeText(rawMessage.receivedDateTime) || null,
  };
}

module.exports = {
  SWEDISH_MONTHS,
  addMinutes,
  buildClientoWebBookingId,
  isClientoBookingMail,
  isClientoSender,
  matchBodyLabel,
  parseClientoWebBookingMail,
  parseNameFromSubject,
  parseSwedishDateTime,
  stripHtml,
};
