'use strict';

/**
 * ORD-CM-26 · AMEX-matchningsmotorn (ägar-GO 2026-07-19).
 * Kortutdrags-CSV:er (AMEX-export) matchas mot CM-records UTAN belopp:
 * datum (rawItem.receivedAt ±fönster) + leverantörstoken → EXAKT EN kandidat
 * krävs, annars ingen ändring ("vi gissar inget"). Fyller endast tomma fält
 * via cmStore.applyReextraction (fill-only-empty, ORD-72-principen).
 */

/** Parsar AMEX-CSV (Datum,Beskrivning,Belopp,... MM/DD/YYYY, sv decimalkomma). */
function parseAmexCsv(text) {
  const rader = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    // CSV med citerade fält: enkel state-parser
    const cols = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) {
        cols.push(cur);
        cur = '';
      } else cur += ch;
    }
    cols.push(cur);
    const m = String(cols[0] || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) continue;
    const belopp = Number(
      String(cols[2] || '')
        .replace(/\./g, '')
        .replace(',', '.')
    );
    if (!Number.isFinite(belopp) || belopp <= 0) continue; // betalningar/krediter skippas
    rader.push({
      datum: `${m[3]}-${m[1]}-${m[2]}`,
      beskrivning: String(cols[1] || '').trim(),
      belopp,
    });
  }
  return rader;
}

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-zåäö0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

/** Matcha en record (namn + datum) mot CSV-rader. Kräver exakt EN träff. */
function findUniqueMatch(record, rawItem, csvRows, { windowDays = 4 } = {}) {
  const recTokens = new Set([
    ...tokens(record.supplierName),
    ...tokens((rawItem && rawItem.fromEmail ? rawItem.fromEmail.split('@')[1] : '') || ''),
  ]);
  if (!recTokens.size) return null;
  const bas = (rawItem && rawItem.receivedAt) || record.date || record.createdAt || '';
  const basMs = Date.parse(String(bas).slice(0, 10));
  if (!Number.isFinite(basMs)) return null;
  const träffar = csvRows.filter((r) => {
    const dMs = Date.parse(r.datum);
    if (Math.abs(dMs - basMs) > windowDays * 86400000) return false;
    const beskr = r.beskrivning.toLowerCase();
    for (const t of recTokens) if (beskr.includes(t)) return true;
    return false;
  });
  return träffar.length === 1 ? träffar[0] : null;
}

/**
 * Kör matchningen över alla öppna records utan belopp.
 * @returns {object} summering { candidates, matched, filled, ambiguous }
 */
function matchAmexCsv({ cmStore, csvText, windowDays = 4 } = {}) {
  if (!cmStore) throw new Error('cmStore krävs');
  const csvRows = parseAmexCsv(csvText);
  const öppna = [...cmStore.getInbox(), ...cmStore.getNeedsReview()].filter(
    (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i && !(Number(r.amountIncVat) > 0)
  );
  const res = { csvRows: csvRows.length, candidates: öppna.length, filled: 0, details: [] };
  for (const rec of öppna) {
    const raw =
      rec.rawItemId && typeof cmStore.getRawItemById === 'function'
        ? cmStore.getRawItemById(rec.rawItemId)
        : null;
    const träff = findUniqueMatch(rec, raw, csvRows, { windowDays });
    if (!träff) continue;
    const changed = cmStore.applyReextraction(rec.id, {
      amountIncVat: träff.belopp,
      currency: 'SEK',
      date: rec.date || träff.datum,
    });
    if (changed && (changed.changed || changed).length !== 0) {
      res.filled += 1;
      if (res.details.length < 30)
        res.details.push({
          id: rec.id,
          lev: rec.supplierName,
          belopp: träff.belopp,
          datum: träff.datum,
        });
    }
  }
  return res;
}

module.exports = { parseAmexCsv, findUniqueMatch, matchAmexCsv };
