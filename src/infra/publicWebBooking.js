'use strict';

/**
 * Publik webb-bokning (hairtpclinic.com → Arcana).
 * Av som standard tills CCO-bokning är redo — se .cursor/rules/website-booking-policy.mdc
 */
function isPublicWebBookingEnabled() {
  const normalized = String(process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED || 'false')
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
