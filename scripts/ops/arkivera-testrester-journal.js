#!/usr/bin/env node
'use strict';

/**
 * ORD-166 — arkivera och ta bort smoke-testets rester ur produktionsjournalen.
 *
 * Ägarbeslut 2026-09-02: modell B — arkivera, ta sedan bort. Inte radera rakt av.
 *
 * Bakgrund: ett smoke-test och en pilotkörning skrev 767 journalposter i prod
 * 2–3 juni 2026. Fyra patient-id, ingen av dem i cco-patient-master, samtliga
 * consultation_plan med tomma fält, 764 markerade som signerade och låsta.
 * De utgör 12,9 % av journalen och förorenar varje mätning.
 *
 * KRITERIET ÄR TVÅDELAT — både tenant och patient-id. Att gå på stavningen
 * ensam vore fel: en framtida riktig rad som råkar få `hairtpclinic` från någon
 * av kodens 52 defaulter ska inte kunna svepas med.
 *
 * Torrkörning är standard. `--apply` krävs för att skriva.
 *
 *   node scripts/ops/arkivera-testrester-journal.js
 *   node scripts/ops/arkivera-testrester-journal.js --apply
 *
 * Exitkoder: 0 ok · 1 fel · 2 antalet stämmer inte med det förväntade
 */

const fs = require('node:fs');
const path = require('node:path');

const JOURNAL = process.env.ARCANA_JOURNAL_PATH || '/var/data/cco-journal.json';
const ARKIV_DIR = process.env.ARCANA_ARKIV_DIR || '/var/data/arkiv';

/** Mönster för patient-id som aldrig hör hemma i en produktionsjournal. */
const TEST_PATIENT = /^(cco-readiness-smoke|cco-pilot-|cco-smoke|uat-|test-)/i;

/** Stavningen resterna bär. Ensam är den inte tillräcklig — se kriteriet nedan. */
const LEGACY_TENANT = 'hairtpclinic';

/** Mätt i prod 2026-09-02. Avviker antalet stannar skriptet. */
const FORVANTAT = Object.freeze({
  totalt: 767,
  perPatient: {
    'cco-readiness-smoke-1780402011': 254,
    'cco-pilot-20260602-a': 259,
    'cco-pilot-20260602-b': 253,
    'cco-pilot-20260602-c': 1,
  },
});

function arTestrest(entry) {
  return (
    String(entry?.tenantId || '').toLowerCase() === LEGACY_TENANT &&
    TEST_PATIENT.test(String(entry?.patientId || ''))
  );
}

function stamplad() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function main() {
  const apply = process.argv.includes('--apply');
  const force = process.argv.includes('--force');

  if (!fs.existsSync(JOURNAL)) {
    console.error(`Journalen finns inte: ${JOURNAL}`);
    process.exit(1);
  }

  const rad = fs.readFileSync(JOURNAL, 'utf8');
  const data = JSON.parse(rad);
  if (!Array.isArray(data.entries)) {
    console.error('Journalen har ingen entries-array — vägrar röra den.');
    process.exit(1);
  }

  const traffar = data.entries.filter(arTestrest);
  const kvar = data.entries.filter((e) => !arTestrest(e));

  const perPatient = {};
  for (const e of traffar) perPatient[e.patientId] = (perPatient[e.patientId] || 0) + 1;

  console.log(`journal:            ${JOURNAL}`);
  console.log(`poster totalt:      ${data.entries.length}`);
  console.log(`träffar:            ${traffar.length}`);
  for (const [pid, n] of Object.entries(perPatient).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(5)}  ${pid}`);
  }
  console.log(`kvar efteråt:       ${kvar.length}`);

  // Vad som INTE träffas fast man kunde tro det — ska vara tomt.
  const bara_tenant = data.entries.filter(
    (e) => String(e?.tenantId || '').toLowerCase() === LEGACY_TENANT && !arTestrest(e)
  );
  const bara_patient = data.entries.filter(
    (e) => TEST_PATIENT.test(String(e?.patientId || '')) && !arTestrest(e)
  );
  console.log(`\nrader med ${LEGACY_TENANT} som INTE är testpatienter: ${bara_tenant.length}`);
  console.log(`testpatienter som INTE bär ${LEGACY_TENANT}:           ${bara_patient.length}`);
  if (bara_tenant.length || bara_patient.length) {
    console.log('   → kriteriet är tvådelat av ett skäl. Läs listan innan du kör skarpt:');
    for (const e of [...bara_tenant, ...bara_patient].slice(0, 20)) {
      console.log(`     ${e.entryId}  ${e.tenantId}  ${e.patientId}  ${e.journalType}`);
    }
  }

  const avvikelser = [];
  if (traffar.length !== FORVANTAT.totalt) {
    avvikelser.push(`totalt ${traffar.length}, förväntat ${FORVANTAT.totalt}`);
  }
  for (const [pid, n] of Object.entries(FORVANTAT.perPatient)) {
    if ((perPatient[pid] || 0) !== n) {
      avvikelser.push(`${pid}: ${perPatient[pid] || 0}, förväntat ${n}`);
    }
  }
  for (const pid of Object.keys(perPatient)) {
    if (!(pid in FORVANTAT.perPatient)) avvikelser.push(`okänd testpatient: ${pid}`);
  }

  if (avvikelser.length) {
    console.error('\nAvviker från mätningen i ORD-166:');
    for (const a of avvikelser) console.error(`   ${a}`);
    if (!force) {
      console.error('\nStannar. Datan har ändrats sedan ordern skrevs — mät om innan du kör.');
      console.error('(--force kör ändå, men då ska avvikelsen vara förstådd och nedskriven.)');
      process.exit(2);
    }
    console.error('\n--force angivet, fortsätter trots avvikelsen.');
  }

  if (!apply) {
    console.log('\nTORRKÖRNING — inget skrivet. Kör med --apply när listan ovan stämmer.');
    return;
  }

  if (!traffar.length) {
    console.log('\nInget att arkivera.');
    return;
  }

  const stamp = stamplad();
  fs.mkdirSync(ARKIV_DIR, { recursive: true });

  // 1. Arkivet först. Går det inte att skriva och läsa tillbaka rörs journalen inte.
  const arkivFil = path.join(ARKIV_DIR, `cco-journal-testrester-${stamp}.json`);
  fs.writeFileSync(
    arkivFil,
    JSON.stringify(
      {
        order: 'ORD-166',
        arkiveradAt: new Date().toISOString(),
        anledning:
          'Rester från smoke-test/pilot 2026-06-02–03. Fyra patient-id utan post i ' +
          'cco-patient-master, tomma fält, skrivna som signerade consultation_plan.',
        kriterium: { tenantId: LEGACY_TENANT, patientIdMonster: String(TEST_PATIENT) },
        antal: traffar.length,
        perPatient,
        entries: traffar,
      },
      null,
      2
    )
  );
  const kontroll = JSON.parse(fs.readFileSync(arkivFil, 'utf8'));
  if (kontroll.entries.length !== traffar.length) {
    console.error('Arkivet gick inte att läsa tillbaka intakt. Journalen är orörd.');
    process.exit(1);
  }
  console.log(`\narkiv skrivet:      ${arkivFil}  (${kontroll.entries.length} poster)`);

  // 2. Backup av journalen, samma mönster som pre-cleanup-filerna i /var/data.
  const backup = `${JOURNAL}.pre-ord166-${stamp}.json`;
  fs.writeFileSync(backup, rad);
  console.log(`backup skriven:     ${backup}`);

  // 3. Först nu tas raderna bort.
  data.entries = kvar;
  data.updatedAt = new Date().toISOString();
  delete data._indexes; // byggs om vid nästa laddning
  fs.writeFileSync(JOURNAL, JSON.stringify(data, null, 2));

  const efter = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  const kvarTest = efter.entries.filter(arTestrest).length;
  console.log(`journal skriven:    ${efter.entries.length} poster, ${kvarTest} testrester kvar`);
  if (kvarTest !== 0 || efter.entries.length !== kvar.length) {
    console.error('Resultatet stämmer inte. Återställ från backupen ovan.');
    process.exit(1);
  }
  console.log('\nKlart.');
}

if (require.main === module) main();

module.exports = { arTestrest, TEST_PATIENT, LEGACY_TENANT, FORVANTAT };
