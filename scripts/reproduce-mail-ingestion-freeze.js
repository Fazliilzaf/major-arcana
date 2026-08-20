#!/usr/bin/env node
'use strict';

/**
 * Reproduktionsförsök: mäter om writeJsonAtomic hänger på ett state där
 * threadIdentityIndex[*].patientIds är Set, i samma storleksordning som prod.
 *
 * Skriver till /tmp — inget prod-data rörs.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const bfj = require('bfj');

const { writeJsonAtomic, toBfjSafeValue } = require('../src/ops/ccoMailIngestion/store');

function uuid() {
  return crypto.randomUUID();
}

function makeSyntheticState({
  rawMessageCount = 8800,
  threadIdentityCount = 1200,
  maxPatientIdsPerThread = 3,
} = {}) {
  const state = {
    version: 'v1',
    mailRawMessages: {},
    mailProcessingLedger: {},
    mailPatientMatches: {},
    processingQueue: [],
    threadIdentityIndex: {},
    mailSyncState: {},
    mailImportRuns: {},
    importRunOrder: [],
    mailAttachments: {},
    mailActions: {},
    dedupeIndex: {},
    graphSubscriptions: {},
    auditEvents: [],
  };

  for (let i = 0; i < rawMessageCount; i += 1) {
    const rawId = uuid();
    state.mailRawMessages[rawId] = {
      id: rawId,
      tenantId: 'hair-tp-clinic',
      mailboxId: 'egzona@hairtpclinic.com',
      receivedAt: '2026-08-19T12:00:00.000Z',
      persistedAt: '2026-08-19T12:00:00.000Z',
      subject: `Test subject ${i}`,
      bodyPreview: 'x'.repeat(200),
      rawJson: { body: { content: '' } },
    };
    if (i % 2 === 0) state.processingQueue.push(rawId);

    state.mailProcessingLedger[rawId] = {
      rawMessageId: rawId,
      status: 'RAW_SAVED',
      processorVersion: 'P1',
      filterVersion: 'F1',
      matchVersion: 'M1',
      updatedAt: '2026-08-19T12:00:00.000Z',
    };
  }

  for (let i = 0; i < threadIdentityCount; i += 1) {
    const conversationKey = `tenant::thread-${i}`;
    const patientCount = 1 + Math.floor(Math.random() * maxPatientIdsPerThread);
    const patientIds = new Set();
    for (let p = 0; p < patientCount; p += 1) patientIds.add(uuid());

    state.threadIdentityIndex[conversationKey] = {
      conversationKey,
      canonicalPatientId: uuid(),
      conflictFlag: false,
      patientIds,
      updatedAt: '2026-08-19T12:00:00.000Z',
    };
  }

  return state;
}

async function measureBfjWrite(filePath, state, label) {
  const safe = toBfjSafeValue(state);
  const tmpPath = `${filePath}.${process.pid}.${uuid()}.tmp`;
  const start = Date.now();
  await bfj.write(tmpPath, safe);
  await fs.appendFile(tmpPath, '\n', 'utf8');
  const ms = Date.now() - start;
  const stat = await fs.stat(tmpPath);
  await fs.unlink(tmpPath).catch(() => {});
  console.log(`  ${label}: ${ms} ms, filstorlek ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  return ms;
}

async function main() {
  const prodSize = process.argv.includes('--prod-size');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mail-freeze-repro-'));
  const filePath = path.join(tmpDir, 'cco-mail-ingestion.json');

  console.log('=== Reproduktionsförsök: mail-ingestion writeJsonAtomic ===\n');
  console.log(`Temp-katalog: ${tmpDir}`);
  console.log(`Läge: ${prodSize ? 'prod-storlek (~28 MB)' : 'standard (~6 MB'}\n`);

  const state = prodSize
    ? makeSyntheticState({ rawMessageCount: 40000, threadIdentityCount: 5000, maxPatientIdsPerThread: 5 })
    : makeSyntheticState();
  const rawKeys = Object.keys(state.mailRawMessages).length;
  const threadKeys = Object.keys(state.threadIdentityIndex).length;
  console.log(`State: ${rawKeys} råmeddelanden, ${threadKeys} trådidentiteter`);

  // Kontrollera att patientIds verkligen är Set
  const sample = Object.values(state.threadIdentityIndex)[0];
  console.log(`Sample patientIds är Set: ${sample.patientIds instanceof Set}\n`);

  // Kör flera gånger för att se om det är stabilt
  console.log('Mätningar med bfj.write (toBfjSafeValue):');
  for (let i = 0; i < 3; i += 1) {
    await measureBfjWrite(filePath, state, `Körning ${i + 1}`);
  }

  console.log('\nMätningar med writeJsonAtomic (full atomic rename):');
  for (let i = 0; i < 3; i += 1) {
    const start = Date.now();
    await writeJsonAtomic(filePath, state);
    const ms = Date.now() - start;
    const stat = await fs.stat(filePath);
    console.log(`  Körning ${i + 1}: ${ms} ms, filstorlek ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  }

  // Jämförelse: utan threadIdentityIndex alls
  const stateWithoutThreads = { ...state, threadIdentityIndex: {} };
  console.log('\nJämförelse utan threadIdentityIndex:');
  await measureBfjWrite(filePath, stateWithoutThreads, 'Utan trådidentiteter');

  // Jämförelse: med patientIds som array (efter första sparningen)
  const stateAsArray = {
    ...state,
    threadIdentityIndex: Object.fromEntries(
      Object.entries(state.threadIdentityIndex).map(([k, entry]) => [
        k,
        { ...entry, patientIds: Array.from(entry.patientIds) },
      ])
    ),
  };
  console.log('\nJämförelse med patientIds som array (redan normaliserat):');
  await measureBfjWrite(filePath, stateAsArray, 'Array-format');

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log('\n=== Klart — inget hängde lokalt ===');
}

main().catch((err) => {
  console.error('FEL:', err);
  process.exit(1);
});
