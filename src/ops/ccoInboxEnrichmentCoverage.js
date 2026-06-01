// @ts-nocheck
const {
  createCcoMailboxTruthWorklistReadModel,
  toCanonicalMailboxConversationKey,
} = require('./ccoMailboxTruthWorklistReadModel');
const { resolveLatestWorklistEnrichmentBaseline } = require('../routes/capabilities');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeMailboxId(value = '') {
  return normalizeText(value).toLowerCase();
}

function buildEnrichmentRowConversationKey(row = {}) {
  const mailboxId = normalizeMailboxId(
    row.mailboxId || row.mailboxAddress || row.userPrincipalName
  );
  return toCanonicalMailboxConversationKey({
    mailboxId,
    conversationId: row.conversationId,
    messageId: normalizeText(row.messageId) || 'legacy-row',
  });
}

function hasCcoEnrichmentSignals(row = {}) {
  const intent = normalizeText(row.intent).toLowerCase();
  if (intent && !['unknown', 'unspecified', 'none'].includes(intent)) {
    return true;
  }
  if (normalizeText(row.workflowLane)) return true;
  if (normalizeText(row.dominantRisk)) return true;
  if (normalizeText(row.priorityLevel)) return true;
  if (normalizeText(row.messageClassification)) return true;
  if (normalizeText(row.recommendedAction)) return true;
  if (normalizeText(row.slaStatus)) return true;
  return false;
}

function buildEnrichmentIndex(rows = []) {
  const byConversationKey = new Map();
  for (const row of asArray(rows)) {
    const key = buildEnrichmentRowConversationKey(row);
    if (!key) continue;
    const existing = byConversationKey.get(key);
    if (!existing || !hasCcoEnrichmentSignals(existing)) {
      byConversationKey.set(key, row);
    }
    const colonIndex = key.lastIndexOf(':');
    const suffix = colonIndex > 0 ? key.slice(colonIndex + 1) : key;
    if (suffix) {
      const existingSuffix = byConversationKey.get(suffix);
      if (!existingSuffix || !hasCcoEnrichmentSignals(existingSuffix)) {
        byConversationKey.set(suffix, row);
      }
    }
    const rawConversationId = normalizeText(row.conversationId);
    if (rawConversationId && rawConversationId !== key && rawConversationId !== suffix) {
      const existingRaw = byConversationKey.get(rawConversationId);
      if (!existingRaw || !hasCcoEnrichmentSignals(existingRaw)) {
        byConversationKey.set(rawConversationId, row);
      }
    }
  }
  return byConversationKey;
}

function resolveTruthConversationIds(truthRow = {}) {
  const ids = new Set();
  const conversationId = normalizeText(truthRow.conversationId);
  const mailboxConversationId = normalizeText(truthRow.mailboxConversationId);
  const conversationKey = normalizeText(truthRow.conversationKey);
  if (conversationId) ids.add(conversationId);
  if (mailboxConversationId) ids.add(mailboxConversationId);
  if (conversationKey) ids.add(conversationKey);
  return Array.from(ids).filter(Boolean);
}

function resolveGapConversationId(truthRow = {}) {
  const conversationKey = normalizeText(truthRow.conversationKey);
  if (conversationKey) return conversationKey;
  const mailboxId = normalizeMailboxId(truthRow.mailboxId || truthRow.mailboxAddress);
  const canonicalKey = toCanonicalMailboxConversationKey({
    mailboxId,
    conversationId: truthRow.conversationId,
    mailboxConversationId: truthRow.mailboxConversationId,
    messageId: 'truth-row',
  });
  if (canonicalKey) return canonicalKey;
  return (
    normalizeText(truthRow.mailboxConversationId) || normalizeText(truthRow.conversationId) || ''
  );
}

function resolveEnrichmentIndexMatch(enrichmentIndex = new Map(), candidateKeys = []) {
  for (const candidateKey of asArray(candidateKeys)) {
    const normalizedKey = normalizeText(candidateKey);
    if (!normalizedKey) continue;
    if (enrichmentIndex.has(normalizedKey)) {
      return enrichmentIndex.get(normalizedKey);
    }
    const colonIndex = normalizedKey.lastIndexOf(':');
    if (colonIndex > 0) {
      const suffix = normalizedKey.slice(colonIndex + 1);
      if (suffix && enrichmentIndex.has(suffix)) {
        return enrichmentIndex.get(suffix);
      }
    }
  }
  return null;
}

function truthRowMatchesEnrichment(truthRow = {}, enrichmentIndex = new Map()) {
  const key = normalizeText(truthRow.conversationKey);
  if (key) {
    const matched = resolveEnrichmentIndexMatch(enrichmentIndex, [key]);
    if (matched) return matched;
  }
  const mailboxId = normalizeMailboxId(truthRow.mailboxId || truthRow.mailboxAddress);
  const fallbackKey = toCanonicalMailboxConversationKey({
    mailboxId,
    conversationId: truthRow.conversationId,
    mailboxConversationId: truthRow.mailboxConversationId,
    messageId: 'truth-row',
  });
  const conversationId = normalizeText(truthRow.conversationId);
  const mailboxConversationId = normalizeText(truthRow.mailboxConversationId);
  return resolveEnrichmentIndexMatch(enrichmentIndex, [
    fallbackKey,
    mailboxConversationId,
    conversationId,
  ]);
}

async function computeCcoInboxEnrichmentCoverage({
  tenantId = '',
  mailboxIds = [],
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  customerState = null,
  readyThresholdPercent = 99.5,
} = {}) {
  const resolvedMailboxIds = asArray(mailboxIds)
    .map((item) => normalizeMailboxId(item))
    .filter(Boolean);

  let resolvedCustomerState = customerState;
  if (
    !resolvedCustomerState &&
    ccoCustomerStore &&
    typeof ccoCustomerStore.getTenantCustomerState === 'function'
  ) {
    resolvedCustomerState = await ccoCustomerStore.getTenantCustomerState({ tenantId });
  }

  const worklistReadModel =
    ccoMailboxTruthStore && typeof ccoMailboxTruthStore.listMessages === 'function'
      ? createCcoMailboxTruthWorklistReadModel({
          store: ccoMailboxTruthStore,
          customerState: resolvedCustomerState,
          tenantId,
        })
      : null;

  const truthRows = worklistReadModel
    ? worklistReadModel.listWorklistRows({
        mailboxIds: resolvedMailboxIds,
        includeOutOfScopeDraftReview: false,
      })
    : [];

  const baseline = await resolveLatestWorklistEnrichmentBaseline({
    capabilityAnalysisStore,
    tenantId,
    mailboxIds: resolvedMailboxIds,
  });
  const enrichmentRows = [
    ...asArray(baseline?.selectedConversationWorklist),
    ...asArray(baseline?.selectedNeedsReplyToday),
  ];
  const enrichmentIndex = buildEnrichmentIndex(enrichmentRows);

  const perMailboxMap = new Map();
  const gapConversationIds = [];
  const sampleUnenrichedIds = [];
  let enrichedConversationCount = 0;

  for (const truthRow of truthRows) {
    const mailboxId =
      normalizeMailboxId(truthRow.mailboxId || truthRow.mailboxAddress) || 'unknown';
    if (!perMailboxMap.has(mailboxId)) {
      perMailboxMap.set(mailboxId, {
        mailboxId,
        truthConversationCount: 0,
        enrichedConversationCount: 0,
        gapCount: 0,
        coveragePercent: 0,
      });
    }
    const mailboxStats = perMailboxMap.get(mailboxId);
    mailboxStats.truthConversationCount += 1;

    const matchedRow = truthRowMatchesEnrichment(truthRow, enrichmentIndex);
    const enriched = Boolean(matchedRow && hasCcoEnrichmentSignals(matchedRow));
    if (enriched) {
      enrichedConversationCount += 1;
      mailboxStats.enrichedConversationCount += 1;
    } else {
      const gapId = resolveGapConversationId(truthRow);
      if (gapId) {
        gapConversationIds.push(gapId);
        if (sampleUnenrichedIds.length < 25) {
          sampleUnenrichedIds.push(gapId);
        }
      }
      mailboxStats.gapCount += 1;
    }
  }

  const truthConversationCount = truthRows.length;
  const gapCount = Math.max(0, truthConversationCount - enrichedConversationCount);
  const coveragePercent =
    truthConversationCount > 0
      ? Math.round((enrichedConversationCount / truthConversationCount) * 10000) / 100
      : 100;
  const threshold = Math.max(90, Math.min(100, Number(readyThresholdPercent) || 99.5));
  const readyForWork = gapCount === 0 || coveragePercent >= threshold;

  const perMailbox = Array.from(perMailboxMap.values())
    .map((item) => ({
      ...item,
      coveragePercent:
        item.truthConversationCount > 0
          ? Math.round((item.enrichedConversationCount / item.truthConversationCount) * 10000) / 100
          : 100,
    }))
    .sort((left, right) => left.mailboxId.localeCompare(right.mailboxId));

  const generatedAt =
    normalizeText(baseline?.selectedOutputData?.generatedAt) ||
    normalizeText(baseline?.selectedEntry?.ts) ||
    null;

  return {
    tenantId: normalizeText(tenantId) || null,
    truthConversationCount,
    enrichedConversationCount,
    gapCount,
    coveragePercent,
    perMailbox,
    sampleUnenrichedIds,
    gapConversationIds,
    lastEnrichmentAt: generatedAt,
    lastEnrichmentEntryId: normalizeText(baseline?.selectedEntry?.id) || null,
    readyForWork,
    readyThresholdPercent: threshold,
  };
}

module.exports = {
  buildEnrichmentRowConversationKey,
  hasCcoEnrichmentSignals,
  resolveGapConversationId,
  resolveTruthConversationIds,
  computeCcoInboxEnrichmentCoverage,
};
