/**
 * app/customer-cluster.js — grupperar thread-cards per kund.
 *
 * Steg 3 av thread-merge-feature: om samma kund (customerName/email) har
 * flera trådar i listan, behåll FÖRSTA kortet och göm resten. Lägg en
 * badge på första kortet med "N trådar" så användaren ser att det finns
 * sub-trådar.
 *
 * Klick på badge expanderar/kollapsar sub-trådarna inom samma kund-grupp.
 *
 * Strategi: pure client-side shim — rör inte app.js eller dess filter-
 * logik. MutationObserver på .queue-history-list scannar efter ny
 * thread-cards.
 */
(() => {
  'use strict';

  // localStorage-nyckel för expanderade kund-grupper
  const LS_KEY = 'cco.customerCluster.expanded.v1';

  function readExpanded() {
    try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); }
    catch (_e) { return new Set(); }
  }

  function writeExpanded(set) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(set))); }
    catch (_e) {}
  }

  function customerKeyFromCard(card) {
    // Extrahera kund-identifierare från kortets data eller DOM.
    // Prioritetsordning: data-customer-key > .warm-sender text > .warm-avatar text
    const explicit = card.dataset.customerKey;
    if (explicit) return explicit.toLowerCase().trim();

    const senderText = card.querySelector('.warm-sender')?.textContent?.trim()?.toLowerCase();
    if (senderText && senderText.length > 1 && senderText.length < 60) {
      // Skip mailbox-namn (samma-kund-mail där sender är mailbox)
      const mailboxLabels = ['egzona','kontakt','contact','fazli','kvitto','receipt','info','kons','consult','marknad','market'];
      // Skip generisk fallback-text — flera olika kunder kan ha samma fallback
      // ("Okänd avsändare" är inte EN kund, det är N okända kunder. Att klustra
      // dem ger felaktig kollaps till ett enda kort.)
      const fallbackLabels = ['okänd avsändare','okand avsandare','unknown sender','unknown','no sender','okänd','okand','utan avsändare','utan avsandare'];
      if (mailboxLabels.includes(senderText)) return null;
      if (fallbackLabels.includes(senderText)) return null;
      return `sender:${senderText}`;
    }

    // Fallback: använd hela thread-id-prefix (email före kolon)
    const id = card.dataset.runtimeThread || '';
    const prefix = id.split(':')[0].toLowerCase();
    if (prefix && prefix.length > 3 && prefix !== 'runtime-unified-empty') {
      return `email:${prefix}`;
    }
    return null;
  }

  function scanAndCluster() {
    const list = document.querySelector('.queue-history-list');
    if (!list) return;

    const cards = Array.from(
      list.querySelectorAll('.thread-card[data-runtime-thread]:not([data-runtime-thread="runtime-unified-empty"])')
    );

    // Gruppera kort per customer-key
    const groups = new Map(); // key → array<card>
    cards.forEach((card) => {
      const key = customerKeyFromCard(card);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    });

    const expanded = readExpanded();

    // Idempotent reset: rör bara kort vars NUVARANDE cluster-state INTE
    // matchar den vi skall applicera. Att rensa allt + bygga om vid varje
    // scan skapade en synlig "hoppning" där badgen försvann under en
    // animation-frame innan den återskapades. Genom att bara röra det som
    // ska ändras får vi stabil rendering.
    //
    // Beräkna vad varje kort SKA ha först (key + role: primary/sub/none):
    const desired = new Map(); // card -> { key, role: 'primary'|'sub'|null, count, isExpanded }
    cards.forEach((c) => { desired.set(c, { key: null, role: null, count: 0, isExpanded: false }); });
    groups.forEach((groupCards, key) => {
      if (groupCards.length < 2) return;
      const isExpanded = expanded.has(key);
      desired.set(groupCards[0], { key, role: 'primary', count: groupCards.length, isExpanded });
      groupCards.slice(1).forEach((sub) => {
        desired.set(sub, { key, role: 'sub', count: 0, isExpanded });
      });
    });

    // Rensa BARA kort som inte längre ska vara primary/sub
    cards.forEach((c) => {
      const d = desired.get(c);
      const wasInCluster = c.classList.contains('customer-cluster-primary') || c.classList.contains('customer-cluster-sub');
      const willBeInCluster = d.role !== null;
      const keyChanged = c.dataset.customerClusterKey && c.dataset.customerClusterKey !== d.key;
      if (wasInCluster && (!willBeInCluster || keyChanged)) {
        c.classList.remove('customer-cluster-primary', 'customer-cluster-sub', 'customer-cluster-expanded', 'customer-cluster-hidden');
        delete c.dataset.customerClusterCount;
        delete c.dataset.customerClusterKey;
        const oldBadge = c.querySelector(':scope > .customer-cluster-badge');
        if (oldBadge) oldBadge.remove();
        c.querySelectorAll('.warm-top-meta .customer-cluster-badge-inline').forEach((b) => b.remove());
        c.querySelectorAll('.warm-top-meta .customer-cluster-sep').forEach((s) => s.remove());
      }
    });

    // Applicera nya cluster
    groups.forEach((groupCards, key) => {
      if (groupCards.length < 2) return; // bara ett kort = ingen cluster

      const primary = groupCards[0];
      const subs = groupCards.slice(1);
      const isExpanded = expanded.has(key);

      primary.classList.add('customer-cluster-primary');
      if (isExpanded) primary.classList.add('customer-cluster-expanded');
      primary.dataset.customerClusterCount = String(groupCards.length);
      primary.dataset.customerClusterKey = key;

      // Lägg en INLINE-badge i .warm-top-meta efter "Ej tilldelad" så att
      // den blir suffix på tids/status-raden istället för en egen rad som
      // pushar resten nedåt (tidigare bug: 36 px extra höjd förstörde 96 px-
      // grid). Klick på badgen expandar/kollapsar sub-trådar.
      // Rensa ev. legacy-badge i kort-roten (om gammal version körts först).
      const legacy = primary.querySelector(':scope > .customer-cluster-badge');
      if (legacy) legacy.remove();

      const metaRow = primary.querySelector('.warm-top-meta');
      let badge = metaRow?.querySelector('.customer-cluster-badge-inline');
      if (metaRow && !badge) {
        // Skapa separator + button i samma stil som befintlig meta-sep
        const sep = document.createElement('span');
        sep.className = 'meta-sep customer-cluster-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '·';
        metaRow.appendChild(sep);

        badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'customer-cluster-badge-inline';
        badge.setAttribute('aria-label', `Visa ${subs.length} fler trådar från samma kund`);
        metaRow.appendChild(badge);
        badge.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const k = primary.dataset.customerClusterKey;
          const next = readExpanded();
          if (next.has(k)) next.delete(k);
          else next.add(k);
          writeExpanded(next);
          scanAndCluster();
        });
      }
      // Diff-check: bara skriv om innerHTML om count faktiskt ändrats
      // (annars triggar varje scan en visuell flash på badgen).
      if (badge) {
        const newCountText = `${groupCards.length} trådar`;
        const currentText = badge.textContent.trim();
        if (!currentText.startsWith(newCountText)) {
          badge.innerHTML = `${newCountText} <svg class="customer-cluster-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6l3 3 3-3"/></svg>`;
        }
      }

      // Sub-cards: göm om inte expanderat
      subs.forEach((sub) => {
        sub.classList.add('customer-cluster-sub');
        sub.dataset.customerClusterKey = key;
        if (isExpanded) {
          sub.classList.remove('customer-cluster-hidden');
        } else {
          sub.classList.add('customer-cluster-hidden');
        }
      });
    });
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanAndCluster();
    });
  }

  function bindObserver() {
    const list = document.querySelector('.queue-history-list');
    if (!list) { setTimeout(bindObserver, 500); return; }
    const obs = new MutationObserver(schedule);
    obs.observe(list, { childList: true, subtree: false });
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

  window.__CustomerCluster = Object.freeze({
    apply: scanAndCluster,
    expandAll: () => {
      const keys = new Set();
      document.querySelectorAll('.customer-cluster-primary').forEach((c) => {
        if (c.dataset.customerClusterKey) keys.add(c.dataset.customerClusterKey);
      });
      writeExpanded(keys);
      scanAndCluster();
    },
    collapseAll: () => {
      writeExpanded(new Set());
      scanAndCluster();
    },
  });
})();
