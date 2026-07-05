'use strict';

const { extractTextFromHtml } = require('./ccoMailContentParser');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function stripAngleAddress(value = '') {
  const text = normalizeText(value);
  const angle = text.match(/<([^<>@\s]+@[^<>\s]+)>/);
  return normalizeEmail(angle ? angle[1] : text);
}

function isClinicEmail(email = '') {
  const normalized = normalizeEmail(email);
  return (
    normalized.endsWith('@hairtpclinic.com') ||
    normalized.endsWith('@hairtpclinic.se') ||
    normalized.endsWith('@hairtp.se')
  );
}

function collectMessageText(message = {}) {
  const safe = asObject(message);
  const rawJson = asObject(safe.rawJson);
  const rawBody = asObject(rawJson.body);
  const rawUniqueBody = asObject(rawJson.uniqueBody);
  const body = asObject(safe.body);
  const uniqueBody = asObject(safe.uniqueBody);
  return [
    safe.subject,
    safe.bodyText,
    safe.body_text,
    safe.text,
    safe.bodyPreview,
    safe.preview,
    safe.snippet,
    rawJson.bodyText,
    rawJson.body_text,
    rawJson.bodyPreview,
    typeof safe.body === 'string' ? safe.body : '',
    typeof rawJson.body === 'string' ? rawJson.body : '',
    extractTextFromHtml(safe.bodyHtml),
    extractTextFromHtml(safe.body_html),
    extractTextFromHtml(rawJson.bodyHtml),
    extractTextFromHtml(rawJson.body_html),
    extractTextFromHtml(body.content),
    extractTextFromHtml(uniqueBody.content),
    extractTextFromHtml(rawBody.content),
    extractTextFromHtml(rawUniqueBody.content),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join('\n');
}

function looksLikeContactFormMessage(message = {}) {
  const safe = asObject(message);
  const sender = normalizeEmail(
    safe.fromEmail ||
      safe.senderEmail ||
      asObject(safe.from).address ||
      asObject(asObject(safe.from).emailAddress).address ||
      asObject(asObject(safe.sender).emailAddress).address
  );
  const text = collectMessageText(safe).toLowerCase();
  return (
    sender.includes('wordpress') ||
    /kontaktformul[aä]r|contact\s*form|hur kan vi hj[aä]lpa dig/i.test(text) ||
    (/\be-?post\b|\bemail\b/i.test(text) && /\btelefon\b|\bphone\b/i.test(text))
  );
}

function extractContactFormEmail(message = {}) {
  if (!looksLikeContactFormMessage(message)) return '';
  const text = collectMessageText(message);
  const labeledPatterns = [
    /(?:e-?post(?:adress)?|email|mail)\s*[:：]\s*(?:<a\b[^>]*>)?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
    /(?:från|from)\s*[:：].{0,120}?(?:e-?post(?:adress)?|email|mail)\s*[:：]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  ];
  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);
    const email = stripAngleAddress(match && match[1]);
    if (email && !isClinicEmail(email)) return email;
  }
  const allEmails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  for (const raw of allEmails) {
    const email = stripAngleAddress(raw);
    if (email && !isClinicEmail(email)) return email;
  }
  return '';
}

function extractContactFormName(message = {}) {
  if (!looksLikeContactFormMessage(message)) return '';
  const text = collectMessageText(message).replace(/\s+/g, ' ').trim();
  const patterns = [
    /(?:från|from)\s*[:：]\s*(.{2,90}?)\s+(?:e-?post(?:adress)?|email|mail)\s*[:：]/i,
    /(?:namn|name)\s*[:：]\s*(.{2,90}?)(?:\s+(?:e-?post(?:adress)?|email|mail|telefon|phone)\s*[:：]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const name = normalizeText(match && match[1])
      .replace(/[<>]/g, '')
      .trim();
    if (name && !/@/.test(name)) return name;
  }
  return '';
}

function resolveContactFormIdentity(message = {}) {
  const email = extractContactFormEmail(message);
  if (!email) return null;
  return {
    email,
    name: extractContactFormName(message) || null,
  };
}

module.exports = {
  collectMessageText,
  extractContactFormEmail,
  extractContactFormName,
  isClinicEmail,
  looksLikeContactFormMessage,
  resolveContactFormIdentity,
};
