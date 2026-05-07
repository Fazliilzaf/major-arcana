/**
 * Major Arcana Preview — Sentiment + Intent Badges på kö-kort (Fas 5).
 *
 * Auto-injekterar små visuella badges på varje [data-runtime-thread]-kort
 * baserat på lokal heuristisk analys av kortets text-content.
 *
 * Backend har full sentiment+intent-detektion via SummarizeThread, men för
 * snabba inline-badges på 50+ trådar kör vi DOM-skrapning + lokal heuristik.
 * Kortets huvudtext (preview-line + name + subtitle) räcker oftast för att
 * fånga grovt sentiment.
 *
 * MutationObserver re-applicerar badges när trådar laddas in via live-refresh.
 */
(() => {
  'use strict';

  let observerBound = false;

  // Markörer (subset av backend-implementationen — för snabbhet)
  const POSITIVE_MARKERS = ['tack', 'tacksam', 'jättekul', 'perfekt', 'underbar', 'glad', 'nöjd', 'thanks', 'great', 'awesome', '😊', '🙏'];
  const NEGATIVE_MARKERS = ['besviken', 'missnöjd', 'arg', 'klagomål', 'oacceptabelt', 'avbokar', 'avslutar', 'reklamation', 'angry', 'disappointed', '😡', '👎'];
  const ANXIOUS_MARKERS = ['orolig', 'rädd', 'nervös', 'osäker', 'biverkning', 'risk', 'farligt', 'panik', 'worried', 'anxious', 'scared'];
  const URGENT_MARKERS = ['akut', 'brådskande', 'nödfall', 'omedelbart', 'genast', 'asap', '112', 'urgent', 'emergency'];

  const BOOKING_MARKERS = ['boka', 'bokning', 'tid hos', 'konsultation', 'book', 'appointment'];
  const PRICING_MARKERS = ['pris', 'priser', 'kostar', 'kostnad', 'price', 'pricing'];
  const COMPLAINT_MARKERS = ['klagomål', 'klaga', 'reklamation', 'complaint'];
  const CANCELLATION_MARKERS = ['avboka', 'avbokar', 'avbokat', 'cancel', 'avsluta'];

  function lowerText(el) {
    return (el?.textContent || '').toLowerCase();
  }

  function hasAny(text, markers) {
    for (const m of markers) {
      if (text.includes(m)) return true;
    }
    return false;
  }

  function detectQuickSentiment(text) {
    if (hasAny(text, URGENT_MARKERS)) return { code: 'urgent', icon: '🚨', label: 'Akut', tone: 'red' };
    if (hasAny(text, NEGATIVE_MARKERS)) return { code: 'negative', icon: '😟', label: 'Negativ', tone: 'red' };
    if (hasAny(text, ANXIOUS_MARKERS)) return { code: 'anxious', icon: '😰', label: 'Orolig', tone: 'amber' };
    if (hasAny(text, POSITIVE_MARKERS)) return { code: 'positive', icon: '😊', label: 'Positiv', tone: 'green' };
    return null;
  }

  function detectQuickIntent(text) {
    if (hasAny(text, COMPLAINT_MARKERS)) return { code: 'complaint', icon: '⚠️', label: 'Klagomål' };
    if (hasAny(text, CANCELLATION_MARKERS)) return { code: 'cancellation', icon: '🚫', label: 'Avbokning' };
    if (hasAny(text, BOOKING_MARKERS)) return { code: 'booking', icon: '📅', label: 'Bokning' };
    if (hasAny(text, PRICING_MARKERS)) return { code: 'pricing', icon: '💰', label: 'Pris' };
    return null;
  }

  function applyBadgesToCard(card) {
    if (!card || card.__ccoSentimentApplied) return;
    const text = lowerText(card);
    if (!text) return;

    const sentiment = detectQuickSentiment(text);
    const intent = detectQuickIntent(text);

    if (!sentiment && !intent) {
      card.__ccoSentimentApplied = true;
      return;
    }

    // warm-row v7: vi visar inte längre sentiment/intent-badges som DOM-element
    // (de är ersatta av en enskild färgad why-rad i markup). Sätt bara
    // data-attribut på kortet så CSS/andra delar kan reagera.
    if (sentiment) card.setAttribute('data-quick-sentiment', sentiment.code);
    if (intent) card.setAttribute('data-quick-intent', intent.code);
    card.__ccoSentimentApplied = true;
  }

  function applyBadgesToAllCards() {
    document.querySelectorAll('[data-runtime-thread]').forEach((card) => {
      applyBadgesToCard(card);
    });
  }

  function injectStyles() {
    if (document.getElementById('cco-card-badges-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-card-badges-styles';
    style.textContent = `
.cco-card-badges {
  display: inline-flex; gap: 4px; align-items: center;
  margin-right: 6px;
  vertical-align: middle;
}
.cco-card-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  border-radius: 50%;
  font-size: 13px; line-height: 1;
  background: rgba(80, 60, 40, 0.08);
  cursor: help;
}
.cco-card-badge.is-tone-green { background: rgba(40, 130, 90, 0.20); }
.cco-card-badge.is-tone-red { background: rgba(180, 50, 50, 0.20); }
.cco-card-badge.is-tone-amber { background: rgba(180, 130, 40, 0.22); }
.cco-card-badge-intent { background: rgba(80, 100, 180, 0.18); }
[data-quick-sentiment="urgent"] {
  box-shadow: inset 3px 0 0 rgba(180, 50, 50, 0.55);
}
[data-quick-sentiment="negative"] {
  box-shadow: inset 3px 0 0 rgba(180, 50, 50, 0.30);
}
[data-quick-sentiment="anxious"] {
  box-shadow: inset 3px 0 0 rgba(180, 130, 40, 0.40);
}
[data-cco-theme="dark"] .cco-card-badge,
.is-dark .cco-card-badge,
html[data-theme="dark"] .cco-card-badge {
  background: rgba(255, 255, 255, 0.10);
}
`.trim();
    document.head.appendChild(style);
  }

  function bindMutationObserver() {
    if (observerBound) return;
    if (typeof MutationObserver !== 'function') return;
    let scheduled = false;
    const obs = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        applyBadgesToAllCards();
      });
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
    });
    observerBound = true;
  }

  function mount() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectStyles();
        applyBadgesToAllCards();
        bindMutationObserver();
      }, { once: true });
    } else {
      injectStyles();
      applyBadgesToAllCards();
      bindMutationObserver();
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewSentimentBadges = Object.freeze({
      mount,
      applyBadgesToAllCards,
      detectQuickSentiment,
      detectQuickIntent,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
