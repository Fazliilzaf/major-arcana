'use strict';

const { caseRequiresOrdination } = require('./ordinationRequirement');
const { klinikTidTillUtc, utcTillKlinikTid } = require('./klinikTid');

/**
 * ORD-180 — när ordinationen ska finnas.
 *
 * Ägaren 2026-09-03: "två veckor innan varje operationstillfälle, de ska ha en
 * ordination. Så allt annat ordinationer som är bakåt i tiden ska inte vara
 * med." Och: "Målet är inte att göra det för de kunder som har varit. Målet är
 * att göra det för kunder som är bokade framöver."
 *
 * BERÄKNAT, INTE SKRIVET. Frestelsen är ett schemalagt jobb som vid T−14
 * sätter ordinationReview.status = 'pending'. Det vore fel, av samma skäl som
 * en lagrad "aktiv"-flagga på en delegering är fel: skriver man ett tillstånd
 * en gång blir det osant så fort verkligheten rör sig. Kunden bokar om till
 * tre månader fram — den skrivna 'pending' ligger kvar och läkaren har en
 * post i kön för en operation som inte är nära. Bokas tiden i stället in med
 * tio dagars varsel hinner jobbet aldrig köra.
 *
 * En beräkning kan inte bli inaktuell. Den frågar klockan varje gång.
 *
 * `ordinationReview` skrivs alltjämt — men bara av en människa som fattar ett
 * beslut. Systemet skriver aldrig ett tillstånd åt läkaren.
 *
 * FEM LÄGEN, för att `null` och `nej` inte får se likadana ut:
 *
 *   ej_relevant   tjänsten kräver ingen ordination (beslutat nej)
 *   for_tidigt    mer än 14 dygn kvar — ingenting att göra ännu
 *   oppet         inom 14 dygn — beslutet ska finnas
 *   passerat      operationsdagen har varit
 *   okand_tid     kräver ordination men saknar tid — kan inte tidsättas
 */

/**
 * Fjorton dygn i timmar.
 *
 * SAMMA TAL som DEFAULT_DEPOSIT_RETENTION_HOURS i ccoBookingPolicy, och det är
 * ingen slump: efter T−14 täcker förskottet den reserverade tiden, alltså är
 * operationen i praktiken låst. Det är då ordinationen behövs.
 *
 * Men det är TVÅ BESLUT, inte ett. Ändrar kliniken återbetalningsvillkoren
 * till 21 dygn följer inte ordinationsfönstret automatiskt med — det ska vara
 * ett eget val. Därför en egen konstant, med ett test som säger till om de
 * skiljer sig åt så att någon får ta ställning i stället för att märka det i
 * efterhand.
 */
const ORDINATIONSFONSTER_TIMMAR = 14 * 24;

const FONSTER = Object.freeze({
  EJ_RELEVANT: 'ej_relevant',
  FOR_TIDIGT: 'for_tidigt',
  OPPET: 'oppet',
  PASSERAT: 'passerat',
  OKAND_TID: 'okand_tid',
});

function parseTid(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Slutet av operationsdagen, i klinikens tidszon.
 *
 * Klinikens tidszon och inte UTC, eftersom "operationsdagen" är ett svenskt
 * dygn för personalen som tittar i kön. På sommaren skiljer det två timmar.
 */
function slutetAvDagen(datum) {
  const vagg = utcTillKlinikTid(datum.toISOString());
  const iso = vagg?.datum ? klinikTidTillUtc(vagg.datum, '23:59') : null;
  // Faller tillbaka på starttiden om tidszonsräkningen inte går. Ett fönster
  // som stänger vid start är sämre men inte farligt; ett Invalid Date som
  // fortplantar sig tyst är värre.
  return iso ? new Date(iso) : datum;
}

/**
 * @param {object} caseRecord bokningsärendet
 * @param {Date|number} [nu]
 * @returns {{status: string, timmarKvar: number|null, oppnarAt: string|null,
 *            startsAt: string|null, kravsOrdination: true|false|null}}
 */
function bedomOrdinationsfonster(caseRecord = {}, nu = new Date()) {
  const kravsOrdination = caseRequiresOrdination(caseRecord);
  const start = parseTid(caseRecord.startsAt || caseRecord.scheduledAt);
  const tid = nu instanceof Date ? nu.getTime() : Number(nu);

  const bas = {
    kravsOrdination,
    startsAt: start ? start.toISOString() : null,
    timmarKvar: null,
    oppnarAt: null,
  };

  // Ett beslutat nej stänger frågan oavsett tid. `null` gör det INTE — en
  // oklassificerad tjänst är ett öppet beslut, inte ett nej.
  if (kravsOrdination === false) return { ...bas, status: FONSTER.EJ_RELEVANT };

  if (!start) return { ...bas, status: FONSTER.OKAND_TID };

  const timmarKvar = (start.getTime() - tid) / 3600000;
  const oppnarAt = new Date(start.getTime() - ORDINATIONSFONSTER_TIMMAR * 3600000).toISOString();
  const medTider = { ...bas, timmarKvar, oppnarAt };

  /**
   * Bakåt i tiden ska inte med. Ägarens ord, och rimligt: en ordination för en
   * operation som redan ägt rum är ingen uppgift, den är en journalfråga.
   *
   * MEN INTE VID STARTTIDEN. Första versionen stängde fönstret i samma sekund
   * operationen började. Konsekvensen: ett ingrepp som PÅGÅR utan godkänd
   * ordination försvann tyst ur läkarens kö, klockan 09:00:01. Det är den
   * farligaste minuten att gömma något.
   *
   * Fångat av ett befintligt test vars fixtur låg på "idag".
   *
   * Fönstret stänger därför när ingreppet är ÖVER:
   *   - `endsAt` när den finns (ORD-179 fyller i den vid bekräftelse)
   *   - annars vid slutet av operationsdagen, i klinikens tidszon
   *
   * Att låta dagen gå ut är inte exakt, men felar åt rätt håll: en post som
   * ligger kvar några timmar för länge kostar en blick, en som försvinner för
   * tidigt kostar en patient sitt godkännande.
   */
  const slut = parseTid(caseRecord.endsAt) || slutetAvDagen(start);
  if (slut.getTime() <= tid) return { ...medTider, status: FONSTER.PASSERAT };

  if (timmarKvar > ORDINATIONSFONSTER_TIMMAR) {
    return { ...medTider, status: FONSTER.FOR_TIDIGT };
  }
  return { ...medTider, status: FONSTER.OPPET };
}

/**
 * Ska ärendet ligga i läkarens ordinationskö nu?
 *
 * Öppet fönster ELLER okänd tid. Okänd tid räknas med av samma skäl som
 * `null` gör i mayRequireOrdination: en transplantation utan tid är inte ett
 * icke-problem, den är ett ärende ingen kan tidsätta. Att dölja den vore att
 * låta en lucka se ut som ett avklarat ärende.
 *
 * Ett redan godkänt ärende ligger kvar i fönstret — det är läkarens vy som
 * filtrerar på status, inte den här funktionen. Fönstret svarar på "är det
 * dags", inte på "är det gjort".
 */
function ordinationForfallen(caseRecord = {}, nu = new Date()) {
  const { status } = bedomOrdinationsfonster(caseRecord, nu);
  return status === FONSTER.OPPET || status === FONSTER.OKAND_TID;
}

/** Text för personalens vy. Ingen logik, bara ord. */
function fonsterEtikett(status) {
  switch (status) {
    case FONSTER.EJ_RELEVANT:
      return 'Ordination krävs inte';
    case FONSTER.FOR_TIDIGT:
      return 'Ordination behövs senare';
    case FONSTER.OPPET:
      return 'Ordination behövs nu';
    case FONSTER.PASSERAT:
      return 'Operationsdagen har varit';
    case FONSTER.OKAND_TID:
      return 'Tid saknas — går inte att tidsätta';
    default:
      return '';
  }
}

module.exports = {
  ORDINATIONSFONSTER_TIMMAR,
  FONSTER,
  bedomOrdinationsfonster,
  ordinationForfallen,
  fonsterEtikett,
};
