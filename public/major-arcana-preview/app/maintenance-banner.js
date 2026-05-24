/**
 * app/maintenance-banner.js
 * U2.5b: STAFF-varning när underhållsfönster är aktivt eller nära.
 */
(() => {
  'use strict';

  const DISMISS_KEY = 'arcana.maintenanceBanner.dismissedUntil';
  const API_PATH = '/api/v1/ops/maintenance-window';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatWindowLabel(startsAt, endsAt) {
    try {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      const fmt = new Intl.DateTimeFormat('sv-SE', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      return `${fmt.format(start)} – ${fmt.format(end)}`;
    } catch (_error) {
      return '';
    }
  }

  function isDismissed(endsAt) {
    try {
      const until = Number(sessionStorage.getItem(DISMISS_KEY) || 0);
      if (!Number.isFinite(until) || until <= Date.now()) return false;
      if (endsAt) {
        const endMs = Date.parse(String(endsAt));
        if (Number.isFinite(endMs) && endMs <= Date.now()) {
          sessionStorage.removeItem(DISMISS_KEY);
          return false;
        }
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  function dismissUntilEnd(endsAt) {
    const endMs = Date.parse(String(endsAt || ''));
    const until = Number.isFinite(endMs) ? endMs : Date.now() + 60 * 60 * 1000;
    try {
      sessionStorage.setItem(DISMISS_KEY, String(until));
    } catch (_error) {
      /* ignore */
    }
  }

  function injectBanner(payload) {
    if (!payload || document.querySelector('[data-maintenance-banner]')) return;
    if (!payload.active && !payload.upcoming) return;
    if (isDismissed(payload.endsAt)) return;

    const banner = document.createElement('div');
    banner.className = 'maintenance-banner';
    banner.setAttribute('data-maintenance-banner', '1');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const windowLabel = formatWindowLabel(payload.startsAt, payload.endsAt);
    const prefix = payload.active ? 'Planerat underhåll pågår' : 'Planerat underhåll snart';
    banner.innerHTML = `
      <span class="maintenance-banner-text">
        <strong>${escapeHtml(prefix)}</strong>
        ${windowLabel ? ` · ${escapeHtml(windowLabel)}` : ''}
        — ${escapeHtml(payload.message || 'Journal kan vara otillgänglig en stund.')}
      </span>
      <button type="button" class="maintenance-banner-dismiss" data-maintenance-dismiss aria-label="Stäng varning">
        Stäng
      </button>
    `;

    document.body.insertBefore(banner, document.body.firstChild);
    banner.querySelector('[data-maintenance-dismiss]')?.addEventListener('click', () => {
      dismissUntilEnd(payload.endsAt);
      banner.remove();
    });
  }

  async function loadMaintenanceWindow() {
    try {
      const response = await fetch(API_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const body = await response.json();
      injectBanner(body?.maintenance || null);
    } catch (_error) {
      /* tyst — banner är icke-kritisk */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMaintenanceWindow, { once: true });
  } else {
    void loadMaintenanceWindow();
  }
})();
