'use strict';

/**
 * cco-portal-level2.js — kundportalens nivå-2-klient. Hämtar
 * GET /api/v1/cco-portal/me (bakom BankID-session-cookie) och renderar
 * offert + journal-referens + bokningar. Vid 401 visas "Logga in med BankID".
 *
 * Fristående, inga beroenden. Inkluderas med en rad i portalen:
 *   <div data-cco-portal-level2></div>
 *   <script src="/major-arcana-preview/app/cco-portal-level2.js"></script>
 *
 * Rör INTE portal-HTML:en (Cursor/Codex yta) — mountas i en container. Rena
 * render-funktioner exporteras för enhetstest i node (ingen DOM krävs där).
 * Kontrakt: docs/cco-kundportal-inloggning-kontrakt.md (steg 3).
 */

(function () {
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    const ms = Date.parse(iso || '');
    if (!Number.isFinite(ms)) return '';
    return new Date(ms).toISOString().slice(0, 10);
  }

  var SIGNING_LABELS = {
    preparing: 'Din behandlingsplan förbereds',
    cooling_off: 'Betänketid pågår',
    ready_to_sign: 'Redo att signera',
    signed: 'Signerad ✓',
  };

  function renderOffer(offer) {
    if (!offer || !offer.hasOffer) {
      return '<div class="l2-card l2-muted">Din offert är inte klar ännu. Vi hör av oss.</div>';
    }
    var plan = offer.offerPlan || {};
    var label = esc(plan.treatmentLabel || plan.method || 'Behandlingsplan');
    var price = plan.price && (plan.price.quotedAmount || plan.price.depositAmount);
    var signing = offer.signing || {};
    var statusLabel = esc(SIGNING_LABELS[signing.status] || 'Offert');
    var cooling = signing.coolingOff || {};
    var parts = ['<div class="l2-card">'];
    parts.push('<div class="l2-kicker">Din offert</div>');
    parts.push('<div class="l2-title">' + label + '</div>');
    if (price) {
      parts.push(
        '<div class="l2-row">Pris: <strong>' +
          esc(plan.price.quotedAmount || '') +
          '</strong></div>'
      );
    }
    parts.push(
      '<div class="l2-status l2-status--' +
        esc(signing.status || '') +
        '">' +
        statusLabel +
        '</div>'
    );
    if (signing.status === 'cooling_off' && cooling.endsAt) {
      parts.push(
        '<div class="l2-row l2-muted">Kan signeras från ' + esc(fmtDate(cooling.endsAt)) + '.</div>'
      );
    }
    if (signing.canAccept) {
      parts.push('<button type="button" class="l2-btn" data-l2-accept>Signera offerten</button>');
    }
    parts.push('</div>');
    return parts.join('');
  }

  function renderJournal(journal) {
    var j = journal || {};
    if (!j.count) {
      return '<div class="l2-card l2-muted">Inga journalposter ännu.</div>';
    }
    var line =
      'Du har <strong>' + esc(j.count) + '</strong> journalpost' + (j.count === 1 ? '' : 'er');
    if (j.signedCount) line += ' (' + esc(j.signedCount) + ' signerade)';
    if (j.latestAt) line += ', senast ' + esc(fmtDate(j.latestAt));
    line += '.';
    return (
      '<div class="l2-card"><div class="l2-kicker">Journal</div><div class="l2-row">' +
      line +
      '</div><div class="l2-row l2-muted">Fullständig journal hanteras av kliniken.</div></div>'
    );
  }

  function renderBookings(bookings) {
    var b = bookings || {};
    var upcoming = Array.isArray(b.upcoming) ? b.upcoming : [];
    if (!upcoming.length) {
      return '<div class="l2-card l2-muted">Inga kommande bokningar.</div>';
    }
    var rows = upcoming
      .map(function (bk) {
        var when = esc(fmtDate(bk.startsAt)) || 'Datum ej satt';
        var what = esc(bk.serviceLabel || bk.encounterType || 'Besök');
        return '<li class="l2-booking"><span>' + when + '</span><span>' + what + '</span></li>';
      })
      .join('');
    return (
      '<div class="l2-card"><div class="l2-kicker">Kommande bokningar</div><ul class="l2-bookings">' +
      rows +
      '</ul></div>'
    );
  }

  function renderLoggedIn(payload) {
    return (
      '<div class="l2-panel">' +
      renderOffer(payload) +
      renderJournal(payload.journal) +
      renderBookings(payload.bookings) +
      '</div>'
    );
  }

  function renderLoggedOut(loginUrl) {
    return (
      '<div class="l2-panel"><div class="l2-card l2-login">' +
      '<div class="l2-title">Logga in för att se din plan</div>' +
      '<div class="l2-row l2-muted">Signera och se din journal säkert med Mobilt BankID.</div>' +
      (loginUrl
        ? '<a class="l2-btn" href="' + esc(loginUrl) + '">Logga in med BankID</a>'
        : '<div class="l2-muted">Öppna via din personliga länk för att logga in.</div>') +
      '</div></div>'
    );
  }

  // Bygg hela HTML:en ur /me-svaret (rent, testbart).
  function renderFromMe(meResponse, opts) {
    var loginUrl = opts && opts.loginUrl;
    if (meResponse && meResponse.authenticated) {
      return renderLoggedIn(meResponse.offer || {});
    }
    return renderLoggedOut(loginUrl);
  }

  // Härled magisk token ur URL:en (/portal-chat/<token> eller ?token=).
  function tokenFromLocation(loc) {
    if (!loc) return '';
    var m = String(loc.pathname || '').match(/\/portal-chat\/([^/?#]+)/);
    if (m) return decodeURIComponent(m[1]);
    try {
      var q = new URLSearchParams(loc.search || '');
      return q.get('token') || '';
    } catch (e) {
      return '';
    }
  }

  function loginUrlFor(token) {
    if (!token) return '';
    var url = '/api/v1/cco-portal/bankid/login?token=' + encodeURIComponent(token);
    if (/iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '')) {
      url += '&flow=qr';
    }
    return url;
  }

  async function fetchMe() {
    try {
      var res = await fetch('/api/v1/cco-portal/me', {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return { authenticated: false };
      return await res.json();
    } catch (e) {
      return { authenticated: false };
    }
  }

  var STYLE_ID = 'cco-portal-level2-styles';
  var CSS =
    '.l2-panel{display:flex;flex-direction:column;gap:12px}' +
    '.l2-card{background:#fff;border:1px solid rgba(43,37,31,.1);border-radius:14px;' +
    'padding:14px 16px;box-shadow:0 4px 16px rgba(43,37,31,.06)}' +
    '.l2-muted{color:rgba(70,60,50,.62)}' +
    '.l2-kicker{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;' +
    'color:#8a8174;margin-bottom:4px}' +
    '.l2-title{font-size:16px;font-weight:800;letter-spacing:-.01em}' +
    '.l2-row{font-size:13px;margin-top:6px}' +
    '.l2-status{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:999px;' +
    'font-size:11px;font-weight:800;background:rgba(74,130,104,.12);color:#4a8268}' +
    '.l2-status--cooling_off{background:rgba(200,130,30,.14);color:#c8821e}' +
    '.l2-status--preparing{background:rgba(43,37,31,.07);color:rgba(70,60,50,.62)}' +
    '.l2-btn{display:inline-block;margin-top:10px;padding:9px 16px;border-radius:999px;border:none;' +
    'background:linear-gradient(135deg,#4a8268,#2e5a47);color:#fff;font-size:13px;font-weight:700;' +
    'text-decoration:none;cursor:pointer}' +
    '.l2-bookings{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}' +
    '.l2-booking{display:flex;justify-content:space-between;gap:10px;font-size:12px;' +
    'padding:7px 0;border-bottom:1px solid rgba(43,37,31,.08)}' +
    '.l2-booking:last-child{border-bottom:none}';

  function ensureStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  async function mount(el) {
    if (!el) return;
    ensureStyles();
    var token = tokenFromLocation(window.location);
    var me = await fetchMe();
    el.innerHTML = renderFromMe(me, { loginUrl: loginUrlFor(token) });
  }

  function init() {
    var el = document.querySelector('[data-cco-portal-level2]');
    if (el) mount(el);
  }

  var api = {
    renderOffer: renderOffer,
    renderJournal: renderJournal,
    renderBookings: renderBookings,
    renderFromMe: renderFromMe,
    renderLoggedOut: renderLoggedOut,
    tokenFromLocation: tokenFromLocation,
    loginUrlFor: loginUrlFor,
    mount: mount,
  };

  if (typeof window !== 'undefined') {
    window.ccoPortalLevel2 = api;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
