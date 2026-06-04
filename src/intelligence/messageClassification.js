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

const AUTOMATED_SENDER_PATTERN = /(?:^|\s)(?:no-reply|noreply|do-not-reply|mailer-daemon|postmaster)@/i;

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
  return normalizeText(value).toLowerCase() === 'system_mail'
    ? 'system_mail'
    : 'actionable';
}

function classifyConversationMessage({
  subject = '',
  inboundPreview = '',
  sender = '',
  intent = 'unclear',
} = {}) {
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
  matchesWeakSystemMail,
  normalizeMessageClassification,
};
