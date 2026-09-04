'use strict';

/**
 * ORD-212 — vilka vyer personalportalen faktiskt har.
 *
 * VARFÖR MODULEN FINNS. Baslinjen från 2026-09-03 skrev "24 nav-etiketter,
 * varav tre rollcontainrar — kvar: 21 vyer", med radnummer. Ett dygn senare
 * stämde ingendera: navigationen hade gjorts om till en datastruktur, en
 * Kollegor-vy tillkommit (ägarbeslut 2026-09-03), delegeringarna delats i tre
 * rollvyer, och ORD-191 lagt till Öppna tider. Radnumren pekade på annan kod.
 *
 * En handräknad siffra i ett dokument är färskvara. Den åldras utan att säga
 * till, och nästa läsare vet inte om 24 är sanning eller minne. Därför räknas
 * de här — ur filen, vid varje körning.
 *
 * VAD SOM MÄTS OCH VAD SOM INTE GÖR DET. Navigationen går att läsa mekaniskt:
 * den är en array med id, etikett och avsnitt. Om en vy är LEVANDE eller en
 * KULISS går däremot inte att avgöra så — det kräver att man följer varje
 * container till den JS som fyller den, och en vy kan mycket väl ha en
 * endpoint som aldrig anropas. Den bedömningen står därför deklarerad i facit,
 * med skäl, på samma sätt som tillåtna SPF-avsändare i ORD-204: det som kräver
 * omdöme skrivs ner av en människa, det som går att räkna räknas.
 */

/** En nav-post är antingen ett avsnitt, en panel eller en länk ut ur portalen. */
function tolkaNavPost(rad) {
  const avsnitt = /\bsection:\s*'([^']+)'/.exec(rad);
  if (avsnitt) return { typ: 'avsnitt', namn: avsnitt[1] };

  const id = /\bid:\s*'([^']+)'/.exec(rad);
  const label = /\blabel:\s*'([^']+)'/.exec(rad);
  if (!id || !label) return null;

  const href = /\bhref:\s*'([^']+)'/.exec(rad);
  return {
    typ: href ? 'lank' : 'panel',
    id: id[1],
    label: label[1],
    href: href ? href[1] : null,
  };
}

/** Klipper ut en balanserad `{...}`- eller `[...]`-grupp som börjar på `start`. */
function balanserad(text, start, oppna, stang) {
  let djup = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === oppna) djup++;
    else if (text[i] === stang) {
      djup--;
      if (djup === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

/**
 * Läser ROLES-objektet ur staff-portal.html.
 *
 * TVÅ MÄTFEL I FÖRSTA VERSIONEN, båda värda att stå kvar som varning.
 *
 * 1. Rollerna söktes med `/^\s{8}(\w+):\s*\{$/` över hela filen. Två andra
 *    objekt på samma indrag matchade, och `indexOf('nav: [')` framåt gav dem
 *    sjuksköterskans nav. Resultatet var fem roller där det finns tre — och
 *    de två falska såg helt trovärdiga ut, för de var kopior av en riktig.
 *    Nu klipps ROLES ut först, och bara nycklar inuti det räknas.
 *
 * 2. Posterna delades med `split(/\},?\s*(?=\{|$)/)`. Lookaheaden kräver `{`
 *    direkt efter blanktecken — men ORD-191 skrev en fyra rader lång
 *    kommentar mellan `{ section: 'Schema' }` och `{ id: 'availability' }`.
 *    De två slogs ihop till en bit, `section` matchade först, och ÖPPNA TIDER
 *    FÖLL BORT UR MÄTNINGEN. Alltså den nyaste vyn — den som har mest
 *    kommentar runt sig för att den är mest omdiskuterad.
 *
 *    Det är samma familj som Loopias kapade brevlådelista: ett bortfall ser
 *    exakt ut som ett komplett resultat när man inte vet var gränsen går.
 *    Skillnaden är att den här räknas om vid varje testkörning.
 *
 * Nu strippas radkommentarer först, och grupperna klipps ut på balanserade
 * klamrar i stället för att gissas fram med en delare.
 */
function lasNavigation(html) {
  const rolesStart = html.indexOf('const ROLES = {');
  if (rolesStart === -1) return {};
  const rolesKropp = balanserad(html, html.indexOf('{', rolesStart), '{', '}');

  // Radkommentarer bort. De innehåller både klamrar och ord som `id:` i
  // löpande text, och båda skulle annars räknas som kod.
  const ren = rolesKropp.replace(/^[ \t]*\/\/.*$/gm, '');

  const roller = {};
  const rollRe = /(\w+):\s*\{/g;
  let m;
  while ((m = rollRe.exec(ren))) {
    const navStart = ren.indexOf('nav: [', m.index);
    if (navStart === -1) continue;
    // Bara nav-arrayen som hör till DEN HÄR rollen: ligger den efter rollens
    // egen slutklammer tillhör den nästa roll.
    const rollKropp = balanserad(ren, ren.indexOf('{', m.index), '{', '}');
    if (navStart > m.index + rollKropp.length) continue;

    const array = balanserad(ren, ren.indexOf('[', navStart), '[', ']');
    const poster = [];
    let i = 1;
    while (i < array.length) {
      const nasta = array.indexOf('{', i);
      if (nasta === -1) break;
      const grupp = balanserad(array, nasta, '{', '}');
      if (!grupp) break;
      const post = tolkaNavPost(grupp.replace(/\s+/g, ' '));
      if (post) poster.push(post);
      i = nasta + grupp.length;
    }
    if (poster.length) roller[m[1]] = poster;
  }
  return roller;
}

/** Alla distinkta panel-id:n över alla roller. Delade vyer räknas en gång. */
function distinktaPaneler(roller) {
  const set = new Set();
  for (const poster of Object.values(roller || {})) {
    for (const p of poster) if (p.typ === 'panel') set.add(p.id);
  }
  return [...set].sort();
}

/**
 * Jämför uppmätt navigation mot facit.
 *
 * BÅDA RIKTNINGARNA ÄR FEL. En panel som finns i koden men saknas i facit är
 * en vy ingen tagit ställning till — den kan vara en kuliss som ser levande
 * ut. En panel som står i facit men saknas i koden är en vy som tagits bort
 * utan att facit följt med, och då beskriver facit en portal som inte finns.
 */
function jamforMotFacit(uppmatta, facitPaneler) {
  const iFacit = new Set(Object.keys(facitPaneler || {}));
  const saknasIFacit = uppmatta.filter((id) => !iFacit.has(id));
  const saknasIKoden = [...iFacit].filter((id) => !uppmatta.includes(id)).sort();
  return {
    stammer: saknasIFacit.length === 0 && saknasIKoden.length === 0,
    saknasIFacit,
    saknasIKoden,
  };
}

module.exports = { tolkaNavPost, lasNavigation, distinktaPaneler, jamforMotFacit };
