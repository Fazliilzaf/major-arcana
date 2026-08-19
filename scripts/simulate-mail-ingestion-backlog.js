#!/usr/bin/env node
/**
 * Läsande simulering av mail-ingestion-backloggen.
 *
 * Svarar på frågan "vad händer om vi kör de 8 814 köade meddelandena?" utan
 * att röra någonting. Ingen fil skrivs, ingen post avköas, ingen ligger-rad
 * uppdateras.
 *
 * Det som gör det möjligt är att matchPatientOrEntity() är en ren funktion:
 * den tar rawMessage + patientDirectory och returnerar ett resultat. Den
 * riktiga pipeline-körningen skriver runt omkring den, inte i den. Vi anropar
 * alltså exakt samma matchningslogik som skarp körning skulle använda.
 *
 * VIKTIGT om lägena: dry_run i den riktiga pipelinen är INTE ofarligt. Alla
 * lägen anropar completeQueuedMessages(), alltså avköas meddelandena även vid
 * torrkörning. Därför finns det här skriptet — det är den enda vägen att få
 * en prognos utan att förbruka kön.
 *
 * Kör i Render-shellet:
 *   node scripts/simulate-mail-ingestion-backlog.js
 *   node scripts/simulate-mail-ingestion-backlog.js --limit 500
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { config } = require('../src/config');
const { matchPatientOrEntity } = require('../src/ops/ccoMailIngestion/pipeline');
const { bodyFilePath, readBody } = require('../src/ops/ccoMailboxTruthBodyStore');

function argValue(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number.parseInt(String(process.argv[i + 1] ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pct(part, total) {
  if (!total) return '0,0';
  return ((part / total) * 100).toFixed(1).replace('.', ',');
}

function tabell(rubrik, counts, total) {
  console.log(`\n=== ${rubrik} ===`);
  const rader = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (rader.length === 0) {
    console.log('  (inget)');
    return;
  }
  for (const [key, n] of rader) {
    console.log(
      `  ${String(key).padEnd(32)} ${String(n).padStart(7)}  ${pct(n, total).padStart(5)}%`
    );
  }
}

async function main() {
  const limit = argValue('limit', null);

  const ingestionPath = config.ccoMailIngestionStorePath;
  const bodyRoot = path.join(config.ccoMailboxTruthShardDir, 'bodies');
  const bodyMailboxId = 'mail-ingestion';

  console.log('LÄSANDE SIMULERING — ingenting skrivs, ingenting avköas.\n');
  console.log(`Ingestion-store : ${ingestionPath}`);
  console.log(`Body-root       : ${bodyRoot}`);

  const state = JSON.parse(fs.readFileSync(ingestionPath, 'utf8'));
  const queue = Array.isArray(state.processingQueue) ? state.processingQueue : [];
  const rawMessages = state.mailRawMessages || {};

  // Patientkatalogen byggs likadant som i server.js: listPatientMatchDirectory
  // för aktiv tenant. Vi läser masterfilen direkt för att slippa starta storen.
  const masterPath = config.ccoPatientMasterStorePath;
  const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
  const tenantId = config.defaultTenantId || 'hair-tp-clinic';
  const bucket =
    (master.tenants && (master.tenants[tenantId] || Object.values(master.tenants)[0])) || master;
  const allPatients = Array.isArray(bucket.patients) ? bucket.patients : [];
  const patientDirectory = allPatients
    .filter((p) => p && p.matchStatus !== 'merged')
    .map((p) => {
      const primaryEmail = p.primaryEmail || '';
      return {
        id: p.id,
        patientId: p.id,
        personnummer: p.personnummer,
        primaryEmail,
        personalEmail: primaryEmail,
        verifiedPersonalEmailNormalized: String(primaryEmail).trim().toLowerCase(),
        displayName: p.displayName || p.name || '',
        phone: p.phone || p.primaryPhone || '',
        alternateEmails: p.alternateEmails || [],
      };
    });

  const medEpost = patientDirectory.filter((p) => p.verifiedPersonalEmailNormalized).length;
  console.log(
    `Patientkatalog  : ${patientDirectory.length} patienter, varav ${medEpost} med e-post`
  );
  console.log(`Kö              : ${queue.length} meddelanden${limit ? ` (kör ${limit})` : ''}\n`);

  const ids = limit ? queue.slice(0, limit) : queue;

  const statusCounts = {};
  const reasonCounts = {};
  const folderCounts = {};
  let hydrerade = 0;
  let saknarRaw = 0;
  let bidragFranBody = 0;

  let n = 0;
  for (const rawMessageId of ids) {
    n += 1;
    if (n % 1000 === 0) process.stdout.write(`  ...${n}\n`);

    const base = rawMessages[rawMessageId];
    if (!base) {
      saknarRaw += 1;
      continue;
    }

    // Samma hydrering som syncService gör före pipelinen. Utan den saknas
    // bodyText, och kontaktformulärsavsändare kan inte plockas ut.
    let message = base;
    try {
      const stored = await readBody(
        bodyFilePath({ bodyRoot, mailboxId: bodyMailboxId, messageKey: base.id || rawMessageId })
      );
      if (stored && typeof stored.bodyText === 'string' && stored.bodyText.length > 0) {
        message = { ...base, bodyText: stored.bodyText };
        hydrerade += 1;
      }
    } catch {
      // Saknad sidofil är inte ett fel här — vi mäter, vi lagar inte.
    }

    const utanBody = matchPatientOrEntity(base, { patientDirectory });
    const medBody = matchPatientOrEntity(message, { patientDirectory });
    if (utanBody.status !== 'MATCHED' && medBody.status === 'MATCHED') bidragFranBody += 1;

    statusCounts[medBody.status] = (statusCounts[medBody.status] || 0) + 1;
    const reason = medBody.reason || '(ingen)';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    const folder = base.folderType || '(okänd)';
    folderCounts[folder] = (folderCounts[folder] || 0) + 1;
  }

  const total = ids.length;
  console.log(
    `\nBearbetade: ${total}  |  hydrerade från sidofil: ${hydrerade}  |  saknar rawMessage: ${saknarRaw}`
  );

  tabell('Prognos: matchningsstatus', statusCounts, total);
  tabell('Prognos: orsak', reasonCounts, total);
  tabell('Fördelning per mapp', folderCounts, total);

  const matched = statusCounts.MATCHED || 0;
  console.log(`\nMATCHED: ${matched} av ${total} (${pct(matched, total)}%)`);
  console.log(`Varav som INTE hade matchat utan body-hydrering: ${bidragFranBody}`);
  console.log('\nIngenting har ändrats. Kön är orörd.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
