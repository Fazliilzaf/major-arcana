#!/usr/bin/env node
'use strict';

/**
 * Torrkörning: bygg trådidentiteter från befintlig mail-ingestion-data.
 *
 * Laddar storen read-only, itererar alla MATCHED-ledgers och simulerar den nya
 * threadIdentityIndex i minnet. Skriver INGET tillbaka till disk.
 *
 * Användning på Render:
 *   node scripts/cco-mail-ingestion-thread-identity-dry-run.js \
 *     --store /var/data/cco-mail-ingestion.json
 */

const path = require('node:path');
const { createCcoMailIngestionStore } = require('../src/ops/ccoMailIngestion/store');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function parseArgs(argv) {
  const storeFlag = argv.indexOf('--store');
  return {
    filePath: storeFlag >= 0 ? argv[storeFlag + 1] : '',
  };
}

async function main() {
  const { filePath } = parseArgs(process.argv);
  if (!filePath) {
    console.error(
      'Använd: node scripts/cco-mail-ingestion-thread-identity-dry-run.js --store /sökväg/till/cco-mail-ingestion.json'
    );
    process.exit(1);
  }

  const store = await createCcoMailIngestionStore({ filePath });
  const state = store.getState();

  const ledgers = Object.values(state.mailProcessingLedger || {});
  const rawById = state.mailRawMessages || {};

  // Simulera threadIdentityIndex i minnet
  const threadIdentityIndex = {};
  const matchedLedgers = [];

  for (const ledger of ledgers) {
    if (normalizeText(ledger.status).toUpperCase() !== 'MATCHED') continue;
    if (!normalizeText(ledger.patientId)) continue;
    matchedLedgers.push(ledger);

    const raw = rawById[ledger.rawMessageId];
    if (!raw) continue;
    const conversationKey = [normalizeEmail(raw.mailboxId), normalizeText(raw.conversationId)]
      .filter(Boolean)
      .join(':');
    if (!conversationKey) continue;

    const patientId = normalizeText(ledger.patientId);
    const linkedAt = ledger.linkedAt || ledger.completedAt || ledger.processedAt || null;
    const linkedBy = ledger.linkedBy || ledger.actorUserId || null;

    if (!threadIdentityIndex[conversationKey]) {
      threadIdentityIndex[conversationKey] = {
        conversationKey,
        canonicalPatientId: patientId,
        linkedAt,
        linkedBy,
        patientIds: new Set([patientId]),
        rawMessageIds: [ledger.rawMessageId],
      };
    } else {
      const entry = threadIdentityIndex[conversationKey];
      entry.patientIds.add(patientId);
      entry.rawMessageIds.push(ledger.rawMessageId);
      if (linkedAt && (!entry.linkedAt || linkedAt > entry.linkedAt)) {
        entry.linkedAt = linkedAt;
        entry.linkedBy = linkedBy;
      }
    }
  }

  let conflictCount = 0;
  let singlePatientCount = 0;
  const unresolvedCount = 0;
  const conflictKeys = [];

  for (const entry of Object.values(threadIdentityIndex)) {
    if (entry.patientIds.size === 1) {
      singlePatientCount += 1;
    } else {
      conflictCount += 1;
      conflictKeys.push({
        conversationKey: entry.conversationKey,
        patientIds: Array.from(entry.patientIds),
        messageCount: entry.rawMessageIds.length,
      });
    }
  }

  // Räkna hur många MATCHED meddelanden som skulle kasta 409 vid omlänkning
  // (dvs. har patientId satt) — idempotens för samma patient är OK.
  const alreadyLinkedCount = matchedLedgers.length;

  console.log(
    JSON.stringify(
      {
        filePath,
        totalLedgers: ledgers.length,
        matchedLedgers: alreadyLinkedCount,
        threadsWithIdentity: Object.keys(threadIdentityIndex).length,
        singlePatientThreads: singlePatientCount,
        conflictThreads: conflictCount,
        conflictDetails: conflictKeys.slice(0, 50),
        sampleThreads: Object.values(threadIdentityIndex)
          .slice(0, 5)
          .map((e) => ({
            conversationKey: e.conversationKey,
            canonicalPatientId: e.canonicalPatientId,
            patientIds: Array.from(e.patientIds),
            messageCount: e.rawMessageIds.length,
          })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
