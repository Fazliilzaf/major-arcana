/**
 * app/signal-bar.js — INLINE signal-pills bredvid "Behöver svar"-pillen.
 *
 * Användarens önskan v2 (efter feedback): istället för en NY rad längst
 * ner som ökar kort-höjden, lägg alla "smarta" signaler (lane, risk,
 * mailbox, AI) som extra pills BREDVID den befintliga "Behöver svar"-
 * pillen i samma rad — så vi behåller 96px korthöjd och får all triage-
 * info samlad där.
 *
 * Strategi:
 *   - Hitta .warm-why-elementet (där "Behöver svar"-pillen redan är)
 *   - Insertera en .warm-why-extras-container som syskon FÖRE den
 *   - Bygg signal-pills i samma stil (ikon + text, färgad efter typ)
 *   - Göm originalen (.lane-badge) som hade duplicate info
 *
 * Testläge: appliceras på ALLA thread-cards i listan.
 */
(() => {
  'use strict';

  const ICONS = {
    bolt:     'M9.5 1 3 9.5h4l-1 5.5L13 6.5H9l.5-5.5z',
    calendar: 'M3 4h10v9H3V4zm0-2h10v2H3V2zm2-1v2m6-2v2M3 7h10',
    eye:      'M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5zm7 2.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
    question: 'M8 14a6 6 0 100-12 6 6 0 000 12zm0-3v.01M8 9c0-.5.3-.9.7-1.2.7-.5 1.3-1 1.3-1.8 0-1.1-.9-2-2-2s-2 .9-2 2',
    clock:    'M8 14a6 6 0 100-12 6 6 0 000 12zM8 4.5v3.5l2 1.5',
    gear:     'M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm5-2.5l1.5-.7-1-2.6L12 5l-1.2-1.2.6-1.5-2.6-1L8 2.7 6.2 2 5.5 3.5 4 3l-1.2 1.2L3.5 5.5 2 6.2l1 2.6 1.5-.7 1.2 1.2-.7 1.5 2.6 1 1.5-1.5 1.5 1.5 2.6-1L13 9.7l1.5-.7',
    plus:     'M8 3v10M3 8h10',
    warning:  'M8 2L1 14h14L8 2zm0 4v4m0 1.5v.5',
    sparkle:  'M8 1l1.5 4 4 1.5-4 1.5L8 12l-1.5-4-4-1.5 4-1.5L8 1z',
    inbox:    'M2 9l2-6h8l2 6v4H2V9zm0 0h4l1 2h2l1-2h4',
    alert:    'M8 1L1 13h14L8 1zm0 4v4m0 2.5h0',
    user:     'M8 8a3 3 0 100-6 3 3 0 000 6zm0 1c-2.8 0-5 1.5-5 4v1h10v-1c0-2.5-2.2-4-5-4z',
  };

  // Lane → svenska+engelska keys → label + färg + ikon
  const LANES = {
    'act-now':   { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'act_now':   { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'agera-nu':  { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'agera_nu':  { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'sprint':    { label: 'Sprint',    color: '#4F46E5', icon: 'bolt' },
    'bookable':  { label: 'Bokning',   color: '#16A34A', icon: 'calendar' },
    'booking':   { label: 'Bokning',   color: '#16A34A', icon: 'calendar' },
    'bokning':   { label: 'Bokning',   color: '#16A34A', icon: 'calendar' },
    'review':    { label: 'Granska',   color: '#4F46E5', icon: 'eye' },
    'granska':   { label: 'Granska',   color: '#4F46E5', icon: 'eye' },
    'unclear':   { label: 'Oklart',    color: '#7C3AED', icon: 'question' },
    'oklart':    { label: 'Oklart',    color: '#7C3AED', icon: 'question' },
    'later':     { label: 'Senare',    color: '#F59E0B', icon: 'clock' },
    'senare':    { label: 'Senare',    color: '#F59E0B', icon: 'clock' },
    'admin':     { label: 'Admin',     color: '#64748B', icon: 'gear' },
    'medical':   { label: 'Medicinsk', color: '#0EA5E9', icon: 'plus' },
    'medicinsk': { label: 'Medicinsk', color: '#0EA5E9', icon: 'plus' },
    'medicinskt':{ label: 'Medicinsk', color: '#0EA5E9', icon: 'plus' },
  };

  function makeSvg(iconKey, color) {
    const d = ICONS[iconKey] || ICONS.alert;
    return `<svg viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function makePill(s) {
    return `<span class="warm-why-extra" data-signal-type="${s.type}" style="--signal-color:${s.color}"><span class="warm-why-extra-icon" aria-hidden="true">${makeSvg(s.icon, s.color)}</span><span class="warm-why-extra-label">${escapeHtml(s.label)}</span></span>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Bygg EXTRA signals (skip Behöver svar eftersom det redan finns som .warm-why)
  function buildExtraSignals(card) {
    const out = [];
    const seen = new Set();

    // 1) Lane — alltid första pill
    const laneId = (card.dataset.lane || '').toLowerCase().replace(/_/g, '-');
    const lane = LANES[laneId];
    if (lane) {
      out.push({ ...lane, type: 'lane' });
      seen.add(lane.label.toLowerCase());
    }

    // 2) Risk-tags
    const tags = (card.dataset.runtimeTags || '').toLowerCase();
    if (/high-risk|hög.risk/.test(tags)) {
      out.push({ label: 'Hög risk', color: '#EF4444', icon: 'warning', type: 'risk' });
      seen.add('hög risk');
    }

    // 3) Mailbox (om relevant och kort)
    const mailbox = card.querySelector('[data-mailbox-label]')?.textContent?.trim() ||
                    card.querySelector('.warm-mailbox')?.textContent?.trim();
    if (mailbox && mailbox.length < 24 && !seen.has(mailbox.toLowerCase())) {
      out.push({ label: mailbox, color: '#0891B2', icon: 'inbox', type: 'mailbox' });
    }

    // 4) AI-utkast
    if (card.querySelector('.draft-pill, [class*="ai-draft"], [class*="draft-status"]')) {
      out.push({ label: 'AI-utkast', color: '#EC4899', icon: 'sparkle', type: 'ai' });
    }

    return out;
  }

  function applyToCard(card) {
    if (!card) return;
    const why = card.querySelector('.warm-why');
    if (!why) return;
    const content = why.parentElement;
    if (!content) return;

    const signals = buildExtraSignals(card);
    if (!signals.length) return;

    card.classList.add('has-inline-signals');

    let wrapper = content.querySelector(':scope > .warm-why-extras');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'warm-why-extras';
      // Insert FÖRE .warm-why så pillarna ligger till vänster om "Behöver svar"
      content.insertBefore(wrapper, why);
    }
    const newHtml = signals.map(makePill).join('');
    if (wrapper.innerHTML !== newHtml) wrapper.innerHTML = newHtml;
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

  function bindObserver() {
    const list = document.querySelector('.queue-history-list');
    if (!list) { setTimeout(bindObserver, 500); return; }
    const obs = new MutationObserver(schedule);
    obs.observe(list, { childList: true, subtree: true });
    schedule();
  }

  function init() {
    bindObserver();
    setInterval(schedule, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.__SignalBar = Object.freeze({
    apply: () => applyAll(),
    rebuild: schedule,
  });
})();
