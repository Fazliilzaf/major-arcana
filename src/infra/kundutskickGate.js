'use strict';

/**
 * ORD-184 — hård spärr mot utskick till kund.
 *
 * Ägaren 2026-09-03: "vi kan köra på med alla installationer och
 * implementering men det får inte skickas någon info till någon kund."
 *
 * VARFÖR DET BEHÖVDES EN TILL GRIND. Mätt samma dag: `CCO_SEND_LIVE=false`
 * grindar offerter, utskick, SMS-puffar och portalnotiser — men INTE
 * bokningsbekräftelser. Kedjan för dem är
 *
 *   bekräfta bokning
 *     → toggles.automaticBookingConfirmation (default TRUE)
 *     → transactionalMailer.sendEmail
 *     → Resend (ej konfigurerad) → Graph (ARCANA_GRAPH_SEND_ENABLED=true)
 *     → skickat
 *
 * `CCO_SEND_LIVE` finns inte i den kedjan. Det är medvetet byggt — filhuvudet i
 * transactionalMailer säger rent ut att bekräftelser ska fungera utan Resend —
 * men det betyder att i samma sekund CCO tar emot en riktig bokning går det ut
 * mail till en riktig kund, utan att någon slagit på något.
 *
 * Ingenting har gått ut hittills. Men det beror på att CCO knappt har några
 * bokningar, inte på att något hindrar det. Noll bokningsbekräftelser i
 * audit-loggen. Omständighet, inte skydd.
 *
 * FAIL-CLOSED, OCH MOTTAGARTYPEN MÅSTE DEKLARERAS.
 *
 * Grinden frågar inte "är det här en kund?" — den frågar "har någon intygat att
 * det INTE är det?". Ett utskick som inte säger `audience: 'staff'` behandlas
 * som kundutskick och blockeras.
 *
 * Skälet är att den motsatta designen inte går att lita på. Att gissa
 * mottagartyp ur adressen kräver en lista över personalens adresser, och den
 * listan blir fel den dagen någon anställs. Att i stället grinda varje
 * anropsställe kräver att jag hittar alla tretton — och att nästa person hittar
 * det fjortonde. Fail-closed på ett ställe kräver ingetdera: en ny sändväg är
 * blockerad tills någon aktivt märker den.
 *
 * ATT SLÅ PÅ ÄR ETT MEDVETET BESLUT: ARCANA_KUNDUTSKICK_ENABLED=true.
 * Default av. Läses per anrop, så prod-konfig alltid vinner över det som
 * råkade gälla vid uppstart.
 */

/** Mottagartyper som INTE är kund. Allt annat är kund. */
const EJ_KUND = new Set(['staff', 'ops', 'internal']);

function arKundutskickPa(env = process.env) {
  const varde = String(env.ARCANA_KUNDUTSKICK_ENABLED || '')
    .trim()
    .toLowerCase();
  return varde === '1' || varde === 'true' || varde === 'yes';
}

/**
 * @param {string} audience  'staff' | 'ops' | 'internal' | 'customer' | undefined
 * @returns {{blockerat: boolean, skal: string}}
 */
function bedomKundutskick(audience, env = process.env) {
  const typ = String(audience || '')
    .trim()
    .toLowerCase();
  if (EJ_KUND.has(typ)) return { blockerat: false, skal: '' };
  if (arKundutskickPa(env)) return { blockerat: false, skal: '' };
  return {
    blockerat: true,
    skal: typ
      ? `kundutskick_avstangt (audience: ${typ})`
      : 'kundutskick_avstangt (audience saknas — behandlas som kund)',
  };
}

module.exports = { arKundutskickPa, bedomKundutskick, EJ_KUND };
