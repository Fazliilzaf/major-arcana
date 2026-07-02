const { isNonPatientCounterpartyEmail } = require('./nonPatientRules');
const {
  normalizeCounterpartyDirection,
  resolveCounterpartyIdentity,
} = require('../ccoCounterpartyTruth');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function emailLocalTokens(email = '') {
  const local = normalizeEmail(email).split('@')[0] || '';
  return local
    .replace(/[._+-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function scorePatientNameAgainstEmail(patient = {}, email = '') {
  const name = normalizeText(patient.displayName).toLowerCase();
  if (!name) return 0;
  const tokens = emailLocalTokens(email);
  if (tokens.length === 0) return 0;
  const matched = tokens.filter((token) => name.includes(token)).length;
  return matched / tokens.length;
}

function resolveRowCounterpartyEmail(row = {}) {
  const raw = row.rawMessage || {};
  const existing = normalizeEmail(row.patientMatch?.counterpartyEmail);
  if (existing) return existing;
  const folderType = normalizeText(raw.folderType).toLowerCase();
  const direction =
    folderType === 'sent' || folderType === 'drafts'
      ? 'outbound'
      : folderType === 'inbox' || folderType === 'deleted'
        ? 'inbound'
        : '';
  const counterparty = resolveCounterpartyIdentity(
    {
      from: { address: raw.fromEmail, name: raw.fromName },
      toRecipients: asArray(raw.toEmails).map((email) => ({ address: email })),
      ccRecipients: asArray(raw.ccEmails).map((email) => ({ address: email })),
    },
    { mailboxId: raw.mailboxId, direction }
  );
  return normalizeEmail(counterparty.email || raw.fromEmail) || '';
}

function groupUnmatchedRows(rows = []) {
  const groups = new Map();
  for (const row of asArray(rows)) {
    const email = resolveRowCounterpartyEmail(row);
    const key = email || `missing:${row.rawMessage?.id || row.ledger?.rawMessageId || 'unknown'}`;
    const bucket = groups.get(key) || { email, rows: [] };
    bucket.rows.push(row);
    groups.set(key, bucket);
  }
  return groups;
}

function summarizeReviewGroups(rows = []) {
  const groups = groupUnmatchedRows(rows);
  const summary = [];
  for (const [key, bucket] of groups.entries()) {
    summary.push({
      email: bucket.email || null,
      count: bucket.rows.length,
      nonPatient: bucket.email ? isNonPatientCounterpartyEmail(bucket.email) : true,
      sampleSubject: normalizeText(bucket.rows[0]?.rawMessage?.subject) || null,
      rawMessageIds: bucket.rows.map((row) => row.rawMessage?.id).filter(Boolean),
    });
  }
  return summary.sort((left, right) => right.count - left.count);
}

async function dismissRawMessages({
  ingestionStore,
  rawMessageIds = [],
  reason = 'non_patient_mail',
  actorUserId = '',
  persist = true,
} = {}) {
  if (!ingestionStore) return { dismissed: 0 };
  let dismissed = 0;
  for (const rawMessageId of asArray(rawMessageIds).filter(Boolean)) {
    const ledger = ingestionStore.getLedgerByRawMessageId(rawMessageId);
    if (!ledger || normalizeText(ledger.status) !== 'UNMATCHED') continue;
    await ingestionStore.updateLedger(
      ledger.id,
      {
        status: 'DUPLICATE_SKIPPED',
        patientMatchStatus: 'DISMISSED',
        errorCode: 'non_patient_mail',
        errorMessage: reason,
        completedAt: new Date().toISOString(),
      },
      { persist: false }
    );
    dismissed += 1;
  }
  if (dismissed > 0 && persist) {
    await ingestionStore.save();
  }
  return { dismissed };
}

async function suggestPatientForEmail({ patientMasterStore, tenantId = '', email = '' } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!patientMasterStore || !normalizedEmail || isNonPatientCounterpartyEmail(normalizedEmail)) {
    return { patient: null, method: null, confidence: 0 };
  }

  const direct = await patientMasterStore.findPatientByEmail({
    tenantId,
    email: normalizedEmail,
  });
  if (direct?.id) {
    return { patient: direct, method: 'exact_email', confidence: 1 };
  }

  const localPart = normalizedEmail.split('@')[0] || '';
  const listed = await patientMasterStore.listPatients({
    tenantId,
    query: localPart,
    limit: 20,
  });
  const candidates = asArray(listed?.patients).filter(
    (patient) => scorePatientNameAgainstEmail(patient, normalizedEmail) >= 0.75
  );
  if (candidates.length === 1) {
    return { patient: candidates[0], method: 'name_from_email', confidence: 0.8 };
  }

  return { patient: null, method: null, confidence: 0, candidateCount: candidates.length };
}

async function runUnmatchedResolutionSweep({
  ingestionStore,
  patientMasterStore = null,
  tenantId = 'hair-tp-clinic',
  mailboxEmail = '',
  actorUserId = 'system',
  autoEnrichPatientEmails = true,
  closeRemainingAsNoPatientRecord = true,
  dryRun = false,
} = {}) {
  if (!ingestionStore) {
    throw new Error('runUnmatchedResolutionSweep requires ingestionStore');
  }

  const rows = ingestionStore.listReviewQueue({
    mailboxEmail,
    statuses: ['UNMATCHED'],
    limit: 10000,
  });
  const groups = summarizeReviewGroups(rows);
  const result = {
    dryRun,
    mailboxEmail: normalizeEmail(mailboxEmail) || null,
    totalUnmatched: rows.length,
    uniqueCounterparties: groups.length,
    dismissed: 0,
    linked: 0,
    enriched: 0,
    // B2: heuristiska namn-gissningar auto-bindas aldrig — de räknas som
    // suggested och lämnas i review-kön för mänskligt beslut.
    suggested: 0,
    closedWithoutPatient: 0,
    remaining: 0,
    groups: [],
  };

  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };

  for (const group of groups) {
    const groupResult = {
      email: group.email,
      count: group.count,
      action: 'remaining',
      patientId: null,
      method: null,
    };

    if (group.nonPatient) {
      groupResult.action = 'dismiss_non_patient';
      if (!dryRun) {
        const dismissed = await dismissRawMessages({
          ingestionStore,
          rawMessageIds: group.rawMessageIds,
          reason: 'non_patient_counterparty',
          actorUserId,
          persist: false,
        });
        result.dismissed += dismissed.dismissed;
        markDirty();
      } else {
        result.dismissed += group.count;
      }
      result.groups.push(groupResult);
      continue;
    }

    if (!patientMasterStore) {
      result.remaining += group.count;
      result.groups.push(groupResult);
      continue;
    }

    const suggestion = await suggestPatientForEmail({
      patientMasterStore,
      tenantId,
      email: group.email,
    });

    if (!suggestion.patient?.id) {
      if (closeRemainingAsNoPatientRecord) {
        groupResult.action = 'closed_no_patient_record';
        if (!dryRun) {
          const dismissed = await dismissRawMessages({
            ingestionStore,
            rawMessageIds: group.rawMessageIds,
            reason: 'no_patient_record',
            actorUserId,
            persist: false,
          });
          result.closedWithoutPatient += dismissed.dismissed;
          markDirty();
        } else {
          result.closedWithoutPatient += group.count;
        }
      } else {
        result.remaining += group.count;
      }
      result.groups.push(groupResult);
      continue;
    }

    groupResult.method = suggestion.method;

    // B2 (conflict → review, aldrig auto-bind): endast en BEKRÄFTAD match —
    // verifierad exakt e-postträff — får auto-bindas. En heuristisk namn-
    // gissning (name_from_email, konfidens 0.8) är ett FÖRSLAG och får aldrig
    // bli en permanent patientkoppling utan mänskligt beslut. Den lämnas i
    // review-kön (remaining) som suggested. Ingen patient-enrichment sker
    // heller på en gissning (annars muterar vi patientdata på osäker match).
    const isConfirmedMatch =
      suggestion.method === 'exact_email' && Number(suggestion.confidence) >= 1;
    if (!isConfirmedMatch) {
      groupResult.action = 'suggested';
      groupResult.patientId = null;
      groupResult.suggestedPatientId = suggestion.patient.id;
      groupResult.suggestedMethod = suggestion.method;
      groupResult.suggestedConfidence = Number(suggestion.confidence) || 0;
      result.suggested += group.count;
      result.groups.push(groupResult);
      continue;
    }

    groupResult.patientId = suggestion.patient.id;

    if (!dryRun) {
      for (const rawMessageId of group.rawMessageIds) {
        await ingestionStore.linkPatientToMessage({
          rawMessageId,
          patientId: suggestion.patient.id,
          actorUserId,
          persist: false,
        });
      }
      markDirty();
    }
    groupResult.action = 'linked';
    result.linked += group.count;
    result.groups.push(groupResult);
  }

  if (!dryRun && dirty) {
    await ingestionStore.save();
  }

  result.remaining = Math.max(
    0,
    result.totalUnmatched - result.dismissed - result.linked - result.closedWithoutPatient
  );
  return result;
}

module.exports = {
  dismissRawMessages,
  emailLocalTokens,
  groupUnmatchedRows,
  resolveRowCounterpartyEmail,
  runUnmatchedResolutionSweep,
  scorePatientNameAgainstEmail,
  suggestPatientForEmail,
  summarizeReviewGroups,
};
