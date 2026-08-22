'use strict';

/**
 * verify-cco-html-inventory.js
 *
 * Håller docs/ops/cco-html-surface-inventory-2026-08-22.md sann.
 *
 * Vad testet gör:
 *   1. Listar ALLA HTML-filer under public/ (inkl. untracked — de räknas,
 *      eftersom en ocommittad fil är en klassificering som saknas).
 *   2. Jämför mot den klassificerade inventeringen (docs/ops/…json).
 *   3. FAILAR om en HTML-fil saknar klass — dvs. en ny yta har dykt upp
 *      utan att någon bestämt om den är live, underlag, kandidat eller
 *      arbetsfil.
 *
 * Det fångar två fel som hänt upprepade gånger:
 *   - ny oklassad yta (någon lägger en HTML utan att säga vad den är)
 *   - arbetskopia-förväxling (en fil som ligger lokalt men inte i git
 *     syns här som "arbetsfil_utanfor_git" — inte som en riktig yta)
 *
 * Användning:
 *   node scripts/verify-cco-html-inventory.js
 *   npm run check:html-inventory  (se package.json)
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_JSON = path.join(ROOT, 'docs', 'ops', 'cco-html-surface-inventory.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

function fail(message) {
  console.error('❌ CCO HTML-inventering: ' + message);
  process.exitCode = 1;
}

function listHtmlFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listHtmlFiles(full));
    else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, full));
  }
  return out.sort();
}

function loadInventory() {
  if (!fs.existsSync(INVENTORY_JSON)) {
    fail(`saknar ${INVENTORY_JSON} — kör genereringen först`);
    return null;
  }
  return JSON.parse(fs.readFileSync(INVENTORY_JSON, 'utf8'));
}

function gitUntracked() {
  try {
    const out = cp.execSync('git status --porcelain public', { cwd: ROOT }).toString();
    return new Set(
      out
        .split('\n')
        .filter((l) => l.startsWith('??'))
        .map((l) => l.slice(3).trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

const files = listHtmlFiles(PUBLIC_DIR);
const inventory = loadInventory();
if (!inventory) process.exit(1);

const untracked = gitUntracked();
const known = new Map(inventory.map((entry) => [entry.path, entry.klass]));
const VALID_CLASSES = new Set(['live', 'underlag', 'kandidat', 'arbetsfil_utanfor_git']);

let problems = 0;

for (const file of files) {
  const klass = known.get(file);
  if (!klass) {
    const isUntracked = untracked.has(file);
    fail(
      `oklassad yta: ${file}${isUntracked ? ' (untracked — arbetsfil som aldrig klassificerats)' : ''}. ` +
        'Lägg till den i docs/ops/cco-html-surface-inventory.json med klass live|underlag|kandidat|arbetsfil_utanfor_git.'
    );
    problems++;
    continue;
  }
  if (!VALID_CLASSES.has(klass)) {
    fail(`ogiltig klass "${klass}" för ${file}`);
    problems++;
  }
  // En fil som nu är untracked men står som live/underlag/kandidat i
  // inventeringen är en arbetskopia-förväxling — flagga den.
  if (untracked.has(file) && klass !== 'arbetsfil_utanfor_git') {
    fail(
      `${file} är untracked i arbetskopian men klassad som ${klass} — filen finns inte i git, ` +
        'klassificera om till arbetsfil_utanfor_git eller committa den.'
    );
    problems++;
  }
}

// Motsatt riktning: en klassad fil som inte längre finns (raderad) — informativt.
for (const entry of inventory) {
  if (!files.includes(entry.path)) {
    console.warn(`⚠️  ${entry.path} är klassad (${entry.klass}) men finns inte på disk — raderad? Uppdatera inventeringen.`);
  }
}

if (problems === 0) {
  console.log(`✅ CCO HTML-inventering OK: ${files.length} filer, alla klassificerade.`);
} else {
  console.error(`❌ ${problems} problem i CCO HTML-inventeringen.`);
  process.exitCode = 1;
}
