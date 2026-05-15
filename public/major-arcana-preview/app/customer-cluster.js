/**
 * app/customer-cluster.js — grupperar thread-cards per kund.
 *
 * Primär källa: serverns customerCluster (AnalyzeInbox) via data-cc-cluster-* på kort.
 * Fallback: ren klient-heuristik om API-attribut saknas (t.ex. äldre fixtures).
 *
 * Klick på badge expanderar/kollapsar sub-trådarna inom samma kund-grupp.
 */
(() => {
  'use strict';

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
    const explicit = card.dataset.customerKey;
    if (explicit) return explicit.toLowerCase().trim();

    const senderText = card.querySelector('.warm-sender')?.textContent?.trim()?.toLowerCase();
    if (senderText && senderText.length > 1 && senderText.length < 60) {
      const mailboxLabels = ['egzona','kontakt','contact','fazli','kvitto','receipt','info','kons','consult','marknad','market'];
      const fallbackLabels = ['okänd avsändare','okand avsandare','unknown sender','unknown','no sender','okänd','okand','utan avsändare','utan avsandare'];
      if (mailboxLabels.includes(senderText)) return null;
      if (fallbackLabels.includes(senderText)) return null;
      return `sender:${senderText}`;
    }

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

    const expanded = readExpanded();

    const desired = new Map();
    cards.forEach((c) => { desired.set(c, { key: null, role: null, count: 0, isExpanded: false }); });

    // --- 1) Server-styrd gruppering (data-cc-cluster-group från AnalyzeInbox)
    const serverGroups = new Map();
    cards.forEach((card) => {
      const gid = card.dataset.ccClusterGroup;
      if (!gid) return;
      if (!serverGroups.has(gid)) serverGroups.set(gid, []);
      serverGroups.get(gid).push(card);
    });
    serverGroups.forEach((groupCards, gid) => {
      if (groupCards.length < 2) return;
      const isExpanded = expanded.has(gid);
      const primary =
        groupCards.find((c) => c.dataset.ccClusterRole === 'primary') || groupCards[0];
      const subs = groupCards.filter((c) => c !== primary);
      const count = Number(primary.dataset.ccClusterSize) || groupCards.length;
      desired.set(primary, { key: gid, role: 'primary', count, isExpanded });
      subs.forEach((sub) => {
        desired.set(sub, { key: gid, role: 'sub', count: 0, isExpanded });
      });
    });

    // --- 2) Legacy: endast kort utan server-attribut
    const legacyCards = cards.filter((c) => !c.dataset.ccClusterGroup);
    const legacyGroups = new Map();
    legacyCards.forEach((card) => {
      const key = customerKeyFromCard(card);
      if (!key) return;
      if (!legacyGroups.has(key)) legacyGroups.set(key, []);
      legacyGroups.get(key).push(card);
    });
    legacyGroups.forEach((groupCards, key) => {
      if (groupCards.length < 2) return;
      const isExpanded = expanded.has(key);
      desired.set(groupCards[0], { key, role: 'primary', count: groupCards.length, isExpanded });
      groupCards.slice(1).forEach((sub) => {
        desired.set(sub, { key, role: 'sub', count: 0, isExpanded });
      });
    });

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

    const applyGroup = (groupCards, key, isExpanded, countOverride) => {
      if (groupCards.length < 2) return;
      const displayCount = countOverride || groupCards.length;
      const primary = groupCards[0];
      const subs = groupCards.slice(1);

      primary.classList.add('customer-cluster-primary');
      if (isExpanded) primary.classList.add('customer-cluster-expanded');
      primary.dataset.customerClusterCount = String(displayCount);
      primary.dataset.customerClusterKey = key;

      // Rensa LEGACY badge-injekten i .warm-top-meta — pillen renderas nu
      // av app/signal-bar.js som en signal-pill med data-signal-type="cluster"
      // i .warm-why-extras-raden (tillsammans med "Tid kan erbjudas",
      // "Bokning", "Ej tilldelad" osv).
      const legacy = primary.querySelector(':scope > .customer-cluster-badge');
      if (legacy) legacy.remove();
      primary.querySelectorAll('.warm-top-meta .customer-cluster-badge-inline').forEach((b) => b.remove());
      primary.querySelectorAll('.warm-top-meta .customer-cluster-sep').forEach((s) => s.remove());

      subs.forEach((sub) => {
        sub.classList.add('customer-cluster-sub');
        sub.dataset.customerClusterKey = key;
        if (isExpanded) {
          sub.classList.remove('customer-cluster-hidden');
        } else {
          sub.classList.add('customer-cluster-hidden');
        }
      });
    };

    serverGroups.forEach((groupCards, gid) => {
      if (groupCards.length < 2) return;
      const isExpanded = expanded.has(gid);
      const primary =
        groupCards.find((c) => c.dataset.ccClusterRole === 'primary') || groupCards[0];
      const subs = groupCards.filter((c) => c !== primary);
      const ordered = [primary, ...subs];
      const sizeHint = Number(primary.dataset.ccClusterSize);
      applyGroup(ordered, gid, isExpanded, (Number.isFinite(sizeHint) && sizeHint > 0 ? sizeHint : ordered.length));
    });

    legacyGroups.forEach((groupCards, key) => {
      if (groupCards.length < 2) return;
      const isExpanded = expanded.has(key);
      applyGroup(groupCards, key, isExpanded);
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

  // Delegerad click-handler för cluster-pillen som renderas av signal-bar.js
  // som .warm-why-extra[data-signal-type="cluster"]. Klick → expand/collapse.
  function bindClusterPillClicks() {
    document.addEventListener('click', (e) => {
      const pill = e.target.closest('.warm-why-extra[data-signal-type="cluster"]');
      if (!pill) return;
      const card = pill.closest('.thread-card.customer-cluster-primary');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      const k = card.dataset.customerClusterKey;
      if (!k) return;
      const next = readExpanded();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      writeExpanded(next);
      scanAndCluster();
    }, true);
  }

  function init() {
    bindObserver();
    bindClusterPillClicks();
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
