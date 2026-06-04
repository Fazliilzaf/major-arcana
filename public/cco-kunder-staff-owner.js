/* global window, fetch */
/**
 * P1.2 — Auto staff owner for Mina kunder (session > localStorage override).
 */
(function (global) {
  'use strict';

  const MINE_OWNER_KEY = 'ARCANA_CCO_MINE_OWNER';

  let cachedMe = null;
  let cachedShellOwnership = null;

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function getToken() {
    try {
      return (global.localStorage?.getItem('ARCANA_ADMIN_TOKEN') || '').trim();
    } catch {
      return '';
    }
  }

  function localStorageOverride() {
    try {
      return normalizeText(global.localStorage?.getItem(MINE_OWNER_KEY));
    } catch {
      return '';
    }
  }

  function candidatesFromMe(me) {
    const user = me?.user || {};
    const out = [];
    const push = (source, value) => {
      const v = normalizeText(value);
      if (!v) return;
      if (out.some((c) => c.value.toLowerCase() === v.toLowerCase())) return;
      out.push({ source, value: v });
    };
    push('email', user.email);
    push('displayName', user.displayName || user.name || user.fullName);
    if (user.email && user.email.includes('@')) {
      push('emailLocal', user.email.split('@')[0]);
    }
    return out;
  }

  async function fetchAuthMe(token) {
    const authToken = normalizeText(token) || getToken();
    if (!authToken) return null;
    if (cachedMe && cachedMe._token === authToken) return cachedMe.payload;
    try {
      const res = await fetch('/api/v1/auth/me', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return null;
      const payload = await res.json();
      cachedMe = { _token: authToken, payload };
      return payload;
    } catch {
      return null;
    }
  }

  function rememberShellOwnership(payload) {
    if (payload?.staffOwnership) {
      cachedShellOwnership = payload.staffOwnership;
    }
  }

  /**
   * @returns {{ value: string, source: string|null, staffOwnership?: object }}
   */
  function resolveAssignedOwner({ shellPayload = null, me = null } = {}) {
    const override = localStorageOverride();
    if (override) {
      return { value: override, source: 'localStorage', staffOwnership: cachedShellOwnership };
    }

    if (shellPayload?.staffOwnership?.assignedOwner) {
      rememberShellOwnership(shellPayload);
      return {
        value: shellPayload.staffOwnership.assignedOwner,
        source: shellPayload.staffOwnership.source || 'session',
        staffOwnership: shellPayload.staffOwnership,
      };
    }

    if (cachedShellOwnership?.assignedOwner) {
      return {
        value: cachedShellOwnership.assignedOwner,
        source: cachedShellOwnership.source || 'session',
        staffOwnership: cachedShellOwnership,
      };
    }

    const authMe = me || cachedMe?.payload;
    if (authMe) {
      const candidates = candidatesFromMe(authMe);
      if (candidates[0]) {
        return { value: candidates[0].value, source: 'auth.me', staffOwnership: null };
      }
    }

    return { value: '', source: null, staffOwnership: null };
  }

  function mineSegmentMessage(shellPayload) {
    const ownership = shellPayload?.staffOwnership || cachedShellOwnership;
    const mine = shellPayload?.segmentStats?.mineKunder;
    if (mine?.status === 'disabled') {
      return mine.reason || ownership?.disabledReason || 'Kräver ägare per kund · P1';
    }
    if (!ownership?.assignedOwner && mine?.status === 'partial') {
      return mine.reason || 'Logga in för att filtrera Mina kunder på ägare.';
    }
    if (ownership?.assignedOwner && (ownership.mineCount === 0 || mine?.count === 0)) {
      return `Mina kunder: ingen träff för ${ownership.assignedOwner} (match ${Math.round((ownership.matchRate || 0) * 100)}%).`;
    }
    return '';
  }

  global.CcoKunderStaffOwner = {
    MINE_OWNER_KEY,
    fetchAuthMe,
    resolveAssignedOwner,
    rememberShellOwnership,
    mineSegmentMessage,
    localStorageOverride,
    handlesStaffOwner: true,
  };
})(typeof window !== 'undefined' ? window : this);
