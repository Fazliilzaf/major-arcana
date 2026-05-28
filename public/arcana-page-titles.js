(function initArcanaPageTitles(global) {
  'use strict';

  const ARCANA_SUFFIX = ' · Arcana';
  const ADMIN_SUFFIX = ' · Admin · Arcana';

  function formatArcanaTitle(pageName) {
    const base = String(pageName || '').trim() || 'Arcana';
    return `${base}${ARCANA_SUFFIX}`;
  }

  function formatAdminTitle(pageName) {
    const base = String(pageName || '').trim() || 'Admin';
    return `${base}${ADMIN_SUFFIX}`;
  }

  function applyArcanaTitle(pageName) {
    if (typeof document !== 'undefined') {
      document.title = formatArcanaTitle(pageName);
    }
    return formatArcanaTitle(pageName);
  }

  function applyAdminTitle(pageName) {
    if (typeof document !== 'undefined') {
      document.title = formatAdminTitle(pageName);
    }
    return formatAdminTitle(pageName);
  }

  global.ArcanaPageTitles = Object.freeze({
    ARCANA_SUFFIX,
    ADMIN_SUFFIX,
    formatArcanaTitle,
    formatAdminTitle,
    applyArcanaTitle,
    applyAdminTitle,
  });
})(typeof window !== 'undefined' ? window : globalThis);
