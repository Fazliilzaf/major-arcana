#!/usr/bin/env node
'use strict';

/**
 * Läs-bara som standard. Två underhållssteg i patientregistret:
 *
 *  1. Deduplicera identiska id:n — om samma patient-id förekommer på flera
 *     rader (t.ex. en kopia med drive-journal och en utan) slås de ihop till
 *     en post: drive/kliento förenas, matchStatus blir 'matched' när både
 *     kliento och drive finns.
 *
 *  2. Promote högkonfidens-patienter — patienter med matchStatus
 *     'needs_review'/'unmatched' vars e-post + telefon + namn är UNIKA i
 *     registret (ingen kollision) och vars matchConfidence ≥ 0.9 får rätt
 *     status: 'matched' om drive-journal finns, annars 'cliento_only'.
 *
 *     Detta av-flaggar bara "klistriga" needs_review-flaggor på entydigt
 *     identifierade personer. Lågkonfidens (namn-fallback), delad kontakt
 *     (olika namn) och vanliga namn lämnas orörda — de kräver människa.
 *
 *   node scripts/promote-confident-patients.js --patients <path> [--commit]
 */

const fs = require('node:fs');

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
const validEmail = (e) => e.length > 3 && e.includes('@');
const validPhone = (p) => p.length >= 7;

function loadPatients(pm) {
  const raw = (pm.tenants && pm.tenants[TENANT] && pm.tenants[TENANT].patients) || [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function dedupeByIdenticalId(patients) {
  const byId = new Map();
  patients.forEach((p) => {
    if (!byId.has(p.id)) byId.set(p.id, []);
    byId.get(p.id).push(p);
  });
  const out = [];
  const report = [];
  for (const [id, copies] of byId) {
    if (copies.length === 1) {
      out.push(copies[0]);
      continue;
    }
    let base = null;
    let drive = null;
    let hasCliento = false;
    let maxConf = 0;
    const emails = new Set();
    const phones = new Set();
    for (const c of copies) {
      if (!base) base = c;
      if (c.drive) drive = c.drive;
      if (c.cliento) hasCliento = true;
      maxConf = Math.max(maxConf, Number(c.matchConfidence) || 0);
      (c.emails || []).forEach((e) => emails.add(e));
      if (c.primaryEmail) emails.add(c.primaryEmail);
      (c.phones || []).forEach((p) => phones.add(p));
      if (c.primaryPhone) phones.add(c.primaryPhone);
    }
    const merged = {
      ...base,
      emails: [...emails].filter(Boolean),
      phones: [...phones].filter(Boolean),
      primaryEmail: base.primaryEmail || [...emails][0] || '',
      primaryPhone: base.primaryPhone || [...phones][0] || '',
      drive,
      matchConfidence: maxConf,
      matchStatus: drive && hasCliento ? 'matched' : base.matchStatus,
    };
    out.push(merged);
    report.push({
      id,
      name: merged.displayName,
      fromStatuses: copies.map((c) => c.matchStatus),
      to: merged.matchStatus,
    });
  }
  return { patients: out, report };
}

function buildIndexes(patients) {
  const emailIdx = new Map();
  const phoneIdx = new Map();
  const nameIdx = new Map();
  const byId = new Map();
  patients.forEach((p) => {
    byId.set(p.id, p);
    const es = new Set((p.emails || []).map(normEmail).filter(validEmail));
    if (validEmail(p.primaryEmail)) es.add(normEmail(p.primaryEmail));
    es.forEach((e) => {
      if (!emailIdx.has(e)) emailIdx.set(e, []);
      emailIdx.get(e).push(p.id);
    });
    const ps = new Set((p.phones || []).map(phoneKey).filter(validPhone));
    if (validPhone(p.primaryPhone)) ps.add(phoneKey(p.primaryPhone));
    ps.forEach((k) => {
      if (!phoneIdx.has(k)) phoneIdx.set(k, []);
      phoneIdx.get(k).push(p.id);
    });
    const n = normName(p.displayName);
    if (n) {
      if (!nameIdx.has(n)) nameIdx.set(n, []);
      nameIdx.get(n).push(p.id);
    }
  });
  return { emailIdx, phoneIdx, nameIdx, byId };
}

function main() {
  const args = parseArgs(process.argv);
  const pm = JSON.parse(fs.readFileSync(args.patientsPath, 'utf8'));
  const original = loadPatients(pm);

  const deduped = dedupeByIdenticalId(original);
  const patients = deduped.patients;
  const { emailIdx, phoneIdx, nameIdx, byId } = buildIndexes(patients);
  const nameOf = (id) => (byId.get(id) ? byId.get(id).displayName : '?');

  const flagged = patients.filter(
    (p) => p && (p.matchStatus === 'needs_review' || p.matchStatus === 'unmatched')
  );
  const toPromote = [];
  for (const p of flagged) {
    const es = new Set((p.emails || []).map(normEmail).filter(validEmail));
    if (validEmail(p.primaryEmail)) es.add(normEmail(p.primaryEmail));
    const ps = new Set((p.phones || []).map(phoneKey).filter(validPhone));
    if (validPhone(p.primaryPhone)) ps.add(phoneKey(p.primaryPhone));
    const n = normName(p.displayName);
    if (es.size === 0 && ps.size === 0) continue; // ingen kontakt → kan ej matcha
    let sharedDiff = false;
    let sharedSame = false;
    for (const e of es) {
      for (const id of emailIdx.get(e) || []) {
        if (id === p.id) continue;
        if (normName(nameOf(id)) === n) sharedSame = true;
        else sharedDiff = true;
      }
    }
    for (const k of ps) {
      for (const id of phoneIdx.get(k) || []) {
        if (id === p.id) continue;
        if (normName(nameOf(id)) === n) sharedSame = true;
        else sharedDiff = true;
      }
    }
    if (sharedDiff || sharedSame) continue; // delad kontakt
    if ((nameIdx.get(n) || []).some((id) => id !== p.id)) continue; // vanligt namn
    const conf = Number(p.matchConfidence) || 0;
    if (conf < 0.9) continue; // lågkonfidens → behåll granskning
    toPromote.push({
      id: p.id,
      from: p.matchStatus,
      to: p.drive ? 'matched' : 'cliento_only',
      name: p.displayName,
    });
  }

  const fromTo = {};
  for (const item of toPromote) {
    const p = byId.get(item.id);
    const key = `${item.from}->${item.to}`;
    fromTo[key] = (fromTo[key] || 0) + 1;
    p.matchStatus = item.to;
  }

  const report = {
    torrkorning: !args.commit,
    dedupe: deduped.report,
    promoted: toPromote.length,
    fromTo,
  };

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.patientsPath}.bak-promote-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.patientsPath, backup);
  pm.tenants[TENANT].patients = patients;
  pm.updatedAt = new Date().toISOString();
  fs.writeFileSync(args.patientsPath, JSON.stringify(pm), 'utf8');

  report.torrkorning = false;
  report.backup = backup;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { dedupeByIdenticalId, buildIndexes };
