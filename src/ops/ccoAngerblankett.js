'use strict';

/**
 * Konsumentverkets ångerblankett — "bilaga 3" i behandlingsavtalen.
 *
 * Avtalstexten säger: "Patienten kan även använda sig av standardformulär, se
 * bilaga 3." Nordbros jurist Gabrielle Handler bekräftade 2026-09-01 att
 * blanketten är Konsumentverkets, och pekade ut adressen nedan.
 *
 * Adressen låg tidigare hårdkodad på två ställen — ccoTreatmentAgreementStore
 * och ccoTreatmentAgreementDocument — och pekade på
 * konsumentverket.se/for-foretag/... som svarar **404**. Mätt 2026-09-01. En
 * patient som klickade för att utöva sin ångerrätt fick alltså en felsida, i
 * ett dokument som hänvisar till blanketten tre gånger.
 *
 * Två lärdomar sitter i den här filen:
 *
 *   Konstanten bor på ETT ställe. Två kopior betyder att någon rättar den ena.
 *
 *   En länk i ett juridiskt dokument är inte statisk text. Myndigheter flyttar
 *   sidor. scripts/check-angerblankett-link.js kontrollerar att adressen
 *   fortfarande svarar 200 — den körs på schema, inte vid varje commit, för att
 *   ett testbygge inte ska falla på att Konsumentverket har driftstopp.
 *
 * Ångerrätten hör till distansavtal (distansavtalslagen 2005:59, fjorton
 * dagar). Den ska inte förväxlas med betänketiden, som är två eller sju dagar
 * enligt lag 2021:363 och gäller behandlingen oavsett var avtalet tecknas —
 * se ccoCoolingOffPolicy.
 */
const ANGER_BLANKET_URL =
  'https://publikationer.konsumentverket.se/mallar-och-blanketter/angerblankett';

module.exports = { ANGER_BLANKET_URL };
