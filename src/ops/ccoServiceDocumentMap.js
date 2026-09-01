'use strict';

/**
 * Vilka dokument personalen fyller i för vilken tjänst.
 *
 * Svaren är ägarens, givna 2026-08-30 och nedskrivna i ORD-148. Alla 537 rutor
 * i arbetsbladet blev JA — men det är inte det som är innehållet. Innehållet är
 * journalmatchningen, där kolumnerna är ÖMSESIDIGT UTESLUTANDE: en botoxrad ska
 * bära `journal_estetik_botox`, inte alla tre. Sätter man JA i alla får
 * kundkortet tre journaler på en behandling.
 *
 * Regeln uttrycks per BEHANDLINGSGRUPP, inte per tjänst. De 84 tjänsterna
 * skiljer sig på storlek och pris — fem graftnivåer är fem gånger samma
 * pappersarbete. Grupperingen härleds mekaniskt ur tjänstens namn (se
 * `harledGrupp`), så en ny tjänst i katalogen hamnar rätt utan att någon
 * uppdaterar en lista för hand.
 *
 * Arbetsbladet `docs/workflow/underlag-per-tjanst-ARBETSBLAD.csv` är INTE
 * sanningskällan. Det står fortfarande med 537 frågetecken — svaren kom i en
 * order och skrevs aldrig tillbaka till CSV:n. Den här filen är källan.
 */

/** Dokument varje behandling bär, oavsett grupp. Ägarbeslut: JA överallt. */
const GRUND = Object.freeze([
  'konsultationsmall',
  'behandlingsplan_staff',
  'anteckningar_kort',
  'id_verifiering',
  'fore_efter_bildmall',
]);

/**
 * Per grupp: journalen och det som är specifikt för behandlingen.
 * Journalraderna är uteslutande — exakt en journal per grupp, utom ortopedin
 * där ägaren uttryckligen valde båda ("man kanske kan addera i samma journal").
 */
const PER_GRUPP = Object.freeze({
  transplantation_har: ['journal_tp', 'ordination_tp', 'ordination_recept'],
  transplantation_skagg: ['journal_tp', 'ordination_tp', 'ordination_recept'],
  transplantation_ogonbryn: ['journal_tp', 'ordination_tp', 'ordination_recept'],
  transplantation_arr: ['journal_tp', 'ordination_tp', 'ordination_recept'],

  uppfoljning_tp: [
    'journal_tp_post_prp',
    'journal_tp_follow_4',
    'journal_tp_follow_8',
    'journal_tp_follow_12',
  ],

  prp_har: ['journal_prp_multi'],
  prp_hud: ['journal_prp_multi'],
  microneedling: ['journal_prp_multi'],

  botox: ['journal_estetik_botox'],
  filler: ['journal_estetik_filler'],
  profhilo: ['journal_estetik_profhilo'],
  uppfoljning_estetik: ['journal_estetik_follow'],

  ogonlocksplastik: ['journal_estetik_op', 'ordination_recept'],
  uppfoljning_op: ['journal_estetik_op'],

  // Enda gruppen där två journaler samexisterar med avsikt (ORD-148 §5).
  ortopedi_prp: ['journal_estetik_ortopedi', 'journal_prp_multi'],
  ortopedi_prf: ['journal_estetik_ortopedi', 'journal_prp_multi'],
  ortopedi_hyaluron: ['journal_estetik_ortopedi'],
  uppfoljning_ortopedi: ['journal_estetik_ortopedi', 'journal_prp_multi'],

  // Konsultationer bär ingen journal här — den avgörs per tjänst nedan.
  konsultation: [],
});

/**
 * Konsultationer, per tjänst. ORD-148 §6: en konsultation öppnar en journal,
 * matchad efter specialitet — men tre av fem bär ingen specialitet i namnet.
 *
 * Två av dem löste datan: 7078 och 7079 är Hair TP Clinic, alltså
 * transplantationsspåret. Den tredje krävde ett beslut.
 *
 * Ägarbeslut 2026-09-01 om 8694 (Estetiska injektioner · Konsultation):
 * INGEN journal förrän behandlingen är vald. Botox, filler och profhilo har
 * skilda journaler, och vilken det blir vet man först efter konsultationen. En
 * tom journal av fel sort i kundkortet är värre än ingen — den ser ifylld ut.
 */
const KONSULTATION = Object.freeze({
  7080: ['journal_estetik_op'], // Ögonlocksplastik · Konsultation
  7081: ['journal_estetik_ortopedi'], // Ortopediska injektionsbehandlingar
  7078: ['journal_tp'], // Möte på kliniken — Hair TP Clinic
  7079: ['journal_tp'], // Digitalt videosamtal — Hair TP Clinic
  8694: [], // Estetiska injektioner — journalen väntar på behandlingsvalet
});

/**
 * Härleder behandlingsgrupp ur tjänstens namn och kategori.
 *
 * Namnet vinner över kategorin: 7397 "FUE Skäggtransplantation: 1000 grafts"
 * ligger i kategorin "FUE Hårtransplantation" i katalogen. Kategorin är fel
 * där, och namnet är det personalen läser.
 */
function harledGrupp(tjanst) {
  const n = String(tjanst.name || '').toLowerCase();
  const k = String(tjanst.category || '').toLowerCase();
  const uppf = /uppföljning|suturborttagning|efterbehandling|3e behandling/.test(n);

  if (/konsultation/.test(k)) return 'konsultation';
  if (uppf && /ögonlock|sutur/.test(n)) return 'uppfoljning_op';
  if (uppf && /botox|filler|profilho|profhilo/.test(n)) return 'uppfoljning_estetik';
  if (uppf && /prp|prf/.test(n) && /ortoped/.test(n + k)) return 'uppfoljning_ortopedi';
  if (uppf) return 'uppfoljning_tp';

  if (/ögonlock/.test(n + k)) return 'ogonlocksplastik';
  if (/ortoped/.test(k)) {
    if (/prf/.test(n)) return 'ortopedi_prf';
    if (/prp/.test(n)) return 'ortopedi_prp';
    return 'ortopedi_hyaluron';
  }
  if (/botox|rynkbehandling btx|lip flip/.test(n)) return 'botox';
  if (/filler/.test(n)) return 'filler';
  if (/profhilo|profilho/.test(n)) return 'profhilo';
  if (/microneedling|dermapen/.test(n + k)) return 'microneedling';
  if (/prp/.test(k) && /hud/.test(k)) return 'prp_hud';
  if (/prp/.test(k) && /hår/.test(k)) return 'prp_har';
  if (/skägg/.test(n + k)) return 'transplantation_skagg';
  if (/ögonbryn/.test(n + k)) return 'transplantation_ogonbryn';
  if (/hårtransplantation/.test(k)) {
    return /ärr/.test(n) ? 'transplantation_arr' : 'transplantation_har';
  }
  return null; // Okänt är inte tomt — anroparen ska larma, inte anta.
}

/** Dokumenten en tjänst kräver. Tom lista = tjänsten är okänd, inte dokumentlös. */
function dokumentForTjanst(tjanst) {
  const grupp = harledGrupp(tjanst);
  if (!grupp) return { grupp: null, dokument: [] };
  const id = String(tjanst.apiId ?? tjanst.serviceId ?? '');
  const extra = grupp === 'konsultation' ? KONSULTATION[id] || [] : PER_GRUPP[grupp] || [];
  return { grupp, dokument: [...new Set([...GRUND, ...extra])] };
}

module.exports = { GRUND, PER_GRUPP, KONSULTATION, harledGrupp, dokumentForTjanst };
