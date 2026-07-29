'use strict';

/**
 * ORD-89 steg 2 — migrering av brödtexter till sidofiler.
 *
 * ORDNINGEN ÄR HELA SÄKERHETEN:
 *   0. diskkontroll — räcker inte 1,5× marginal påbörjas ingenting
 *   1. backup av sharden
 *   2. EN strömmande passering: sidofilerna skrivs, den nya sharden byggs
 *      till en temporärfil
 *   3. VERIFIERA mot decodedChars — träffar det inte: stanna, temporärfilen
 *      slängs och originalet är orört
 *   4. först då: byt in den nya sharden
 *
 * Steg 3 före steg 4 är hela poängen. Tappar passeringen text är originalet
 * fortfarande enda källan när vi upptäcker det.
 *
 * INGEN `JSON.parse` AV SHARDEN.
 * Första versionen läste hela filen och parsade den. För `egzona@` är det
 * 179 MB och ~1,2 GB RSS på den instans som samtidigt betjänar kliniken —
 * alltså exakt det fel migreringen finns för att åtgärda. Diskspärren, backupen
 * och verifieringen skyddar mot att TAPPA TEXT; ingen av dem skyddade mot att
 * FÄLLA INSTANSEN, och det är den risk som faktiskt inträffade den 28 juli.
 *
 * VERIFIERINGEN JÄMFÖR `decodedChars`, INTE BYTE.
 * Sidofilerna får sin egen JSON-escaping och sin egen objekt-omslutning, så
 * byteantalet KAN inte vara lika. En migrering som stannar på den skillnaden
 * stannar på fel grund. `decodedChars` är transportoberoende och betyder exakt
 * en sak: samma text kom fram.
 */

const fs = require('node:fs');

const {
  BODY_FIELDS,
  bodyFilePath,
  resolveBodyRoot,
  writeBody,
  readBody,
  checkFreeSpace,
} = require('./ccoMailboxTruthBodyStore');
const { createBodyStreamTransform } = require('./ccoMailboxTruthBodyStreamTransform');

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
 * Migrerar EN brevlåda. `apply: false` gör allt utom att byta in den nya
 * sharden — sidofilerna skrivs och verifieras, men sanningen ligger kvar inline.
 */
async function migrateMailboxBodies({
  config = {},
  mailboxId = '',
  shardPath = '',
  apply = false,
  marginRatio = 1.5,
  // Sömmen finns för att stopp-vägarna ska gå att pröva. Den mest
  // säkerhetskritiska grenen — verifieringen slår inte in, rör inte sharden —
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

  // 0. Diskspärren. Sidofilerna OCH den nya sharden skrivs innan något tas
  //    bort, så utrymmet måste finnas för båda kopiorna samtidigt.
  const shardStat = await fs.promises.stat(shardPath);
  await fs.promises.mkdir(bodyRoot, { recursive: true });
  const disk = await checkFreeSpace(bodyRoot, shardStat.size * 2, { marginRatio });
  report.disk = disk;
  if (!disk.ok) {
    report.stoppedBecause = 'otillrackligt_diskutrymme';
    return report;
  }

  // 1. Backup före allt annat. Detta är kunddata i drift.
  report.backupPath = await backupShard(shardPath);

  // 2. En passering. Aldrig mer än en chunk och ett brödtextvärde i minnet.
  const tmpShardPath = `${shardPath}.body-migration.tmp`;
  const outStream = fs.createWriteStream(tmpShardPath, { encoding: 'utf8' });
  const touched = new Map();
  let expectedChars = 0;
  let writeError = null;

  // `touched` HÅLLER TAL, ALDRIG TEXT.
  // Första versionen sparade själva brödtexterna här för att kunna skriva
  // båda fälten i samma fil. Det är hela shardens massa i en Map — 275 MB
  // fixtur gav OOM vid 4 GB. Strömmande läsning är verkningslös om resultatet
  // ändå ackumuleras; det var samma fel som JSON.parse, ett lager längre in.
  //
  // Fälten för ETT meddelande kommer efter varandra i strömmen, så det räcker
  // att buffra det meddelande som just nu passerar och skriva det när nästa
  // nyckel dyker upp. Minnet blir ett meddelande, inte en brevlåda.
  let currentKey = '';
  let currentBody = null;
  // Skrivningarna serialiseras: två fält mot samma fil får inte kunna byta
  // ordning på sina rename.
  let writeChain = Promise.resolve();
  let pendingWrites = 0;

  function flushCurrent() {
    if (!currentKey || !currentBody) return writeChain;
    const messageKey = currentKey;
    const body = currentBody;
    currentKey = '';
    currentBody = null;
    pendingWrites += 1;
    writeChain = writeChain.then(async () => {
      if (writeError) return;
      try {
        const filePath = bodyFilePath({ bodyRoot, mailboxId, messageKey });
        if (!filePath) throw new Error(`kunde_inte_harleda_sokvag:${messageKey}`);
        await write(filePath, body);
      } catch (error) {
        writeError = error;
      } finally {
        pendingWrites -= 1;
      }
    });
    return writeChain;
  }

  const transform = createBodyStreamTransform({
    emit: (chunk) => outStream.write(chunk),
    onBody: (messageKey, field, value) => {
      if (messageKey !== currentKey) {
        flushCurrent();
        currentKey = messageKey;
        currentBody = {};
      }
      currentBody[field] = value;
      expectedChars += value.length;
      touched.set(messageKey, (touched.get(messageKey) || 0) + value.length);
      return writeChain;
    },
  });

  // MOTTRYCK ÅT BÅDA HÅLLEN.
  // Utan detta pumpar läsströmmen 179 MB snabbare än skrivströmmen hinner
  // spola, och Node buffrar mellanskillnaden i minnet — plus en skrivkedja med
  // tusentals väntande brödtexter i sina closures. Andra OOM:en kom härifrån,
  // inte från parsningen. Strömmande läsning räcker inte om ingen bromsar.
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(shardPath, { encoding: 'utf8', highWaterMark: 1 << 20 });
    input.on('data', (chunk) => {
      const canContinue = transform.write(chunk);
      // Bromsa både på full skrivbuffert och på utestående sidofilsskrivningar.
      if (canContinue === false || pendingWrites > 0) {
        input.pause();
        Promise.resolve(writeChain)
          .then(() => new Promise((go) => (outStream.writableNeedDrain ? outStream.once('drain', go) : go())))
          .then(() => input.resume())
          .catch(reject);
      }
    });
    input.on('error', reject);
    input.on('end', resolve);
  });
  const stats = await transform.finish();
  // Sista meddelandet har ingen efterföljare som utlöser sin flush.
  await flushCurrent();
  await new Promise((resolve, reject) => {
    outStream.end((error) => (error ? reject(error) : resolve()));
  });

  report.written = touched.size;
  report.redirectedValues = stats.redirected;
  report.maxValueChars = stats.maxValueChars;
  report.expectedDecodedChars = expectedChars;

  async function abort(reason, extra = {}) {
    report.stoppedBecause = reason;
    Object.assign(report, extra);
    await fs.promises.rm(tmpShardPath, { force: true });
    return report;
  }

  if (writeError) return abort('sidofil_kunde_inte_skrivas', { failure: String(writeError.message) });

  // Går klammerbalansen inte ihop har tillståndsmaskinen tappat något, och då
  // är djupvillkoret för omstyrning inte att lita på någonstans i filen.
  if (stats.depthAtEnd !== 0) return abort('obalanserad_shard', { depthAtEnd: stats.depthAtEnd });

  // 3. VERIFIERA innan originalet rörs. Läs tillbaka varje skriven sidofil.
  let verifiedChars = 0;
  for (const messageKey of touched.keys()) {
    const stored = await read(bodyFilePath({ bodyRoot, mailboxId, messageKey }));
    if (!stored) return abort('sidofil_saknas_efter_skrivning', { failedKey: messageKey });
    verifiedChars += decodedCharsOf(stored);
  }
  report.verifiedDecodedChars = verifiedChars;
  if (verifiedChars !== expectedChars) return abort('decoded_chars_stammer_inte');

  if (!apply) return abort('torrkorning');

  // 4. Först nu byts sharden in.
  await fs.promises.rename(tmpShardPath, shardPath);

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
