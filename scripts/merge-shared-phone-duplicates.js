#!/usr/bin/env node
'use strict';

/**
 * Läs-bara som standard. Slår ihop patienter som delar telefonnummer och där
 * den enas namn är en ren förkortning av den andras ("Ali" → "Ali Ibrahim").
 *
 *   • endast "saker"-nivå: namnet är ett prefix/underset av det andra namnet.
 *   • det fullständigare namnet behålls, det förkortade markeras matchStatus='merged'
 *     (göms men behålls för audit) och dess e-post/telefon flyttas över.
 *   • "typo" (stavfel i efternamn) och "namnbyte" (olika efternamn) lämnas —
 *     de kräver människa.
 *
 *   node scripts/merge-shared-phone-duplicates.js --patients <path> [--commit]
 */

const fs = require('node:fs');
const { normalizePersonnummer } = require('./migration/lib/migrationUtils');

const TENANT = 'hair-tp-clinic';

function parseArgs(argv) {
  const args = { patientsPath: '', commit: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--patients') args.patientsPath = argv[++i] || '';
    else if (a === '--commit') args.commit = true;
  }
  if (!args.patientsPath || !fs.existsSync(args.patientsPath)) {
    throw new Error('--patients <path> krävs och måste finnas.');
  }
  return args;
}

const normEmail = (v) =>
  String(v || '')
    .trim()
    .toLowerCase();
const phoneKey = (v) =>
  String(v || '')
    .replace(/\D/g, '')
    .slice(-9);
const normName = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const validPhone = (p) => p.length >= 7;
const tok = (v) => normName(v).split(' ').filter(Boolean);
const isPrefix = (x, y) => x.length <= y.length && x.every((t, i) => t === y[i]);

const statusRank = (s) => ({ matched: 3, cliento_only: 2, needs_review: 1, unmatched: 0 })[s] || 0;

function chooseKeep(a, b) {
  const ta = tok(a.displayName).length;
  const tb = tok(b.displayName).length;
  if (ta !== tb) return ta > tb ? a : b; // fullständigare namn vinner
  const ra = statusRank(a.matchStatus);
  const rb = statusRank(b.matchStatus);
  if (ra !== rb) return ra > rb ? a : b;
  const data = (p) => (p.emails || []).length + (p.phones || []).length + (p.drive ? 1 : 0);
  return data(a) >= data(b) ? a : b;
}

function findSafeMerges(patients) {
  const phoneIdx = new Map();
  for (const p of patients) {
    const ps = new Set((p.phones || []).map(phoneKey).filter(validPhone));
    if (validPhone(p.primaryPhone)) ps.add(phoneKey(p.primaryPhone));
    ps.forEach((k) => {
      if (!phoneIdx.has(k)) phoneIdx.set(k, []);
      phoneIdx.get(k).push(p);
    });
  }
  const merges = [];
  for (const [phone, pats] of phoneIdx) {
    const distinct = [...new Map(pats.map((p) => [p.id, p])).values()];
    if (distinct.length < 2) continue;
    if (new Set(distinct.map((p) => normName(p.displayName))).size < 2) continue;
    let best = null;
    for (let i = 0; i < distinct.length; i += 1) {
      for (let j = i + 1; j < distinct.length; j += 1) {
        const a = distinct[i];
        const b = distinct[j];
        if (a.matchStatus === 'merged' || b.matchStatus === 'merged') continue;
        const na = tok(a.displayName);
        const nb = tok(b.displayName);
        if (!na.length || !nb.length) continue;
        const ns = isPrefix(na, nb) || isPrefix(nb, na) ? 1 : na[0] === nb[0] ? 0.8 : 0;
        if (!best || ns > best.ns) best = { a, b, ns };
      }
    }
    if (!best || best.ns !== 1) continue;
    const keep = chooseKeep(best.a, best.b);
    const merge = keep === best.a ? best.b : best.a;
    // PNR-grind: om båda bär personnummer och de skiljer sig är det inte samma
    // person — lämna för manuell granskning.
    const keepPnr = normalizePersonnummer(keep.personnummer);
    const mergePnr = normalizePersonnummer(merge.personnummer);
    if (keepPnr && mergePnr && keepPnr !== mergePnr) continue;
    merges.push({ phone, keep, merge });
  }
  return merges;
}

function applyMerge(keep, merge) {
  keep.emails = [
    ...new Set(
      [
        keep.primaryEmail,
        merge.primaryEmail,
        ...(keep.emails || []),
        ...(merge.emails || []),
      ].filter(Boolean)
    ),
  ];
  keep.phones = [
    ...new Set(
      [
        keep.primaryPhone,
        merge.primaryPhone,
        ...(keep.phones || []),
        ...(merge.phones || []),
      ].filter(Boolean)
    ),
  ];
  keep.primaryEmail = keep.primaryEmail || merge.primaryEmail || keep.emails[0] || '';
  keep.primaryPhone = keep.primaryPhone || merge.primaryPhone || keep.phones[0] || '';
  merge.matchStatus = 'merged';
}

function main() {
  const args = parseArgs(process.argv);
  const pm = JSON.parse(fs.readFileSync(args.patientsPath, 'utf8'));
  const patients = (pm.tenants && pm.tenants[TENANT] && pm.tenants[TENANT].patients) || [];

  const merges = findSafeMerges(patients);
  const report = {
    torrkorning: !args.commit,
    sammanslagningar: merges.length,
    detaljer: merges.map((m) => ({
      telefon: m.phone,
      behall: m.keep.displayName,
      slaIhop: m.merge.displayName,
    })),
  };

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.patientsPath}.bak-shared-phone-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.patientsPath, backup);
  for (const m of merges) applyMerge(m.keep, m.merge);
  pm.updatedAt = new Date().toISOString();
  fs.writeFileSync(args.patientsPath, JSON.stringify(pm), 'utf8');

  report.torrkorning = false;
  report.backup = backup;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { findSafeMerges, chooseKeep };
