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
function createBodyStreamTransform({
  onBody,
  emit,
  // Steg 0 av bodies-externaliseringen för mail-ingestion
  // (docs/ops/cco-mail-ingestion-bodies-utkast.md). Transformen var hårdkodad
  // mot mailbox-truths shard-format. Formatberoendet är två saker:
  // samlingsnyckeln och vilka fält som styrs om. Bägge är nu parametrar med
  // mailbox-truths värden som default, så befintliga anropare är oförändrade.
  //
  // Djupet behöver INTE parametriseras: mail-ingestion har samma form,
  // { mailRawMessages: { "<id>": { bodyText: ... } } }, alltså samlingen på
  // djup 1, meddelandenyckeln på 2 och fältet på 3 — precis som
  // { messages: { "<key>": { bodyText: ... } } }.
  collectionKey = 'messages',
  bodyFields = BODY_FIELDS,
  // Steg 1: fält vars värde är ett OBJEKT eller en ARRAY, inte en sträng.
  // mail-ingestion har rawJson — 184 av 206 MB, alltså 89 % av allt som ska
  // ut. Tomt som default, så mailbox-truth är oförändrad.
  //
  // Värdet som skickas till onBody är den RÅA JSON-texten, inte ett parsat
  // objekt. Transformen ser bara tecken och ska inte börja tolka; anroparen
  // avgör om texten ska sparas som den är eller parsas.
  objectFields = new Set(),
} = {}) {
  const fields = bodyFields instanceof Set ? bodyFields : new Set(bodyFields || []);
  const objFields = objectFields instanceof Set ? objectFields : new Set(objectFields || []);
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

  // Objektdiversionens delstate. Helt skilt från det yttre — se kommentaren i
  // write(). objDepth börjar på 1 vid den öppnande klammern och når 0 vid den
  // matchande stängningen.
  let objectDiverting = false;
  let objDepth = 0;
  let objInString = false;
  let objEscaped = false;
  let objRaw = '';
  let objField = '';
  let objKey = '';

  const out = [];
  const bodies = [];
  let redirected = 0;
  let maxValueChars = 0;
  // Längsta nyckel vi FAKTISKT sett, oavsett taket. Räknas separat från
  // `candidate`, som slutar växa vid MAX_KEY_CHARS — annars vore talet
  // begränsat av just det vi vill kunna kontrollera.
  let maxKeyChars = 0;
  let candidateChars = 0;

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
      if (closed.chars > maxKeyChars) maxKeyChars = closed.chars;
      keyAtDepth[depth] = closed.key;
      pendingKey = closed.key;
    } else {
      pendingKey = '';
    }
    closed = null;
  }

  /** Gemensam positionskontroll: står vi på ett fält i ett meddelande? */
  function atMessageField() {
    return (
      depth === 3 &&
      keyAtDepth[1] === collectionKey &&
      typeof keyAtDepth[2] === 'string' &&
      keyAtDepth[2].length > 0
    );
  }

  /** Är strängen som just ska börja ett brödtextvärde? */
  function shouldDivert() {
    return atMessageField() && fields.has(pendingKey);
  }

  /** Är objektet/arrayen som just ska börja ett omstyrt värde? */
  function shouldDivertObject() {
    return atMessageField() && objFields.has(pendingKey);
  }

  function write(chunk) {
    const text = String(chunk);
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      // OBJEKTDIVERSION HAR EGET DELSTATE.
      //
      // Klamrarna inuti rawJson får inte röra den yttre djupräkningen — gör de
      // det står `depth` fel för resten av filen och varje efterföljande
      // omstyrning hamnar på fel meddelande. Delstaten spårar därför sin egen
      // nivå och sitt eget strängläge, och den yttre maskinen ser inte ett enda
      // av tecknen.
      //
      // Strängläget är inte valfritt: ett objekt som innehåller "{" eller "}"
      // i en textsträng skulle annars stänga tidigt, och resten av filen
      // skrivas ut som skräp.
      if (objectDiverting) {
        objRaw += char;
        if (objInString) {
          if (objEscaped) objEscaped = false;
          else if (char === '\\') objEscaped = true;
          else if (char === '"') objInString = false;
        } else if (char === '"') {
          objInString = true;
        } else if (char === '{' || char === '[') {
          objDepth += 1;
        } else if (char === '}' || char === ']') {
          objDepth -= 1;
          if (objDepth === 0) {
            redirected += 1;
            if (objRaw.length > maxValueChars) maxValueChars = objRaw.length;
            bodies.push(onBody(objKey, objField, objRaw));
            objectDiverting = false;
            objRaw = '';
            pendingKey = '';
          }
        }
        continue;
      }

      if (!inString) {
        if (char === '"') {
          settle(char);
          inString = true;
          escaped = false;
          unicodeRemaining = 0;
          candidate = '';
          candidateValid = true;
          candidateChars = 0;
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
        if ((char === '{' || char === '[') && shouldDivertObject()) {
          // Ett tomt värde av samma typ skrivs i stället. Läsvägen behandlar
          // {} och [] likadant som "" — falsy nog att falla tillbaka på
          // sidofilen.
          objectDiverting = true;
          objField = pendingKey;
          objKey = keyAtDepth[2];
          objDepth = 1;
          objRaw = char;
          objInString = false;
          objEscaped = false;
          push(char === '{' ? '{}' : '[]');
          continue;
        }
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
          else {
            candidateChars += 1;
            if (candidateValid) candidate += decoded;
          }
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
          char === 'n'
            ? '\n'
            : char === 't'
              ? '\t'
              : char === 'r'
                ? '\r'
                : char === 'b'
                  ? '\b'
                  : char === 'f'
                    ? '\f'
                    : char;
        if (diverting) divertValue += decoded;
        else {
          candidateChars += 1;
          if (candidateValid) candidate += decoded;
        }
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
          closed = { key: candidateValid ? candidate : '', chars: candidateChars };
        }
        continue;
      }

      if (diverting) {
        divertValue += char;
        continue;
      }
      candidateChars += 1;
      if (candidateValid) {
        candidate += char;
        if (candidate.length > MAX_KEY_CHARS) candidateValid = false;
      }
    }

    const chunkOut = out.join('');
    out.length = 0;
    if (chunkOut && typeof emit === 'function') return emit(chunkOut);
    return true;
  }

  async function finish() {
    await Promise.all(bodies);
    return { redirected, maxValueChars, maxKeyChars, depthAtEnd: depth };
  }

  return { write, finish };
}

module.exports = { createBodyStreamTransform, BODY_FIELDS };
