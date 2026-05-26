const { classifyConversationMessage } = require('../../intelligence/messageClassification');
const { runDeterministicIntent } = require('../../intelligence/intentClassifier');
const { FILTER_VERSION, MATCH_VERSION, PROCESSOR_VERSION } = require('./constants');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

const RISKY_ATTACHMENT_TYPES = /\.(exe|bat|cmd|scr|js|vbs|zip|rar|7z)$/i;

function evaluateSourceFilter(rawMessage = {}) {
  const folderType = normalizeText(rawMessage.folderType).toLowerCase();
  const enabledFolders = new Set(['inbox']);
  if (!enabledFolders.has(folderType)) {
    return {
      allowed: false,
      reason: `folder_${folderType || 'unknown'}_disabled`,
    };
  }
  return { allowed: true, reason: 'inbox_enabled' };
}

function evaluateSecurityFilter(rawMessage = {}) {
  const haystack = [rawMessage.subject, rawMessage.bodyPreview, rawMessage.fromEmail]
    .map((item) => normalizeText(item).toLowerCase())
    .join(' ');
  const suspiciousLink = /https?:\/\/[^\s]+/i.test(haystack) && /bit\.ly|tinyurl|t\.co/i.test(haystack);
  const riskyAttachment =
    rawMessage.hasAttachments === true &&
    RISKY_ATTACHMENT_TYPES.test(normalizeText(rawMessage.subject));
  if (suspiciousLink || riskyAttachment) {
    return {
      passed: false,
      needsReview: true,
      reason: suspiciousLink ? 'suspicious_link' : 'risky_attachment_signal',
    };
  }
  return { passed: true, needsReview: false, reason: 'clean' };
}

function classifyMailType(rawMessage = {}) {
  const text = [rawMessage.subject, rawMessage.bodyPreview, rawMessage.bodyText]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join('\n');
  const intent = runDeterministicIntent(text);
  const messageClassification = classifyConversationMessage({
    subject: rawMessage.subject,
    inboundPreview: rawMessage.bodyPreview,
    sender: rawMessage.fromEmail,
    intent: intent.intent,
  });
  if (messageClassification === 'system_mail') {
    return {
      mailType: 'marketing',
      intent: intent.intent,
      messageClassification,
      confidence: intent.confidence,
    };
  }
  return {
    mailType: intent.intent || 'unknown',
    intent: intent.intent,
    messageClassification,
    confidence: intent.confidence,
  };
}

function matchPatientOrEntity(rawMessage = {}, { patientDirectory = [] } = {}) {
  const fromEmail = normalizeEmail(rawMessage.fromEmail);
  if (!fromEmail) {
    return {
      status: 'UNMATCHED',
      confidence: 0,
      patientId: null,
      reason: 'missing_sender_email',
    };
  }

  const candidates = asArray(patientDirectory).filter((item) => {
    const emails = [
      item?.email,
      item?.personalEmail,
      item?.verifiedPersonalEmailNormalized,
      item?.contactEmail,
    ]
      .map((value) => normalizeEmail(value))
      .filter(Boolean);
    return emails.includes(fromEmail);
  });

  if (candidates.length === 1) {
    return {
      status: 'MATCHED',
      confidence: 0.95,
      patientId: candidates[0].id || candidates[0].patientId || candidates[0].canonicalCustomerId,
      reason: 'exact_email_match',
      candidate: candidates[0],
    };
  }

  if (candidates.length > 1) {
    return {
      status: 'NEEDS_REVIEW',
      confidence: 0.45,
      patientId: null,
      reason: 'multiple_email_matches',
      candidates,
    };
  }

  return {
    status: 'UNMATCHED',
    confidence: 0,
    patientId: null,
    reason: 'no_directory_match',
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function processRawMessage({
  store,
  rawMessage = {},
  ledger = null,
  mode = 'read_only',
  patientDirectory = [],
  logger = console,
} = {}) {
  if (!store || !rawMessage?.id) {
    throw new Error('processRawMessage requires store and rawMessage.id');
  }

  let activeLedger = ledger || store.getLedgerByRawMessageId(rawMessage.id);
  if (!activeLedger) {
    throw new Error(`processing ledger missing for raw message ${rawMessage.id}`);
  }

  if (store.shouldSkipProcessing(activeLedger)) {
    return { skipped: true, reason: 'already_processed', ledger: activeLedger, rawMessage };
  }

  const attempts = Number(activeLedger.attempts || 0) + 1;
  activeLedger = await store.updateLedger(activeLedger.id, {
    attempts,
    lockedAt: new Date().toISOString(),
    processorVersion: PROCESSOR_VERSION,
    filterVersion: FILTER_VERSION,
    matchVersion: MATCH_VERSION,
  });

  try {
    const source = evaluateSourceFilter(rawMessage);
    if (!source.allowed) {
      activeLedger = await store.updateLedger(activeLedger.id, {
        status: 'DUPLICATE_SKIPPED',
        errorCode: 'source_filter_blocked',
        errorMessage: source.reason,
        completedAt: new Date().toISOString(),
      });
      await store.appendAudit({
        type: 'mail_ingestion_skipped',
        rawMessageId: rawMessage.id,
        reason: source.reason,
      });
      return { skipped: true, reason: source.reason, ledger: activeLedger, rawMessage };
    }

    const security = evaluateSecurityFilter(rawMessage);
    const classification = classifyMailType(rawMessage);
    const match = matchPatientOrEntity(rawMessage, { patientDirectory });

    let status = 'FILTERED';
    if (security.needsReview) status = 'SECURITY_REVIEW';
    else if (classification.messageClassification === 'system_mail') status = 'DUPLICATE_SKIPPED';
    else if (match.status === 'NEEDS_REVIEW') status = 'NEEDS_REVIEW';
    else if (match.status === 'MATCHED') status = 'MATCHED';
    else status = 'UNMATCHED';

    const patientMatchRecord = {
      id: `${rawMessage.id}:match`,
      rawMessageId: rawMessage.id,
      status: match.status,
      confidence: match.confidence,
      patientId: match.patientId,
      reason: match.reason,
      matchVersion: MATCH_VERSION,
      createdAt: new Date().toISOString(),
    };

    activeLedger = await store.updateLedger(activeLedger.id, {
      status,
      patientMatchStatus: match.status,
      patientId: match.patientId,
      processedAt: new Date().toISOString(),
      completedAt: ['COMPLETED', 'DUPLICATE_SKIPPED', 'MATCHED', 'UNMATCHED', 'NEEDS_REVIEW', 'SECURITY_REVIEW'].includes(
        status
      )
        ? new Date().toISOString()
        : null,
    });

    if (mode === 'active' && status === 'MATCHED' && match.patientId) {
      activeLedger = await store.updateLedger(activeLedger.id, {
        status: 'ACTION_CREATED',
        completedAt: new Date().toISOString(),
      });
    } else if (mode !== 'dry_run') {
      activeLedger = await store.updateLedger(activeLedger.id, {
        status: status === 'DUPLICATE_SKIPPED' ? 'DUPLICATE_SKIPPED' : status,
        completedAt: new Date().toISOString(),
      });
    }

    await store.appendAudit({
      type: 'mail_ingestion_processed',
      rawMessageId: rawMessage.id,
      status: activeLedger.status,
      mailType: classification.mailType,
      patientMatchStatus: match.status,
      mode,
    });

    logger?.log?.(
      `[mail-ingestion] processed raw=${rawMessage.id} status=${activeLedger.status} mailType=${classification.mailType}`
    );

    return {
      skipped: false,
      rawMessage,
      ledger: activeLedger,
      classification,
      security,
      patientMatch: patientMatchRecord,
      source,
    };
  } catch (error) {
    activeLedger = await store.updateLedger(activeLedger.id, {
      status: 'FAILED',
      errorCode: 'processing_failed',
      errorMessage: normalizeText(error?.message) || 'processing_failed',
      completedAt: new Date().toISOString(),
    });
    await store.appendAudit({
      type: 'mail_ingestion_failed',
      rawMessageId: rawMessage.id,
      error: activeLedger.errorMessage,
    });
    throw error;
  }
}

module.exports = {
  classifyMailType,
  evaluateSecurityFilter,
  evaluateSourceFilter,
  matchPatientOrEntity,
  processRawMessage,
};
