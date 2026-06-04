/**
 * ORD-23 — v9 staff preference: legacy-banner + inställnings-toggle.
 */
(function (global) {
  'use strict';

  const V9_KEY = 'arcana.v9.enabled';
  const BANNER_KEY = 'arcana.v9.bannerDismissed';

  function isCustomersView() {
    const canvas = document.querySelector('.preview-canvas');
    return canvas && canvas.dataset.appShellView === 'customers';
  }

  function setV9Enabled(on) {
    try {
      localStorage.setItem(V9_KEY, on ? '1' : '0');
      if (!on && global.CcoV9Flag?.markV9Disabled) {
        global.CcoV9Flag.markV9Disabled();
      } else if (on && global.CcoV9Flag?.clearV9DisabledAt) {
        global.CcoV9Flag.clearV9DisabledAt();
      }
    } catch (_error) {
      /* private mode */
    }
    const url = new URL(window.location.href);
    url.searchParams.set('v9', on ? 'on' : 'off');
    window.location.assign(url.toString());
  }

  function renderLegacyBanner() {
    if (document.documentElement.getAttribute('data-v9-enabled') !== 'off') return;
    if (!isCustomersView()) return;
    try {
      if (sessionStorage.getItem(BANNER_KEY) === '1') return;
    } catch (_error) {
      /* ignore */
    }
    if (document.getElementById('v9-legacy-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'v9-legacy-banner';
    banner.className = 'v9-legacy-banner';
    banner.innerHTML = `
      <p><strong>Klassisk vy.</strong> Du ser legacy-design. Byt till ny v9-design för mockup-paritet.</p>
      <div class="v9-legacy-banner__actions">
        <button type="button" class="nav-btn" data-v9-pref-enable>Ny design (v9)</button>
        <button type="button" class="nav-btn nav-btn--ghost" data-v9-pref-dismiss>Behåll klassisk</button>
      </div>`;
    const shell = document.querySelector('[data-shell-view="customers"] .customers-surface');
    shell?.prepend(banner);
    banner
      .querySelector('[data-v9-pref-enable]')
      ?.addEventListener('click', () => setV9Enabled(true));
    banner.querySelector('[data-v9-pref-dismiss]')?.addEventListener('click', () => {
      try {
        sessionStorage.setItem(BANNER_KEY, '1');
      } catch (_error) {
        /* ignore */
      }
      banner.remove();
    });
  }

  function renderSettingsRow() {
    const settingsHost =
      document.querySelector('[data-settings-panel="appearance"]') ||
      document.querySelector('[data-app-settings-root]');
    if (!settingsHost || settingsHost.querySelector('[data-v9-pref-settings]')) return;
    const v9On = document.documentElement.getAttribute('data-v9-enabled') === 'on';
    const row = document.createElement('div');
    row.className = 'v9-pref-settings';
    row.dataset.v9PrefSettings = '1';
    row.innerHTML = `
      <h4>Kundvy (v9)</h4>
      <label class="v9-pref-settings__row">
        <span>Ny design (v9)</span>
        <input type="checkbox" data-v9-pref-toggle ${v9On ? 'checked' : ''} />
      </label>
      <p class="v9-pref-settings__hint">Demo/watch styrs separat med <code>?demo=on</code>.</p>`;
    settingsHost.appendChild(row);
    row.querySelector('[data-v9-pref-toggle]')?.addEventListener('change', (event) => {
      setV9Enabled(event.target.checked);
    });
  }

  function init() {
    renderLegacyBanner();
    renderSettingsRow();
    const canvas = document.querySelector('.preview-canvas');
    if (canvas) {
      new MutationObserver(() => renderLegacyBanner()).observe(canvas, {
        attributes: true,
        attributeFilter: ['data-app-shell-view'],
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  global.CcoV9PreferenceUi = { setV9Enabled, renderLegacyBanner };
})(typeof window !== 'undefined' ? window : global);
