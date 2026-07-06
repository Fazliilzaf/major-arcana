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
  const safe = asObject(message);
  const subject = normalizeText(safe.subject);
  const subjectMatch = subject.match(/^(.{2,90}?)\s+(?:kontaktformul[aä]r|contact\s*form)\b/i);
  if (subjectMatch) {
    const subjectName = normalizeText(subjectMatch[1])
      .replace(/^(?:re|sv|fw|fwd)\s*[:：]\s*/i, '')
      .replace(/[<>]/g, '')
      .trim();
    if (subjectName && !/@/.test(subjectName)) return subjectName;
  }
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

function extractContactFormPhone(message = {}) {
  if (!looksLikeContactFormMessage(message)) return '';
  const text = collectMessageText(message).replace(/\s+/g, ' ').trim();
  const match = text.match(/(?:telefon|phone|tel)\s*[:：]\s*([+\d][+\d\s().-]{4,40})/i);
  return normalizeText(match && match[1]).replace(/\s+/g, ' ');
}

function resolveContactFormIdentity(message = {}) {
  const email = extractContactFormEmail(message);
  if (!email) return null;
  return {
    email,
    name: extractContactFormName(message) || null,
  };
}

function normalizeContactFormReference(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9åäöéèüñ+]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function buildContactFormReference({ name = '', phone = '' } = {}) {
  const safeName = normalizeContactFormReference(name);
  const safePhone = normalizeContactFormReference(phone);
  return [safeName, safePhone].filter(Boolean).join('--');
}

function resolveContactFormScopeIdentity(message = {}) {
  if (!looksLikeContactFormMessage(message)) return null;
  const email = extractContactFormEmail(message);
  const name = extractContactFormName(message);
  const phone = extractContactFormPhone(message);
  const reference = email ? '' : buildContactFormReference({ name, phone });
  if (!email && !reference) return null;
  return {
    email: email || '',
    name: name || null,
    phone: phone || null,
    reference,
  };
}

const CONTACT_FORM_SCOPE_SEPARATOR = '::contact-form:';
const CONTACT_FORM_REFERENCE_SCOPE_SEPARATOR = '::contact-form-ref:';

function toContactFormScopedConversationKey(baseKey = '', email = '') {
  const safeBaseKey = normalizeText(baseKey);
  const safeEmail = normalizeEmail(email);
  if (!safeBaseKey || !safeEmail || isClinicEmail(safeEmail)) return safeBaseKey;
  return `${safeBaseKey}${CONTACT_FORM_SCOPE_SEPARATOR}${encodeURIComponent(safeEmail)}`;
}

function toContactFormReferenceScopedConversationKey(baseKey = '', reference = '') {
  const safeBaseKey = normalizeText(baseKey);
  const safeReference = normalizeContactFormReference(reference);
  if (!safeBaseKey || !safeReference) return safeBaseKey;
  return `${safeBaseKey}${CONTACT_FORM_REFERENCE_SCOPE_SEPARATOR}${encodeURIComponent(safeReference)}`;
}

function parseContactFormScopedConversationKey(key = '') {
  const safeKey = normalizeText(key);
  const referenceSeparatorIndex = safeKey.lastIndexOf(CONTACT_FORM_REFERENCE_SCOPE_SEPARATOR);
  if (referenceSeparatorIndex >= 0) {
    const baseKey = safeKey.slice(0, referenceSeparatorIndex);
    const rawReference = safeKey.slice(
      referenceSeparatorIndex + CONTACT_FORM_REFERENCE_SCOPE_SEPARATOR.length
    );
    let reference = '';
    try {
      reference = normalizeContactFormReference(decodeURIComponent(rawReference));
    } catch (_err) {
      reference = normalizeContactFormReference(rawReference);
    }
    return { scoped: true, baseKey, email: '', reference, scopeType: 'reference' };
  }
  const separatorIndex = safeKey.lastIndexOf(CONTACT_FORM_SCOPE_SEPARATOR);
  if (separatorIndex < 0) {
    return { scoped: false, baseKey: safeKey, email: '', reference: '', scopeType: '' };
  }
  const baseKey = safeKey.slice(0, separatorIndex);
  const rawEmail = safeKey.slice(separatorIndex + CONTACT_FORM_SCOPE_SEPARATOR.length);
  let email = '';
  try {
    email = normalizeEmail(decodeURIComponent(rawEmail));
  } catch (_err) {
    email = normalizeEmail(rawEmail);
  }
  return {
    scoped: true,
    baseKey,
    email: isClinicEmail(email) ? '' : email,
    reference: '',
    scopeType: 'email',
  };
}

function collectEmailCandidates(value, output = []) {
  if (!value) return output;
  if (typeof value === 'string') {
    const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const raw of matches) output.push(stripAngleAddress(raw));
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEmailCandidates(item, output);
    return output;
  }
  if (typeof value === 'object') {
    const safe = asObject(value);
    const direct = [
      safe.address,
      safe.email,
      safe.mail,
      safe.userPrincipalName,
      safe.emailAddress && asObject(safe.emailAddress).address,
    ];
    for (const item of direct) collectEmailCandidates(item, output);
  }
  return output;
}

function collectParticipantEmails(message = {}) {
  const safe = asObject(message);
  const rawJson = asObject(safe.rawJson);
  const fields = [
    safe.from,
    safe.sender,
    safe.fromEmail,
    safe.senderEmail,
    safe.fromAddress,
    safe.to,
    safe.toRecipients,
    safe.ccRecipients,
    safe.bccRecipients,
    safe.replyToRecipients,
    safe.recipients,
    rawJson.from,
    rawJson.sender,
    rawJson.to,
    rawJson.toRecipients,
    rawJson.ccRecipients,
    rawJson.bccRecipients,
    rawJson.replyTo,
    rawJson.replyToRecipients,
  ];
  const emails = [];
  for (const field of fields) collectEmailCandidates(field, emails);
  return Array.from(
    new Set(emails.map(normalizeEmail).filter((email) => email && !isClinicEmail(email)))
  );
}

function resolveContactFormConversationEmail(message = {}, allowedEmails = null) {
  const contactFormIdentity = resolveContactFormIdentity(message);
  if (contactFormIdentity?.email) return contactFormIdentity.email;
  const allowedSet =
    allowedEmails instanceof Set
      ? allowedEmails
      : Array.isArray(allowedEmails)
        ? new Set(allowedEmails.map(normalizeEmail).filter(Boolean))
        : null;
  if (!allowedSet || allowedSet.size === 0) return '';
  return collectParticipantEmails(message).find((email) => allowedSet.has(email)) || '';
}

function scopeContactFormConversationKey(baseKey = '', message = {}, allowedEmails = null) {
  const email = resolveContactFormConversationEmail(message, allowedEmails);
  if (email) return toContactFormScopedConversationKey(baseKey, email);
  const scopeIdentity = resolveContactFormScopeIdentity(message);
  if (scopeIdentity?.reference) {
    return toContactFormReferenceScopedConversationKey(baseKey, scopeIdentity.reference);
  }
  return normalizeText(baseKey);
}

function messageMatchesContactFormScope(message = {}, scope = '') {
  const safeScope = asObject(scope);
  const safeEmail = normalizeEmail(typeof scope === 'string' ? scope : safeScope.email);
  const safeReference = normalizeContactFormReference(
    typeof scope === 'string' ? '' : safeScope.reference
  );
  if (!safeEmail && !safeReference) return true;
  const contactFormIdentity = resolveContactFormIdentity(message);
  if (contactFormIdentity?.email) return normalizeEmail(contactFormIdentity.email) === safeEmail;
  if (safeEmail) return collectParticipantEmails(message).includes(safeEmail);
  const scopeIdentity = resolveContactFormScopeIdentity(message);
  return normalizeContactFormReference(scopeIdentity?.reference) === safeReference;
}

module.exports = {
  collectMessageText,
  collectParticipantEmails,
  extractContactFormEmail,
  extractContactFormName,
  extractContactFormPhone,
  isClinicEmail,
  looksLikeContactFormMessage,
  messageMatchesContactFormScope,
  normalizeEmail,
  normalizeContactFormReference,
  parseContactFormScopedConversationKey,
  resolveContactFormIdentity,
  resolveContactFormConversationEmail,
  resolveContactFormScopeIdentity,
  scopeContactFormConversationKey,
  toContactFormReferenceScopedConversationKey,
  toContactFormScopedConversationKey,
};
