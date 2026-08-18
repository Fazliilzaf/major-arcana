'use strict';

/* Incident 2026-08-18 (fjärde och sista frysningen i serien #1410/#1411/#1412).
 *
 * Mönstret /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi fanns kopierat på elva
 * ställen i kodbasen och kördes överallt mot OAVKORTADE mailkroppar. Det är
 * kvadratiskt (O(n²)) på text som saknar '@': för varje startposition inuti en
 * obruten körning av tecken ur klassen [A-Z0-9._%+-] konsumerar `+` hela
 * körningen och backar sedan ett tecken i taget. Kostnaden blir
 * Σ(körningslängd²)/2.
 *
 * Uppmätt (Node 26, en obruten körning utan '@'):
 *     16 KB →   112 ms
 *     32 KB →   479 ms
 *     64 KB →  1817 ms
 *    128 KB →  7653 ms      (dubblad input = fyrdubblad tid)
 *  → 256 KB ≈  30 s, 512 KB ≈ 2 min, 1 MB ≈ 8 min
 *
 * I mail-ingestionen kördes detta två gånger per meddelande (resolveCounterparty
 * Email anropas både direkt i processRawMessage och via matchPatientOrEntity),
 * vilket låste event-loopen totalt: inga loggar, inga timers, ingen exception —
 * Render-hälsokollen (5s) föll och instansen tvångsstartades om. Kön fastnade på
 * samma tre meddelanden eftersom save() aldrig nåddes, så exakt samma
 * innehåll triggade exakt samma frysning vid varje försök.
 *
 * Text som producerar långa körningar utan '@' och som ÖVERLEVER
 * HTML-strippning: procent-kodade URL:er (% ingår i klassen), base64url-tokens
 * (- och _ ingår), långa ____/---- avdelare, CSS/<style>-innehåll.
 *
 * Fixen: bind kvantifierarna till RFC 5321:s faktiska gränser (lokaldel max 64
 * tecken, domän max 255). Då blir backtrackingen per startposition konstant
 * istället för obegränsad, dvs. linjärt totalt:
 *     128 KB → 17 ms (från 7653 ms), 2 MB → 272 ms
 * Verifierat teckenmässigt ekvivalent med det gamla mönstret på giltiga
 * adresser — endast adresser som redan bryter mot RFC:s längdgränser (och
 * därmed inte är riktiga adresser) matchas inte längre.
 *
 * Använd ALLTID dessa helpers istället för att skriva mönstret på nytt.
 */

// Bunden lokaldel (RFC 5321 §4.5.3.1.1: max 64) och domän (max 255).
// Toppdomänen bunden till 24 tecken (längsta existerande TLD är 24 tecken).
const EMAIL_ADDRESS_SOURCE = '[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\\.[A-Z]{2,24}';

/**
 * Ny RegExp varje anrop — /g-regexar är tillståndsbärande (lastIndex), så en
 * delad instans får aldrig återanvändas mellan anropare.
 *
 * @param {string} flags
 * @returns {RegExp}
 */
function emailAddressRegExp(flags = 'gi') {
  return new RegExp(EMAIL_ADDRESS_SOURCE, flags);
}

/**
 * Alla e-postadresser i en text. Returnerar alltid en array.
 *
 * @param {unknown} text
 * @returns {string[]}
 */
function findEmailAddresses(text) {
  if (typeof text !== 'string' || !text) return [];
  return text.match(emailAddressRegExp('gi')) || [];
}

module.exports = {
  EMAIL_ADDRESS_SOURCE,
  emailAddressRegExp,
  findEmailAddresses,
};
