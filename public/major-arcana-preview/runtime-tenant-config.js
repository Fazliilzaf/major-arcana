/**
 * Major Arcana Preview — Tenant Config Loader (MT4 feature flags + MT5 theming).
 *
 * Hämtar tenant-config från backend och applicerar:
 *   • CSS variables för färger (--cco-color-primary, --cco-color-accent osv)
 *   • Logotyp + signaturmall (om konfigurerat)
 *   • Feature flags som data-attribut på <html> (data-feature-NAME="true")
 *   • CSS-class på <body> (is-feature-NAME) för enkel selector-targeting
 *
 * API:
 *   window.MajorArcanaPreviewTenantConfig.isFlagEnabled('beta-ai-summary')
 *   window.MajorArcanaPreviewTenantConfig.getTheme()
 *   window.MajorArcanaPreviewTenantConfig.refresh()
 *
 * Backend hämtas från /api/v1/tenants/me eller liknande — om endpoint saknas
 * faller modulen tillbaka till runtime-config defaults utan att krascha.
 */
(() => {
  'use strict';

  let cachedConfig = null;
  let lastFetchAt = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

  function applyTheme(theme = {}) {
    const root = document.documentElement;
    if (!root) return;
    if (theme.primaryColor) {
      root.style.setProperty('--cco-color-primary', String(theme.primaryColor));
    }
    if (theme.accentColor) {
      root.style.setProperty('--cco-color-accent', String(theme.accentColor));
    }
    if (theme.backgroundColor) {
      root.style.setProperty('--cco-color-bg', String(theme.backgroundColor));
    }
    if (theme.textColor) {
      root.style.setProperty('--cco-color-text', String(theme.textColor));
    }
    if (theme.logoUrl) {
      root.style.setProperty('--cco-logo-url', `url("${String(theme.logoUrl).replace(/"/g, '\\"')}")`);
      root.setAttribute('data-cco-tenant-logo', '');
    }
    if (theme.brandName) {
      root.setAttribute('data-cco-brand-name', String(theme.brandName).slice(0, 80));
    }
  }

  function applyFeatureFlags(flags = {}) {
    const root = document.documentElement;
    const body = document.body;
    if (!root) return;
    for (const [name, enabled] of Object.entries(flags)) {
      const safeName = String(name)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .slice(0, 60);
      if (!safeName) continue;
      if (enabled === true) {
        root.setAttribute(`data-feature-${safeName}`, 'true');
        body?.classList?.add(`is-feature-${safeName}`);
      } else {
        root.removeAttribute(`data-feature-${safeName}`);
        body?.classList?.remove(`is-feature-${safeName}`);
      }
    }
  }

  async function fetchTenantConfig() {
    const tokenSources = [
      window.localStorage?.getItem?.('cco.adminToken'),
      window.sessionStorage?.getItem?.('cco.adminToken'),
      window.__CCO_DEV_TOKEN__,
    ].filter(Boolean);
    const token = tokenSources[0];
    try {
      const headers = {
        accept: 'application/json',
      };
      if (token && token !== '__preview_local__') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch('/api/v1/tenants/me', {
        method: 'GET',
        credentials: 'same-origin',
        headers,
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (_e) {
      return null;
    }
  }

  async function refresh({ force = false } = {}) {
    const now = Date.now();
    if (!force && cachedConfig && now - lastFetchAt < CACHE_TTL_MS) {
      return cachedConfig;
    }
    const payload = await fetchTenantConfig();
    if (payload) {
      cachedConfig = payload;
      lastFetchAt = now;
      const theme = payload.theme || payload.branding || {};
      const flags = payload.featureFlags || payload.flags || {};
      applyTheme(theme);
      applyFeatureFlags(flags);
    }
    return cachedConfig;
  }

  function isFlagEnabled(flagName) {
    if (!cachedConfig) return false;
    const flags = cachedConfig.featureFlags || cachedConfig.flags || {};
    return flags[flagName] === true;
  }

  function getTheme() {
    if (!cachedConfig) return {};
    return cachedConfig.theme || cachedConfig.branding || {};
  }

  function getTenantInfo() {
    if (!cachedConfig) return {};
    return {
      tenantId: cachedConfig.tenantId || '',
      brand: cachedConfig.brand || '',
      planTier: cachedConfig.planTier || 'free',
    };
  }

  function mount() {
    refresh().catch(() => {});
    // Re-fetch när användaren kommer tillbaka till tab efter pause
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refresh().catch(() => {});
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewTenantConfig = Object.freeze({
      mount,
      refresh,
      isFlagEnabled,
      getTheme,
      getTenantInfo,
      _internal: {
        applyTheme,
        applyFeatureFlags,
        getCached: () => cachedConfig,
      },
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
