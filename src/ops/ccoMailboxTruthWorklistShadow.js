const {
  createCcoMailboxTruthWorklistReadModel,
  isOutOfScopeDraftReview,
  toCanonicalMailboxConversationKey,
} = require('./ccoMailboxTruthWorklistReadModel');

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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMailboxId(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeLane(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (
    [
      'all',
      'act-now',
      'sprint',
      'later',
      'review',
      'medical',
      'bookable',
      'admin',
      'unclear',
    ].includes(normalized)
  ) {
    return normalized;
  }
  return 'all';
}

function buildLegacyConversationKey(row = {}) {
  const safeRow = asObject(row);
  const mailboxId = normalizeMailboxId(
    safeRow.mailboxId || safeRow.mailboxAddress || safeRow.userPrincipalName
  );
  return toCanonicalMailboxConversationKey({
    mailboxId,
    conversationId: safeRow.conversationId,
    messageId: normalizeText(safeRow.messageId) || 'legacy-row',
  });
}

function deriveLegacyLane(row = {}) {
  const safeRow = asObject(row);
  const workflowLane = normalizeText(safeRow.workflowLane).toLowerCase();
  const priorityLevel = normalizeText(safeRow.priorityLevel).toLowerCase();
  const slaStatus = normalizeText(safeRow.slaStatus).toLowerCase();
  const bookingState = normalizeText(safeRow.bookingState).toLowerCase();
  const waitingOn = normalizeText(safeRow.waitingOn).toLowerCase();
  const reviewFlagCandidates = [
    safeRow.reviewRequired,
    safeRow.needsReview,
    safeRow.manualReviewRequired,
    safeRow.latestOutcome?.reviewRequired,
    safeRow.latestReplyDraft?.reviewRequired,
  ];
  const reviewDecisionCandidates = [
    safeRow.risk?.decision,
    safeRow.latestOutcome?.risk?.decision,
    safeRow.latestReplyDraft?.risk?.decision,
    safeRow.latestReplySuggestion?.risk?.decision,
    safeRow.customerSummary?.risk?.decision,
    safeRow.deliveryMode,
    safeRow.latestOutcome?.deliveryMode,
    safeRow.latestReplyDraft?.deliveryMode,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);

  if (
    reviewFlagCandidates.some((value) => value === true) ||
    reviewDecisionCandidates.some(
      (value) => value === 'review_required' || value === 'manual_review_required'
    )
  ) {
    return 'review';
  }
  if (normalizeText(safeRow.intent).toLowerCase() === 'unclear' || normalizeText(safeRow.intent).toLowerCase() === 'oklart') {
    return 'unclear';
  }
  if (workflowLane === 'medical_review' || safeRow.needsMedicalReview === true) {
    return 'medical';
  }
  if (workflowLane === 'booking_ready' || bookingState.includes('ready')) {
    return 'bookable';
  }
  if (workflowLane === 'admin_low') {
    return 'admin';
  }
  if (workflowLane === 'waiting_reply' || waitingOn === 'customer') {
    return 'later';
  }
  if (slaStatus === 'breach' || workflowLane === 'action_now') {
    return 'act-now';
  }
  if (['critical', 'high'].includes(priorityLevel)) {
    return 'sprint';
  }
  return 'all';
}

function countBy(items = [], getKey) {
  const counts = {};
  for (const item of asArray(items)) {
    const key = normalizeText(getKey(item));
    if (!key) continue;
    counts[key] = Number(counts[key] || 0) + 1;
  }
  return counts;
}

function toSeverityRank(classification = '') {
  const normalized = normalizeText(classification).toLowerCase();
  if (normalized === 'bug') return 5;
  if (normalized === 'unknown') return 4;
  if (normalized === 'mapping_gap') return 3;
  if (normalized === 'truth_shift') return 2;
  if (normalized === 'out_of_scope_draft_review') return 1;
  if (normalized === 'legacy_heuristic') return 1;
  return 0;
}

function pickPrimaryClassification(classifications = []) {
  return asArray(classifications)
    .filter(Boolean)
    .sort((left, right) => toSeverityRank(right) - toSeverityRank(left))[0] || 'match';
}

function createCcoMailboxTruthWorklistShadow({ store = null, customerState = null } = {}) {
  if (!store || typeof store.listMessages !== 'function') {
    return null;
  }
  const worklistReadModel = createCcoMailboxTruthWorklistReadModel({ store, customerState });
  if (!worklistReadModel || typeof worklistReadModel.listWorklistRows !== 'function') {
    return null;
  }

  function buildLegacyRows({
    legacyConversationWorklist = [],
    legacyNeedsReplyToday = [],
    mailboxIds = [],
  } = {}) {
    const safeMailboxIds = asArray(mailboxIds).map((item) => normalizeMailboxId(item)).filter(Boolean);
    const mailboxIdSet = safeMailboxIds.length > 0 ? new Set(safeMailboxIds) : null;
    const uniqueRows = new Map();

    [...asArray(legacyConversationWorklist), ...asArray(legacyNeedsReplyToday)].forEach((row) => {
      const safeRow = asObject(row);
      const key = buildLegacyConversationKey(safeRow);
      if (!key || uniqueRows.has(key)) return;
      const mailboxId = normalizeMailboxId(
        safeRow.mailboxId || safeRow.mailboxAddress || safeRow.userPrincipalName
      );
      if (mailboxIdSet && !mailboxIdSet.has(mailboxId)) return;
      uniqueRows.set(key, {
        conversationKey: key,
        conversationId: normalizeText(safeRow.conversationId) || null,
        mailboxId,
        mailboxAddress: mailboxId || null,
        subject: normalizeText(safeRow.subject) || '(utan ämne)',
        lane: deriveLegacyLane(safeRow),
        hasUnreadInbound: safeRow.hasUnreadInbound === true,
        ownershipMailbox: mailboxId || null,
        placementIndex: uniqueRows.size,
        lastInboundAt: toIso(safeRow.lastInboundAt),
        lastOutboundAt: toIso(safeRow.lastOutboundAt),
        latestMessageAt: toIso(safeRow.lastInboundAt || safeRow.lastOutboundAt),
        workflowLane: normalizeText(safeRow.workflowLane).toLowerCase() || null,
        waitingOn: normalizeText(safeRow.waitingOn).toLowerCase() || null,
        bookingState: normalizeText(safeRow.bookingState).toLowerCase() || null,
        priorityLevel: normalizeText(safeRow.priorityLevel).toLowerCase() || null,
        intent: normalizeText(safeRow.intent).toLowerCase() || null,
        followUpSuggestedAt: toIso(safeRow.followUpSuggestedAt || safeRow.followUpDueAt),
        raw: safeRow,
      });
    });

    return Array.from(uniqueRows.values());
  }

  function buildShadowRows({ mailboxIds = [] } = {}) {
    return worklistReadModel.listWorklistRows({
      mailboxIds,
      includeOutOfScopeDraftReview: true,
    });
  }

function classifyLegacyOnly(legacyRow = {}) {
  const lane = normalizeLane(legacyRow.lane);
  const legacyIntent = normalizeText(legacyRow.intent || legacyRow.raw?.intent).toLowerCase();
  const legacyCustomerKey = normalizeText(legacyRow.raw?.customerKey).toLowerCase();
  const legacySubject = normalizeText(legacyRow.subject || legacyRow.raw?.subject).toLowerCase();
  if (
    ['later', 'bookable', 'medical', 'admin', 'unclear', 'sprint'].includes(lane) ||
    legacyRow.followUpSuggestedAt ||
    legacyRow.workflowLane === 'waiting_reply' ||
    legacyRow.workflowLane === 'booking_ready' ||
      legacyRow.workflowLane === 'medical_review' ||
      legacyRow.workflowLane === 'admin_low' ||
      legacyRow.waitingOn === 'customer'
    ) {
      return {
        classification: 'legacy_heuristic',
        detail: 'Legacy-raden drivs av heuristik eller workflow-semantik som inte finns i mailbox truth-lagret ännu.',
      };
    }
  if (
    legacyIntent === 'booking_request' &&
    (legacyCustomerKey === 'no-reply@cliento.com' ||
      legacyCustomerKey.startsWith('no-reply@') ||
      legacySubject.startsWith('ny bokning (web):') ||
      legacySubject.startsWith('avbokad (web):'))
  ) {
    return {
      classification: 'legacy_heuristic',
      detail: 'Legacy-raden drivs av en booking-overlay från extern no-reply-källa och saknar motsvarande aktiv mailbox-truth-rad i första parity-fasen.',
    };
  }
  return {
    classification: 'mapping_gap',
    detail: 'Legacy-raden saknar motsvarande aktiv truth-rad trots att den inte uppenbart bär en heuristik-only signal.',
  };
}

  function classifyShadowOnly(shadowRow = {}) {
    if (isOutOfScopeDraftReview(shadowRow)) {
      return {
        classification: 'out_of_scope_draft_review',
        detail: 'Shadow-raden är en draft-only review-tråd som ligger utanför första worklist-parity-scope.',
      };
    }
    if (shadowRow.hasUnreadInbound === true || shadowRow.needsReply === true) {
      return {
        classification: 'truth_shift',
        detail: 'Mailbox truth visar en aktiv oläst eller obesvarad tråd som inte finns i legacy-worklisten.',
      };
    }
    return {
      classification: 'mapping_gap',
      detail: 'Shadow-raden kunde materialiseras från mailbox truth men saknar tydlig motsvarighet i legacy-worklisten.',
    };
  }

  function classifyLaneDiff(legacyRow = {}, shadowRow = {}) {
    const legacyLane = normalizeLane(legacyRow.lane);
    const shadowLane = normalizeLane(shadowRow.lane);
    if (legacyLane === shadowLane) {
      return {
        classification: 'match',
        detail: 'Lane matchar mellan legacy och shadow.',
      };
    }
    if (['later', 'bookable', 'medical', 'admin', 'unclear', 'sprint'].includes(legacyLane)) {
      return {
        classification: 'legacy_heuristic',
        detail: `Legacy-lane ${legacyLane} bygger på härledd operativ heuristik som mailbox truth-shadow inte försöker emulera ännu.`,
      };
    }
    if (shadowLane === 'review' && isOutOfScopeDraftReview(shadowRow)) {
      return {
        classification: 'out_of_scope_draft_review',
        detail: 'Mailbox truth visar en draft-only review-tråd som ligger utanför första worklist-parity-scope.',
      };
    }
    if (shadowLane === 'review' && shadowRow.hasDrafts === true) {
      return {
        classification: 'truth_shift',
        detail: 'Mailbox truth visar aktivt utkast i tråden och placerar därför raden i review-shadow.',
      };
    }
    if (shadowLane === 'act-now' && shadowRow.hasUnreadInbound === true) {
      return {
        classification: 'truth_shift',
        detail: 'Mailbox truth visar oläst inkommande mail äldre än 24h och prioriterar därför raden högre.',
      };
    }
    if (legacyLane === 'act-now' && shadowLane === 'all' && shadowRow.hasUnreadInbound !== true) {
      return {
        classification: 'truth_shift',
        detail: 'Legacy-lane prioriterar högre än vad nuvarande mailbox truth visar för unread/obesvarad status.',
      };
    }
    return {
      classification: 'mapping_gap',
      detail: `Lane skiljer sig (${legacyLane} vs ${shadowLane}) utan tillräcklig heuristikmatchning ännu.`,
    };
  }

  function classifyBooleanDiff({
    label = '',
    legacyValue = false,
    shadowValue = false,
    positiveDetail = '',
    negativeDetail = '',
  } = {}) {
    if (Boolean(legacyValue) === Boolean(shadowValue)) {
      return {
        classification: 'match',
        detail: `${label} matchar mellan legacy och shadow.`,
      };
    }
    return {
      classification: 'truth_shift',
      detail: Boolean(shadowValue) ? positiveDetail : negativeDetail,
    };
  }

function classifyPlacementDiff(legacyRow = {}, shadowRow = {}, otherDiffs = []) {
    if (toNumber(legacyRow.placementIndex, -1) === toNumber(shadowRow.placementIndex, -1)) {
      return {
        classification: 'match',
        detail: 'Placering matchar mellan legacy och shadow.',
      };
    }
    if (
      asArray(otherDiffs).every((item) =>
        ['match', 'legacy_heuristic', 'truth_shift', 'out_of_scope_draft_review'].includes(item)
      )
    ) {
      return {
        classification: asArray(otherDiffs).includes('out_of_scope_draft_review')
          ? 'out_of_scope_draft_review'
          : 'legacy_heuristic',
        detail: asArray(otherDiffs).includes('out_of_scope_draft_review')
          ? 'Placering skiljer sig bara därför att draft-only review-trådar ligger utanför första parity-scope.'
          : 'Placering skiljer sig, men diffen följer lane-/prioriteringsheuristik snarare än ett sanningsbrott i mailbox truth.',
      };
    }
    return {
      classification: 'mapping_gap',
      detail: 'Placering skiljer sig och kan ännu inte förklaras helt av de andra diff-signalerna.',
    };
}

function hasSafeCustomerIdentity(identity = {}) {
  const safeIdentity = asObject(identity);
  return Boolean(
    normalizeText(safeIdentity.canonicalCustomerId) ||
      normalizeText(safeIdentity.canonicalContactId) ||
      normalizeText(safeIdentity.explicitMergeGroupId)
  );
}

function countSafeIdentityRows(rows = []) {
  return asArray(rows).filter((row) => hasSafeCustomerIdentity(asObject(row).customerIdentity)).length;
}

  function buildDiffReport({
    legacyConversationWorklist = [],
    legacyNeedsReplyToday = [],
    mailboxIds = [],
    limit = 250,
  } = {}) {
    const legacyRows = buildLegacyRows({
      legacyConversationWorklist,
      legacyNeedsReplyToday,
      mailboxIds,
    });
    const shadowRows = buildShadowRows({ mailboxIds });
    const legacyMap = new Map(legacyRows.map((row) => [row.conversationKey, row]));
    const shadowMap = new Map(shadowRows.map((row) => [row.conversationKey, row]));
    const allKeys = Array.from(new Set([...legacyMap.keys(), ...shadowMap.keys()])).sort();

    const conversationDiffs = allKeys.map((conversationKey) => {
      const legacyRow = legacyMap.get(conversationKey) || null;
      const shadowRow = shadowMap.get(conversationKey) || null;
      const presence = legacyRow && shadowRow ? 'both' : legacyRow ? 'legacy_only' : 'shadow_only';
      if (!legacyRow && shadowRow) {
        const presenceClassification = classifyShadowOnly(shadowRow);
        return {
          conversationKey,
          conversationId: shadowRow.conversationId || shadowRow.mailboxConversationId || null,
          mailboxId: shadowRow.mailboxId || null,
          subject: shadowRow.subject || '(utan ämne)',
          presence,
          legacy: null,
          shadow: shadowRow,
          diffs: {
            lane: { differs: true, classification: presenceClassification.classification, detail: presenceClassification.detail },
            placement: { differs: true, classification: presenceClassification.classification, detail: presenceClassification.detail },
            ownership: { differs: false, classification: 'match', detail: 'Ingen legacy-rad att jämföra ownership mot.' },
            unread: { differs: false, classification: 'match', detail: 'Ingen legacy-rad att jämföra unread mot.' },
          },
          classification: presenceClassification.classification,
          explained: !['unknown', 'bug'].includes(presenceClassification.classification),
        };
      }
      if (legacyRow && !shadowRow) {
        const presenceClassification = classifyLegacyOnly(legacyRow);
        return {
          conversationKey,
          conversationId: legacyRow.conversationId || null,
          mailboxId: legacyRow.mailboxId || null,
          subject: legacyRow.subject || '(utan ämne)',
          presence,
          legacy: legacyRow,
          shadow: null,
          diffs: {
            lane: { differs: true, classification: presenceClassification.classification, detail: presenceClassification.detail },
            placement: { differs: true, classification: presenceClassification.classification, detail: presenceClassification.detail },
            ownership: { differs: false, classification: 'match', detail: 'Ingen shadow-rad att jämföra ownership mot.' },
            unread: { differs: false, classification: 'match', detail: 'Ingen shadow-rad att jämföra unread mot.' },
          },
          classification: presenceClassification.classification,
          explained: !['unknown', 'bug'].includes(presenceClassification.classification),
        };
      }

      const lane = classifyLaneDiff(legacyRow, shadowRow);
      const ownership = classifyBooleanDiff({
        label: 'Ownership',
        legacyValue: normalizeMailboxId(legacyRow.ownershipMailbox) === normalizeMailboxId(shadowRow.ownershipMailbox),
        shadowValue: true,
        positiveDetail: '',
        negativeDetail: '',
      });
      const ownershipDiff =
        normalizeMailboxId(legacyRow.ownershipMailbox) !== normalizeMailboxId(shadowRow.ownershipMailbox)
          ? {
              classification: 'truth_shift',
              detail: `Mailbox truth pekar på ${shadowRow.ownershipMailbox || 'okänd'} medan legacy ligger på ${legacyRow.ownershipMailbox || 'okänd'}.`,
            }
          : ownership;
      const unread = classifyBooleanDiff({
        label: 'Unread',
        legacyValue: legacyRow.hasUnreadInbound === true,
        shadowValue: shadowRow.hasUnreadInbound === true,
        positiveDetail: 'Mailbox truth visar oläst inkommande mail som legacy inte markerar som unread.',
        negativeDetail: 'Legacy markerar unread men mailbox truth gör det inte längre.',
      });
      const placement = classifyPlacementDiff(legacyRow, shadowRow, [
        lane.classification,
        ownershipDiff.classification,
        unread.classification,
      ]);
      const classifications = [
        lane.classification,
        ownershipDiff.classification,
        unread.classification,
        placement.classification,
      ].filter((item) => item !== 'match');

      return {
        conversationKey,
        conversationId: legacyRow.conversationId || shadowRow.conversationId || shadowRow.mailboxConversationId || null,
        mailboxId: legacyRow.mailboxId || shadowRow.mailboxId || null,
        subject: legacyRow.subject || shadowRow.subject || '(utan ämne)',
        presence,
        legacy: legacyRow,
        shadow: shadowRow,
        diffs: {
          lane: {
            differs: legacyRow.lane !== shadowRow.lane,
            classification: lane.classification,
            detail: lane.detail,
          },
          placement: {
            differs: toNumber(legacyRow.placementIndex, -1) !== toNumber(shadowRow.placementIndex, -1),
            classification: placement.classification,
            detail: placement.detail,
          },
          ownership: {
            differs:
              normalizeMailboxId(legacyRow.ownershipMailbox) !==
              normalizeMailboxId(shadowRow.ownershipMailbox),
            classification: ownershipDiff.classification,
            detail: ownershipDiff.detail,
          },
          unread: {
            differs: Boolean(legacyRow.hasUnreadInbound) !== Boolean(shadowRow.hasUnreadInbound),
            classification: unread.classification,
            detail: unread.detail,
          },
        },
        classification: pickPrimaryClassification(classifications),
        explained: classifications.every((item) => !['unknown', 'bug'].includes(item)),
      };
    });

    const aggregate = {
      legacyCount: legacyRows.length,
      shadowCount: shadowRows.length,
      legacyIdentityCount: countSafeIdentityRows(legacyRows),
      shadowIdentityCount: countSafeIdentityRows(shadowRows),
      bothCount: conversationDiffs.filter((item) => item.presence === 'both').length,
      legacyOnlyCount: conversationDiffs.filter((item) => item.presence === 'legacy_only').length,
      shadowOnlyCount: conversationDiffs.filter((item) => item.presence === 'shadow_only').length,
      laneDiffCount: conversationDiffs.filter((item) => item.diffs.lane.differs).length,
      placementDiffCount: conversationDiffs.filter((item) => item.diffs.placement.differs).length,
      ownershipDiffCount: conversationDiffs.filter((item) => item.diffs.ownership.differs).length,
      unreadDiffCount: conversationDiffs.filter((item) => item.diffs.unread.differs).length,
      legacyLaneCounts: countBy(legacyRows, (item) => item.lane || 'all'),
      shadowLaneCounts: countBy(shadowRows, (item) => item.lane || 'all'),
      legacyOwnershipCounts: countBy(legacyRows, (item) => item.ownershipMailbox || 'okänd'),
      shadowOwnershipCounts: countBy(shadowRows, (item) => item.ownershipMailbox || 'okänd'),
      legacyUnreadCount: legacyRows.filter((item) => item.hasUnreadInbound === true).length,
      shadowUnreadCount: shadowRows.filter((item) => item.hasUnreadInbound === true).length,
      legacyIdentityCoverage:
        legacyRows.length > 0
          ? Math.round((countSafeIdentityRows(legacyRows) / legacyRows.length) * 1000) / 10
          : 0,
      shadowIdentityCoverage:
        shadowRows.length > 0
          ? Math.round((countSafeIdentityRows(shadowRows) / shadowRows.length) * 1000) / 10
          : 0,
      classificationCounts: countBy(conversationDiffs, (item) => item.classification || 'match'),
      unexplainedCount: conversationDiffs.filter((item) => item.explained !== true).length,
    };

    const mailboxAssessment = Array.from(
      new Set([
        ...asArray(mailboxIds).map((item) => normalizeMailboxId(item)),
        ...legacyRows.map((item) => normalizeMailboxId(item.mailboxId)),
        ...shadowRows.map((item) => normalizeMailboxId(item.mailboxId)),
        ...conversationDiffs.map((item) => normalizeMailboxId(item.mailboxId)),
      ].filter(Boolean))
    )
      .map((mailboxId) => {
        const mailboxConversationDiffs = conversationDiffs.filter(
          (item) => normalizeMailboxId(item.mailboxId) === mailboxId
        );
        const legacyCount = legacyRows.filter(
          (item) => normalizeMailboxId(item.mailboxId) === mailboxId
        ).length;
        const shadowCount = shadowRows.filter(
          (item) => normalizeMailboxId(item.mailboxId) === mailboxId
        ).length;
        return {
          mailboxId,
          legacyCount,
          shadowCount,
          bothCount: mailboxConversationDiffs.filter((item) => item.presence === 'both').length,
          legacyOnlyCount: mailboxConversationDiffs.filter((item) => item.presence === 'legacy_only').length,
          shadowOnlyCount: mailboxConversationDiffs.filter((item) => item.presence === 'shadow_only').length,
          unreadDiffCount: mailboxConversationDiffs.filter((item) => item.diffs.unread.differs).length,
          ownershipDiffCount: mailboxConversationDiffs.filter((item) => item.diffs.ownership.differs).length,
          laneDiffCount: mailboxConversationDiffs.filter((item) => item.diffs.lane.differs).length,
          classificationCounts: countBy(mailboxConversationDiffs, (item) => item.classification || 'match'),
          comparable: legacyCount > 0 && shadowCount > 0,
          parityStatus:
            legacyCount <= 0
              ? 'not_comparable_no_legacy_baseline'
              : shadowCount <= 0
                ? 'not_comparable_no_truth_rows'
                : 'comparable',
        };
      })
      .sort((left, right) => String(left.mailboxId).localeCompare(String(right.mailboxId)));

    const dimensionAssessment = {
      lane: {
        total: aggregate.laneDiffCount,
        explained: conversationDiffs.filter((item) => item.diffs.lane.differs && !['unknown', 'bug'].includes(item.diffs.lane.classification)).length,
        unexplained: conversationDiffs.filter((item) => item.diffs.lane.differs && ['unknown', 'bug'].includes(item.diffs.lane.classification)).length,
      },
      ownership: {
        total: aggregate.ownershipDiffCount,
        explained: conversationDiffs.filter((item) => item.diffs.ownership.differs && !['unknown', 'bug'].includes(item.diffs.ownership.classification)).length,
        unexplained: conversationDiffs.filter((item) => item.diffs.ownership.differs && ['unknown', 'bug'].includes(item.diffs.ownership.classification)).length,
      },
      unread: {
        total: aggregate.unreadDiffCount,
        explained: conversationDiffs.filter((item) => item.diffs.unread.differs && !['unknown', 'bug'].includes(item.diffs.unread.classification)).length,
        unexplained: conversationDiffs.filter((item) => item.diffs.unread.differs && ['unknown', 'bug'].includes(item.diffs.unread.classification)).length,
      },
    };

    const acceptanceGate = {
      canConsiderCutover:
        aggregate.legacyCount > 0 &&
        aggregate.shadowCount > 0 &&
        dimensionAssessment.lane.unexplained === 0 &&
        dimensionAssessment.ownership.unexplained === 0 &&
        dimensionAssessment.unread.unexplained === 0 &&
        aggregate.unexplainedCount === 0 &&
        Number(aggregate.classificationCounts.mapping_gap || 0) === 0 &&
        Number(aggregate.classificationCounts.bug || 0) === 0 &&
        Number(aggregate.classificationCounts.unknown || 0) === 0,
      blockers: [
        aggregate.legacyCount === 0 ? 'no_legacy_rows' : null,
        aggregate.shadowCount === 0 ? 'no_shadow_rows' : null,
        dimensionAssessment.lane.unexplained > 0 ? 'lane_unexplained' : null,
        dimensionAssessment.ownership.unexplained > 0 ? 'ownership_unexplained' : null,
        dimensionAssessment.unread.unexplained > 0 ? 'unread_unexplained' : null,
        Number(aggregate.classificationCounts.mapping_gap || 0) > 0 ? 'mapping_gap_present' : null,
        Number(aggregate.classificationCounts.bug || 0) > 0 ? 'bug_diff_present' : null,
        Number(aggregate.classificationCounts.unknown || 0) > 0 ? 'unknown_diff_present' : null,
      ].filter(Boolean),
    };

    return {
      generatedAt: new Date().toISOString(),
      mailboxIds: asArray(mailboxIds).map((item) => normalizeMailboxId(item)).filter(Boolean),
      aggregate,
      mailboxAssessment,
      dimensionAssessment,
      acceptanceGate,
      conversationDiffs: conversationDiffs.slice(0, Math.max(1, Math.min(1000, Number(limit) || 250))),
      metadata: {
        comparisonKey: 'canonicalMailboxConversationKey',
        legacySource: 'conversationWorklist+needsReplyToday',
        shadowSource: 'mailbox truth worklist read-model',
        parityScope: {
          draftOnlyReview: 'out_of_scope',
        },
      },
    };
  }

  return {
    buildLegacyRows,
    buildShadowRows,
    buildDiffReport,
  };
}

module.exports = {
  createCcoMailboxTruthWorklistShadow,
};
