/**
 * app/showcase-banner.js
 * Fas 27G (2026-05-18): tydlig banner när showcase-mode (portalCustomerKey)
 * är aktiv. Användaren ska aldrig kunna missa att de tittar på fixtures.
 *
 * Fas 37 (2026-05-19): showcase kräver nu EXPLICIT ?showcase=1. Om URL bara
 * har portalCustomerKey (utan showcase=1) → auto-strip från URL via
 * history.replaceState OCH visa ingen banner. Detta är säkerhetsnätet mot
 * "olika kunder på varje reload"-buggen där lingering URL-params poisonade
 * state.
 *
 * Triggas av: URL-param ?portalCustomerKey=X + ?showcase=1
 * Visar: orange banner överst med "Visa live"-knapp som tar bort param + reload.
 */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const portalKey = params.get('portalCustomerKey') || params.get('customerKey');
  const wantsShowcase = params.get('showcase') === '1';

  // Fas 37: portalCustomerKey utan ?showcase=1 = lingering URL-trash.
  // Strip från URL silently så normal mode kan ta över helt.
  if (portalKey && !wantsShowcase) {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('portalCustomerKey');
      url.searchParams.delete('customerKey');
      const cleaned = `${url.pathname}${url.search}${url.hash}`;
      history.replaceState(history.state, '', cleaned);
    } catch (_e) {
      /* tyst — om history.replaceState faller appen fortsätter normalt */
    }
    return;
  }

  if (!portalKey || !wantsShowcase) return; // ingen showcase-mode

  function injectBanner() {
    if (document.querySelector('.showcase-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'showcase-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `
      <span class="showcase-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M8 1.5l1.8 4.3 4.7.4-3.6 3.1 1.1 4.6L8 11.5l-4 2.4 1.1-4.6L1.5 6.2l4.7-.4z"
            fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="showcase-banner-text">
        <strong>Showcase-läge</strong> — visar demo-data, inte riktiga mejl.
        Kund: <code>${escapeHtml(portalKey)}</code>
      </span>
      <button type="button" class="showcase-banner-cta" data-showcase-exit>
        Visa live-data →
      </button>
    `;
    document.body.insertBefore(banner, document.body.firstChild);

    banner.querySelector('[data-showcase-exit]').addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.delete('portalCustomerKey');
      url.searchParams.delete('customerKey');
      url.searchParams.delete('showcase');
      url.searchParams.delete('_v');
      location.href = url.toString();
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner, { once: true });
  } else {
    injectBanner();
  }
})();
