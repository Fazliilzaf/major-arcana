/* cco-polish.js — alltid på
 *
 * Ersätter emoji-content i .cco-card-badge-sentiment och .cco-card-badge-intent
 * med SVG-symboler. Lägger till data-intent/data-sentiment som CSS kan färga efter.
 *
 * Kör en gång + via MutationObserver för nya cards.
 */
(function () {
  'use strict';

  const SVG = {
    // sentiment
    anxious:  '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    happy:    '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    neutral:  '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>',
    negative: '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    angry:    '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    // intent
    booking:   '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    pricing:   '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    complaint: '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    question:  '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    other:     '<svg class="cco-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };

  const TONE_TO_SENTIMENT = {
    'is-tone-amber': 'anxious',
    'is-tone-red': 'angry',
    'is-tone-emerald': 'happy',
    'is-tone-green': 'happy',
    'is-tone-blue': 'neutral',
    'is-tone-gray': 'neutral'
  };

  function replaceBadge(b) {
    if (b.dataset.svgPolished === '1' && b.querySelector('svg.cco-svg-icon')) return;

    const card = b.closest('.thread-card');
    const isSentiment = b.classList.contains('cco-card-badge-sentiment');
    const isIntent = b.classList.contains('cco-card-badge-intent');
    if (!isSentiment && !isIntent) return;

    let key = 'other';
    if (isSentiment) {
      const dataSent = card?.getAttribute('data-quick-sentiment') || '';
      const tone = Array.from(b.classList).find(c => c.startsWith('is-tone-')) || '';
      key = SVG[dataSent] ? dataSent : (TONE_TO_SENTIMENT[tone] || 'neutral');
    } else if (isIntent) {
      const dataIntent = card?.getAttribute('data-quick-intent') || '';
      key = SVG[dataIntent] ? dataIntent : 'other';
      // Sätt data-intent på själva badge så CSS kan färga
      if (dataIntent) b.setAttribute('data-intent', dataIntent);
    }

    b.innerHTML = SVG[key] || SVG.other;
    b.dataset.svgPolished = '1';
  }

  function pass() {
    document.querySelectorAll('.cco-card-badge-sentiment, .cco-card-badge-intent').forEach(replaceBadge);
  }

  // Initial + periodisk + observer
  pass();
  setInterval(pass, 2500);

  if (window.__ccoPolishObs) window.__ccoPolishObs.disconnect();
  const obs = new MutationObserver(function (muts) {
    let needs = false;
    for (const m of muts) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) {
            if (n.classList && (n.classList.contains('cco-card-badge-sentiment') || n.classList.contains('cco-card-badge-intent'))) {
              needs = true;
              break;
            }
            if (n.querySelector && n.querySelector('.cco-card-badge-sentiment, .cco-card-badge-intent')) {
              needs = true;
              break;
            }
          }
        }
      } else if (m.type === 'characterData') {
        const t = m.target.parentElement;
        if (t && (t.classList?.contains('cco-card-badge-sentiment') || t.classList?.contains('cco-card-badge-intent'))) {
          // Endast om innehållet är emoji (inte vår SVG)
          if (!t.querySelector('svg.cco-svg-icon')) {
            needs = true;
            break;
          }
        }
      }
      if (needs) break;
    }
    if (needs) pass();
  });
  obs.observe(document.body, { childList: true, subtree: true });
  window.__ccoPolishObs = obs;
})();
