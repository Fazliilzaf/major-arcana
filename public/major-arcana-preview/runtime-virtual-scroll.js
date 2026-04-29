/**
 * Major Arcana Preview — Virtual Scrolling (P6 Prestanda & UX).
 *
 * Använder modern CSS `content-visibility: auto` + IntersectionObserver för
 * att skippa rendering av tråd-kort som är utanför viewport. Browser skippar
 * layout/paint för dessa kort tills de scrollas in i view.
 *
 * Aktiveras automatiskt när antal [data-runtime-thread] överstiger 30 kort.
 *
 * Designprinciper:
 *   • Pure CSS-baserat — fungerar utan IntersectionObserver också
 *   • Behåller scroll-position och scroll-höjd (placeholder via contain-intrinsic-size)
 *   • Inga DOM-mutationer av kort — bara visibility-control
 *   • content-visibility: auto stöds i Chrome 85+, Edge 85+, Safari 18+
 *   • För äldre browsers: graceful fallback (kort renderas vanligt)
 */
(() => {
  'use strict';

  const ACTIVATE_THRESHOLD = 30;
  const INTRINSIC_HEIGHT_PX = 220;
  let observer = null;
  let intersection = null;
  let activated = false;

  function injectStyles() {
    if (document.getElementById('cco-vscroll-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-vscroll-styles';
    style.textContent = `
/* P6 Virtual scrolling — content-visibility: auto låter browser skippa
   layout/paint för element utanför viewport. */
[data-cco-vscroll-active] [data-runtime-thread] {
  content-visibility: auto;
  contain-intrinsic-size: auto ${INTRINSIC_HEIGHT_PX}px;
}
/* IntersectionObserver-baserad fallback — sätter is-virtual-hidden för element
   utanför viewport om browser saknar content-visibility. */
[data-cco-vscroll-active] [data-runtime-thread][data-virtual-state="hidden"] {
  visibility: hidden;
  height: ${INTRINSIC_HEIGHT_PX}px;
}
`.trim();
    document.head.appendChild(style);
  }

  function supportsContentVisibility() {
    if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
    try {
      return CSS.supports('content-visibility', 'auto');
    } catch (_e) {
      return false;
    }
  }

  function findThreadList() {
    return (
      document.querySelector('[data-runtime-thread-list]') ||
      document.querySelector('.queue-thread-list') ||
      document.querySelector('.thread-list') ||
      document.querySelector('[data-runtime-thread]')?.parentElement ||
      null
    );
  }

  function activate() {
    if (activated) return;
    const cards = document.querySelectorAll('[data-runtime-thread]');
    if (cards.length < ACTIVATE_THRESHOLD) return;
    const list = findThreadList();
    if (!list) return;
    activated = true;
    injectStyles();
    list.setAttribute('data-cco-vscroll-active', '');
    if (!supportsContentVisibility()) {
      // Aktivera IntersectionObserver-fallback
      bindIntersectionFallback();
    }
  }

  function deactivate() {
    if (!activated) return;
    activated = false;
    document.querySelectorAll('[data-cco-vscroll-active]').forEach((el) => {
      el.removeAttribute('data-cco-vscroll-active');
    });
    document.querySelectorAll('[data-runtime-thread][data-virtual-state]').forEach((el) => {
      el.removeAttribute('data-virtual-state');
    });
    if (intersection) {
      try { intersection.disconnect(); } catch (_e) {}
      intersection = null;
    }
  }

  function bindIntersectionFallback() {
    if (intersection || typeof IntersectionObserver !== 'function') return;
    intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          if (entry.isIntersecting) {
            el.removeAttribute('data-virtual-state');
          } else {
            el.setAttribute('data-virtual-state', 'hidden');
          }
        }
      },
      { rootMargin: '600px 0px 600px 0px' }
    );
    document.querySelectorAll('[data-runtime-thread]').forEach((card) => {
      intersection.observe(card);
    });
  }

  function observeNewCards() {
    if (typeof MutationObserver !== 'function') return;
    if (observer) return;
    let scheduled = false;
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const count = document.querySelectorAll('[data-runtime-thread]').length;
        if (!activated && count >= ACTIVATE_THRESHOLD) {
          activate();
        } else if (activated && count < ACTIVATE_THRESHOLD / 2) {
          // Auto-deaktivera om listan blivit kort igen
          deactivate();
        } else if (activated && intersection) {
          // Lägg till nya kort till observer
          document.querySelectorAll('[data-runtime-thread]').forEach((card) => {
            intersection.observe(card);
          });
        }
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function mount() {
    injectStyles();
    activate();
    observeNewCards();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewVirtualScroll = Object.freeze({
      mount,
      activate,
      deactivate,
      isActive: () => activated,
      supportsContentVisibility,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
