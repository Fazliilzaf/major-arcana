#!/usr/bin/env node
'use strict';

/**
 * Read-only som standard. Slår ihop äkta patient-dubbletter (samma e-post +
 * samma/snarlikt namn) i patientregistret. Sekundärpatienten markeras
 * matchStatus='merged' (göms från aktiva vyer men behålls för audit), dess
 * e-post/telefon/sourceId flyttas till primärpatienten.
 *
 * Täckta grupper (verifierade via bokningsdatan, samma person):
 *   • fredrik@berga19.se — Fredrik Jonasson / FREDRIK JONASSON (case)
 *   • carljohanvahlen@gmail.com — Carl-Johan Vahlén ×2
 *
 *   node scripts/merge-duplicate-patients.js --patients <path> [--commit]
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

const norm = (v) =>
  String(v || '')
    .trim()
    .toLowerCase();

function mergePatient(primary, secondary) {
  const emails = new Set([
    primary.primaryEmail,
    ...(primary.emails || []),
    secondary.primaryEmail,
    ...(secondary.emails || []),
  ]);
  const phones = new Set([
    primary.primaryPhone,
    ...(primary.phones || []),
    secondary.primaryPhone,
    ...(secondary.phones || []),
  ]);
  const merged = { ...primary };
  merged.emails = [...emails].filter(Boolean);
  merged.phones = [...phones].filter(Boolean);
  merged.primaryEmail = primary.primaryEmail || secondary.primaryEmail || merged.emails[0] || '';
  merged.primaryPhone = primary.primaryPhone || secondary.primaryPhone || merged.phones[0] || '';
  // Behåll båda sourceId:na i provenance om de skiljer.
  if (
    secondary.cliento?.sourceId &&
    (!merged.cliento?.sourceId || merged.cliento.sourceId !== secondary.cliento.sourceId)
  ) {
    merged.cliento = {
      ...(merged.cliento || {}),
      mergedSourceIds: [
        ...new Set([
          ...(merged.cliento.mergedSourceIds || [merged.cliento.sourceId]),
          secondary.cliento.sourceId,
        ]),
      ].filter(Boolean),
    };
  }
  return merged;
}

function main() {
  const args = parseArgs(process.argv);
  const pm = JSON.parse(fs.readFileSync(args.patientsPath, 'utf8'));
  const patients = (pm.tenants && pm.tenants[TENANT] && pm.tenants[TENANT].patients) || [];

  const byEmail = new Map();
  patients.forEach((p, idx) => {
    for (const e of new Set([p.primaryEmail, ...(p.emails || [])].map(norm).filter(Boolean))) {
      if (!byEmail.has(e)) byEmail.set(e, []);
      byEmail.get(e).push({ patient: p, idx });
    }
  });

  const merges = [];
  for (const [email, entries] of byEmail) {
    const act = entries.filter((x) => x.patient.matchStatus !== 'merged');
    if (act.length <= 1) continue;
    // Äkta dubblett: samma epost OCH samma normaliserade namn (case-okänsligt).
    const names = new Set(act.map((x) => norm(x.patient.displayName)));
    if (names.size !== 1) continue; // olika namn → lämna (kan vara olika personer)
    // PNR-grind: om två aktiva medlemmar bär OLIKA personnummer är det inte
    // samma person — lämna gruppen för manuell granskning.
    const pnrs = new Set(
      act.map((x) => normalizePersonnummer(x.patient.personnummer)).filter(Boolean)
    );
    if (pnrs.size > 1) continue;
    // Primär = den med matchStatus 'matched' om möjligt, annars den med flest e-post/telefoner.
    const score = (p) =>
      (p.matchStatus === 'matched' ? 10 : 0) + (p.emails || []).length + (p.phones || []).length;
    act.sort((a, b) => score(b.patient) - score(a.patient));
    const primary = act[0];
    const secondaries = act.slice(1);
    merges.push({ email, primary, secondaries });
  }

  const report = {
    torrkorning: !args.commit,
    groups: merges.length,
    patientsToMerge: merges.reduce((n, m) => n + m.secondaries.length, 0),
    details: merges.map((m) => ({
      email: m.email,
      keep: m.primary.patient.displayName,
      merge: m.secondaries.map((s) => s.patient.displayName),
    })),
  };

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.patientsPath}.bak-merge-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.patientsPath, backup);

  for (const m of merges) {
    const pi = m.primary.idx;
    for (const s of m.secondaries) {
      patients[pi] = mergePatient(patients[pi], s.patient);
      patients[s.idx] = { ...s.patient, matchStatus: 'merged' };
    }
  }
  pm.updatedAt = new Date().toISOString();
  fs.writeFileSync(args.patientsPath, JSON.stringify(pm, null, 2), 'utf8');

  report.torrkorning = false;
  report.backup = backup;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main();
}
