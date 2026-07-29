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
const path = require('node:path');

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
  // Hög surrogat vars byte ännu inte räknats — se nedan.
  let pendingHighSurrogate = false;

  // Loopen itererar UTF-16-KODENHETER. Ett tecken utanför BMP (emoji) är ett
  // surrogatpar, alltså två iterationer, och `Buffer.byteLength` på en ensam
  // surrogat ger 3 byte (ersättningstecknet) — 3+3=6 där filen har 4.
  //
  // `decodedChars` blir däremot rätt av samma skäl: JS `.length` räknar också
  // paret som två. Det är alltså BARA rawBytes som behöver paras ihop, och
  // rawBytes är talet steg 2 vilar på.
  //
  // Byten skjuts upp tills nästa kodenhet är känd, så att ett par som delas av
  // en chunkgräns räknas likadant som ett som inte delas.
  function countSurrogateBytes(isLowSurrogate) {
    if (isLowSurrogate) return 4; // hela paret
    return 3; // ensam surrogat: så många byte den faktiskt kodas som
  }

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
      const code = text.charCodeAt(index);
      const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
      const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;

      if (pendingHighSurrogate) {
        pendingHighSurrogate = false;
        rawBytes += countSurrogateBytes(isLowSurrogate);
        if (isLowSurrogate) {
          // Andra halvan av paret. Byten är redan räknade för båda.
          decodedChars += 1;
          if (keyCandidateValid) keyCandidate += '?';
          continue;
        }
        // Ensam hög surrogat: dess byte är räknade, nuvarande tecken faller
        // igenom och behandlas som vanligt nedan.
      }

      if (isHighSurrogate) {
        // Skjut upp bytesräkningen tills vi vet om nästa kodenhet är låg.
        pendingHighSurrogate = true;
        decodedChars += 1;
        if (keyCandidateValid) keyCandidate += '?';
        continue;
      }

      rawBytes += isLowSurrogate ? 3 : Buffer.byteLength(char, 'utf8');

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

/**
 * Listar shardfilerna, MINST FÖRST.
 *
 * Ordningen är inte kosmetisk. `kons@` är 0,9 MB och kostar ingenting att göra
 * fel på; `egzona@` är 179 MB och kommer sist. Faller något ska det falla
 * billigt, och de tidiga raderna ska redan vara utskrivna när det händer.
 */
async function listMailboxTruthShardFiles(config = {}) {
  const shardDir = path.join(config.ccoMailboxTruthShardDir, 'mailboxes');
  let entries = [];
  try {
    entries = await fs.promises.readdir(shardDir);
  } catch {
    return [];
  }
  const files = [];
  for (const name of entries) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const filePath = path.join(shardDir, name);
    try {
      const stat = await fs.promises.stat(filePath);
      files.push({
        mailbox: name.replace(/\.json$/, ''),
        filePath,
        sizeBytes: Number(stat.size || 0),
      });
    } catch {
      /* en shard som försvinner mitt i listningen ska inte fälla mätningen */
    }
  }
  return files.sort((left, right) => left.sizeBytes - right.sizeBytes);
}

/**
 * Mäter samtliga shardar, en i taget, minst först.
 * Ren läsning. Rör inte `loadShard()` och därmed inte shard-cachen.
 */
async function measureMailboxTruthBodyShare(config = {}) {
  const files = await listMailboxTruthShardFiles(config);
  const mailboxes = [];
  for (const file of files) {
    const startedAt = Date.now();
    const rssBefore = process.memoryUsage().rss;
    const result = await scanShardBodyShare(file.filePath);
    mailboxes.push({
      mailbox: file.mailbox,
      fileBytes: result.fileBytes,
      bodyRawBytes: result.rawBytes,
      bodyDecodedChars: result.decodedChars,
      bodyShare: result.bodyShare,
      bodyTextValues: result.bodyText.values,
      bodyHtmlValues: result.bodyHtml.values,
      msSpent: Date.now() - startedAt,
      // Ska INTE följa filstorleken. Gör den det är skannern inte strömmande.
      rssDeltaBytes: process.memoryUsage().rss - rssBefore,
    });
  }
  const totalFileBytes = mailboxes.reduce((sum, row) => sum + row.fileBytes, 0);
  const totalBodyBytes = mailboxes.reduce((sum, row) => sum + row.bodyRawBytes, 0);
  return {
    mailboxes,
    totalFileBytes,
    totalBodyBytes,
    totalBodyShare: totalFileBytes > 0 ? totalBodyBytes / totalFileBytes : 0,
    measuredAt: new Date().toISOString(),
  };
}

module.exports = {
  createBodyShareScanner,
  scanShardBodyShare,
  listMailboxTruthShardFiles,
  measureMailboxTruthBodyShare,
  MAX_KEY_CHARS,
};
