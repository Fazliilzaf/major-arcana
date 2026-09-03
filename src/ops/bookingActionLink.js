'use strict';

const crypto = require('node:crypto');

/**
 * ORD-190 — avboka- och omboka-länken.
 *
 * SIDORNA FANNS REDAN. `bookingPublicActions.js` har fyra fungerande routes:
 * GET/POST /avboka/:token och GET/POST /omboka/:token, med slot-picker och
 * atomiskt lås. Kommentaren i filen säger "TOKEN GENERATION (internal, called
 * by confirm-flow)".
 *
 * Ingenting anropade den. Ingen mall byggde någon länk. Fyra färdiga sidor som
 * ingen kund kunde nå.
 *
 * OCH TOKENEN FICK INTE SKICKAS SOM DEN VAR. Den härleddes:
 *
 *   sha256(bookingId + process.env.ARCANA_TOKEN_SALT || 'arcana-booking-salt')
 *
 * ARCANA_TOKEN_SALT är INTE satt i produktion — verifierat 2026-09-03. Saltet
 * var alltså literalen i källkoden. Vem som helst med kodbasen och ett
 * boknings-id kunde räkna fram avbokningslänken för den bokningen. Att sätta
 * den i ett mejl hade gjort svagheten till en distributionskanal.
 *
 * LAGRAD SLUMP I STÄLLET FÖR HÄRLEDNING. Token genereras en gång vid
 * bekräftelse, med 32 slumpbytes, och sparas på bokningen. Då finns ingen
 * hemlighet att gissa, inget salt som kan glömmas, och tokenen kan bytas ut för
 * en enskild bokning utan att röra någon annan.
 *
 * Jämförelsen är tidskonstant. En avbokningstoken är inte ett lösenord, men
 * skillnaden i kod är en rad och skillnaden i beteende är att man inte kan
 * gissa sig fram tecken för tecken.
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** 32 slumpbytes som hex. Genereras EN gång per bokning, aldrig igen. */
function nyBookingActionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Tidskonstant jämförelse. `timingSafeEqual` kastar på olika längd, så längden
 * kontrolleras först — det läcker bara längden, inte innehållet.
 */
function tokenMatchar(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y || x.length !== y.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(x), Buffer.from(y));
  } catch {
    return false;
  }
}

function basUrl(env = process.env) {
  return normalizeText(env.PUBLIC_BASE_URL || env.ARCANA_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

/**
 * Bygger länkarna för en bokning.
 *
 * @returns {{cancelUrl: string, rebookUrl: string}|null}
 *
 * NULL OM NÅGOT SAKNAS. Utan token eller bas-URL blir resultatet null, inte en
 * halv länk. En trasig avbokningslänk i ett mejl är värre än ingen: kunden
 * klickar, får ett fel, och ringer i tron att systemet tappat bokningen.
 */
function buildBookingActionLinks(booking = {}, env = process.env) {
  const token = normalizeText(booking.bookingActionToken);
  const bas = basUrl(env);
  if (!token || !bas) return null;
  return {
    cancelUrl: `${bas}/avboka/${token}`,
    rebookUrl: `${bas}/omboka/${token}`,
  };
}

module.exports = {
  nyBookingActionToken,
  tokenMatchar,
  buildBookingActionLinks,
};
