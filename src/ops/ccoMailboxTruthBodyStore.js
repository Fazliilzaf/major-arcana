'use strict';

/**
 * ORD-89 steg 2 — brödtexterna som sidofiler.
 *
 * Mätningen (2026-07-29): 87,3 % av 554,1 MB truth-shardar är `bodyText` +
 * `bodyHtml`. `egzona@` 179,0 → 19,8 MB, `contact@` 154,0 → 21,2, `fazli@`
 * 134,5 → 20,2. Worklist-vägen parsar hela massan för att bygga en radlista som
 * inte visar brödtext.
 *
 * HÄRLEDD SÖKVÄG, INGEN INDEX.
 * Sökvägen räknas fram ur meddelandenyckeln. Ingen pekare lagras i sharden och
 * ingen indexfil skapas — det finns då ingenting som KAN glida isär från
 * verkligheten. Samma princip som gjorde readCache-fixen hållbar: hellre
 * omöjlig drift än vaktad drift.
 *
 * `bodyPreview` FLYTTAS INTE. Den är capad till 500 tecken och är det
 * worklisten och historiksöket faktiskt läser (`searchHistoryMessages`
 * returnerar `summary: message.bodyPreview`). Mätningens 87,3 % räknade bara
 * `bodyText + bodyHtml`, så siffrorna ovan håller med förhandsvisningen kvar.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/** Fält som flyttas ut. Allt annat stannar i sharden. */
const BODY_FIELDS = Object.freeze(['bodyText', 'bodyHtml']);

/**
 * Sätts på meddelandet när en sidofil fanns men inte gick att läsa.
 * Efter migreringen är sidofilen enda källan, och då är tyst tomhet det värsta
 * utfallet: operatören ser en tom bubbla och kan inte skilja "mailet var tomt"
 * från "vi tappade texten". Ett fel som bara syns hos mottagaren är det
 * dyraste slaget — samma skäl som gör att ORD-93 vaktar missingCidMetadata.
 */
const BODY_READ_ERROR = 'bodyUnavailableReason';

/**
 * Katalognamn får aldrig komma från indata rakt av. En meddelandenyckel
 * innehåller mailadresser och Graph-id:n, och en nyckel med `../` i sig skulle
 * annars skriva utanför datakatalogen.
 */
function safeSegment(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._@-]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 120);
}

/**
 * Två tecken hash-prefix. Finns för att ingen katalog ska bära 10 000 poster —
 * `contact@` har 10 615 meddelanden, och en platt katalog med så många filer är
 * långsam att lista på de flesta filsystem.
 */
function shardPrefix(messageKey = '') {
  return crypto.createHash('sha1').update(String(messageKey)).digest('hex').slice(0, 2);
}

/**
 * Sökvägen till ett meddelandes brödtext. Ren funktion, inga sidoeffekter.
 *
 * FILNAMNET BÄR EN FULL HASH AV NYCKELN, inte bara en läsbar stump.
 *
 * PRODFYND 2026-07-29: `safeSegment` kapar vid 120 tecken. Verkliga
 * meddelandenycklar är ~174 tecken och delar ett långt gemensamt Graph-prefix,
 * så de kapade namnen blev IDENTISKA för de flesta meddelanden. Kvar som
 * åtskillnad fanns bara katalogens två hash-tecken — 256 hinkar för 205
 * meddelanden. Uppmätt kollisionsgrad på realistiska nycklar: 31,7 %.
 *
 * Följden var att en brödtext skrev över en annan, och verifieringen läste
 * samma fil flera gånger: `verifiedDecodedChars` 570 765 mot `expected`
 * 491 108. Att verifieringen var STÖRRE än det förväntade var vad som
 * avslöjade det — en förlust hade sett ut som en minskning.
 *
 * Den läsbara stumpen behålls för att en människa ska kunna se vilket
 * meddelande en fil hör till. Åtskillnaden görs av hashen.
 */
function bodyFilePath({ bodyRoot = '', mailboxId = '', messageKey = '' } = {}) {
  const mailbox = safeSegment(mailboxId);
  if (!bodyRoot || !mailbox || !messageKey) return '';
  const readable = safeSegment(messageKey).slice(0, 48);
  const digest = crypto.createHash('sha256').update(String(messageKey)).digest('hex');
  return path.join(bodyRoot, mailbox, digest.slice(0, 2), `${readable}.${digest}.json`);
}

/** Roten för sidofilerna, syskon till `mailboxes/`. */
function resolveBodyRoot(config = {}) {
  return path.join(config.ccoMailboxTruthShardDir || '', 'bodies');
}

/** Läser ett meddelandes brödtext. `null` betyder "ingen sidofil" — inte fel. */
async function readBody(filePath) {
  if (!filePath) return null;
  let raw;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return { [BODY_READ_ERROR]: 'ogiltig_form' };
  } catch {
    // TRASIG FIL ≠ SAKNAD FIL, och skillnaden byter innebörd mitt i migreringen.
    //
    // Före migreringen finns brödtexten kvar inline i sharden, och ett tyst
    // `null` betyder "använd den". Efter migreringen finns ingen inline-text —
    // då betyder samma `null` att operatören ser en tom bubbla utan att kunna
    // avgöra om mailet var tomt eller om vi tappade det.
    //
    // Därför markeras felet i stället för att döljas. Inline vinner fortfarande
    // om den finns; det är bara tystnaden som tas bort.
    return { [BODY_READ_ERROR]: 'ogiltig_json' };
  }
}

/** Raderar ett meddelandes sidofil. Saknad fil är inte ett fel. */
async function removeBody(filePath) {
  if (!filePath) return false;
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Atomisk skrivning: temporärfil + rename, aldrig en halvskriven brödtext.
 *
 * TEMPORÄRNAMNET MÅSTE VARA UNIKT PER SKRIVNING, inte per process.
 * Med `${filePath}.${process.pid}.tmp` delar två samtidiga skrivningar av
 * samma meddelande i samma process temporärfil. Delta-synken skriver löpande,
 * och in-flight-dedupen i #1244 skyddar LADDNINGAR, inte skrivningar. Utfallet
 * blir en halvskriven fil som `JSON.parse` avvisar — permanent, tills något
 * råkar skriva över den. Atomiciteten var rätt tänkt; det var namnet som
 * saknade unikhet.
 */
async function writeBody(filePath, body = {}) {
  const payload = {};
  for (const field of BODY_FIELDS) {
    if (typeof body[field] === 'string' && body[field].length > 0) payload[field] = body[field];
  }
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(tmpPath, `${JSON.stringify(payload)}\n`, 'utf8');
  await fs.promises.rename(tmpPath, filePath);
  return payload;
}

/**
 * SIDOFIL OM DEN FINNS, ANNARS FÄLTET I SHARDEN.
 *
 * Det är hela bakåtkompatibiliteten. Den betyder att migreringen kan köras en
 * brevlåda i taget, utan flagga, utan samordnad deploy — och att ett
 * halvmigrerat tillstånd inte är trasigt utan bara halvfärdigt.
 *
 * Delta-synken skriver löpande under migreringen. Ett meddelande som skrivs då
 * behåller sin inline-brödtext, och den här funktionen hanterar det utan att
 * veta om det.
 */
async function hydrateMessageBody(message = {}, { bodyRoot = '', mailboxId = '', messageKey = '' } = {}) {
  const filePath = bodyFilePath({ bodyRoot, mailboxId, messageKey });
  const stored = await readBody(filePath);
  if (!stored) return message;
  const hydrated = { ...message };
  for (const field of BODY_FIELDS) {
    if (typeof stored[field] === 'string' && stored[field].length > 0) {
      hydrated[field] = stored[field];
    }
  }
  // Inline vinner fortfarande när den finns — men om varken sidofilen eller
  // sharden bär text ska det SYNAS att det beror på ett läsfel, inte på att
  // mailet var tomt.
  if (stored[BODY_READ_ERROR]) {
    const hasText = BODY_FIELDS.some(
      (field) => typeof hydrated[field] === 'string' && hydrated[field].length > 0
    );
    if (!hasText) hydrated[BODY_READ_ERROR] = stored[BODY_READ_ERROR];
  }
  return hydrated;
}

/**
 * SPÄRR FÖRE MIGRERING.
 *
 * Migreringen skriver ut brödtexterna INNAN de tas ur sharden, alltså ~484 MB
 * extra under övergången. En full disk mitt i en migrering av kunddata är
 * sämre än allt annat vi haft den här veckan. Räcker inte marginalen ska
 * ingenting påbörjas.
 */
async function checkFreeSpace(targetPath, requiredBytes, { marginRatio = 1.5 } = {}) {
  const stats = await fs.promises.statfs(targetPath);
  const freeBytes = Number(stats.bavail || 0) * Number(stats.bsize || 0);
  const needed = Math.ceil(Number(requiredBytes || 0) * marginRatio);
  return {
    freeBytes,
    requiredBytes: Number(requiredBytes || 0),
    neededBytes: needed,
    marginRatio,
    ok: freeBytes >= needed,
  };
}

module.exports = {
  BODY_FIELDS,
  BODY_READ_ERROR,
  removeBody,
  safeSegment,
  shardPrefix,
  bodyFilePath,
  resolveBodyRoot,
  readBody,
  writeBody,
  hydrateMessageBody,
  checkFreeSpace,
};
