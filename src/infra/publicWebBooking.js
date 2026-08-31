'use strict';

/**
 * Publik webb-bokning (hairtpclinic.com → Arcana).
 * Av som standard tills CCO-bokning är redo — se .cursor/rules/website-booking-policy.mdc
 *
 * ORD-155 §2: den HÄR funktionen är den enda avläsningen av flaggan. `config.js`
 * importerar den i stället för att tolka env själv. Tidigare fanns två svar på
 * samma fråga — config.js defaultade till `true`, den här filen till `false` —
 * och vilket som gällde berodde på vem som frågade. Lägg aldrig till en tredje.
 */
function isPublicWebBookingEnabled(env = process.env) {
  const normalized = String(env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function publicWebBookingDisabledBody() {
  return {
    ok: false,
    error: 'public_web_booking_disabled',
    message:
      'Webbbokning via Arcana/CCO är avstängd tills CCO-bokning är redo. Ingen Cliento-koppling på hemsidan.',
  };
}

module.exports = {
  isPublicWebBookingEnabled,
  publicWebBookingDisabledBody,
};
