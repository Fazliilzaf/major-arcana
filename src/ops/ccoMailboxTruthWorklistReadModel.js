const {
  extractEmail,
  humanizeCounterpartyEmail,
  resolveCounterpartyDisplayName,
  resolveCounterpartyIdentity,
} = require('./ccoCounterpartyTruth');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneJson(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function normalizeIdentityCarrier(value = {}) {
  const safeValue = asObject(value);
  const customerIdentity = asObject(safeValue.customerIdentity || safeValue.identity);
  const hardConflictSignals = asArray(safeValue.hardConflictSignals).filter(
    (item) => item !== null && item !== undefined
  );
  const mergeReviewDecisionsByPairId = asObject(safeValue.mergeReviewDecisionsByPairId);
  const identityProvenance = asObject(safeValue.identityProvenance || safeValue.provenance);

  return {
    customerIdentity: Object.keys(customerIdentity).length ? cloneJson(customerIdentity) : null,
    hardConflictSignals: hardConflictSignals.length ? cloneJson(hardConflictSignals) : [],
    mergeReviewDecisionsByPairId: Object.keys(mergeReviewDecisionsByPairId).length
      ? cloneJson(mergeReviewDecisionsByPairId)
      : {},
    identityProvenance: Object.keys(identityProvenance).length ? cloneJson(identityProvenance) : null,
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

function normalizeLookupKey(value = '') {
  return normalizeText(value).toLowerCase();
}

function buildCustomerIdentityLookup(customerState = null) {
  const safeState = asObject(customerState);
  const identityByKey = asObject(safeState.identityByKey);
  const primaryEmailByKey = asObject(safeState.primaryEmailByKey);
  const detailsByKey = asObject(safeState.details);
  const safeIdentityByKey = new Map();
  const emailToKey = new Map();
  const ambiguousEmailKeys = new Set();

  const registerEmail = (email, customerKey) => {
    const normalizedEmail = normalizeLookupKey(email);
    const normalizedKey = normalizeLookupKey(customerKey);
    if (!normalizedEmail || !normalizedKey) return;
    if (ambiguousEmailKeys.has(normalizedEmail)) return;
    const existing = emailToKey.get(normalizedEmail);
    if (existing && existing !== normalizedKey) {
      ambiguousEmailKeys.add(normalizedEmail);
      emailToKey.delete(normalizedEmail);
      return;
    }
    if (!existing) {
      emailToKey.set(normalizedEmail, normalizedKey);
    }
  };

  for (const [customerKey, value] of Object.entries(identityByKey)) {
    const normalizedKey = normalizeLookupKey(customerKey);
    const rawValue = asObject(value);
    const carrier = normalizeIdentityCarrier({
      customerIdentity: rawValue.customerIdentity || rawValue.identity || rawValue,
      hardConflictSignals: rawValue.hardConflictSignals,
      mergeReviewDecisionsByPairId: rawValue.mergeReviewDecisionsByPairId,
      identityProvenance: rawValue.identityProvenance || rawValue.provenance,
    });
    if (normalizedKey && hasSafeCustomerIdentity(carrier.customerIdentity)) {
      safeIdentityByKey.set(normalizedKey, carrier);
    }
    const detailEntry = asObject(detailsByKey[customerKey]);
    const emails = new Set([
      normalizeText(primaryEmailByKey[customerKey]),
      normalizeText(carrier.customerIdentity?.customerEmail),
      ...asArray(detailEntry.emails).map((email) => normalizeText(email)),
    ]);
    for (const email of emails) {
      registerEmail(email, normalizedKey);
    }
  }

  function resolveCarrier(row = {}) {
    const safeRow = asObject(row);
    const rowCarrier = normalizeIdentityCarrier(safeRow);
    if (hasSafeCustomerIdentity(rowCarrier.customerIdentity)) {
      return rowCarrier;
    }

    const candidateKeys = [
      safeRow.customerKey,
      safeRow.customerIdentity?.customerKey,
      safeRow.customer?.identity?.customerKey,
      safeRow.customer?.customerKey,
    ]
      .map(normalizeLookupKey)
      .filter(Boolean);

    for (const candidateKey of candidateKeys) {
      const carrier = safeIdentityByKey.get(candidateKey);
      if (carrier) return carrier;
    }

    const emailCandidates = [
      safeRow.customerEmail,
      safeRow.customer?.email,
      safeRow.email,
      safeRow.customerIdentity?.customerEmail,
    ]
      .map(normalizeLookupKey)
      .filter(Boolean);

    for (const email of emailCandidates) {
      if (ambiguousEmailKeys.has(email)) continue;
      const candidateKey = emailToKey.get(email);
      if (!candidateKey) continue;
      const carrier = safeIdentityByKey.get(candidateKey);
      if (carrier) return carrier;
    }

    return null;
  }

  function countIdentityRows(rows = []) {
    return asArray(rows).filter((row) => hasSafeCustomerIdentity(resolveCarrier(row)?.customerIdentity))
      .length;
  }

  return {
    resolveCarrier,
    countIdentityRows,
  };
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Gregorian YYYY-MM-DD + 1 day (for calendar math independent of machine local TZ). */
function addOneCalendarDayYmd(ymd) {
  const raw = normalizeText(ymd || '');
  const parts = raw.split('-').map((p) => parseInt(String(p).trim(), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return '';
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Maps an instant to whether its calendar date in `timezone` is today or tomorrow (in that zone).
 * @returns {'today'|'tomorrow'|null}
 */
function getCalendarDayBucket(isoString, timezone = 'Europe/Stockholm') {
  const raw = normalizeText(isoString || '');
  if (!raw) return null;
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  const safeTz = normalizeText(timezone) || 'Europe/Stockholm';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const targetYmd = fmt.format(instant);
  const todayYmd = fmt.format(new Date());
  const tomorrowYmd = addOneCalendarDayYmd(todayYmd);
  if (targetYmd === todayYmd) return 'today';
  if (tomorrowYmd && targetYmd === tomorrowYmd) return 'tomorrow';
  return null;
}

function buildConsumerDueBucket(row = {}) {
  const tz = 'Europe/Stockholm';
  const buckets = [];
  if (getCalendarDayBucket(row.lastInboundAt, tz) === 'today') {
    buckets.push('today');
  }
  const followUpIso = normalizeText(row.operatorState?.followUpDueAt || '');
  if (followUpIso && getCalendarDayBucket(followUpIso, tz) === 'tomorrow') {
    buckets.push('tomorrow');
  }
  return buckets;
}

function normalizeMailboxId(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeDirection(value = '', folderType = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['inbound', 'outbound', 'draft'].includes(normalized)) return normalized;
  const safeFolderType = normalizeText(folderType).toLowerCase();
  if (safeFolderType === 'inbox') return 'inbound';
  if (safeFolderType === 'sent') return 'outbound';
  if (safeFolderType === 'drafts') return 'draft';
  return 'unknown';
}

function normalizeLane(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'act_now' || normalized === 'act now' || normalized === 'action_now') {
    return 'act-now';
  }
  if (normalized === 'review') return 'review';
  if (normalized === 'later') return 'later';
  if (normalized === 'all') return 'all';
  return normalized;
}

function toCanonicalMailboxConversationKey({
  mailboxId = '',
  conversationId = '',
  mailboxConversationId = '',
  messageId = '',
} = {}) {
  const safeMailboxId = normalizeMailboxId(mailboxId);
  const safeConversationId = normalizeText(conversationId);
  const safeMailboxConversationId = normalizeText(mailboxConversationId);
  const safeMessageId = normalizeText(messageId);

  const normalizeScopedValue = (value = '') => {
    const raw = normalizeText(value);
    if (!raw) return '';
    const separatorIndex = raw.indexOf(':');
    if (separatorIndex > 0) {
      const prefix = normalizeMailboxId(raw.slice(0, separatorIndex));
      const suffix = raw.slice(separatorIndex + 1);
      if (prefix && suffix) return `${prefix}:${suffix}`;
    }
    if (safeMailboxId) return `${safeMailboxId}:${raw}`;
    return raw;
  };

  if (safeMailboxConversationId) return normalizeScopedValue(safeMailboxConversationId);
  if (safeConversationId) return normalizeScopedValue(safeConversationId);
  if (safeMailboxId && safeMessageId) return `${safeMailboxId}:graph:${safeMessageId}`;
  return '';
}

function deriveLatestSortIso(message = {}) {
  return (
    toIso(message.lastModifiedAt) ||
    toIso(message.receivedAt) ||
    toIso(message.sentAt) ||
    toIso(message.createdAt) ||
    null
  );
}

function buildMailboxIdentityEmailSet(message = {}, mailboxId = '') {
  const safeMessage = asObject(message);
  return new Set(
    [
      mailboxId,
      safeMessage.mailboxId,
      safeMessage.mailboxAddress,
      safeMessage.userPrincipalName,
    ]
      .map((item) => extractEmail(item))
      .filter(Boolean)
  );
}

/**
 * For Sent/outbound, prefer a recipient that is not the clinic mailbox (Graph may thread
 * outbound separately; replyTo is not always the customer, so To/Cc come first).
 */
function resolveOutboundCounterpartyForWorklist(message = {}, mailboxId = '') {
  const safeMessage = asObject(message);
  const identitySet = buildMailboxIdentityEmailSet(safeMessage, mailboxId);
  const orderedRecipientFields = [
    ...asArray(safeMessage.toRecipients),
    ...asArray(safeMessage.ccRecipients),
    ...asArray(safeMessage.replyToRecipients),
    ...asArray(safeMessage.bccRecipients),
  ];
  for (const item of orderedRecipientFields) {
    const obj = asObject(item);
    const email = extractEmail(obj.address || item);
    if (!email || identitySet.has(email)) continue;
    const rawName = normalizeText(obj.name);
    const displayName = resolveCounterpartyDisplayName(rawName, email);
    return {
      email,
      name: displayName,
      rawName: rawName || null,
      fallbackLabel: displayName || email,
    };
  }
  for (const raw of asArray(safeMessage.recipients)) {
    const email = extractEmail(typeof raw === 'string' ? raw : asObject(raw).address || raw);
    if (!email || identitySet.has(email)) continue;
    const displayName = humanizeCounterpartyEmail(email);
    return {
      email,
      name: displayName || email,
      rawName: null,
      fallbackLabel: displayName || email,
    };
  }
  return null;
}

function deriveCounterparty(message = {}, mailboxId = '') {
  const safeMessage = asObject(message);
  const direction = normalizeDirection(safeMessage.direction, safeMessage.folderType);
  const folderType = normalizeText(safeMessage.folderType).toLowerCase();
  if (direction === 'outbound' || folderType === 'sent') {
    const outbound = resolveOutboundCounterpartyForWorklist(safeMessage, mailboxId);
    if (outbound) {
      return {
        email: outbound.email,
        name: outbound.name,
        rawName: outbound.rawName,
        fallbackLabel: outbound.fallbackLabel,
      };
    }
  }
  const counterparty = resolveCounterpartyIdentity(safeMessage, {
    mailboxId,
    direction,
  });
  return {
    email: counterparty.email || null,
    name: counterparty.displayName || null,
    rawName: counterparty.rawName || null,
    fallbackLabel: counterparty.fallbackLabel || null,
  };
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

function countSafeIdentityRows(rows = []) {
  return asArray(rows).filter((row) => hasSafeCustomerIdentity(asObject(row).customerIdentity)).length;
}

function isOutOfScopeDraftReview(row = {}) {
  const safeRow = asObject(row);
  return (
    safeRow.hasDrafts === true &&
    safeRow.hasUnreadInbound !== true &&
    safeRow.needsReply !== true
  );
}

function getWorklistMergeIdentityKey(row = {}) {
  const carrier = normalizeIdentityCarrier(row);
  const identity = asObject(carrier.customerIdentity);
  const candidates = [
    {
      type: 'canonicalCustomerId',
      value: normalizeText(identity.canonicalCustomerId),
    },
    {
      type: 'canonicalContactId',
      value: normalizeText(identity.canonicalContactId),
    },
    {
      type: 'explicitMergeGroupId',
      value: normalizeText(identity.explicitMergeGroupId),
    },
  ].filter((candidate) => candidate.value);
  const chosen = candidates[0] || null;
  if (chosen) {
    return {
      key: `${chosen.type}:${chosen.value}`,
      type: chosen.type,
      value: chosen.value,
    };
  }
  const emailFallback =
    extractEmail(row.customerEmail) ||
    extractEmail(row.customer?.email) ||
    extractEmail(identity.customerEmail);
  if (emailFallback) {
    const mailboxScope = normalizeMailboxId(row.ownershipMailbox || row.mailboxId || '');
    return {
      key: mailboxScope ? `customerEmail:${emailFallback}:${mailboxScope}` : `customerEmail:${emailFallback}`,
      type: 'customerEmail',
      value: emailFallback,
    };
  }
  return null;
}

function hasWorklistHardMergeConflict(left = {}, right = {}) {
  const leftIdentity = asObject(normalizeIdentityCarrier(left).customerIdentity);
  const rightIdentity = asObject(normalizeIdentityCarrier(right).customerIdentity);
  const fieldPairs = [
    ['canonicalCustomerId', true],
    ['canonicalContactId', true],
    ['explicitMergeGroupId', true],
    ['verifiedPersonalEmailNormalized', true],
    ['verifiedPhoneE164', true],
  ];
  for (const [field] of fieldPairs) {
    const leftValue = normalizeText(leftIdentity[field]);
    const rightValue = normalizeText(rightIdentity[field]);
    if (leftValue && rightValue && leftValue !== rightValue) {
      return true;
    }
  }
  return false;
}

function rankWorklistLane(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'act-now') return 4;
  if (normalized === 'review') return 3;
  if (normalized === 'all') return 2;
  if (normalized === 'later') return 1;
  return 0;
}

function compareWorklistRollupRows(left = {}, right = {}) {
  const leftUnread = left?.state?.hasUnreadInbound === true ? 1 : 0;
  const rightUnread = right?.state?.hasUnreadInbound === true ? 1 : 0;
  const leftNeedsReply = left?.state?.needsReply === true ? 1 : 0;
  const rightNeedsReply = right?.state?.needsReply === true ? 1 : 0;
  const leftLane = rankWorklistLane(left?.lane || '');
  const rightLane = rankWorklistLane(right?.lane || '');
  const leftLatest = Date.parse(normalizeText(left?.timing?.latestMessageAt || ''));
  const rightLatest = Date.parse(normalizeText(right?.timing?.latestMessageAt || ''));
  if (rightUnread !== leftUnread) return rightUnread - leftUnread;
  if (rightNeedsReply !== leftNeedsReply) return rightNeedsReply - leftNeedsReply;
  if (rightLane !== leftLane) return rightLane - leftLane;
  if (Number.isFinite(rightLatest) && Number.isFinite(leftLatest) && rightLatest !== leftLatest) {
    return rightLatest - leftLatest;
  }
  if (Number.isFinite(rightLatest) && !Number.isFinite(leftLatest)) return 1;
  if (!Number.isFinite(rightLatest) && Number.isFinite(leftLatest)) return -1;
  return normalizeText(left?.conversationKey || left?.id || '').localeCompare(
    normalizeText(right?.conversationKey || right?.id || ''),
    'sv'
  );
}

function buildQueueInlineContext(row = {}) {
  const rollup = asObject(row.rollup);
  if (rollup.enabled === true && Number(rollup.mailboxCount || 0) > 1) {
    return 'Samma kund har skrivit från flera mailboxar';
  }
  if (normalizeActionState(row?.operatorState?.actionState) === 'reply_later') {
    return 'Vantar pa uppfoljning enligt operatorsplan';
  }
  if (row?.needsReply === true) {
    return 'Behover svar i aktiv dialog';
  }
  return '';
}

function buildQueueExplanatoryLine(row = {}) {
  const rollup = asObject(row.rollup);
  if (rollup.enabled === true && Number(rollup.mailboxCount || 0) > 1) {
    return 'Historiken halls ihop, men varje meddelande visar sin mailboxproveniens.';
  }
  if (normalizeActionState(row?.operatorState?.actionState) === 'reply_later') {
    return 'Traden ligger i reply-later och visar nasta planerade uppfoljningssteg.';
  }
  if (row?.needsReply === true) {
    return 'Senaste inkommande meddelande vantar pa operativ uppfoljning.';
  }
  return '';
}

function getWorklistMailboxScopeKey(row = {}) {
  return normalizeMailboxId(
    row?.ownershipMailbox ||
      row?.mailbox?.ownershipMailbox ||
      row?.mailbox?.mailboxId ||
      row?.mailboxId ||
      row?.mailbox?.mailboxAddress ||
      row?.mailboxAddress ||
      row?.mailbox?.userPrincipalName ||
      row?.userPrincipalName
  );
}

function buildWorklistRollupRow(rows = []) {
  const safeRows = asArray(rows).filter((row) => row && typeof row === 'object');
  const primaryRow = [...safeRows].sort(compareWorklistRollupRows)[0] || null;
  if (!primaryRow) return null;
  const uniqueMailboxIds = Array.from(
    new Set(
      safeRows
        .map((row) =>
          normalizeMailboxId(
            row?.mailbox?.mailboxId ||
              row?.mailboxId ||
              row?.mailbox?.mailboxAddress ||
              row?.mailboxAddress ||
              row?.mailbox?.userPrincipalName ||
              row?.userPrincipalName
          )
        )
        .filter(Boolean)
    )
  );
  const uniqueMailboxLabels = Array.from(
    new Set(
      safeRows
        .map((row) =>
          normalizeText(
            row?.mailbox?.mailboxAddress ||
              row?.mailboxAddress ||
              row?.mailbox?.mailboxId ||
              row?.mailboxId ||
              row?.mailbox?.userPrincipalName ||
              row?.userPrincipalName
          )
        )
        .filter(Boolean)
    )
  );
  const uniqueConversationIds = Array.from(
    new Set(
      safeRows
        .map((row) =>
          normalizeText(row?.conversation?.conversationId || row?.conversationId || row?.conversation?.key || row?.id)
        )
        .filter(Boolean)
    )
  );
  const uniqueConversationKeys = Array.from(
    new Set(
      safeRows
        .map((row) => normalizeText(row?.conversationKey || row?.id))
        .filter(Boolean)
    )
  );
  const rollupIdentity = getWorklistMergeIdentityKey(primaryRow) || {
    key: normalizeText(primaryRow?.conversationKey || primaryRow?.id || ''),
    type: 'conversationKey',
    value: normalizeText(primaryRow?.conversationKey || primaryRow?.id || ''),
  };
  const customerIdentity = normalizeIdentityCarrier(primaryRow).customerIdentity;
  const mergedCount = safeRows.length;
  const effectiveConversationKey =
    mergedCount > 1
      ? rollupIdentity.key
      : normalizeText(primaryRow?.conversationKey || primaryRow?.id || '') || rollupIdentity.key;
  const hasUnreadInbound = safeRows.some((row) => row?.hasUnreadInbound === true);
  const needsReply = safeRows.some((row) => row?.needsReply === true);
  const unreadCount = safeRows.filter((row) => row?.hasUnreadInbound === true).length;
  const needsReplyCount = safeRows.filter((row) => row?.needsReply === true).length;
  const inboxCount = safeRows.filter((row) => row?.folderPresence?.inbox === true).length;
  const sentCount = safeRows.filter((row) => row?.folderPresence?.sent === true).length;
  const draftsCount = safeRows.filter((row) => row?.folderPresence?.drafts === true).length;
  const deletedCount = safeRows.filter((row) => row?.folderPresence?.deleted === true).length;
  const maxHoursSinceInbound = safeRows.reduce(
    (max, row) => Math.max(max, Number(row?.timing?.hoursSinceInbound || 0)),
    0
  );
  const latestMessageAt = safeRows
    .map((row) => normalizeText(row?.timing?.latestMessageAt || ''))
    .sort((left, right) => right.localeCompare(left))[0] || null;
  const lastInboundAt = safeRows
    .map((row) => normalizeText(row?.timing?.lastInboundAt || ''))
    .sort((left, right) => right.localeCompare(left))[0] || null;
  const lastOutboundAt = safeRows
    .map((row) => normalizeText(row?.timing?.lastOutboundAt || ''))
    .sort((left, right) => right.localeCompare(left))[0] || null;
  const lane = safeRows.some((row) => normalizeLane(row?.lane) === 'act-now')
    ? 'act-now'
    : safeRows.some((row) => normalizeLane(row?.lane) === 'review')
      ? 'review'
      : safeRows.some((row) => normalizeLane(row?.lane) === 'later')
        ? 'later'
        : 'all';
  const subject = normalizeText(primaryRow?.subject) || '(utan ämne)';
  const preview = normalizeText(primaryRow?.latestPreview || '');
  // FIX4: utökad fallback-kedja för customerName så vi inte faller till
  // "Okänd avsändare" när Graph har namnet i ett annat fält
  const customerName =
    normalizeText(primaryRow?.customerName) ||
    normalizeText(primaryRow?.fromName) ||
    normalizeText(primaryRow?.senderName) ||
    normalizeText(primaryRow?.from?.name) ||
    normalizeText(primaryRow?.from?.emailAddress?.name) ||
    normalizeText(primaryRow?.sender?.name) ||
    normalizeText(primaryRow?.sender?.emailAddress?.name) ||
    normalizeText(primaryRow?.counterpartyLabel) ||
    normalizeText(primaryRow?.identity?.customerName) ||
    '';
  const customerEmail =
    normalizeText(primaryRow?.customerEmail) ||
    normalizeText(primaryRow?.senderEmail) ||
    normalizeText(primaryRow?.fromEmail) ||
    normalizeText(primaryRow?.from?.address) ||
    normalizeText(primaryRow?.from?.emailAddress?.address) ||
    '';
  // Sista fallback: humanize email-delen (john.doe@x → "John Doe"), annars användarnamn
  const customerNameWithFallback =
    customerName ||
    (customerEmail ? humanizeCounterpartyEmail(customerEmail) || customerEmail.split('@')[0] : '');
  const provenanceDetail = uniqueMailboxLabels.join(' · ');
  const provenanceLabel = uniqueMailboxLabels.length > 1 ? `${uniqueMailboxLabels.length} mailboxar` : '';
  return {
    ...primaryRow,
    conversationKey: effectiveConversationKey,
    conversationId: primaryRow?.conversationId || uniqueConversationIds[0] || null,
    mailboxConversationId: primaryRow?.mailboxConversationId || uniqueConversationIds[0] || null,
    subject,
    latestPreview: preview,
    latestMessageAt,
    lastInboundAt,
    lastOutboundAt,
    hasUnreadInbound,
    needsReply,
    hoursSinceInbound: maxHoursSinceInbound,
    lane,
    messageCount: safeRows.reduce((sum, row) => sum + Number(row?.messageCount || 0), 0),
    customerEmail: customerEmail || null,
    customerName: customerNameWithFallback || null,
    customerIdentity,
    hardConflictSignals: normalizeIdentityCarrier(primaryRow).hardConflictSignals,
    mergeReviewDecisionsByPairId: normalizeIdentityCarrier(primaryRow).mergeReviewDecisionsByPairId,
    identityProvenance: normalizeIdentityCarrier(primaryRow).identityProvenance,
    ownershipMailbox:
      uniqueMailboxIds.length === 1
        ? uniqueMailboxIds[0]
        : normalizeMailboxId(primaryRow?.ownershipMailbox || primaryRow?.mailboxId || ''),
    rollup: {
      enabled: mergedCount > 1,
      safeMerge: true,
      mergeKey: rollupIdentity.key,
      mergeKeyType: rollupIdentity.type,
      mergeKeyValue: rollupIdentity.value,
      count: mergedCount,
      mailboxCount: uniqueMailboxIds.length,
      threadCount: uniqueConversationIds.length,
      underlyingConversationKeys: uniqueConversationKeys,
      primaryConversationId: primaryRow?.conversationId || null,
      primaryMailboxId: normalizeMailboxId(
        primaryRow?.mailbox?.mailboxId ||
          primaryRow?.mailboxId ||
          primaryRow?.mailbox?.mailboxAddress ||
          primaryRow?.mailboxAddress ||
          primaryRow?.mailbox?.userPrincipalName ||
          primaryRow?.userPrincipalName
      ) || null,
      primaryMailboxAddress: normalizeText(
        primaryRow?.mailbox?.mailboxAddress ||
          primaryRow?.mailboxAddress ||
          primaryRow?.mailbox?.mailboxId ||
          primaryRow?.mailboxId ||
          primaryRow?.mailbox?.userPrincipalName ||
          primaryRow?.userPrincipalName
      ) || null,
      underlyingConversationIds: uniqueConversationIds,
      underlyingMailboxIds: uniqueMailboxIds,
      operationalSummary: {
        unreadCount,
        needsReplyCount,
        inboxCount,
        sentCount,
        draftsCount,
        deletedCount,
      },
      provenanceLabel,
      provenanceDetail,
      primarySubject: subject,
      primaryPreview: preview,
      hasUnreadInbound,
      needsReply,
      lane,
      latestMessageAt,
      lastInboundAt,
      lastOutboundAt,
      hoursSinceInbound: maxHoursSinceInbound,
    },
  };
}

function buildCustomerRollupRows(rows = []) {
  const safeRows = asArray(rows).filter((row) => row && typeof row === 'object');
  const groups = [];
  for (const row of safeRows) {
    const mergeKey = getWorklistMergeIdentityKey(row);
    if (!mergeKey) {
      groups.push([row]);
      continue;
    }
    const matchingGroup = groups.find((group) => {
      const firstRow = group[0];
      const firstKey = getWorklistMergeIdentityKey(firstRow);
      const firstMailboxScopeKey = getWorklistMailboxScopeKey(firstRow);
      const rowMailboxScopeKey = getWorklistMailboxScopeKey(row);
      return (
        firstKey &&
        firstKey.key === mergeKey.key &&
        firstMailboxScopeKey &&
        rowMailboxScopeKey &&
        firstMailboxScopeKey === rowMailboxScopeKey &&
        group.every((existingRow) => !hasWorklistHardMergeConflict(existingRow, row))
      );
    });
    if (matchingGroup) {
      matchingGroup.push(row);
    } else {
      groups.push([row]);
    }
  }

  return groups
    .map((group) => buildWorklistRollupRow(group))
    .filter(Boolean)
    .sort(compareWorklistRollupRows)
    .map((row, index) => ({
      ...row,
      placementIndex: index,
    }));
}

function hasResolvedMergeReview(row = {}) {
  const decisions = Object.values(asObject(row?.mergeReviewDecisionsByPairId));
  if (decisions.length === 0) return false;
  return decisions.every((entry) => {
    const decision = normalizeText(entry?.decision).toLowerCase();
    return decision === 'dismissed' || decision === 'approved';
  });
}

function shouldSuppressOperatorState(row = {}, operatorState = null) {
  if (!operatorState || operatorState.superseded === true) return true;
  const actionAtMs = Date.parse(normalizeText(operatorState.actionAt || ''));
  if (!Number.isFinite(actionAtMs)) return false;
  const lastInboundMs = Date.parse(normalizeText(row?.lastInboundAt || row?.timing?.lastInboundAt || ''));
  const lastOutboundMs = Date.parse(
    normalizeText(row?.lastOutboundAt || row?.timing?.lastOutboundAt || '')
  );
  if (Number.isFinite(lastInboundMs) && lastInboundMs > actionAtMs) return true;
  if (
    normalizeActionState(operatorState.actionState) === 'reply_later' &&
    Number.isFinite(lastOutboundMs) &&
    lastOutboundMs > actionAtMs
  ) {
    return true;
  }
  return false;
}

function normalizeActionState(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'handled') return 'handled';
  if (normalized === 'reply_later') return 'reply_later';
  return '';
}

function applyConversationStateProjection({
  tenantId = '',
  rollupRows = [],
  conversationStateStore = null,
} = {}) {
  if (
    !conversationStateStore ||
    typeof conversationStateStore.getActiveStateMap !== 'function' ||
    !normalizeText(tenantId)
  ) {
    return asArray(rollupRows);
  }
  const activeStateMap = conversationStateStore.getActiveStateMap({
    tenantId,
    canonicalConversationKeys: asArray(rollupRows).map((row) => row?.conversationKey).filter(Boolean),
  });
  const projectedRows = [];
  for (const row of asArray(rollupRows)) {
    const operatorState = activeStateMap[normalizeText(row?.conversationKey)] || null;
    if (!operatorState || shouldSuppressOperatorState(row, operatorState)) {
      projectedRows.push(row);
      continue;
    }
    const normalizedActionState = normalizeActionState(operatorState.actionState);
    if (normalizedActionState === 'handled') {
      continue;
    }
    projectedRows.push({
      ...row,
      lane: normalizedActionState === 'reply_later' ? 'later' : row.lane,
      needsReply: true,
      operatorState: {
        actionState: normalizedActionState,
        needsReplyStatusOverride:
          normalizeText(operatorState.needsReplyStatusOverride || null) || null,
        followUpDueAt: normalizeText(operatorState.followUpDueAt || null) || null,
        waitingOn: normalizeText(operatorState.waitingOn || null) || null,
        nextActionLabel: normalizeText(operatorState.nextActionLabel || null) || null,
        nextActionSummary: normalizeText(operatorState.nextActionSummary || null) || null,
        actionAt: normalizeText(operatorState.actionAt || null) || null,
        version: Number(operatorState.version || 0) || 0,
      },
    });
  }
  return projectedRows.map((row, index) => ({
    ...row,
    placementIndex: index,
  }));
}

function createCcoMailboxTruthWorklistReadModel({
  store = null,
  customerState = null,
  tenantId = '',
  conversationStateStore = null,
} = {}) {
  if (!store || typeof store.listMessages !== 'function') {
    return null;
  }
  const customerIdentityLookup = buildCustomerIdentityLookup(customerState);

  function buildConversationRows({ mailboxIds = [] } = {}) {
    const messages = store.listMessages({
      mailboxIds,
      folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
    });
    const grouped = new Map();

    for (const rawMessage of messages) {
      const message = asObject(rawMessage);
      const mailboxId = normalizeMailboxId(
        message.mailboxId || message.mailboxAddress || message.userPrincipalName
      );
      const mailboxConversationId =
        normalizeText(message.mailboxConversationId) ||
        normalizeText(message.conversationId) ||
        normalizeText(message.graphMessageId);
      if (!mailboxId || !mailboxConversationId) continue;
      const key = toCanonicalMailboxConversationKey({
        mailboxId,
        conversationId: message.conversationId,
        mailboxConversationId,
        messageId: message.graphMessageId,
      });
      if (!key) continue;

        const entry =
        grouped.get(key) || {
          conversationKey: key,
          conversationId: normalizeText(message.conversationId) || null,
          mailboxConversationId: normalizeText(message.mailboxConversationId) || mailboxConversationId,
          mailboxId,
          mailboxAddress: normalizeMailboxId(message.mailboxAddress || mailboxId) || mailboxId,
          userPrincipalName:
            normalizeMailboxId(message.userPrincipalName || message.mailboxAddress || mailboxId) ||
            mailboxId,
          subject: normalizeText(message.subject) || '(utan ämne)',
          latestPreview: null,
          latestMessageAt: null,
          lastInboundAt: null,
          lastOutboundAt: null,
          hasUnreadInbound: false,
          hasDrafts: false,
          hasInbox: false,
          hasSent: false,
          hasDeleted: false,
          messageCount: 0,
          customerEmail: null,
          customerName: null,
          customerIdentity: null,
          hardConflictSignals: [],
          mergeReviewDecisionsByPairId: {},
          identityProvenance: null,
        };

      const folderType = normalizeText(message.folderType).toLowerCase();
      const direction = normalizeDirection(message.direction, folderType);
      const sortIso = deriveLatestSortIso(message);
      entry.messageCount += 1;
      if (folderType === 'inbox') entry.hasInbox = true;
      if (folderType === 'sent') entry.hasSent = true;
      if (folderType === 'drafts') entry.hasDrafts = true;
      if (folderType === 'deleted') entry.hasDeleted = true;
      if (direction === 'inbound' && message.isRead === false && folderType === 'inbox') {
        entry.hasUnreadInbound = true;
      }

      if (direction === 'inbound') {
        const inboundIso = toIso(message.receivedAt || message.sentAt || message.lastModifiedAt);
        if (inboundIso && (!entry.lastInboundAt || inboundIso > entry.lastInboundAt)) {
          entry.lastInboundAt = inboundIso;
        }
      }
      if (direction === 'outbound') {
        const outboundIso = toIso(message.sentAt || message.lastModifiedAt);
        if (outboundIso && (!entry.lastOutboundAt || outboundIso > entry.lastOutboundAt)) {
          entry.lastOutboundAt = outboundIso;
        }
      }
      if (sortIso && (!entry.latestMessageAt || sortIso > entry.latestMessageAt)) {
        entry.latestMessageAt = sortIso;
        entry.subject = normalizeText(message.subject) || entry.subject;
        entry.latestPreview = normalizeText(message.bodyPreview) || entry.latestPreview;
      }
      if (!entry.customerEmail) {
        const counterparty = deriveCounterparty(message, mailboxId);
        entry.customerEmail = counterparty.email || null;
        entry.customerName = counterparty.name || null;
      }
      // FIX6: hård fallback (UNCONDITIONAL) — kör ALLTID denna även om customerEmail
      // är satt, eftersom customerName kan vara null även när email finns.
      // Testa alla legacy-fält (senderEmail/senderName/counterpartyEmail/from.address).
      if (!entry.customerName || !entry.customerEmail) {
        const flatEmail =
          normalizeText(message?.senderEmail) ||
          normalizeText(message?.counterpartyEmail) ||
          normalizeText(message?.fromEmail) ||
          normalizeText(message?.from?.address) ||
          normalizeText(message?.from?.emailAddress?.address) ||
          normalizeText(message?.sender?.emailAddress?.address) ||
          '';
        const flatName =
          normalizeText(message?.senderName) ||
          normalizeText(message?.fromName) ||
          normalizeText(message?.from?.name) ||
          normalizeText(message?.from?.emailAddress?.name) ||
          normalizeText(message?.sender?.emailAddress?.name) ||
          '';
        if (!entry.customerEmail && flatEmail) {
          entry.customerEmail = flatEmail.toLowerCase();
        }
        if (!entry.customerName && flatName) {
          entry.customerName = flatName;
        }
        // Sista utvägen: om vi har email men ingen name, humanize email.
        if (!entry.customerName && entry.customerEmail) {
          entry.customerName = humanizeCounterpartyEmail(entry.customerEmail) || null;
        }
      }
      if (!entry.customerIdentity) {
        const rawIdentityCarrier = normalizeIdentityCarrier(message);
        if (hasSafeCustomerIdentity(rawIdentityCarrier.customerIdentity)) {
          entry.customerIdentity = cloneJson(rawIdentityCarrier.customerIdentity);
          entry.hardConflictSignals = cloneJson(rawIdentityCarrier.hardConflictSignals || []);
          entry.mergeReviewDecisionsByPairId = cloneJson(
            rawIdentityCarrier.mergeReviewDecisionsByPairId || {}
          );
          entry.identityProvenance = cloneJson(rawIdentityCarrier.identityProvenance || null);
        } else {
          const identityCarrier = customerIdentityLookup.resolveCarrier({
            ...message,
            customerEmail: entry.customerEmail,
            customerKey: message.customerKey || message.customerIdentity?.customerKey,
          });
          if (identityCarrier && hasSafeCustomerIdentity(identityCarrier.customerIdentity)) {
            entry.customerIdentity = cloneJson(identityCarrier.customerIdentity);
            entry.hardConflictSignals = cloneJson(identityCarrier.hardConflictSignals || []);
            entry.mergeReviewDecisionsByPairId = cloneJson(
              identityCarrier.mergeReviewDecisionsByPairId || {}
            );
            entry.identityProvenance = cloneJson(identityCarrier.identityProvenance || null);
          } else if (
            rawIdentityCarrier.hardConflictSignals.length > 0 ||
            Object.keys(rawIdentityCarrier.mergeReviewDecisionsByPairId || {}).length > 0 ||
            rawIdentityCarrier.identityProvenance
          ) {
            entry.hardConflictSignals = cloneJson(rawIdentityCarrier.hardConflictSignals || []);
            entry.mergeReviewDecisionsByPairId = cloneJson(
              rawIdentityCarrier.mergeReviewDecisionsByPairId || {}
            );
            entry.identityProvenance = cloneJson(rawIdentityCarrier.identityProvenance || null);
          }
        }
      }

      grouped.set(key, entry);
    }

    return Array.from(grouped.values())
      .map((entry) => {
        const deletedOnly = entry.hasDeleted && !entry.hasInbox && !entry.hasSent && !entry.hasDrafts;
        const needsReply =
          Boolean(entry.lastInboundAt) &&
          (!entry.lastOutboundAt || entry.lastOutboundAt < entry.lastInboundAt);
        const hoursSinceInbound = entry.lastInboundAt
          ? Math.max(
              0,
              Math.round(((Date.now() - Date.parse(entry.lastInboundAt)) / (60 * 60 * 1000)) * 10) / 10
            )
          : 0;
        const activeCandidate = !deletedOnly && (entry.hasUnreadInbound || needsReply || entry.hasDrafts);
        const outOfScopeDraftReview =
          activeCandidate && isOutOfScopeDraftReview({ ...entry, needsReply });
        let lane = null;
        if (activeCandidate) {
          if (outOfScopeDraftReview) lane = 'review';
          else if (entry.hasUnreadInbound && hoursSinceInbound >= 24) lane = 'act-now';
          else lane = 'all';
        }

        return {
          ...entry,
          ownershipMailbox: entry.mailboxId,
          deletedOnly,
          needsReply,
          hoursSinceInbound,
          activeCandidate,
          outOfScopeDraftReview,
          parityScope: outOfScopeDraftReview ? 'out_of_scope_draft_review' : 'in_scope',
          lane,
        };
      })
      .filter((entry) => entry.activeCandidate)
      .sort((left, right) => String(right.latestMessageAt || '').localeCompare(String(left.latestMessageAt || '')))
      .map((entry, index) => ({
        ...entry,
        placementIndex: index,
      }));
  }

  function listWorklistRows({
    mailboxIds = [],
    limit = 0,
    includeOutOfScopeDraftReview = false,
  } = {}) {
    const rows = buildConversationRows({ mailboxIds }).filter(
      (row) => includeOutOfScopeDraftReview || row.outOfScopeDraftReview !== true
    );
    const safeLimit = Math.max(0, Number(limit) || 0);
    return safeLimit > 0 ? rows.slice(0, safeLimit) : rows;
  }

  function buildReadModel({
    mailboxIds = [],
    limit = 250,
  } = {}) {
    const inScopeRows = listWorklistRows({
      mailboxIds,
      limit,
      includeOutOfScopeDraftReview: false,
    });
    const outOfScopeRows = listWorklistRows({
      mailboxIds,
      includeOutOfScopeDraftReview: true,
    }).filter((row) => row.outOfScopeDraftReview === true);

    return {
      generatedAt: new Date().toISOString(),
      modelVersion: 'cco.worklist.truth.v1',
      source: 'mailbox_truth_store',
      metadata: {
        comparisonKey: 'canonicalMailboxConversationKey',
      },
      parityScope: {
        draftOnlyReview: 'out_of_scope',
        legacyOverlayLanes: ['later', 'bookable', 'medical', 'admin', 'unclear', 'sprint'],
      },
      summary: {
        rowCount: inScopeRows.length,
        identityCount: countSafeIdentityRows(inScopeRows),
        identityCoverage:
          inScopeRows.length > 0
            ? Math.round((countSafeIdentityRows(inScopeRows) / inScopeRows.length) * 1000) / 10
            : 0,
        mailboxCount: Object.keys(countBy(inScopeRows, (row) => row.mailboxId || 'okand')).length,
        unreadCount: inScopeRows.filter((row) => row.hasUnreadInbound === true).length,
        needsReplyCount: inScopeRows.filter((row) => row.needsReply === true).length,
        actNowCount: inScopeRows.filter((row) => row.lane === 'act-now').length,
        outOfScopeDraftReviewCount: outOfScopeRows.length,
        laneCounts: countBy(inScopeRows, (row) => row.lane || 'all'),
        ownershipCounts: countBy(inScopeRows, (row) => row.ownershipMailbox || 'okand'),
      },
      rows: inScopeRows.map((row) => ({
        conversationKey: row.conversationKey,
        conversationId: row.conversationId,
        mailboxConversationId: row.mailboxConversationId,
        mailboxId: row.mailboxId,
        mailboxAddress: row.mailboxAddress,
        userPrincipalName: row.userPrincipalName,
        ownershipMailbox: row.ownershipMailbox,
        subject: row.subject,
        latestPreview: row.latestPreview,
        latestMessageAt: row.latestMessageAt,
        lastInboundAt: row.lastInboundAt,
        lastOutboundAt: row.lastOutboundAt,
        hasUnreadInbound: row.hasUnreadInbound === true,
        needsReply: row.needsReply === true,
        hoursSinceInbound: row.hoursSinceInbound,
        lane: row.lane || 'all',
        placementIndex: row.placementIndex,
        messageCount: row.messageCount,
        customerEmail: row.customerEmail,
        customerName: row.customerName,
        customerIdentity: row.customerIdentity,
        hardConflictSignals: row.hardConflictSignals,
        mergeReviewDecisionsByPairId: row.mergeReviewDecisionsByPairId,
        identityProvenance: row.identityProvenance,
        folderPresence: {
          inbox: row.hasInbox === true,
          sent: row.hasSent === true,
          drafts: row.hasDrafts === true,
          deleted: row.hasDeleted === true,
        },
      })),
    };
  }

  function buildConsumerModel({
    mailboxIds = [],
    limit = 5000,
  } = {}) {
    const n = Number(limit);
    const readLimit = n === 1000 ? 5000 : Number.isFinite(n) && n > 0 ? n : 5000;
    const readModel = buildReadModel({ mailboxIds, limit: readLimit });
    const rollupRows = applyConversationStateProjection({
      tenantId,
      rollupRows: buildCustomerRollupRows(readModel.rows),
      conversationStateStore,
    });
    const todayCount = rollupRows.filter(
      (row) => getCalendarDayBucket(row.lastInboundAt, 'Europe/Stockholm') === 'today'
    ).length;
    const tomorrowCount = rollupRows.filter((row) => {
      const followUpIso = normalizeText(row.operatorState?.followUpDueAt || '');
      return (
        followUpIso &&
        getCalendarDayBucket(followUpIso, 'Europe/Stockholm') === 'tomorrow'
      );
    }).length;
    return {
      generatedAt: new Date().toISOString(),
      source: 'mailbox_truth_worklist_consumer',
      modelVersion: 'cco.worklist.consumer.v1',
      parityScope: readModel.parityScope,
      metadata: {
        comparisonKey: readModel.metadata?.comparisonKey || 'canonicalMailboxConversationKey',
        exposureMode: 'limited',
        legacyUiDriving: true,
        shadowGuardrailRequired: true,
      },
      summary: {
        ...readModel.summary,
        rawRowCount: Number(readModel.summary?.rowCount || 0),
        rowCount: rollupRows.length,
        rollupRowCount: rollupRows.length,
        rollupReductionCount: Math.max(0, Number(readModel.summary?.rowCount || 0) - rollupRows.length),
        identityCount: countSafeIdentityRows(rollupRows),
        identityCoverage:
          rollupRows.length > 0
            ? Math.round((countSafeIdentityRows(rollupRows) / rollupRows.length) * 1000) / 10
            : 0,
        laneCounts: {
          ...(readModel.summary?.laneCounts || {}),
          todayCount,
          tomorrowCount,
        },
      },
      rows: rollupRows.map((row) => {
        const inlineContext = buildQueueInlineContext(row);
        const explanatoryLine = buildQueueExplanatoryLine(row);
        return {
        id: row.conversationKey,
        lane: row.lane || 'all',
        placementIndex: row.placementIndex,
        subject: row.subject,
        preview: row.latestPreview,
        dueBucket: buildConsumerDueBucket(row),
        conversation: {
          key: row.conversationKey,
          conversationId: row.conversationId,
          mailboxConversationId: row.mailboxConversationId,
        },
        mailbox: {
          mailboxId: row.mailboxId,
          mailboxAddress: row.mailboxAddress,
          ownershipMailbox: row.ownershipMailbox,
        },
        customer: {
          email: row.customerEmail,
          name: row.customerName,
          identity: row.customerIdentity,
        },
        customerIdentity: row.customerIdentity,
        hardConflictSignals: row.hardConflictSignals,
        mergeReviewDecisionsByPairId: row.mergeReviewDecisionsByPairId,
        identityProvenance: row.identityProvenance,
        rollup: row.rollup,
        queueInlineContext: inlineContext || null,
        queueExplanatoryLine: explanatoryLine || null,
        presentation: {
          primaryLabel: row.customerName || row.customerEmail || null,
          inlineContext: inlineContext || null,
          explanatoryLine: explanatoryLine || null,
        },
        timing: {
          latestMessageAt: row.latestMessageAt,
          lastInboundAt: row.lastInboundAt,
          lastOutboundAt: row.lastOutboundAt,
          hoursSinceInbound: row.hoursSinceInbound,
        },
        state: {
          hasUnreadInbound: row.hasUnreadInbound === true,
          needsReply: row.needsReply === true,
          messageCount: row.messageCount,
          folderPresence: asObject(row.folderPresence),
          operatorState: asObject(row.operatorState),
        },
        provenance: {
          source: 'mailbox_truth_store',
          parityScope: 'in_scope',
          rollup: row.rollup,
          operatorStateSource:
            row?.operatorState && Object.keys(asObject(row.operatorState)).length > 0
              ? 'cco_conversation_state_store'
              : null,
        },
      };
      }),
    };
  }

  return {
    listWorklistRows,
    buildReadModel,
    buildConsumerModel,
  };
}

module.exports = {
  createCcoMailboxTruthWorklistReadModel,
  isOutOfScopeDraftReview,
  toCanonicalMailboxConversationKey,
};
