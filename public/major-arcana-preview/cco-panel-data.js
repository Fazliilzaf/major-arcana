/* ─── ORD-220 · gemensam datahjälpare för CCO:s v3-paneler ──────────────────
 *
 * VARFÖR FILEN FINNS. Fem paneler hade noll `fetch(` och visade hårdkodad
 * demodata: no-show-AI, ny bokning, patient-hub, signaturer, svarstudio.
 * Sammanlagt 7 200 rader gränssnitt utan något bakom.
 *
 * När de kopplas in är den lätta vägen att ge var och en sin egen
 * fetch-funktion. Då får man fem varianter av samma tre fel:
 *
 *   1. `catch { visa tomt }` — trasigt anrop ser ut som "inget att visa".
 *      Det var exakt buggen i Skickat-panelen (ORD-214) och i mallistan
 *      (ORD-216). Två oberoende paneler, samma misstag, för att var och en
 *      skrev sin egen felhantering.
 *   2. Auth skickas olika. Mätt 2026-09-04: cco-notiser-v3 skickar inga
 *      headers alls, cco-smart-anteckning-v3 har HÅRDKODAD tenant och roll
 *      ('konsult', 'hair-tp-clinic') — vilket ger fel klinik för Curatiio.
 *   3. Ingen skiljer "laddar" från "tomt", så en långsam hämtning ser ut som
 *      ett tomt resultat tills den är klar.
 *
 * TRE TILLSTÅND, ALLTID. laddar / fel / data — där data i sin tur kan vara
 * tom. Ett fel får aldrig renderas som tomt.
 * ────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var API = "/api/v1";

  /**
   * Auth-huvuden. Delegerar till konversationsvyns kanoniska källa när panelen
   * körs inbäddad där (window.CCOConversationAuth), annars läses token på samma
   * sätt som konversationer-bottom-actions.js gör.
   *
   * Sentinelvärdet `__preview_local__` skickas ALDRIG — det betyder "ingen
   * riktig session" och en server som ser det skulle svara 401 på något som
   * inte är ett inloggningsförsök.
   */
  function authHeaders(extra) {
    var headers = Object.assign({ Accept: "application/json" }, extra || {});
    try {
      if (window.CCOConversationAuth && typeof window.CCOConversationAuth.headers === "function") {
        return window.CCOConversationAuth.headers(headers);
      }
      var token = null;
      try {
        token =
          window.localStorage.getItem("ARCANA_ADMIN_TOKEN") ||
          window.sessionStorage.getItem("ARCANA_ADMIN_TOKEN");
      } catch (_e) {
        token = null;
      }
      if (token && token !== "__preview_local__") {
        headers.Authorization = "Bearer " + token;
      }
    } catch (_e) {
      /* headers utan auth är bättre än ett kastat undantag i en panel */
    }
    return headers;
  }

  /**
   * Hämta JSON. Kastar vid icke-2xx — anroparen SKA behöva ta ställning.
   *
   * Att svälja felet här hade återinfört exakt den bugg filen finns för att
   * förhindra.
   */
  async function ccoFetch(path, opts) {
    var options = opts || {};
    var res = await fetch(API + path, {
      method: options.method || "GET",
      credentials: "include",
      headers: authHeaders(options.headers),
      body: options.body,
    });
    if (!res.ok) {
      var err = new Error("HTTP " + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /**
   * Rendera ett av tre tillstånd i en behållare.
   *
   * `tomText` är obligatorisk och medvetet så: den som kopplar in en panel
   * måste formulera vad tomt BETYDER här. "Inga poster" duger sällan — "Inga
   * uteblivna besök den här veckan" säger något.
   */
  function ccoState(el, tillstand, opts) {
    if (!el) return;
    var o = opts || {};
    if (tillstand === "laddar") {
      el.innerHTML =
        '<div class="cco-state cco-state--laddar" style="padding:1.2rem;text-align:center;opacity:.7">' +
        (o.laddarText || "Hämtar…") +
        "</div>";
      return;
    }
    if (tillstand === "fel") {
      var kod = o.fel && o.fel.message ? String(o.fel.message) : "okänt fel";
      el.innerHTML =
        '<div class="cco-state cco-state--fel" style="padding:1.2rem;text-align:center;color:#a83838">' +
        "<strong>Kunde inte hämta data</strong> (" +
        kod.replace(/[<>&]/g, "") +
        ").<br>Listan nedan är därför <em>okänd</em>, inte tom." +
        "</div>";
      return;
    }
    if (tillstand === "tom") {
      el.innerHTML =
        '<div class="cco-state cco-state--tom" style="padding:1.2rem;text-align:center;opacity:.7">' +
        (o.tomText || "Inget att visa.") +
        "</div>";
      return;
    }
  }

  /**
   * Vanligaste mönstret: ladda, rendera, och skilj tomt från trasigt.
   *
   * `render(data)` ska returnera antalet rader den ritade. Returneras 0 ritas
   * tomtillståndet i stället — så att en panel inte kan visa en tom yta utan
   * att förklara varför den är tom.
   */
  async function ccoLoad(el, path, render, texter) {
    var t = texter || {};
    ccoState(el, "laddar", t);
    try {
      var data = await ccoFetch(path);
      var antal = render(data);
      if (!antal) ccoState(el, "tom", t);
      return data;
    } catch (fel) {
      ccoState(el, "fel", { fel: fel });
      return null;
    }
  }

  window.CCOPanelData = {
    API: API,
    authHeaders: authHeaders,
    fetch: ccoFetch,
    state: ccoState,
    load: ccoLoad,
  };
})();
