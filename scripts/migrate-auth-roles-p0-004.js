'use strict';

/**
 * migrate-auth-roles-p0-004.js — säker, deterministisk roll-migrering.
 *
 * P0-004 (fryst): legacy-roller i auth.json (memberships) mappas till
 * kanoniska roller:
 *   STAFF    → PERSONAL   (säker default, ingen eskallation)
 *   OPERATOR → PERSONAL
 *   REVISOR  → FINANCE
 *   DOCTOR   → KONSULT
 *   OWNER    → OWNER      (bevaras alltid)
 *
 * REGLER:
 *   - Idempotent: att köra två gånger ger samma resultat (endast legacy
 *     omskrivs; kanoniska värden rörs aldrig).
 *   - Tyst eskalation är FÖRBJUDEN: endast dokumenterade legacy-alias mappas;
 *     okända roller lämnas orörda OCH rapporteras (ingen gissning).
 *   - Backup skrivs till <file>.bak-<yyyyMMdd-HHmmss> före ändring.
 *   - Körs ALDRIG implicit mot prod; byggaren rapporterar bara.

 * Användning:
 *   node scripts/migrate-auth-roles-p0-004.js [path-to-auth.json]
 *   AUTH_STORE_PATH=/path node scripts/migrate-auth-roles-p0-004.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { normalizeRole } = require('../src/security/roles');

function main() {
  const filePath =
    process.argv[2] || process.env.AUTH_STORE_PATH || path.join(process.cwd(), 'data/auth.json');
  if (!fs.existsSync(filePath)) {
    console.error(`auth.json saknas: ${filePath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const memberships = raw.memberships || {};
  let changed = 0;

  const now = new Date()
    .toISOString()
    .replace(/[-:TZ]/g, '')
    .slice(0, 14);

  for (const [id, m] of Object.entries(memberships)) {
    const original = m.role;
    // Endast dokumenterade legacy-alias mappas. Kanoniska värden (OWNER/
    // KONSULT/PERSONAL/FINANCE/PATIENT) normaliserar till sig själva och
    // skrivs därför inte om → idempotent.
    const mapped = normalizeRole(original);
    // normalizeRole ger det kanoniska UPPERCASE-värdet, eller '' för ogiltig.
    if (!mapped) {
      console.warn(`  SKIP okänd roll "${original}" (membership ${id}) — ingen gissning.`);
      continue;
    }
    if (mapped === original) {
      continue; // redan kanonisk → ingen ändring
    }
    // Skyddsregel: eskalerar vi? legacy→kanonisk är här alltid till personlig
    // operativ/klinisk/finans-roll enligt fryst beslut — aldrig till OWNER.
    memberships[id].role = mapped;
    changed += 1;
    console.log(`  MIGRERA membership ${id}: ${original} → ${mapped}`);
  }

  if (changed === 0) {
    console.log('Ingen roll-migrering behövs — alla memberships är redan kanoniska.');
    process.exit(0);
  }

  const backup = `${filePath}.bak-${now}`;
  fs.copyFileSync(filePath, backup);
  fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
  console.log(`\nMigrerade ${changed} memberships. Backup: ${backup}`);
}

main();
