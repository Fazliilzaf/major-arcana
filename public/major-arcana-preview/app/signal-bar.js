/**
 * app/signal-bar.js — konsoliderad signal-rad längst ner på thread-card.
 *
 * Användarens önskan: alla "smarta" signaler (lane, status, risk, intent,
 * mailbox, AI-utkast) ska samlas på EN horisontell scroll-rad längst ner
 * på kortet med symbol + kort text — istället för att vara utspridda
 * överallt på kortet.
 *
 * Detta är TESTLÄGE: appliceras endast på FÖRSTA thread-card i
 * .queue-history-list. Om det fungerar bra rullar vi ut till alla.
 *
 * Strategi:
 *   - Lägg .has-signal-bar på testkortet
 *   - Bygg <div class="thread-card-signal-bar"> med pills
 *   - CSS i cco-polish.css gömmer originalen (.lane-badge, .warm-why etc)
 *     ENBART på .has-signal-bar
 *   - MutationObserver re-applicerar om renderApp-wipes
 */
(() => {
  'use strict';

  const LANES = {
    'act-now':  { color: '#EF4444', label: 'Agera nu',  icon: '●' },
    'act_now':  { color: '#EF4444', label: 'Agera nu',  icon: '●' },
    'sprint':   { color: '#4F46E5', label: 'Sprint',    icon: '◆' },
    'bookable': { color: '#16A34A', label: 'Bokning',   icon: '✓' },
    'booking':  { color: '#16A34A', label: 'Bokning',   icon: '✓' },
    'review':   { color: '#4F46E5', label: 'Granska',   icon: '◐' },
    'unclear':  { color: '#7C3AED', label: 'Oklart',    icon: '?' },
    'later':    { color: '#F59E0B', label: 'Senare',    icon: '⏱' },
    'admin':    { color: '#64748B', label: 'Admin',     icon: '⚙' },
    'medical':  { color: '#0EA5E9', label: 'Medicinsk', icon: '✚' },
    'all':      { color: '#64748B', label: 'Alla',      icon: '·' },
  };

  function buildSignals(card) {
    const signals = [];

    // 1) Lane — från data-lane
    const laneId = (card.dataset.lane || '').toLowerCase();
    const lane = LANES[laneId];
    if (lane) {
      signals.push({ type: 'lane', ...lane });
    } else {
      // Fallback: läs lane-badge text
      const badge = card.querySelector('.lane-badge');
      const txt = badge?.textContent?.trim();
      if (txt) signals.push({ type: 'lane', color: '#64748B', label: txt, icon: '●' });
    }

    // 2) Risk / "warm-why" — om text matchar miss-risk/hög risk/otillgänglig
    const why = card.querySelector('.warm-why .why-reason, .warm-why')?.textContent?.trim();
    if (why) {
      const txt = why.toLowerCase();
      if (/miss-risk|hög risk|otillgänglig|risk/i.test(txt)) {
        signals.push({ type: 'risk', color: '#F59E0B', label: why, icon: '⚠' });
      }
    }

    // 3) Status — meta-status text (om relevant)
    const status = card.querySelector('.meta-status')?.textContent?.trim();
    if (status && !/^system$/i.test(status)) {
      signals.push({ type: 'status', color: '#64748B', label: status, icon: '◐' });
    }

    // 4) Mailbox — try multiple selectors
    const mailbox =
      card.querySelector('[data-mailbox-label]')?.textContent?.trim() ||
      card.querySelector('.warm-mailbox')?.textContent?.trim() ||
      card.querySelector('.thread-mailbox')?.textContent?.trim();
    if (mailbox) {
      signals.push({ type: 'mailbox', color: '#0891B2', label: mailbox, icon: '📥' });
    }

    // 5) AI-utkast — om kortet har utkast-pill
    const draft = card.querySelector('.draft-pill, [class*="ai-draft"], [class*="draft-status"]');
    if (draft) {
      signals.push({ type: 'ai', color: '#EC4899', label: 'AI-utkast', icon: '✦' });
    }

    // 6) Tags från data-runtime-tags (high-risk, etc)
    const tags = (card.dataset.runtimeTags || '').toLowerCase();
    if (tags.includes('high-risk') && !signals.find((s) => s.type === 'risk')) {
      signals.push({ type: 'risk', color: '#EF4444', label: 'Hög risk', icon: '⚠' });
    }

    return signals;
  }

  function buildBarHtml(signals) {
    return signals
      .map(
        (s) => `
        <span class="signal-pill signal-pill-${s.type}" style="--signal-color:${s.color}">
          <span class="signal-pill-icon" aria-hidden="true">${s.icon}</span>
          <span class="signal-pill-label">${escapeHtml(s.label)}</span>
        </span>`
      )
      .join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applyToCard(card) {
    if (!card) return;
    const signals = buildSignals(card);
    if (!signals.length) return;
    card.classList.add('has-signal-bar');
    let bar = card.querySelector(':scope > .thread-card-signal-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'thread-card-signal-bar';
      card.appendChild(bar);
    }
    const newHtml = buildBarHtml(signals);
    if (bar.innerHTML !== newHtml) bar.innerHTML = newHtml;
  }

  function pickTestCard() {
    return document.querySelector(
      '.queue-history-list .thread-card[data-runtime-thread]'
    );
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyToCard(pickTestCard());
    });
  }

  function bindObserver() {
    const list = document.querySelector('.queue-history-list');
    if (!list) {
      setTimeout(bindObserver, 500);
      return;
    }
    const obs = new MutationObserver(schedule);
    obs.observe(list, { childList: true, subtree: true });
    schedule();
  }

  function init() {
    bindObserver();
    setInterval(schedule, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Debug-API
  window.__SignalBar = Object.freeze({
    apply: () => applyToCard(pickTestCard()),
    rebuild: schedule,
    rollOutAll: () => {
      document
        .querySelectorAll('.queue-history-list .thread-card[data-runtime-thread]')
        .forEach((c) => applyToCard(c));
    },
  });
})();
