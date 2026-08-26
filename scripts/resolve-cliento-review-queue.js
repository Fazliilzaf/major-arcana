#!/usr/bin/env node
'use strict';

/**
 * Read-only analys: för varje kund i granskningskön kör en KOMBINERAD matchning
 * (e-post + telefon + namn tillsammans, inte sekventiellt som syncen) för att
 * hitta en entydig vinnare. Skriver en beslutslista: `resolved` (tydlig vinnare)
 * eller `ambiguous` (tvetydig — kräver människa). Skriver INTE till storen.
 *
 *   node scripts/resolve-cliento-review-queue.js \
 *     --patients /var/data/cco-patient-master.json \
 *     --csv data/351-granskningsko.csv
 */

const fs = require('node:fs');
const path = require('node:path');
const { buildClientoPatientLookup } = require(
  path.join(__dirname, '..', 'src', 'ops', 'clientoCustomerDeltaSync')
);
const { nameOverlapScore } = require(
  path.join(__dirname, '..', 'scripts', 'migration', 'lib', 'migrationUtils')
);

const TENANT = 'hair-tp-clinic';

function normalizeEmail(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}
function phoneMatchKey(v) {
  return String(v || '')
    .replace(/\D/g, '')
    .slice(-9);
}
function normalizePhone(v) {
  return String(v || '').replace(/[^\d+]/g, '');
}

function parseArgs(argv) {
  const args = { patientsPath: '', csvPath: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--patients') args.patientsPath = argv[++i] || '';
    else if (a === '--csv') args.csvPath = argv[++i] || '';
  }
  if (!args.patientsPath || !args.csvPath) throw new Error('--patients och --csv krävs.');
  if (!fs.existsSync(args.patientsPath)) throw new Error(`Hittar inte ${args.patientsPath}`);
  if (!fs.existsSync(args.csvPath)) throw new Error(`Hittar inte ${args.csvPath}`);
  return args;
}

/** Kombinerad poäng: e-post 0.92 + telefon 0.88 + namn 0.5–0.8 (summeras). */
function combinedMatch(lookup, record) {
  const scores = new Map();
  const add = (patient, delta) => {
    if (!patient?.id) return;
    scores.set(patient.id, { patient, score: (scores.get(patient.id)?.score || 0) + delta });
  };
  for (const email of record.emails || []) {
    const list = lookup.byEmail.get(normalizeEmail(email)) || [];
    list.forEach((p) => add(p, 0.92));
  }
  for (const phone of record.phones || []) {
    const list = lookup.byPhone.get(phoneMatchKey(phone)) || [];
    list.forEach((p) => add(p, 0.88));
  }
  if (record.name) {
    for (const p of lookup.allPatients) {
      const s = nameOverlapScore(p.displayName, record.name);
      if (s >= 0.7) add(p, 0.5 + s * 0.3);
    }
  }
  return [...scores.values()].sort((a, b) => b.score - a.score);
}

function classify(candidates) {
  if (!candidates.length)
    return { verdict: 'ambiguous', reason: 'inga_kandidater', candidates: [] };
  const top = candidates[0];
  const second = candidates[1];
  // Tydlig vinnare: topp ≥ 1.5 (t.ex. e-post+telefon, eller telefon+namn) och
  // ett tydligt avstånd till tvåan (≥ 0.6), eller ensam kandidat med ≥ 1.0.
  const gap = second ? top.score - second.score : top.score;
  const clear = top.score >= 1.0 && gap >= 0.6;
  return {
    verdict: clear ? 'resolved' : 'ambiguous',
    reason: clear ? 'tydlig_vinnare' : `tvetydig_topp_${top.score.toFixed(2)}`,
    candidates,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const pm = JSON.parse(fs.readFileSync(args.patientsPath, 'utf8'));
  const patients = (pm.tenants && pm.tenants[TENANT] && pm.tenants[TENANT].patients) || [];
  const lookup = buildClientoPatientLookup(patients);

  const csvLines = fs.readFileSync(args.csvPath, 'utf8').trim().split('\n').slice(1);
  const rows = csvLines
    .map((l) => l.split(';'))
    .filter((c) => c[1] === 'granska') // bara de 261 som återstår
    .map((c) => ({
      reason: c[0],
      name: c[2],
      phone: c[3],
      email: c[4],
    }));

  const out = [];
  let resolved = 0;
  let ambiguous = 0;
  for (const r of rows) {
    const record = {
      name: r.name,
      emails: r.email ? [r.email] : [],
      phones: r.phone ? [normalizePhone(r.phone)] : [],
    };
    const candidates = combinedMatch(lookup, record);
    const cls = classify(candidates);
    if (cls.verdict === 'resolved') resolved += 1;
    else ambiguous += 1;
    out.push({
      reason: r.reason,
      verdict: cls.verdict,
      reason2: cls.reason,
      name: r.name,
      phone: r.phone,
      email: r.email,
      winnerId: cls.candidates[0]?.patient?.id || '',
      winnerName: cls.candidates[0]?.patient?.displayName || '',
      topScore: cls.candidates[0]?.score?.toFixed(2) || '',
      candidates: cls.candidates.length,
    });
  }

  const header =
    'reason;verdict;varfor;namn;telefon;epost;vinnarId;vinnarNamn;topPoang;antalKandidater';
  const lines = out.map((o) =>
    [
      o.reason,
      o.verdict,
      o.reason2,
      o.name,
      o.phone,
      o.email,
      o.winnerId,
      o.winnerName,
      o.topScore,
      o.candidates,
    ]
      .map((x) => String(x).replace(/;/g, ' ').replace(/\n/g, ' '))
      .join(';')
  );
  fs.writeFileSync('data/261-beslut.csv', `\uFEFF${header}\n${lines.join('\n')}`, 'utf8');

  process.stdout.write(
    `resolved: ${resolved}\n` + `ambiguous: ${ambiguous}\n` + `skrivit data/261-beslut.csv\n`
  );
}

if (require.main === module) {
  main();
}

module.exports = { combinedMatch, classify };
