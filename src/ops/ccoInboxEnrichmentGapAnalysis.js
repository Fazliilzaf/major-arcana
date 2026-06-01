// @ts-nocheck
const { classifyConversationMessage } = require('../intelligence/messageClassification');
const {
  createCcoMailboxTruthWorklistReadModel,
  toCanonicalMailboxConversationKey,
} = require('./ccoMailboxTruthWorklistReadModel');
const { resolveLatestWorklistEnrichmentBaseline } = require('../routes/capabilities');
const {
  computeCcoInboxEnrichmentCoverage,
  hasCcoEnrichmentSignals,
  buildEnrichmentRowConversationKey,
  truthRowMatchesEnrichment,
  resolveGapConversationId,
} = require('./ccoInboxEnrichmentCoverage');
const {
  buildAnalyzeInboxSnapshotFromMailboxTruth,
} = require('./buildAnalyzeInboxSnapshotFromMailboxTruth');

const GAP_BUCKETS = Object.freeze([
  'missing_graphMessageId',
  'no_truth_body_or_headers',
  'system_scrap_should_exclude',
  'duplicate_or_alias',
  'outside_supported_mailbox',
  'missing_customer_identity',
  'unsupported_message_shape',
  'enrichment_parser_empty',
  'corrupted_or_incomplete_truth_row',
  'should_be_excluded_from_threshold',
  'can_fallback_enrich',
  'unclassified_blocker',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeMailboxId(value = '') {
  return normalizeText(value).toLowerCase();
}

function hashToken(value = '') {
  const raw = normalizeText(value);
  if (!raw) return null;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `h${hash.toString(16).padStart(8, '0')}`;
}

function extractEmailDomain(email = '') {
  const normalized = normalizeText(email).toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at >= normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

function resolveDirection(truthRow = {}) {
  const inbound = normalizeText(truthRow.lastInboundAt);
  const outbound = normalizeText(truthRow.lastOutboundAt);
  if (inbound && outbound) {
    if (inbound > outbound) return 'inbound';
    if (outbound > inbound) return 'outbound';
    return 'mixed';
  }
  if (inbound) return 'inbound';
  if (outbound) return 'outbound';
  return 'unknown';
}

function resolveMessageGroup(conversationKey = '', gapId = '', messageGroups = new Map()) {
  const candidates = [conversationKey, gapId]
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (messageGroups.has(candidate)) return messageGroups.get(candidate);
  }
  for (const candidate of candidates) {
    const colon = candidate.lastIndexOf(':');
    const suffix = colon > 0 ? candidate.slice(colon + 1) : candidate;
    if (suffix && messageGroups.has(suffix)) return messageGroups.get(suffix);
  }
  for (const candidate of candidates) {
    const colon = candidate.lastIndexOf(':');
    const suffix = colon > 0 ? candidate.slice(colon + 1) : candidate;
    if (!suffix) continue;
    for (const [key, group] of messageGroups.entries()) {
      if (key === suffix || key.endsWith(`:${suffix}`)) return group;
    }
  }
  return null;
}

function buildTruthMessageGroups(store, mailboxIds = []) {
  const groups = new Map();
  const messages = store.listMessages({
    mailboxIds: mailboxIds.length > 0 ? mailboxIds : undefined,
    folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
  });
  for (const rawMessage of asArray(messages)) {
    const message = asObject(rawMessage);
    const mailboxId = normalizeMailboxId(
      message.mailboxId || message.mailboxAddress || message.userPrincipalName
    );
    const key = toCanonicalMailboxConversationKey({
      mailboxId,
      conversationId: message.conversationId,
      mailboxConversationId: message.mailboxConversationId,
      messageId: message.graphMessageId,
    });
    if (!key) continue;
    const bucket = groups.get(key) || {
      conversationKey: key,
      mailboxId,
      messages: [],
      graphMessageIdCount: 0,
      bodyPreviewCount: 0,
      subjectCount: 0,
      deletedOnly: true,
      folderTypes: new Set(),
    };
    const folderType = normalizeText(message.folderType).toLowerCase();
    bucket.folderTypes.add(folderType || 'unknown');
    if (folderType !== 'deleted') bucket.deletedOnly = false;
    if (normalizeText(message.graphMessageId)) bucket.graphMessageIdCount += 1;
    if (normalizeText(message.bodyPreview)) bucket.bodyPreviewCount += 1;
    if (normalizeText(message.subject)) bucket.subjectCount += 1;
    bucket.messages.push(message);
    groups.set(key, bucket);
    const colon = key.lastIndexOf(':');
    const suffix = colon > 0 ? key.slice(colon + 1) : key;
    if (suffix && !groups.has(suffix)) groups.set(suffix, bucket);
  }
  return groups;
}

function buildIngestionIndex(ingestionStore) {
  const index = new Map();
  if (!ingestionStore || typeof ingestionStore.getConversationIngestionMap !== 'function') {
    return index;
  }
  const map = ingestionStore.getConversationIngestionMap({ mailboxEmail: '' }) || {};
  for (const [key, value] of Object.entries(map)) {
    index.set(normalizeText(key).toLowerCase(), asObject(value));
  }
  return index;
}

function buildEnrichmentIndexAllRows(rows = []) {
  const byKey = new Map();
  for (const row of asArray(rows)) {
    const key = buildEnrichmentRowConversationKey(row);
    if (key) byKey.set(key, row);
    const rawId = normalizeText(row.conversationId).toLowerCase();
    if (rawId) byKey.set(rawId, row);
    const colon = key.lastIndexOf(':');
    if (colon > 0) {
      byKey.set(key.slice(colon + 1).toLowerCase(), row);
    }
  }
  return byKey;
}

function resolveIngestionMatch(conversationKey = '', ingestionIndex = new Map()) {
  const normalized = normalizeText(conversationKey).toLowerCase();
  if (ingestionIndex.has(normalized)) return ingestionIndex.get(normalized);
  const colon = normalized.lastIndexOf(':');
  if (colon > 0) {
    const suffix = normalized.slice(colon + 1);
    for (const [key, value] of ingestionIndex.entries()) {
      if (key.endsWith(`:${suffix}`) || key === suffix) return value;
    }
  }
  return null;
}

function isDuplicateAlias(conversationKey = '', duplicateKeys = new Set()) {
  const normalized = normalizeText(conversationKey).toLowerCase();
  return duplicateKeys.has(normalized);
}

function buildDuplicateIndex(gapRows = []) {
  const bySuffix = new Map();
  const byIdentity = new Map();
  for (const row of gapRows) {
    const key = normalizeText(row.conversationKey || row.gapId).toLowerCase();
    const colon = key.lastIndexOf(':');
    const suffix = colon > 0 ? key.slice(colon + 1) : key;
    if (suffix) {
      const bucket = bySuffix.get(suffix) || [];
      bucket.push(key);
      bySuffix.set(suffix, bucket);
    }
    const identityKey = [
      normalizeText(row.customerEmail).toLowerCase(),
      hashToken(normalizeText(row.subject).slice(0, 80)),
    ].join('|');
    if (identityKey !== '|') {
      const bucket = byIdentity.get(identityKey) || [];
      bucket.push(key);
      byIdentity.set(identityKey, bucket);
    }
  }
  const duplicateKeys = new Set();
  for (const keys of bySuffix.values()) {
    if (keys.length > 1) keys.forEach((item) => duplicateKeys.add(item));
  }
  for (const keys of byIdentity.values()) {
    if (keys.length > 1) keys.forEach((item) => duplicateKeys.add(item));
  }
  return duplicateKeys;
}

function categorizeGap({
  truthRow = {},
  messageGroup = null,
  enrichmentRow = null,
  ingestionMatch = null,
  supportedMailboxIds = new Set(),
  duplicateIndex = new Set(),
  snapshotProbe = null,
}) {
  const conversationKey =
    normalizeText(truthRow.conversationKey) || resolveGapConversationId(truthRow) || null;
  const mailboxId = normalizeMailboxId(truthRow.mailboxId || truthRow.mailboxAddress);
  const customerIdentity = asObject(truthRow.customerIdentity);
  const customerId = normalizeText(customerIdentity.customerId || customerIdentity.id);
  const customerEmail = normalizeText(truthRow.customerEmail);
  const hasCustomerId = Boolean(customerId);
  const hasCustomerEmail = Boolean(customerEmail);
  const graphMessageIdPresent = Number(messageGroup?.graphMessageIdCount || 0) > 0;
  const hasBodyPreview = Number(messageGroup?.bodyPreviewCount || 0) > 0;
  const hasSubject =
    Number(messageGroup?.subjectCount || 0) > 0 || Boolean(normalizeText(truthRow.subject));
  const truthRowPresent = Boolean(conversationKey);
  const ingestionMatched = Boolean(ingestionMatch && Number(ingestionMatch.matchedCount || 0) > 0);
  const ingestionPresent = Boolean(ingestionMatch);
  const direction = resolveDirection(truthRow);
  const latestDate =
    normalizeText(truthRow.latestMessageAt) ||
    normalizeText(truthRow.lastInboundAt) ||
    normalizeText(truthRow.lastOutboundAt) ||
    null;
  const messageClassification =
    normalizeText(truthRow.messageClassification) ||
    classifyConversationMessage({
      subject: truthRow.subject,
      inboundPreview: truthRow.latestPreview,
      sender: truthRow.customerEmail,
    });
  const isSystemScrap = messageClassification === 'system_mail';
  const duplicate = isDuplicateAlias(conversationKey, duplicateIndex);
  const outsideMailbox =
    mailboxId && supportedMailboxIds.size > 0 && !supportedMailboxIds.has(mailboxId);
  const enrichmentRowPresent = Boolean(enrichmentRow);
  const enrichmentSignalsPresent = enrichmentRow ? hasCcoEnrichmentSignals(enrichmentRow) : false;
  const snapshotViable =
    snapshotProbe == null
      ? graphMessageIdPresent && (hasBodyPreview || hasSubject) && !deletedOnly && !outsideMailbox
      : Boolean(snapshotProbe?.ok && Number(snapshotProbe?.conversationCount || 0) > 0);
  const deletedOnly = Boolean(messageGroup?.deletedOnly);

  const flags = [];
  let primaryBucket = 'unclassified_blocker';
  let whyEnrichmentMissing = 'unknown';
  let canFallbackEnrich = false;
  let shouldExcludeFromThreshold = false;

  if (!truthRowPresent || !mailboxId) {
    primaryBucket = 'corrupted_or_incomplete_truth_row';
    whyEnrichmentMissing = 'truth_row_missing_key_or_mailbox';
    shouldExcludeFromThreshold = true;
  } else if (outsideMailbox) {
    primaryBucket = 'outside_supported_mailbox';
    whyEnrichmentMissing = 'mailbox_outside_scheduler_scope';
    shouldExcludeFromThreshold = true;
  } else if (!graphMessageIdPresent) {
    primaryBucket = 'missing_graphMessageId';
    whyEnrichmentMissing = 'truth_messages_lack_graph_message_id';
  } else if (!hasBodyPreview && !hasSubject) {
    primaryBucket = 'no_truth_body_or_headers';
    whyEnrichmentMissing = 'no_body_preview_or_subject_in_truth';
  } else if (isSystemScrap || deletedOnly) {
    primaryBucket = 'system_scrap_should_exclude';
    whyEnrichmentMissing = deletedOnly ? 'deleted_only_thread' : 'classified_system_or_scrap_mail';
    shouldExcludeFromThreshold = true;
  } else if (duplicate) {
    primaryBucket = 'duplicate_or_alias';
    whyEnrichmentMissing = 'duplicate_conversation_alias_across_mailbox_or_identity';
    shouldExcludeFromThreshold = true;
  } else if (enrichmentRowPresent && !enrichmentSignalsPresent) {
    primaryBucket = 'enrichment_parser_empty';
    whyEnrichmentMissing = 'analyze_inbox_row_exists_without_workflow_signals';
  } else if (!hasCustomerId && !hasCustomerEmail) {
    primaryBucket = 'missing_customer_identity';
    whyEnrichmentMissing = 'no_customer_id_or_counterparty_email';
  } else if (!snapshotViable) {
    primaryBucket = 'unsupported_message_shape';
    whyEnrichmentMissing = 'truth_snapshot_builder_excludes_conversation';
  } else {
    primaryBucket = 'enrichment_parser_empty';
    whyEnrichmentMissing = 'snapshot_viable_but_no_enrichment_signals_after_batches';
  }

  if (
    graphMessageIdPresent &&
    (hasBodyPreview || hasSubject) &&
    !isSystemScrap &&
    !deletedOnly &&
    !outsideMailbox &&
    snapshotViable
  ) {
    canFallbackEnrich = true;
    flags.push('can_fallback_enrich');
  }
  if (shouldExcludeFromThreshold) {
    flags.push('should_be_excluded_from_threshold');
  }
  if (ingestionPresent) flags.push('ingestion_row_present');
  if (ingestionMatched) flags.push('ingestion_matched');

  return {
    conversationKey,
    threadKey: conversationKey,
    mailboxId,
    customerIdPresent: hasCustomerId,
    customerEmailPresent: hasCustomerEmail,
    customerEmailDomain: extractEmailDomain(customerEmail),
    graphMessageIdPresent,
    truthRowPresent,
    ingestionMatchPresent: ingestionPresent,
    ingestionMatched,
    direction,
    latestDate,
    messageClassification,
    isSystemScrap,
    duplicate,
    deletedOnly,
    enrichmentRowPresent,
    enrichmentSignalsPresent,
    snapshotViable,
    snapshotConversationCount: Number(snapshotProbe?.conversationCount || 0),
    snapshotMessageCount: Number(snapshotProbe?.messageCount || 0),
    messageCount: Number(messageGroup?.messages?.length || truthRow.messageCount || 0),
    primaryBucket,
    flags,
    whyEnrichmentMissing,
    canFallbackEnrich,
    shouldExcludeFromThreshold,
    subjectToken: hashToken(normalizeText(truthRow.subject).slice(0, 120)),
  };
}

function summarizeRemainder(rows = []) {
  const bucketCounts = Object.fromEntries(GAP_BUCKETS.map((bucket) => [bucket, 0]));
  const mailboxCounts = {};
  let canFallback = 0;
  let shouldExclude = 0;
  for (const row of rows) {
    bucketCounts[row.primaryBucket] = (bucketCounts[row.primaryBucket] || 0) + 1;
    mailboxCounts[row.mailboxId] = (mailboxCounts[row.mailboxId] || 0) + 1;
    if (row.canFallbackEnrich) canFallback += 1;
    if (row.shouldExcludeFromThreshold) shouldExclude += 1;
  }
  return {
    rowCount: rows.length,
    bucketCounts,
    mailboxCounts,
    canFallbackEnrichCount: canFallback,
    shouldExcludeFromThresholdCount: shouldExclude,
  };
}

function buildBucketRecommendations(bucketCounts = {}) {
  const recommendations = [];
  const add = (bucket, decision, rationale) => {
    if (!bucketCounts[bucket]) return;
    recommendations.push({ bucket, count: bucketCounts[bucket], decision, rationale });
  };
  add(
    'system_scrap_should_exclude',
    'exclude_from_denominator',
    'Automatiskt/systemskräp ska inte räknas mot operativ worklist-tröskel.'
  );
  add(
    'duplicate_or_alias',
    'exclude_from_denominator',
    'Dubbletter/alias bör dedupliceras i denominator, inte retry-enrichas.'
  );
  add(
    'outside_supported_mailbox',
    'exclude_from_denominator',
    'Mailbox utanför scheduler-scope ska inte ingå i backfill-tröskel.'
  );
  add(
    'missing_graphMessageId',
    'leave_unresolved',
    'Kräver Graph-sync eller truth-repair — inte truth-only fallback.'
  );
  add(
    'no_truth_body_or_headers',
    'leave_unresolved',
    'Saknar minsta analysunderlag i truth store.'
  );
  add(
    'enrichment_parser_empty',
    'enrich_via_fallback',
    'Har snapshot-underlag men AnalyzeInbox gav inga signaler — regelbaserad fallback möjlig.'
  );
  add(
    'can_fallback_enrich',
    'enrich_via_fallback',
    'Kandidater med graphMessageId + preview/subject och icke-system.'
  );
  add(
    'missing_customer_identity',
    'needs_manual_review',
    'Kan enrichas med låg confidence men bör inte auto-kopplas till kundkort.'
  );
  add(
    'unsupported_message_shape',
    'bugfix_needed',
    'Snapshot-byggaren exkluderar konversation — undersök filter/keys.'
  );
  add(
    'corrupted_or_incomplete_truth_row',
    'bugfix_needed',
    'Truth-rad ofullständig — data repair.'
  );
  add('unclassified_blocker', 'needs_manual_review', 'Kräver manuell rotorsak.');
  return recommendations;
}

async function analyzeCcoInboxEnrichmentGaps({
  tenantId = '',
  mailboxIds = [],
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  ccoMailIngestionStore = null,
  supportedMailboxIds = [],
  stateRoot = '',
  detailLimit = 200,
  snapshotProbeLimit = 0,
} = {}) {
  const coverage = await computeCcoInboxEnrichmentCoverage({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    stateRoot,
  });

  const baseline = await resolveLatestWorklistEnrichmentBaseline({
    capabilityAnalysisStore,
    tenantId,
    mailboxIds,
  });
  const enrichmentRows = [
    ...asArray(baseline?.selectedConversationWorklist),
    ...asArray(baseline?.selectedNeedsReplyToday),
  ];
  const enrichmentIndex = buildEnrichmentIndexAllRows(enrichmentRows);

  let customerState = null;
  if (ccoCustomerStore && typeof ccoCustomerStore.getTenantCustomerState === 'function') {
    customerState = await ccoCustomerStore.getTenantCustomerState({ tenantId });
  }

  const worklistReadModel = createCcoMailboxTruthWorklistReadModel({
    store: ccoMailboxTruthStore,
    customerState,
    tenantId,
  });
  const truthRows = worklistReadModel.listWorklistRows({
    mailboxIds,
    includeOutOfScopeDraftReview: false,
  });
  const truthByGapId = new Map();
  for (const truthRow of truthRows) {
    const gapId = resolveGapConversationId(truthRow);
    if (!gapId) continue;
    const matched = truthRowMatchesEnrichment(truthRow, enrichmentIndex);
    if (matched && hasCcoEnrichmentSignals(matched)) continue;
    truthByGapId.set(gapId.toLowerCase(), { ...truthRow, gapId });
  }

  const effectiveGapIds = Array.from(truthByGapId.values())
    .map((row) => row.gapId)
    .filter(Boolean);

  const messageGroups = buildTruthMessageGroups(ccoMailboxTruthStore, mailboxIds);
  const ingestionIndex = buildIngestionIndex(ccoMailIngestionStore);
  const supportedSet = new Set(
    asArray(supportedMailboxIds.length > 0 ? supportedMailboxIds : mailboxIds)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean)
  );

  const provisionalRows = effectiveGapIds.map((gapId) => {
    const truthRow = truthByGapId.get(gapId.toLowerCase()) || { conversationKey: gapId, gapId };
    return {
      conversationKey: normalizeText(truthRow.conversationKey) || gapId,
      gapId,
      customerEmail: normalizeText(truthRow.customerEmail),
      subject: normalizeText(truthRow.subject),
    };
  });
  const duplicateKeys = buildDuplicateIndex(provisionalRows);

  const analyzed = [];
  let snapshotProbes = 0;
  const safeSnapshotProbeLimit = Math.max(0, Math.min(50, Number(snapshotProbeLimit) || 0));

  for (const gapId of effectiveGapIds) {
    const truthRow = truthByGapId.get(gapId.toLowerCase()) || {
      conversationKey: gapId,
      gapId,
      mailboxId: gapId.includes(':') ? gapId.slice(0, gapId.indexOf(':')) : null,
    };
    const conversationKey =
      normalizeText(truthRow.conversationKey) || resolveGapConversationId(truthRow) || gapId;
    const messageGroup = resolveMessageGroup(conversationKey, gapId, messageGroups);
    const enrichmentRow =
      enrichmentIndex.get(conversationKey.toLowerCase()) ||
      enrichmentIndex.get(gapId.toLowerCase()) ||
      null;
    const ingestionMatch = resolveIngestionMatch(conversationKey, ingestionIndex);

    let snapshotProbe = null;
    if (snapshotProbes < safeSnapshotProbeLimit) {
      snapshotProbe = buildAnalyzeInboxSnapshotFromMailboxTruth({
        ccoMailboxTruthStore,
        mailboxIds: mailboxIds.length > 0 ? mailboxIds : [truthRow.mailboxId].filter(Boolean),
        lookbackDays: 365,
        conversationIds: [conversationKey, gapId],
      });
      snapshotProbes += 1;
      snapshotProbe = {
        ok: snapshotProbe?.ok === true,
        conversationCount: Number(snapshotProbe?.snapshot?.metadata?.conversationCount || 0),
        messageCount: Number(snapshotProbe?.snapshot?.metadata?.messageCount || 0),
      };
    }

    analyzed.push(
      categorizeGap({
        truthRow: { ...truthRow, conversationKey },
        messageGroup,
        enrichmentRow,
        ingestionMatch,
        supportedMailboxIds: supportedSet,
        duplicateIndex: duplicateKeys,
        snapshotProbe,
      })
    );
  }

  analyzed.sort((left, right) => left.primaryBucket.localeCompare(right.primaryBucket));

  const bucketCounts = Object.fromEntries(GAP_BUCKETS.map((bucket) => [bucket, 0]));
  for (const row of analyzed) {
    bucketCounts[row.primaryBucket] = (bucketCounts[row.primaryBucket] || 0) + 1;
  }
  bucketCounts.can_fallback_enrich = analyzed.filter((row) => row.canFallbackEnrich).length;
  bucketCounts.should_be_excluded_from_threshold = analyzed.filter(
    (row) => row.shouldExcludeFromThreshold
  ).length;

  const safeDetailLimit = Math.max(1, Math.min(775, Number(detailLimit) || 200));
  const details = analyzed.slice(0, safeDetailLimit);
  const remainder = analyzed.slice(safeDetailLimit);

  const canFallbackEnrichCount = analyzed.filter((row) => row.canFallbackEnrich).length;
  const shouldExcludeCount = analyzed.filter((row) => row.shouldExcludeFromThreshold).length;
  const trueBlockerCount = analyzed.length - shouldExcludeCount;

  return {
    generatedAt: new Date().toISOString(),
    tenantId: normalizeText(tenantId) || null,
    coverage: {
      truthConversationCount: coverage.truthConversationCount,
      enrichedConversationCount: coverage.enrichedConversationCount,
      gapCount: coverage.gapCount,
      coveragePercent: coverage.coveragePercent,
      readyForWork: coverage.readyForWork,
      readyThresholdPercent: coverage.readyThresholdPercent,
      lastEnrichmentEntryId: coverage.lastEnrichmentEntryId,
    },
    totalGap: analyzed.length,
    bucketCounts,
    canFallbackEnrichCount,
    shouldExcludeFromThresholdCount: shouldExcludeCount,
    trueBlockerCount,
    snapshotProbesUsed: snapshotProbes,
    details,
    remainderSummary: summarizeRemainder(remainder),
    bucketRecommendations: buildBucketRecommendations(bucketCounts),
    projectedCoverageIfExclude: (() => {
      const denom = Math.max(1, coverage.truthConversationCount - shouldExcludeCount);
      const enriched = coverage.enrichedConversationCount;
      return Math.round((enriched / denom) * 10000) / 100;
    })(),
  };
}

module.exports = {
  GAP_BUCKETS,
  analyzeCcoInboxEnrichmentGaps,
  categorizeGap,
};
