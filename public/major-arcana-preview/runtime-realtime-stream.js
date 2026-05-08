/**
 * Major Arcana Preview — Real-time Stream Client (P7 Prestanda & UX).
 *
 * Lyssnar på Server-Sent Events från /api/v1/cco/runtime/stream och triggar
 * background-refresh av kö-data när "poll"-event kommer in. Auto-reconnect
 * vid disconnect.
 *
 * Strategi:
 *   • EventSource för stabil SSE-anslutning
 *   • Backoff-reconnect (1s → 2s → 4s → 8s → 30s max) vid fel
 *   • Pause när tab är dold (visibilitychange)
 *   • Resume när tab fokuseras igen + fire en omedelbar refresh
 *
 * Backend: minimal "knock"-mekanism — frontend pollar background efter varje
 * poll-event. Future: backend kan emitta riktiga thread_added etc. som
 * frontend reagerar på direkt.
 */
(() => {
  'use strict';

  const STREAM_URL = '/api/v1/cco/runtime/stream';
  const RECONNECT_INITIAL_MS = 1000;
  const RECONNECT_MAX_MS = 30000;
  const RECONNECT_GROWTH = 1.7;

  let eventSource = null;
  let reconnectTimer = 0;
  let reconnectDelay = RECONNECT_INITIAL_MS;
  let reconnectAttempts = 0;
  let connected = false;
  let lastPollAt = 0;
  let visibilityListenerBound = false;
  let disabled = false;

  function getAuthToken() {
    if (typeof window === 'undefined') return '';
    const sources = [
      window.localStorage?.getItem?.('cco.adminToken'),
      window.sessionStorage?.getItem?.('cco.adminToken'),
      window.__CCO_DEV_TOKEN__,
    ].filter(Boolean);
    return sources[0] || '';
  }

  function buildStreamUrl() {
    // EventSource stöder inte custom headers — token måste skickas som query.
    // Vi använder samma "Authorization"-värde men flyttat till token=... om så krävs.
    const token = getAuthToken();
    if (!token || token === '__preview_local__') return STREAM_URL;
    return `${STREAM_URL}?access_token=${encodeURIComponent(token)}`;
  }

  function close() {
    if (eventSource) {
      try { eventSource.close(); } catch (_e) {}
      eventSource = null;
    }
    connected = false;
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    if (disabled) return;
    reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_INITIAL_MS *
        Math.pow(RECONNECT_GROWTH, Math.max(0, reconnectAttempts - 1)),
      RECONNECT_MAX_MS
    );
    reconnectDelay = delay;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      connect();
    }, delay);
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = 0;
    }
  }

  function triggerBackgroundRefresh(reason) {
    lastPollAt = Date.now();
    // Försök primärt: kör state.runtime-baserad refresh via befintlig DOM-API
    // som existing modules redan har.
    try {
      // Klicka osynligt på "Uppdatera"/"Refresh"-knapp om den finns
      const refreshBtn = document.querySelector('[data-runtime-refresh], [data-cco-refresh]');
      if (refreshBtn && typeof refreshBtn.click === 'function') {
        refreshBtn.click();
        return;
      }
    } catch (_e) { /* tyst */ }

    // Fallback: trigga visibility-recovery i runtime-dom-live-composition
    // genom att simulera visibilitychange (vi har redan en self-healing path
    // som re-laddar runtime när dokumentet blir synligt).
    try {
      const event = new Event('cco-realtime-poll');
      event.reason = reason;
      window.dispatchEvent(event);
    } catch (_e) { /* tyst */ }
  }

  function bindEventSourceHandlers(es) {
    es.addEventListener('connected', (event) => {
      connected = true;
      reconnectAttempts = 0;
      reconnectDelay = RECONNECT_INITIAL_MS;
      // eslint-disable-next-line no-console
      console.info('[CCO realtime] connected');
    });
    es.addEventListener('heartbeat', () => {
      // Heartbeat — bara håll connection alive, inget mer
    });
    es.addEventListener('poll', (event) => {
      let payload = {};
      try { payload = JSON.parse(event.data || '{}'); } catch (_e) { payload = {}; }
      triggerBackgroundRefresh(payload.reason || 'poll');
    });
    es.addEventListener('shutdown', () => {
      // Server avslutar gracefully — vi reconnect:ar
      close();
      scheduleReconnect();
    });
    es.onerror = () => {
      // Auto-reconnect via backoff
      close();
      scheduleReconnect();
    };
  }

  function connect() {
    if (disabled) return;
    if (eventSource) return;
    if (typeof EventSource !== 'function') {
      // eslint-disable-next-line no-console
      console.warn('[CCO realtime] EventSource saknas i denna browser');
      return;
    }
    try {
      const url = buildStreamUrl();
      eventSource = new EventSource(url, { withCredentials: true });
      bindEventSourceHandlers(eventSource);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[CCO realtime] kunde inte starta EventSource', error);
      scheduleReconnect();
    }
  }

  function bindVisibilityListener() {
    if (visibilityListenerBound) return;
    if (typeof document === 'undefined') return;
    visibilityListenerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Återanslut om vi var disconnected, och trigga en omedelbar refresh
        if (!connected) {
          clearReconnectTimer();
          reconnectAttempts = 0;
          connect();
        }
        triggerBackgroundRefresh('visibility');
      } else {
        // Tab dold — stäng ström och pausa reconnect
        close();
        clearReconnectTimer();
      }
    });
  }

  function disable() {
    disabled = true;
    close();
    clearReconnectTimer();
  }

  function enable() {
    disabled = false;
    reconnectAttempts = 0;
    connect();
  }

  function mount() {
    bindVisibilityListener();
    if (document.visibilityState === 'visible') {
      connect();
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewRealtimeStream = Object.freeze({
      mount,
      disable,
      enable,
      isConnected: () => connected,
      getLastPollAt: () => lastPollAt,
      forceReconnect: () => {
        close();
        clearReconnectTimer();
        reconnectAttempts = 0;
        connect();
      },
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
