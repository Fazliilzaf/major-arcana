'use strict';

/* Incident 2026-08-18 03:51 UTC — synkron JSON.stringify(state) på hela
 * mail-ingestion-state:et (alla brevlådors råmeddelanden + fulla rawJson-
 * kopior) blockerade event-loopen tillräckligt länge att Render-hälsokollen
 * (5s timeout) missade ett svar och tvingade omstart av instansen mitt i en
 * /process-all-körning. writeJsonAtomic serialiserar nu via bfj (asynkron,
 * yieldar event-loopen mellan bitar) istället för native JSON.stringify.
 *
 * Dessa tester verifierar:
 *   1. Filformatet är exakt oförändrat (byte-för-byte identiskt med vad
 *      JSON.stringify(state) + '\n' skulle producerat), inklusive den kända
 *      kvirken att threadIdentityIndex[*].patientIds (ett Set i minnet)
 *      serialiseras till {} — INTE till en array (vilket bfj skulle göra
 *      som standard via sin iterables-coercion).
 *   2. En stor state-fixture rundtrippar korrekt (skrivs, läses, matchar).
 *   3. Om skrivningen failar (t.ex. saknad skrivrättighet) städas temp-filen
 *      bort och felet propagerar — ingen tyst dataförlust eller kvarliggande
 *      .tmp-skräp.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const {
  createCcoMailIngestionStore,
  writeJsonAtomic,
  toBfjSafeValue,
} = require('../../src/ops/ccoMailIngestion/store');

function tmpFile(name) {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${crypto.randomUUID()}.json`);
}

test('toBfjSafeValue normaliserar Set → {} (matchar legacy JSON.stringify), rör inte annat', () => {
  const state = {
    modelVersion: 'x',
    mailRawMessages: { a: { id: 'a', bodyText: 'hej' } },
    threadIdentityIndex: {
      conv1: {
        conversationKey: 'conv1',
        canonicalPatientId: 'p1',
        patientIds: new Set(['p1', 'p2']),
        rawMessageIds: ['a'],
      },
      conv2: {
        conversationKey: 'conv2',
        canonicalPatientId: null,
        patientIds: new Set(),
        rawMessageIds: [],
      },
    },
    auditEvents: [1, 2, 3],
  };

  const expected = JSON.stringify(state);
  const safe = toBfjSafeValue(state);
  assert.equal(JSON.stringify(safe), expected);
  // Bekräfta att normaliseringen faktiskt skedde (inte råkat matcha av en slump).
  assert.deepEqual(safe.threadIdentityIndex.conv1.patientIds, {});
  assert.ok(!(safe.threadIdentityIndex.conv1.patientIds instanceof Set));
  // Oförändrade fält ska vara exakt samma referens/värde, inte omklonade.
  assert.equal(safe.mailRawMessages, state.mailRawMessages);
});

test('toBfjSafeValue är en no-op när inget Set finns (undviker onödig kopiering)', () => {
  const state = {
    threadIdentityIndex: { conv1: { patientIds: ['already', 'array'] } },
    other: { deeply: { nested: true } },
  };
  const safe = toBfjSafeValue(state);
  assert.equal(safe, state);
});

test('writeJsonAtomic producerar byte-identisk JSON mot JSON.stringify(data) + "\\n"', async () => {
  const filePath = tmpFile('bfj-byte-identical');
  const data = {
    modelVersion: 'cco.mail.ingestion.v1',
    mailRawMessages: {
      a: { id: 'a', subject: 'Hej "citat" \n radbrytning', bodyText: 'åäö€ unicode' },
    },
    processingQueue: ['a', 'b', 'c'],
    threadIdentityIndex: {
      conv1: { patientIds: new Set(['p1']), rawMessageIds: ['a'] },
    },
    nullField: null,
    numberField: 3.14159,
  };

  await writeJsonAtomic(filePath, data);
  const actual = await fs.readFile(filePath, 'utf8');
  const expected = `${JSON.stringify(toBfjSafeValue(data))}\n`;
  assert.equal(actual, expected);

  // Filen ska vara giltig JSON och rundtrippa korrekt.
  const parsed = JSON.parse(actual);
  assert.equal(parsed.mailRawMessages.a.bodyText, 'åäö€ unicode');
  assert.deepEqual(parsed.threadIdentityIndex.conv1.patientIds, {});

  await fs.unlink(filePath).catch(() => {});
});

// OBS: till skillnad från native JSON.stringify (som kastar på cirkulära
// referenser) verifierade vi manuellt att bfj.write INTE rejectar på en
// cirkelreferens — den löser med trunkerad/ogiltig JSON istället (ett känt
// bfj-beteende, inte en bugg i vår kod). Det är ofarligt här eftersom
// mail-ingestion-state:et uteslutande byggs av platt, JSON-säker data (inga
// bakåtreferenser) — men det betyder att vi inte kan använda en cirkelref för
// att testa felhanteringsvägen. Vi simulerar istället ett verkligt
// skrivfel (ingen skrivrättighet i målkatalogen) för att verifiera att
// temp-filen städas bort och felet propagerar korrekt.
test('writeJsonAtomic städar bort temp-filen och kastar vidare om skrivningen failar', async () => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    // chmod-baserad felsimulering fungerar inte som root (root ignorerar
    // filrättigheter) — hoppa över i den miljön istället för att flaka i CI.
    return;
  }
  const dir = path.join(os.tmpdir(), `bfj-write-fail-dir-${Date.now()}-${crypto.randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.chmod(dir, 0o500); // r-x — ingen skrivrättighet, nya filer kan inte skapas
  const filePath = path.join(dir, 'state.json');

  try {
    await assert.rejects(() => writeJsonAtomic(filePath, { a: 1 }));
    const leftover = (await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(leftover, []);
  } finally {
    await fs.chmod(dir, 0o700).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('stor state rundtrippar korrekt genom hela store-flödet (save → disk → reload)', async () => {
  const filePath = tmpFile('bfj-large-state-roundtrip');
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });

  const MESSAGE_COUNT = 300;
  for (let i = 0; i < MESSAGE_COUNT; i += 1) {
    await store.saveRawMessageFromTruth({
      truthMessage: {
        mailboxId: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        graphMessageId: `graph-${i}`,
        internetMessageId: `<msg-${i}@example.com>`,
        subject: `Testmeddelande ${i}`,
        bodyText: 'x'.repeat(2000), // simulerar en realistisk mailkropp
        from: { address: `patient${i}@example.com` },
      },
      mailAccountId: account.id,
      importRunId: run.id,
    });
  }
  await store.save();

  // Länka en patient för att populera threadIdentityIndex med ett riktigt Set.
  const rawMessages = store.listRawMessages();
  const firstLedger = store.getLedgerByRawMessageId(rawMessages[0].id);
  assert.ok(firstLedger);
  await store.linkPatientToMessage({
    rawMessageId: rawMessages[0].id,
    patientId: 'patient-123',
    actorUserId: 'test',
  });

  const raw = await fs.readFile(filePath, 'utf8');
  assert.ok(raw.endsWith('\n'));
  const parsed = JSON.parse(raw); // kastar om filen inte är giltig JSON
  assert.equal(Object.keys(parsed.mailRawMessages).length, MESSAGE_COUNT);
  assert.equal(parsed.processingQueue.length, MESSAGE_COUNT);

  // threadIdentityIndex ska ha skrivits med patientIds som {} (legacy-format),
  // inte som array.
  const identityEntries = Object.values(parsed.threadIdentityIndex || {});
  assert.equal(identityEntries.length, 1);
  assert.deepEqual(identityEntries[0].patientIds, {});

  // Ladda om store från samma fil och verifiera att den fungerar normalt.
  const reloaded = await createCcoMailIngestionStore({ filePath });
  assert.equal(reloaded.listRawMessages().length, MESSAGE_COUNT);

  await fs.unlink(filePath).catch(() => {});
});
