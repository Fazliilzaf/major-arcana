'use strict';

/**
 * Language Detection — heuristisk språk-detektor.
 *
 * Stöder: sv, en, de, da, no, fi, es, fr (+ fallback 'unknown')
 *
 * Strategi:
 *   1. Räkna karaktäristiska tecken per språk (æ, ø, å, ä, ö, ß, ñ, é osv.)
 *   2. Räkna högfrekventa stop-words per språk
 *   3. Kombinera scores → välj språk med högst poäng
 *
 * För korta texter (< 20 tecken) returneras 'unknown' med låg confidence.
 *
 * Designprinciper:
 *   - Ren JS, inga externa beroenden
 *   - Returnerar både primary + alternates med confidence
 *   - Snabb (< 1ms för normala mejl)
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const SUPPORTED_LANGUAGES = Object.freeze([
  'sv', // Svenska
  'en', // English
  'da', // Dansk
  'no', // Norsk (bokmål)
  'de', // Deutsch
  'fi', // Suomi
  'es', // Español
  'fr', // Français
]);

const LANGUAGE_LABELS = Object.freeze({
  sv: { native: 'Svenska', flag: '🇸🇪' },
  en: { native: 'English', flag: '🇬🇧' },
  da: { native: 'Dansk', flag: '🇩🇰' },
  no: { native: 'Norsk', flag: '🇳🇴' },
  de: { native: 'Deutsch', flag: '🇩🇪' },
  fi: { native: 'Suomi', flag: '🇫🇮' },
  es: { native: 'Español', flag: '🇪🇸' },
  fr: { native: 'Français', flag: '🇫🇷' },
  unknown: { native: 'Okänt', flag: '❓' },
});

// Stop-words som starkt indikerar språket (case-insensitive)
const STOP_WORDS = Object.freeze({
  sv: new Set([
    'och', 'är', 'att', 'det', 'som', 'en', 'på', 'för', 'av', 'jag', 'du',
    'vi', 'har', 'kan', 'om', 'men', 'eller', 'inte', 'mer', 'vid', 'när',
    'med', 'till', 'från', 'genom', 'mellan', 'efter', 'innan', 'hej',
    'tack', 'mvh', 'bästa', 'hälsningar', 'sedan', 'också', 'där', 'här',
  ]),
  en: new Set([
    'the', 'and', 'is', 'of', 'to', 'in', 'that', 'it', 'you', 'are',
    'for', 'on', 'with', 'was', 'but', 'not', 'this', 'have', 'can', 'will',
    'would', 'could', 'should', 'about', 'because', 'thanks', 'regards',
    'best', 'sincerely', 'kind', 'dear', 'hello', 'hi', 'thank', 'please',
  ]),
  da: new Set([
    'og', 'er', 'det', 'som', 'en', 'på', 'for', 'af', 'jeg', 'du',
    'vi', 'har', 'kan', 'om', 'men', 'eller', 'ikke', 'mere', 'ved',
    'med', 'til', 'fra', 'gennem', 'mellem', 'efter', 'før', 'tak',
    'venlig', 'hilsen', 'kære', 'også', 'her', 'der',
  ]),
  no: new Set([
    'og', 'er', 'det', 'som', 'en', 'på', 'for', 'av', 'jeg', 'du',
    'vi', 'har', 'kan', 'om', 'men', 'eller', 'ikke', 'mer', 'ved',
    'med', 'til', 'fra', 'gjennom', 'mellom', 'etter', 'før', 'takk',
    'vennlig', 'hilsen', 'kjære', 'også', 'her', 'der',
  ]),
  de: new Set([
    'der', 'die', 'das', 'und', 'ist', 'ich', 'du', 'ein', 'eine', 'mit',
    'von', 'zu', 'für', 'nicht', 'wir', 'sie', 'auf', 'sich', 'oder',
    'aber', 'nach', 'durch', 'zwischen', 'danke', 'grüße', 'mit', 'sehr',
    'geehrte', 'hallo',
  ]),
  fi: new Set([
    'ja', 'on', 'ei', 'että', 'olen', 'mutta', 'tai', 'kun', 'kuin',
    'sinä', 'minä', 'me', 'te', 'he', 'kanssa', 'ilman', 'kiitos',
    'terveisin', 'hei', 'parhain',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'es', 'son', 'que', 'y', 'a', 'de',
    'en', 'por', 'para', 'con', 'sin', 'pero', 'gracias', 'saludos',
    'estimado', 'hola', 'cordial',
  ]),
  fr: new Set([
    'le', 'la', 'les', 'est', 'sont', 'que', 'et', 'à', 'de', 'des',
    'en', 'par', 'pour', 'avec', 'sans', 'mais', 'merci', 'cordialement',
    'bonjour', 'salutations',
  ]),
});

// Karaktäristiska tecken per språk (vikter)
const CHAR_WEIGHTS = Object.freeze([
  { lang: 'sv', chars: 'åäöÅÄÖ', weight: 2 },
  { lang: 'da', chars: 'æøÆØ', weight: 3 },
  { lang: 'no', chars: 'æøÆØ', weight: 1.5 }, // Lägre än da pga stop-word skiljer
  { lang: 'de', chars: 'äöüßÄÖÜ', weight: 2 },
  { lang: 'es', chars: 'ñÑ¿¡', weight: 3 },
  { lang: 'fr', chars: 'çàâêîôûüÇÀÂÊÎÔÛÜ', weight: 1.5 },
  { lang: 'fi', chars: 'äöÄÖ', weight: 0.5 }, // Delar med sv/de
]);

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Beräkna score per språk för en given text.
 * Returnerar { sv: 12, en: 3, ... }
 */
function scoreLanguages(text) {
  const safe = normalizeText(text);
  const scores = {};
  for (const lang of SUPPORTED_LANGUAGES) scores[lang] = 0;

  if (!safe) return scores;

  // Char-poäng
  for (const { lang, chars, weight } of CHAR_WEIGHTS) {
    let count = 0;
    for (const c of chars) {
      // Räkna förekomster
      const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = safe.match(new RegExp(escaped, 'g'));
      if (matches) count += matches.length;
    }
    if (count > 0) scores[lang] += count * weight;
  }

  // Stop-word-poäng
  const tokens = tokenize(safe);
  if (tokens.length === 0) return scores;
  for (const token of tokens) {
    for (const lang of SUPPORTED_LANGUAGES) {
      if (STOP_WORDS[lang].has(token)) scores[lang] += 1;
    }
  }

  // Disambiguering: SV vs DA/NO (de delar struktur men har olika stop-words)
  // DA "og" + "er" + "ikke" + "tak" är starka markörer
  // SV "och" + "är" + "inte" + "tack" är starka markörer
  // Om båda har träffar, det med fler unikt-språk-stop-words vinner

  return scores;
}

/**
 * Detektera språk för en text. Returnerar primary language + alternates.
 *
 * @returns {{ language: string, confidence: number, alternates: Array<{ language, score }> }}
 */
function detectLanguage(text, { minLength = 12 } = {}) {
  const safe = normalizeText(text);
  if (safe.length < minLength) {
    return { language: 'unknown', confidence: 0, alternates: [] };
  }

  const scores = scoreLanguages(safe);
  const sorted = Object.entries(scores)
    .map(([lang, score]) => ({ language: lang, score }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (sorted.length === 0) {
    return { language: 'unknown', confidence: 0, alternates: [] };
  }

  const top = sorted[0];
  const total = sorted.reduce((acc, e) => acc + e.score, 0);
  const confidence = total > 0 ? Math.min(1, top.score / total) : 0;

  // Behöver minst 2 hits för att vara konfidens-värdig
  if (top.score < 2) {
    return {
      language: 'unknown',
      confidence: 0,
      alternates: sorted.slice(0, 3),
    };
  }

  return {
    language: top.language,
    confidence: Math.round(confidence * 100) / 100,
    alternates: sorted.slice(1, 4),
  };
}

/**
 * Detektera språk för en konversation (lista av meddelanden).
 *
 * Returnerar:
 *   { primaryLanguage, languageBreakdown: { sv: 3, en: 1 }, perMessage: [...] }
 *
 * Det "primära" språket är det som dominerar i kund-meddelanden (inbound),
 * eftersom det är det språk vi ska svara på.
 */
function detectConversationLanguage(messages = [], { customerDirection = 'inbound' } = {}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const perMessage = [];
  const inboundCounts = {};
  const allCounts = {};

  for (const msg of safeMessages) {
    const body = normalizeText(msg?.body || msg?.bodyPreview || msg?.text);
    if (!body) {
      perMessage.push({ language: 'unknown', confidence: 0 });
      continue;
    }
    const result = detectLanguage(body);
    perMessage.push({
      language: result.language,
      confidence: result.confidence,
      direction: msg?.direction || 'inbound',
    });
    if (result.language !== 'unknown') {
      allCounts[result.language] = (allCounts[result.language] || 0) + 1;
      const direction = String(msg?.direction || 'inbound').toLowerCase();
      if (direction === customerDirection) {
        inboundCounts[result.language] = (inboundCounts[result.language] || 0) + 1;
      }
    }
  }

  // Plocka primary från inbound (kund-meddelanden), fallback från alla
  const inboundEntries = Object.entries(inboundCounts).sort((a, b) => b[1] - a[1]);
  const allEntries = Object.entries(allCounts).sort((a, b) => b[1] - a[1]);
  const primaryLanguage =
    inboundEntries.length > 0
      ? inboundEntries[0][0]
      : allEntries.length > 0
        ? allEntries[0][0]
        : 'unknown';

  return {
    primaryLanguage,
    languageBreakdown: allCounts,
    inboundLanguageBreakdown: inboundCounts,
    perMessage,
    confidence: primaryLanguage === 'unknown' ? 0 : Math.min(1, (inboundCounts[primaryLanguage] || allCounts[primaryLanguage] || 0) / Math.max(1, perMessage.length)),
  };
}

function getLanguageLabel(languageCode) {
  return LANGUAGE_LABELS[languageCode] || LANGUAGE_LABELS.unknown;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  detectLanguage,
  detectConversationLanguage,
  scoreLanguages,
  getLanguageLabel,
};
