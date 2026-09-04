/**
 * ORD-196 — personalportalens session.
 *
 * VARFÖR DEN LIGGER I EN EGEN FIL. Logiken satt först inline i
 * staff-portal.html. Testerna kunde då bara läsa filen som text och leta efter
 * mönster — och ett sånt test är dekorativt: en mutation som slog ut
 * 401-hanteringen (`res.status === 401 || res.status === 403` → `false`) lämnade
 * strängen kvar på ett annat ställe i filen och testet fortsatte vara grönt.
 *
 * Nu går funktionerna att köra. Testet mätar beteende, inte stavning.
 *
 * VAD FELET VAR. requireAuth läser token ur `Authorization: Bearer` eller
 * `x-auth-token` (src/security/authMiddleware.js:87). Portalen skickade
 * `credentials: 'include'` — cookies. Det finns ingen cookie i det här
 * auth-systemet: ingen res.cookie sätter en session, ingen cookie-parser är
 * monterad, ingenting bryggar cookie till header, och ingen HTML-sida i public/
 * anropade auth/login mot portalen.
 *
 * Uppmätt mot prod 2026-09-04, utan token:
 *   GET /api/v1/staff/availability-rules  ->  401 {"error":"Inloggning krävs."}
 *   GET /api/v1/staff/team                ->  401 {"error":"Inloggning krävs."}
 *   GET /staff-portal.html                ->  200
 *
 * Och det syntes inte, eftersom apiFetch returnerade `null` på allt utom 2xx.
 * 401 och en tom lista blev samma värde.
 */
(function (root) {
  'use strict';

  /** Samma nyckel som admin.js skriver till (admin.js:3). Samma origin. */
  const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';

  const TENANT_NAMN = {
    'hair-tp-clinic': 'Hair TP Clinic',
    curatiio: 'Curatiio',
  };

  /**
   * @param {object} opts
   * @param {Storage} [opts.storage] localStorage, eller en stubbe i test.
   * @param {() => void} [opts.onChange] anropas när läget ändras.
   */
  function createSessionGuard({ storage = null, onChange = null } = {}) {
    const state = { token: '', sawUnauthorized: false, tenantId: '', live: false };

    function meddela() {
      if (typeof onChange === 'function') onChange(lage());
    }

    function las() {
      try {
        // Kan kasta i privat läge och i inbäddade kontexter.
        return (storage && storage.getItem(TOKEN_KEY)) || '';
      } catch {
        return '';
      }
    }

    function skriv(token) {
      if (!token) return false;
      try {
        storage.setItem(TOKEN_KEY, token);
        state.token = token;
        return true;
      } catch {
        // Ett misslyckat skriv får inte se ut som ett lyckat byte.
        return false;
      }
    }

    function laddaToken() {
      state.token = las();
      meddela();
      return state.token;
    }

    /** Headers med bearer-token. Aldrig cookies — de bär ingenting här. */
    function withAuth(opts = {}) {
      const headers = Object.assign({}, opts.headers || {});
      if (state.token) headers.Authorization = `Bearer ${state.token}`;
      const ut = Object.assign({}, opts, { headers });
      // Skulle någon råka skicka credentials vidare: ta bort det, så att det
      // aldrig ser ut som att anropet är autentiserat när det inte är det.
      delete ut.credentials;
      return ut;
    }

    /**
     * Noterar svaret. 401/403 MÅSTE gå att skilja från tomt svar — det var hela
     * buggen.
     */
    function noteResponse(res) {
      if (res && (res.status === 401 || res.status === 403)) {
        if (!state.sawUnauthorized) {
          state.sawUnauthorized = true;
          meddela();
        }
      }
      return res;
    }

    function setLive(live, tenantId) {
      state.live = Boolean(live);
      state.tenantId = String(tenantId || '').trim();
      if (state.live) state.sawUnauthorized = false;
      meddela();
    }

    /**
     * Tre lägen som tidigare såg likadana ut i gränssnittet.
     * @returns {{kod: 'live'|'ingen_token'|'nekad'|'okant', tenantLabel: string}}
     */
    function lage() {
      if (state.live) {
        return {
          kod: 'live',
          tenantId: state.tenantId,
          tenantLabel: tenantLabel(state.tenantId),
        };
      }
      if (!state.token) return { kod: 'ingen_token', tenantId: '', tenantLabel: 'Klinik okänd' };
      if (state.sawUnauthorized) return { kod: 'nekad', tenantId: '', tenantLabel: 'Klinik okänd' };
      return { kod: 'okant', tenantId: '', tenantLabel: 'Klinik okänd' };
    }

    /** Okänd tenant får ALDRIG visas som en klinik — det är ett påstående om
        vems uppgifter man ser. */
    function tenantLabel(tenantId) {
      const id = String(tenantId || '').trim();
      if (!id) return 'Klinik okänd';
      return TENANT_NAMN[id] || id;
    }

    return {
      get token() {
        return state.token;
      },
      get sawUnauthorized() {
        return state.sawUnauthorized;
      },
      get tenantId() {
        return state.tenantId;
      },
      laddaToken,
      skrivToken: skriv,
      withAuth,
      noteResponse,
      setLive,
      lage,
      tenantLabel,
    };
  }

  const api = { createSessionGuard, TOKEN_KEY, TENANT_NAMN };
  root.ArcanaStaffSession = api;
  // Samma fil laddas av webbläsaren via <script src> och av testet via require.
  // Filen ligger i public/ och lintas därför som webbläsarkod — `module` finns
  // inte i den miljön, vilket är just varför typeof-kontrollen står här.
  /* eslint-disable-next-line no-undef */
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
