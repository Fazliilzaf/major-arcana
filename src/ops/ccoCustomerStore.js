const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const XLSX = require('@e965/xlsx');

const DEFAULT_CUSTOMER_SETTINGS = Object.freeze({
  auto_merge: true,
  highlight_duplicates: true,
  strict_email: false,
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    tenants: {},
  };
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

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeCount(value, fallback = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(0, Math.round(normalized));
}

function normalizeStringArray(values, mapper = normalizeText) {
  const next = [];
  const seen = new Set();
  asArray(values).forEach((value) => {
    const normalized = mapper(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalizeText(value));
  });
  return next;
}

function normalizeLookup(values, valueMapper = normalizeText) {
  const input = values && typeof values === 'object' ? values : {};
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [normalizeKey(key), valueMapper(value)])
      .filter(([key, value]) => key && value)
  );
}

function normalizeDirectory(values) {
  const input = values && typeof values === 'object' ? values : {};
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey || !value || typeof value !== 'object') return null;
        const out = {
          name: normalizeText(value.name) || normalizedKey,
          vip: normalizeBoolean(value.vip, false),
          emailCoverage: normalizeCount(value.emailCoverage, 0),
          duplicateCandidate: normalizeBoolean(value.duplicateCandidate, false),
          profileCount: Math.max(1, normalizeCount(value.profileCount, 1)),
          customerValue: normalizeCount(value.customerValue, 0),
          totalConversations: normalizeCount(value.totalConversations, 0),
          totalMessages: normalizeCount(value.totalMessages, 0),
        };
        // P0.9 — bevara meridiq/drive-koppling så QA-dashboard kan räkna.
        // Pass-through (counts only — ingen ny PII introduceras här).
        if (value.meridiqMeta && typeof value.meridiqMeta === 'object') {
          out.meridiqMeta = value.meridiqMeta;
        }
        if (value.noMeridiqJournal === true) out.noMeridiqJournal = true;
        if (value.driveFolderId) out.driveFolderId = value.driveFolderId;
        if (value.clientoId) out.clientoId = value.clientoId;
        return [normalizedKey, out];
      })
      .filter(Boolean)
  );
}

function normalizeDetails(values) {
  const input = values && typeof values === 'object' ? values : {};
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey || !value || typeof value !== 'object') return null;
        return [
          normalizedKey,
          {
            emails: normalizeStringArray(value.emails, (entry) =>
              normalizeText(entry).toLowerCase()
            ),
            phone: normalizeText(value.phone),
            mailboxes: normalizeStringArray(value.mailboxes, normalizeKey),
          },
        ];
      })
      .filter(Boolean)
  );
}

function normalizeProfileCounts(values) {
  const input = values && typeof values === 'object' ? values : {};
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [normalizeKey(key), Math.max(1, normalizeCount(value, 1))])
      .filter(([key]) => key)
  );
}

function normalizeCustomerSettings(values) {
  const input = values && typeof values === 'object' ? values : {};
  return {
    auto_merge: normalizeBoolean(input.auto_merge, DEFAULT_CUSTOMER_SETTINGS.auto_merge),
    highlight_duplicates: normalizeBoolean(
      input.highlight_duplicates,
      DEFAULT_CUSTOMER_SETTINGS.highlight_duplicates
    ),
    strict_email: normalizeBoolean(input.strict_email, DEFAULT_CUSTOMER_SETTINGS.strict_email),
  };
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeSuggestionId(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const parts = raw
    .split('::')
    .map((entry) => normalizeKey(entry))
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return parts.sort().join('::');
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeIdentityScalar(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

function normalizeMergeReviewDecisionValue(value) {
  const decision = normalizeText(value).toLowerCase();
  if (decision === 'approved' || decision === 'dismissed' || decision === 'review_required') {
    return decision;
  }
  return '';
}

function normalizeHardConflictSignals(values) {
  const allowedTypes = new Set([
    'canonicalcustomerid',
    'canonicalcontactid',
    'explicitmergegroupid',
    'verifiedpersonalemailnormalized',
    'verifiedphonee164',
  ]);
  return asArray(values)
    .map((entry) => {
      const signal = asObject(entry);
      const type = normalizeText(signal.type).toLowerCase();
      if (!allowedTypes.has(type)) return null;
      const left = normalizeIdentityScalar(signal.left);
      const right = normalizeIdentityScalar(signal.right);
      const reason = normalizeIdentityScalar(signal.reason);
      if (!left && !right && !reason) return null;
      return {
        type,
        left,
        right,
        reason,
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeIdentityEnvelope(input = {}) {
  const provenance = asObject(input.provenance);
  const identitySource = normalizeText(input.identitySource).toLowerCase();
  const allowCanonical = identitySource === 'backend' || identitySource === 'cliento';
  const allowExplicitMergeGroup =
    identitySource === 'backend' ||
    identitySource === 'explicit_merge' ||
    identitySource === 'cliento';
  return {
    customerKey: normalizeIdentityScalar(input.customerKey),
    customerName: normalizeIdentityScalar(input.customerName),
    customerEmail: normalizeEmail(input.customerEmail) || null,
    customerPhone: normalizePhone(input.customerPhone) || null,
    canonicalCustomerId: allowCanonical ? normalizeIdentityScalar(input.canonicalCustomerId) : null,
    canonicalContactId: allowCanonical ? normalizeIdentityScalar(input.canonicalContactId) : null,
    explicitMergeGroupId: allowExplicitMergeGroup
      ? normalizeIdentityScalar(input.explicitMergeGroupId)
      : null,
    verifiedPersonalEmailNormalized: normalizeEmail(input.verifiedPersonalEmailNormalized) || null,
    verifiedPhoneE164: normalizePhone(input.verifiedPhoneE164) || null,
    identitySource: [
      'backend',
      'cliento',
      'derived',
      'explicit_merge',
      'history',
      'unknown',
    ].includes(identitySource)
      ? identitySource
      : 'unknown',
    identityConfidence: ['strong', 'review', 'uncertain', 'derived', 'weak', 'unknown'].includes(
      normalizeText(input.identityConfidence).toLowerCase()
    )
      ? normalizeText(input.identityConfidence).toLowerCase()
      : 'unknown',
    hardConflictSignals: normalizeHardConflictSignals(input.hardConflictSignals),
    provenance: {
      source: ['backend', 'cliento', 'history', 'derived', 'mailbox_truth', 'unknown'].includes(
        normalizeText(provenance.source).toLowerCase()
      )
        ? normalizeText(provenance.source).toLowerCase()
        : 'derived',
      mailboxIds: normalizeStringArray(provenance.mailboxIds, normalizeMailboxLabel),
      conversationIds: normalizeStringArray(provenance.conversationIds, normalizeText),
      sourceRecordIds: normalizeStringArray(provenance.sourceRecordIds, normalizeText),
    },
  };
}

function normalizeIdentityByKey(values = {}) {
  const input = asObject(values);
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey) return null;
        return [
          normalizedKey,
          normalizeIdentityEnvelope({ ...asObject(value), customerKey: normalizedKey }),
        ];
      })
      .filter(Boolean)
  );
}

function normalizeMergeReviewDecision(input = {}) {
  const decision = normalizeMergeReviewDecisionValue(input.decision);
  const pairId = normalizeText(input.pairId).toLowerCase();
  if (!decision || !pairId) return null;
  return {
    pairId,
    decision,
    decidedAt: normalizeText(input.decidedAt) || nowIso(),
    decidedBy: normalizeIdentityScalar(input.decidedBy),
    reasonCode: normalizeIdentityScalar(input.reasonCode),
    signalSnapshot: asObject(input.signalSnapshot),
    identitySnapshot: asObject(input.identitySnapshot),
  };
}

function normalizeMergeReviewDecisionMap(values = {}) {
  const input = asObject(values);
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => {
        const normalizedKey = normalizeText(key).toLowerCase();
        if (!normalizedKey) return null;
        const normalizedDecision = normalizeMergeReviewDecision({
          ...asObject(value),
          pairId: normalizedKey,
        });
        if (!normalizedDecision) return null;
        return [normalizedKey, normalizedDecision];
      })
      .filter(Boolean)
  );
}

function sameNormalizedValue(left, right, mapper = normalizeText) {
  const normalizedLeft = mapper(left);
  const normalizedRight = mapper(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}

function buildIdentityEnvelopeFromRecord(customerState, customerKey) {
  const resolvedKey = resolveCustomerKey(customerState, customerKey);
  const directoryEntry = customerState.directory?.[resolvedKey] || {};
  const detailEntry = customerState.details?.[resolvedKey] || {};
  const existingEnvelope = normalizeIdentityEnvelope(
    customerState.identityByKey?.[resolvedKey] || {}
  );
  const detailsEmails = normalizeStringArray(detailEntry.emails, normalizeEmail).map(
    normalizeEmail
  );
  const detailsMailboxes = normalizeStringArray(detailEntry.mailboxes, normalizeMailboxLabel);
  const primaryEmail =
    normalizeEmail(customerState.primaryEmailByKey?.[resolvedKey]) || detailsEmails[0] || null;
  const latestMailboxIds = normalizeStringArray(
    [...asArray(existingEnvelope.provenance.mailboxIds), ...detailsMailboxes],
    normalizeMailboxLabel
  );
  return normalizeIdentityEnvelope({
    ...existingEnvelope,
    customerKey: resolvedKey,
    customerName:
      normalizeText(directoryEntry.name) || existingEnvelope.customerName || resolvedKey,
    customerEmail: existingEnvelope.customerEmail || primaryEmail || null,
    customerPhone: existingEnvelope.customerPhone || normalizePhone(detailEntry.phone) || null,
    provenance: {
      source: existingEnvelope.provenance.source || 'derived',
      mailboxIds: latestMailboxIds,
      conversationIds: existingEnvelope.provenance.conversationIds,
      sourceRecordIds: [...asArray(existingEnvelope.provenance.sourceRecordIds), resolvedKey],
    },
  });
}

function normalizePersonnummer(value) {
  return normalizeText(value).replace(/[^\d]+/g, '');
}

function buildBootstrapSourceRecordId(importedRow, sourceSystem = 'cliento') {
  const seed = [
    normalizeText(sourceSystem).toLowerCase(),
    normalizeText(importedRow.personnummer),
    normalizeStringArray(importedRow.emails, normalizeEmail).map(normalizeEmail).sort().join('|'),
    normalizeStringArray(asArray(importedRow.phones), normalizePhone)
      .map(normalizePhone)
      .sort()
      .join('|'),
    normalizePhone(importedRow.phone),
    normalizeText(importedRow.name),
  ]
    .filter(Boolean)
    .join('::');
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);
}

function buildClientoBootstrapSeed(importedRow) {
  const normalizedPersonnummer = normalizePersonnummer(importedRow.personnummer);
  if (normalizedPersonnummer) {
    return `pnr:${normalizedPersonnummer}`;
  }

  const emails = normalizeStringArray(importedRow.emails, normalizeEmail).map(normalizeEmail);
  const phones = normalizeStringArray(
    [...asArray(importedRow.phones), normalizeText(importedRow.phone)],
    normalizePhone
  ).map(normalizePhone);
  if (emails.length && phones.length) {
    return `email:${emails.sort().join('|')}|phone:${phones.sort().join('|')}`;
  }
  if (emails.length) {
    return `email:${emails.sort().join('|')}`;
  }
  if (phones.length) {
    return `phone:${phones.sort().join('|')}`;
  }
  return '';
}

function buildClientoCanonicalCustomerId(importedRow) {
  const seed = buildClientoBootstrapSeed(importedRow);
  if (!seed) return '';
  return `cliento_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function buildClientoReviewPairId(primaryKey, secondaryKeys, importedRow) {
  const tokens = [
    `source:${normalizeText(importedRow.sourceSystem).toLowerCase() || 'cliento'}`,
    `canonical:${normalizeText(primaryKey).toLowerCase()}`,
    ...normalizeStringArray(secondaryKeys, normalizeText).map(
      (entry) => `candidate:${entry.toLowerCase()}`
    ),
  ].sort();
  return crypto.createHash('sha256').update(tokens.join('|')).digest('hex').slice(0, 32);
}

function hasMergeReviewDecision(customerState, pairId) {
  const normalizedPairId = normalizeText(pairId).toLowerCase();
  if (!normalizedPairId) return false;
  return Boolean(
    normalizeMergeReviewDecision(customerState?.mergeReviewDecisionsByPairId?.[normalizedPairId])
  );
}

function buildMergePairId(primaryRecord, secondaryRecord) {
  const strongTokens = [];
  const addStrongToken = (token, left, right) => {
    if (sameNormalizedValue(left, right)) {
      strongTokens.push(`${token}:${normalizeText(left).toLowerCase()}`);
    }
  };
  addStrongToken(
    'canonicalCustomerId',
    primaryRecord.identity?.canonicalCustomerId,
    secondaryRecord.identity?.canonicalCustomerId
  );
  addStrongToken(
    'canonicalContactId',
    primaryRecord.identity?.canonicalContactId,
    secondaryRecord.identity?.canonicalContactId
  );
  addStrongToken(
    'explicitMergeGroupId',
    primaryRecord.identity?.explicitMergeGroupId,
    secondaryRecord.identity?.explicitMergeGroupId
  );
  if (strongTokens.length) {
    return strongTokens.sort().join('|');
  }

  const contactTokens = [];
  const addContactToken = (token, left, right) => {
    if (sameNormalizedValue(left, right, normalizeEmail)) {
      contactTokens.push(`${token}:${normalizeEmail(left)}`);
      return true;
    }
    return false;
  };

  const sharedVerifiedEmail = addContactToken(
    'verifiedPersonalEmailNormalized',
    primaryRecord.identity?.verifiedPersonalEmailNormalized,
    secondaryRecord.identity?.verifiedPersonalEmailNormalized
  );
  const sharedExactEmail = addContactToken(
    'email',
    primaryRecord.customerEmail || primaryRecord.emails?.[0] || '',
    secondaryRecord.customerEmail || secondaryRecord.emails?.[0] || ''
  );
  const sharedVerifiedPhone = sameNormalizedValue(
    primaryRecord.identity?.verifiedPhoneE164,
    secondaryRecord.identity?.verifiedPhoneE164,
    normalizePhone
  );
  if (sharedVerifiedPhone) {
    contactTokens.push(
      `verifiedPhoneE164:${normalizePhone(primaryRecord.identity?.verifiedPhoneE164)}`
    );
  }
  const sharedExactPhone = sameNormalizedValue(
    primaryRecord.phone,
    secondaryRecord.phone,
    normalizePhone
  );
  if (sharedExactPhone) {
    contactTokens.push(`phone:${normalizePhone(primaryRecord.phone)}`);
  }

  if (contactTokens.length) {
    return contactTokens.sort().join('|');
  }

  return '';
}

function hasStrongIdentityMatch(primaryRecord, secondaryRecord) {
  const sameCustomerId =
    sameNormalizedValue(
      primaryRecord.identity?.canonicalCustomerId,
      secondaryRecord.identity?.canonicalCustomerId,
      normalizeText
    ) && Boolean(normalizeIdentityScalar(primaryRecord.identity?.canonicalCustomerId));
  const sameContactId =
    sameNormalizedValue(
      primaryRecord.identity?.canonicalContactId,
      secondaryRecord.identity?.canonicalContactId,
      normalizeText
    ) && Boolean(normalizeIdentityScalar(primaryRecord.identity?.canonicalContactId));
  const sameGroupId =
    sameNormalizedValue(
      primaryRecord.identity?.explicitMergeGroupId,
      secondaryRecord.identity?.explicitMergeGroupId,
      normalizeText
    ) && Boolean(normalizeIdentityScalar(primaryRecord.identity?.explicitMergeGroupId));
  return sameCustomerId || sameContactId || sameGroupId;
}

function collectHardConflictSignals(primaryRecord, secondaryRecord) {
  const conflicts = [];
  const addConflict = (type, left, right, reason) => {
    const normalizedLeft = normalizeIdentityScalar(left);
    const normalizedRight = normalizeIdentityScalar(right);
    if (!normalizedLeft || !normalizedRight || normalizedLeft === normalizedRight) return;
    conflicts.push({
      type,
      left: normalizedLeft,
      right: normalizedRight,
      reason,
    });
  };

  addConflict(
    'canonicalcustomerid',
    primaryRecord.identity?.canonicalCustomerId,
    secondaryRecord.identity?.canonicalCustomerId,
    'Olika canonicalCustomerId'
  );
  addConflict(
    'canonicalcontactid',
    primaryRecord.identity?.canonicalContactId,
    secondaryRecord.identity?.canonicalContactId,
    'Olika canonicalContactId'
  );
  addConflict(
    'explicitmergegroupid',
    primaryRecord.identity?.explicitMergeGroupId,
    secondaryRecord.identity?.explicitMergeGroupId,
    'Olika explicitMergeGroupId'
  );
  addConflict(
    'verifiedpersonalemailnormalized',
    primaryRecord.identity?.verifiedPersonalEmailNormalized,
    secondaryRecord.identity?.verifiedPersonalEmailNormalized,
    'Olika verifierad e-post'
  );
  addConflict(
    'verifiedphonee164',
    primaryRecord.identity?.verifiedPhoneE164,
    secondaryRecord.identity?.verifiedPhoneE164,
    'Olika verifierad telefon'
  );

  return conflicts;
}

function hasHardConflict(primaryRecord, secondaryRecord) {
  return collectHardConflictSignals(primaryRecord, secondaryRecord).length > 0;
}

function scoreMergeReviewCandidate(primaryRecord, secondaryRecord) {
  const reasons = [];
  const categories = [];
  let identityAdjacent = 0;
  let provenance = 0;
  let operational = 0;
  let contactIdentitySignal = false;

  const sharedVerifiedEmail =
    sameNormalizedValue(
      primaryRecord.identity?.verifiedPersonalEmailNormalized,
      secondaryRecord.identity?.verifiedPersonalEmailNormalized,
      normalizeEmail
    ) && Boolean(normalizeIdentityScalar(primaryRecord.identity?.verifiedPersonalEmailNormalized));
  if (sharedVerifiedEmail) {
    identityAdjacent += 24;
    contactIdentitySignal = true;
    reasons.push(
      `Verifierad e-post: ${normalizeEmail(primaryRecord.identity?.verifiedPersonalEmailNormalized)}`
    );
  }

  const sharedEmail = primaryRecord.emails.some((email) =>
    secondaryRecord.emails.some((candidate) => normalizeEmail(candidate) === normalizeEmail(email))
  );
  if (sharedEmail) {
    identityAdjacent += 20;
    contactIdentitySignal = true;
    reasons.push(
      `Delad e-post: ${normalizeEmail(
        primaryRecord.emails.find((email) =>
          secondaryRecord.emails.some(
            (candidate) => normalizeEmail(candidate) === normalizeEmail(email)
          )
        )
      )}`
    );
  }

  const sharedVerifiedPhone =
    sameNormalizedValue(
      primaryRecord.identity?.verifiedPhoneE164,
      secondaryRecord.identity?.verifiedPhoneE164,
      normalizePhone
    ) && Boolean(normalizeIdentityScalar(primaryRecord.identity?.verifiedPhoneE164));
  if (sharedVerifiedPhone) {
    identityAdjacent += 24;
    contactIdentitySignal = true;
    reasons.push(
      `Verifierad telefon: ${normalizePhone(primaryRecord.identity?.verifiedPhoneE164)}`
    );
  }

  const sharedPhone = sameNormalizedValue(
    primaryRecord.phone,
    secondaryRecord.phone,
    normalizePhone
  );
  if (sharedPhone) {
    identityAdjacent += 20;
    contactIdentitySignal = true;
    reasons.push(`Samma telefon: ${normalizePhone(primaryRecord.phone)}`);
  }

  const sharedName = sameNormalizedValue(
    primaryRecord.name,
    secondaryRecord.name,
    normalizeNameSignature
  );
  if (sharedName) {
    identityAdjacent += 4;
    reasons.push('Samma kundnamn');
  }

  const sharedCustomerKey = sameNormalizedValue(
    primaryRecord.key,
    secondaryRecord.key,
    normalizeKey
  );
  if (sharedCustomerKey) {
    identityAdjacent += 2;
    reasons.push('Samma kundnyckel');
  }

  const sharedMailbox = primaryRecord.mailboxes.filter((mailbox) =>
    secondaryRecord.mailboxes.some(
      (candidate) => normalizeMailboxLabel(candidate) === normalizeMailboxLabel(mailbox)
    )
  );
  if (sharedMailbox.length) {
    provenance += 8;
    reasons.push(`Samma inboxspår: ${sharedMailbox[0]}`);
  }

  const primaryConversationIds = normalizeStringArray(
    asArray(primaryRecord.identity?.provenance?.conversationIds),
    normalizeText
  );
  const secondaryConversationIds = normalizeStringArray(
    asArray(secondaryRecord.identity?.provenance?.conversationIds),
    normalizeText
  );
  const sharedConversationIds = primaryConversationIds.filter((conversationId) =>
    secondaryConversationIds.includes(conversationId)
  );
  if (sharedConversationIds.length) {
    provenance += 2;
    reasons.push('Delad historik');
  }

  const operationalHints = [primaryRecord.operationalHint, secondaryRecord.operationalHint].filter(
    Boolean
  );
  if (operationalHints.length) {
    operational += 0;
  }

  if (identityAdjacent) categories.push('identity_adjacent');
  if (provenance) categories.push('provenance');
  if (operational) categories.push('operational');

  const score = identityAdjacent + provenance + operational;
  return {
    score,
    categories,
    identityAdjacent,
    provenance,
    operational,
    contactIdentitySignal,
    reasons: normalizeStringArray(reasons, normalizeText).slice(0, 5),
  };
}

function determineMergeDisposition(primaryRecord, secondaryRecord, customerState = null) {
  const hardConflictSignals = collectHardConflictSignals(primaryRecord, secondaryRecord);
  if (hardConflictSignals.length) {
    return {
      decision: 'DO_NOT_MERGE',
      pairId: buildMergePairId(primaryRecord, secondaryRecord),
      scoreSnapshot: scoreMergeReviewCandidate(primaryRecord, secondaryRecord),
      hardConflictSignals,
      reasonCode: 'hard_conflict',
    };
  }

  if (hasStrongIdentityMatch(primaryRecord, secondaryRecord)) {
    return {
      decision: 'AUTO_MERGE',
      pairId: buildMergePairId(primaryRecord, secondaryRecord),
      scoreSnapshot: scoreMergeReviewCandidate(primaryRecord, secondaryRecord),
      hardConflictSignals: [],
      reasonCode: 'strong_identity',
    };
  }

  const pairId = buildMergePairId(primaryRecord, secondaryRecord);
  const scoreSnapshot = scoreMergeReviewCandidate(primaryRecord, secondaryRecord);
  if (!pairId || !scoreSnapshot.contactIdentitySignal) {
    return {
      decision: 'DO_NOT_MERGE',
      pairId,
      scoreSnapshot,
      hardConflictSignals: [],
      reasonCode: 'weak_identity',
    };
  }

  if (hasMergeReviewDecision(customerState, pairId)) {
    return {
      decision: 'DO_NOT_MERGE',
      pairId,
      scoreSnapshot,
      hardConflictSignals: [],
      reasonCode: 'review_recorded',
    };
  }

  if (
    scoreSnapshot.score < 30 ||
    scoreSnapshot.categories.length < 2 ||
    !scoreSnapshot.contactIdentitySignal
  ) {
    return {
      decision: 'DO_NOT_MERGE',
      pairId,
      scoreSnapshot,
      hardConflictSignals: [],
      reasonCode: 'below_threshold',
    };
  }

  return {
    decision: 'SUGGEST_FOR_REVIEW',
    pairId,
    scoreSnapshot,
    hardConflictSignals: [],
    reasonCode: 'review_candidate',
  };
}

function recordMergeReviewDecision(customerState, decisionPayload = {}) {
  const normalized = normalizeMergeReviewDecision(decisionPayload);
  if (!normalized) return false;
  customerState.mergeReviewDecisionsByPairId = customerState.mergeReviewDecisionsByPairId || {};
  customerState.mergeReviewDecisionsByPairId[normalized.pairId] = normalized;
  return true;
}

function isMergeReviewDecisionDismissed(customerState, pairId) {
  const normalizedPairId = normalizeText(pairId).toLowerCase();
  if (!normalizedPairId) return false;
  const existing = normalizeMergeReviewDecision(
    customerState?.mergeReviewDecisionsByPairId?.[normalizedPairId]
  );
  return Boolean(existing && existing.decision === 'dismissed');
}

function stripDiacritics(value) {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeNameSignature(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/[^\d+]+/g, '');
}

function normalizeMailboxLabel(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeHeader(value) {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function deriveMailboxLabel(value) {
  const localPart = normalizeText(value).split('@')[0] || '';
  if (!localPart) return '';
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

function splitMultiValue(value) {
  if (Array.isArray(value)) return value;
  const text = normalizeText(value);
  if (!text) return [];
  return text
    .split(/[\n;,|]+/g)
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function parseCsvLine(line) {
  const input = String(line || '');
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current);
  return result.map((value) => normalizeText(value));
}

function buildImportedRow(input = {}, rowNumber = 1, options = {}) {
  const record = input && typeof input === 'object' ? input : {};
  const emails = [];
  const phones = [];
  const mailboxes = [];
  let personnummer = '';
  const defaultMailboxId = normalizeEmail(options.defaultMailboxId);

  const pushEmails = (value) => {
    splitMultiValue(value).forEach((entry) => {
      const normalized = normalizeEmail(entry);
      if (normalized) emails.push(normalized);
    });
  };

  const pushPhones = (value) => {
    splitMultiValue(value).forEach((entry) => {
      const normalized = normalizePhone(entry);
      if (normalized) phones.push(normalized);
    });
  };

  const pushMailboxes = (value) => {
    splitMultiValue(value).forEach((entry) => {
      const normalized = normalizeText(entry);
      if (normalized) mailboxes.push(normalized);
    });
  };

  pushEmails(record.email);
  pushEmails(record.primaryEmail);
  pushEmails(record.primary_email);
  pushEmails(record.secondaryEmail);
  pushEmails(record.secondary_email);
  pushEmails(record.emails);
  pushEmails(record.epost);
  pushPhones(record.phone);
  pushPhones(record.phoneNumber);
  pushPhones(record.phone_number);
  pushPhones(record.telefon);
  pushPhones(record.telefon_mobil);
  pushPhones(record.telefon_annat);
  pushMailboxes(record.mailbox);
  pushMailboxes(record.mailboxes);
  pushMailboxes(record.mailboxLabel);
  pushMailboxes(record.mailboxLabels);
  personnummer =
    normalizeText(record.personnummer) ||
    normalizeText(record.personNumber) ||
    normalizeText(record.person_number) ||
    normalizeText(record.pnr);

  Object.entries(record).forEach(([key, value]) => {
    const header = normalizeHeader(key);
    if (!header) return;
    if (
      header.startsWith('email') ||
      header.endsWith('_email') ||
      header.includes('epost') ||
      header.includes('e_post')
    ) {
      pushEmails(value);
      return;
    }
    if (header.startsWith('telefon') || header.includes('phone') || header.includes('mobil')) {
      pushPhones(value);
      return;
    }
    if (header.includes('personnummer') || header === 'pnr' || header.includes('person_number')) {
      personnummer = normalizeText(value) || personnummer;
      return;
    }
    if (header.startsWith('mailbox') || header.endsWith('_mailbox')) {
      pushMailboxes(value);
    }
  });

  if (mailboxes.length === 0 && defaultMailboxId) {
    const defaultMailboxLabel = deriveMailboxLabel(defaultMailboxId);
    if (defaultMailboxLabel) {
      mailboxes.push(defaultMailboxLabel);
    }
  }

  const normalizedEmails = normalizeStringArray(emails, normalizeEmail).map(normalizeEmail);
  const normalizedPhones = normalizeStringArray(phones, normalizePhone).map(normalizePhone);
  const normalizedMailboxes = normalizeStringArray(mailboxes, normalizeKey);
  const name =
    normalizeText(record.name) ||
    normalizeText(record.namn) ||
    normalizeText(record.customerName) ||
    normalizeText(record.customer_name) ||
    normalizeText(record.fullName) ||
    normalizeText(record.full_name);
  const vipCandidate =
    record.vip ?? record.isVip ?? record.is_vip ?? record.priority ?? record.segment;

  return {
    rowNumber,
    name,
    emails: normalizedEmails,
    phones: normalizedPhones,
    personnummer: normalizeText(personnummer),
    phone: normalizedPhones[0] || '',
    mailboxes: normalizedMailboxes,
    vip:
      normalizeBoolean(vipCandidate, false) ||
      ['vip', 'high_value', 'priority'].includes(normalizeKey(vipCandidate)),
    customerValue: normalizeCount(
      record.customerValue ?? record.customer_value ?? record.value ?? record.ltv,
      0
    ),
    totalConversations: normalizeCount(
      record.totalConversations ?? record.total_conversations ?? record.conversations,
      0
    ),
    totalMessages: normalizeCount(
      record.totalMessages ?? record.total_messages ?? record.messages,
      0
    ),
  };
}

function parseJsonImportRows(text, options = {}) {
  const parsed = JSON.parse(text);
  const records = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.customers)
      ? parsed.customers
      : Array.isArray(parsed?.records)
        ? parsed.records
        : [];
  return records.map((record, index) => buildImportedRow(record, index + 1, options));
}

function parseCsvImportRows(text, options = {}) {
  const lines = String(text || '')
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV-importen måste innehålla rubrikrad och minst en datarad.');
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = cells[index] || '';
    });
    return buildImportedRow(record, rowIndex + 2, options);
  });
}

function parseStructuredImportRows(rows, options = {}) {
  return asArray(rows).map((row, index) => {
    const record = row && typeof row === 'object' ? row : {};
    const source = record.record && typeof record.record === 'object' ? record.record : record;
    const rowNumber = Math.max(
      1,
      Number(record.rowNumber || source.rowNumber || index + 1) || index + 1
    );
    return buildImportedRow(source, rowNumber, options);
  });
}

function parseSpreadsheetImportRows(binaryBase64, options = {}) {
  const source = normalizeText(binaryBase64);
  if (!source) {
    throw new Error('Importkällan är tom.');
  }

  let workbook = null;
  try {
    workbook = XLSX.read(Buffer.from(source, 'base64'), {
      type: 'buffer',
      cellDates: false,
      raw: false,
    });
  } catch (error) {
    throw new Error('Kalkylbladsfilen kunde inte läsas.');
  }

  const firstSheetName = asArray(workbook?.SheetNames).find(
    (sheetName) => workbook?.Sheets?.[sheetName]
  );
  if (!firstSheetName) {
    throw new Error('Kalkylbladsfilen innehåller inga blad.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const records = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  });
  return asArray(records).map((record, index) => buildImportedRow(record, index + 2, options));
}

function inferCustomerImportFormat(fileName = '', fallback = 'csv') {
  const normalizedFileName = normalizeText(fileName).toLowerCase();
  if (normalizedFileName.endsWith('.xlsx') || normalizedFileName.endsWith('.xls')) {
    return 'xlsx';
  }
  if (normalizedFileName.endsWith('.json')) {
    return 'json';
  }
  return fallback;
}

function parseCustomerImportRows({
  text,
  rows = null,
  binaryBase64 = '',
  fileName,
  defaultMailboxId = '',
}) {
  if (Array.isArray(rows)) {
    return {
      format: inferCustomerImportFormat(fileName, 'json'),
      rows: parseStructuredImportRows(rows, { defaultMailboxId }),
    };
  }

  const normalizedFileName = normalizeText(fileName).toLowerCase();
  if (normalizedFileName.endsWith('.xlsx') || normalizedFileName.endsWith('.xls')) {
    return {
      format: 'xlsx',
      rows: parseSpreadsheetImportRows(binaryBase64, { defaultMailboxId }),
    };
  }

  const sourceText = String(text || '').trim();
  if (!sourceText) {
    throw new Error('Importkällan är tom.');
  }

  const looksLikeJson =
    normalizedFileName.endsWith('.json') ||
    sourceText.startsWith('{') ||
    sourceText.startsWith('[');
  if (looksLikeJson) {
    return {
      format: 'json',
      rows: parseJsonImportRows(sourceText, { defaultMailboxId }),
    };
  }
  return {
    format: 'csv',
    rows: parseCsvImportRows(sourceText, { defaultMailboxId }),
  };
}

function cloneCustomerState(customerState = {}) {
  return JSON.parse(JSON.stringify(normalizeCustomerState(customerState)));
}

function buildCustomerKey(baseValue, customerState) {
  const directory = customerState.directory || {};
  const fallback = normalizeKey(baseValue) || 'imported_customer';
  let nextKey = fallback;
  let index = 2;
  while (directory[nextKey]) {
    nextKey = `${fallback}_${index}`;
    index += 1;
  }
  return nextKey;
}

function getActiveCustomerKeys(customerState) {
  const mergedInto = customerState.mergedInto || {};
  return Object.keys(customerState.directory || {}).filter((key) => !mergedInto[key]);
}

function resolveCustomerKey(customerState, customerKey) {
  const mergedInto = customerState.mergedInto || {};
  let currentKey = normalizeKey(customerKey);
  const seen = new Set();
  while (mergedInto[currentKey] && !seen.has(currentKey)) {
    seen.add(currentKey);
    currentKey = normalizeKey(mergedInto[currentKey]);
  }
  return currentKey;
}

function findMatchingCustomerKeys(customerState, importedRow, { strictEmail = false } = {}) {
  const matches = new Set();
  const activeKeys = getActiveCustomerKeys(customerState);

  if (importedRow.emails.length) {
    activeKeys.forEach((customerKey) => {
      const existingRecord = createIdentityRecord(customerState, customerKey);
      if (
        importedRow.emails.some((email) =>
          existingRecord.emails.some(
            (candidate) => normalizeEmail(candidate) === normalizeEmail(email)
          )
        )
      ) {
        matches.add(resolveCustomerKey(customerState, customerKey));
      }
    });
  }

  if (!strictEmail && !matches.size && importedRow.phone) {
    activeKeys.forEach((customerKey) => {
      const existingRecord = createIdentityRecord(customerState, customerKey);
      if (
        normalizePhone(existingRecord.phone) &&
        normalizePhone(existingRecord.phone) === normalizePhone(importedRow.phone)
      ) {
        matches.add(resolveCustomerKey(customerState, customerKey));
      }
    });
  }

  return Array.from(matches).filter(Boolean);
}

function mergeCustomerProfiles(customerState, primaryKey, secondaryKeys, options = {}) {
  customerState.mergedInto = customerState.mergedInto || {};
  customerState.primaryEmailByKey = customerState.primaryEmailByKey || {};
  customerState.identityByKey = customerState.identityByKey || {};
  const directory = customerState.directory || {};
  const details = customerState.details || {};
  const profileCounts = customerState.profileCounts || {};
  const primary = directory[primaryKey];
  const primaryDetail = details[primaryKey];
  if (!primary || !primaryDetail) return;
  const keepEmails = normalizeBoolean(options.keepAllEmails, true);
  const keepPhones = normalizeBoolean(options.keepAllPhones, true);

  secondaryKeys.forEach((secondaryKey) => {
    if (!secondaryKey || secondaryKey === primaryKey) return;
    const resolvedSecondary = resolveCustomerKey(customerState, secondaryKey);
    if (!resolvedSecondary || resolvedSecondary === primaryKey) return;
    const secondary = directory[resolvedSecondary];
    const secondaryDetail = details[resolvedSecondary];
    if (!secondary || !secondaryDetail) return;
    const currentPrimaryIdentity = buildIdentityEnvelopeFromRecord(customerState, primaryKey);
    const secondaryIdentity = buildIdentityEnvelopeFromRecord(customerState, resolvedSecondary);

    if (keepEmails) {
      primaryDetail.emails = normalizeStringArray(
        [...asArray(primaryDetail.emails), ...asArray(secondaryDetail.emails)],
        normalizeEmail
      ).map(normalizeEmail);
    }
    primaryDetail.mailboxes = normalizeStringArray(
      [...asArray(primaryDetail.mailboxes), ...asArray(secondaryDetail.mailboxes)],
      normalizeKey
    );
    if (keepPhones && !normalizeText(primaryDetail.phone) && normalizeText(secondaryDetail.phone)) {
      primaryDetail.phone = normalizeText(secondaryDetail.phone);
    }

    primary.name = normalizeText(primary.name) || normalizeText(secondary.name) || primaryKey;
    primary.vip = Boolean(primary.vip || secondary.vip);
    primary.emailCoverage = Math.max(
      normalizeCount(primary.emailCoverage, 0),
      normalizeCount(secondary.emailCoverage, 0),
      primaryDetail.emails.length
    );
    primary.profileCount = Math.max(
      1,
      normalizeCount(primary.profileCount, 1) + normalizeCount(secondary.profileCount, 1)
    );
    primary.customerValue =
      normalizeCount(primary.customerValue, 0) + normalizeCount(secondary.customerValue, 0);
    primary.totalConversations =
      normalizeCount(primary.totalConversations, 0) +
      normalizeCount(secondary.totalConversations, 0);
    primary.totalMessages =
      normalizeCount(primary.totalMessages, 0) + normalizeCount(secondary.totalMessages, 0);
    primary.duplicateCandidate = primaryDetail.emails.length > 1;

    customerState.mergedInto[resolvedSecondary] = primaryKey;
    profileCounts[primaryKey] = primary.profileCount;
    delete customerState.primaryEmailByKey[resolvedSecondary];
    customerState.identityByKey[primaryKey] = normalizeIdentityEnvelope({
      ...currentPrimaryIdentity,
      customerKey: primaryKey,
      customerName: normalizeText(primary.name) || normalizeText(secondary.name) || primaryKey,
      customerEmail:
        currentPrimaryIdentity.customerEmail ||
        secondaryIdentity.customerEmail ||
        primaryDetail.emails[0] ||
        secondaryDetail.emails[0] ||
        null,
      customerPhone:
        currentPrimaryIdentity.customerPhone ||
        secondaryIdentity.customerPhone ||
        normalizePhone(primaryDetail.phone) ||
        normalizePhone(secondaryDetail.phone) ||
        null,
      canonicalCustomerId:
        currentPrimaryIdentity.canonicalCustomerId || secondaryIdentity.canonicalCustomerId,
      canonicalContactId:
        currentPrimaryIdentity.canonicalContactId || secondaryIdentity.canonicalContactId,
      explicitMergeGroupId:
        currentPrimaryIdentity.explicitMergeGroupId || secondaryIdentity.explicitMergeGroupId,
      verifiedPersonalEmailNormalized:
        currentPrimaryIdentity.verifiedPersonalEmailNormalized ||
        secondaryIdentity.verifiedPersonalEmailNormalized,
      verifiedPhoneE164:
        currentPrimaryIdentity.verifiedPhoneE164 || secondaryIdentity.verifiedPhoneE164,
      identitySource:
        currentPrimaryIdentity.identitySource !== 'unknown'
          ? currentPrimaryIdentity.identitySource
          : secondaryIdentity.identitySource,
      identityConfidence:
        currentPrimaryIdentity.identityConfidence !== 'unknown'
          ? currentPrimaryIdentity.identityConfidence
          : secondaryIdentity.identityConfidence,
      hardConflictSignals: normalizeHardConflictSignals([
        ...asArray(currentPrimaryIdentity.hardConflictSignals),
        ...asArray(secondaryIdentity.hardConflictSignals),
      ]),
      provenance: {
        source:
          currentPrimaryIdentity.provenance.source !== 'unknown'
            ? currentPrimaryIdentity.provenance.source
            : secondaryIdentity.provenance.source,
        mailboxIds: normalizeStringArray(
          [
            ...asArray(currentPrimaryIdentity.provenance.mailboxIds),
            ...asArray(secondaryIdentity.provenance.mailboxIds),
            ...asArray(primaryDetail.mailboxes),
            ...asArray(secondaryDetail.mailboxes),
          ],
          normalizeMailboxLabel
        ),
        conversationIds: normalizeStringArray(
          [
            ...asArray(currentPrimaryIdentity.provenance.conversationIds),
            ...asArray(secondaryIdentity.provenance.conversationIds),
          ],
          normalizeText
        ),
        sourceRecordIds: normalizeStringArray(
          [
            ...asArray(currentPrimaryIdentity.provenance.sourceRecordIds),
            ...asArray(secondaryIdentity.provenance.sourceRecordIds),
            primaryKey,
            resolvedSecondary,
          ],
          normalizeText
        ),
      },
    });
    delete customerState.identityByKey[resolvedSecondary];
  });

  if (!customerState.primaryEmailByKey[primaryKey] && primaryDetail.emails[0]) {
    customerState.primaryEmailByKey[primaryKey] = primaryDetail.emails[0];
  }
}

function splitCustomerProfile(customerState, customerKey, emailToSplit) {
  const normalizedKey = resolveCustomerKey(customerState, customerKey);
  const normalizedEmail = normalizeEmail(emailToSplit);
  if (!normalizedKey || !normalizedEmail) return '';

  const directory = customerState.directory || {};
  const details = customerState.details || {};
  const profileCounts = customerState.profileCounts || {};
  const record = directory[normalizedKey];
  const detail = details[normalizedKey];
  if (!record || !detail) return '';

  const emails = normalizeStringArray(detail.emails, normalizeEmail).map(normalizeEmail);
  const splitAlias = emails.find((entry) => normalizeEmail(entry) === normalizedEmail);
  if (!splitAlias || emails.length < 2) return '';

  const remainingEmails = emails.filter((entry) => normalizeEmail(entry) !== normalizedEmail);
  const splitShare = Math.max(
    1,
    Math.round(normalizeCount(record.totalConversations, 1) / emails.length)
  );
  const splitMessages = Math.max(
    1,
    Math.round(normalizeCount(record.totalMessages, 1) / emails.length)
  );
  const splitLtv = Math.max(0, Math.round(normalizeCount(record.customerValue, 0) / emails.length));
  const rootName = splitAlias.split('@')[0] || record.name;
  const normalizedName = rootName
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  detail.emails = remainingEmails;
  const currentPrimary = normalizeEmail(customerState.primaryEmailByKey[normalizedKey]);
  customerState.primaryEmailByKey[normalizedKey] =
    currentPrimary && remainingEmails.some((entry) => normalizeEmail(entry) === currentPrimary)
      ? currentPrimary
      : remainingEmails[0] || '';

  record.profileCount = Math.max(1, normalizeCount(record.profileCount, emails.length) - 1);
  record.emailCoverage = remainingEmails.length;
  record.totalConversations = Math.max(
    1,
    normalizeCount(record.totalConversations, 1) - splitShare
  );
  record.totalMessages = Math.max(1, normalizeCount(record.totalMessages, 1) - splitMessages);
  record.customerValue = Math.max(0, normalizeCount(record.customerValue, 0) - splitLtv);
  record.duplicateCandidate = remainingEmails.length > 1;
  profileCounts[normalizedKey] = record.profileCount;

  const newKeyBase = normalizeKey(normalizedName) || `${normalizedKey}_split`;
  let newKey = newKeyBase;
  let index = 2;
  while (directory[newKey]) {
    newKey = `${newKeyBase}_${index}`;
    index += 1;
  }

  directory[newKey] = {
    name: normalizedName || splitAlias,
    vip: false,
    emailCoverage: 1,
    duplicateCandidate: false,
    profileCount: 1,
    customerValue: splitLtv,
    totalConversations: splitShare,
    totalMessages: splitMessages,
  };
  details[newKey] = {
    emails: [splitAlias],
    phone: '',
    mailboxes: normalizeStringArray(detail.mailboxes, normalizeMailboxLabel).slice(0, 1),
  };
  customerState.primaryEmailByKey[newKey] = splitAlias;
  profileCounts[newKey] = 1;
  return newKey;
}

function setCustomerPrimaryEmail(customerState, customerKey, email) {
  const resolvedKey = resolveCustomerKey(customerState, customerKey);
  const normalizedEmail = normalizeEmail(email);
  if (!resolvedKey || !normalizedEmail) return false;
  const detail = customerState.details?.[resolvedKey];
  if (!detail) return false;
  const existingEmail = asArray(detail.emails).find(
    (entry) => normalizeEmail(entry) === normalizedEmail
  );
  if (!existingEmail) return false;
  customerState.primaryEmailByKey = customerState.primaryEmailByKey || {};
  customerState.primaryEmailByKey[resolvedKey] = existingEmail;
  return true;
}

function dismissCustomerSuggestion(customerState, suggestionId) {
  const normalizedId = normalizeSuggestionId(suggestionId);
  if (!normalizedId) return false;
  customerState.dismissedSuggestionIds = normalizeStringArray(
    [...asArray(customerState.dismissedSuggestionIds), normalizedId],
    normalizeSuggestionId
  );
  customerState.acceptedSuggestionIds = normalizeStringArray(
    asArray(customerState.acceptedSuggestionIds).filter(
      (entry) => normalizeSuggestionId(entry) !== normalizedId
    ),
    normalizeSuggestionId
  );
  return true;
}

function acceptCustomerSuggestion(customerState, suggestionId) {
  const normalizedId = normalizeSuggestionId(suggestionId);
  if (!normalizedId) return false;
  customerState.acceptedSuggestionIds = normalizeStringArray(
    [...asArray(customerState.acceptedSuggestionIds), normalizedId],
    normalizeSuggestionId
  );
  customerState.dismissedSuggestionIds = normalizeStringArray(
    asArray(customerState.dismissedSuggestionIds).filter(
      (entry) => normalizeSuggestionId(entry) !== normalizedId
    ),
    normalizeSuggestionId
  );
  return true;
}

function applyImportedRowToCustomerState(customerState, importedRow, options = {}) {
  const strictEmail = normalizeBoolean(options.strictEmail, false);
  const directory = customerState.directory || {};
  const details = customerState.details || {};
  const profileCounts = customerState.profileCounts || {};

  if (!importedRow.name && !importedRow.emails.length) {
    return {
      action: 'invalid',
      rowNumber: importedRow.rowNumber,
      message: 'Raden saknar namn och e-postadress.',
      targetKey: '',
      matchedKeys: [],
      input: {
        rowNumber: importedRow.rowNumber,
        name: importedRow.name,
        emails: [...importedRow.emails],
        phone: importedRow.phone,
        mailboxes: [...importedRow.mailboxes],
        vip: Boolean(importedRow.vip),
        customerValue: normalizeCount(importedRow.customerValue, 0),
        totalConversations: normalizeCount(importedRow.totalConversations, 0),
        totalMessages: normalizeCount(importedRow.totalMessages, 0),
      },
    };
  }

  const matchedKeys = findMatchingCustomerKeys(customerState, importedRow, { strictEmail });
  let action = 'create';
  let targetKey = '';

  if (matchedKeys.length) {
    targetKey = matchedKeys[0];
    action = matchedKeys.length > 1 ? 'merge' : 'update';
    if (matchedKeys.length > 1) {
      mergeCustomerProfiles(customerState, targetKey, matchedKeys.slice(1));
    }
  } else {
    const keyBase = importedRow.name || importedRow.emails[0] || `row_${importedRow.rowNumber}`;
    targetKey = buildCustomerKey(keyBase, customerState);
    directory[targetKey] = {
      name: importedRow.name || importedRow.emails[0] || targetKey,
      vip: Boolean(importedRow.vip),
      emailCoverage: importedRow.emails.length,
      duplicateCandidate: importedRow.emails.length > 1,
      profileCount: Math.max(1, importedRow.emails.length || 1),
      customerValue: normalizeCount(importedRow.customerValue, 0),
      totalConversations: normalizeCount(importedRow.totalConversations, 0),
      totalMessages: normalizeCount(importedRow.totalMessages, 0),
    };
    details[targetKey] = {
      emails: [...importedRow.emails],
      phone: importedRow.phone,
      mailboxes: [...importedRow.mailboxes],
    };
    profileCounts[targetKey] = directory[targetKey].profileCount;
    if (importedRow.emails[0]) {
      customerState.primaryEmailByKey[targetKey] = importedRow.emails[0];
    }
  }

  const record = directory[targetKey];
  const detail = details[targetKey];
  record.name = normalizeText(importedRow.name) || record.name || targetKey;
  record.vip = Boolean(record.vip || importedRow.vip);
  record.customerValue = Math.max(
    normalizeCount(record.customerValue, 0),
    normalizeCount(importedRow.customerValue, 0)
  );
  record.totalConversations = Math.max(
    normalizeCount(record.totalConversations, 0),
    normalizeCount(importedRow.totalConversations, 0)
  );
  record.totalMessages = Math.max(
    normalizeCount(record.totalMessages, 0),
    normalizeCount(importedRow.totalMessages, 0)
  );
  detail.emails = normalizeStringArray(
    [...asArray(detail.emails), ...asArray(importedRow.emails)],
    normalizeEmail
  ).map(normalizeEmail);
  detail.mailboxes = normalizeStringArray(
    [...asArray(detail.mailboxes), ...asArray(importedRow.mailboxes)],
    normalizeKey
  );
  if (!normalizeText(detail.phone) && normalizeText(importedRow.phone)) {
    detail.phone = importedRow.phone;
  }
  record.emailCoverage = Math.max(normalizeCount(record.emailCoverage, 0), detail.emails.length);
  record.profileCount = Math.max(
    1,
    normalizeCount(record.profileCount, 1),
    detail.emails.length || 1
  );
  record.duplicateCandidate = detail.emails.length > 1;
  profileCounts[targetKey] = record.profileCount;
  if (!customerState.primaryEmailByKey[targetKey] && detail.emails[0]) {
    customerState.primaryEmailByKey[targetKey] = detail.emails[0];
  }

  const importName = importedRow.name || detail.emails[0] || targetKey;
  const message =
    action === 'create'
      ? `Skapar ${importName}.`
      : action === 'merge'
        ? `Slår ihop ${matchedKeys.length} profiler till ${record.name}.`
        : `Uppdaterar ${record.name}.`;

  return {
    action,
    rowNumber: importedRow.rowNumber,
    message,
    targetKey,
    matchedKeys,
    input: {
      rowNumber: importedRow.rowNumber,
      name: importedRow.name,
      emails: [...importedRow.emails],
      phone: importedRow.phone,
      mailboxes: [...importedRow.mailboxes],
      vip: Boolean(importedRow.vip),
      customerValue: normalizeCount(importedRow.customerValue, 0),
      totalConversations: normalizeCount(importedRow.totalConversations, 0),
      totalMessages: normalizeCount(importedRow.totalMessages, 0),
    },
    record: {
      name: record.name,
      emails: [...detail.emails],
      mailboxes: [...detail.mailboxes],
      vip: Boolean(record.vip),
      phone: normalizeText(detail.phone),
      customerValue: normalizeCount(record.customerValue, 0),
      totalConversations: normalizeCount(record.totalConversations, 0),
      totalMessages: normalizeCount(record.totalMessages, 0),
    },
  };
}

function findClientoBootstrapCandidateKeys(customerState, importedRow, targetKey) {
  const matches = new Set();
  const activeKeys = getActiveCustomerKeys(customerState);
  const normalizedEmails = normalizeStringArray(importedRow.emails, normalizeEmail).map(
    normalizeEmail
  );
  const normalizedPhones = normalizeStringArray(
    [...asArray(importedRow.phones), normalizeText(importedRow.phone)],
    normalizePhone
  ).map(normalizePhone);
  const normalizedTargetKey = normalizeText(targetKey).toLowerCase();

  activeKeys.forEach((customerKey) => {
    const resolvedKey = resolveCustomerKey(customerState, customerKey);
    if (!resolvedKey) return;
    const identity = normalizeIdentityEnvelope(customerState.identityByKey?.[resolvedKey] || {});
    const existingEmails = normalizeStringArray(
      asArray(customerState.details?.[resolvedKey]?.emails),
      normalizeEmail
    ).map(normalizeEmail);
    const existingPhone = normalizePhone(customerState.details?.[resolvedKey]?.phone);
    const existingTargetKey = normalizeText(resolvedKey).toLowerCase();
    const existingCanonicalId = normalizeText(identity.canonicalCustomerId).toLowerCase();

    if (existingTargetKey && existingTargetKey === normalizedTargetKey) {
      matches.add(resolvedKey);
      return;
    }

    if (existingCanonicalId && existingCanonicalId === normalizedTargetKey) {
      matches.add(resolvedKey);
      return;
    }

    if (
      normalizedEmails.some((email) =>
        existingEmails.some((candidate) => normalizeEmail(candidate) === email)
      )
    ) {
      matches.add(resolvedKey);
      return;
    }

    if (
      normalizedPhones.length &&
      existingPhone &&
      normalizedPhones.some((phone) => normalizePhone(existingPhone) === phone)
    ) {
      matches.add(resolvedKey);
    }
  });

  return Array.from(matches).filter(Boolean);
}

function buildClientoIdentityEnvelope(
  customerState,
  targetKey,
  importedRow,
  { certainty = 'review' } = {}
) {
  const seed = buildClientoBootstrapSeed(importedRow);
  const canonicalCustomerId = targetKey || buildClientoCanonicalCustomerId(importedRow);
  const sourceRecordId = buildBootstrapSourceRecordId(importedRow, 'cliento');
  const primaryEmail =
    normalizeStringArray(importedRow.emails, normalizeEmail).map(normalizeEmail)[0] || '';
  const primaryPhone =
    normalizeStringArray(
      [...asArray(importedRow.phones), normalizeText(importedRow.phone)],
      normalizePhone
    ).map(normalizePhone)[0] || '';
  return normalizeIdentityEnvelope({
    customerKey: targetKey,
    customerName: normalizeText(importedRow.name) || primaryEmail || targetKey,
    customerEmail: primaryEmail || null,
    customerPhone: primaryPhone || null,
    canonicalCustomerId,
    canonicalContactId: null,
    explicitMergeGroupId: null,
    verifiedPersonalEmailNormalized: primaryEmail || null,
    verifiedPhoneE164: primaryPhone || null,
    identitySource: 'cliento',
    identityConfidence: certainty,
    hardConflictSignals: [],
    provenance: {
      source: 'cliento',
      mailboxIds: normalizeStringArray(importedRow.mailboxes, normalizeMailboxLabel),
      conversationIds: [],
      sourceRecordIds: [sourceRecordId],
      bootstrapSeed: seed,
    },
  });
}

function applyClientoImportedRowToCustomerState(customerState, importedRow, options = {}) {
  const directory = customerState.directory || {};
  const details = customerState.details || {};
  const profileCounts = customerState.profileCounts || {};

  const bootstrapSeed = buildClientoBootstrapSeed(importedRow);
  if (!bootstrapSeed) {
    return {
      action: 'invalid',
      rowNumber: importedRow.rowNumber,
      message: 'Raden saknar verifierbara bootstrap-fält.',
      targetKey: '',
      matchedKeys: [],
      input: {
        rowNumber: importedRow.rowNumber,
        name: importedRow.name,
        emails: [...importedRow.emails],
        phones: [...asArray(importedRow.phones)],
        personnummer: '',
      },
    };
  }

  const derivedKey = buildClientoCanonicalCustomerId(importedRow);
  let targetKey = derivedKey;
  const candidateKeys = findClientoBootstrapCandidateKeys(customerState, importedRow, targetKey);
  let action = 'create';
  const hasBootstrapPersonnummer = Boolean(normalizePersonnummer(importedRow.personnummer));
  const hasBootstrapEmail = normalizeStringArray(importedRow.emails, normalizeEmail).length > 0;
  const hasBootstrapPhone =
    normalizeStringArray(
      [...asArray(importedRow.phones), normalizeText(importedRow.phone)],
      normalizePhone
    ).length > 0;
  const bootstrapMode = hasBootstrapPersonnummer
    ? 'personnummer'
    : hasBootstrapEmail && hasBootstrapPhone
      ? 'email_phone'
      : hasBootstrapEmail
        ? 'email'
        : 'phone';

  if (candidateKeys.length === 1) {
    targetKey = candidateKeys[0];
    action = 'update';
  } else if (candidateKeys.length > 1) {
    action = 'review';
  }

  if (action === 'review') {
    const reviewPairId = buildClientoReviewPairId(targetKey, candidateKeys, {
      ...importedRow,
      sourceSystem: 'cliento',
    });
    if (!hasMergeReviewDecision(customerState, reviewPairId)) {
      recordMergeReviewDecision(customerState, {
        pairId: reviewPairId,
        decision: 'review_required',
        decidedBy: 'system',
        reasonCode: 'cliento_import_conflict',
        signalSnapshot: {
          sourceSystem: 'cliento',
          bootstrapMode,
          candidateCount: candidateKeys.length,
          emails: normalizeStringArray(importedRow.emails, normalizeEmail).map(normalizeEmail),
          phones: normalizeStringArray(
            [...asArray(importedRow.phones), normalizeText(importedRow.phone)],
            normalizePhone
          ).map(normalizePhone),
        },
        identitySnapshot: {
          targetKey,
          candidates: candidateKeys,
        },
      });
    }
  }

  if (!directory[targetKey]) {
    directory[targetKey] = {
      name: normalizeText(importedRow.name) || targetKey,
      vip: Boolean(importedRow.vip),
      emailCoverage: importedRow.emails.length,
      duplicateCandidate: false,
      profileCount: 1,
      customerValue: normalizeCount(importedRow.customerValue, 0),
      totalConversations: normalizeCount(importedRow.totalConversations, 0),
      totalMessages: normalizeCount(importedRow.totalMessages, 0),
    };
  }
  if (!details[targetKey]) {
    details[targetKey] = {
      emails: [],
      phone: '',
      mailboxes: [],
    };
  }

  const record = directory[targetKey];
  const detail = details[targetKey];
  record.name = normalizeText(importedRow.name) || record.name || targetKey;
  record.vip = Boolean(record.vip || importedRow.vip);
  record.customerValue = Math.max(
    normalizeCount(record.customerValue, 0),
    normalizeCount(importedRow.customerValue, 0)
  );
  record.totalConversations = Math.max(
    normalizeCount(record.totalConversations, 0),
    normalizeCount(importedRow.totalConversations, 0)
  );
  record.totalMessages = Math.max(
    normalizeCount(record.totalMessages, 0),
    normalizeCount(importedRow.totalMessages, 0)
  );
  detail.emails = normalizeStringArray(
    [...asArray(detail.emails), ...asArray(importedRow.emails)],
    normalizeEmail
  ).map(normalizeEmail);
  detail.mailboxes = normalizeStringArray(
    [...asArray(detail.mailboxes), ...asArray(importedRow.mailboxes)],
    normalizeKey
  );
  if (!normalizeText(detail.phone) && normalizeText(importedRow.phone)) {
    detail.phone = importedRow.phone;
  }

  record.emailCoverage = Math.max(normalizeCount(record.emailCoverage, 0), detail.emails.length);
  record.profileCount = Math.max(
    1,
    normalizeCount(record.profileCount, 1),
    detail.emails.length || 1
  );
  record.duplicateCandidate = detail.emails.length > 1;
  profileCounts[targetKey] = record.profileCount;
  if (!customerState.primaryEmailByKey) {
    customerState.primaryEmailByKey = {};
  }
  if (!customerState.primaryEmailByKey[targetKey] && detail.emails[0]) {
    customerState.primaryEmailByKey[targetKey] = detail.emails[0];
  }

  customerState.identityByKey = customerState.identityByKey || {};
  const hasPersonnummer = Boolean(normalizePersonnummer(importedRow.personnummer));
  const hasEmail = normalizeStringArray(importedRow.emails, normalizeEmail).length > 0;
  const hasPhone =
    normalizeStringArray(
      [...asArray(importedRow.phones), normalizeText(importedRow.phone)],
      normalizePhone
    ).length > 0;
  const certainty = hasPersonnummer || (hasEmail && hasPhone) ? 'strong' : 'review';
  customerState.identityByKey[targetKey] = buildClientoIdentityEnvelope(
    customerState,
    targetKey,
    importedRow,
    {
      certainty,
    }
  );

  const importName = importedRow.name || detail.emails[0] || targetKey;
  const message =
    action === 'create'
      ? `Skapar ${importName}.`
      : action === 'review'
        ? `Markerar ${importName} för review.`
        : `Uppdaterar ${record.name}.`;

  return {
    action,
    rowNumber: importedRow.rowNumber,
    message,
    targetKey,
    matchedKeys: candidateKeys,
    input: {
      rowNumber: importedRow.rowNumber,
      name: importedRow.name,
      emails: [...importedRow.emails],
      phones: [...asArray(importedRow.phones)],
      personnummer: '',
      vip: Boolean(importedRow.vip),
      customerValue: normalizeCount(importedRow.customerValue, 0),
      totalConversations: normalizeCount(importedRow.totalConversations, 0),
      totalMessages: normalizeCount(importedRow.totalMessages, 0),
    },
    record: {
      name: record.name,
      emails: [...detail.emails],
      mailboxes: [...detail.mailboxes],
      vip: Boolean(record.vip),
      phone: normalizeText(detail.phone),
      customerValue: normalizeCount(record.customerValue, 0),
      totalConversations: normalizeCount(record.totalConversations, 0),
      totalMessages: normalizeCount(record.totalMessages, 0),
      canonicalCustomerId: normalizeText(
        customerState.identityByKey[targetKey]?.canonicalCustomerId
      ),
      identitySource: normalizeText(customerState.identityByKey[targetKey]?.identitySource),
      identityConfidence: normalizeText(customerState.identityByKey[targetKey]?.identityConfidence),
    },
  };
}

function buildImportSummary(previewRows = [], format = 'json', fileName = '') {
  const summary = {
    format,
    fileName: normalizeText(fileName),
    totalRows: previewRows.length,
    validRows: 0,
    created: 0,
    updated: 0,
    merged: 0,
    review: 0,
    invalid: 0,
    rows: previewRows,
  };

  previewRows.forEach((row) => {
    if (row.action === 'create') summary.created += 1;
    else if (row.action === 'update') summary.updated += 1;
    else if (row.action === 'merge') summary.merged += 1;
    else if (row.action === 'review') summary.review += 1;
    else summary.invalid += 1;
  });
  summary.validRows = summary.created + summary.updated + summary.merged + summary.review;
  return summary;
}

function buildCustomerImportCoverageReadout(customerState = {}) {
  const normalizedState = normalizeCustomerState(customerState);
  const identityByKey = asObject(normalizedState.identityByKey);
  const reviewDecisionMap = asObject(normalizedState.mergeReviewDecisionsByPairId);
  const directory = asObject(normalizedState.directory);
  const primaryEmailByKey = asObject(normalizedState.primaryEmailByKey);
  const identityEntries = Object.values(identityByKey);
  const canonicalCount = identityEntries.filter((entry) =>
    Boolean(
      normalizeText(entry?.canonicalCustomerId) ||
      normalizeText(entry?.canonicalContactId) ||
      normalizeText(entry?.explicitMergeGroupId)
    )
  ).length;
  const sourceCounts = identityEntries.reduce((acc, entry) => {
    const source = normalizeText(entry?.identitySource).toLowerCase() || 'unknown';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  const reviewRequiredCount = Object.values(reviewDecisionMap).filter(
    (entry) => normalizeMergeReviewDecisionValue(entry?.decision) === 'review_required'
  ).length;

  return {
    customerCount: Object.keys(directory).length,
    identityCount: identityEntries.length,
    canonicalCount,
    primaryEmailCount: Object.keys(primaryEmailByKey).length,
    reviewDecisionCount: Object.keys(reviewDecisionMap).length,
    reviewRequiredCount,
    sourceCounts,
  };
}

function planCustomerImport({
  customerState,
  importText,
  rows,
  binaryBase64 = '',
  fileName,
  defaultMailboxId = '',
  sourceSystem = '',
}) {
  const baseState = cloneCustomerState(customerState);
  const { format, rows: parsedRows } = parseCustomerImportRows({
    text: importText,
    rows,
    binaryBase64,
    fileName,
    defaultMailboxId,
  });
  const strictEmail = normalizeBoolean(
    baseState.customerSettings?.strict_email,
    DEFAULT_CUSTOMER_SETTINGS.strict_email
  );
  const normalizedSourceSystem = normalizeText(sourceSystem).toLowerCase();
  const previewRows = parsedRows.map((row) =>
    normalizedSourceSystem === 'cliento'
      ? applyClientoImportedRowToCustomerState(baseState, {
          ...row,
          sourceSystem: normalizedSourceSystem,
        })
      : applyImportedRowToCustomerState(baseState, row, { strictEmail })
  );
  const importSummary = buildImportSummary(previewRows, format, fileName);
  return {
    customerState: normalizeCustomerState(baseState),
    importSummary,
  };
}

function buildDefaultCustomerState() {
  return {
    mergedInto: {},
    dismissedSuggestionIds: [],
    acceptedSuggestionIds: [],
    mergeReviewDecisionsByPairId: {},
    identityByKey: {},
    directory: {},
    details: {},
    profileCounts: {},
    primaryEmailByKey: {},
    customerSettings: { ...DEFAULT_CUSTOMER_SETTINGS },
    updatedAt: nowIso(),
  };
}

function normalizeCustomerState(input = {}) {
  const defaults = buildDefaultCustomerState();
  return {
    mergedInto: normalizeLookup(input.mergedInto, normalizeKey),
    dismissedSuggestionIds: normalizeStringArray(
      input.dismissedSuggestionIds,
      normalizeSuggestionId
    ),
    acceptedSuggestionIds: normalizeStringArray(input.acceptedSuggestionIds, normalizeSuggestionId),
    mergeReviewDecisionsByPairId: normalizeMergeReviewDecisionMap(
      input.mergeReviewDecisionsByPairId
    ),
    identityByKey: normalizeIdentityByKey(input.identityByKey),
    directory: Object.keys(input.directory || {}).length
      ? normalizeDirectory(input.directory)
      : defaults.directory,
    details: Object.keys(input.details || {}).length
      ? normalizeDetails(input.details)
      : defaults.details,
    profileCounts: Object.keys(input.profileCounts || {}).length
      ? normalizeProfileCounts(input.profileCounts)
      : defaults.profileCounts,
    primaryEmailByKey: normalizeLookup(input.primaryEmailByKey, (value) =>
      normalizeText(value).toLowerCase()
    ),
    customerSettings: normalizeCustomerSettings(input.customerSettings),
    updatedAt: normalizeText(input.updatedAt) || nowIso(),
  };
}

function syncDerivedCustomerState(customerState) {
  const next = normalizeCustomerState(customerState);
  const directory = next.directory || {};
  const details = next.details || {};
  const activeKeys = getActiveCustomerKeys(next);

  activeKeys.forEach((customerKey) => {
    const detail = details[customerKey] || { emails: [], phone: '', mailboxes: [] };
    details[customerKey] = {
      emails: normalizeStringArray(detail.emails, normalizeEmail).map(normalizeEmail),
      phone: normalizeText(detail.phone),
      mailboxes: normalizeStringArray(detail.mailboxes, normalizeMailboxLabel),
    };

    const directoryEntry = directory[customerKey] || {
      name: customerKey,
      vip: false,
      emailCoverage: 0,
      duplicateCandidate: false,
      profileCount: 1,
      customerValue: 0,
      totalConversations: 0,
      totalMessages: 0,
    };
    directory[customerKey] = directoryEntry;
    directoryEntry.name =
      normalizeText(directoryEntry.name) || details[customerKey].emails[0] || customerKey;
    directoryEntry.emailCoverage = Math.max(
      normalizeCount(directoryEntry.emailCoverage, 0),
      details[customerKey].emails.length
    );
    directoryEntry.profileCount = Math.max(
      1,
      normalizeCount(directoryEntry.profileCount, 1),
      details[customerKey].emails.length || 1
    );
    directoryEntry.duplicateCandidate = Boolean(
      directoryEntry.duplicateCandidate || details[customerKey].emails.length > 1
    );

    const preferredPrimary = normalizeEmail(next.primaryEmailByKey[customerKey]);
    if (
      preferredPrimary &&
      details[customerKey].emails.some((email) => normalizeEmail(email) === preferredPrimary)
    ) {
      next.primaryEmailByKey[customerKey] = preferredPrimary;
    } else if (details[customerKey].emails[0]) {
      next.primaryEmailByKey[customerKey] = details[customerKey].emails[0];
    } else {
      delete next.primaryEmailByKey[customerKey];
    }
    next.profileCounts[customerKey] = directoryEntry.profileCount;
    next.identityByKey = next.identityByKey || {};
    next.identityByKey[customerKey] = buildIdentityEnvelopeFromRecord(next, customerKey);
  });

  return next;
}

function createIdentityRecord(customerState, customerKey) {
  const resolvedKey = resolveCustomerKey(customerState, customerKey);
  const directoryEntry = customerState.directory?.[resolvedKey] || {};
  const detailEntry = customerState.details?.[resolvedKey] || {};
  return {
    key: resolvedKey,
    name: normalizeText(directoryEntry.name),
    emails: normalizeStringArray(detailEntry.emails, normalizeEmail).map(normalizeEmail),
    phone: normalizePhone(detailEntry.phone),
    mailboxes: normalizeStringArray(detailEntry.mailboxes, normalizeMailboxLabel),
    profileCount: Math.max(
      1,
      normalizeCount(
        customerState.profileCounts?.[resolvedKey],
        normalizeCount(directoryEntry.profileCount, 1)
      )
    ),
    identity: buildIdentityEnvelopeFromRecord(customerState, resolvedKey),
  };
}

function buildCustomerIdentitySuggestions(customerState) {
  const nextState = syncDerivedCustomerState(customerState);
  const activeKeys = getActiveCustomerKeys(nextState);
  const groups = Object.fromEntries(activeKeys.map((key) => [key, []]));
  const pairSuggestions = [];

  activeKeys.forEach((customerKey) => {
    if (nextState.directory[customerKey]) {
      nextState.directory[customerKey].duplicateCandidate = Boolean(
        nextState.details?.[customerKey]?.emails?.length > 1
      );
    }
  });

  for (let index = 0; index < activeKeys.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < activeKeys.length; compareIndex += 1) {
      const primaryKey = activeKeys[index];
      const secondaryKey = activeKeys[compareIndex];
      const primaryRecord = createIdentityRecord(nextState, primaryKey);
      const secondaryRecord = createIdentityRecord(nextState, secondaryKey);
      const disposition = determineMergeDisposition(primaryRecord, secondaryRecord, nextState);
      if (disposition.decision === 'DO_NOT_MERGE' || !disposition.pairId) continue;
      const pairId = disposition.pairId;
      const decision = disposition.decision;
      const scoreSnapshot = disposition.scoreSnapshot || {};
      const pairReview = {
        id: pairId,
        pairId,
        decision,
        confidence: Math.min(
          98,
          decision === 'AUTO_MERGE' ? 98 : Math.max(30, normalizeCount(scoreSnapshot.score, 0))
        ),
        score: normalizeCount(scoreSnapshot.score, 0),
        reasons: normalizeStringArray(scoreSnapshot.reasons, normalizeText),
        signalSnapshot: {
          score: normalizeCount(scoreSnapshot.score, 0),
          categories: normalizeStringArray(scoreSnapshot.categories, normalizeText),
          identityAdjacent: normalizeCount(scoreSnapshot.identityAdjacent, 0),
          provenance: normalizeCount(scoreSnapshot.provenance, 0),
          operational: normalizeCount(scoreSnapshot.operational, 0),
          contactIdentitySignal: Boolean(scoreSnapshot.contactIdentitySignal),
        },
        identitySnapshot: {
          primary: primaryRecord.identity,
          secondary: secondaryRecord.identity,
        },
      };
      if (isMergeReviewDecisionDismissed(nextState, pairId)) continue;
      const suggestionPayload = {
        ...pairReview,
      };
      pairSuggestions.push({
        pairId,
        suggestionPayload,
      });
      groups[primaryKey].push({
        ...suggestionPayload,
        primaryKey,
        secondaryKey,
        name: secondaryRecord.name || secondaryKey,
      });
      groups[secondaryKey].push({
        ...suggestionPayload,
        primaryKey: secondaryKey,
        secondaryKey: primaryKey,
        name: primaryRecord.name || primaryKey,
      });
      nextState.directory[primaryKey].duplicateCandidate = true;
      nextState.directory[secondaryKey].duplicateCandidate = true;
    }
  }

  const duplicateCount = pairSuggestions.length;
  return {
    customerState: nextState,
    suggestionGroups: groups,
    duplicateCount: Math.max(0, Math.round(duplicateCount)),
  };
}

function findCustomerKeyByEmails(customerState, emails = []) {
  const normalizedEmails = normalizeStringArray(emails, normalizeEmail).map(normalizeEmail);
  if (!normalizedEmails.length) return '';
  const activeKeys = getActiveCustomerKeys(customerState);
  for (const customerKey of activeKeys) {
    const detail = customerState.details?.[resolveCustomerKey(customerState, customerKey)];
    if (!detail) continue;
    const existingEmails = normalizeStringArray(detail.emails, normalizeEmail).map(normalizeEmail);
    if (
      normalizedEmails.some((email) =>
        existingEmails.some((candidate) => normalizeEmail(candidate) === normalizeEmail(email))
      )
    ) {
      return resolveCustomerKey(customerState, customerKey);
    }
  }
  return '';
}

function mergeHistoryProfilesIntoCustomerState(customerState, historyProfiles = []) {
  const nextState = syncDerivedCustomerState(customerState);
  const directory = nextState.directory || {};
  const details = nextState.details || {};
  const profileCounts = nextState.profileCounts || {};
  nextState.primaryEmailByKey = nextState.primaryEmailByKey || {};

  asArray(historyProfiles).forEach((profile) => {
    const emails = normalizeStringArray(profile.emails, normalizeEmail).map(normalizeEmail);
    if (!emails.length) return;

    const matchedKey = findCustomerKeyByEmails(nextState, emails);
    const targetKey = matchedKey || buildCustomerKey(profile.customerEmail || emails[0], nextState);
    if (!directory[targetKey]) {
      directory[targetKey] = {
        name: normalizeText(profile.name) || emails[0],
        vip: false,
        emailCoverage: 0,
        duplicateCandidate: false,
        profileCount: Math.max(1, emails.length),
        customerValue: 0,
        totalConversations: 0,
        totalMessages: 0,
      };
    }
    if (!details[targetKey]) {
      details[targetKey] = {
        emails: [],
        phone: '',
        mailboxes: [],
      };
    }

    const detail = details[targetKey];
    detail.emails = normalizeStringArray(
      [...asArray(detail.emails), ...emails],
      normalizeEmail
    ).map(normalizeEmail);
    detail.mailboxes = normalizeStringArray(
      [
        ...asArray(detail.mailboxes),
        ...asArray(profile.mailboxes).map((mailboxId) =>
          normalizeMailboxLabel(deriveMailboxLabel(mailboxId) || mailboxId)
        ),
      ],
      normalizeMailboxLabel
    );

    const directoryEntry = directory[targetKey];
    const displayName = normalizeText(profile.name);
    if (!normalizeText(directoryEntry.name) || normalizeText(directoryEntry.name) === targetKey) {
      directoryEntry.name = displayName || detail.emails[0] || targetKey;
    }
    directoryEntry.emailCoverage = Math.max(
      normalizeCount(directoryEntry.emailCoverage, 0),
      detail.emails.length
    );
    directoryEntry.profileCount = Math.max(
      1,
      normalizeCount(directoryEntry.profileCount, 1),
      normalizeCount(profile.profileCount, emails.length || 1),
      detail.emails.length || 1
    );
    directoryEntry.totalConversations = Math.max(
      normalizeCount(directoryEntry.totalConversations, 0),
      normalizeCount(profile.totalConversations, 0)
    );
    directoryEntry.totalMessages = Math.max(
      normalizeCount(directoryEntry.totalMessages, 0),
      normalizeCount(profile.totalMessages, 0)
    );
    directoryEntry.duplicateCandidate = detail.emails.length > 1;
    profileCounts[targetKey] = directoryEntry.profileCount;

    if (!nextState.primaryEmailByKey[targetKey] && detail.emails[0]) {
      nextState.primaryEmailByKey[targetKey] = detail.emails[0];
    }
  });

  return syncDerivedCustomerState(nextState);
}

async function createCcoCustomerStore({ filePath, historyStore = null }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoCustomerStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    tenants: state && typeof state.tenants === 'object' && state.tenants ? state.tenants : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function materializeTenantCustomerState({ tenantId, customerState = null }) {
    const tenantState = ensureTenantState(tenantId);
    const baseState =
      customerState && typeof customerState === 'object'
        ? syncDerivedCustomerState(customerState)
        : syncDerivedCustomerState(tenantState.customerState);

    if (!historyStore || typeof historyStore.listDerivedCustomerProfiles !== 'function') {
      return buildCustomerIdentitySuggestions(baseState).customerState;
    }

    const historyProfiles = await historyStore.listDerivedCustomerProfiles({
      tenantId,
    });
    return buildCustomerIdentitySuggestions(
      mergeHistoryProfilesIntoCustomerState(baseState, historyProfiles)
    ).customerState;
  }

  function ensureTenantState(tenantId) {
    const normalizedTenantId = normalizeText(tenantId);
    if (!normalizedTenantId) {
      throw new Error('tenantId krävs.');
    }
    if (!state.tenants[normalizedTenantId]) {
      state.tenants[normalizedTenantId] = {
        customerState: buildDefaultCustomerState(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }
    const tenantState = state.tenants[normalizedTenantId];
    tenantState.customerState = normalizeCustomerState(tenantState.customerState);
    return tenantState;
  }

  async function getTenantCustomerState({ tenantId }) {
    const customerState = await materializeTenantCustomerState({ tenantId });
    return JSON.parse(JSON.stringify(customerState));
  }

  async function peekTenantCustomerState({ tenantId }) {
    const tenantState = ensureTenantState(tenantId);
    return JSON.parse(JSON.stringify(tenantState.customerState));
  }

  async function previewTenantCustomerIdentity({ tenantId, customerState = null }) {
    const baseState = await materializeTenantCustomerState({ tenantId, customerState });
    const payload = buildCustomerIdentitySuggestions(baseState);
    return JSON.parse(JSON.stringify(payload));
  }

  async function saveTenantCustomerState({ tenantId, customerState }) {
    const tenantState = ensureTenantState(tenantId);
    const nextCustomerState = await materializeTenantCustomerState({
      tenantId,
      customerState,
    });
    const currentCustomerState = normalizeCustomerState(tenantState.customerState);
    if (isDeepStrictEqual(currentCustomerState, nextCustomerState)) {
      return JSON.parse(JSON.stringify(currentCustomerState));
    }
    tenantState.customerState = nextCustomerState;
    tenantState.updatedAt = nowIso();
    await save();
    return JSON.parse(JSON.stringify(tenantState.customerState));
  }

  async function previewTenantCustomerImport({
    tenantId,
    importText,
    rows = null,
    binaryBase64 = '',
    fileName,
    defaultMailboxId = '',
    sourceSystem = '',
  }) {
    const planned = planCustomerImport({
      customerState: await materializeTenantCustomerState({ tenantId }),
      importText,
      rows,
      binaryBase64,
      fileName,
      defaultMailboxId,
      sourceSystem,
    });
    return JSON.parse(
      JSON.stringify({
        ...planned.importSummary,
        coverageReadout: buildCustomerImportCoverageReadout(planned.customerState),
      })
    );
  }

  async function commitTenantCustomerImport({
    tenantId,
    importText,
    rows = null,
    binaryBase64 = '',
    fileName,
    defaultMailboxId = '',
    sourceSystem = '',
  }) {
    const tenantState = ensureTenantState(tenantId);
    const planned = planCustomerImport({
      customerState: await materializeTenantCustomerState({ tenantId }),
      importText,
      rows,
      binaryBase64,
      fileName,
      defaultMailboxId,
      sourceSystem,
    });
    if (!planned.importSummary.validRows) {
      return {
        customerState: JSON.parse(JSON.stringify(tenantState.customerState)),
        importSummary: JSON.parse(JSON.stringify(planned.importSummary)),
        coverageReadout: buildCustomerImportCoverageReadout(tenantState.customerState),
      };
    }
    tenantState.customerState = buildCustomerIdentitySuggestions(
      planned.customerState
    ).customerState;
    tenantState.updatedAt = nowIso();
    await save();
    return {
      customerState: JSON.parse(JSON.stringify(tenantState.customerState)),
      importSummary: JSON.parse(JSON.stringify(planned.importSummary)),
      coverageReadout: buildCustomerImportCoverageReadout(tenantState.customerState),
    };
  }

  async function getTenantCustomerImportCoverageReadout({ tenantId }) {
    const customerState = await materializeTenantCustomerState({ tenantId });
    return JSON.parse(JSON.stringify(buildCustomerImportCoverageReadout(customerState)));
  }

  async function mergeTenantCustomerProfiles({
    tenantId,
    customerState = null,
    primaryKey,
    secondaryKeys,
    suggestionId = '',
    options = {},
  }) {
    const tenantState = ensureTenantState(tenantId);
    const nextState = await materializeTenantCustomerState({ tenantId, customerState });
    const resolvedPrimary = resolveCustomerKey(nextState, primaryKey);
    const resolvedSecondaryKeys = asArray(secondaryKeys)
      .map((entry) => resolveCustomerKey(nextState, entry))
      .filter((entry) => entry && entry !== resolvedPrimary);
    if (!resolvedPrimary || !resolvedSecondaryKeys.length) {
      throw new Error('Minst två kundprofiler krävs för att slå ihop.');
    }
    const primaryRecord = createIdentityRecord(nextState, resolvedPrimary);
    const dispositionChecks = resolvedSecondaryKeys.map((resolvedSecondary) => {
      const secondaryRecord = createIdentityRecord(nextState, resolvedSecondary);
      return {
        ...determineMergeDisposition(primaryRecord, secondaryRecord, nextState),
        secondaryRecordIdentity: secondaryRecord.identity,
      };
    });
    if (dispositionChecks.some((entry) => entry.decision === 'DO_NOT_MERGE')) {
      throw new Error('Kunde inte slå ihop kundprofilerna på grund av identitetskonflikt.');
    }
    mergeCustomerProfiles(nextState, resolvedPrimary, resolvedSecondaryKeys, options);
    dispositionChecks.forEach((entry) => {
      if (!entry.pairId) return;
      recordMergeReviewDecision(nextState, {
        pairId: entry.pairId,
        decision: 'approved',
        decidedBy: 'system',
        reasonCode: 'manual_merge',
        signalSnapshot: {
          score: normalizeCount(entry.scoreSnapshot?.score, 0),
          categories: normalizeStringArray(entry.scoreSnapshot?.categories, normalizeText),
          identityAdjacent: normalizeCount(entry.scoreSnapshot?.identityAdjacent, 0),
          provenance: normalizeCount(entry.scoreSnapshot?.provenance, 0),
          operational: normalizeCount(entry.scoreSnapshot?.operational, 0),
          contactIdentitySignal: Boolean(entry.scoreSnapshot?.contactIdentitySignal),
        },
        identitySnapshot: {
          primary: primaryRecord.identity,
          secondary: entry.secondaryRecordIdentity || {},
        },
      });
    });
    if (suggestionId) {
      acceptCustomerSuggestion(nextState, suggestionId);
    }
    const payload = buildCustomerIdentitySuggestions(nextState);
    tenantState.customerState = payload.customerState;
    tenantState.updatedAt = nowIso();
    await save();
    return JSON.parse(JSON.stringify(payload));
  }

  async function splitTenantCustomerProfile({
    tenantId,
    customerState = null,
    customerKey,
    email,
  }) {
    const tenantState = ensureTenantState(tenantId);
    const nextState = await materializeTenantCustomerState({ tenantId, customerState });
    const newKey = splitCustomerProfile(nextState, customerKey, email);
    if (!newKey) {
      throw new Error('Kunde inte dela upp kundprofilen.');
    }
    const payload = buildCustomerIdentitySuggestions(nextState);
    tenantState.customerState = payload.customerState;
    tenantState.updatedAt = nowIso();
    await save();
    return JSON.parse(JSON.stringify({ ...payload, newKey }));
  }

  async function setTenantCustomerPrimaryEmail({
    tenantId,
    customerState = null,
    customerKey,
    email,
  }) {
    const tenantState = ensureTenantState(tenantId);
    const nextState = await materializeTenantCustomerState({ tenantId, customerState });
    if (!setCustomerPrimaryEmail(nextState, customerKey, email)) {
      throw new Error('Kunde inte sätta primär e-post.');
    }
    const payload = buildCustomerIdentitySuggestions(nextState);
    tenantState.customerState = payload.customerState;
    tenantState.updatedAt = nowIso();
    await save();
    return JSON.parse(JSON.stringify(payload));
  }

  async function dismissTenantCustomerSuggestion({ tenantId, customerState = null, suggestionId }) {
    const tenantState = ensureTenantState(tenantId);
    const nextState = await materializeTenantCustomerState({ tenantId, customerState });
    const preview = buildCustomerIdentitySuggestions(nextState);
    const matchingSuggestion = Object.values(preview.suggestionGroups || {})
      .flatMap((group) => asArray(group))
      .find(
        (entry) =>
          normalizeText(entry?.pairId || entry?.id).toLowerCase() ===
          normalizeText(suggestionId).toLowerCase()
      );
    if (!dismissCustomerSuggestion(nextState, matchingSuggestion?.pairId || suggestionId)) {
      throw new Error('Förslaget kunde inte markeras.');
    }
    recordMergeReviewDecision(nextState, {
      pairId: normalizeText(matchingSuggestion?.pairId || suggestionId).toLowerCase(),
      decision: 'dismissed',
      decidedBy: 'system',
      reasonCode: 'manual_dismiss',
      signalSnapshot: matchingSuggestion?.signalSnapshot || {},
      identitySnapshot: matchingSuggestion?.identitySnapshot || {},
    });
    const payload = buildCustomerIdentitySuggestions(nextState);
    tenantState.customerState = payload.customerState;
    tenantState.updatedAt = nowIso();
    await save();
    return JSON.parse(JSON.stringify(payload));
  }

  return {
    getTenantCustomerState,
    peekTenantCustomerState,
    previewTenantCustomerIdentity,
    saveTenantCustomerState,
    previewTenantCustomerImport,
    commitTenantCustomerImport,
    getTenantCustomerImportCoverageReadout,
    mergeTenantCustomerProfiles,
    splitTenantCustomerProfile,
    setTenantCustomerPrimaryEmail,
    dismissTenantCustomerSuggestion,
  };
}

module.exports = {
  createCcoCustomerStore,
};
