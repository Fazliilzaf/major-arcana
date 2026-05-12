/**
 * app/signal-bar.js — konsoliderad signal-rad längst ner på thread-card.
 *
 * Användarens önskan: alla "smarta" signaler (lane, status, risk, intent,
 * mailbox, AI-utkast) ska samlas på EN horisontell scroll-rad längst ner
 * på kortet med SVG-symbol + kort text, varje pill med egen färg matchande
 * dess betydelse — istället för att vara utspridda överallt på kortet.
 *
 * Stilreferens: ↺ Svar krävs nu (rgb(79,70,229) indigo) från .warm-why
 * — samma symbol+text+färg-pattern återanvänds för alla signal-typer.
 *
 * Testläge: endast FÖRSTA thread-card. När OK: __SignalBar.rollOutAll().
 */
(() => {
  'use strict';

  // Inline SVG paths (16x16 viewBox) — render via currentColor så pill-färg styr.
  const ICONS = {
    bolt:     'M9.5 1 3 9.5h4l-1 5.5L13 6.5H9l.5-5.5z',
    calendar: 'M3 4h10v9H3V4zm0-2h10v2H3V2zm2-1v2m6-2v2M3 7h10',
    eye:      'M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5zm7 2.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
    question: 'M8 14a6 6 0 100-12 6 6 0 000 12zm0-3v.01M8 9c0-.5.3-.9.7-1.2.7-.5 1.3-1 1.3-1.8 0-1.1-.9-2-2-2s-2 .9-2 2',
    clock:    'M8 14a6 6 0 100-12 6 6 0 000 12zM8 4.5v3.5l2 1.5',
    gear:     'M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm5-2.5l1.5-.7-1-2.6L12 5l-1.2-1.2.6-1.5-2.6-1L8 2.7 6.2 2 5.5 3.5 4 3l-1.2 1.2L3.5 5.5 2 6.2l1 2.6 1.5-.7 1.2 1.2-.7 1.5 2.6 1 1.5-1.5 1.5 1.5 2.6-1L13 9.7l1.5-.7',
    plus:     'M8 3v10M3 8h10',
    refresh:  'M3 8a5 5 0 018.5-3.5L13 6m0-3v3h-3M13 8a5 5 0 01-8.5 3.5L3 10m0 3v-3h3',
    warning:  'M8 2L1 14h14L8 2zm0 4v4m0 1.5v.5',
    check:    'M3 8.5L6.5 12l7-8',
    sparkle:  'M8 1l1.5 4 4 1.5-4 1.5L8 12l-1.5-4-4-1.5 4-1.5L8 1z',
    inbox:    'M2 9l2-6h8l2 6v4H2V9zm0 0h4l1 2h2l1-2h4',
    alert:    'M8 1L1 13h14L8 1zm0 4v4m0 2.5h0',
    user:     'M8 8a3 3 0 100-6 3 3 0 000 6zm0 1c-2.8 0-5 1.5-5 4v1h10v-1c0-2.5-2.2-4-5-4z',
  };

  // Lane-mappning: lane-id → { label, color, icon }
  // Inkluderar både engelska (act-now) och svenska (agera-nu) keys
  // eftersom data-lane kan vara på endera språk.
  const LANES = {
    // Engelska
    'act-now':   { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'act_now':   { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'sprint':    { label: 'Sprint',    color: '#4F46E5', icon: 'bolt' },
    'bookable':  { label: 'Bokning',   color: '#16A34A', icon: 'calendar' },
    'booking':   { label: 'Bokning',   color: '#16A34A', icon: 'calendar' },
    'review':    { label: 'Granska',   color: '#4F46E5', icon: 'eye' },
    'unclear':   { label: 'Oklart',    color: '#7C3AED', icon: 'question' },
    'later':     { label: 'Senare',    color: '#F59E0B', icon: 'clock' },
    'admin':     { label: 'Admin',     color: '#64748B', icon: 'gear' },
    'medical':   { label: 'Medicinsk', color: '#0EA5E9', icon: 'plus' },
    // Svenska (matchar app.js fixture-data)
    'agera-nu':  { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'agera_nu':  { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'oklart':    { label: 'Oklart',    color: '#7C3AED', icon: 'question' },
    'granska':   { label: 'Granska',   color: '#4F46E5', icon: 'eye' },
    'bokning':   { label: 'Bokning',   color: '#16A34A', icon: 'calendar' },
    'senare':    { label: 'Senare',    color: '#F59E0B', icon: 'clock' },
    'medicinsk': { label: 'Medicinsk', color: '#0EA5E9', icon: 'plus' },
    'medicinskt':{ label: 'Medicinsk', color: '#0EA5E9', icon: 'plus' },
  };

  function makeSvg(iconKey, color) {
    const d = ICONS[iconKey] || ICONS.check;
    return `<svg class="signal-pill-icon" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function buildSignals(card) {
    const signals = [];

    // 1) Lane (data-lane)
    const laneId = (card.dataset.lane || '').toLowerCase().replace(/_/g, '-');
    const lane = LANES[laneId] || LANES[laneId.replace(/-/g, '_')];
    if (lane) {
      signals.push({ ...lane, type: 'lane' });
    } else {
      const badge = card.querySelector('.lane-badge')?.textContent?.trim();
      if (badge) signals.push({ label: badge, color: '#64748B', icon: 'gear', type: 'lane' });
    }

    // 2) Behöver svar — från warm-why
    const why = card.querySelector('.warm-why .why-reason, .warm-why')?.textContent?.trim();
    if (why) {
      const txt = why.toLowerCase();
      if (/svar krävs|behöver svar|needs.reply/i.test(txt)) {
        signals.push({ label: 'Svar krävs', color: '#4F46E5', icon: 'refresh', type: 'reply' });
      } else if (/miss.risk|hög risk/i.test(txt)) {
        signals.push({ label: 'Miss-risk', color: '#F59E0B', icon: 'warning', type: 'risk' });
      } else if (/otillgänglig/i.test(txt)) {
        signals.push({ label: 'Otillgänglig', color: '#94A3B8', icon: 'warning', type: 'unavailable' });
      } else if (why.length < 30) {
        signals.push({ label: why, color: '#64748B', icon: 'alert', type: 'info' });
      }
    }

    // 3) Risk-tags från data-runtime-tags
    const tags = (card.dataset.runtimeTags || '').toLowerCase();
    if (/high-risk|hög.risk/.test(tags) && !signals.find((s) => s.type === 'risk')) {
      signals.push({ label: 'Hög risk', color: '#EF4444', icon: 'warning', type: 'risk' });
    }

    // 4) Mailbox-info
    const mailbox =
      card.querySelector('[data-mailbox-label]')?.textContent?.trim() ||
      card.querySelector('.warm-mailbox')?.textContent?.trim() ||
      card.querySelector('.thread-mailbox')?.textContent?.trim();
    if (mailbox && mailbox.length < 24) {
      signals.push({ label: mailbox, color: '#0891B2', icon: 'inbox', type: 'mailbox' });
    }

    // 5) AI-utkast
    const draft = card.querySelector(
      '.draft-pill, [class*="ai-draft"], [class*="draft-status"]'
    );
    if (draft) {
      signals.push({ label: 'AI-utkast', color: '#EC4899', icon: 'sparkle', type: 'ai' });
    }

    // 6) Owner (om relevant)
    const owner = card.querySelector('[class*="owner"]')?.textContent?.trim();
    if (owner && owner !== 'Ej tilldelad' && owner.length < 20) {
      signals.push({ label: owner, color: '#64748B', icon: 'user', type: 'owner' });
    }

    return signals;
  }

  function buildBarHtml(signals) {
    return signals
      .map(
        (s) => `<span class="signal-pill" style="--signal-color:${s.color}">${makeSvg(
          s.icon,
          s.color
        )}<span class="signal-pill-label">${escapeHtml(s.label)}</span></span>`
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
