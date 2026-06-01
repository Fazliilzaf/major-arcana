// @ts-nocheck
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildRepairTruthMessageFromCandidate,
  parseConversationKey,
} = require('./ccoGraphMessageIdRepairPlan');

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

async function applyGraphMessageIdRepairCanary({
  truthStore = null,
  ingestionStore = null,
  repairRows = [],
  canaryLimit = 100,
  dryRun = true,
  actorUserId = null,
} = {}) {
  const limit = Math.max(1, Math.min(500, Number(canaryLimit) || 100));
  const eligible = asArray(repairRows)
    .filter((row) => row.repairStatus === 'repairable_single_match' && row.selectedCandidate)
    .slice(0, limit);

  const results = [];
  const aliases = {};
  let messagesUpserted = 0;
  let aliasesWritten = 0;
  let skipped = 0;

  for (const row of eligible) {
    const candidate = row.selectedCandidate;
    const parsed = parseConversationKey(row.conversationKey);
    let outcome = 'skipped';
    let detail = null;

    if (candidate.source === 'ingestion_ledger') {
      const truthMessage = buildRepairTruthMessageFromCandidate({ candidate, ingestionStore });
      if (!truthMessage?.graphMessageId) {
        skipped += 1;
        outcome = 'skipped_no_truth_message';
      } else if (dryRun) {
        outcome = 'dry_run_would_upsert_truth_message';
        detail = {
          graphMessageId: truthMessage.graphMessageId,
          internetMessageId: truthMessage.internetMessageId || null,
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
          graphMessageId: truthMessage.graphMessageId,
          internetMessageId: truthMessage.internetMessageId || null,
        };
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

  return {
    dryRun,
    canaryLimit: limit,
    processedCount: eligible.length,
    messagesUpserted,
    aliasesWritten,
    skipped,
    aliases,
    results,
  };
}

module.exports = {
  resolveAliasFilePath,
  loadConversationAliases,
  saveConversationAliases,
  applyGraphMessageIdRepairCanary,
};
