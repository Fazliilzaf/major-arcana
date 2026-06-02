// @ts-nocheck
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildRepairTruthMessageFromCandidate,
  parseConversationKey,
} = require('./ccoGraphMessageIdRepairPlan');
const {
  isConversationRepaired,
  recordRepairBatch,
  hashToken,
  loadRepairRegistry,
} = require('./ccoGraphMessageIdRepairRegistry');
const { toMailboxConversationId } = require('../infra/microsoftGraphMailboxTruth');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveAliasFilePath(stateRoot = '', tenantId = '') {
  const safeTenant = normalizeText(tenantId).replace(/[^a-z0-9_-]+/gi, '_') || 'default';
  return path.join(
    normalizeText(stateRoot) || process.cwd(),
    `cco-inbox-enrichment-conversation-aliases.${safeTenant}.json`
  );
}

async function loadConversationAliases({ stateRoot = '', tenantId = '' } = {}) {
  const filePath = resolveAliasFilePath(stateRoot, tenantId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const aliases = asObjectMap(parsed.aliases);
    return { ok: true, filePath, aliases, savedAt: parsed.savedAt || null };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: true, filePath, aliases: {}, savedAt: null };
    }
    throw error;
  }
}

function asObjectMap(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, val] of Object.entries(value)) {
    const from = normalizeText(key);
    const to = normalizeText(val);
    if (from && to) out[from.toLowerCase()] = to;
  }
  return out;
}

async function saveConversationAliases({
  stateRoot = '',
  tenantId = '',
  aliases = {},
  metadata = {},
} = {}) {
  const filePath = resolveAliasFilePath(stateRoot, tenantId);
  const existing = await loadConversationAliases({ stateRoot, tenantId });
  const merged = { ...existing.aliases, ...asObjectMap(aliases) };
  const payload = {
    version: 1,
    tenantId: normalizeText(tenantId) || null,
    savedAt: new Date().toISOString(),
    aliases: merged,
    metadata,
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { ok: true, filePath, count: Object.keys(merged).length };
}

function alignTruthMessageToGapConversation(
  truthMessage = {},
  conversationKey = '',
  mailboxId = ''
) {
  const parsed = parseConversationKey(conversationKey);
  const safeMailboxId = parsed.mailboxId || mailboxId;
  const safeConversationId = parsed.conversationId;
  if (!truthMessage || !safeMailboxId || !safeConversationId) return truthMessage;
  const aligned = { ...truthMessage };
  aligned.mailboxId = safeMailboxId;
  aligned.mailboxAddress = safeMailboxId;
  aligned.userPrincipalName = safeMailboxId;
  aligned.conversationId = safeConversationId;
  aligned.mailboxConversationId =
    normalizeText(conversationKey) ||
    toMailboxConversationId({
      mailboxId: safeMailboxId,
      conversationId: safeConversationId,
      internetMessageId: aligned.internetMessageId,
      graphMessageId: aligned.graphMessageId,
    });
  aligned.graphMessageIdRepair = {
    source: 'ingestion_ledger',
    alignedAt: new Date().toISOString(),
    gapConversationKey: normalizeText(conversationKey),
  };
  return aligned;
}

async function applyGraphMessageIdRepairCanary({
  truthStore = null,
  ingestionStore = null,
  repairRows = [],
  canaryLimit = 100,
  dryRun = true,
  actorUserId = null,
  runId = '',
  stateRoot = '',
  tenantId = '',
  repairRegistry = null,
} = {}) {
  const limit = Math.max(1, Math.min(500, Number(canaryLimit) || 100));
  const registryRepairs = repairRegistry?.repairs || {};
  const eligible = asArray(repairRows)
    .filter((row) => row.repairStatus === 'repairable_single_match' && row.selectedCandidate)
    .filter((row) => {
      const candidate = row.selectedCandidate;
      if (
        isConversationRepaired(
          { repairs: registryRepairs },
          row.conversationKey,
          candidate?.graphMessageId
        )
      ) {
        return false;
      }
      return true;
    })
    .slice(0, limit);

  const results = [];
  const aliases = {};
  const repairRecords = [];
  let messagesUpserted = 0;
  let aliasesWritten = 0;
  let skipped = 0;
  const skippedAlreadyRepaired = 0;

  for (const row of eligible) {
    const candidate = row.selectedCandidate;
    const parsed = parseConversationKey(row.conversationKey);
    let outcome = 'skipped';
    let detail = null;

    if (candidate.source === 'ingestion_ledger') {
      const rawTruthMessage = buildRepairTruthMessageFromCandidate({ candidate, ingestionStore });
      const truthMessage = alignTruthMessageToGapConversation(
        rawTruthMessage,
        row.conversationKey,
        parsed.mailboxId
      );
      if (!truthMessage?.graphMessageId) {
        skipped += 1;
        outcome = 'skipped_no_truth_message';
      } else if (dryRun) {
        outcome = 'dry_run_would_upsert_truth_message';
        detail = {
          newGraphMessageIdHash: hashToken(truthMessage.graphMessageId),
          internetMessageIdHash: hashToken(truthMessage.internetMessageId),
        };
      } else if (truthStore && typeof truthStore.recordFolderPage === 'function') {
        await truthStore.recordFolderPage({
          account: {
            mailboxId: parsed.mailboxId,
            mailboxAddress: parsed.mailboxId,
            userPrincipalName: parsed.mailboxId,
          },
          folder: { folderType: truthMessage.folderType || 'inbox' },
          messages: [truthMessage],
          complete: true,
        });
        messagesUpserted += 1;
        outcome = 'upserted_truth_message';
        detail = {
          newGraphMessageIdHash: hashToken(truthMessage.graphMessageId),
          internetMessageIdHash: hashToken(truthMessage.internetMessageId),
        };
        repairRecords.push({
          conversationKey: row.conversationKey,
          repairSource: 'ingestion_ledger',
          newGraphMessageId: truthMessage.graphMessageId,
          oldGraphMessageId: null,
          actorUserId,
        });
      }
    } else if (
      candidate.canonicalConversationKey &&
      candidate.canonicalConversationKey !== row.conversationKey
    ) {
      aliases[row.conversationKey.toLowerCase()] = candidate.canonicalConversationKey;
      aliasesWritten += 1;
      outcome = dryRun ? 'dry_run_would_write_alias' : 'alias_pending_persist';
      detail = {
        fromKey: row.conversationKey,
        toKey: candidate.canonicalConversationKey,
      };
    } else {
      skipped += 1;
      outcome = 'skipped_unsupported_candidate';
    }

    results.push({
      conversationKey: row.conversationKey,
      repairStatus: row.repairStatus,
      outcome,
      actorUserId: normalizeText(actorUserId) || null,
      detail,
    });
  }

  let registrySave = null;
  if (!dryRun && repairRecords.length > 0 && stateRoot && tenantId) {
    registrySave = await recordRepairBatch({
      stateRoot,
      tenantId,
      runId,
      records: repairRecords,
      metadata: { phase: 'graph_message_id_repair_canary' },
    });
  }

  return {
    dryRun,
    canaryLimit: limit,
    processedCount: eligible.length,
    messagesUpserted,
    aliasesWritten,
    skipped,
    skippedAlreadyRepaired,
    runId: normalizeText(runId) || null,
    registrySave,
    aliases,
    results,
  };
}

async function reconcileRepairRegistryFromGapDetails({
  stateRoot = '',
  tenantId = '',
  runId = '',
  gapDetails = [],
  truthStore = null,
  mailboxIds = [],
} = {}) {
  if (!truthStore || typeof truthStore.listMessages !== 'function') {
    return { reconciled: 0 };
  }
  const {
    buildTruthMessageGroups,
    resolveMessageGroup,
  } = require('./ccoInboxEnrichmentGapAnalysis');
  const gapIds = asArray(gapDetails)
    .filter((row) => normalizeText(row.primaryBucket) === 'missing_graphMessageId')
    .map((row) => normalizeText(row.conversationKey || row.gapId))
    .filter(Boolean);
  if (gapIds.length === 0) return { reconciled: 0 };

  const messageGroups = buildTruthMessageGroups(truthStore, mailboxIds, gapIds);
  const existingRegistry = await loadRepairRegistry({ stateRoot, tenantId });
  const records = [];
  for (const row of gapDetails) {
    if (normalizeText(row.primaryBucket) !== 'missing_graphMessageId') continue;
    const conversationKey = normalizeText(row.conversationKey || row.gapId);
    if (!conversationKey) continue;
    if (isConversationRepaired({ repairs: existingRegistry.repairs }, conversationKey)) {
      continue;
    }
    const messageGroup = resolveMessageGroup(conversationKey, conversationKey, messageGroups);
    if (Number(messageGroup?.graphMessageIdCount || 0) === 0) continue;
    const withGraph = asArray(messageGroup.messages).find((message) =>
      normalizeText(message?.graphMessageId)
    );
    if (!withGraph?.graphMessageId) continue;
    records.push({
      conversationKey,
      repairSource: 'truth_reconcile',
      newGraphMessageId: withGraph.graphMessageId,
      oldGraphMessageId: null,
    });
  }
  if (records.length === 0) return { reconciled: 0 };
  const saved = await recordRepairBatch({
    stateRoot,
    tenantId,
    runId: runId || `reconcile-${Date.now()}`,
    records,
    metadata: { phase: 'repair_registry_reconcile' },
  });
  return { reconciled: records.length, saved };
}

module.exports = {
  resolveAliasFilePath,
  loadConversationAliases,
  saveConversationAliases,
  alignTruthMessageToGapConversation,
  applyGraphMessageIdRepairCanary,
  reconcileRepairRegistryFromGapDetails,
};
