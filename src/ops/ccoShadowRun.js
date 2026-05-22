function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toTimestampMs(value) {
  const iso = toIso(value);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compareIsoDesc(left = '', right = '') {
  return String(right || '').localeCompare(String(left || ''));
}

function clamp(value, min, max, fallback = min) {
  const numeric = toNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function normalizeEmail(value = '') {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const candidate = normalizeText((match ? match[1] : raw).replace(/^mailto:/i, ''));
  if (!candidate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return '';
  return candidate;
}

function normalizeSubjectKey(value = '') {
  let subject = normalizeText(value).toLowerCase();
  if (!subject) return '';
  const prefixPattern = /^(re|sv|fw|fwd)\s*:\s*/i;
  let previous = '';
  while (subject && subject !== previous) {
    previous = subject;
    subject = subject.replace(prefixPattern, '').trim();
  }
  return subject.replace(/\s+/g, ' ');
}

function normalizeOutcomeCode(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (
    [
      'booked',
      'rebooked',
      'replied',
      'not_interested',
      'escalated',
      'no_response',
      'closed_no_action',
    ].includes(normalized)
  ) {
    return normalized;
  }
  return '';
}

function normalizeActionType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'reply_sent' || normalized === 'cco.reply.sent') return 'reply_sent';
  if (normalized === 'reply_later' || normalized === 'cco.reply.later') return 'reply_later';
  if (normalized === 'customer_replied' || normalized === 'cco.customer.replied') {
    return 'customer_replied';
  }
  if (normalized === 'conversation_deleted' || normalized === 'cco.conversation.deleted') {
    return 'conversation_deleted';
  }
  return '';
}

function classifyOutcomeBucket(outcomeCode = '') {
  const normalized = normalizeOutcomeCode(outcomeCode);
  if (['booked', 'rebooked', 'replied'].includes(normalized)) return 'positive';
  if (['escalated', 'no_response'].includes(normalized)) return 'negative';
  if (['not_interested', 'closed_no_action'].includes(normalized)) return 'neutral';
  return 'pending';
}

function capText(value, maxLength = 180) {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function toHistoryPattern(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['reschedule', 'complaint', 'booking', 'mixed'].includes(normalized)) return normalized;
  return 'none';
}

function toDraftMode(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['short', 'warm', 'professional'].includes(normalized)) return normalized;
  return null;
}

function buildConversationMap(systemStateSnapshot = {}) {
  const map = new Map();
  for (const conversation of asArray(systemStateSnapshot?.conversations)) {
    const conversationId = normalizeText(conversation?.conversationId || conversation?.id);
    if (!conversationId) continue;
    const messages = asArray(conversation?.messages)
      .slice()
      .sort((left, right) => compareIsoDesc(left?.sentAt || left?.ts, right?.sentAt || right?.ts));
    const latestInbound = messages.find((message) => normalizeText(message?.direction).toLowerCase() !== 'outbound');
    map.set(conversationId, {
      conversationId,
      subject: normalizeText(conversation?.subject) || '(utan ämne)',
      customerEmail: normalizeEmail(
        conversation?.customerEmail ||
          latestInbound?.senderEmail ||
          latestInbound?.customerEmail
      ),
      mailboxId:
        normalizeEmail(
          conversation?.mailboxId || conversation?.mailboxAddress || conversation?.userPrincipalName
        ) ||
        normalizeEmail(
          latestInbound?.mailboxId || latestInbound?.mailboxAddress || latestInbound?.userPrincipalName
        ) ||
        null,
      latestInboundPreview:
        capText(
          latestInbound?.bodyPreview ||
            latestInbound?.preview ||
            latestInbound?.text ||
            latestInbound?.content,
          180
        ) || null,
      latestInboundAt: toIso(conversation?.lastInboundAt || latestInbound?.sentAt) || null,
    });
  }
  return map;
}

function summarizeRecommendationStats(items = [], getKey, getLabel = getKey) {
  const index = new Map();
  for (const item of items) {
    const rawKey = getKey(item);
    const key = normalizeText(rawKey).toLowerCase();
    if (!key) continue;
    const entry =
      index.get(key) ||
      {
        key,
        label: normalizeText(getLabel(item)) || normalizeText(rawKey),
        totalCount: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        pendingCount: 0,
      };
    entry.totalCount += 1;
    const bucket = normalizeText(item?.outcomeBucket).toLowerCase();
    if (bucket === 'positive') entry.positiveCount += 1;
    else if (bucket === 'negative') entry.negativeCount += 1;
    else if (bucket === 'neutral') entry.neutralCount += 1;
    else entry.pendingCount += 1;
    index.set(key, entry);
  }
  return Array.from(index.values()).sort((left, right) => {
    if (right.positiveCount !== left.positiveCount) {
      return right.positiveCount - left.positiveCount;
    }
    if (left.negativeCount !== right.negativeCount) {
      return left.negativeCount - right.negativeCount;
    }
    return String(left.label).localeCompare(String(right.label));
  });
}

function pickBestSummary(summary = []) {
  return asArray(summary).find((item) => Number(item?.positiveCount || 0) > 0) || null;
}

function pickWorstSummary(summary = []) {
  return (
    asArray(summary)
      .slice()
      .sort((left, right) => {
        if (Number(right?.negativeCount || 0) !== Number(left?.negativeCount || 0)) {
          return Number(right?.negativeCount || 0) - Number(left?.negativeCount || 0);
        }
        return Number(right?.pendingCount || 0) - Number(left?.pendingCount || 0);
      })
      .find((item) => Number(item?.negativeCount || 0) > 0 || Number(item?.pendingCount || 0) > 0) ||
    null
  );
}

function summarizeRecommendationStatsByIntent(items = [], getKey, getLabel = getKey) {
  const indexByIntent = new Map();
  for (const item of items) {
    const intentKey = normalizeText(item?.intent).toLowerCase() || 'okänd intent';
    const bucketIndex = indexByIntent.get(intentKey) || {};
    const rawKey = getKey(item);
    const key = normalizeText(rawKey).toLowerCase();
    if (!key) continue;
    const entry =
      bucketIndex[key] || {
        key,
        label: normalizeText(getLabel(item)) || normalizeText(rawKey),
        totalCount: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        pendingCount: 0,
      };
    entry.totalCount += 1;
    const bucket = normalizeText(item?.outcomeBucket).toLowerCase();
    if (bucket === 'positive') entry.positiveCount += 1;
    else if (bucket === 'negative') entry.negativeCount += 1;
    else if (bucket === 'neutral') entry.neutralCount += 1;
    else entry.pendingCount += 1;
    bucketIndex[key] = entry;
    indexByIntent.set(intentKey, bucketIndex);
  }

  return Array.from(indexByIntent.entries())
    .map(([intentKey, bucketIndex]) => {
      const summary = Object.values(bucketIndex)
        .sort((left, right) => {
          if (Number(right?.positiveCount || 0) !== Number(left?.positiveCount || 0)) {
            return Number(right?.positiveCount || 0) - Number(left?.positiveCount || 0);
          }
          if (Number(left?.negativeCount || 0) !== Number(right?.negativeCount || 0)) {
            return Number(right?.negativeCount || 0) - Number(left?.negativeCount || 0);
          }
          return String(left?.label || '').localeCompare(String(right?.label || ''));
        })
        .slice(0, 6);
      return {
        intent: intentKey,
        label: intentKey,
        totalCount: summary.reduce((sum, item) => sum + Number(item?.totalCount || 0), 0),
        best: pickBestSummary(summary),
        worst: pickWorstSummary(summary),
        summary,
      };
    })
    .sort((left, right) => {
      if (Number(right?.best?.positiveCount || 0) !== Number(left?.best?.positiveCount || 0)) {
        return Number(right?.best?.positiveCount || 0) - Number(left?.best?.positiveCount || 0);
      }
      if (Number(right?.totalCount || 0) !== Number(left?.totalCount || 0)) {
        return Number(right?.totalCount || 0) - Number(left?.totalCount || 0);
      }
      return String(left?.label || '').localeCompare(String(right?.label || ''));
    })
    .slice(0, 8);
}

function summarizeMailboxPerformance(items = []) {
  const index = new Map();
  for (const item of items) {
    const mailboxId = normalizeEmail(item?.mailboxId) || 'okänd mailbox';
    const entry =
      index.get(mailboxId) || {
        mailboxId,
        totalCount: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        pendingCount: 0,
        actionItems: [],
        modeItems: [],
      };
    entry.totalCount += 1;
    const bucket = normalizeText(item?.outcomeBucket).toLowerCase();
    if (bucket === 'positive') entry.positiveCount += 1;
    else if (bucket === 'negative') entry.negativeCount += 1;
    else if (bucket === 'neutral') entry.neutralCount += 1;
    else entry.pendingCount += 1;
    entry.actionItems.push(item);
    entry.modeItems.push(item);
    index.set(mailboxId, entry);
  }

  return Array.from(index.values())
    .map((entry) => {
      const actionSummary = summarizeRecommendationStats(
        entry.actionItems,
        (item) => item.recommendedAction,
        (item) => item.recommendedAction
      );
      const modeSummary = summarizeRecommendationStats(
        entry.modeItems,
        (item) => item.recommendedMode,
        (item) => item.recommendedMode
      );
      return {
        mailboxId: entry.mailboxId,
        totalCount: entry.totalCount,
        positiveCount: entry.positiveCount,
        negativeCount: entry.negativeCount,
        neutralCount: entry.neutralCount,
        pendingCount: entry.pendingCount,
        bestAction: pickBestSummary(actionSummary),
        bestMode: pickBestSummary(modeSummary),
        worstAction: pickWorstSummary(actionSummary),
      };
    })
    .sort((left, right) => {
      if (Number(right?.positiveCount || 0) !== Number(left?.positiveCount || 0)) {
        return Number(right?.positiveCount || 0) - Number(left?.positiveCount || 0);
      }
      if (Number(right?.totalCount || 0) !== Number(left?.totalCount || 0)) {
        return Number(right?.totalCount || 0) - Number(left?.totalCount || 0);
      }
      return String(left?.mailboxId || '').localeCompare(String(right?.mailboxId || ''));
    });
}

function buildFailurePatternSummary({
  intentMismatchCount = 0,
  missedReopenCount = 0,
  missedFollowUpCount = 0,
  mergeDuplicateCount = 0,
} = {}) {
  return [
    { key: 'intent_mismatch', label: 'Fel intent', count: intentMismatchCount },
    { key: 'missed_reopen', label: 'Missad reopen', count: missedReopenCount },
    { key: 'missed_follow_up', label: 'Missad follow-up', count: missedFollowUpCount },
    { key: 'merge_duplicate', label: 'Merge/dubblett', count: mergeDuplicateCount },
  ]
    .filter((item) => Number(item?.count || 0) > 0)
    .sort((left, right) => Number(right?.count || 0) - Number(left?.count || 0));
}

function buildShadowRunOutput({
  analyzeResult = {},
  systemStateSnapshot = {},
  mailboxIds = [],
  lookbackDays = 14,
  generatedAt = nowIso(),
} = {}) {
  const outputData = asObject(analyzeResult?.data);
  const worklist = asArray(outputData.conversationWorklist);
  const draftByConversationId = new Map(
    asArray(outputData.suggestedDrafts).map((draft) => [
      normalizeText(draft?.conversationId),
      asObject(draft),
    ])
  );
  const conversationMap = buildConversationMap(systemStateSnapshot);
  const recommendations = worklist
    .map((row) => {
      const conversationId = normalizeText(row?.conversationId);
      if (!conversationId) return null;
      const conversation = conversationMap.get(conversationId) || {};
      const draft = draftByConversationId.get(conversationId) || {};
      const historySignals = asObject(row?.historySignals);
      const customerSummary = asObject(row?.customerSummary);
      return {
        generatedAt,
        conversationId,
        messageId: normalizeText(row?.messageId) || null,
        mailboxId:
          normalizeEmail(row?.mailboxId || row?.mailboxAddress || row?.userPrincipalName) ||
          conversation.mailboxId ||
          null,
        customerEmail:
          normalizeEmail(conversation.customerEmail || customerSummary.customerEmail) || null,
        subject: normalizeText(row?.subject || conversation.subject) || '(utan ämne)',
        latestInboundPreview:
          capText(row?.latestInboundPreview || conversation.latestInboundPreview, 180) || null,
        latestInboundAt: toIso(row?.lastInboundAt || conversation.latestInboundAt) || null,
        priorityLevel: normalizeText(row?.priorityLevel) || null,
        priorityScore: clamp(row?.priorityScore, 0, 100, 0),
        dominantRisk: normalizeText(row?.dominantRisk).toLowerCase() || null,
        intent: normalizeText(row?.intent).toLowerCase() || null,
        intentConfidence: clamp(row?.intentConfidence, 0, 1, 0),
        tone: normalizeText(row?.tone).toLowerCase() || null,
        recommendedAction: normalizeText(row?.recommendedAction) || null,
        recommendedMode: toDraftMode(draft?.recommendedMode),
        followUpSuggested: row?.followUpSuggested === true,
        followUpSuggestedAt: toIso(row?.followUpSuggestedAt) || null,
        historyPattern: toHistoryPattern(historySignals.pattern || customerSummary.historySignalPattern),
        historySummary:
          capText(
            historySignals.summary ||
              historySignals.calibrationSummary ||
              customerSummary.historySignalSummary,
            180
          ) || null,
        lifecycleStatus:
          normalizeText(customerSummary.lifecycleStatus || row?.needsReplyStatus) || null,
      };
    })
    .filter(Boolean);

  return {
    generatedAt,
    mailboxIds: asArray(mailboxIds).map((item) => normalizeEmail(item)).filter(Boolean),
    lookbackDays: clamp(lookbackDays, 1, 30, 14),
    summary: {
      recommendationCount: recommendations.length,
      conversationCount: recommendations.length,
      draftRecommendationCount: recommendations.filter((item) => item.recommendedMode).length,
      followUpCount: recommendations.filter((item) => item.followUpSuggested).length,
      highPriorityCount: recommendations.filter((item) =>
        ['high', 'critical'].includes(normalizeText(item.priorityLevel).toLowerCase())
      ).length,
      intents: Array.from(
        new Set(recommendations.map((item) => normalizeText(item.intent)).filter(Boolean))
      ).sort(),
    },
    recommendations,
  };
}

function flattenShadowRecommendations(entries = [], {
  mailboxIds = [],
  lookbackDays = 14,
  intent = null,
  now = nowIso(),
} = {}) {
  const safeMailboxIds = new Set(asArray(mailboxIds).map((item) => normalizeEmail(item)).filter(Boolean));
  const safeIntent = normalizeText(intent).toLowerCase();
  const thresholdMs = Date.now() - clamp(lookbackDays, 1, 365, 14) * 24 * 60 * 60 * 1000;
  const latestByConversation = new Map();

  for (const entry of asArray(entries)) {
    const entryTs = toTimestampMs(entry?.ts);
    if (Number.isFinite(entryTs) && entryTs < thresholdMs) continue;
    const outputData = asObject(entry?.output?.data);
    const recommendations = asArray(outputData.recommendations);
    for (const rawRecommendation of recommendations) {
      const recommendation = asObject(rawRecommendation);
      const conversationId = normalizeText(recommendation.conversationId);
      const mailboxId = normalizeEmail(recommendation.mailboxId);
      const recommendationIntent = normalizeText(recommendation.intent).toLowerCase();
      const key =
        conversationId ||
        [
          normalizeEmail(recommendation.customerEmail),
          normalizeSubjectKey(recommendation.subject),
          mailboxId,
        ]
          .filter(Boolean)
          .join('|');
      if (!key) continue;
      if (safeMailboxIds.size > 0 && (!mailboxId || !safeMailboxIds.has(mailboxId))) continue;
      if (safeIntent && recommendationIntent && safeIntent !== recommendationIntent) continue;
      const generatedAt =
        toIso(recommendation.generatedAt || outputData.generatedAt || entry.ts || now) || now;
      const current = latestByConversation.get(key);
      if (current && compareIsoDesc(current.generatedAt, generatedAt) <= 0) continue;
      latestByConversation.set(key, {
        ...recommendation,
        generatedAt,
        mailboxId: mailboxId || null,
        customerEmail: normalizeEmail(recommendation.customerEmail) || null,
        subject: normalizeText(recommendation.subject) || '(utan ämne)',
        intent: recommendationIntent || null,
        recommendedAction: normalizeText(recommendation.recommendedAction) || null,
        recommendedMode: toDraftMode(recommendation.recommendedMode),
      });
    }
  }

  return Array.from(latestByConversation.values()).sort((left, right) =>
    compareIsoDesc(left.generatedAt, right.generatedAt)
  );
}

function buildConversationEventIndex(items = []) {
  const index = new Map();
  for (const item of asArray(items)) {
    const conversationId = normalizeText(item?.conversationId);
    if (!conversationId) continue;
    const entry = index.get(conversationId) || [];
    entry.push(item);
    index.set(conversationId, entry);
  }
  for (const entry of index.values()) {
    entry.sort((left, right) => compareIsoDesc(left?.recordedAt, right?.recordedAt));
  }
  return index;
}

function latestAfter(items = [], sinceIso = null, predicate = null) {
  const sinceMs = toTimestampMs(sinceIso);
  return asArray(items)
    .slice()
    .sort((left, right) => compareIsoDesc(left?.recordedAt, right?.recordedAt))
    .find((item) => {
      const itemMs = toTimestampMs(item?.recordedAt);
      if (Number.isFinite(sinceMs) && Number.isFinite(itemMs) && itemMs < sinceMs) return false;
      return typeof predicate === 'function' ? predicate(item) : true;
    }) || null;
}

function summarizeShadowReview({
  shadowEntries = [],
  actions = [],
  outcomes = [],
  mailboxIds = [],
  lookbackDays = 14,
  intent = null,
  limit = 60,
  generatedAt = nowIso(),
} = {}) {
  const recommendations = flattenShadowRecommendations(shadowEntries, {
    mailboxIds,
    lookbackDays,
    intent,
    now: generatedAt,
  });
  const actionIndex = buildConversationEventIndex(actions);
  const outcomeIndex = buildConversationEventIndex(outcomes);
  const mergeIndex = new Map();
  const comparisons = [];
  const suspectIntentMismatch = [];
  const suspectMissedReopen = [];
  const suspectMissedFollowUp = [];
  const suspectMergeDuplicates = [];
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let pendingCount = 0;
  let operatorOverrideCount = 0;
  let modeOverrideCount = 0;

  for (const recommendation of recommendations) {
    const recommendationTs = recommendation.generatedAt;
    const conversationId = normalizeText(recommendation.conversationId);
    const conversationActions = actionIndex.get(conversationId) || [];
    const conversationOutcomes = outcomeIndex.get(conversationId) || [];
    const operatorAction = latestAfter(conversationActions, recommendationTs, (item) =>
      ['reply_sent', 'reply_later', 'conversation_deleted'].includes(normalizeActionType(item?.actionType))
    );
    const customerReply = latestAfter(conversationActions, recommendationTs, (item) =>
      normalizeActionType(item?.actionType) === 'customer_replied'
    );
    const latestOutcome = latestAfter(conversationOutcomes, recommendationTs);
    const actualIntent =
      normalizeText(
        latestOutcome?.intent || operatorAction?.intent || customerReply?.intent
      ).toLowerCase() || null;
    const outcomeCode = normalizeOutcomeCode(latestOutcome?.outcomeCode);
    const outcomeBucket = classifyOutcomeBucket(outcomeCode);
    if (outcomeBucket === 'positive') positiveCount += 1;
    else if (outcomeBucket === 'negative') negativeCount += 1;
    else if (outcomeBucket === 'neutral') neutralCount += 1;
    else pendingCount += 1;

    const selectedMode = toDraftMode(operatorAction?.selectedMode);
    const recommendedMode = toDraftMode(recommendation.recommendedMode);
    const modeOverridden =
      Boolean(recommendedMode && selectedMode && recommendedMode !== selectedMode);
    if (modeOverridden) modeOverrideCount += 1;

    const actionOverridden =
      Boolean(
        normalizeText(operatorAction?.recommendedAction) &&
          recommendation.recommendedAction &&
          normalizeText(operatorAction?.recommendedAction) !== recommendation.recommendedAction
      );
    if (actionOverridden) operatorOverrideCount += 1;

    const comparison = {
      conversationId,
      mailboxId: recommendation.mailboxId || null,
      customerEmail: recommendation.customerEmail || null,
      subject: recommendation.subject,
      generatedAt: recommendation.generatedAt,
      intent: recommendation.intent || null,
      actualIntent,
      recommendedAction: recommendation.recommendedAction || null,
      operatorActionType: normalizeActionType(operatorAction?.actionType) || null,
      operatorActionLabel: normalizeText(operatorAction?.actionLabel) || null,
      recommendedMode,
      selectedMode,
      outcomeCode: outcomeCode || null,
      outcomeLabel: normalizeText(latestOutcome?.outcomeLabel) || null,
      outcomeBucket,
      followUpSuggestedAt: recommendation.followUpSuggestedAt || null,
      historyPattern: recommendation.historyPattern || null,
      dominantRisk: recommendation.dominantRisk || null,
      modeOverridden,
      actionOverridden,
    };
    comparisons.push(comparison);

    if (
      recommendation.intent &&
      actualIntent &&
      recommendation.intent !== actualIntent
    ) {
      suspectIntentMismatch.push(comparison);
    }

    if (customerReply?.recordedAt) {
      const customerReplyMs = toTimestampMs(customerReply.recordedAt);
      const laterOperatorAction = latestAfter(conversationActions, customerReply.recordedAt, (item) =>
        ['reply_sent', 'reply_later', 'conversation_deleted'].includes(normalizeActionType(item?.actionType))
      );
      const laterOutcome = latestAfter(conversationOutcomes, customerReply.recordedAt);
      if (
        Number.isFinite(customerReplyMs) &&
        Date.now() - customerReplyMs >= 12 * 60 * 60 * 1000 &&
        !laterOperatorAction &&
        !laterOutcome
      ) {
        suspectMissedReopen.push({
          ...comparison,
          customerRepliedAt: customerReply.recordedAt,
        });
      }
    }

    if (recommendation.followUpSuggestedAt) {
      const followUpDueMs = toTimestampMs(recommendation.followUpSuggestedAt);
      const laterOperatorAction = latestAfter(conversationActions, recommendation.followUpSuggestedAt, (item) =>
        ['reply_sent', 'reply_later', 'conversation_deleted'].includes(normalizeActionType(item?.actionType))
      );
      const laterOutcome = latestAfter(conversationOutcomes, recommendation.followUpSuggestedAt);
      if (
        Number.isFinite(followUpDueMs) &&
        Date.now() - followUpDueMs >= 6 * 60 * 60 * 1000 &&
        !laterOperatorAction &&
        !laterOutcome
      ) {
        suspectMissedFollowUp.push(comparison);
      }
    }

    const mergeKey = [
      normalizeEmail(recommendation.customerEmail),
      normalizeSubjectKey(recommendation.subject),
    ]
      .filter(Boolean)
      .join('|');
    if (mergeKey) {
      const entry = mergeIndex.get(mergeKey) || [];
      entry.push(comparison);
      mergeIndex.set(mergeKey, entry);
    }
  }

  for (const group of mergeIndex.values()) {
    const conversationIds = Array.from(
      new Set(group.map((item) => normalizeText(item.conversationId)).filter(Boolean))
    );
    if (conversationIds.length <= 1) continue;
    suspectMergeDuplicates.push({
      customerEmail: group[0]?.customerEmail || null,
      subject: group[0]?.subject || null,
      conversationIds,
      mailboxIds: Array.from(new Set(group.map((item) => normalizeEmail(item.mailboxId)).filter(Boolean))),
      count: conversationIds.length,
    });
  }

  const comparisonItems = comparisons
    .slice()
    .sort((left, right) => compareIsoDesc(left.generatedAt, right.generatedAt));
  const actionSummary = summarizeRecommendationStats(
    comparisonItems,
    (item) => item.recommendedAction,
    (item) => item.recommendedAction
  );
  const modeSummary = summarizeRecommendationStats(
    comparisonItems,
    (item) => item.recommendedMode,
    (item) => item.recommendedMode
  );
  const intentSummary = summarizeRecommendationStats(
    comparisonItems,
    (item) => item.intent,
    (item) => item.intent
  );
  const actionSummaryByIntent = summarizeRecommendationStatsByIntent(
    comparisonItems,
    (item) => item.recommendedAction,
    (item) => item.recommendedAction
  );
  const modeSummaryByIntent = summarizeRecommendationStatsByIntent(
    comparisonItems,
    (item) => item.recommendedMode,
    (item) => item.recommendedMode
  );
  const mailboxSummary = summarizeMailboxPerformance(comparisonItems);
  const failurePatternSummary = buildFailurePatternSummary({
    intentMismatchCount: suspectIntentMismatch.length,
    missedReopenCount: suspectMissedReopen.length,
    missedFollowUpCount: suspectMissedFollowUp.length,
    mergeDuplicateCount: suspectMergeDuplicates.length,
  });

  return {
    generatedAt,
    lookbackDays: clamp(lookbackDays, 1, 365, 14),
    mailboxIds: asArray(mailboxIds).map((item) => normalizeEmail(item)).filter(Boolean),
    intent: normalizeText(intent).toLowerCase() || null,
    totals: {
      recommendationCount: comparisonItems.length,
      positiveCount,
      negativeCount,
      neutralCount,
      pendingCount,
      operatorOverrideCount,
      modeOverrideCount,
    },
    best: {
      action: pickBestSummary(actionSummary),
      mode: pickBestSummary(modeSummary),
    },
    worst: {
      action: pickWorstSummary(actionSummary),
      mode: pickWorstSummary(modeSummary),
    },
    summaries: {
      actionSummary: actionSummary.slice(0, 12),
      modeSummary: modeSummary.slice(0, 12),
      intentSummary: intentSummary.slice(0, 12),
      actionSummaryByIntent,
      modeSummaryByIntent,
      mailboxSummary,
      failurePatternSummary,
    },
    suspectCounts: {
      intentMismatch: suspectIntentMismatch.length,
      missedReopen: suspectMissedReopen.length,
      missedFollowUp: suspectMissedFollowUp.length,
      mergeDuplicate: suspectMergeDuplicates.length,
    },
    suspectCases: {
      intentMismatch: suspectIntentMismatch.slice(0, limit),
      missedReopen: suspectMissedReopen.slice(0, limit),
      missedFollowUp: suspectMissedFollowUp.slice(0, limit),
      mergeDuplicate: suspectMergeDuplicates.slice(0, limit),
    },
    comparisons: comparisonItems.slice(0, limit),
  };
}

module.exports = {
  buildShadowRunOutput,
  summarizeShadowReview,
};
