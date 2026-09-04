'use strict';

/**
 * ORD-200 — kundresans steg, räknat på ETT ställe.
 *
 * PROBLEMET. Samma kund visade "STEG 1 AV 13" i lådan och "STEG 4 AV 13" i
 * kundkortet, med olika kritiska varningar. Det var inte ett fel utan tre
 * uträkningar av samma tal:
 *
 *   buildJourneyFromState()   cur: activeStep || null     total: steps.length
 *   polishReferensJourney()   cur: ... ?? doneCount       total: 9 (hårdkodat)
 *   journeyMini() / hero()    cur saknas → 0 resp. null   total: två källor
 *
 * Den värsta var `doneCount`. Saknades ett aktivt steg visades ANTALET
 * AVKLARADE steg i stället — och det är ett annat tal. Abbes hälsodeklaration
 * var signerad, alltså ett steg klart, och skärmen skrev "steg 1". Sant om
 * något helt annat än det den påstod sig beskriva.
 *
 * VARFÖR SERVERN. Vyerna räknade var för sig på det underlag de råkade ha.
 * Lådan får en tunnare kontext än kortet, och mindre bevis gav ett annat svar.
 * Servern har hela underlaget oavsett vem som frågar — journal, dokument,
 * bokningar, signaler. Räknar den, kan ingen vy räkna på halva bevis, och en
 * fallback kan inte längre byta matematik i tysthet.
 *
 * STEGEN STÅR INTE HÄR. De ligger i config/kundresan-13-steg.json. Att skriva
 * av dem hit hade gjort en FJÄRDE definition av samma sak — precis felet den
 * här filen finns för att åtgärda.
 */

const FACIT = require('../../config/kundresan-13-steg.json');

const STEG = Array.isArray(FACIT.steg) ? FACIT.steg : [];
const VARIANTER = FACIT.varianter || {};

/** `okand` finns för att `null` och 0 inte får betyda samma sak. */
const STATUS = Object.freeze({
  KLAR: 'klar',
  AKTIV: 'aktiv',
  VANTAR: 'vantar',
  HOPPAT: 'hoppat',
});

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function harSignal(signaler, ruleId) {
  if (!ruleId) return false;
  return (Array.isArray(signaler) ? signaler : []).some((s) => {
    const id = text(s && (s.ruleId || s.id || s));
    // Registret prefixar med 'customer.' — jämför båda formerna.
    return id === ruleId || id === `customer.${ruleId}`;
  });
}

/**
 * Vilken väg genom stegen kunden går. Behandlingen avgör, inte kliniken.
 *
 * SPÄRR (ORD-129): Curatiio är inte synonymt med icke-kirurgiskt.
 * Ögonlocksplastik är kirurgi och ska ha minorSurgery — annars hoppas steg 8
 * friskförsäkran över på ett ingrepp som kräver den.
 */
function valjVariant(input = {}) {
  const uttalad = text(input.pathVariant);
  if (uttalad && VARIANTER[uttalad]) return uttalad;

  const typer = (Array.isArray(input.treatmentTypes) ? input.treatmentTypes : [])
    .map((t) => text(t).toLowerCase())
    .filter(Boolean);
  const alla = typer.join(' ');

  if (/ögonlock|ogonlock|bleph|kirurg|operation/.test(alla)) return 'minorSurgery';
  if (/prp|microneedl|botox|filler|profhilo/.test(alla)) return 'nonSurgical';
  return 'hairTP';
}

/**
 * Är steget avklarat? Härlett ur kortets fält och signaler — aldrig ur en
 * lagrad flagga, eftersom en skriven sanning blir osann när verkligheten rör
 * sig.
 */
function stegKlart(steg, k) {
  switch (steg.steg) {
    case 1:
      return Boolean(k.bookingCount > 0 || k.hasUpcomingBooking || k.lastBookingAt);
    case 2:
      return Boolean(k.bookingConfirmationSentAt || k.bookingCount > 0);
    case 3:
      return Boolean(
        k.hasHealthDeclaration === true ||
        (k.healthDeclaration && (k.healthDeclaration.signedAt || k.healthDeclaration.signed))
      );
    case 4:
      return k.hasJournal === true || Boolean(k.lastEncounterAt);
    case 5:
      return k.hasTreatmentPlan === true || Boolean(k.offerSentAt);
    case 6:
      return k.coolingOffPassed === true;
    case 7:
      return k.hasAgreement === true || k.agreementSigned === true;
    case 8:
      return (
        k.hasFitnessCertificate === true ||
        k.fitnessSigned === true ||
        Boolean(k.fitnessCertificate && k.fitnessCertificate.signedAt)
      );
    case 9:
      return k.hasPhotoConsent === true || k.missingPhotoConsent === false;
    case 10:
      return k.treatmentDone === true || Boolean(k.lastTreatmentAt);
    case 11:
      return k.depositPaid === true || text(k.depositStatus).toLowerCase() === 'paid';
    case 12:
      return k.followUpComplete === true || Number(k.followUpCount) > 0;
    case 13:
      return k.hasPublishConsent === true || Boolean(k.finalResultAt);
    default:
      return false;
  }
}

/**
 * Beräknar hela resan.
 *
 * @returns {{steg:number|null, av:number, aktivt:string, klara:number,
 *            procent:number, variant:string, lista:Array, kalla:string}}
 *          `steg: null` betyder VET INTE. Det är avsiktligt och får aldrig
 *          ersättas med ett tal som råkar finnas till hands.
 */
function beraknaKundresa(kort = {}, { signaler = [] } = {}) {
  const k = kort || {};
  const variant = valjVariant(k);
  const override = VARIANTER[variant] || {};
  const skipSteps = new Set(
    (Array.isArray(k.skipSteps) ? k.skipSteps : []).map((n) => Number(n)).filter(Boolean)
  );

  const lista = [];
  for (const def of STEG) {
    const o = override[String(def.steg)] || {};
    const hoppat = o.skip === true || skipSteps.has(def.steg);
    lista.push({
      steg: def.steg,
      titel: text(o.titel) || def.titel,
      nar: o.nar !== undefined ? o.nar : def.nar,
      not: text(o.note),
      gate: def.gate,
      gateOk: def.gateOk === true,
      ruleId: def.ruleId || '',
      status: hoppat ? STATUS.HOPPAT : STATUS.VANTAR,
      blockerad: false,
    });
  }

  // 1) klara
  for (const rad of lista) {
    if (rad.status === STATUS.HOPPAT) continue;
    if (stegKlart({ steg: rad.steg }, k)) rad.status = STATUS.KLAR;
  }

  // 2) blockerade — en aktiv signal betyder att steget saknar något
  for (const rad of lista) {
    if (rad.status === STATUS.KLAR || rad.status === STATUS.HOPPAT) continue;
    if (harSignal(signaler, rad.ruleId)) rad.blockerad = true;
  }

  // 3) aktivt steg = FÖRSTA som varken är klart eller överhoppat.
  //
  //    Här låg felet. Hittades inget aktivt steg föll de gamla vyerna tillbaka
  //    på doneCount — antalet avklarade — och visade det som aktuellt steg.
  //    Den här funktionen returnerar hellre null.
  const aktiv = lista.find((r) => r.status !== STATUS.KLAR && r.status !== STATUS.HOPPAT);
  if (aktiv) aktiv.status = STATUS.AKTIV;

  const raknade = lista.filter((r) => r.status !== STATUS.HOPPAT);
  const klara = raknade.filter((r) => r.status === STATUS.KLAR).length;

  return {
    // null = vet inte. Aldrig ett annat tal som ersättning.
    steg: aktiv ? aktiv.steg : null,
    // Nämnaren är antalet steg som FAKTISKT gäller den här kunden — inte 9,
    // och inte 13 när tre är överhoppade.
    av: raknade.length,
    aktivt: aktiv ? aktiv.titel : '',
    klara,
    procent: raknade.length ? Math.round((klara / raknade.length) * 100) : 0,
    variant,
    lista,
    kalla: 'server',
  };
}

module.exports = {
  beraknaKundresa,
  valjVariant,
  STEG,
  STATUS,
  ANTAL_STEG: STEG.length,
};
