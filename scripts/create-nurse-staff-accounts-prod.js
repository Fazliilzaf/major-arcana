#!/usr/bin/env node
/**
 * Skapar staff-konton för sköterskorna med resourceId-koppling.
 *
 * Koden för staff-skapande finns redan: POST /users/staff accepterar
 * resourceId och validerar mot bokningsmotorn (assertResourceIdExists).
 * Det här skriptet genererar initiala lösenord (eller använder angivna),
 * skriver dem till en 0600-fil UTANFÖR repot, och sätter
 * mustChangePassword=true så värdet är dött vid första inloggning.
 *
 * SÄKERHET: skriptet skriver ALDRIG ut lösenord eller tokens till stdout.
 * Lösenorden skrivs bara till lösenordsfilen (0600). Tidigare läckte en
 * prod-token för att en agent skrev ut den i klartext — den upprepas inte.
 *
 * Usage:
 *   node scripts/create-nurse-staff-accounts-prod.js --dry-run   # visar plan
 *   node scripts/create-nurse-staff-accounts-prod.js --commit    # skapar konton
 *
 * Kräver env (OWNER — inte staff):
 *   ARCANA_OWNER_EMAIL + ARCANA_OWNER_PASSWORD (eller ARCANA_SMOKE_BEARER_TOKEN)
 *   NURSE_VERONICA_EMAIL, NURSE_CLARA_EMAIL, NURSE_LOUISE_EMAIL, NURSE_WENDELA_EMAIL
 *   NURSE_<NAMN>_PASSWORD (valfritt — annars genereras initiala lösenord)
 */
require('dotenv').config({ quiet: true });
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const TENANT = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const COMMIT = process.argv.includes('--commit');
// Lösenordsfil utanför repot, mode 0600. Kan pekas om via env.
const PW_FILE =
  process.env.NURSE_PW_FILE ||
  path.join(process.env.HOME || '/tmp', 'cco-nurse-initial-passwords.txt');

const NURSES = [
  { name: 'Veronica', resourceId: 'veronica' },
  { name: 'Clara', resourceId: 'clara' },
  { name: 'Louise', resourceId: 'louise' },
  { name: 'Wendela', resourceId: 'wendela' },
];

function nurseEmail(name) {
  return process.env[`NURSE_${name.toUpperCase()}_EMAIL`] || '';
}
function nursePassword(name) {
  return process.env[`NURSE_${name.toUpperCase()}_PASSWORD`] || '';
}

function generatePassword() {
  // 18 tecken, inga tvetydiga tecken (0/O/1/l/I utelämnade).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(18);
  let out = '';
  for (let i = 0; i < 18; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function getOwnerToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  // --owner --no-fallback: skapa staff-konton kräver OWNER, fallback till
  // staff-token är inte tillåtet här. Token skrivs aldrig ut.
  return execSync(
    `node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner --no-fallback`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

function readExistingPasswords() {
  try {
    const raw = fs.readFileSync(PW_FILE, 'utf8');
    const map = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Za-z]+):\s*(\S+)/);
      if (m) map[m[1]] = m[2];
    }
    return map;
  } catch {
    return {};
  }
}

function logSafe(value) {
  // Maskera känsliga värden i utskrifter — aldrig lösenord/token i klartext.
  return String(value).replace(/[A-Za-z0-9_-]{8,}/g, (m) => m.slice(0, 4) + '…');
}

async function main() {
  const missing = NURSES.filter((n) => !nurseEmail(n.name));
  if (missing.length) {
    console.error('❌ Saknar email för:', missing.map((n) => n.name).join(', '));
    console.error('Sätt NURSE_<NAMN>_EMAIL i .env');
    process.exit(1);
  }

  const existing = readExistingPasswords();
  const plan = NURSES.map((n) => ({
    name: n.name,
    email: nurseEmail(n.name),
    resourceId: n.resourceId,
    password: nursePassword(n.name) || existing[n.name] || (COMMIT ? generatePassword() : ''),
    passwordSource: nursePassword(n.name)
      ? 'angivet'
      : existing[n.name]
        ? 'befintlig (återanvänds)'
        : COMMIT
          ? 'genereras'
          : 'genereras vid --commit',
  }));

  if (plan.some((p) => !p.password)) {
    // Dry-run utan befintliga lösenord: visa plan utan att skriva ut något hemligt.
    console.log(`DRY-RUN @ ${BASE} (tenant ${TENANT}) — lösenordsfil: ${PW_FILE}`);
    for (const p of plan) {
      console.log(
        `  ${p.name} (${p.email}) resourceId=${p.resourceId} — lösenord: ${p.passwordSource}`
      );
    }
    console.log(
      '\nKör med --commit för att skapa kontona. Lösenord skrivs till 0600-filen, aldrig till stdout.'
    );
    return;
  }

  // COMMIT-läge.
  console.log(`SKAPAR staff-konton @ ${BASE} (tenant ${TENANT})`);

  // Skriv lösenordsfilen FÖRE anropen — om något failar halvvägs har vi ändå
  // lösenorden för de konton som skapades. Mode 0600, aldrig i repot.
  const pwContent = plan.map((p) => `${p.name}: ${p.password}`).join('\n') + '\n';
  fs.writeFileSync(PW_FILE, pwContent, { mode: 0o600 });
  fs.chmodSync(PW_FILE, 0o600);
  console.log(`✅ Lösenordsfil skriven (0600): ${PW_FILE}`);
  console.log(
    '   (visa respektive rad för personen, be dem byta vid första inloggning, radera filen efter överlämning)'
  );

  const token = getOwnerToken();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-arcana-client': 'major_arcana_admin',
  };

  let created = 0;
  let failed = 0;
  for (const p of plan) {
    const payload = {
      tenantId: TENANT,
      email: p.email,
      password: p.password,
      displayName: p.name,
      role: 'staff',
      resourceId: p.resourceId,
      mustChangePassword: true,
      // resourceId sparas av POST /users/staff direkt: routen validerar mot
      // motorn (assertResourceIdExists) och upsertStaffMember → ensureMembership
      // skriver in den i medlemskapet. Inget PATCH-steg behövs.
    };
    try {
      const res = await fetch(`${BASE}/api/v1/users/staff`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      const ok = res.status === 200 || res.status === 201;
      if (ok) {
        created += 1;
        console.log(
          `  ✅ ${p.name} (${p.email}) — HTTP ${res.status}, resourceId=${p.resourceId}, mustChangePassword=true`
        );
      } else {
        failed += 1;
        console.log(
          `  ❌ ${p.name} (${p.email}) — HTTP ${res.status} ${logSafe(body.error || body.message || '')}`
        );
      }
    } catch (err) {
      failed += 1;
      console.log(`  ❌ ${p.name} (${p.email}) — ${logSafe(err.message || err)}`);
    }
  }

  console.log(`\nKlart: ${created} skapade, ${failed} misslyckade.`);
  if (failed) {
    console.log(
      '⚠️  Lösenorden ligger redan i filen — kontrollera vad som misslyckades innan du kör om.'
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('❌', logSafe(err.message || err));
  process.exit(1);
});
