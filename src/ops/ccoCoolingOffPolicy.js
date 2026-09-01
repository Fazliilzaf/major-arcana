'use strict';

/**
 * Betänketid enligt lag 2021:363 — hur lång, och varför.
 *
 * Ersätter `ccoHairTpCoolingOffPolicy`, som hette efter ett varumärke och
 * därmed hade fel axel. Lagen skiljer på INGREPPSTYP, inte på klinik:
 *
 *   kirurgiskt ingrepp        sju (7) dagar
 *   injektionsbehandling      två (2) dagar
 *
 * Ögonlocksplastik utförs på Curatiio och är kirurgi. Den gamla modulen gav
 * den två dagar, samma som en botoxspruta, eftersom den bara kunde en siffra.
 * Avtalet patienten signerar har sagt sju sedan ORD-157 §2 — mätt teckenidentiskt
 * mot Nordbros källfil. Systemet sa två. ORD-159.
 *
 * Betänketid är inte ångerrätt. Ångerrätten är fjorton dagar enligt
 * distansavtalslagen (2005:59) och lever i avtalstexten, inte här.
 */

const { harledGrupp } = require('./ccoServiceDocumentMap');

/** Behandlingsgrupper som är kirurgi i lagens mening. */
const KIRURGISKA_GRUPPER = Object.freeze(['ogonlocksplastik', 'uppfoljning_op']);

const DAGAR_KIRURGI = 7;
const DAGAR_OVRIGT = 2;

/**
 * Env-override finns kvar för det operativa fönstret, men kan aldrig sänka
 * kirurgins sju dagar. Ett lagkrav hör inte hemma i en miljövariabel — och en
 * felsatt env ska inte kunna korta en betänketid som lagen sätter.
 */
const OVRIGT_DAGAR = (() => {
  const raw = Number(process.env.CCO_HAIR_TP_COOLING_OFF_DAYS);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 30) return Math.floor(raw);
  return DAGAR_OVRIGT;
})();

/**
 * @param {string|null} grupp från ccoServiceDocumentMap.harledGrupp
 *
 * Okänd grupp ger den korta tiden. Jag byggde först tvärtom — okänt som
 * kirurgi, fail-safe åt patientens håll — men det ändrade betänketiden för
 * varje ärende äldre än ORD-150, alltså alla utan `serviceId`. Fem dagars
 * försening på hårtransplantationer och injektioner som aldrig varit kirurgi.
 *
 * Ägarbeslut 2026-09-01: två dagar, som förut. Sju ges bara när vi VET att det
 * är kirurgi. Ett gammalt ögonlocksärende utan serviceId får därmed två dagar i
 * systemet — men signeras mot ett avtal som säger sju, och avtalet är det
 * bindande. Riskens storlek är känd och accepterad; den krymper till noll när
 * alla ärenden bär serviceId.
 */
function dagarForGrupp(grupp) {
  return KIRURGISKA_GRUPPER.includes(grupp) ? DAGAR_KIRURGI : OVRIGT_DAGAR;
}

/**
 * @param {{name?: string, category?: string}} tjanst rad ur cco-service-catalog
 * @returns {{dagar: number, grupp: string|null, kirurgi: boolean}}
 *
 * `kirurgi` säger om tjänsten ÄR kirurgi. En okänd tjänst är inte kirurgi och
 * får den korta tiden — se dagarForGrupp för varför.
 */
function betanketidForTjanst(tjanst) {
  const grupp = harledGrupp(tjanst || {});
  return {
    dagar: dagarForGrupp(grupp),
    grupp,
    kirurgi: KIRURGISKA_GRUPPER.includes(grupp),
  };
}

/**
 * Ärende utan serviceId — samma tid som förut.
 *
 * Ägarbeslut 2026-09-01. Se dagarForGrupp för avvägningen och för vad som
 * kvarstår som känd risk.
 */
function dagarForOkand() {
  return OVRIGT_DAGAR;
}

module.exports = {
  DAGAR_KIRURGI,
  DAGAR_OVRIGT: OVRIGT_DAGAR,
  KIRURGISKA_GRUPPER,
  dagarForGrupp,
  betanketidForTjanst,
  dagarForOkand,
};
