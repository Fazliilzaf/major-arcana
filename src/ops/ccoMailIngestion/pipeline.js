const { classifyConversationMessage } = require('../../intelligence/messageClassification');
const { runDeterministicIntent } = require('../../intelligence/intentClassifier');
const {
  normalizeCounterpartyDirection,
  resolveCounterpartyIdentity,
} = require('../ccoCounterpartyTruth');
const { buildPipedrivePatientLookup } = require('../ccoPatientMasterStore');
const { isNonPatientCounterpartyEmail } = require('./nonPatientRules');
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
  const enabledFolders = new Set(['inbox', 'sent', 'drafts', 'deleted']);
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
  const suspiciousLink =
    /https?:\/\/[^\s]+/i.test(haystack) && /bit\.ly|tinyurl|t\.co/i.test(haystack);
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

function resolveCounterpartyEmail(rawMessage = {}) {
  const folderType = normalizeText(rawMessage.folderType).toLowerCase();
  const direction =
    folderType === 'sent' || folderType === 'drafts'
      ? 'outbound'
      : folderType === 'inbox' || folderType === 'deleted'
        ? 'inbound'
        : normalizeCounterpartyDirection(rawMessage.direction);
  const counterparty = resolveCounterpartyIdentity(
    {
      from: { address: rawMessage.fromEmail, name: rawMessage.fromName },
      toRecipients: asArray(rawMessage.toEmails).map((email) => ({ address: email })),
      ccRecipients: asArray(rawMessage.ccEmails).map((email) => ({ address: email })),
    },
    {
      mailboxId: rawMessage.mailboxId,
      direction,
    }
  );
  return normalizeEmail(counterparty.email || rawMessage.fromEmail);
}

function matchPatientOrEntity(rawMessage = {}, { patientDirectory = [] } = {}) {
  const counterpartyEmail = resolveCounterpartyEmail(rawMessage);
  if (!counterpartyEmail) {
    return {
      status: 'UNMATCHED',
      confidence: 0,
      patientId: null,
      reason: 'missing_counterparty_email',
      candidates: [],
    };
  }

  const lookup = buildPipedrivePatientLookup(patientDirectory);
  const emailMatches = asArray(lookup.byEmail.get(counterpartyEmail));
  if (emailMatches.length === 1) {
    const patient = emailMatches[0];
    return {
      status: 'MATCHED',
      confidence: 0.95,
      patientId: patient.id || patient.patientId,
      reason: 'exact_email_match',
      counterpartyEmail,
      candidate: patient,
      candidates: [patient],
    };
  }
  if (emailMatches.length > 1) {
    return {
      status: 'NEEDS_REVIEW',
      confidence: 0.45,
      patientId: null,
      reason: 'multiple_email_matches',
      counterpartyEmail,
      candidates: emailMatches.map((patient) => ({
        patientId: patient.id || patient.patientId,
        method: 'email',
        confidence: 0.45,
        email: counterpartyEmail,
      })),
    };
  }

  return {
    status: 'UNMATCHED',
    confidence: 0,
    patientId: null,
    reason: 'no_directory_match',
    counterpartyEmail,
    candidates: [],
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
  persist = true,
  documentTriage = null,
  tenantId = '',
  healthDeclarationIngest = null,
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
  activeLedger = await store.updateLedger(
    activeLedger.id,
    {
      attempts,
      lockedAt: new Date().toISOString(),
      processorVersion: PROCESSOR_VERSION,
      filterVersion: FILTER_VERSION,
      matchVersion: MATCH_VERSION,
    },
    { persist }
  );

  try {
    const source = evaluateSourceFilter(rawMessage);
    if (!source.allowed) {
      activeLedger = await store.updateLedger(
        activeLedger.id,
        {
          status: 'DUPLICATE_SKIPPED',
          errorCode: 'source_filter_blocked',
          errorMessage: source.reason,
          completedAt: new Date().toISOString(),
        },
        { persist }
      );
      await store.appendAudit(
        {
          type: 'mail_ingestion_skipped',
          rawMessageId: rawMessage.id,
          reason: source.reason,
        },
        { persist }
      );
      return { skipped: true, reason: source.reason, ledger: activeLedger, rawMessage };
    }

    if (
      healthDeclarationIngest &&
      typeof healthDeclarationIngest.isHalsoFormMessage === 'function' &&
      healthDeclarationIngest.isHalsoFormMessage(rawMessage)
    ) {
      const hdResult = await healthDeclarationIngest.processRawMessage({
        rawMessage,
        mode,
        tenantId: tenantId || 'hair-tp-clinic',
        store,
        ledger: activeLedger,
        persist,
      });
      const formType = hdResult.parsed?.formType || 'health_declaration';
      return {
        ...hdResult,
        ledger: store.getLedgerByRawMessageId(rawMessage.id) || activeLedger,
        classification: {
          mailType: formType,
          intent: formType,
          messageClassification: 'patient_form',
          confidence: 1,
        },
        source,
      };
    }

    const security = evaluateSecurityFilter(rawMessage);
    const classification = classifyMailType(rawMessage);
    const counterpartyEmail = resolveCounterpartyEmail(rawMessage);
    if (isNonPatientCounterpartyEmail(counterpartyEmail)) {
      activeLedger = await store.updateLedger(
        activeLedger.id,
        {
          status: 'DUPLICATE_SKIPPED',
          patientMatchStatus: 'DISMISSED',
          errorCode: 'non_patient_mail',
          errorMessage: 'non_patient_counterparty',
          processedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        { persist }
      );
      await store.appendAudit(
        {
          type: 'mail_ingestion_dismissed_non_patient',
          rawMessageId: rawMessage.id,
          counterpartyEmail,
        },
        { persist }
      );
      return {
        skipped: true,
        reason: 'non_patient_counterparty',
        ledger: activeLedger,
        rawMessage,
      };
    }
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
      counterpartyEmail: match.counterpartyEmail || null,
      candidates: asArray(match.candidates).slice(0, 10),
      matchVersion: MATCH_VERSION,
      createdAt: new Date().toISOString(),
    };

    activeLedger = await store.updateLedger(
      activeLedger.id,
      {
        status,
        patientMatchStatus: match.status,
        patientId: match.patientId,
        processedAt: new Date().toISOString(),
        completedAt: [
          'COMPLETED',
          'DUPLICATE_SKIPPED',
          'MATCHED',
          'UNMATCHED',
          'NEEDS_REVIEW',
          'SECURITY_REVIEW',
        ].includes(status)
          ? new Date().toISOString()
          : null,
      },
      { persist }
    );

    if (mode === 'active' && status === 'MATCHED' && match.patientId) {
      activeLedger = await store.updateLedger(
        activeLedger.id,
        {
          status: 'ACTION_CREATED',
          completedAt: new Date().toISOString(),
        },
        { persist }
      );
    } else if (mode !== 'dry_run') {
      activeLedger = await store.updateLedger(
        activeLedger.id,
        {
          status: status === 'DUPLICATE_SKIPPED' ? 'DUPLICATE_SKIPPED' : status,
          completedAt: new Date().toISOString(),
        },
        { persist }
      );
    }

    await store.appendAudit(
      {
        type: 'mail_ingestion_processed',
        rawMessageId: rawMessage.id,
        status: activeLedger.status,
        mailType: classification.mailType,
        patientMatchStatus: match.status,
        mode,
      },
      { persist }
    );

    await store.savePatientMatch(patientMatchRecord, { persist });

    let triageResult = null;
    if (
      documentTriage &&
      match.patientId &&
      mode !== 'dry_run' &&
      !security.needsReview &&
      classification.messageClassification !== 'system_mail'
    ) {
      try {
        triageResult = await documentTriage.triageInboundMail({
          tenantId: tenantId || 'hair-tp-clinic',
          patientId: match.patientId,
          subject: rawMessage.subject,
          bodyPreview: rawMessage.bodyPreview,
          bodyText: rawMessage.bodyText,
          sourceMessageId: rawMessage.id,
          actor: 'mail_ingestion_triage',
        });
      } catch (triageError) {
        logger?.warn?.(
          `[mail-ingestion] document triage failed raw=${rawMessage.id}: ${triageError?.message || triageError}`
        );
        triageResult = { skipped: true, reason: 'triage_failed' };
      }
    }

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
      triageResult,
    };
  } catch (error) {
    activeLedger = await store.updateLedger(
      activeLedger.id,
      {
        status: 'FAILED',
        errorCode: 'processing_failed',
        errorMessage: normalizeText(error?.message) || 'processing_failed',
        completedAt: new Date().toISOString(),
      },
      { persist }
    );
    await store.appendAudit(
      {
        type: 'mail_ingestion_failed',
        rawMessageId: rawMessage.id,
        error: activeLedger.errorMessage,
      },
      { persist }
    );
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
