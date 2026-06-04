'use strict';

/**
 * Block live transactional mail to RFC 2606 / verify-script addresses.
 * Prevents Graph/Resend NDR bounce-backs on prod when verify scripts POST reservations.
 */

const RFC2606_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example',
  'test',
  'invalid',
  'localhost',
]);

const VERIFY_LOCAL_PREFIXES = [
  'plan-a-',
  'plan-a-dup-',
  'bokning-journal-',
  'resend-domain-verify-',
  'booking-mail-verify-',
  'web-e2e-',
  'op-signoff-',
  'verify-bridge',
  'verify-',
];

function parseEmailAddress(addr) {
  const raw = String(addr || '').trim().toLowerCase();
  const match = raw.match(/<([^>]+)>/);
  const email = (match ? match[1] : raw).trim();
  const at = email.lastIndexOf('@');
  if (at <= 0) return { local: '', domain: '' };
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

function isReservedMailDomain(domain) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d) return false;
  if (RFC2606_DOMAINS.has(d)) return true;
  if (d.endsWith('.test')) return true;
  for (const reserved of RFC2606_DOMAINS) {
    if (d === reserved || d.endsWith(`.${reserved}`)) return true;
  }
  return false;
}

function isVerifyLocalPart(local) {
  const l = String(local || '').trim().toLowerCase();
  return VERIFY_LOCAL_PREFIXES.some((prefix) => l.startsWith(prefix));
}

function isNonDeliverableRecipient(addr) {
  const { local, domain } = parseEmailAddress(addr);
  if (!domain) return false;
  return isReservedMailDomain(domain) || isVerifyLocalPart(local);
}

function shouldSkipLiveMailSend(recipients) {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  const valid = list.filter((addr) => typeof addr === 'string' && addr.includes('@'));
  if (!valid.length) return { skip: false };

  const blocked = valid.filter(isNonDeliverableRecipient);
  if (!blocked.length) return { skip: false };

  return {
    skip: true,
    reason: 'reserved_domain',
    recipients: blocked,
  };
}

module.exports = {
  shouldSkipLiveMailSend,
  isReservedMailDomain,
  isNonDeliverableRecipient,
  isVerifyLocalPart,
  parseEmailAddress,
};
