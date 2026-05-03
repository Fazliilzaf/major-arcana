/**
 * Major Arcana Preview — FIX10: Demo-fixture name patch.
 *
 * Demo-fixtures (worklistSource: "demo") definieras i app.js med customerName
 * ("Morten Bak Kristoffersen" m.fl.) men något i pipelinen mellan fixture-init
 * och rendering wipar fältet, så alla kort visar "Okänd avsändare".
 *
 * Tills root-cause är spårad: hård DOM-patch via MutationObserver som ersätter
 * .name + avatar med rätt värde när data-runtime-thread börjar med "demo-".
 */
(() => {
  'use strict';

  const FIXTURES = {
    'demo-mb-001': { name: 'Morten Bak Kristoffersen', initials: 'MB' },
    'demo-jk-002': { name: 'Johan Karlsson', initials: 'JK' },
    'demo-sh-003': { name: 'Sara Holm', initials: 'SH' },
    'demo-el-004': { name: 'Erik Lindqvist', initials: 'EL' },
    'demo-as-005': { name: 'Anna Svensson', initials: 'AS' },
    'demo-pn-006': { name: 'Peter Nilsson', initials: 'PN' },
  };

  const FALLBACK_NAMES = new Set([
    'okänd avsändare',
    'okänd kund',
    'okand avsandare',
    'okand kund',
    'unknown',
    'unknown sender',
    'unknown customer',
  ]);

  function isFallbackName(text) {
    if (!text) return true;
    const norm = String(text).trim().toLowerCase();
    return !norm || FALLBACK_NAMES.has(norm);
  }

  function patchCard(card) {
    if (!card || card.nodeType !== 1) return;
    const id = card.dataset && card.dataset.runtimeThread;
    if (!id) return;
    const fb = FIXTURES[id];
    if (!fb) return;

    // .name (kund-namn i kortets huvudrad)
    const nameEls = card.querySelectorAll('.name, .thread-card-identity-name, .counterparty-name');
    nameEls.forEach((el) => {
      if (isFallbackName(el.textContent)) {
        el.textContent = fb.name;
      }
    });

    // .avatar (initials — visar "OK" pga "Okänd Kund"-derivat)
    const avatarEls = card.querySelectorAll('.avatar, .queue-history-avatar, .thread-card-avatar');
    avatarEls.forEach((el) => {
      const txt = String(el.textContent || '').trim().toUpperCase();
      if (txt === 'OK' || txt === '?' || !txt) {
        el.textContent = fb.initials;
      }
    });
  }

  function patchAllDemoCards(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const cards = scope.querySelectorAll('[data-runtime-thread^="demo-"]');
    cards.forEach(patchCard);
  }

  function bootstrap() {
    patchAllDemoCards(document);
    if (typeof MutationObserver !== 'function') return;

    const observer = new MutationObserver((mutations) => {
      let needsScan = false;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node && node.nodeType === 1) {
              if (
                (node.matches && node.matches('[data-runtime-thread^="demo-"]')) ||
                (node.querySelector && node.querySelector('[data-runtime-thread^="demo-"]'))
              ) {
                needsScan = true;
                break;
              }
            }
          }
        } else if (m.type === 'characterData' || m.type === 'attributes') {
          const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
          if (target && target.closest && target.closest('[data-runtime-thread^="demo-"]')) {
            needsScan = true;
          }
        }
        if (needsScan) break;
      }
      if (needsScan) {
        // Defer så all DOM-uppdatering hinner färdigställas innan vi patchar.
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => patchAllDemoCards(document));
        } else {
          patchAllDemoCards(document);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Backup: kör skanning var 1.5s i 30s i fall MutationObserver missar något.
    let count = 0;
    const interval = window.setInterval(() => {
      patchAllDemoCards(document);
      count += 1;
      if (count >= 20) window.clearInterval(interval);
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
