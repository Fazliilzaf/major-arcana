'use strict';

/**
 * ORD-89 steg 1 — mät hur stor del av en truth-shard som är brödtext.
 *
 * VARFÖR STRÖMMANDE, INTE `JSON.parse`.
 * Mätningen gäller filer på 134–179 MB. En `JSON.parse` av `fazli@` (134 MB)
 * kostade +1 174 MB RSS och startade om instansen 2026-07-28 19:09. Att parsa
 * `egzona@` (179 MB) för att MÄTA problemet vore att orsaka exakt det fel vi
 * undersöker — samma invändning som fällde den externa proben, fast inifrån.
 *
 * Skannern håller därför aldrig mer än en chunk och några få tecken i minnet.
 * Den bygger ingen objektgraf och allokerar inga brödtextsträngar.
 *
 * TVÅ TAL, INTE ETT.
 *  - `decodedChars` är `bodyHtml.length + bodyText.length` i JS-mening, alltså
 *    det som caparna i `ccoMailboxTruthStore.js:21,25` räknar.
 *  - `rawBytes` är hur många byte värdena upptar i filen, med escape-sekvenser
 *    och UTF-8 i behåll.
 *
 * Bara `rawBytes` får jämföras med filstorleken. `\n` är ETT tecken avkodat och
 * TVÅ byte i filen; `\uXXXX` är ett tecken och sex byte; `å` är ett tecken och
 * två byte. Att dela `decodedChars` med filstorleken underskattar andelen — och
 * det är den kvoten steg 2 vilar på.
 */

const fs = require('node:fs');

const BODY_KEYS = new Set(['bodyText', 'bodyHtml']);
/** Längsta sträng vi bryr oss om att bevara för att kunna vara en nyckel. */
const MAX_KEY_CHARS = 64;

/**
 * Strömmande JSON-skanner som summerar längden på värdena för `bodyText` och
 * `bodyHtml`. Ingen parsning, ingen objektgraf.
 *
 * Nyckel eller värde avgörs av vad som följer efter den avslutade strängen:
 * ett kolon betyder nyckel, allt annat betyder värde. Det är samma regel som
 * JSON självt använder, och den kräver ingen struktur-stack.
 */
function createBodyShareScanner() {
  const totals = {
    bodyText: { decodedChars: 0, rawBytes: 0, values: 0 },
    bodyHtml: { decodedChars: 0, rawBytes: 0, values: 0 },
  };

  let inString = false;
  let escaped = false;
  // Antal återstående hex-tecken i en pågående \uXXXX-sekvens.
  let unicodeRemaining = 0;
  let decodedChars = 0;
  let rawBytes = 0;
  // Nyckelkandidat: ogiltig så snart strängen blivit för lång för en nyckel.
  let keyCandidate = '';
  let keyCandidateValid = true;
  // Senast avslutade sträng som följdes av ':' — alltså en nyckel.
  let pendingKey = '';
  // Sträng som just avslutats; vi vet ännu inte om den var nyckel eller värde.
  let closedString = null;

  function settleClosedString(nextChar) {
    if (!closedString) return;
    if (nextChar === ':') {
      pendingKey = closedString.key;
    } else {
      if (BODY_KEYS.has(pendingKey)) {
        const bucket = totals[pendingKey];
        bucket.decodedChars += closedString.decodedChars;
        bucket.rawBytes += closedString.rawBytes;
        bucket.values += 1;
      }
      pendingKey = '';
    }
    closedString = null;
  }

  function write(chunk) {
    const text = String(chunk);
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (!inString) {
        if (char === '"') {
          // En sträng börjar. Att detta INTE är ett kolon avgör att den
          // föregående avslutade strängen var ett värde.
          if (closedString) settleClosedString(char);
          inString = true;
          escaped = false;
          unicodeRemaining = 0;
          decodedChars = 0;
          rawBytes = 0;
          keyCandidate = '';
          keyCandidateValid = true;
          continue;
        }
        if (closedString) {
          if (char === ' ' || char === '\n' || char === '\r' || char === '\t') continue;
          settleClosedString(char);
        }
        continue;
      }

      // Inuti en sträng.
      rawBytes += Buffer.byteLength(char, 'utf8');

      if (unicodeRemaining > 0) {
        unicodeRemaining -= 1;
        if (unicodeRemaining === 0) {
          decodedChars += 1;
          if (keyCandidateValid) keyCandidate += '?';
        }
        continue;
      }

      if (escaped) {
        escaped = false;
        if (char === 'u') {
          unicodeRemaining = 4;
          continue;
        }
        decodedChars += 1;
        if (keyCandidateValid) keyCandidate += char;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        // Strängen slutar. Det avslutande citattecknet hör inte till värdet.
        rawBytes -= 1;
        inString = false;
        closedString = {
          key: keyCandidateValid ? keyCandidate : '',
          decodedChars,
          rawBytes,
        };
        continue;
      }

      decodedChars += 1;
      if (keyCandidateValid) {
        keyCandidate += char;
        if (keyCandidate.length > MAX_KEY_CHARS) keyCandidateValid = false;
      }
    }
  }

  function finish() {
    // En fil som slutar direkt efter ett värde ska ändå räknas.
    if (closedString) settleClosedString('');
    return {
      bodyText: { ...totals.bodyText },
      bodyHtml: { ...totals.bodyHtml },
      decodedChars: totals.bodyText.decodedChars + totals.bodyHtml.decodedChars,
      rawBytes: totals.bodyText.rawBytes + totals.bodyHtml.rawBytes,
    };
  }

  return { write, finish };
}

/**
 * Skannar en shard-fil strömmande. Håller aldrig hela filen i minnet.
 * `highWaterMark` är 1 MB — stort nog att vara snabbt, litet nog att aldrig
 * ligga i närheten av felläget vi mäter.
 */
async function scanShardBodyShare(filePath) {
  const scanner = createBodyShareScanner();
  const stat = await fs.promises.stat(filePath);
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
    stream.on('data', (chunk) => scanner.write(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  const totals = scanner.finish();
  const fileBytes = Number(stat.size || 0);
  return {
    filePath,
    fileBytes,
    ...totals,
    // Andelen av FILEN som är brödtext. Alltid rawBytes i täljaren.
    bodyShare: fileBytes > 0 ? totals.rawBytes / fileBytes : 0,
  };
}

module.exports = {
  createBodyShareScanner,
  scanShardBodyShare,
  MAX_KEY_CHARS,
};
