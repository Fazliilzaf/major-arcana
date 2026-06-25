'use strict';

/**
 * CCO AI-tjänst (offline / deterministisk).
 *
 * Detta är INTE en store — modulen exporterar rena funktioner utan persistens
 * och utan externa anrop (ingen LLM, inget nätverk). Allt arbete sker lokalt
 * med mallar och regex-heuristik så att resultatet är förutsägbart och
 * testbart.
 *
 * Exporterar:
 *   - VALID_TONES: tillåtna toner för draftReply.
 *   - draftReply(input): genererar ett svarsutkast utifrån inkommande meddelande.
 *       Returnerar { draft, tone, metadata: { intent, wordCount } }.
 *       Kastar fel med statusCode 400 om input.tone inte är giltig.
 *   - extractFields(input): extraherar strukturerade fält (namn, e-post, telefon,
 *       datum m.m.) ur fritext via regex. Returnerar
 *       { fields, confidence, metadata: { textLength } }.
 */

const VALID_TONES = Object.freeze([
  'professional',
  'friendly',
  'formal',
  'empathetic',
  'concise',
  'warm',
  'solution',
  'decision',
]);

// Hälsningsfras + avslutning per ton (svenska, kundkommunikation).
const TONE_PRESETS = Object.freeze({
  professional: {
    greeting: 'Hej',
    closing: 'Med vänliga hälsningar',
    opener: 'Tack för ditt meddelande.',
  },
  friendly: {
    greeting: 'Hej',
    closing: 'Ha en fin dag',
    opener: 'Vad kul att höra från dig!',
  },
  formal: {
    greeting: 'God dag',
    closing: 'Med vänlig hälsning',
    opener: 'Tack för Er hänvändelse.',
  },
  empathetic: {
    greeting: 'Hej',
    closing: 'Varma hälsningar',
    opener: 'Tack för att du hör av dig, vi förstår att detta är viktigt för dig.',
  },
  concise: {
    greeting: 'Hej',
    closing: 'Mvh',
    opener: 'Tack för ditt meddelande.',
  },
  warm: {
    greeting: 'Hej',
    closing: 'Med vänliga hälsningar',
    opener: 'Vad roligt att höra från dig!',
  },
  solution: {
    greeting: 'Hej',
    closing: 'Med vänliga hälsningar',
    opener: 'Tack för att du hör av dig — vi hjälper dig vidare.',
  },
  decision: {
    greeting: 'Hej',
    closing: 'Med vänliga hälsningar',
    opener: 'Tack för ditt meddelande. Här är vårt förslag på nästa steg.',
  },
});

const DEFAULT_TONE = 'professional';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function countWords(text) {
  const trimmed = normalizeText(text);
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Heuristisk intent-detektering på inkommande meddelande. Helt lokal —
 * matchar svenska/engelska nyckelord mot ett fåtal vanliga kundärenden.
 */
function detectIntent(message) {
  const text = normalizeKey(message);
  if (!text) return 'general';
  if (/\b(boka|ombok|avboka|tid|tider|booking|appointment|schedule)\b/.test(text)) {
    return 'booking';
  }
  if (/\b(pris|prislista|kostar|kostnad|offert|price|quote|cost)\b/.test(text)) {
    return 'pricing';
  }
  if (/\b(klag|missnöjd|fel|problem|complaint|issue|refund|återbetal)\b/.test(text)) {
    return 'complaint';
  }
  if (/\b(tack|grymt|nöjd|thanks|thank you|great)\b/.test(text)) {
    return 'gratitude';
  }
  if (/\b(fråga|undrar|hur|när|var|question|wondering|how|when|where)\b/.test(text)) {
    return 'inquiry';
  }
  return 'general';
}

// Mall-svar per intent (svenska). Deterministiskt, ingen generering.
const INTENT_BODY = Object.freeze({
  booking:
    'Vi hjälper dig gärna med din tid. Återkom med önskat datum och tidpunkt så bekräftar vi bokningen så snart vi kan.',
  pricing:
    'Vi återkommer gärna med prisuppgifter. Beskriv kort vad ärendet gäller så skickar vi en detaljerad offert.',
  complaint:
    'Vi beklagar det inträffade och tar din synpunkt på största allvar. Vi ser över ärendet och återkommer med en lösning.',
  gratitude: 'Det värmer att höra! Tveka inte att höra av dig igen om du behöver något mer.',
  inquiry:
    'Tack för din fråga. Vi tittar närmare på detta och återkommer med ett tydligt svar så snart som möjligt.',
  general: 'Vi har tagit emot ditt meddelande och återkommer till dig så snart vi kan.',
});

/**
 * Genererar ett deterministiskt svarsutkast.
 *
 * Input: { message, context?, tone?, customerName?, agentName? }
 * Output: { draft, tone, metadata: { intent, wordCount } }
 */
function draftReply(input = {}) {
  const safe = asObject(input);

  const requestedTone = normalizeKey(safe.tone);
  if (requestedTone && !VALID_TONES.includes(requestedTone)) {
    throw badRequest(`Ogiltig ton: "${safe.tone}". Giltiga toner: ${VALID_TONES.join(', ')}.`);
  }
  const tone = requestedTone || DEFAULT_TONE;
  const preset = TONE_PRESETS[tone] || TONE_PRESETS[DEFAULT_TONE];

  const message = normalizeText(safe.message || safe.threadSnippet);
  const context = normalizeText(safe.context);
  const customerName = normalizeText(safe.customerName);
  const agentName = normalizeText(safe.agentName);
  const explicitIntent = normalizeKey(safe.intent);
  const explicitClosing = normalizeText(safe.closing);
  const explicitSignature = normalizeText(safe.signature);

  const intent = explicitIntent || detectIntent(message);

  const salutation = customerName ? `${preset.greeting} ${customerName},` : `${preset.greeting},`;

  const lines = [salutation, '', preset.opener];

  const body = INTENT_BODY[intent] || INTENT_BODY.general;
  lines.push(body);

  if (explicitClosing) {
    lines.push(explicitClosing);
  }

  if (context) {
    lines.push(`Gällande "${context}" noterar vi detta och tar med det i vårt svar.`);
  }

  if (explicitSignature) {
    lines.push('', explicitSignature);
  } else {
    lines.push('', preset.closing, agentName || 'Kundteamet');
  }

  const draft = lines.join('\n');

  return {
    body: draft,
    draft,
    tone,
    metadata: {
      intent,
      wordCount: countWords(draft),
    },
  };
}

// Regex-heuristiker för fältextraktion. Lokala, ingen NLP-tjänst.
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Svenska/internationella telefonnummer: tillåter +, mellanslag, bindestreck, parenteser.
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/;
// ISO-datum (2026-06-24) eller svenskt punkt/snedstreck-format.
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/;
// Svenskt personnummer (YYMMDD-XXXX eller YYYYMMDD-XXXX).
const PERSONNUMMER_RE = /\b(?:\d{6}|\d{8})[-+]?\d{4}\b/;
// "Namn: Anna Andersson" eller "Jag heter Anna Andersson".
const NAME_RE =
  /(?:namn|name|jag heter|mitt namn är)\s*[:\-]?\s*([A-Za-zÅÄÖåäö]+(?:\s+[A-Za-zÅÄÖåäö]+){0,3})/i;

function firstMatch(regex, text) {
  const m = regex.exec(text);
  return m ? (m[1] !== undefined ? m[1] : m[0]) : null;
}

/**
 * Extraherar strukturerade fält ur fritext.
 *
 * Input: { text } (eller { message } / { body } som alias)
 * Output: { fields, confidence, metadata: { textLength } }
 *
 * fields kan innehålla: name, email, phone, date, personnummer.
 * Endast hittade fält tas med. confidence = andel fält av maxantal (0..1),
 * avrundat till två decimaler.
 */
function extractFields(input = {}) {
  const safe = asObject(input);
  const text = normalizeText(safe.text || safe.message || safe.body);

  const fields = {};

  const email = firstMatch(EMAIL_RE, text);
  if (email) fields.email = email.toLowerCase();

  const personnummer = firstMatch(PERSONNUMMER_RE, text);
  if (personnummer) fields.personnummer = personnummer;

  // Telefon: undvik att råka plocka upp ett redan matchat personnummer.
  const phone = firstMatch(PHONE_RE, text);
  if (phone) {
    const cleaned = phone.trim();
    if (!personnummer || cleaned.replace(/\D/g, '') !== personnummer.replace(/\D/g, '')) {
      fields.phone = cleaned;
    }
  }

  const date = firstMatch(DATE_RE, text);
  if (date) fields.date = date;

  const name = firstMatch(NAME_RE, text);
  if (name) fields.name = name.trim();

  const MAX_FIELDS = 5;
  const found = Object.keys(fields).length;
  const confidence = text ? Math.round((found / MAX_FIELDS) * 100) / 100 : 0;

  return {
    fields,
    confidence,
    metadata: {
      textLength: text.length,
    },
  };
}

module.exports = {
  VALID_TONES,
  DEFAULT_TONE,
  detectIntent,
  draftReply,
  extractFields,
};
