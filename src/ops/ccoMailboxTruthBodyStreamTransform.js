'use strict';

/**
 * ORD-89 steg 2 — strömmande transform av en shard.
 *
 * VARFÖR DEN HÄR MODULEN FINNS.
 * Migreringen läste först hela sharden med `JSON.parse`. För `egzona@` är det
 * 179 MB och ~1,2 GB RSS på den instans som samtidigt betjänar kliniken —
 * alltså exakt det fel migreringen finns för att åtgärda. Diskspärren,
 * backupen och `decodedChars`-verifieringen skyddar mot att TAPPA TEXT. Ingen
 * av dem skyddar mot att FÄLLA INSTANSEN, och det är den risk som faktiskt
 * inträffade den 28 juli.
 *
 * Transformen passerar varje tecken vidare till den nya sharden och styr bara
 * om brödtextvärdena. En passering, ingen objektgraf.
 *
 * VÄRDET ERSÄTTS MED "", FÄLTET TAS INTE BORT.
 * Att klippa bort ett nyckel/värde-par ur en ström kräver komma-kirurgi, och
 * ett felplacerat komma gör hela sharden oläsbar. Två byte per fält är ett
 * löjligt pris för att slippa den klassen av fel helt. Tomt fält och saknat
 * fält beter sig likadant i läsvägen — båda är falsy, och sidofilen vinner.
 *
 * ENDA STÄLLET SOM BUFFRAS är det brödtextvärde som just nu styrs om. Det är
 * capat till 24 000 tecken av `ccoMailboxTruthStore.js:25`.
 */

const BODY_FIELDS = new Set(['bodyText', 'bodyHtml']);

/**
 * Taket måste rymma en VERKLIG meddelandenyckel.
 *
 * `${mailboxId}:${graphMessageId}` — Graphs id:n är 140–200 tecken, så en
 * nyckel landar runt 160–230. Med taket på 64 kastades varje meddelandenyckel
 * som för lång, och `keyAtDepth[2]` blev kvar med den SENAST giltiga nyckeln
 * på samma djup: konto-id:t ur `accounts`. Resultatet i prod var att 409
 * brödtexter skrevs till EN fil, och verifieringen fångade det som
 * `decoded_chars_stammer_inte`.
 *
 * 512 rymmer nyckeln med marginal och håller fortfarande brödtexterna
 * (capade till 24 000) långt utanför.
 */
const MAX_KEY_CHARS = 512;

/**
 * @param {(messageKey: string, field: string, value: string) => Promise<void>} onBody
 *        Anropas för varje omstyrt värde. Transformen väntar inte in den —
 *        anroparen samlar löftena och avgör själv hur många som får vara i
 *        flykt samtidigt.
 */
function createBodyStreamTransform({ onBody, emit } = {}) {
  let depth = 0;
  const keyAtDepth = [];

  let inString = false;
  let escaped = false;
  let unicodeDigits = '';
  let unicodeRemaining = 0;

  // Nyckelkandidat för strängen som just skrivs.
  let candidate = '';
  let candidateValid = true;
  // Sträng som stängts men ännu inte avgjorts som nyckel eller värde.
  let closed = null;
  let pendingKey = '';

  // Omstyrning
  let diverting = false;
  let divertField = '';
  let divertKey = '';
  let divertValue = '';

  const out = [];
  const bodies = [];
  let redirected = 0;
  let maxValueChars = 0;

  function push(text) {
    out.push(text);
  }

  function settle(nextChar) {
    // `closed` är ETT OBJEKT eller null — aldrig en sträng.
    //
    // DETTA ÄR MEKANISMEN BAKOM PRODFYNDET. Tidigare bar `closed` själva
    // strängen, och en nyckel som var för lång blev `''`. Tomma strängen är
    // falsy, så `if (!closed) return` hoppade ur FÖRE tilldelningen — och
    // platsen behöll den föregående nyckeln. Konto-id:t ur `accounts` stod
    // kvar och fick 409 brödtexter på sig.
    //
    // En ogiltig nyckel måste NOLLA platsen, inte lämna den orörd. Med det på
    // plats spelar taket ingen roll för korrektheten: 64 hade varit säkert,
    // bara verkningslöst.
    if (closed === null) return;
    if (nextChar === ':') {
      keyAtDepth[depth] = closed.key;
      pendingKey = closed.key;
    } else {
      pendingKey = '';
    }
    closed = null;
  }

  /** Är strängen som just ska börja ett brödtextvärde? */
  function shouldDivert() {
    return (
      depth === 3 &&
      keyAtDepth[1] === 'messages' &&
      typeof keyAtDepth[2] === 'string' &&
      keyAtDepth[2].length > 0 &&
      BODY_FIELDS.has(pendingKey)
    );
  }

  function write(chunk) {
    const text = String(chunk);
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (!inString) {
        if (char === '"') {
          settle(char);
          inString = true;
          escaped = false;
          unicodeRemaining = 0;
          candidate = '';
          candidateValid = true;
          if (shouldDivert()) {
            diverting = true;
            divertField = pendingKey;
            divertKey = keyAtDepth[2];
            divertValue = '';
            // Det tomma värdet skrivs i stället, direkt.
            push('""');
          } else {
            push(char);
          }
          continue;
        }
        settle(char);
        if (char === '{' || char === '[') {
          depth += 1;
          // NYCKLAR ÄRVS ALDRIG MELLAN SYSKON.
          // Utan den här raden stod en tidigare nyckel på samma djup kvar när
          // nästa objekt inte satte någon egen — och en brödtext kunde
          // attribueras till fel meddelande, tyst. Det var precis så konto-id:t
          // ur `accounts` blev "meddelandenyckel" för 409 brödtexter i prod.
          keyAtDepth[depth] = '';
        } else if (char === '}' || char === ']') {
          keyAtDepth[depth] = '';
          depth -= 1;
        }
        push(char);
        continue;
      }

      // Inuti en sträng. Om vi styr om skrivs inget till utströmmen.
      if (!diverting) push(char);

      if (unicodeRemaining > 0) {
        unicodeDigits += char;
        unicodeRemaining -= 1;
        if (unicodeRemaining === 0) {
          const decoded = String.fromCharCode(parseInt(unicodeDigits, 16));
          if (diverting) divertValue += decoded;
          else if (candidateValid) candidate += decoded;
          unicodeDigits = '';
        }
        continue;
      }

      if (escaped) {
        escaped = false;
        if (char === 'u') {
          unicodeRemaining = 4;
          unicodeDigits = '';
          continue;
        }
        const decoded =
          char === 'n' ? '\n' : char === 't' ? '\t' : char === 'r' ? '\r' : char === 'b' ? '\b' : char === 'f' ? '\f' : char;
        if (diverting) divertValue += decoded;
        else if (candidateValid) candidate += decoded;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
        if (diverting) {
          redirected += 1;
          if (divertValue.length > maxValueChars) maxValueChars = divertValue.length;
          bodies.push(onBody(divertKey, divertField, divertValue));
          diverting = false;
          divertValue = '';
          pendingKey = '';
        } else {
          closed = { key: candidateValid ? candidate : '' };
        }
        continue;
      }

      if (diverting) {
        divertValue += char;
        continue;
      }
      if (candidateValid) {
        candidate += char;
        if (candidate.length > MAX_KEY_CHARS) candidateValid = false;
      }
    }

    const chunkOut = out.join('');
    out.length = 0;
    if (chunkOut && typeof emit === "function") return emit(chunkOut);
    return true;
  }

  async function finish() {
    await Promise.all(bodies);
    return { redirected, maxValueChars, depthAtEnd: depth };
  }

  return { write, finish };
}

module.exports = { createBodyStreamTransform, BODY_FIELDS };
