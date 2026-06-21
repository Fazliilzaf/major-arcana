/**
 * V11-RAIL Fas 3 — data-adapter-lager.
 *
 * Per canon §5: varje sektion får en egen data-adapter som exponerar ett
 * rent input/output-kontrakt mellan live-datakällor (bcard, extras,
 * gateSignals, bookings ...) och renderaren i cco-v11-rail.js.
 *
 * Block 1: A Profile (buildProfileFromBcard).
 * Block 2: B Smart information (buildSmartInfoFromSignals).
 * Block 3: C Stats (buildStatsFromExtras).
 */
(function (global) {
  'use strict';

  function toArray(x) {
    return Array.isArray(x) ? x : x ? [x] : [];
  }

  function text(v) {
    if (v == null) return '';
    return typeof v === 'string' ? v.trim() : String(v);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initials(name) {
    var p = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return ((p[0] || '')[0] || '?') + ((p[1] || '')[0] || '');
  }

  /**
   * Konsekvent empty-state-markup för en sektion (canon §5:
   * "Missing data produces an explicit empty state, not a layout compromise").
   * section/hint escapas alltid — det är en gemensam helper som kan få riktig
   * data senare och får aldrig kunna injicera HTML.
   */
  function v11RailEmpty(section, hint) {
    var label = esc(section ? String(section) : 'Sektion');
    var sub = hint ? '<div class="v11-rail__empty-hint">' + esc(hint) + '</div>' : '';
    return (
      '<div class="v11-rail__empty" role="status" data-v11-rail-section="' +
      label +
      '">' +
      '<div class="v11-rail__empty-title">Ingen data</div>' +
      sub +
      '</div>'
    );
  }

  /**
   * A · Profile — bygger profil-data från bcard (Pipedrive person/org-dossier
   * mergad med card). Returnerar ren data; renderaren escapar/HTML-ar.
   *
   * Pills byggs ENDAST från riktiga fält (canon §6 A: "if tags are missing,
   * show no fake pills"). Inga platshållar-pills.
   *
   * @param {object} bcard
   * @returns {{name:string, initials:string, phone:string, email:string,
   *            addrLine:string, pills:Array<{label:string,tone:string}>}}
   */
  function buildProfileFromBcard(bcard) {
    bcard = bcard || {};
    var name = text(bcard.displayName) || text(bcard.name) || text(bcard.fullName) || 'Kund';
    var phone = text(bcard.primaryPhone) || text(bcard.contact && bcard.contact.phone);
    var email = text(bcard.primaryEmail) || text(bcard.contact && bcard.contact.email);
    var addr = bcard.contact && bcard.contact.address;
    var addrLine = addr
      ? [text(addr.street), [text(addr.zip), text(addr.city)].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ')
      : '';

    var pills = [];
    if (bcard.vip || (bcard.tags && bcard.tags.vip)) {
      pills.push({ label: 'VIP', tone: 'vip' });
    }
    toArray(bcard.treatmentTypes).forEach(function (t) {
      var label = text(t);
      if (label) pills.push({ label: label, tone: 'treatment' });
    });
    // Fri-form etiketter om de finns som sträng-array (riktig data, ej fejk).
    toArray(bcard.tags && bcard.tags.labels).forEach(function (t) {
      var label = text(t);
      if (label) pills.push({ label: label, tone: 'label' });
    });

    return {
      name: name,
      initials: initials(name),
      phone: phone,
      email: email,
      addrLine: addrLine,
      pills: pills,
    };
  }

  /**
   * B · Smart information — bygger en sammanfattning från kundens
   * automation-signaler via logik-lagret CcoKunderSmartNextStep (canon §6 B:
   * "one clear primary signal plus concise supporting metadata").
   *
   * Endast riktig data: topp-aktiv signal (what/why/next) eller, om ingen
   * aktiv signal finns, en meningsfull step-label. Returnerar null när inget
   * finns → renderaren visar explicit empty-state (ingen fejk).
   *
   * @param {object} card - kund-readout med automationSignals/automationTop
   * @returns {null|{primary:string, why:string, next:string,
   *                  approvalRequired:boolean, confidence:string, moreCount:number}}
   */
  function buildSmartInfoFromSignals(card) {
    card = card || {};
    var mod = global.CcoKunderSmartNextStep;
    var raw = toArray(card.automationSignals);
    var signals = mod && typeof mod.sortSignals === 'function' ? mod.sortSignals(raw) : raw;
    var active = signals.filter(function (s) {
      return s && s.status === 'active';
    });
    var top = active[0] || null;

    if (top && text(top.what)) {
      return {
        primary: text(top.what),
        why: text(top.why),
        next: text(top.next),
        approvalRequired: !!top.humanApprovalRequired,
        confidence: text(top.confidence),
        moreCount: Math.max(0, active.length - 1),
      };
    }

    var label =
      mod && typeof mod.listStepLabel === 'function'
        ? mod.listStepLabel(card)
        : text(card.nextStep) || text(card.nextRequirement);
    label = text(label);
    if (label && label !== '—') {
      return {
        primary: label,
        why: '',
        next: '',
        approvalRequired: false,
        confidence: '',
        moreCount: 0,
      };
    }
    return null;
  }

  /**
   * C · Stats — tre nyckeltal: BESÖK, VÄRDE TOT, SKULD (canon §6 C).
   *
   * - BESÖK: visits/visitCount/stats.visits.
   * - VÄRDE TOT: nuvarande revenue/LTV-logik (lifetimeValueLabel →
   *   lifetimeValue/dealValue/pipedriveDealValue → stats.revenue).
   * - SKULD: outstandingBalance (debt/öppna fakturor) OM data finns. Saknas
   *   fältet helt → explicit unknown-state ('—', 'okänd'); ingen fejkad skuld.
   *   '0 kr'/0 är riktig data = ingen skuld.
   *
   * @param {object} bcard
   * @returns {{besok:{value:string,sub:string},
   *            vardeTot:{value:string,sub:string},
   *            skuld:{value:string,sub:string,unknown:boolean,hasDebt:boolean}}}
   */
  function buildStatsFromExtras(bcard) {
    bcard = bcard || {};
    var stats = bcard.stats || {};

    // BESÖK
    var visits = bcard.visits != null ? bcard.visits : bcard.visitCount;
    if (visits == null) visits = stats.visits;
    var besok = {
      value: visits != null ? String(visits) : '—',
      sub: visits != null ? 'totalt' : 'inga än',
    };

    // VÄRDE TOT (revenue/LTV)
    var ltvRaw = bcard.lifetimeValue != null ? bcard.lifetimeValue : bcard.dealValue;
    if (ltvRaw == null) ltvRaw = bcard.pipedriveDealValue;
    var ltvNum = Number(ltvRaw);
    var revenue =
      text(bcard.lifetimeValueLabel) ||
      (Number.isFinite(ltvNum) && ltvNum > 0 ? ltvNum.toLocaleString('sv-SE') + ' kr' : '') ||
      text(stats.revenue);
    var vardeTot = {
      value: revenue || '—',
      sub: revenue ? 'LTV' : 'okänt',
    };

    // SKULD (debt / öppna fakturor) — ingen fejk vid saknad data
    var rawDebt = bcard.outstandingBalance;
    var skuld;
    if (rawDebt == null || text(rawDebt) === '') {
      skuld = { value: '—', sub: 'okänd', unknown: true, hasDebt: false };
    } else {
      var debtStr = text(rawDebt);
      var debtNum = Number(
        String(debtStr)
          .replace(/[^\d.,-]/g, '')
          .replace(/\s/g, '')
          .replace(',', '.')
      );
      var isZero = debtStr === '0 kr' || debtNum === 0;
      skuld = {
        value: debtStr,
        sub: isZero ? 'ingen skuld' : 'utestående',
        unknown: false,
        hasDebt: Number.isFinite(debtNum) && debtNum > 0,
      };
    }

    return { besok: besok, vardeTot: vardeTot, skuld: skuld };
  }

  global.CcoV11RailAdapters = {
    v11RailEmpty: v11RailEmpty,
    buildProfileFromBcard: buildProfileFromBcard,
    buildSmartInfoFromSignals: buildSmartInfoFromSignals,
    buildStatsFromExtras: buildStatsFromExtras,
    // Block 4+ section adapters registreras här.
  };
})(typeof window !== 'undefined' ? window : global);
