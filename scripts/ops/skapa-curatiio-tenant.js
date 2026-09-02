#!/usr/bin/env node
'use strict';

/**
 * ORD-165 §1a — skapa tenantet `curatiio` och medlemskapen.
 *
 * Ägarbeslut 2026-09-02: modell B, två tenants under samma org (559034-2688).
 * Åtkomsten valdes av ägaren samma dag: Fazli och Egzona som OWNER, samt
 * clara, louise, veronica och wendela som STAFF.
 *
 * Skriptet går via appens egna stores (`ensureMembership`, `getTenantConfig`)
 * i stället för att redigera JSON — då gäller validering, normalisering och
 * revisionsspår som för allt annat.
 *
 * `getTenantConfig` skapar tenantet vid första läsningen (configStore.js:766).
 * Det är alltså läsningen som materialiserar det, inte en separat create.
 *
 * Torrkörning är standard. `--apply` krävs för att skriva.
 *
 * Exitkoder: 0 ok · 1 fel · 2 förväntad person saknas
 */

const path = require('node:path');

const DATA_DIR = process.env.ARCANA_DATA_DIR || '/var/data';
const TENANT = 'curatiio';

/** Ägarens val 2026-09-02. E-post är nyckeln — resourceId sätts av storen. */
const ONSKAD_ATKOMST = Object.freeze([
  { epost: 'fazli@hairtpclinic.com', roll: 'OWNER' },
  { epost: 'egzona@hairtpclinic.com', roll: 'OWNER' },
  { epost: 'clara@hairtpclinic.com', roll: 'STAFF' },
  { epost: 'louise@hairtpclinic.com', roll: 'STAFF' },
  { epost: 'veronica@hairtpclinic.com', roll: 'STAFF' },
  { epost: 'wendela@hairtpclinic.com', roll: 'STAFF' },
]);

/**
 * Medicinskt ansvarig saknar konto i Arcana — mätt 2026-09-02, noll träffar på
 * arya/emami bland 24 användare. Ett konto kan inte skapas härifrån: det kräver
 * lösenordshantering och görs av ägaren i personaladministrationen. Raden står
 * här så att nästa körning inte tror att listan är komplett.
 */
const SAKNAR_KONTO = Object.freeze([
  { namn: 'Arya (medicinskt ansvarig)', varfor: 'ingen användare i auth.json 2026-09-02' },
]);

async function main() {
  const apply = process.argv.includes('--apply');

  // Den här körningen misslyckades tyst 2026-09-02: sex medlemskap skrevs till
  // auth.json medan servern körde, och servern skrev över dem 44 sekunder
  // senare. Vakten stoppar nu samma misstag i förväg.
  if (apply) {
    const { kravSakerSkrivning } = await import('../lib/levandeStatusfil.mjs');
    kravSakerSkrivning(path.join(DATA_DIR, 'auth.json'));
  }

  const { createAuthStore } = require('../../src/security/authStore');
  const { createTenantConfigStore } = require('../../src/tenant/configStore');

  const authStore = await createAuthStore({ filePath: path.join(DATA_DIR, 'auth.json') });
  const configStore = await createTenantConfigStore({
    filePath: path.join(DATA_DIR, 'tenant-config.json'),
  });

  const planerade = [];
  const saknade = [];
  for (const rad of ONSKAD_ATKOMST) {
    const user = await authStore.getUserByEmail(rad.epost);
    if (!user) {
      saknade.push(rad.epost);
      continue;
    }
    const befintliga = await authStore.listMembershipsForUser(user.id, { includeDisabled: true });
    const redan = befintliga.find((m) => m.tenantId === TENANT);
    planerade.push({ ...rad, userId: user.id, redanMedlem: !!redan, nuvarandeRoll: redan?.role });
  }

  console.log(`tenant:            ${TENANT}`);
  console.log(`datakatalog:       ${DATA_DIR}`);
  console.log(`planerade konton:  ${planerade.length} av ${ONSKAD_ATKOMST.length}`);
  for (const p of planerade) {
    const status = p.redanMedlem ? `finns redan (${p.nuvarandeRoll})` : 'ny';
    console.log(`   ${p.roll.padEnd(6)} ${p.epost.padEnd(30)} ${status}`);
  }

  if (saknade.length) {
    console.error(`\nSaknar användarkonto — kan inte ges medlemskap:`);
    for (const e of saknade) console.error(`   ${e}`);
    console.error('Skapa kontot i personaladministrationen först, kör sedan om.');
    process.exit(2);
  }

  if (SAKNAR_KONTO.length) {
    console.log('\nUtanför körningen, saknar konto i Arcana:');
    for (const s of SAKNAR_KONTO) console.log(`   ${s.namn} — ${s.varfor}`);
  }

  if (!apply) {
    console.log('\nTORRKÖRNING — inget skrivet. Kör med --apply när listan stämmer.');
    return;
  }

  // Läsningen materialiserar tenantet (configStore.getTenantConfig).
  const config = await configStore.getTenantConfig(TENANT);
  console.log(`\ntenant-config:     ${config?.tenantId || '(saknas)'}`);

  for (const p of planerade) {
    const m = await authStore.ensureMembership({
      userId: p.userId,
      tenantId: TENANT,
      role: p.roll,
      createdBy: null,
      resourceId: p.epost.split('@')[0],
    });
    console.log(`   ${m.role.padEnd(6)} ${p.epost.padEnd(30)} ${m.status}  ${m.id}`);
  }

  console.log('\nKlart. Verifiera med en läsande mätning innan något förlitar sig på det.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FEL:', err.message);
    process.exit(1);
  });
}

module.exports = { ONSKAD_ATKOMST, SAKNAR_KONTO, TENANT };
