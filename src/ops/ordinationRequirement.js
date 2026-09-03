'use strict';

/**
 * ORD-177 — kräver den här tjänsten läkarordination?
 *
 * VAD SOM STOD HÄR FÖRUT, OCH VARFÖR DET INTE DUGDE.
 *
 * staffPortal.js avgjorde saken med en regex mot fritext:
 *
 *   /tp|transplant|hårtransplant|dhi|fue|lokalbedöv/
 *
 * körd mot serviceLabel + serviceId + treatmentType + treatment + procedure +
 * encounterType hopslaget. Den frågan är "nämns transplantation någonstans i
 * posten", inte "ger en sköterska lokalbedövning under delegering här".
 *
 * Konkreta falska träffar i dagens katalog:
 *   followup-transplant   "Uppföljning hårtransplantation"  → transplant
 *   legacy-cliento-31788  "TP uppföljning"                  → tp
 *   legacy-cliento-31782  "PRP efter TP"                    → tp
 *
 * Alla tre är efterkontroller. Ingen bedövning ges. Ändå hamnade de i
 * läkarens ordinationskö. En kö full av poster som inte hör hemma där är en
 * kö man slutar öppna — och då missas den som faktiskt behövde godkännas.
 *
 * TRE LÄGEN, INTE TVÅ.
 *
 * `true` och `false` betyder att kliniken tagit ställning. `null` betyder att
 * ingen gjort det. null får aldrig tolkas som false: ett okänt krav är ett
 * öppet beslut, inte ett nej. Anropande kod måste hantera alla tre.
 *
 * Samma resonemang som delegeringarnas TILLS_VIDARE. Hellre en synlig lucka
 * än ett tyst antagande.
 */

const FACIT = require('../../config/ordinationskravande-tjanster.json');

const KRAVER = new Set(Object.keys(FACIT.kraver || {}));
const KRAVER_INTE = new Set(Object.keys(FACIT.kraver_inte || {}));
const EJ_BESLUTAT = new Set(Object.keys(FACIT.ej_beslutat || {}));

/** Alla id:n som kliniken tagit ställning till, i endera riktningen. */
const BESLUTADE = new Set([...KRAVER, ...KRAVER_INTE]);

function normalisera(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {string} serviceId
 * @returns {true|false|null} null = kliniken har inte tagit ställning
 */
function serviceRequiresOrdination(serviceId) {
  const id = normalisera(serviceId);
  if (!id) return null;
  if (KRAVER.has(id)) return true;
  if (KRAVER_INTE.has(id)) return false;
  return null;
}

/** Skälet, för den som undrar varför. Tom sträng när inget skäl finns. */
function ordinationReason(serviceId) {
  const id = normalisera(serviceId);
  if (!id) return '';
  const value = FACIT.kraver?.[id] ?? FACIT.kraver_inte?.[id] ?? FACIT.ej_beslutat?.[id];
  if (Array.isArray(value)) return value.join(' ');
  return typeof value === 'string' ? value : '';
}

/**
 * Var ärendet bär sin tjänst.
 *
 * MÄTT, INTE ANTAGET — MEN FÖRST ÖVERTOLKAT. Rättat i ORD-179.
 *
 * 2026-09-03 låg 369 ärenden i /var/data/cco-booking.json i produktion. Inte
 * ett enda hade `serviceId`. Tjänsten stod i `requestedTreatment`, med
 * katalogens id:n:
 *
 *   92  consultation-online
 *   59  consultation-physical
 *   56  followup-transplant
 *   162 tomt
 *
 * Den gamla regexen läste serviceLabel + serviceId + treatmentType + treatment
 * + procedure + encounterType. `requestedTreatment` fanns inte i listan.
 *
 * JAG DROG SLUTSATSEN att regexen därmed "svarade nej på samtliga 369". Det
 * stämmer inte. De 369 ligger i ccoBookingStore — en ANNAN store, som
 * personalportalen aldrig läser. Portalen läser ccoBookingCaseStore, och den
 * var tom: cco-booking-cases.json fanns inte ens på disk.
 *
 * Regexen körde alltså på noll verkliga poster. Fältmätningen var riktig,
 * slutsatsen om konsekvensen var det inte.
 *
 * Rättelsen står kvar, och blir relevant nu. Från ORD-179 skapas ärenden vid
 * varje bekräftelse, med serviceId ifyllt. `requestedTreatment` läses fortsatt
 * som reserv — den kostar ingenting och täcker det fall någon broar ihop
 * storerna. Ett nej av okunskap ser likadant ut som ett nej av bedömning, och
 * det är det som gör det farligt oavsett hur många poster det gäller.
 *
 * Vi läser bara ID-fält. Aldrig etiketter. Etiketten var hela problemet.
 */
const ID_FALT = [
  (c) => c.serviceId,
  (c) => c.requestedTreatment,
  (c) => c.service?.id,
  (c) => c.booking?.serviceId,
  (c) => c.treatmentPlan?.serviceId,
];

function tjanstIdUr(caseRecord = {}) {
  for (const las of ID_FALT) {
    let id = '';
    try {
      id = normalisera(las(caseRecord));
    } catch {
      id = '';
    }
    if (id) return id;
  }
  return '';
}

/**
 * Kravet för ett bokningsärende.
 *
 * @returns {true|false|null}
 *   true  — tjänsten kräver ordination
 *   false — tjänsten kräver inte ordination, ELLER ingen tjänst är vald ännu
 *   null  — en tjänst ÄR vald, men kliniken har inte klassificerat den
 *
 * Om ingen tjänst är vald finns inget att ordinera. Kravet uppstår i samma
 * ögonblick som tjänsten sätts — inte innan. Att i stället returnera null för
 * de 162 tomma ärendena hade lagt dem alla i läkarens kö utan att en enda av
 * dem gick att ta ställning till.
 *
 * Det här är INTE grinden. Grinden körs mot en konkret bokning med ett
 * konkret serviceId inför ett konkret ingrepp. Den här funktionen sorterar en
 * arbetslista; den avgör inte om någon får opereras.
 */
function caseRequiresOrdination(caseRecord = {}) {
  const id = tjanstIdUr(caseRecord);
  if (id) return BESLUTADE.has(id) ? serviceRequiresOrdination(id) : null;

  // Inget id. Två helt olika situationer, och de får inte blandas ihop:
  //
  //   inget id OCH ingen behandlingstext  → inget är valt. false.
  //   inget id MEN en behandlingstext     → något ÄR valt, vi kan bara inte
  //                                         mappa det. null.
  //
  // Den andra raden är den viktiga. Ett ärende med serviceLabel
  // "Hårtransplantation" och tomt serviceId är inte ett ärende utan
  // behandling — det är ett ärende vars behandling vi inte lyckas läsa. Att
  // svara false där hade varit exakt samma sorts nej-av-okunskap som regexen
  // gav på 369 ärenden i produktion. Skillnaden är att det här nejet hade
  // gällt en transplantation.
  //
  // Texten används ALDRIG för att svara ja. Bara för att vägra svara nej.
  return harBehandlingstext(caseRecord) ? null : false;
}

const TEXT_FALT = [
  'serviceLabel',
  'treatmentType',
  'treatment',
  'procedure',
  'encounterType',
  'requestedTreatmentLabel',
];

function harBehandlingstext(caseRecord = {}) {
  return TEXT_FALT.some((falt) => normalisera(caseRecord[falt]).length > 0);
}

/**
 * För köer och listor: ska posten synas för läkaren?
 *
 * `null` räknas som ja — en vald men oklassificerad tjänst är ett öppet
 * beslut och ska synas. `false` räknas som nej, och omfattar både "beslutat
 * nej" och "ingen tjänst vald ännu".
 */
function mayRequireOrdination(caseRecord = {}) {
  return caseRequiresOrdination(caseRecord) !== false;
}

/** Stämplar flaggan på en tjänstepost i katalogen. */
function medOrdinationsflagga(service) {
  if (!service || typeof service !== 'object') return service;
  return {
    ...service,
    requiresOrdination: serviceRequiresOrdination(service.id),
    ordinationReason: ordinationReason(service.id) || undefined,
  };
}

module.exports = {
  serviceRequiresOrdination,
  caseRequiresOrdination,
  tjanstIdUr,
  mayRequireOrdination,
  ordinationReason,
  medOrdinationsflagga,
  KRAVER,
  KRAVER_INTE,
  EJ_BESLUTAT,
  FACIT,
};
