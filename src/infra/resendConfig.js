'use strict';

/**
 * B3b — Resend-domän och avsändaridentitet (separat från Graph/M365).
 *
 * Graph send använder contact@hairtpclinic.com (M365).
 * Resend använder egen verifierad subdomän, t.ex. booking@notifications.hairtpclinic.com.
 */

const DEFAULT_RESEND_DOMAIN = 'notifications.hairtpclinic.com';
const DEFAULT_RESEND_LOCAL = 'booking';
const DEFAULT_REPLY_TO = 'contact@hairtpclinic.com';
const DEFAULT_GRAPH_FROM = 'contact@hairtpclinic.com';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractEmailAddress(from) {
  const raw = normalizeText(from);
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

function extractDomain(email) {
  const addr = extractEmailAddress(email);
  const at = addr.lastIndexOf('@');
  return at >= 0 ? addr.slice(at + 1) : '';
}

function buildFromAddress({ domain, localPart = DEFAULT_RESEND_LOCAL, displayName = 'Hair TP Clinic' } = {}) {
  const safeDomain = normalizeText(domain) || DEFAULT_RESEND_DOMAIN;
  const safeLocal = normalizeText(localPart) || DEFAULT_RESEND_LOCAL;
  return `${displayName} <${safeLocal}@${safeDomain}>`;
}

function resolveResendDomain(env = process.env) {
  const explicit = normalizeText(env.RESEND_DOMAIN);
  if (explicit) return explicit.toLowerCase();
  const fromDomain = extractDomain(env.RESEND_FROM);
  if (fromDomain) return fromDomain;
  return DEFAULT_RESEND_DOMAIN;
}

function resolveResendFrom(env = process.env) {
  const explicit = normalizeText(env.RESEND_FROM);
  if (explicit) return explicit;
  return buildFromAddress({ domain: resolveResendDomain(env) });
}

function resolveResendReplyTo(env = process.env) {
  return normalizeText(env.RESEND_REPLY_TO) || DEFAULT_REPLY_TO;
}

function resolveGraphSendFrom(env = process.env) {
  return (
    normalizeText(env.ARCANA_GRAPH_DEFAULT_SENDER) ||
    normalizeText(env.ARCANA_GRAPH_USER_ID) ||
    DEFAULT_GRAPH_FROM
  );
}

function getResendRuntimeSummary(env = process.env) {
  const configured = Boolean(normalizeText(env.RESEND_API_KEY));
  const from = resolveResendFrom(env);
  return {
    configured,
    domain: resolveResendDomain(env),
    from,
    fromMailbox: extractEmailAddress(from),
    replyTo: resolveResendReplyTo(env),
    graphSendFrom: resolveGraphSendFrom(env),
  };
}

module.exports = {
  DEFAULT_RESEND_DOMAIN,
  DEFAULT_REPLY_TO,
  buildFromAddress,
  extractEmailAddress,
  extractDomain,
  resolveResendDomain,
  resolveResendFrom,
  resolveResendReplyTo,
  resolveGraphSendFrom,
  getResendRuntimeSummary,
};
