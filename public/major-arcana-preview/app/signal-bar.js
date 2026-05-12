/**
 * app/signal-bar.js — INLINE signal-pills bredvid "Behöver svar"-pillen.
 *
 * MEDIUM-läge (7-8 pills) hybrid: card-DOM + Kundintelligens.
 * Pillar visas som syskon till .warm-why i .warm-content-raden.
 * Inga grid-/höjd-ändringar på kortet.
 *
 * Pills (i visningsordning):
 *   1. Lane           — data-lane (Oklart, Agera nu, etc.)
 *   2. Hög risk       — data-runtime-tags innehåller "high-risk"
 *   3. Mailbox        — från mailbox-tone-class
 *   4. Ägare          — .meta-status (Ej tilldelad / namn)
 *   5. AI-utkast      — om .draft-pill finns
 *   6. (Behöver svar — befintlig .warm-why behålls oförändrad)
 *
 * Färgsystem matchar queue-filter-chip-modifiers + smart-filter-bar.
 */
(() => {
  'use strict';

  const ICONS = {
    bolt:        'M9.5 1 3 9.5h4l-1 5.5L13 6.5H9l.5-5.5z',
    calendar:    'M3 4h10v9H3V4zm0-2h10v2H3V2zm2-1v2m6-2v2M3 7h10',
    eye:         'M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5zm7 2.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
    question:    'M8 14a6 6 0 100-12 6 6 0 000 12zm0-3v.01M8 9c0-.5.3-.9.7-1.2.7-.5 1.3-1 1.3-1.8 0-1.1-.9-2-2-2s-2 .9-2 2',
    clock:       'M8 14a6 6 0 100-12 6 6 0 000 12zM8 4.5v3.5l2 1.5',
    gear:        'M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm5-2.5l1.5-.7-1-2.6L12 5l-1.2-1.2.6-1.5-2.6-1L8 2.7 6.2 2 5.5 3.5 4 3l-1.2 1.2L3.5 5.5 2 6.2l1 2.6 1.5-.7 1.2 1.2-.7 1.5 2.6 1 1.5-1.5 1.5 1.5 2.6-1L13 9.7l1.5-.7',
    plus:        'M8 3v10M3 8h10',
    warning:     'M8 2L1 14h14L8 2zm0 4v4m0 1.5v.5',
    sparkle:     'M8 1l1.5 4 4 1.5-4 1.5L8 12l-1.5-4-4-1.5 4-1.5L8 1z',
    inbox:       'M2 9l2-6h8l2 6v4H2V9zm0 0h4l1 2h2l1-2h4',
    alert:       'M8 1L1 13h14L8 1zm0 4v4m0 2.5h0',
    user:        'M8 8a3 3 0 100-6 3 3 0 000 6zm0 1c-2.8 0-5 1.5-5 4v1h10v-1c0-2.5-2.2-4-5-4z',
    userQuestion:'M6 8a3 3 0 100-6 3 3 0 000 6zm0 1c-2.5 0-4.5 1.5-4.5 4v1h6m4-1v.01m0-2c0-.4.3-.7.6-1 .4-.3.9-.6.9-1.3 0-1-.7-1.7-1.5-1.7s-1.5.7-1.5 1.7',
    envelope:    'M2 4h12v8H2V4zm0 0l6 5 6-5',
    stack:       'M3 4h10M3 7h10M3 10h10M3 13h10',
    trash:       'M3 4h10M5 4V2.5h6V4m-1 0v9M6 4v9M4 4l.5 10h7L12 4',
    bell:        'M8 1.5a4 4 0 014 4v2.5l1.5 2.5h-11L4 8V5.5a4 4 0 014-4zM6.5 13a1.5 1.5 0 003 0',
    undo:        'M3 8a5 5 0 018.5-3.5L13 6M3 3v3h3',
    check:       'M3 8.5L6.5 12l7-8',
    refresh:     'M3 8a5 5 0 018.5-3.5L13 6m0-3v3h-3M13 8a5 5 0 01-8.5 3.5L3 10m0 3v-3h3',
  };

  // Lane → svenska+engelska keys → label + färg + ikon (matchar
  // queue-filter-chip-modifiers från cco-polish.css)
  const LANES = {
    'act-now':   { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'act_now':   { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'agera-nu':  { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'agera_nu':  { label: 'Agera nu',  color: '#EF4444', icon: 'alert' },
    'sprint':    { label: 'Sprint',    color: '#16A34A', icon: 'bolt' },
    'bookable':  { label: 'Bokning',   color: '#0891B2', icon: 'calendar' },
    'booking':   { label: 'Bokning',   color: '#0891B2', icon: 'calendar' },
    'bokning':   { label: 'Bokning',   color: '#0891B2', icon: 'calendar' },
    'review':    { label: 'Granska',   color: '#F59E0B', icon: 'eye' },
    'granska':   { label: 'Granska',   color: '#F59E0B', icon: 'eye' },
    'unclear':   { label: 'Oklart',    color: '#7C3AED', icon: 'question' },
    'oklart':    { label: 'Oklart',    color: '#7C3AED', icon: 'question' },
    'later':     { label: 'Senare',    color: '#6366F1', icon: 'clock' },
    'senare':    { label: 'Senare',    color: '#6366F1', icon: 'clock' },
    'admin':     { label: 'Admin',     color: '#64748B', icon: 'gear' },
    'medical':   { label: 'Medicinsk', color: '#EC4899', icon: 'plus' },
    'medicinsk': { label: 'Medicinsk', color: '#EC4899', icon: 'plus' },
    'medicinskt':{ label: 'Medicinsk', color: '#EC4899', icon: 'plus' },
  };

  // Mailbox-tone → färg (matchar mailbox-option-egzona/contact/etc.)
  const MAILBOX_COLORS = {
    egzona:  { label: 'Egzona',  color: '#BE2166' },  // magenta
    contact: { label: 'Kontakt', color: '#4F46E5' },  // indigo
    kontakt: { label: 'Kontakt', color: '#4F46E5' },
    fazli:   { label: 'Fazli',   color: '#5F2CFF' },  // violet
    receipt: { label: 'Kvitto',  color: '#0891B2' },  // cyan
    kvitto:  { label: 'Kvitto',  color: '#0891B2' },
    info:    { label: 'Info',    color: '#0EA5E9' },  // sky
    consult: { label: 'Kons',    color: '#16A34A' },  // green
    kons:    { label: 'Kons',    color: '#16A34A' },
    market:  { label: 'Marknad', color: '#F59E0B' },  // amber
    marknad: { label: 'Marknad', color: '#F59E0B' },
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

  function buildExtraSignals(card) {
    const out = [];

    // 1) Lane
    const laneId = (card.dataset.lane || '').toLowerCase().replace(/_/g, '-');
    const lane = LANES[laneId];
    if (lane) {
      out.push({ ...lane, type: 'lane' });
    }

    // 2) Hög risk / Miss-risk — från data-runtime-tags
    const tags = (card.dataset.runtimeTags || '').toLowerCase();
    if (/high-risk|hög.risk/.test(tags)) {
      out.push({ label: 'Hög risk', color: '#EF4444', icon: 'warning', type: 'risk' });
    } else if (/miss.risk/.test(tags)) {
      out.push({ label: 'Miss-risk', color: '#F59E0B', icon: 'warning', type: 'risk' });
    }

    // 3) Mailbox — från mailbox-tone-class på avatar eller kort
    const toneClass = card.className.match(/mailbox-(?:tone-)?([a-z]+)/);
    let mailboxKey = toneClass?.[1];
    if (!mailboxKey) {
      // Försök hitta från avatar
      const avatar = card.querySelector('.warm-avatar');
      if (avatar) {
        const m = avatar.className.match(/mailbox-(?:tone-)?([a-z]+)/);
        if (m) mailboxKey = m[1];
      }
    }
    if (mailboxKey && MAILBOX_COLORS[mailboxKey]) {
      out.push({ ...MAILBOX_COLORS[mailboxKey], icon: 'inbox', type: 'mailbox' });
    }

    // 4) Ägare — .meta-status
    const owner = card.querySelector('.meta-status')?.textContent?.trim();
    if (owner) {
      if (/ej.tilldelad|oägd|unassigned/i.test(owner)) {
        out.push({ label: 'Ej tilldelad', color: '#F59E0B', icon: 'userQuestion', type: 'owner' });
      } else if (owner.length < 18) {
        out.push({ label: owner, color: '#64748B', icon: 'user', type: 'owner' });
      }
    }

    // 5) AI-utkast — om kortet har draft-pill
    if (card.querySelector('.draft-pill, [class*="ai-draft"], [class*="draft-status"]')) {
      out.push({ label: 'AI-utkast', color: '#EC4899', icon: 'sparkle', type: 'ai' });
    }

    // 6) Snooze — om kortet är snoozad
    if (card.classList.contains('is-snoozed') || card.querySelector('.snooze-pill')) {
      out.push({ label: 'Snooze', color: '#EAB308', icon: 'bell', type: 'snooze' });
    }

    // 7) Återkommer — om kortet just återkommit från snooze
    if (card.classList.contains('is-just-returned') || card.querySelector('.snooze-pill-returned')) {
      out.push({ label: 'Återkommer', color: '#3B82F6', icon: 'undo', type: 'returned' });
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
