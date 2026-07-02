function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripDiacritics(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeForMatch(value = '') {
  return stripDiacritics(normalizeText(value).toLowerCase()).replace(/\s+/g, ' ');
}

const STRONG_SYSTEM_MAIL_PATTERNS = Object.freeze([
  'no-reply@',
  'noreply@',
  'do-not-reply',
  'unsubscribe',
  'newsletter',
  'nyheter:',
  'kampanj',
  'campaign',
  'erbjudande',
  'cashback',
  'verify your email',
  'bekräfta din e-post',
  'bekrafta din e-post',
  'microsoft 365',
  'du får inte ofta e-post',
  'du far inte ofta e-post',
  'power up your productivity with microsoft 365',
  'get more done with apps like word',
]);

const WEAK_SYSTEM_MAIL_PATTERNS = Object.freeze([
  'påminnelse',
  'paminnelse',
  'orderbekräftelse',
  'orderbekraftelse',
  'beställningsbekräftelse',
  'bestallningsbekraftelse',
  'kvitto',
  'receipt',
  'faktura',
  'invoice',
  'förfaller snart',
  'forfaller snart',
]);

const AUTOMATED_SENDER_PATTERN =
  /(?:^|\s)(?:no-reply|noreply|do-not-reply|mailer-daemon|postmaster)@/i;

// A2 — rena notis-/automatavsändare som ALLTID är system/brus oavsett innehåll
// (till skillnad från den bredare nonPatientRules-listan, där företagsdomäner
// kan innehålla riktiga personer). Håll i synk med nonPatientRules.js.
// OBS: gmail.com/googlemail.com finns MEDVETET inte här — patient-domäner.
const SYSTEM_NOTIFICATION_DOMAINS = Object.freeze([
  'facebookmail.com',
  'fortnox.se',
  'loopia.se',
  'google.com',
]);
const SYSTEM_NOTIFICATION_PREFIXES = Object.freeze([
  'no-reply',
  'noreply',
  'do-not-reply',
  'donotreply',
  'bounce',
  'bounces',
  'auto-reply',
  'autoreply',
  'newsletter',
  'nyhetsbrev',
  'mailer-daemon',
  'postmaster',
  'notifications',
  'notification',
]);

function isSystemNotificationSender(sender = '') {
  const email = normalizeText(sender).toLowerCase();
  const at = email.indexOf('@');
  if (at < 0) return false;
  const localPart = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return false;
  if (SYSTEM_NOTIFICATION_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return true;
  }
  return SYSTEM_NOTIFICATION_PREFIXES.some(
    (p) => localPart === p || localPart.startsWith(`${p}+`) || localPart.startsWith(`${p}.`)
  );
}

const BILLING_AUTOMATION_CONTEXT =
  /\b(betal|betalning|forfall|forfaller|forfaller snart|förfaller|autogiro|stripe|klarna|paypal|invoice due|amount due|totalbelopp|obetald|past due)\b/i;

const HUMAN_INQUIRY_PATTERN =
  /\?|fråga|fraga|förfrågan|forfragan|behandling|ingrepp|hårtransplantation|hartransplantation|hårbotten|harbotten|symptom|svullnad|smärta|smarta|pris|bokning|boka|avboka|omboka|konsultation|patient|skicka faktura|begär faktura|begra faktura|vill ha faktura|min faktura|kan inte komma|kan inte boka/i;

const ACTIONABLE_SYSTEM_INTENTS = new Set([
  'booking_request',
  'pricing_question',
  'anxiety_pre_op',
  'complaint',
  'cancellation',
  'follow_up',
]);

function matchesWeakSystemMail(haystack = '') {
  const normalizedHaystack = normalizeForMatch(haystack);
  if (!normalizedHaystack) return false;
  const hasWeakPattern = WEAK_SYSTEM_MAIL_PATTERNS.some((pattern) =>
    normalizedHaystack.includes(normalizeForMatch(pattern))
  );
  if (!hasWeakPattern) return false;
  if (AUTOMATED_SENDER_PATTERN.test(normalizedHaystack)) return true;
  if (BILLING_AUTOMATION_CONTEXT.test(normalizedHaystack)) return true;
  return /^(re|fw|fwd):?\s*(påminnelse|paminnelse|faktura|invoice|kvitto|receipt|order)/i.test(
    normalizeText(haystack)
  );
}

function normalizeMessageClassification(value = '') {
  return normalizeText(value).toLowerCase() === 'system_mail' ? 'system_mail' : 'actionable';
}

function classifyConversationMessage({
  subject = '',
  inboundPreview = '',
  sender = '',
  intent = 'unclear',
} = {}) {
  // A2: rena notis-/leverantörsavsändare (Facebook/Fortnox/Loopia/Google, samt
  // no-reply/bounce/newsletter-prefix) är ALLTID system/brus — före human-
  // inquiry-gaten, så att t.ex. en facebookmail-notis inte råkar bli actionable
  // bara för att den innehåller ett ord som "pris".
  if (isSystemNotificationSender(sender)) {
    return 'system_mail';
  }

  const haystack = [subject, inboundPreview, sender]
    .map((item) => normalizeForMatch(item))
    .filter(Boolean)
    .join(' ');
  if (!haystack) return 'actionable';

  const normalizedIntent = normalizeText(intent).toLowerCase();
  const looksHumanInquiry = HUMAN_INQUIRY_PATTERN.test(haystack);
  if (ACTIONABLE_SYSTEM_INTENTS.has(normalizedIntent) || looksHumanInquiry) {
    return 'actionable';
  }

  const strongMatch = STRONG_SYSTEM_MAIL_PATTERNS.some((pattern) =>
    haystack.includes(normalizeForMatch(pattern))
  );
  if (strongMatch || matchesWeakSystemMail(haystack)) {
    return 'system_mail';
  }

  return 'actionable';
}

module.exports = {
  ACTIONABLE_SYSTEM_INTENTS,
  classifyConversationMessage,
  isSystemNotificationSender,
  matchesWeakSystemMail,
  normalizeMessageClassification,
};
