/**
 * app/mock-worklist-api.js — fetch-interceptor för demo-mode (utan token).
 *
 * När ARCANA_ADMIN_TOKEN saknas: intercepta CCO-API-anrop och returnera
 * benign 200-responser så att appen INTE går in i auth_required-state.
 *
 * Mål: eliminera behovet av FIX14 (card-injektor) i runtime-demo-fixture
 * eftersom state.runtime.threads (i __stateInternal) redan har 6 demo-
 * fixtures som renderas naturligt om appen inte byter till "Session krävs".
 *
 * För FIX12 (focus-pane custom-rendering) krävs separat mock av
 * conversation-detail-endpoint — kvarstår tills vidare.
 *
 * Strategi:
 *  - Bara aktiv när ingen token finns (= demo-mode)
 *  - Returnerar tomma `{rows:[], items:[], summary:{}}` för worklist-endpoints
 *  - Returnerar tomma successobjekt för andra CCO-endpoints
 *  - /api/v1/auth/me returnerar fake-profil
 *  - Real fetch passes through för icke-CCO URLs (fonts, etc.)
 */
(() => {
  'use strict';

  function isDemoMode() {
    try {
      const token = localStorage.getItem('ARCANA_ADMIN_TOKEN');
      return !token || token === 'DEMO' || token === 'demo';
    } catch (_e) {
      return true;
    }
  }

  if (!isDemoMode()) {
    // Riktig auth-token finns — låt fetch passera oförändrad
    return;
  }

  const __originalFetch = window.fetch.bind(window);

  function makeJsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // URL-mönster → mock-payload-fabrik
  const MOCK_HANDLERS = [
    {
      // Worklist consumer (sannolikt det som triggar FIX14 idag)
      match: (url) => /\/api\/v1\/cco\/runtime\/worklist\/consumer/.test(url),
      payload: () => ({
        rows: [],
        items: [],
        total: 0,
        summary: { totalRows: 0 },
        generatedAt: new Date().toISOString(),
      }),
    },
    {
      // Auth-me — fake profil så appen inte tror sig vara utloggad
      match: (url) => /\/api\/v1\/auth\/me/.test(url),
      payload: () => ({
        id: 'demo-user',
        email: 'demo@hairtpclinic.com',
        displayName: 'Demo Operator',
        roles: ['operator'],
      }),
    },
    {
      // Integrations status — inget anslutet
      match: (url) => /\/api\/v1\/cco\/integrations\/status/.test(url),
      payload: () => ({
        integrations: [],
        generatedAt: new Date().toISOString(),
      }),
    },
    {
      // Övriga CCO-endpoints — generic empty
      match: (url) => /\/api\/v1\/cco\//.test(url),
      payload: () => ({
        ok: true,
        items: [],
        rows: [],
      }),
    },
  ];

  window.fetch = async function mockedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url) return __originalFetch(input, init);

    for (const handler of MOCK_HANDLERS) {
      if (handler.match(url)) {
        const payload = handler.payload();
        if (typeof console !== 'undefined' && window.__DEBUG_MOCK_API === true) {
          console.log('[mock-api]', url.slice(0, 80), '→ 200', payload);
        }
        return makeJsonResponse(payload);
      }
    }

    return __originalFetch(input, init);
  };

  if (typeof console !== 'undefined') {
    console.log(
      '[mock-api] aktiverad (demo-mode, ingen token) — kör window.__DEBUG_MOCK_API=true för logg'
    );
  }
})();
