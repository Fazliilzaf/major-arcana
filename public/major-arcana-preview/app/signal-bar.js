/**
 * app/signal-bar.js — INLINE signal-pills bredvid "Behöver svar"-pillen.
 *
 * MEDIUM-läge (7-8 pills) hybrid: card-DOM + Kundintelligens.
 * Pillar visas i EN rad. Befintliga .warm-why-text migreras till första
 * pill (samma design). Originalet .warm-why göms (.has-inline-signals).
 *
 * Pills i ordning (alla på samma rad):
 *   1. Status (från .warm-why) — Behöver svar / Miss-risk / etc.
 *   2. Lane                    — Oklart, Agera nu, etc.
 *   3. Risk-tags               — Hög risk / Miss-risk (om inte i 1)
 *   4. Mailbox                 — Egzona, Kontakt, etc.
 *   5. Ägare                   — Ej tilldelad / namn
 *   6. AI-utkast               — om finns
 *   7. Snooze / Återkommer
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
    bell:        'M8 1.5a4 4 0 014 4v2.5l1.5 2.5h-11L4 8V5.5a4 4 0 014-4zM6.5 13a1.5 1.5 0 003 0',
    undo:        'M3 8a5 5 0 018.5-3.5L13 6M3 3v3h3',
    check:       'M3 8.5L6.5 12l7-8',
    refresh:     'M3 8a5 5 0 018.5-3.5L13 6m0-3v3h-3M13 8a5 5 0 01-8.5 3.5L3 10m0 3v-3h3',
  };

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

  const MAILBOX_COLORS = {
    egzona:  { label: 'Egzona',  color: '#BE2166', initial: 'E' },
    contact: { label: 'Kontakt', color: '#4F46E5', initial: 'K' },
    kontakt: { label: 'Kontakt', color: '#4F46E5', initial: 'K' },
    fazli:   { label: 'Fazli',   color: '#5F2CFF', initial: 'F' },
    receipt: { label: 'Kvitto',  color: '#0891B2', initial: 'Kv' },
    kvitto:  { label: 'Kvitto',  color: '#0891B2', initial: 'Kv' },
    info:    { label: 'Info',    color: '#0EA5E9', initial: 'I' },
    consult: { label: 'Kons',    color: '#16A34A', initial: 'Ko' },
    kons:    { label: 'Kons',    color: '#16A34A', initial: 'Ko' },
    market:  { label: 'Marknad', color: '#F59E0B', initial: 'M' },
    marknad: { label: 'Marknad', color: '#F59E0B', initial: 'M' },
  };

  // Sammansatt lookup för att avgöra om en .warm-sender text är ett
  // mailbox-namn (då döljer vi den eftersom mailbox-pillen visar samma info)
  const MAILBOX_LABELS = new Set([
    'egzona', 'kontakt', 'contact', 'fazli', 'kvitto', 'receipt',
    'info', 'kons', 'consult', 'marknad', 'market',
  ]);

  function makeSvg(iconKey, color) {
    const d = ICONS[iconKey] || ICONS.alert;
    return `<svg viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function makePill(s) {
    // För mailbox-pill: cirkel med initial istället för SVG-symbol
    const iconMarkup = (s.type === 'mailbox' && s.initial)
      ? `<span class="warm-why-extra-circle" style="background:${s.color};color:#fff" aria-hidden="true">${escapeHtml(s.initial)}</span>`
      : `<span class="warm-why-extra-icon" aria-hidden="true">${makeSvg(s.icon, s.color)}</span>`;
    return `<span class="warm-why-extra" data-signal-type="${s.type}" style="--signal-color:${s.color}">${iconMarkup}<span class="warm-why-extra-label">${escapeHtml(s.label)}</span></span>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Härled status-pill från .warm-why — primärt via data-why-kind
  // (strukturerat attribut), fallback till text-regex om kind saknas.
  // data-why-kind är stabilt mot copy-ändringar; regex är skör.
  const KIND_MAP = {
    refresh: { color: '#4F46E5', icon: 'refresh', type: 'status' },
    risk:    { color: '#F59E0B', icon: 'warning', type: 'risk' },
    check:   { color: '#16A34A', icon: 'check',   type: 'status' },
    snooze:  { color: '#EAB308', icon: 'bell',    type: 'snooze' },
    cta:     { color: '#4F46E5', icon: 'refresh', type: 'cta' },
  };

  function deriveStatusFromWhy(card) {
    const why = card.querySelector('.warm-why');
    if (!why) return null;
    const txt = (why.querySelector('.why-reason')?.textContent || why.textContent || '').trim();
    if (!txt) return null;
    const kind = (why.dataset.whyKind || '').toLowerCase();

    // PRIMÄR källa: data-why-kind. Stabilt mot copy-ändringar.
    if (kind && KIND_MAP[kind]) {
      // Behåll text som label (truncate vid 24) — texten kan vara svensk
      // ("Behöver svar"), engelsk eller varierad copy.
      return {
        label: txt.length > 24 ? txt.slice(0, 22) + '…' : txt,
        ...KIND_MAP[kind],
      };
    }

    // FALLBACK: regex-matchning för card-versioner utan data-why-kind.
    if (/svar krävs|behöver svar|^svara nu$/i.test(txt)) {
      return { label: 'Svara nu', color: '#4F46E5', icon: 'refresh', type: 'status' };
    }
    if (/^svara$/i.test(txt)) {
      return { label: 'Svara', color: '#4F46E5', icon: 'refresh', type: 'status' };
    }
    if (/granska/i.test(txt)) {
      return { label: 'Granska', color: '#F59E0B', icon: 'eye', type: 'status' };
    }
    if (/bekräfta/i.test(txt)) {
      return { label: 'Bekräfta', color: '#16A34A', icon: 'check', type: 'status' };
    }
    if (/pågår|in.progress/i.test(txt)) {
      return { label: 'Pågår', color: '#6366F1', icon: 'bolt', type: 'status' };
    }
    if (/miss.risk/i.test(txt)) {
      return { label: 'Miss-risk', color: '#F59E0B', icon: 'warning', type: 'risk' };
    }
    if (/hög risk/i.test(txt)) {
      return { label: 'Hög risk', color: '#EF4444', icon: 'warning', type: 'risk' };
    }
    if (/otillgänglig/i.test(txt)) {
      return { label: 'Otillgänglig', color: '#94A3B8', icon: 'warning', type: 'status' };
    }
    if (/tid kan erbjudas|redo att boka/i.test(txt)) {
      return { label: txt.slice(0, 24), color: '#16A34A', icon: 'check', type: 'status' };
    }

    // Sista fallback: använd default refresh-stil
    return { label: txt.slice(0, 24), color: '#4F46E5', icon: 'refresh', type: 'status' };
  }

  function buildSignals(card) {
    const out = [];
    const seenTypes = new Set();
    const seenLabels = new Set();

    // 1) Status från .warm-why (Behöver svar / Miss-risk / etc.)
    const statusPill = deriveStatusFromWhy(card);
    if (statusPill) {
      out.push(statusPill);
      seenTypes.add(statusPill.type);
      seenLabels.add(statusPill.label.toLowerCase());
    }

    // 2) Lane
    const laneId = (card.dataset.lane || '').toLowerCase().replace(/_/g, '-');
    const lane = LANES[laneId];
    if (lane) {
      out.push({ ...lane, type: 'lane' });
      seenLabels.add(lane.label.toLowerCase());
    }

    // 3) Risk-tags från data-runtime-tags (om inte redan i status)
    const tags = (card.dataset.runtimeTags || '').toLowerCase();
    if (/high-risk|hög.risk/.test(tags) && !seenLabels.has('hög risk')) {
      out.push({ label: 'Hög risk', color: '#EF4444', icon: 'warning', type: 'risk' });
      seenLabels.add('hög risk');
    } else if (/miss.risk/.test(tags) && !seenLabels.has('miss-risk')) {
      out.push({ label: 'Miss-risk', color: '#F59E0B', icon: 'warning', type: 'risk' });
      seenLabels.add('miss-risk');
    }

    // 4) Mailbox — multi om cross-mailbox-tråd, annars single
    //    Cross-mailbox: thread.mailboxAddresses (emails) ELLER mailboxTrail
    //    (svenska labels: Egzona/Kontakt/Fazli/etc.)
    let mailboxAddresses = (card.dataset.mailboxAddresses || '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    // Fallback: läs thread.mailboxTrail från window.__App?.state om finns
    if (mailboxAddresses.length < 2) {
      try {
        const state = window.__App?.state;
        const threads = state?.runtime?.threads || state?.data?.threads || [];
        const t = threads.find((x) => x && x.id === card.dataset.runtimeThread);
        if (t && Array.isArray(t.mailboxTrail) && t.mailboxTrail.length > 1) {
          // Konvertera svenska labels → keys för MAILBOX_COLORS-lookup
          const trail = t.mailboxTrail
            .map((label) => String(label).toLowerCase().trim())
            .filter(Boolean);
          if (trail.length > 1) {
            mailboxAddresses = trail; // använd keys direkt (matchar MAILBOX_COLORS)
          }
        }
      } catch (_e) {}
    }

    if (mailboxAddresses.length > 1) {
      // Cross-mailbox: rendera EN pill per unik mailbox.
      // Sortera så contact/kontakt kommer först (samlingspunkten).
      const sorted = mailboxAddresses.slice().sort((a, b) => {
        const ka = a.split('@')[0].toLowerCase();
        const kb = b.split('@')[0].toLowerCase();
        if (/^contact|kontakt/.test(ka)) return -1;
        if (/^contact|kontakt/.test(kb)) return 1;
        return 0;
      });
      const seenKeys = new Set();
      sorted.forEach((addr) => {
        const key = addr.split('@')[0].toLowerCase();
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        const m = MAILBOX_COLORS[key];
        if (m) {
          out.push({ ...m, icon: 'inbox', type: 'mailbox' });
        }
      });
    } else {
      // Single mailbox — fallback till mailbox-tone-class
      const toneClass = card.className.match(/mailbox-(?:tone-)?([a-z]+)/);
      let mailboxKey = toneClass?.[1];
      if (!mailboxKey) {
        const avatar = card.querySelector('.warm-avatar');
        if (avatar) {
          const m = avatar.className.match(/mailbox-(?:tone-)?([a-z]+)/);
          if (m) mailboxKey = m[1];
        }
      }
      if (mailboxKey && MAILBOX_COLORS[mailboxKey]) {
        out.push({ ...MAILBOX_COLORS[mailboxKey], icon: 'inbox', type: 'mailbox' });
      }
    }

    // 5) Ägare
    const owner = card.querySelector('.meta-status')?.textContent?.trim();
    if (owner) {
      if (/ej.tilldelad|oägd|unassigned/i.test(owner)) {
        out.push({ label: 'Ej tilldelad', color: '#F59E0B', icon: 'userQuestion', type: 'owner' });
      } else if (owner.length < 18) {
        out.push({ label: owner, color: '#64748B', icon: 'user', type: 'owner' });
      }
    }

    // 6) AI-utkast
    if (card.querySelector('.draft-pill, [class*="ai-draft"], [class*="draft-status"]')) {
      out.push({ label: 'AI-utkast', color: '#EC4899', icon: 'sparkle', type: 'ai' });
    }

    // 7) Snooze / Återkommer
    if (card.classList.contains('is-snoozed') || card.querySelector('.snooze-pill')) {
      if (!seenTypes.has('snooze')) {
        out.push({ label: 'Snooze', color: '#EAB308', icon: 'bell', type: 'snooze' });
      }
    }
    if (card.classList.contains('is-just-returned') || card.querySelector('.snooze-pill-returned')) {
      out.push({ label: 'Återkommer', color: '#3B82F6', icon: 'undo', type: 'returned' });
    }

    // Customer-cluster: om kortet är primary i en kund-grupp, visa "N trådar"
    // som en signal-pill i samma rad. Klick på pillen expandar/kollapsar
    // (delegerad handler i app/customer-cluster.js fångar [data-signal-type="cluster"]).
    const clusterCount = Number(card.dataset.customerClusterCount);
    if (card.classList.contains('customer-cluster-primary') && clusterCount > 1) {
      out.push({
        label: `${clusterCount} trådar`,
        color: '#7C3AED',
        icon: 'inbox',
        type: 'cluster',
      });
    }

    // 8) Next-action (Svara nu / Granska tråden / Bekräfta bokning) från
    //    eventuell .warm-cta / next-action-element (om de finns i DOM)
    const ctaText = (
      card.querySelector('.warm-cta, .warm-next-action, [data-next-action]')?.textContent || ''
    ).trim();
    if (ctaText && ctaText.length < 30 && !seenLabels.has(ctaText.toLowerCase())) {
      if (/svara nu|svar krävs/i.test(ctaText)) {
        out.push({ label: 'Svara nu', color: '#4F46E5', icon: 'refresh', type: 'cta' });
      } else if (/granska/i.test(ctaText)) {
        out.push({ label: ctaText, color: '#F59E0B', icon: 'eye', type: 'cta' });
      } else if (/bekräfta|boka/i.test(ctaText)) {
        out.push({ label: ctaText, color: '#16A34A', icon: 'check', type: 'cta' });
      }
    }

    return out;
  }

  function applyToCard(card) {
    if (!card) return;
    const why = card.querySelector('.warm-why');
    if (!why) return;
    const content = why.parentElement;
    if (!content) return;

    const signals = buildSignals(card);
    if (!signals.length) return;

    card.classList.add('has-inline-signals');

    // Om .warm-sender är ett mailbox-namn (Egzona/Kontakt/Fazli/...)
    // är den redundant — mailbox-pillen visar samma info. Markera kortet
    // så CSS kan dölja sender-texten.
    const sender = card.querySelector('.warm-sender');
    const senderText = (sender?.textContent || '').trim().toLowerCase();
    if (senderText && MAILBOX_LABELS.has(senderText)) {
      card.classList.add('has-mailbox-sender');
    } else {
      card.classList.remove('has-mailbox-sender');
    }

    let wrapper = content.querySelector(':scope > .warm-why-extras');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'warm-why-extras';
      // Insert FÖRE .warm-why så pillarna ligger där .warm-why annars skulle vara
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
