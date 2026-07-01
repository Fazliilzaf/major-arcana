/* global localStorage, sessionStorage, window, fetch, URLSearchParams */
'use strict';

(() => {
  const TOKEN_KEYS = Object.freeze(['ARCANA_ADMIN_TOKEN', 'arcana_admin_token']);

  function readStorage(storage, key) {
    try {
      return storage?.getItem(key) || '';
    } catch {
      return '';
    }
  }

  function getToken() {
    return (
      readStorage(sessionStorage, 'ARCANA_ADMIN_TOKEN') ||
      readStorage(localStorage, 'ARCANA_ADMIN_TOKEN') ||
      readStorage(localStorage, 'arcana_admin_token')
    ).trim();
  }

  function authHeaders(headers = {}) {
    const token = getToken();
    return token ? { ...headers, Authorization: `Bearer ${token}` } : { ...headers };
  }

  function buildLoginUrl(returnTo = '') {
    const target =
      returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const params = new URLSearchParams({ next: target });
    return `/admin?${params.toString()}`;
  }

  async function getSession() {
    const token = getToken();
    if (!token) {
      return {
        authenticated: false,
        tokenPresent: false,
        loginUrl: buildLoginUrl(),
        message: 'Logga in via admin för att öppna review-vyn.',
      };
    }
    const res = await fetch('/api/v1/auth/me', {
      credentials: 'same-origin',
      headers: authHeaders({ Accept: 'application/json' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        authenticated: false,
        tokenPresent: true,
        loginUrl: buildLoginUrl(),
        message: body.error || 'Inloggningen kunde inte verifieras. Logga in igen via admin.',
      };
    }
    return {
      authenticated: true,
      tokenPresent: true,
      user: body.user || body.actor || body,
      loginUrl: buildLoginUrl(),
    };
  }

  window.ArcanaReviewAuth = Object.freeze({
    TOKEN_KEYS,
    getToken,
    authHeaders,
    buildLoginUrl,
    getSession,
  });
})();
