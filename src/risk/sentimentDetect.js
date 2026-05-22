'use strict';

/**
 * Sentiment Detection — heuristisk analys av kundens emotionella tonläge.
 *
 * Returnerar 5 sentiment-klasser:
 *   • positive   — tacksamt, glatt, nöjt
 *   • neutral    — sakligt, frågande
 *   • negative   — missnöjt, irriterat, klagomål
 *   • anxious    — orolig, rädd, osäker (vanligt inför behandling)
 *   • urgent     — akut, brådskande, nödfall
 *
 * Strategi:
 *   • Markörbaserad scoring per sentiment-klass
 *   • Negation-medvetenhet ("inte tack" sänker positiv-score)
 *   • Emoji-stöd (😀😢😡 osv.)
 *   • Returnerar primär sentiment + confidence + score-breakdown
 *
 * Designprinciper:
 *   • Ren JS, inga externa beroenden
 *   • Stöder svenska + engelska som primära språk
 *   • Snabb (< 1ms för normala mejl)
 */

function normalizeText(value) {
  return typeof value === 'string' ? value : '';
}

const SENTIMENT_LABELS = Object.freeze({
  positive: { label: 'Positiv', icon: '😊', tone: 'green' },
  neutral: { label: 'Neutral', icon: '➖', tone: 'gray' },
  negative: { label: 'Negativ', icon: '😟', tone: 'red' },
  anxious: { label: 'Orolig', icon: '😰', tone: 'amber' },
  urgent: { label: 'Akut', icon: '🚨', tone: 'red' },
  unknown: { label: 'Okänt', icon: '❓', tone: 'gray' },
});

// Markörer per sentiment (case-insensitive, partial match OK)
const SENTIMENT_MARKERS = Object.freeze({
  positive: [
    'tack', 'tacksam', 'tackar', 'jättekul', 'super', 'perfekt', 'underbar',
    'fantastisk', 'glad', 'nöjd', 'bra jobbat', 'uppskattar', 'mvh',
    'thanks', 'thank you', 'great', 'awesome', 'wonderful', 'happy',
    'pleased', 'amazing', 'love it', '😊', '🙏', '❤️', '😀',
  ],
  negative: [
    'besviken', 'missnöjd', 'irriterad', 'ilsken', 'arg', 'klagomål',
    'klaga', 'oacceptabelt', 'oprofessionellt', 'fel', 'dåligt',
    'usch', 'aldrig mer', 'avbokar', 'avslutar', 'reklamation',
    'disappointed', 'frustrated', 'angry', 'unacceptable', 'terrible',
    'awful', 'never again', 'complaint', '😡', '😠', '👎',
  ],
  anxious: [
    'orolig', 'rädd', 'rädd för', 'nervös', 'nervös inför', 'osäker',
    'osäker på', 'tveksam', 'biverkning', 'risk', 'risker', 'farligt',
    'gör det ont', 'smärtsamt', 'panik',
    'worried', 'anxious', 'nervous', 'scared', 'afraid', 'unsure',
    'concerned', 'risk', 'side effects', 'pain', '😰', '😟', '😨',
  ],
  urgent: [
    'akut', 'brådskande', 'nödfall', 'omedelbart', 'genast', 'asap',
    'ambulans', 'sjukhus', '112', 'måste få svar', 'försämring',
    'urgent', 'emergency', 'immediately', 'asap', 'critical', '911',
    '🚨', '⚠️',
  ],
});

// Negationer som inverterar närmaste positiv-marker
const NEGATIONS = ['inte', 'ej', 'aldrig', 'ingen', 'inga', 'not', 'never', 'no'];

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\s😀-🙏❤️👎👍⚠️🚨]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreSentiment(text) {
  const safe = normalizeText(text).toLowerCase();
  if (!safe) {
    return { positive: 0, neutral: 0, negative: 0, anxious: 0, urgent: 0 };
  }

  const scores = { positive: 0, neutral: 0, negative: 0, anxious: 0, urgent: 0 };

  // Räkna markör-träffar per sentiment
  for (const sentiment of Object.keys(SENTIMENT_MARKERS)) {
    for (const marker of SENTIMENT_MARKERS[sentiment]) {
      // Räkna alla förekomster (inte bara första)
      let count = 0;
      let pos = 0;
      while ((pos = safe.indexOf(marker, pos)) !== -1) {
        count += 1;
        pos += marker.length;
      }
      if (count > 0) scores[sentiment] += count;
    }
  }

  // Negation-justering: om en negation föregår en positiv-marker inom 3 ord,
  // räkna det som negativ istället (förenklad heuristik)
  const tokens = tokenize(safe);
  for (let i = 0; i < tokens.length - 1; i++) {
    if (NEGATIONS.includes(tokens[i])) {
      const window = tokens.slice(i + 1, i + 4).join(' ');
      for (const marker of SENTIMENT_MARKERS.positive) {
        if (window.includes(marker)) {
          scores.positive = Math.max(0, scores.positive - 1);
          scores.negative += 0.5;
        }
      }
    }
  }

  // Frågetecken-täthet → mer neutral
  const questionMarks = (safe.match(/\?/g) || []).length;
  if (questionMarks >= 2) scores.neutral += 1;
  if (questionMarks >= 4) scores.neutral += 1;

  // Utropstecken-täthet → förstärkt sentiment (om det redan finns)
  const exclamations = (safe.match(/!/g) || []).length;
  if (exclamations >= 2) {
    if (scores.positive > 0) scores.positive += 1;
    if (scores.negative > 0) scores.negative += 1;
  }

  return scores;
}

function detectSentiment(text, { minLength = 8 } = {}) {
  const safe = normalizeText(text);
  if (safe.length < minLength) {
    return {
      sentiment: 'unknown',
      confidence: 0,
      scores: { positive: 0, neutral: 0, negative: 0, anxious: 0, urgent: 0 },
    };
  }

  const scores = scoreSentiment(safe);
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  // Urgent och anxious har prioritet om de når en tröskel
  if (scores.urgent >= 1) {
    return {
      sentiment: 'urgent',
      confidence: Math.min(1, scores.urgent / 2),
      scores,
    };
  }
  if (scores.anxious >= 2) {
    return {
      sentiment: 'anxious',
      confidence: Math.min(1, scores.anxious / 4),
      scores,
    };
  }

  // Annars välj högsta score
  const sorted = Object.entries(scores)
    .filter(([s]) => s !== 'unknown')
    .sort((a, b) => b[1] - a[1]);
  const top = sorted[0];

  if (!top || top[1] === 0) {
    return { sentiment: 'neutral', confidence: 0.3, scores };
  }

  const confidence = total > 0 ? Math.min(1, top[1] / Math.max(2, total)) : 0;
  return {
    sentiment: top[0],
    confidence: Math.round(confidence * 100) / 100,
    scores,
  };
}

/**
 * Detektera sentiment för hela konversationen, vägd mot senaste kund-meddelandet
 * (eftersom det är aktuellt tillstånd vi vill agera på).
 */
function detectConversationSentiment(messages = [], { customerDirection = 'inbound' } = {}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const inbound = safeMessages.filter(
    (m) => String(m?.direction || 'inbound').toLowerCase() === customerDirection
  );
  if (inbound.length === 0) {
    return {
      currentSentiment: 'unknown',
      currentConfidence: 0,
      perMessage: [],
    };
  }

  // Senaste kund-meddelandet är primärt
  const sortedInbound = inbound.slice().sort((a, b) => {
    const ta = Date.parse(String(a?.sentAt || a?.recordedAt || ''));
    const tb = Date.parse(String(b?.sentAt || b?.recordedAt || ''));
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const latest = sortedInbound[0];
  const latestText = normalizeText(latest?.body || latest?.bodyPreview || latest?.text);
  const latestResult = detectSentiment(latestText);

  const perMessage = inbound.map((m) => {
    const text = normalizeText(m?.body || m?.bodyPreview || m?.text);
    const r = detectSentiment(text);
    return {
      sentiment: r.sentiment,
      confidence: r.confidence,
    };
  });

  return {
    currentSentiment: latestResult.sentiment,
    currentConfidence: latestResult.confidence,
    perMessage,
  };
}

function getSentimentLabel(sentimentCode) {
  return SENTIMENT_LABELS[sentimentCode] || SENTIMENT_LABELS.unknown;
}

module.exports = {
  SENTIMENT_LABELS,
  SENTIMENT_MARKERS,
  scoreSentiment,
  detectSentiment,
  detectConversationSentiment,
  getSentimentLabel,
};
