'use strict';

/**
 * ORD-205 — vilken klinik kunden ska höra av sig till för att avboka.
 *
 * FUNKTIONEN FANNS REDAN, men låst inne i `bookingPublicActions.js`.
 * Avbokningssidan visade rätt uppgifter medan påminnelsemejlet inte visade
 * några alls. Två ytor som säger olika saker om samma sak är samma fel som
 * ORD-200 rättade för kundresans steg: en uträkning, båda läser den.
 *
 * VARFÖR DET SPELAR ROLL ATT DEN INTE FÅR VARA TOM. ORD-202 tog bort kundens
 * möjlighet att avboka själv. Enda vägen kvar är telefon eller mejl. Ett
 * meddelande som säger "hör av dig" utan att säga vart lämnar kunden med en
 * bokning hen inte kan bli av med — och kliniken med en uteblivning.
 *
 * Okänd eller saknad tenant faller därför tillbaka på Hair TP i stället för
 * att returnera null. Fel klinik går att ringa; ingen klinik gör det inte.
 */

const FACIT = require('../../config/avbokning-kontakt.json');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/**
 * @param {string|{tenantId?: string}} bookingEllerTenantId
 * @returns {{namn:string, epost:string, telefon:string, telefonVisas:string}}
 *   Aldrig null, aldrig tomt.
 */
function avbokningsKontakt(bookingEllerTenantId) {
  const kliniker = FACIT.kliniker || {};
  const id =
    typeof bookingEllerTenantId === 'string'
      ? normalizeText(bookingEllerTenantId)
      : normalizeText(bookingEllerTenantId && bookingEllerTenantId.tenantId);

  return kliniker[id] || kliniker[FACIT._standard] || kliniker['hair-tp-clinic'];
}

module.exports = { avbokningsKontakt, KONTAKTER: FACIT.kliniker };
