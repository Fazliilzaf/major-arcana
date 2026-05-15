/**
 * app/system-mail-display.js — kör system-mail-parser på thread-cards.
 *
 * När en card har en sender som är ett system-namn (No Reply, Notifications,
 * Smartdocs, etc.) — kalla MajorArcanaSystemMailParser.parse och om ett
 * kundnamn extraheras: ersätt sender-texten och markera kortet med en
 * system-label (visas av app/signal-bar.js som en signal-pill).
 *
 * Idempotent: rör bara kort med dataset.systemMailFixed === undefined.
 */
(() => {
  'use strict';

  const FIXED_FLAG = 'systemMailFixed';

  function getSenderEmail(card) {
    // Thread-ID är ofta email-adressen vid demo + första instans i prod
    const tid = card.dataset.runtimeThread || card.dataset.historyConversation || '';
    if (tid && tid.includes('@')) return tid;
    // Fallback: leta i alla attribut efter email-mönster
    for (const a of card.attributes || []) {
      const m = (a.value || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (m) return m[0];
    }
    return '';
  }

  function getSenderText(card) {
    return card.querySelector('.warm-sender')?.textContent?.trim() || '';
  }

  function getSubjectText(card) {
    return (
      card.querySelector('.warm-subject, .warm-subtitle, [class*="subject"]')?.textContent?.trim() ||
      ''
    );
  }

  function getBodyText(card) {
    return (
      card.querySelector('.warm-preview, [class*="preview"]')?.textContent?.trim() || ''
    );
  }

  function applyToCard(card) {
    if (!card || card.dataset[FIXED_FLAG]) return;
    const parser = window.MajorArcanaSystemMailParser;
    if (!parser || typeof parser.parse !== 'function') return;

    // Om app.js customer-name-resolver redan löste sender via parsern och satte
    // data-system-mail-label på elementet — då behöver vi inte parsa igen.
    // Vi flaggar bara kortet som klart så vi inte skannar det igen.
    if (card.dataset.systemMailLabel) {
      card.dataset[FIXED_FLAG] = 'pre-resolved';
      return;
    }

    const senderName = getSenderText(card);
    const senderEmail = getSenderEmail(card);

    // Bara kör parsern om sendern ser ut som system-mejl
    if (!parser.isSystemSender(senderEmail, senderName)) {
      card.dataset[FIXED_FLAG] = 'skip';
      return;
    }

    const result = parser.parse({
      senderEmail,
      senderName,
      subject: getSubjectText(card),
      body: getBodyText(card),
    });

    if (!result) {
      card.dataset[FIXED_FLAG] = 'no-match';
      return;
    }

    // Ersätt sender-text om vi har ett namn
    if (result.customerName) {
      const senderEl = card.querySelector('.warm-sender');
      if (senderEl && senderEl.textContent.trim() !== result.customerName) {
        senderEl.textContent = result.customerName;
      }
    }

    // Markera kortet med system-label så signal-bar kan rendera det som en pill
    if (result.systemLabel) {
      card.dataset.systemMailLabel = result.systemLabel;
    }

    card.dataset[FIXED_FLAG] = 'done';
  }

  function applyAll() {
    document
      .querySelectorAll('.queue-history-list .thread-card[data-runtime-thread]')
      .forEach(applyToCard);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyAll();
    });
  }

  // Polling-cap: undvik att polla för evigt om .queue-history-list aldrig
  // dyker upp (t.ex. om användaren aldrig öppnar kö-vyn). 60 försök × 500 ms
  // = 30 s sammantaget. Efter det ger vi upp tills nästa interval-tick.
  let bindAttempts = 0;
  const MAX_BIND_ATTEMPTS = 60;
  let intervalHandle = null;

  function bindObserver() {
    const list = document.querySelector('.queue-history-list');
    if (!list) {
      bindAttempts++;
      if (bindAttempts < MAX_BIND_ATTEMPTS) {
        setTimeout(bindObserver, 500);
      }
      return;
    }
    bindAttempts = 0;
    const obs = new MutationObserver(() => {
      // Reset FIXED_FLAG på kort som muterats så vi kan re-applicera
      // (t.ex. när customer-name-resolver också körts efter oss).
      schedule();
    });
    obs.observe(list, { childList: true, subtree: true });
    schedule();
    // Stoppa intervall-pollen när observer är ansluten — MutationObserver
    // täcker alla framtida mutationer.
    if (intervalHandle != null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  function init() {
    bindObserver();
    // Backup-poll var 3:e sek tills observern hittar listan (då stoppas den).
    intervalHandle = setInterval(() => {
      if (intervalHandle != null) bindObserver();
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaSystemMailDisplay = Object.freeze({
      apply: applyAll,
      applyTo: applyToCard,
    });
  }
})();
