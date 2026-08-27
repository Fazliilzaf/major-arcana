'use strict';

/**
 * Validator: `serviceIds` per katalograd (hairtp-document-types.catalog.json).
 *
 * Bakgrund (MASTERPLAN-CCO-2026-08-27, DEL V · steg 1 och DEL X · steg 4):
 *   Kopplingen tjänst -> dokument ska gå på `serviceIds` per katalograd
 *   (55 tjänster), inte på `flowApplies` (grov väg). Datan i `serviceIds`
 *   fylls ur arbetsbladet `underlag-per-tjanst-ARBETSBLAD.csv` — det är
 *   klinisk kunskap och ägs av FAZLI. Den här modulen gör INTE datan.
 *
 * Vad den här modulen gör:
 *   - Katalograderna är förberedda med `serviceIds: []` (tomt, additivt).
 *   - När arbetsbladet är ifyllt (har datarader) ska varje katalograd ha
 *     ett icke-tomt `serviceIds`. Modulen varnar om en rad saknar det.
 *   - Arbetsbladet finns inte / är tomt / listar bara tjänster utan ifyllda
 *     dokumentkopplingar => inget att validera, ingen varning (normalt läge
 *     innan Fazli fyller i kopplingarna).
 *
 * Additivt: läser bara katalogen och arbetsbladet, skriver ingenting.
 */

const fs = require('node:fs');
const path = require('node:path');

const CATALOG_PATH = path.join(
  __dirname,
  'hairtp-document-types.catalog.json'
);

// Kandidatplatser för arbetsbladet. Fazli lägger filen där den passar;
// `UNDERLAG_PER_TJANST_CSV` (eller CLI-argumentet) överstyr alltid.
const WORKBOOK_CANDIDATES = [
  path.join(__dirname, '..', '..', 'underlag-per-tjanst-ARBETSBLAD.csv'),
  path.join(__dirname, '..', '..', 'docs', 'workflow', 'underlag-per-tjanst-ARBETSBLAD.csv'),
  path.join(__dirname, '..', '..', 'data', 'underlag-per-tjanst-ARBETSBLAD.csv'),
];

function findWorkbook(overridePath) {
  // Ett explicit angivet arbetsblad är auktoritativt: finns det inte, faller vi
  // INTE tillbaka på kandidatplatserna (det betyder "saknas", inte "leta annars").
  if (overridePath) return fs.existsSync(overridePath) ? overridePath : null;
  return WORKBOOK_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

function splitRow(line) {
  return String(line).split(/[,;\t]/).map((cell) => cell.trim());
}

// Kolumnerna som identifierar TJÄNSTEN (inte dokumentkopplingar). Allt annat i
// headern behandlas som en "dokumentkolumn": en ifylld cell där är en koppling.
const IDENTITY_HEADERS = new Set([
  'srvid',
  'srv_id',
  'id',
  'tjanstid',
  'varumarke',
  'tjanst',
  'service',
  'service_id',
  'clinic',
  'name',
]);

function documentColumnIndexes(header) {
  const cols = (header || []).map((cell, i) =>
    IDENTITY_HEADERS.has(String(cell).trim().toLowerCase()) ? -1 : i
  );
  const known = cols.filter((i) => i >= 0);
  // Ingen identifierbar rubrik -> fallback: kolumn 3+ (srvId, varumärke, tjänst).
  return known.length ? known : (header || []).map((_, i) => i).filter((i) => i >= 3);
}

function parseWorkbook(workbookPath) {
  const raw = fs.readFileSync(workbookPath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines.length ? splitRow(lines[0]) : [];
  const rows = lines.slice(1).map(splitRow);
  return { header, rows };
}

/**
 * Arbetsbladet anses "ifyllt" när minst en datarad har en ifylld cell i en
 * DOKUMENTkolumn — dvs när tjänst->dokument-kopplingen faktiskt är ifylld.
 * Enbart listade tjänster (t.ex. `srvId;varumärke;tjänst` ifyllda) räknas
 * INTE som ifyllt: katalogramråden är fortfarande bara förberedda (tomma).
 */
function isWorkbookFilled(parsed) {
  // Accepterar antingen `parseWorkbook`-resultatet ({ header, rows }) eller en
  // ren rad-array av råa strängar (direktanrop i tester).
  const isPlainArray = Array.isArray(parsed);
  const header = isPlainArray ? [] : (parsed && parsed.header) || [];
  const rawRows = isPlainArray ? parsed : (parsed && parsed.rows) || [];
  const rows = rawRows.map((row) => (Array.isArray(row) ? row : splitRow(row)));
  const docCols = documentColumnIndexes(header);
  return rows.some((row) => {
    if (docCols.length) {
      return docCols.some((ci) => String(row[ci] || '').trim().length > 0);
    }
    // Ingen identifierbar dokumentkolumn -> räkna "ifylld" om någon cell är ifylld.
    return row.some((cell) => String(cell || '').trim().length > 0);
  });
}

/**
 * Validera katalogen mot arbetsbladet.
 * @param {object} [options]
 * @param {string} [options.catalogPath]  Överstyr katalogfilen (tests).
 * @param {string} [options.workbookPath] Överstyr arbetsbladet (tests).
 * @returns {{ workbookFound: boolean, workbookFilled: boolean, warnings: string[] }}
 */
function validate({ catalogPath = CATALOG_PATH, workbookPath } = {}) {
  const result = { workbookFound: false, workbookFilled: false, warnings: [] };

  const catalog = fs.existsSync(catalogPath)
    ? JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    : null;
  const types = catalog && Array.isArray(catalog.types) ? catalog.types : [];

  const found = findWorkbook(workbookPath);
  if (!found) {
    result.workbookFound = false;
    return result;
  }
  result.workbookFound = true;

  const parsed = parseWorkbook(found);
  result.workbookFilled = isWorkbookFilled(parsed);
  if (!result.workbookFilled) return result;

  for (const row of types) {
    const hasServiceIds = Array.isArray(row.serviceIds) && row.serviceIds.length > 0;
    if (!hasServiceIds) {
      result.warnings.push(
        `katalograd ${row.id} — "${row.name}" saknar serviceIds (arbetsbladet är ifyllt)`
      );
    }
  }

  return result;
}

module.exports = { validate, findWorkbook, parseWorkbook, isWorkbookFilled, CATALOG_PATH };
