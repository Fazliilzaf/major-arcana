#!/usr/bin/env node
//
// Sanerad rapport över tenantens medlemskap.
//
// Läser svaret från GET /api/v1/users/staff och skriver ut rollfördelning,
// dubbletter och konton som ser vilande ut. Ändrar ingenting.
//
// Anropet kräver ägar-token. Kör det själv, från din egen inloggade session
// — skriptet varken tar emot eller lagrar inloggningsuppgifter.
//
//   1. Öppna https://arcana.hairtpclinic.com/admin.html, logga in
//   2. Öppna konsolen (⌥⌘J) och kör:
//
//        await (await fetch('/api/v1/users/staff', {credentials:'same-origin'})).text()
//
//   3. Spara svaret till en fil, t.ex. ~/medlemskap.json
//   4. node scripts/ops/rapportera-medlemskap.mjs ~/medlemskap.json
//
// Eller direkt via stdin:  cat ~/medlemskap.json | node scripts/ops/rapportera-medlemskap.mjs
//
// E-post maskeras i utskriften. Endpointen returnerar inga lösenordshashar
// eller MFA-hemligheter — toSafeUser i authStore.js har redan tagit bort dem —
// så filen du sparar innehåller inga inloggningsuppgifter. Men den innehåller
// kollegornas adresser, så radera den när du är klar och committa den inte.

import { readFileSync } from 'node:fs';

function maskera(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '(okänd)';
  const namn = s.slice(0, at);
  const domän = s.slice(at);
  const synligt = namn.slice(0, Math.min(2, namn.length));
  return `${synligt}${'•'.repeat(Math.max(3, namn.length - 2))}${domän}`;
}

function läsIn() {
  const fil = process.argv[2];
  const rå = fil ? readFileSync(fil, 'utf8') : readFileSync(0, 'utf8');
  let data;
  try {
    data = JSON.parse(rå);
  } catch {
    console.error('  Kunde inte tolka JSON. Fick du med hela svaret?');
    process.exit(1);
  }
  // Svaret kan vara { tenantId, members } eller bara listan.
  const members = Array.isArray(data) ? data : data.members;
  if (!Array.isArray(members)) {
    console.error('  Hittade ingen members-lista. Förväntade { tenantId, members: [...] }.');
    process.exit(1);
  }
  return { tenantId: data.tenantId || '(okänd)', members };
}

function rad(etikett, värde) {
  console.log(`  ${String(etikett).padEnd(34)} ${värde}`);
}

const { tenantId, members } = läsIn();

console.log(`\n  Tenant: ${tenantId}`);
console.log(`  ${members.length} medlemskap\n`);

// ─── Roller ───────────────────────────────────────────────────────────────
const roller = new Map();
const statusar = new Map();
for (const m of members) {
  const roll = m.membership?.role || '(saknas)';
  const status = m.membership?.status || '(saknas)';
  roller.set(roll, (roller.get(roll) || 0) + 1);
  statusar.set(status, (statusar.get(status) || 0) + 1);
}

console.log('  ── Roller');
for (const [roll, n] of [...roller].sort((a, b) => b[1] - a[1])) rad(roll, n);
console.log('\n  ── Status');
for (const [s, n] of [...statusar].sort((a, b) => b[1] - a[1])) rad(s, n);

// ─── Dubbletter ───────────────────────────────────────────────────────────
const perEpost = new Map();
for (const m of members) {
  const e = String(m.user?.email || '').toLowerCase();
  if (!e) continue;
  perEpost.set(e, [...(perEpost.get(e) || []), m]);
}
const dubletter = [...perEpost].filter(([, lista]) => lista.length > 1);

console.log('\n  ── Dubbletter (samma e-post, flera medlemskap)');
if (!dubletter.length) console.log('     inga');
for (const [e, lista] of dubletter) {
  console.log(`     ${maskera(e)} — ${lista.length} poster`);
  for (const m of lista) {
    console.log(
      `        roll ${m.membership?.role}  status ${m.membership?.status}  skapad ${String(m.membership?.createdAt || '').slice(0, 10)}`
    );
  }
}

// ─── Ägare ────────────────────────────────────────────────────────────────
const ägare = members.filter((m) => String(m.membership?.role || '').toUpperCase() === 'OWNER');
console.log(`\n  ── OWNER (${ägare.length} st)`);
for (const m of ägare.sort((a, b) =>
  String(a.membership?.createdAt).localeCompare(String(b.membership?.createdAt))
)) {
  const u = m.user || {};
  const mem = m.membership || {};
  const flaggor = [
    u.mustChangePassword ? 'aldrig bytt lösenord' : null,
    !u.mfaConfigured ? 'ingen MFA' : null,
    u.status && u.status !== 'active' ? `status ${u.status}` : null,
    mem.resourceId ? `resurs ${mem.resourceId}` : 'ingen resurs',
  ].filter(Boolean);
  console.log(
    `     ${maskera(u.email).padEnd(30)} skapad ${String(mem.createdAt || '').slice(0, 10)}`
  );
  console.log(`        ${flaggor.join(' · ')}`);
  if (mem.createdBy) console.log(`        satt av ${String(mem.createdBy).slice(0, 8)}…`);
}

// ─── Vilande konton ───────────────────────────────────────────────────────
const vilande = members.filter(
  (m) => m.user?.mustChangePassword || (m.user?.status && m.user.status !== 'active')
);
console.log(`\n  ── Ser vilande ut (${vilande.length} st)`);
if (!vilande.length) console.log('     inga');
for (const m of vilande) {
  const u = m.user || {};
  console.log(
    `     ${maskera(u.email).padEnd(30)} roll ${m.membership?.role}  ${u.mustChangePassword ? 'har aldrig bytt lösenord' : ''} ${u.status !== 'active' ? `status ${u.status}` : ''}`.trimEnd()
  );
}

// ─── Resurskoppling ───────────────────────────────────────────────────────
const utanResurs = members.filter(
  (m) => String(m.membership?.role || '').toUpperCase() === 'STAFF' && !m.membership?.resourceId
);
console.log(`\n  ── STAFF utan kopplad resurs (${utanResurs.length} st)`);
if (!utanResurs.length) console.log('     inga');
for (const m of utanResurs) console.log(`     ${maskera(m.user?.email)}`);
console.log(
  '\n  STAFF utan resourceId kan inte skriva egna block — assertCalendarBlockScope\n' +
    '  nekar dem (ccoBookings.js:420). Det är avsiktligt, men de kan alltså inte\n' +
    '  sköta sin egen lunch förrän de får en resurs.\n'
);
