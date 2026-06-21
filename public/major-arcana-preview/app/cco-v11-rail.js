/**
 * V11-RAIL Fas 3 — renderer.
 *
 * Ren `.v11-rail__*`-renderare utan beroende på legacy .kkref / .cr-v10 /
 * v9/v10-override-klasser (canon §5). Enda legacy-kontaktpunkten är
 * mount-switchen i patient-master-ui.js som väljer denna renderare när
 * ?v11rail=on och matar in { card, bcard, ... }.
 *
 * Block 1: endast A Profile. B/C/V och övriga sektioner tillkommer i
 * efterföljande block.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * A · Profile — amber kicker, identitet (avatar + namn + kontakt),
   * pills (endast riktig data) och edit-action.
   * @param {object} profile - output från CcoV11RailAdapters.buildProfileFromBcard
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderProfile(profile) {
    if (!profile) return '';

    var contact = '';
    if (profile.phone) {
      contact +=
        '<a class="v11-rail__contact" href="tel:' +
        esc(String(profile.phone).replace(/[^\d+]/g, '')) +
        '">📞 ' +
        esc(profile.phone) +
        '</a>';
    }
    if (profile.email) {
      contact +=
        (profile.phone ? '<span class="v11-rail__sep" aria-hidden="true">·</span>' : '') +
        '<a class="v11-rail__contact" href="mailto:' +
        esc(profile.email) +
        '">✉ ' +
        esc(profile.email) +
        '</a>';
    }

    var addr = profile.addrLine
      ? '<div class="v11-rail__addr">📍 ' + esc(profile.addrLine) + '</div>'
      : '';

    var pills =
      profile.pills && profile.pills.length
        ? '<div class="v11-rail__pills">' +
          profile.pills
            .map(function (pill) {
              return (
                '<span class="v11-rail__pill" data-tone="' +
                esc(pill.tone) +
                '">' +
                esc(pill.label) +
                '</span>'
              );
            })
            .join('') +
          '</div>'
        : '';

    return (
      '<section class="v11-rail__profile" aria-label="Profil">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">KUNDDOSSIÉR</div>' +
      '<div class="v11-rail__identity">' +
      '<div class="v11-rail__avatar" aria-hidden="true">' +
      esc(profile.initials) +
      '</div>' +
      '<div class="v11-rail__id-main">' +
      '<div class="v11-rail__name">' +
      esc(profile.name) +
      '</div>' +
      (contact ? '<div class="v11-rail__contact-row">' + contact + '</div>' : '') +
      addr +
      '</div>' +
      '<button type="button" class="v11-rail__edit" data-v11-rail-edit-profile aria-label="Redigera profil">✎ Redigera</button>' +
      '</div>' +
      pills +
      '</section>'
    );
  }

  /**
   * Renderar V11-rail-innehåll för en kund.
   * @param {object} [ctx] - { card, bcard, journalEntries, occasionTimeline, driveFiles, patient, tab, lite }
   * @returns {string} inner-HTML i .v11-rail__*-namespace
   */
  function render(ctx) {
    ctx = ctx || {};
    var adapters = global.CcoV11RailAdapters;
    if (!adapters || typeof adapters.buildProfileFromBcard !== 'function') return '';
    var bcard = ctx.bcard || ctx.card || {};
    // Block 1: endast A Profile.
    return renderProfile(adapters.buildProfileFromBcard(bcard));
  }

  global.CcoV11Rail = {
    BLOCK: 1,
    esc: esc,
    renderProfile: renderProfile,
    render: render,
  };
})(typeof window !== 'undefined' ? window : global);
