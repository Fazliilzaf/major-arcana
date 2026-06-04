// @ts-nocheck
const crypto = require('node:crypto');
const { toCanonicalMailboxConversationKey } = require('./ccoMailboxTruthWorklistReadModel');
const { buildTruthMessageFromIngestion } = require('./mailTruthHydrationFromIngestion');

const REPAIR_STATUSES = Object.freeze([
  'repairable_single_match',
  'ambiguous_multiple_matches',
  'no_candidate',
  'corrupted_truth_row',
  'should_remain_unresolved',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hashToken(value = '', maxLen = 120) {
  const raw = normalizeText(value).slice(0, maxLen);
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
}

function parseConversationKey(conversationKey = '') {
  const normalized = normalizeText(conversationKey);
  const colon = normalized.lastIndexOf(':');
  if (colon <= 0) return { mailboxId: null, conversationId: null, conversationKey: normalized };
  return {
    mailboxId: normalizeEmail(normalized.slice(0, colon)),
    conversationId: normalized.slice(colon + 1),
    conversationKey: normalized,
  };
}

function resolveDirection(raw = {}, folderType = '') {
  const ft = normalizeText(folderType || raw.folderType).toLowerCase();
  if (ft === 'sent' || ft === 'drafts') return 'outbound';
  if (ft === 'inbox') return 'inbound';
  return 'unknown';
}

function resolveCounterpartyEmail(raw = {}, folderType = '') {
  const direction = resolveDirection(raw, folderType);
  if (direction === 'outbound') {
    const to = asArray(raw.toEmails || raw.toAddresses || raw.to)[0];
    if (typeof to === 'string') return normalizeEmail(to);
    return normalizeEmail(to?.address || to?.email);
  }
  return normalizeEmail(raw.fromEmail || raw.from?.address || raw.from);
}

function buildCandidateFingerprint({
  mailboxId = '',
  conversationId = '',
  internetMessageId = '',
  subjectHash = '',
  snippetHash = '',
  sentAt = '',
  receivedAt = '',
  fromHash = '',
  toHash = '',
} = {}) {
  return [
    normalizeEmail(mailboxId),
    normalizeText(conversationId),
    normalizeText(internetMessageId).toLowerCase(),
    subjectHash || '',
    snippetHash || '',
    sentAt || '',
    receivedAt || '',
    fromHash || '',
    toHash || '',
  ].join('\0');
}

function buildIngestionCandidateIndex(ingestionStore) {
  const byConversation = new Map();
  const byInternetMessageId = new Map();
  if (!ingestionStore || typeof ingestionStore.getRawMessage !== 'function') {
    return { byConversation, byInternetMessageId };
  }

  const state = ingestionStore.getState?.() || null;
  const ledgers = state?.mailProcessingLedger || {};
  const rawMessages = state?.mailRawMessages || {};

  for (const ledger of Object.values(ledgers)) {
    const raw = rawMessages[ledger?.rawMessageId];
    if (!raw) continue;
    const mailboxId = normalizeEmail(raw.mailboxId);
    const conversationId = normalizeText(raw.conversationId || raw.mailboxConversationId);
    const graphMessageId =
      normalizeText(raw.graphMessageId) ||
      normalizeText(raw.immutableGraphId) ||
      normalizeText(raw.rawJson?.graphMessageId);
    if (!mailboxId || !conversationId || !graphMessageId) continue;

    const folderType = normalizeText(raw.folderType).toLowerCase();
    const candidate = {
      source: 'ingestion_ledger',
      mailboxId,
      conversationId,
      graphMessageId,
      internetMessageId: normalizeText(raw.internetMessageId) || null,
      rawMessageId: normalizeText(raw.id) || null,
      subjectHash: hashToken(raw.subject),
      snippetHash: hashToken(raw.bodyPreview || raw.snippet),
      receivedAt: normalizeText(raw.receivedDateTime || raw.receivedAt) || null,
      sentAt: normalizeText(raw.sentDateTime || raw.sentAt) || null,
      fromHash: hashToken(resolveCounterpartyEmail(raw, folderType)),
      toHash: hashToken(asArray(raw.toEmails).join(',')),
      canonicalConversationKey: toCanonicalMailboxConversationKey({
        mailboxId,
        conversationId,
        mailboxConversationId: conversationId,
        messageId: graphMessageId,
      }),
    };

    const convKey = `${mailboxId}\0${conversationId}`;
    const bucket = byConversation.get(convKey) || [];
    bucket.push(candidate);
    byConversation.set(convKey, bucket);

    const internetMessageId = normalizeText(raw.internetMessageId);
    if (internetMessageId) {
      const imKey = `${mailboxId}\0${internetMessageId.toLowerCase()}`;
      const imBucket = byInternetMessageId.get(imKey) || [];
      imBucket.push(candidate);
      byInternetMessageId.set(imKey, imBucket);
    }
  }

  return { byConversation, byInternetMessageId };
}

function buildTruthCandidateIndex(truthStore) {
  const byConversation = new Map();
  if (!truthStore || typeof truthStore.listMessages !== 'function') {
    return { byConversation };
  }

  for (const message of truthStore.listMessages()) {
    const mailboxId = normalizeEmail(message.mailboxId || message.mailboxAddress);
    const conversationId =
      normalizeText(message.conversationId) || normalizeText(message.mailboxConversationId) || null;
    const graphMessageId = normalizeText(message.graphMessageId);
    if (!mailboxId || !conversationId || !graphMessageId) continue;

    const folderType = normalizeText(message.folderType).toLowerCase();
    const candidate = {
      source: 'truth_message',
      mailboxId,
      conversationId,
      graphMessageId,
      internetMessageId: normalizeText(message.internetMessageId) || null,
      subjectHash: hashToken(message.subject),
      snippetHash: hashToken(message.bodyPreview),
      receivedAt: normalizeText(message.receivedAt) || null,
      sentAt: normalizeText(message.sentAt) || null,
      fromHash: hashToken(resolveCounterpartyEmail(message, folderType)),
      toHash: hashToken(
        asArray(message.toRecipients)
          .map((item) => item?.address)
          .join(',')
      ),
      canonicalConversationKey: toCanonicalMailboxConversationKey({
        mailboxId,
        conversationId,
        mailboxConversationId: message.mailboxConversationId,
        messageId: graphMessageId,
      }),
    };

    const convKey = `${mailboxId}\0${conversationId}`;
    const bucket = byConversation.get(convKey) || [];
    bucket.push(candidate);
    byConversation.set(convKey, bucket);
  }

  return { byConversation };
}

function dedupeCandidates(candidates = []) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.graphMessageId}:${candidate.rawMessageId || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function scoreCandidateMatch(gapRow = {}, candidate = {}) {
  let score = 0;
  const checks = [];
  if (normalizeEmail(gapRow.mailboxId) !== normalizeEmail(candidate.mailboxId)) {
    return { score: -1, checks: ['mailbox_mismatch'] };
  }
  score += 10;
  checks.push('mailbox');

  const gapConv = parseConversationKey(gapRow.conversationKey || gapRow.threadKey).conversationId;
  if (gapConv && normalizeText(candidate.conversationId) === normalizeText(gapConv)) {
    score += 20;
    checks.push('conversationId');
  } else {
    return { score: -1, checks: ['conversation_mismatch'] };
  }

  if (gapRow.subjectToken && candidate.subjectHash && gapRow.subjectToken.startsWith('h')) {
    const gapSubjectHash = gapRow.subjectToken.slice(1);
    if (candidate.subjectHash?.startsWith(gapSubjectHash)) {
      score += 5;
      checks.push('subjectHash');
    }
  }

  if (gapRow.latestDate && (candidate.receivedAt || candidate.sentAt)) {
    const gapMs = Date.parse(gapRow.latestDate);
    const candMs = Date.parse(candidate.receivedAt || candidate.sentAt);
    if (Number.isFinite(gapMs) && Number.isFinite(candMs) && Math.abs(gapMs - candMs) <= 86400000) {
      score += 3;
      checks.push('timestamp');
    }
  }

  if (gapRow.customerEmailDomain && candidate.fromHash) {
    score += 1;
    checks.push('identity_hint');
  }

  return { score, checks };
}

function classifyRepairRow(gapRow = {}, ingestionIndex, truthIndex) {
  const parsed = parseConversationKey(gapRow.conversationKey || gapRow.threadKey);
  if (!parsed.mailboxId || !parsed.conversationId) {
    return {
      conversationKey: gapRow.conversationKey || null,
      repairStatus: 'corrupted_truth_row',
      matchCount: 0,
      candidates: [],
      selectedCandidate: null,
      matchStrategy: null,
    };
  }

  const convKey = `${parsed.mailboxId}\0${parsed.conversationId}`;
  const ingestionCandidates = dedupeCandidates(ingestionIndex.byConversation.get(convKey) || []);
  const truthCandidates = dedupeCandidates(truthIndex.byConversation.get(convKey) || []);

  const aliasCandidates = truthCandidates.filter(
    (candidate) =>
      normalizeText(candidate.canonicalConversationKey).toLowerCase() !==
      normalizeText(parsed.conversationKey).toLowerCase()
  );

  let candidates = [];
  let matchStrategy = null;

  if (ingestionCandidates.length === 1) {
    candidates = ingestionCandidates;
    matchStrategy = 'ingestion_conversation_single';
  } else if (ingestionCandidates.length > 1) {
    const scored = ingestionCandidates
      .map((candidate) => ({
        candidate,
        ...scoreCandidateMatch(gapRow, candidate),
      }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    const second = scored[1];
    if (top && (!second || top.score > second.score)) {
      candidates = [top.candidate];
      matchStrategy = 'ingestion_conversation_scored_single';
    } else {
      candidates = ingestionCandidates;
      matchStrategy = 'ingestion_conversation_ambiguous';
    }
  } else if (truthCandidates.length === 1) {
    candidates = truthCandidates;
    matchStrategy = 'truth_conversation_single';
  } else if (aliasCandidates.length === 1) {
    candidates = aliasCandidates;
    matchStrategy = 'truth_alias_single';
  } else if (truthCandidates.length > 1 || ingestionCandidates.length > 1) {
    candidates = dedupeCandidates([...ingestionCandidates, ...truthCandidates]);
    matchStrategy = 'multi_source_ambiguous';
  }

  const matchCount = candidates.length;
  let repairStatus = 'no_candidate';
  if (matchCount === 1) repairStatus = 'repairable_single_match';
  else if (matchCount > 1) repairStatus = 'ambiguous_multiple_matches';
  else if (gapRow.isSystemScrap || gapRow.duplicate) repairStatus = 'should_remain_unresolved';

  const selectedCandidate = matchCount === 1 ? candidates[0] : null;

  return {
    conversationKey: parsed.conversationKey,
    mailboxId: parsed.mailboxId,
    conversationId: parsed.conversationId,
    repairStatus,
    matchCount,
    matchStrategy,
    candidatesFull: dedupeCandidates(candidates),
    candidates: candidates.slice(0, 5).map((candidate) => ({
      source: candidate.source,
      graphMessageId: candidate.graphMessageId,
      internetMessageId: candidate.internetMessageId,
      rawMessageId: candidate.rawMessageId || null,
      canonicalConversationKey: candidate.canonicalConversationKey || null,
    })),
    selectedCandidate: selectedCandidate
      ? {
          source: selectedCandidate.source,
          graphMessageId: selectedCandidate.graphMessageId,
          internetMessageId: selectedCandidate.internetMessageId || null,
          rawMessageId: selectedCandidate.rawMessageId || null,
          canonicalConversationKey: selectedCandidate.canonicalConversationKey || null,
        }
      : null,
  };
}

function buildGraphMessageIdRepairPlan({
  gapDetails = [],
  ingestionStore = null,
  truthStore = null,
} = {}) {
  const missingGraphRows = asArray(gapDetails).filter(
    (row) => normalizeText(row.primaryBucket) === 'missing_graphMessageId'
  );
  const ingestionIndex = buildIngestionCandidateIndex(ingestionStore);
  const truthIndex = buildTruthCandidateIndex(truthStore);

  const rows = missingGraphRows.map((gapRow) =>
    classifyRepairRow(gapRow, ingestionIndex, truthIndex)
  );

  const statusCounts = Object.fromEntries(REPAIR_STATUSES.map((status) => [status, 0]));
  const mailboxCounts = {};
  for (const row of rows) {
    statusCounts[row.repairStatus] = (statusCounts[row.repairStatus] || 0) + 1;
    mailboxCounts[row.mailboxId] = (mailboxCounts[row.mailboxId] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    analyzedCount: rows.length,
    statusCounts,
    mailboxCounts,
    repairableCount: statusCounts.repairable_single_match || 0,
    ambiguousCount: statusCounts.ambiguous_multiple_matches || 0,
    noCandidateCount: statusCounts.no_candidate || 0,
    rows,
  };
}

function buildRepairTruthMessageFromCandidate({ candidate = {}, ingestionStore = null } = {}) {
  if (candidate.source !== 'ingestion_ledger' || !candidate.rawMessageId) return null;
  if (!ingestionStore || typeof ingestionStore.getRawMessage !== 'function') return null;
  const raw = ingestionStore.getRawMessage(candidate.rawMessageId);
  if (!raw) return null;
  const ledger = ingestionStore.getLedgerByRawMessageId?.(candidate.rawMessageId) || null;
  return buildTruthMessageFromIngestion({ raw, ledger, runId: 'graph_message_id_repair_v1' });
}

module.exports = {
  REPAIR_STATUSES,
  buildGraphMessageIdRepairPlan,
  buildIngestionCandidateIndex,
  buildTruthCandidateIndex,
  classifyRepairRow,
  buildRepairTruthMessageFromCandidate,
  parseConversationKey,
  hashToken,
  buildCandidateFingerprint,
  dedupeCandidates,
  scoreCandidateMatch,
};
