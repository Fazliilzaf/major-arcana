'use strict';

/**
 * Den kanoniska publika origin för Arcana.
 *
 * EN källa. Före ORD-86 fanns strängen `https://arcana.hairtpclinic.se`
 * hårdkodad på ~84 ställen som fallback när config saknades. Redirecten
 * .se -> .com döljer felet i en webbläsare, men inte för:
 *
 *   - curl utan -L (301 i stället för svar)
 *   - curl MED -L över värdgräns (Authorization-headern släpps)
 *   - mailklienter, som sällan följer redirects för bilder
 *
 * Det sista är kundvänt och tyst: en signaturbild som pekar på legacy visas
 * inte alls hos mottagaren, och ingen operatör märker det.
 *
 * INGA IMPORTER HÄR. Filen läses av både brandConfig och
 * resolveLegacyHostRedirectUrl, och en import åt något håll hade gett en
 * cirkel.
 *
 * OBS: det här är inte samma sak som domänIGENKÄNNING. `.se` måste finnas kvar
 * i redirect-tabellen och i brandConfig.domains — annars slutar den gamla
 * värden att fungera för de patienter som har länkar kvar i sin inkorg.
 * tests/config/legacyHostRedirect.test.js skyddar det.
 */
const CANONICAL_PUBLIC_ORIGIN = 'https://arcana.hairtpclinic.com';

module.exports = { CANONICAL_PUBLIC_ORIGIN };
