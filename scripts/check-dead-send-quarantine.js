'use strict';

/**
 * check-dead-send-quarantine — karantän för döda patientvända sändvägar
 * (ORD-153 §6-åtgärd, skiva 3).
 *
 * Tre sänddefinitioner har i dag INGEN anropare i repot. De är en tickande risk:
 * samma dag någon monterar dem utan CCO_SEND_LIVE-grind blir de live skarpt.
 * Den här grinden failar om någon av dem dyker upp utanför sin egen definitionsfil
 * — dvs. om de börjar monteras/kallas. Avsiktligt skarpt, fail-closed.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEAD_SEND_SYMBOLS = [
  {
    symbol: 'dispatchTreatmentPlanEmail',
    definingFile: path.join('src', 'ops', 'ccoCommercialMailDispatch.js'),
    label: 'dött offert-behandlingsplan-mail',
  },
  {
    symbol: 'runBookingReminders',
    definingFile: path.join('src', 'ops', 'bookingReminderScheduler.js'),
    label: 'död bokningspåminnelse-scheduler',
  },
  {
    symbol: 'marketingSmsService',
    definingFile: path.join('src', 'sms', 'marketingSmsService.js'),
    label: 'död marknadsföring-SMS-kampanj',
  },
];

function collectJsFiles(root) {
  const out = [];
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (root.endsWith('.js')) out.push(root);
    return out;
  }
  for (const name of fs.readdirSync(root)) {
    const full = path.join(root, name);
    const s = fs.statSync(full);
    if (s.isDirectory()) out.push(...collectJsFiles(full));
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function main() {
  const roots = [
    path.join(process.cwd(), 'src'),
    path.join(process.cwd(), 'server.js'),
    path.join(process.cwd(), 'scripts'),
  ];
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    files.push(...collectJsFiles(root));
  }

  const problems = [];
  const seen = new Set();
  const SELF = toPosix(path.relative(process.cwd(), __filename));
  for (const file of files) {
    const rel = toPosix(path.relative(process.cwd(), file));
    if (rel === SELF) continue; // den här grinden listar symbolerna — räkna inte sig själv
    const raw = fs.readFileSync(file, 'utf8');
    for (const entry of DEAD_SEND_SYMBOLS) {
      if (rel === entry.definingFile) continue; // definitionsfilen räknas inte
      if (!raw.includes(entry.symbol)) continue;
      const key = `${entry.symbol}:${rel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push(`${rel} → ${entry.symbol} (${entry.label})`);
    }
  }

  if (problems.length > 0) {
    console.error('[dead-send-quarantine] död sändväg monterad/anropad utan grind:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log('[dead-send-quarantine] ok: inga döda sändvägar monterade/anropade');
}

main();
