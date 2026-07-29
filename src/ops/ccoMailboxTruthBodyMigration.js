'use strict';

/**
 * ORD-89 steg 2 — migrering av brödtexter till sidofiler.
 *
 * ORDNINGEN ÄR HELA SÄKERHETEN:
 *   0. diskkontroll — räcker inte 1,5× marginal påbörjas ingenting
 *   1. backup av sharden
 *   2. skriv ut brödtexterna till sidofiler
 *   3. VERIFIERA mot decodedChars — träffar det inte: stanna
 *   4. först då: skriv om sharden utan fälten
 *
 * Steg 3 är inte formalia. Skulle utskrivningen tappa text är sharden
 * fortfarande enda källan när vi upptäcker det, och ingenting är förlorat.
 * Vänder man på 3 och 4 är sharden redan skriven när felet syns.
 *
 * VERIFIERINGEN JÄMFÖR `decodedChars`, INTE BYTE.
 * Sidofilerna får sin egen JSON-escaping och sin egen objekt-omslutning, så
 * byteantalet KAN inte vara lika. En migrering som stannar på den skillnaden
 * stannar på fel grund. `decodedChars` är transportoberoende och betyder
 * exakt en sak: samma text kom fram.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  BODY_FIELDS,
  bodyFilePath,
  resolveBodyRoot,
  writeBody,
  readBody,
  checkFreeSpace,
} = require('./ccoMailboxTruthBodyStore');

function decodedCharsOf(message = {}) {
  let total = 0;
  for (const field of BODY_FIELDS) {
    if (typeof message[field] === 'string') total += message[field].length;
  }
  return total;
}

async function backupShard(shardPath) {
  const backupPath = `${shardPath}.${Date.now()}.pre-body-migration.bak`;
  await fs.promises.copyFile(shardPath, backupPath);
  return backupPath;
}

/**
 * Migrerar EN brevlåda. `apply: false` gör allt utom att skriva om sharden —
 * sidofilerna skrivs och verifieras, men sanningen ligger kvar inline.
 */
async function migrateMailboxBodies({
  config = {},
  mailboxId = '',
  shardPath = '',
  apply = false,
  marginRatio = 1.5,
  // Sömmen finns för att stopp-vägarna ska gå att pröva. Den mest
  // säkerhetskritiska grenen — "verifieringen slår inte in, rör inte sharden" —
  // kan annars bara inträffa i drift, och då är det för sent att upptäcka att
  // den var felskriven.
  deps = { writeBody, readBody },
} = {}) {
  const write = deps.writeBody || writeBody;
  const read = deps.readBody || readBody;
  const bodyRoot = resolveBodyRoot(config);
  const report = {
    mailboxId,
    shardPath,
    apply,
    startedAt: new Date().toISOString(),
    stoppedBecause: '',
  };

  // 0. Diskspärren. Sidofilerna skrivs INNAN något tas bort, så utrymmet måste
  //    finnas för båda kopiorna samtidigt.
  const shardStat = await fs.promises.stat(shardPath);
  await fs.promises.mkdir(bodyRoot, { recursive: true });
  const disk = await checkFreeSpace(bodyRoot, shardStat.size, { marginRatio });
  report.disk = disk;
  if (!disk.ok) {
    report.stoppedBecause = 'otillrackligt_diskutrymme';
    return report;
  }

  // 1. Backup före allt annat. Detta är kunddata i drift.
  report.backupPath = await backupShard(shardPath);

  const raw = await fs.promises.readFile(shardPath, 'utf8');
  const state = JSON.parse(raw);
  const messages = state && typeof state.messages === 'object' ? state.messages : {};

  // 2. Skriv ut brödtexterna.
  let written = 0;
  let expectedChars = 0;
  const touchedKeys = [];
  for (const [messageKey, message] of Object.entries(messages)) {
    const chars = decodedCharsOf(message);
    if (chars === 0) continue;
    const filePath = bodyFilePath({ bodyRoot, mailboxId, messageKey });
    if (!filePath) {
      report.stoppedBecause = 'kunde_inte_harleda_sokvag';
      report.failedKey = messageKey;
      return report;
    }
    await write(filePath, message);
    written += 1;
    expectedChars += chars;
    touchedKeys.push(messageKey);
  }
  report.written = written;
  report.expectedDecodedChars = expectedChars;

  // 3. VERIFIERA innan sharden rörs. Läs tillbaka varje skriven fil.
  let verifiedChars = 0;
  for (const messageKey of touchedKeys) {
    const stored = await read(bodyFilePath({ bodyRoot, mailboxId, messageKey }));
    if (!stored) {
      report.stoppedBecause = 'sidofil_saknas_efter_skrivning';
      report.failedKey = messageKey;
      return report;
    }
    verifiedChars += decodedCharsOf(stored);
  }
  report.verifiedDecodedChars = verifiedChars;
  if (verifiedChars !== expectedChars) {
    report.stoppedBecause = 'decoded_chars_stammer_inte';
    return report;
  }

  if (!apply) {
    report.stoppedBecause = 'torrkorning';
    return report;
  }

  // 4. Först nu: ta fälten ur sharden.
  for (const messageKey of touchedKeys) {
    for (const field of BODY_FIELDS) delete messages[messageKey][field];
  }
  const tmpPath = `${shardPath}.body-migration.tmp`;
  await fs.promises.writeFile(tmpPath, `${JSON.stringify(state)}\n`, 'utf8');
  await fs.promises.rename(tmpPath, shardPath);

  const afterStat = await fs.promises.stat(shardPath);
  report.fileBytesBefore = shardStat.size;
  report.fileBytesAfter = afterStat.size;
  report.finishedAt = new Date().toISOString();
  return report;
}

module.exports = {
  decodedCharsOf,
  migrateMailboxBodies,
};
