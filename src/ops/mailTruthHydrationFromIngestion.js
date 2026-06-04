'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { isNonPatientCounterpartyEmail } = require('./ccoMailIngestion/nonPatientRules');
const { buildPipedrivePatientLookup } = require('./ccoPatientMasterStore');
const { toMailboxConversationId } = require('../infra/microsoftGraphMailboxTruth');

const HYDRATION_SOURCE = 'ingestion_truth_hydration_v1';
const DEFAULT_CANARY_LIMIT = 200;
const BATCH_SIZE = 50;
const MAX_DUPLICATE_EXPLOSION_RATIO = 1.01;

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value ?? ''), 'utf8')
    .digest('hex');
}

function resolveCounterpartyEmail(raw = {}, folderType = '') {
  const ft = normalizeText(folderType).toLowerCase();
  if (ft === 'sent' || ft === 'drafts') {
    const to = asArray(raw.toEmails || raw.toAddresses || raw.to)[0];
    if (typeof to === 'string') return normalizeEmail(to);
    return normalizeEmail(to?.address || to?.email);
  }
  return normalizeEmail(raw.fromEmail || raw.from?.address || raw.from);
}

function resolveGraphMessageId(raw = {}) {
  return (
    normalizeText(raw.graphMessageId) ||
    normalizeText(raw.immutableGraphId) ||
    normalizeText(raw.rawJson?.graphMessageId) ||
    ''
  );
}

function buildTruthMessageFromIngestion({ raw, ledger, runId = '' }) {
  const mailboxId = normalizeEmail(raw.mailboxId);
  const folderType = normalizeText(raw.folderType).toLowerCase() || 'inbox';
  let graphMessageId = resolveGraphMessageId(raw);
  const syntheticGraph = !graphMessageId;
  if (syntheticGraph) {
    graphMessageId = `ingest-${normalizeText(raw.id)}`;
  }

  const counterpartyEmail = resolveCounterpartyEmail(raw, folderType);
  const conversationId = normalizeText(raw.conversationId) || null;
  const receivedAt =
    normalizeText(raw.receivedDateTime || raw.receivedAt || raw.persistedAt) || null;
  const sentAt = normalizeText(raw.sentDateTime || raw.sentAt) || null;
  const previewSource = normalizeText(raw.bodyPreview || raw.snippet || '');
  const bodyPreview = previewSource.length > 500 ? previewSource.slice(0, 500) : previewSource;

  const truthMessage = {
    graphMessageId,
    immutableGraphId: normalizeText(raw.immutableGraphId) || graphMessageId,
    internetMessageId: normalizeText(raw.internetMessageId) || null,
    conversationId,
    mailboxId,
    mailboxAddress: mailboxId,
    userPrincipalName: mailboxId,
    folderType,
    folderId: normalizeText(raw.folderId) || null,
    subject: normalizeText(raw.subject) || '(utan ämne)',
    bodyPreview,
    fromEmail: normalizeEmail(raw.fromEmail || raw.from?.address || raw.from),
    fromName: normalizeText(raw.fromName || raw.from?.name) || '',
    from: {
      address: normalizeEmail(raw.fromEmail || raw.from?.address || raw.from),
      name: normalizeText(raw.fromName || raw.from?.name) || '',
    },
    toRecipients: asArray(raw.toEmails || raw.toAddresses).map((item) => ({
      address: normalizeEmail(typeof item === 'string' ? item : item?.address || item?.email),
    })),
    receivedAt,
    sentAt,
    direction: folderType === 'sent' || folderType === 'drafts' ? 'outbound' : 'inbound',
    isRead: raw.isRead === true,
    hasAttachments: raw.hasAttachments === true,
    customerEmail: counterpartyEmail || null,
    hydrationSource: HYDRATION_SOURCE,
    hydrationRunId: runId,
    hydrationRawMessageId: normalizeText(raw.id) || null,
    syntheticGraphMessageId: syntheticGraph,
  };

  if (
    normalizeText(ledger?.status).toUpperCase() === 'MATCHED' &&
    normalizeText(ledger?.patientId)
  ) {
    truthMessage.customerIdentity = {
      canonicalCustomerId: normalizeText(ledger.patientId),
      customerId: normalizeText(ledger.patientId),
      customerEmail: counterpartyEmail || null,
      identityProvenance: {
        source: HYDRATION_SOURCE,
        matchStatus: 'MATCHED',
        hydratedAt: nowIso(),
      },
    };
  }

  truthMessage.mailboxConversationId =
    normalizeText(raw.mailboxConversationId) ||
    toMailboxConversationId({
      mailboxId,
      conversationId,
      internetMessageId: truthMessage.internetMessageId,
      graphMessageId,
    });

  return truthMessage;
}

function buildLedgerIndex(state = {}) {
  const byRawId = new Map();
  for (const ledger of Object.values(state.mailProcessingLedger || {})) {
    const rawId = normalizeText(ledger?.rawMessageId);
    if (!rawId) continue;
    const existing = byRawId.get(rawId);
    if (!existing) {
      byRawId.set(rawId, ledger);
      continue;
    }
    const rank = (item) => {
      const status = normalizeText(item?.status).toUpperCase();
      if (status === 'MATCHED') return 5;
      if (status === 'UNMATCHED') return 4;
      if (status === 'NEEDS_REVIEW') return 3;
      if (status === 'DUPLICATE_SKIPPED') return 1;
      return 2;
    };
    if (rank(ledger) > rank(existing)) {
      byRawId.set(rawId, ledger);
    }
  }
  return byRawId;
}

function pickTimestamp(raw = {}) {
  return (
    Date.parse(raw.receivedDateTime || '') ||
    Date.parse(raw.receivedAt || '') ||
    Date.parse(raw.sentDateTime || '') ||
    Date.parse(raw.sentAt || '') ||
    Date.parse(raw.persistedAt || '') ||
    0
  );
}

async function preloadTruthShards(truthStore, ingestionState = {}) {
  if (!truthStore || typeof truthStore.ensureMailboxLoaded !== 'function') return;
  const mailboxIds = new Set();
  for (const raw of Object.values(ingestionState.mailRawMessages || {})) {
    const mailboxId = normalizeEmail(raw.mailboxId);
    if (mailboxId) mailboxIds.add(mailboxId);
  }
  for (const mailboxId of mailboxIds) {
    await truthStore.ensureMailboxLoaded(mailboxId);
  }
}

function buildExistingTruthIndex(truthStore) {
  const byKey = new Map();
  if (!truthStore || typeof truthStore.listMessages !== 'function') return byKey;
  for (const msg of truthStore.listMessages({ limit: 0 })) {
    const mailboxId = normalizeEmail(msg.mailboxId);
    const graphMessageId = normalizeText(msg.graphMessageId).toLowerCase();
    if (!mailboxId || !graphMessageId) continue;
    byKey.set(`${mailboxId}:${graphMessageId}`, msg);
  }
  return byKey;
}

function resolveExistingCustomerId(message = {}) {
  return normalizeText(
    message?.customerIdentity?.canonicalCustomerId || message?.customerIdentity?.customerId
  );
}

function shouldHydrateExistingTruthMessage(existingMessage, ledger = null) {
  const ledgerStatus = normalizeText(ledger?.status).toUpperCase();
  const ledgerPatientId = normalizeText(ledger?.patientId);
  if (ledgerStatus !== 'MATCHED' || !ledgerPatientId) return false;
  const existingCustomerId = resolveExistingCustomerId(existingMessage);
  return !existingCustomerId || existingCustomerId !== ledgerPatientId;
}

function analyzeIngestionState({ ingestionState, truthStore, patientDirectory = [] }) {
  const lookup = buildPipedrivePatientLookup(asArray(patientDirectory));
  const ledgerByRaw = buildLedgerIndex(ingestionState);
  const rawMessages = Object.values(ingestionState.mailRawMessages || {});
  const existingTruthByKey = buildExistingTruthIndex(truthStore);

  const stats = {
    ingestionMessages: rawMessages.length,
    hydratable: 0,
    duplicateSkipped: 0,
    truthAlreadyPresent: 0,
    customerOverlayCandidates: 0,
    missingGraphMessageId: 0,
    missingConversationId: 0,
    missingCustomerId: 0,
    matchedWithCustomerId: 0,
    systemOrScrap: 0,
    customerMismatchBlocked: 0,
    trueUnansweredCandidates: 0,
    customerLinkedThreads: 0,
    ledgerDuplicateSkipped: 0,
    perMailbox: {},
  };

  const threadMap = new Map();

  for (const raw of rawMessages) {
    const mailboxId = normalizeEmail(raw.mailboxId) || 'unknown';
    if (!stats.perMailbox[mailboxId]) {
      stats.perMailbox[mailboxId] = {
        mailboxId,
        ingestionMessages: 0,
        hydratable: 0,
        matched: 0,
        systemOrScrap: 0,
      };
    }
    stats.perMailbox[mailboxId].ingestionMessages += 1;

    const ledger = ledgerByRaw.get(normalizeText(raw.id)) || null;
    const ledgerStatus = normalizeText(ledger?.status).toUpperCase();
    if (ledgerStatus === 'DUPLICATE_SKIPPED') stats.ledgerDuplicateSkipped += 1;

    const truthMessage = buildTruthMessageFromIngestion({ raw, ledger, runId: 'dry-run' });
    const truthKey = `${truthMessage.mailboxId}:${truthMessage.graphMessageId.toLowerCase()}`;

    if (truthMessage.syntheticGraphMessageId) stats.missingGraphMessageId += 1;
    if (!truthMessage.conversationId) stats.missingConversationId += 1;

    const counterparty = resolveCounterpartyEmail(raw, truthMessage.folderType);
    if (isNonPatientCounterpartyEmail(counterparty)) {
      stats.systemOrScrap += 1;
      stats.perMailbox[mailboxId].systemOrScrap += 1;
    }

    if (existingTruthByKey.has(truthKey)) {
      stats.truthAlreadyPresent += 1;
      if (shouldHydrateExistingTruthMessage(existingTruthByKey.get(truthKey), ledger)) {
        stats.customerOverlayCandidates += 1;
        stats.hydratable += 1;
        stats.perMailbox[mailboxId].hydratable += 1;
      } else {
        stats.duplicateSkipped += 1;
      }
      continue;
    }

    stats.hydratable += 1;
    stats.perMailbox[mailboxId].hydratable += 1;

    const patientId = normalizeText(ledger?.patientId);
    if (ledgerStatus === 'MATCHED' && patientId) {
      stats.matchedWithCustomerId += 1;
      stats.perMailbox[mailboxId].matched += 1;
      const emailMatches = asArray(lookup.byEmail.get(counterparty));
      if (emailMatches.length === 1) {
        const expectedId = normalizeText(emailMatches[0].id || emailMatches[0].patientId);
        if (expectedId && expectedId !== patientId) {
          stats.customerMismatchBlocked += 1;
        }
      }
      const threadKey = `${patientId}::${truthMessage.mailboxConversationId || truthMessage.conversationId || truthKey}`;
      if (!threadMap.has(threadKey)) {
        threadMap.set(threadKey, {
          patientId,
          mailboxId,
          conversationId: truthMessage.conversationId,
          inbound: [],
          outbound: [],
        });
      }
      const bucket = threadMap.get(threadKey);
      const ts = pickTimestamp(raw);
      if (truthMessage.direction === 'outbound') bucket.outbound.push(ts);
      else bucket.inbound.push(ts);
    } else {
      stats.missingCustomerId += 1;
    }
  }

  for (const thread of threadMap.values()) {
    stats.customerLinkedThreads += 1;
    const lastIn = thread.inbound.length ? Math.max(...thread.inbound) : NaN;
    const lastOut = thread.outbound.length ? Math.max(...thread.outbound) : NaN;
    if (Number.isFinite(lastIn) && (!Number.isFinite(lastOut) || lastIn > lastOut)) {
      stats.trueUnansweredCandidates += 1;
    }
  }

  return stats;
}

function sortCandidates(rawMessages = [], ledgerByRaw = new Map()) {
  return [...rawMessages].sort((a, b) => pickTimestamp(b) - pickTimestamp(a));
}

async function readIngestionSnapshot(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return { state: JSON.parse(raw), sha256: sha256(raw) };
}

async function writeHydrationAudit(auditLog, event = {}) {
  if (!auditLog?.logEvent) return;
  await auditLog.logEvent({
    kind: event.kind || 'mail.truth_hydration',
    tenantId: event.tenantId || 'hair-tp-clinic',
    actor: event.actor || 'mail-truth-hydration',
    entityKind: 'mail_truth_hydration',
    entityId: event.runId || null,
    detail: event.detail || {},
  });
}

async function runMailTruthHydration({
  ingestionFilePath,
  truthStore,
  auditLog = null,
  patientDirectory = [],
  phase = 'dry-run',
  canaryLimit = DEFAULT_CANARY_LIMIT,
  actor = 'mail-truth-hydration',
  tenantId = 'hair-tp-clinic',
  stopOnCustomerMismatch = true,
} = {}) {
  if (!ingestionFilePath) throw new Error('ingestionFilePath krävs');
  if (!truthStore) throw new Error('truthStore krävs');

  const runId = crypto.randomUUID();
  const startedAt = nowIso();
  const { state: ingestionState, sha256: ingestionShaBefore } =
    await readIngestionSnapshot(ingestionFilePath);

  await preloadTruthShards(truthStore, ingestionState);

  const ledgerByRaw = buildLedgerIndex(ingestionState);
  const analysisBefore = analyzeIngestionState({
    ingestionState,
    truthStore,
    patientDirectory,
  });

  if (analysisBefore.customerMismatchBlocked > 0 && stopOnCustomerMismatch) {
    const err = new Error('customer_identity_mismatch_blocked');
    err.code = 'customer_identity_mismatch_blocked';
    err.stats = analysisBefore;
    throw err;
  }

  const result = {
    ok: true,
    runId,
    phase,
    startedAt,
    completedAt: null,
    dryRun: phase === 'dry-run',
    analysisBefore,
    applied: {
      attempted: 0,
      hydratedMessages: 0,
      duplicateSkipped: 0,
      blockedCustomerMismatch: 0,
      failed: 0,
      batches: 0,
    },
    analysisAfter: null,
    ingestionSha256Before: ingestionShaBefore,
    ingestionSha256After: null,
    stopReason: null,
  };

  if (phase === 'dry-run') {
    result.completedAt = nowIso();
    result.analysisAfter = analysisBefore;
    await writeHydrationAudit(auditLog, {
      runId,
      tenantId,
      actor,
      detail: { phase, ...analysisBefore, dryRun: true },
    });
    return result;
  }

  const allRaw = sortCandidates(Object.values(ingestionState.mailRawMessages || {}), ledgerByRaw);
  const patientLookup = buildPipedrivePatientLookup(asArray(patientDirectory));
  const existingTruthByKey = buildExistingTruthIndex(truthStore);

  const candidates = [];
  for (const raw of allRaw) {
    const ledger = ledgerByRaw.get(normalizeText(raw.id)) || null;
    const truthMessage = buildTruthMessageFromIngestion({ raw, ledger, runId });
    const truthKey = `${truthMessage.mailboxId}:${truthMessage.graphMessageId.toLowerCase()}`;
    const existingMessage = existingTruthByKey.get(truthKey) || null;
    if (existingMessage) {
      if (!shouldHydrateExistingTruthMessage(existingMessage, ledger)) {
        result.applied.duplicateSkipped += 1;
        continue;
      }
    }

    if (ledger && normalizeText(ledger.status).toUpperCase() === 'MATCHED' && ledger.patientId) {
      const counterparty = resolveCounterpartyEmail(raw, truthMessage.folderType);
      const emailMatches = asArray(patientLookup.byEmail.get(counterparty));
      if (emailMatches.length === 1) {
        const expectedId = normalizeText(emailMatches[0].id || emailMatches[0].patientId);
        if (expectedId && expectedId !== normalizeText(ledger.patientId)) {
          result.applied.blockedCustomerMismatch += 1;
          if (stopOnCustomerMismatch) {
            result.ok = false;
            result.stopReason = 'customer_identity_mismatch_blocked';
            result.completedAt = nowIso();
            throw Object.assign(new Error(result.stopReason), { result });
          }
          continue;
        }
      }
    }

    candidates.push({ raw, ledger, truthMessage });
  }

  const limit =
    phase === 'canary'
      ? Math.max(1, Number(canaryLimit) || DEFAULT_CANARY_LIMIT)
      : candidates.length;
  const selected = candidates.slice(0, limit);
  result.applied.attempted = selected.length;

  const truthCountBefore = truthStore.listMessages({ limit: 0 }).length;
  const syncRun =
    typeof truthStore.startBackfillRun === 'function'
      ? await truthStore.startBackfillRun({
          mailboxIds: [...new Set(selected.map((item) => item.truthMessage.mailboxId))],
          folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
          mode: 'ingestion_truth_hydration',
        })
      : typeof truthStore.startSyncRun === 'function'
        ? await truthStore.startSyncRun({
            mailboxIds: [...new Set(selected.map((item) => item.truthMessage.mailboxId))],
            folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
            mode: 'ingestion_truth_hydration',
          })
        : { runId };

  const grouped = new Map();
  for (const item of selected) {
    const key = `${item.truthMessage.mailboxId}::${item.truthMessage.folderType}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item.truthMessage);
  }

  for (const [groupKey, messages] of grouped.entries()) {
    const [mailboxId, folderType] = groupKey.split('::');
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const chunk = messages.slice(i, i + BATCH_SIZE);
      result.applied.batches += 1;
      try {
        await truthStore.recordFolderPage({
          runId: syncRun.runId,
          account: {
            mailboxId,
            mailboxAddress: mailboxId,
            userPrincipalName: mailboxId,
          },
          folder: {
            mailboxId,
            folderType,
            folderName: folderType,
            totalItemCount: chunk.length,
          },
          messages: chunk,
          complete: i + BATCH_SIZE >= messages.length,
          pageSize: chunk.length,
        });
        result.applied.hydratedMessages += chunk.length;
      } catch (error) {
        result.applied.failed += chunk.length;
        result.ok = false;
        result.stopReason = error.message || 'record_folder_page_failed';
        break;
      }
    }
    if (!result.ok) break;
  }

  if (typeof truthStore.finishBackfillRun === 'function' && syncRun?.runId) {
    await truthStore.finishBackfillRun(syncRun.runId, {
      status: result.ok ? 'completed' : 'failed',
      error: result.stopReason,
    });
  } else if (typeof truthStore.finishDeltaRun === 'function' && syncRun?.runId) {
    await truthStore.finishDeltaRun(syncRun.runId, {
      status: result.ok ? 'completed' : 'failed',
      error: result.stopReason,
    });
  }

  const truthCountAfter = truthStore.listMessages({ limit: 0 }).length;
  const truthDelta = Math.max(0, truthCountAfter - truthCountBefore);
  const maxAllowedDelta = Math.ceil(selected.length * MAX_DUPLICATE_EXPLOSION_RATIO);
  if (truthDelta > maxAllowedDelta) {
    result.ok = false;
    result.stopReason = 'duplicate_explosion';
  }

  const { sha256: ingestionShaAfter } = await readIngestionSnapshot(ingestionFilePath);
  result.ingestionSha256After = ingestionShaAfter;
  if (ingestionShaAfter !== ingestionShaBefore) {
    result.ok = false;
    result.stopReason = 'ingestion_mutated';
  }

  result.analysisAfter = analyzeIngestionState({
    ingestionState,
    truthStore,
    patientDirectory,
  });
  result.completedAt = nowIso();

  try {
    await writeHydrationAudit(auditLog, {
      runId,
      tenantId,
      actor,
      detail: {
        phase,
        applied: result.applied,
        truthCountBefore,
        truthCountAfter,
        stopReason: result.stopReason,
      },
    });
  } catch (error) {
    result.ok = false;
    result.stopReason = result.stopReason || 'audit_failed';
    throw error;
  }

  return result;
}

module.exports = {
  HYDRATION_SOURCE,
  analyzeIngestionState,
  buildTruthMessageFromIngestion,
  runMailTruthHydration,
};
