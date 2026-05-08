/**
 * Major Arcana Preview — Mobile Responsive (P5 Prestanda & UX).
 *
 * Tillägger mobile-specifika overrides för:
 *   • Alla overlays (cmdk, saved views, unified search, thread summary,
 *     soft break, anomalies, optimistic toast, draft feedback)
 *   • Topbar (kompaktare på smala skärmar)
 *   • Tap targets (minst 44×44 px för iOS-vänlighet)
 *   • Skeleton-loaders (skala ner)
 *
 * Designprinciper:
 *   • Inga ändringar i existing styles.css — alla overrides via @media (max-width)
 *   • Auto-detektion: <html data-cco-mobile="true"> sätts vid breddmed < 768px
 *   • Sticky body-class is-mobile för andra moduler att rikta sig mot
 */
(() => {
  'use strict';

  const MOBILE_BREAKPOINT = 768;
  const TABLET_BREAKPOINT = 1024;
  let resizeBound = false;

  function injectMobileStyles() {
    if (document.getElementById('cco-mobile-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-mobile-styles';
    style.textContent = `
/* P5 Mobile responsive overrides — aktiveras endast under 768px */
@media (max-width: 767px) {
  /* === Topbar kompakt === */
  html .preview-topbar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
  }
  html .preview-topbar-left,
  html .preview-topbar-right {
    flex-wrap: wrap;
    gap: 6px;
  }
  html .preview-nav-item span:not([aria-hidden]) {
    display: none; /* dölj label, behåll endast ikon */
  }
  html .preview-nav-item {
    padding: 8px 10px;
    min-width: 40px;
    min-height: 40px;
  }
  html .preview-compose-pill,
  html .preview-sprint-pill {
    padding: 8px 12px;
    font-size: 12px;
  }
  html .preview-utility-cluster {
    gap: 4px;
  }
  html .preview-utility-button {
    width: 36px;
    height: 36px;
    min-width: 36px;
  }

  /* === Stacka workspace-layouten vertikalt === */
  html .preview-app,
  html .workspace-shell,
  html .workspace-layout {
    grid-template-columns: 1fr !important;
    grid-template-rows: auto !important;
  }
  html .queue-shell,
  html .focus-shell,
  html .intel-shell {
    width: 100%;
    max-width: 100%;
  }
  html .intel-shell {
    margin-top: 8px;
  }

  /* Resize-handles göms (touch ska inte resize:a) */
  html .workspace-resizer,
  html [data-resize-handle],
  html [aria-label^="Ändra bredd"] {
    display: none !important;
  }

  /* === Overlays: full bredd på mobil === */
  html .cco-cmdk-backdrop,
  html .cco-svw-backdrop,
  html .cco-usearch-backdrop,
  html .cco-tsum-backdrop,
  html .cco-sbreak-backdrop,
  html .cco-shortcuts-backdrop,
  html .cco-followup-row + * {
    padding-top: 4vh !important;
    padding-left: 8px;
    padding-right: 8px;
  }
  html .cco-cmdk,
  html .cco-svw-dialog,
  html .cco-usearch,
  html .cco-tsum-dialog,
  html .cco-sbreak-dialog,
  html .cco-shortcuts {
    width: 100% !important;
    max-width: 100% !important;
    border-radius: 14px;
  }
  html .cco-cmdk-results,
  html .cco-usearch-results,
  html .cco-svw-list {
    max-height: 70vh !important;
  }
  html .cco-cmdk-input,
  html .cco-usearch-input {
    font-size: 16px !important; /* förhindrar iOS-zoom på fokus */
  }

  /* === Tap-targets: minst 44px === */
  html .cco-cmdk-item,
  html .cco-usearch-item,
  html .cco-svw-item,
  html .cco-shortcuts-row,
  html .cco-tsum-action,
  html .cco-sbreak-action {
    min-height: 44px;
  }
  html .cco-followup-chip,
  html .cco-density-toggle,
  html .cco-tsum-trigger {
    min-height: 36px;
    padding: 8px 14px;
  }

  /* === Toast-positioner: ovanför iOS-bottom-bar === */
  html .cco-feedback-toast,
  html .cco-optimistic-toast,
  html .cco-sbreak-toast {
    bottom: 24px !important;
    max-width: calc(100vw - 32px) !important;
    font-size: 13px;
  }

  /* === Studio: input större för touch === */
  html textarea[data-studio-draft],
  html .studio-draft-textarea {
    font-size: 16px !important;
    min-height: 140px;
  }

  /* === Skeleton-trådkort kompakta === */
  html .cco-skeleton-thread-card {
    padding: 10px 12px;
  }
  html .cco-skeleton-avatar {
    width: 32px;
    height: 32px;
  }

  /* === Thread-summary modal scrollbar === */
  html .cco-tsum-content {
    max-height: 70vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* === Followup-row: horisontell scroll på smala skärmar === */
  html .cco-followup-row {
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
  }
  html .cco-followup-row::-webkit-scrollbar {
    display: none;
  }
  html .cco-followup-chip {
    flex-shrink: 0;
  }

  /* === Card-badges på trådar inte för stora === */
  html .cco-card-badge {
    width: 20px;
    height: 20px;
    font-size: 11px;
  }
}

/* Tablet-mellanläge: 768-1023px → smalare paneler men fortfarande sidors */
@media (min-width: 768px) and (max-width: 1023px) {
  html .preview-nav-item {
    padding: 8px 12px;
  }
  html .cco-cmdk,
  html .cco-svw-dialog,
  html .cco-usearch,
  html .cco-tsum-dialog {
    width: 86vw !important;
    max-width: 720px !important;
  }
}

/* iOS safe-area (notch / hem-indikator) */
@supports (padding: max(0px)) {
  html[data-cco-mobile="true"] body {
    padding-bottom: max(0px, env(safe-area-inset-bottom));
  }
  html[data-cco-mobile="true"] .preview-topbar {
    padding-top: max(8px, env(safe-area-inset-top));
  }
}
`.trim();
    document.head.appendChild(style);
  }

  function getViewportWidth() {
    return Math.max(
      window.innerWidth || 0,
      document.documentElement?.clientWidth || 0
    );
  }

  function applyMobileFlag() {
    const w = getViewportWidth();
    const root = document.documentElement;
    const body = document.body;
    if (!root) return;
    if (w < MOBILE_BREAKPOINT) {
      root.setAttribute('data-cco-mobile', 'true');
      root.setAttribute('data-cco-tablet', 'false');
      body?.classList?.add('is-mobile');
      body?.classList?.remove('is-tablet');
    } else if (w < TABLET_BREAKPOINT) {
      root.setAttribute('data-cco-mobile', 'false');
      root.setAttribute('data-cco-tablet', 'true');
      body?.classList?.remove('is-mobile');
      body?.classList?.add('is-tablet');
    } else {
      root.setAttribute('data-cco-mobile', 'false');
      root.setAttribute('data-cco-tablet', 'false');
      body?.classList?.remove('is-mobile');
      body?.classList?.remove('is-tablet');
    }
  }

  function bindResize() {
    if (resizeBound) return;
    resizeBound = true;
    let scheduled = false;
    const onResize = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        applyMobileFlag();
      });
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
  }

  function ensureViewportMeta() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, viewport-fit=cover'
      );
      document.head.appendChild(meta);
    } else {
      // Lägg till viewport-fit=cover om saknas (för iOS notch-stöd)
      const content = meta.getAttribute('content') || '';
      if (!/viewport-fit=cover/.test(content)) {
        meta.setAttribute('content', `${content}, viewport-fit=cover`);
      }
    }
  }

  function mount() {
    ensureViewportMeta();
    injectMobileStyles();
    applyMobileFlag();
    bindResize();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewMobileResponsive = Object.freeze({
      mount,
      isMobile: () => getViewportWidth() < MOBILE_BREAKPOINT,
      isTablet: () =>
        getViewportWidth() >= MOBILE_BREAKPOINT &&
        getViewportWidth() < TABLET_BREAKPOINT,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
