const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('./ccoMailboxTruthStore');

function normalizeMailboxId(value = '') {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function encodeMailboxId(mailboxId = '') {
  const normalized = normalizeMailboxId(mailboxId);
  if (!normalized) return 'unknown';
  return normalized.replace(/[^a-z0-9]+/g, '_');
}

function decodeMailboxIdFromShardFileName(fileName = '') {
  const stem = String(fileName).replace(/\.json$/i, '');
  const match = stem.match(/^(.+)_hairtpclinic_com$/i);
  if (!match) return '';
  return `${match[1]}@hairtpclinic.com`.toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

function sliceMonolithStateForMailbox(state = {}, mailboxId = '') {
  const safeMailboxId = normalizeMailboxId(mailboxId);
  const slice = {
    version: state.version || 1,
    createdAt: state.createdAt || new Date().toISOString(),
    updatedAt: state.updatedAt || new Date().toISOString(),
    accounts: {},
    folders: {},
    messages: {},
    conversations: {},
    syncCheckpoints: {},
    syncRuns: [],
  };

  const account = asObject(state.accounts?.[safeMailboxId]);
  if (Object.keys(account).length > 0) {
    slice.accounts[safeMailboxId] = account;
  }

  for (const [folderKey, folder] of Object.entries(asObject(state.folders))) {
    if (normalizeMailboxId(folder?.mailboxId) === safeMailboxId) {
      slice.folders[folderKey] = folder;
    }
  }

  for (const [messageKey, message] of Object.entries(asObject(state.messages))) {
    if (normalizeMailboxId(message?.mailboxId) === safeMailboxId) {
      slice.messages[messageKey] = message;
    }
  }

  for (const [conversationKey, conversation] of Object.entries(asObject(state.conversations))) {
    if (normalizeMailboxId(conversation?.mailboxId) === safeMailboxId) {
      slice.conversations[conversationKey] = conversation;
    }
  }

  for (const [checkpointKey, checkpoint] of Object.entries(asObject(state.syncCheckpoints))) {
    if (normalizeMailboxId(checkpoint?.mailboxId) === safeMailboxId) {
      slice.syncCheckpoints[checkpointKey] = checkpoint;
    }
  }

  return slice;
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function migrateMonolithIfNeeded({ legacyFilePath, mailboxesDir, indexPath }) {
  const legacyPath = path.resolve(String(legacyFilePath || '').trim());
  if (!legacyPath) return { migrated: false, reason: 'no_legacy_path' };

  try {
    await fs.access(legacyPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { migrated: false, reason: 'legacy_missing' };
    throw error;
  }

  const markerPath = path.join(mailboxesDir, '.migration-complete.json');
  try {
    await fs.access(markerPath);
    return { migrated: false, reason: 'already_migrated' };
  } catch {
    // continue
  }

  const monolith = await readJson(legacyPath, null);
  if (!monolith || typeof monolith !== 'object') {
    throw new Error('Mailbox truth monolith kunde inte lasas for sharded migration.');
  }

  const mailboxIds = new Set(
    [
      ...Object.keys(asObject(monolith.accounts)),
      ...Object.values(asObject(monolith.messages)).map((message) =>
        normalizeMailboxId(message?.mailboxId)
      ),
    ].filter(Boolean)
  );

  for (const mailboxId of mailboxIds) {
    const shardPath = path.join(mailboxesDir, `${encodeMailboxId(mailboxId)}.json`);
    try {
      await fs.access(shardPath);
      continue;
    } catch {
      // create shard
    }
    await writeJsonAtomic(shardPath, sliceMonolithStateForMailbox(monolith, mailboxId));
  }

  const index = {
    version: 1,
    migratedFrom: legacyPath,
    migratedAt: new Date().toISOString(),
    syncRuns: asArray(monolith.syncRuns),
  };
  await writeJsonAtomic(indexPath, index);

  const backupPath = `${legacyPath}.migrated.${Date.now()}.bak`;
  await fs.rename(legacyPath, backupPath);
  await writeJsonAtomic(markerPath, {
    migratedAt: index.migratedAt,
    backupPath,
    mailboxCount: mailboxIds.size,
  });

  return {
    migrated: true,
    mailboxCount: mailboxIds.size,
    backupPath,
  };
}

async function createCcoMailboxTruthShardedStore({
  baseDir = '',
  legacyFilePath = '',
  maxSyncRuns = 200,
  lazyPreload = true,
  maxLoadedShards = 2,
} = {}) {
  const resolvedBase = path.resolve(String(baseDir || '').trim());
  if (!resolvedBase) {
    throw new Error('ccoMailboxTruthShardedStore baseDir saknas.');
  }
  const mailboxesDir = path.join(resolvedBase, 'mailboxes');
  const indexPath = path.join(resolvedBase, 'index.json');
  await fs.mkdir(mailboxesDir, { recursive: true });

  const migration = await migrateMonolithIfNeeded({
    legacyFilePath,
    mailboxesDir,
    indexPath,
  });
  if (migration.migrated) {
    console.warn(
      '[cco_mailbox_truth_store] Migrerade monolith till sharded store',
      JSON.stringify({
        mailboxCount: migration.mailboxCount,
        backupPath: migration.backupPath,
      })
    );
  }

  // Mailbox shards can be large (especially historical accounts such as Fazli
  // and Contact). Keep only a small LRU window in process memory: the active
  // CCO selector needs at most two mailboxes, while old selections remain on
  // the persistent disk and can be reopened on demand.
  const shardCache = new Map();
  const safeMaxLoadedShards = Math.max(1, Number(maxLoadedShards) || 2);
  // Pågående laddningar, nyckel = mailboxId. Se loadShard().
  const shardLoadFlights = new Map();

  function touchShard(mailboxId = '', store = null) {
    const safeMailboxId = normalizeMailboxId(mailboxId);
    if (!safeMailboxId || !store) return null;
    // Map insertion order is the LRU order. Reinsert on use.
    shardCache.delete(safeMailboxId);
    shardCache.set(safeMailboxId, store);
    while (shardCache.size > safeMaxLoadedShards) {
      const oldestMailboxId = shardCache.keys().next().value;
      shardCache.delete(oldestMailboxId);
    }
    return store;
  }

  /**
   * Kastar minnesbilden av en shard så att nästa laddning läser från disk.
   *
   * ORD-89: en migrering byter shard-FILEN. Servern håller samma shard i
   * minnet MED brödtexterna kvar inline, och nästa `save()` skriver tillbaka
   * minnesbilden — migreringen blir ogjord, tyst. `kons@` gick tillbaka från
   * 401 737 till exakt 910 355 byte den 29 juli av precis det skälet.
   *
   * RISK, medvetet tagen: pågår en delta-synk med ändringar som ännu inte
   * sparats försvinner de. Storen sparar efter varje `recordFolderPage` och
   * varje delta-tillämpning, så fönstret är kort men inte noll. Värsta utfall
   * är att några mejl hämtas om vid nästa synk — rätt sorts pris jämfört med
   * en migrering som rullas tillbaka utan att någon märker det.
   */
  function unloadMailbox(mailboxId = '') {
    const safeMailboxId = normalizeMailboxId(mailboxId);
    if (!safeMailboxId) return false;
    return shardCache.delete(safeMailboxId);
  }

  async function loadShard(mailboxId = '') {
    const safeMailboxId = normalizeMailboxId(mailboxId);
    if (!safeMailboxId) {
      throw new Error('Mailbox truth shard saknar mailboxId.');
    }
    if (shardCache.has(safeMailboxId)) {
      return touchShard(safeMailboxId, shardCache.get(safeMailboxId));
    }
    // Utan den här delade promisen ser N samtidiga kalla anrop för samma
    // mailbox alla `has() === false`, och alla parsar hela shard-filen till
    // minne parallellt. Det är samma stampede som ORD-85 (#1233) löste i
    // readCache.wrap — den här vägen går inte via readCache och fick därför
    // aldrig det skyddet. Tre kalla worklist-laddningar 2026-07-27 19:09 UTC
    // tog RSS från 2 291 MB till 3 465 MB på 62 sekunder och Render startade
    // om instansen. Att slå ihop laddningarna gör N parsningar till en.
    const inFlight = shardLoadFlights.get(safeMailboxId);
    if (inFlight) return inFlight;

    const shardPath = path.join(mailboxesDir, `${encodeMailboxId(safeMailboxId)}.json`);
    const flight = (async () => {
      const store = await createCcoMailboxTruthStore({
        filePath: shardPath,
        maxSyncRuns,
        deferConversationRebuild: true,
        deferInitialSave: true,
      });
      return touchShard(safeMailboxId, store);
    })().finally(() => {
      // finally, inte then: ett kast får inte låsa mailboxen för alltid.
      shardLoadFlights.delete(safeMailboxId);
    });
    shardLoadFlights.set(safeMailboxId, flight);
    return flight;
  }

  function registerShardMailboxes(entryName = '', store, target = []) {
    const mailboxIdsForShard = asArray(target)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean);
    if (mailboxIdsForShard.length === 0) {
      const report = store.getCompletenessReport({ mailboxIds: [] });
      mailboxIdsForShard.push(
        ...asArray(report.accountReports)
          .map((account) => normalizeMailboxId(account.mailboxId))
          .filter(Boolean)
      );
    }
    if (mailboxIdsForShard.length === 0) {
      const sample = store.listMessages({ limit: 1 })[0];
      if (sample?.mailboxId) {
        mailboxIdsForShard.push(normalizeMailboxId(sample.mailboxId));
      }
    }
    const fromFileName = decodeMailboxIdFromShardFileName(entryName);
    if (fromFileName) {
      mailboxIdsForShard.push(fromFileName);
    }
    for (const mailboxId of [...new Set(mailboxIdsForShard)]) {
      touchShard(mailboxId, store);
    }
    return [...new Set(mailboxIdsForShard)];
  }

  async function preloadShards() {
    if (lazyPreload === true) {
      return;
    }
    const entries = await fs.readdir(mailboxesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('.')) {
        continue;
      }
      const shardPath = path.join(mailboxesDir, entry.name);
      try {
        const store = await createCcoMailboxTruthStore({
          filePath: shardPath,
          maxSyncRuns,
          deferConversationRebuild: true,
          deferInitialSave: true,
        });
        registerShardMailboxes(entry.name, store);
      } catch (error) {
        console.warn(
          '[cco_mailbox_truth_store] Kunde inte preloada shard',
          JSON.stringify({
            shardPath,
            message: error?.message || String(error),
          })
        );
      }
    }
  }

  await preloadShards();

  function shardFor(mailboxId = '') {
    return shardCache.get(normalizeMailboxId(mailboxId)) || null;
  }

  function listedMailboxIds(requested = []) {
    const ids = asArray(requested)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean);
    if (ids.length > 0) return [...new Set(ids)];
    return [...shardCache.keys()];
  }

  async function appendSyncRun(run = {}) {
    const index = await readJson(indexPath, { version: 1, syncRuns: [] });
    index.syncRuns = asArray(index.syncRuns);
    index.syncRuns.push(run);
    if (index.syncRuns.length > maxSyncRuns) {
      index.syncRuns = index.syncRuns.slice(index.syncRuns.length - maxSyncRuns);
    }
    index.updatedAt = new Date().toISOString();
    await writeJsonAtomic(indexPath, index);
  }

  async function updateSyncRun(runId = '', patch = {}) {
    const index = await readJson(indexPath, { version: 1, syncRuns: [] });
    const run = asArray(index.syncRuns).find(
      (entry) => String(entry?.runId || '') === String(runId)
    );
    if (!run) return null;
    Object.assign(run, patch);
    index.updatedAt = new Date().toISOString();
    await writeJsonAtomic(indexPath, index);
    return { ...run };
  }

  async function startBackfillRun(options = {}) {
    const run = {
      runId: crypto.randomUUID(),
      mode: 'mailbox_truth_backfill',
      mailboxIds: asArray(options.mailboxIds)
        .map((item) => normalizeMailboxId(item))
        .filter(Boolean),
      folderTypes: asArray(options.folderTypes),
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      error: null,
    };
    await appendSyncRun(run);
    return run;
  }

  async function startDeltaRun(options = {}) {
    const run = {
      runId: crypto.randomUUID(),
      mode: 'mailbox_truth_delta',
      mailboxIds: asArray(options.mailboxIds)
        .map((item) => normalizeMailboxId(item))
        .filter(Boolean),
      folderTypes: asArray(options.folderTypes),
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      error: null,
    };
    await appendSyncRun(run);
    return run;
  }

  async function finishSyncRun(runId = '', { status = 'completed', error = null } = {}) {
    return updateSyncRun(runId, {
      status: String(status || 'completed'),
      error: error ? String(error) : null,
      completedAt: new Date().toISOString(),
    });
  }

  async function ensureMailboxLoaded(mailboxId = '') {
    const safeMailboxId = normalizeMailboxId(mailboxId);
    if (!safeMailboxId) return null;
    if (shardCache.has(safeMailboxId)) {
      return shardCache.get(safeMailboxId);
    }
    return loadShard(safeMailboxId);
  }

  function listLoadedMailboxes() {
    return [...shardCache.keys()].sort();
  }

  return {
    filePath: resolvedBase,
    sharded: true,
    migration,
    ensureMailboxLoaded,
    unloadMailbox,
    listLoadedMailboxes,
    startBackfillRun,
    startDeltaRun,
    async resetFolder(mailboxId = '', folderType = '') {
      const store = await loadShard(mailboxId);
      return store.resetFolder(mailboxId, folderType);
    },
    async recordFolderPage(args = {}) {
      const mailboxId =
        normalizeMailboxId(args?.account?.mailboxId) || normalizeMailboxId(args?.folder?.mailboxId);
      const store = await loadShard(mailboxId);
      return store.recordFolderPage(args);
    },
    async recordDeltaPage(args = {}) {
      const mailboxId =
        normalizeMailboxId(args?.account?.mailboxId) || normalizeMailboxId(args?.folder?.mailboxId);
      const store = await loadShard(mailboxId);
      return store.recordDeltaPage(args);
    },
    async recordFolderError(args = {}) {
      const store = await loadShard(args?.account?.mailboxId);
      return store.recordFolderError(args);
    },
    async recordDeltaError(args = {}) {
      const store = await loadShard(args?.account?.mailboxId);
      return store.recordDeltaError(args);
    },
    finishBackfillRun: finishSyncRun,
    finishDeltaRun: finishSyncRun,
    getFolderState(mailboxId = '', folderType = '') {
      return shardFor(mailboxId)?.getFolderState(mailboxId, folderType) || null;
    },
    getAccountState(mailboxId = '') {
      return shardFor(mailboxId)?.getAccountState(mailboxId) || null;
    },
    getSyncCheckpoint(mailboxId = '', folderType = '') {
      return shardFor(mailboxId)?.getSyncCheckpoint(mailboxId, folderType) || null;
    },
    listMessages(options = {}) {
      const mailboxIds = listedMailboxIds(options.mailboxIds);
      const rows = [];
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store) continue;
        rows.push(...store.listMessages({ ...options, mailboxIds: [mailboxId] }));
      }
      rows.sort((left, right) =>
        String(right.lastModifiedAt || right.receivedAt || right.sentAt || '').localeCompare(
          String(left.lastModifiedAt || left.receivedAt || left.sentAt || '')
        )
      );
      const safeLimit = Math.max(0, Number(options.limit) || 0);
      return safeLimit > 0 ? rows.slice(0, safeLimit) : rows;
    },
    toNormalizedModel() {
      const mailboxIds = listedMailboxIds([]);
      const accounts = [];
      const folders = [];
      const messages = [];
      const conversations = [];
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store) continue;
        const model = store.toNormalizedModel();
        accounts.push(...asArray(model.accounts));
        folders.push(...asArray(model.folders));
        messages.push(...asArray(model.messages));
        conversations.push(...asArray(model.conversations));
      }
      return {
        modelVersion: 'cco.mailbox.truth.v1',
        source: 'microsoft-graph-store',
        sourceSnapshotVersion: null,
        timestamps: {
          capturedAt: new Date().toISOString(),
          sourceGeneratedAt: new Date().toISOString(),
        },
        accounts,
        folders,
        messages,
        conversations,
        metadata: {
          accountCount: accounts.length,
          folderCount: folders.length,
          messageCount: messages.length,
          conversationCount: conversations.length,
          truncatedFolderCount: folders.filter(
            (folder) => String(folder?.completenessReason || '') === 'backfill_incomplete'
          ).length,
          sharded: true,
        },
      };
    },
    getCompletenessReport(options = {}) {
      const mailboxIds = listedMailboxIds(options.mailboxIds);
      const accountReports = [];
      let messageCount = 0;
      let folderCount = 0;
      let conversationCount = 0;
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store) continue;
        const report = store.getCompletenessReport({ mailboxIds: [mailboxId] });
        accountReports.push(...asArray(report.accountReports));
        messageCount += Number(report?.metadata?.messageCount || 0);
        folderCount += Number(report?.metadata?.folderCount || 0);
        conversationCount += Number(report?.metadata?.conversationCount || 0);
      }
      const overallStatus = accountReports.every((account) => account.accountStatus === 'VERIFIED')
        ? 'VERIFIED'
        : accountReports.some((account) => account.accountStatus === 'BROKEN')
          ? 'BROKEN'
          : accountReports.some((account) => account.accountStatus === 'PARTIAL')
            ? 'PARTIAL'
            : 'NOT VERIFIED';
      return {
        overallStatus,
        accountReports,
        metadata: {
          storePath: resolvedBase,
          sharded: true,
          accountCount: accountReports.length,
          folderCount,
          messageCount,
          conversationCount,
          updatedAt: new Date().toISOString(),
        },
      };
    },
    getDeltaSyncReport(options = {}) {
      const mailboxIds = listedMailboxIds(options.mailboxIds);
      const accountReports = [];
      let checkpointCount = 0;
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store) continue;
        const report = store.getDeltaSyncReport({ mailboxIds: [mailboxId] });
        accountReports.push(...asArray(report.accountReports));
        checkpointCount += Number(report?.metadata?.checkpointCount || 0);
      }
      const overallStatus = accountReports.every(
        (account) => account.accountStatus === 'DELTA ARMED'
      )
        ? 'DELTA ARMED'
        : accountReports.some((account) => account.accountStatus === 'ERROR')
          ? 'ERROR'
          : accountReports.some((account) => account.accountStatus === 'RESYNC REQUIRED')
            ? 'RESYNC REQUIRED'
            : accountReports.some((account) => account.accountStatus === 'RUNNING')
              ? 'RUNNING'
              : accountReports.some((account) => account.accountStatus === 'NOT READY')
                ? 'NOT READY'
                : 'NOT STARTED';
      return {
        overallStatus,
        accountReports,
        metadata: {
          storePath: resolvedBase,
          sharded: true,
          checkpointCount,
          updatedAt: new Date().toISOString(),
        },
      };
    },
    /**
     * ORD-98: SAMMA DELEGERINGSLUCKA, MEN FÖR OPERATÖRENS LÄSVÄG.
     *
     * `hydrateMessageBodies` lades till i ORD-96 på per-shard-storen. Den
     * shardade wrappern exponerade den aldrig, så konversationsrutten kunde
     * inte hydrera — och efter ORD-89 ligger brödtexten i sidofiler.
     *
     * Följden, uppmätt 2026-07-30: operatören fick `bodyText` 158 tecken där
     * sidofilen bär hela mejlet — en avhuggen skiva av den 500-teckens
     * `bodyPreview` som stannar inline. Mejl såg kompletta ut när de var korta
     * och klipptes mitt i ordet när de var långa. Jag såg det själv i
     * trådvyn i går ("…medgrundare till Byond Cre…") och läste det som en
     * visningsklippning.
     *
     * Fidelity-delegeringen nedan fixades av samma skäl. Att båda saknades
     * betyder att lagret är lätt att glömma: det som läggs till i shard-storen
     * blir onåbart tills wrappern nämner det.
     */
    async hydrateMessageBodies(messages = []) {
      const rows = Array.isArray(messages) ? messages : [];
      const byMailbox = new Map();
      for (const message of rows) {
        const mailboxId = normalizeMailboxId(asObject(message).mailboxId);
        if (!mailboxId) continue;
        if (!byMailbox.has(mailboxId)) byMailbox.set(mailboxId, []);
        byMailbox.get(mailboxId).push(message);
      }
      const hydratedByRef = new Map();
      for (const [mailboxId, group] of byMailbox.entries()) {
        let store = null;
        try {
          store = await loadShard(mailboxId);
        } catch (error) {
          console.warn('[cco-truth-sharded] kunde inte ladda för hydrering', mailboxId, error?.message);
          continue;
        }
        if (!store || typeof store.hydrateMessageBodies !== 'function') continue;
        const hydrated = await store.hydrateMessageBodies(group);
        group.forEach((original, index) => hydratedByRef.set(original, hydrated[index] || original));
      }
      return rows.map((message) => hydratedByRef.get(message) || message);
    },

    /**
     * ORD-97 bugbot-fynd: den här delegeringen saknades. Varje shard ÄR en
     * `ccoMailboxTruthStore`-instans och bär redan `getFidelityInventory` med
     * `deepScan`/`bodySource` — men den sharded wrappern exponerade aldrig
     * metoden, så adaptern föll tillbaka på sin enkla `bodyHtml`-only-väg och
     * `deepScan` blev en no-op i produktion (default är sharded).
     */
    async getFidelityInventory(options = {}) {
      const mailboxIds = listedMailboxIds(options.mailboxIds);
      const sampleLimit = Math.max(0, Math.min(50, Number(options.sampleLimit ?? 20) || 0));
      const deepScan = options.deepScan === true;
      const summary = {
        messages: 0,
        htmlBodies: 0,
        inlineImageTags: 0,
        inlineCidReferences: 0,
        mimeAvailable: 0,
        declaredAttachments: 0,
        attachmentMetadata: 0,
        declaredAttachmentsWithoutMetadata: 0,
        cidWithoutAttachmentMetadata: 0,
        richCandidatesWithoutMime: 0,
        fidelityGapCount: 0,
        bodySource: deepScan ? 'bodies_sidecar' : 'shard_inline_only',
      };
      let samples = [];
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store || typeof store.getFidelityInventory !== 'function') continue;
        const result = await store.getFidelityInventory({
          mailboxIds: [mailboxId],
          sampleLimit,
          deepScan,
        });
        for (const key of Object.keys(summary)) {
          if (key === 'bodySource') continue;
          summary[key] += Number(result?.summary?.[key] || 0);
        }
        samples.push(...asArray(result?.samples));
      }
      samples.sort((left, right) =>
        String(left.observedAt || '').localeCompare(String(right.observedAt || ''))
      );
      if (samples.length > sampleLimit) samples = samples.slice(0, sampleLimit);
      return {
        mailboxIds,
        sampleLimit,
        summary,
        samples,
      };
    },
    async getCidFidelityManifest(options = {}) {
      const mailboxIds = listedMailboxIds(options.mailboxIds);
      const limit = Math.max(1, Math.min(1000, Number(options.limit ?? 1000) || 1000));
      const deepScan = options.deepScan === true;
      const summary = {
        messagesWithMissingCidMetadata: 0,
        cidReferencesWithoutAttachmentMetadata: 0,
        bodySource: deepScan ? 'bodies_sidecar' : 'shard_inline_only',
        entriesReturned: 0,
        truncated: false,
        byFolderType: {},
        byMessageType: {},
      };
      let entries = [];
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store || typeof store.getCidFidelityManifest !== 'function') continue;
        const result = await store.getCidFidelityManifest({
          mailboxIds: [mailboxId],
          limit,
          deepScan,
        });
        summary.messagesWithMissingCidMetadata += Number(
          result?.summary?.messagesWithMissingCidMetadata || 0
        );
        summary.cidReferencesWithoutAttachmentMetadata += Number(
          result?.summary?.cidReferencesWithoutAttachmentMetadata || 0
        );
        if (result?.summary?.truncated) summary.truncated = true;
        for (const [folderType, count] of Object.entries(result?.summary?.byFolderType || {})) {
          summary.byFolderType[folderType] =
            Number(summary.byFolderType[folderType] || 0) + Number(count || 0);
        }
        for (const [messageType, count] of Object.entries(result?.summary?.byMessageType || {})) {
          summary.byMessageType[messageType] =
            Number(summary.byMessageType[messageType] || 0) + Number(count || 0);
        }
        entries.push(...asArray(result?.entries));
      }
      entries.sort((left, right) =>
        String(right.observedAt || '').localeCompare(String(left.observedAt || ''))
      );
      if (entries.length > limit) {
        entries = entries.slice(0, limit);
        summary.truncated = true;
      }
      summary.entriesReturned = entries.length;
      return {
        mailboxIds,
        limit,
        summary,
        entries,
      };
    },
  };
}

module.exports = {
  createCcoMailboxTruthShardedStore,
  encodeMailboxId,
  decodeMailboxIdFromShardFileName,
  sliceMonolithStateForMailbox,
};
