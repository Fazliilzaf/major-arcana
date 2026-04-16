const crypto = require('node:crypto');

const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { evaluatePolicyFloorText } = require('../policy/floor');
const { maskInboxText } = require('../privacy/inboxMasking');
const { validateJsonSchema } = require('./schemaValidator');
const {
  getCapabilityByName,
  listCapabilities,
  listAgentBundles,
  getAgentBundleByName,
} = require('./registry');
const {
  COO_AGENT_NAME,
  COO_DAILY_BRIEF_CAPABILITY_REF,
  cooDailyBriefInputSchema,
  cooDailyBriefOutputSchema,
  composeCooDailyBrief,
} = require('../agents/cooDailyBriefAgent');
const {
  CCO_AGENT_NAME,
  CCO_INBOX_ANALYSIS_CAPABILITY_REF,
  ccoInboxAnalysisInputSchema,
  ccoInboxAnalysisOutputSchema,
  composeCcoInboxAnalysis,
} = require('../agents/ccoInboxAgent');
const { buildCanonicalMailComposeDocument } = require('../ops/ccoMailComposeDocument');
const {
  createCcoMailboxTruthWorklistReadModel,
  toCanonicalMailboxConversationKey,
} = require('../ops/ccoMailboxTruthWorklistReadModel');
const {
  CCO_DEFAULT_SENDER_MAILBOX,
  CCO_BASE_SIGNATURE_PROFILES,
  buildCanonicalCcoMailboxSettingsDocument,
  resolveCcoMailboxSignatureProfile,
} = require('../ops/ccoMailboxSettingsDocument');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function toStringArray(value, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toLowerSet(values = []) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean)
  );
}

function stringifyForRisk(input = null) {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '';
  try {
    return JSON.stringify(input, null, 2).slice(0, 12000);
  } catch {
    return String(input);
  }
}

function buildAllowRiskEvaluation({
  scope = 'input',
  buildVersion = 'dev',
} = {}) {
  return {
    scope,
    category: 'INTERNAL',
    tenantRiskModifier: 0,
    riskLevel: 1,
    riskColor: 'green',
    riskScore: 0,
    semanticScore: 0,
    ruleScore: 0,
    decision: 'allow',
    reasonCodes: [],
    ruleHits: [],
    policyHits: [],
    policyAdjustments: [],
    versions: {
      ruleSetVersion: 'rules.v1',
      thresholdVersion: 'threshold.v1',
      semanticModelVersion: 'semantic.heuristic.v1',
      fusionVersion: 'fusion.weighted.v1',
      buildVersion: normalizeText(buildVersion || 'dev'),
    },
    evaluatedAt: new Date().toISOString(),
  };
}

async function getTenantRuntimeConfig(tenantConfigStore, tenantId) {
  const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);
  return {
    tenantConfig,
    riskSensitivityModifier: Number(tenantConfig?.riskSensitivityModifier ?? 0) || 0,
    riskThresholdVersion:
      Number.parseInt(String(tenantConfig?.riskThresholdVersion ?? 1), 10) || 1,
  };
}

function makeCapabilityError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function summarizeComposeDocument(composeDocument = null) {
  if (!composeDocument || typeof composeDocument !== 'object') return null;
  return {
    kind: normalizeText(composeDocument.kind) || null,
    version: normalizeText(composeDocument.version) || null,
    mode: normalizeText(composeDocument.mode) || null,
    sourceMailboxId: normalizeText(composeDocument.sourceMailboxId) || null,
    senderMailboxId: normalizeText(composeDocument.senderMailboxId) || null,
    replyContext: composeDocument.replyContext
      ? {
          conversationId: normalizeText(composeDocument.replyContext?.conversationId) || null,
          replyToMessageId: normalizeText(composeDocument.replyContext?.replyToMessageId) || null,
        }
      : null,
    recipients: {
      to: toStringArray(composeDocument.recipients?.to, 20),
      cc: toStringArray(composeDocument.recipients?.cc, 20),
      bcc: toStringArray(composeDocument.recipients?.bcc, 20),
    },
    subject: normalizeText(composeDocument.subject) || null,
    signature: composeDocument.signature
      ? {
          key: normalizeText(composeDocument.signature?.key) || null,
          label: normalizeText(composeDocument.signature?.label) || null,
          fullName: normalizeText(composeDocument.signature?.fullName) || null,
          title: normalizeText(composeDocument.signature?.title) || null,
          email: normalizeText(composeDocument.signature?.email) || null,
          senderMailboxId:
            normalizeText(composeDocument.signature?.senderMailboxId) || null,
          source: normalizeText(composeDocument.signature?.source) || null,
        }
      : null,
    delivery: composeDocument.delivery
      ? {
          requiresExplicitRecipients:
            composeDocument.delivery?.requiresExplicitRecipients === true,
          sendStrategy: normalizeText(composeDocument.delivery?.sendStrategy) || null,
          capabilityName: normalizeText(composeDocument.delivery?.capabilityName) || null,
          intent: normalizeText(composeDocument.delivery?.intent) || null,
        }
      : null,
    validation: composeDocument.validation
      ? {
          valid: composeDocument.validation?.valid === true,
          errors: Array.isArray(composeDocument.validation?.errors)
            ? composeDocument.validation.errors.map((error) => ({
                field: normalizeText(error?.field) || null,
                code: normalizeText(error?.code) || null,
                message: normalizeText(error?.message) || null,
              }))
            : [],
        }
      : null,
  };
}

function enforceCapabilityAccess({ capability, actorRole, channel }) {
  const roleSet = toLowerSet(capability.allowedRoles);
  const channelSet = toLowerSet(capability.allowedChannels);
  const normalizedRole = normalizeText(actorRole).toLowerCase();
  const normalizedChannel = normalizeText(channel).toLowerCase();

  if (!roleSet.has(normalizedRole)) {
    throw makeCapabilityError(
      'CAPABILITY_ROLE_DENIED',
      `Role saknar access till capability ${capability.name}.`
    );
  }
  if (!channelSet.has(normalizedChannel)) {
    throw makeCapabilityError(
      'CAPABILITY_CHANNEL_DENIED',
      `Channel saknar access till capability ${capability.name}.`
    );
  }
}

function ensureSchemaValidity({ schema, value, rootPath, errorCode, label }) {
  const validation = validateJsonSchema({
    schema,
    value,
    rootPath,
  });
  if (validation.ok) return;
  throw makeCapabilityError(
    errorCode,
    `${label} schema validation failed.`,
    {
      errors: validation.errors,
    }
  );
}

function enforceAgentAccess({ agentBundle, actorRole, channel }) {
  const roleSet = toLowerSet(agentBundle.allowedRoles);
  const channelSet = toLowerSet(agentBundle.allowedChannels);
  const normalizedRole = normalizeText(actorRole).toLowerCase();
  const normalizedChannel = normalizeText(channel).toLowerCase();

  if (!roleSet.has(normalizedRole)) {
    throw makeCapabilityError(
      'CAPABILITY_AGENT_ROLE_DENIED',
      `Role saknar access till agent ${agentBundle.name}.`
    );
  }
  if (!channelSet.has(normalizedChannel)) {
    throw makeCapabilityError(
      'CAPABILITY_AGENT_CHANNEL_DENIED',
      `Channel saknar access till agent ${agentBundle.name}.`
    );
  }
}

function toCapabilityResponseOutput(capabilityRunResult = null) {
  const responsePayload = capabilityRunResult?.gatewayResult?.response_payload;
  if (!responsePayload || typeof responsePayload !== 'object') return null;
  return safeObject(responsePayload.output);
}

function toDependencyRunSummary(capabilityRunResult = null) {
  return {
    capabilityName: normalizeText(capabilityRunResult?.capability?.name) || null,
    capabilityVersion: normalizeText(capabilityRunResult?.capability?.version) || null,
    capabilityRunId: normalizeText(capabilityRunResult?.capabilityRunId) || null,
    gatewayRunId: normalizeText(capabilityRunResult?.gatewayResult?.run_id) || null,
    decision: normalizeText(capabilityRunResult?.gatewayResult?.decision) || null,
  };
}

function bindGatewayRunCapability(executionGateway) {
  if (typeof executionGateway?.runCapability === 'function') {
    return async ({ capabilityName, context, handlers }) =>
      executionGateway.runCapability(capabilityName, { context, handlers });
  }
  if (typeof executionGateway?.run === 'function') {
    executionGateway.runCapability = async (_capabilityName, { context, handlers }) =>
      executionGateway.run({ context, handlers });
    return async ({ capabilityName, context, handlers }) =>
      executionGateway.runCapability(capabilityName, { context, handlers });
  }
  throw new Error('Capability executor kräver executionGateway.runCapability eller executionGateway.run.');
}

function toCcoSendAllowlistSet(rawValue = '') {
  const entries = String(rawValue || '')
    .split(',')
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  return new Set(entries);
}

const CCO_SIGNATURE_SPLIT_PATTERN =
  /\n(?:Med vanliga halsningar,?|Med vanlig halsning,?|Basta halsningar,?|Bästa hälsningar,?)\n[\s\S]*$/i;
const CCO_SIGNATURE_PROFILES = Object.freeze(
  Object.fromEntries(
    CCO_BASE_SIGNATURE_PROFILES.map((profile) => [
      normalizeText(profile?.key) || 'contact',
      Object.freeze({
        key: normalizeText(profile?.key) || 'contact',
        label: normalizeText(profile?.label) || normalizeText(profile?.fullName) || 'Signatur',
        fullName: normalizeText(profile?.fullName) || normalizeText(profile?.label) || '',
        title: normalizeText(profile?.title),
        html: normalizeText(profile?.html || profile?.bodyHtml || profile?.body_html),
        displayEmail: normalizeText(
          profile?.displayEmail || profile?.visibleEmail || profile?.email || profile?.senderMailboxId
        ),
        email:
          normalizeText(profile?.email || profile?.senderMailboxId) || CCO_DEFAULT_SENDER_MAILBOX,
        senderMailboxId:
          normalizeText(profile?.senderMailboxId || profile?.email) || CCO_DEFAULT_SENDER_MAILBOX,
        preferProvidedHtml: profile?.preferProvidedHtml === true,
        source: normalizeText(profile?.source) || 'base_profile',
      }),
    ])
  )
);
const APPROVED_CCO_SIGNATURE_PROFILE_KEYS = new Set(['fazli', 'egzona']);

function getApprovedCcoSignatureProfile(profile = null, senderMailboxId = CCO_DEFAULT_SENDER_MAILBOX) {
  const candidate = profile && typeof profile === 'object' ? profile : {};
  const candidateKey = normalizeText(candidate.key || candidate.id).toLowerCase();
  const candidateMailboxId = normalizeText(
    candidate.email || candidate.senderMailboxId || senderMailboxId
  ).toLowerCase();
  if (candidateKey && APPROVED_CCO_SIGNATURE_PROFILE_KEYS.has(candidateKey)) {
    return CCO_SIGNATURE_PROFILES[candidateKey] || null;
  }
  if (candidateMailboxId === 'fazli@hairtpclinic.com') {
    return CCO_SIGNATURE_PROFILES.fazli || null;
  }
  if (candidateMailboxId === 'egzona@hairtpclinic.com') {
    return CCO_SIGNATURE_PROFILES.egzona || null;
  }
  return CCO_SIGNATURE_PROFILES.fazli || CCO_SIGNATURE_PROFILES.egzona || null;
}

function resolveCcoSignatureProfile(
  rawProfile = '',
  { mailboxSettingsDocument = null, fallbackMailboxIds = [] } = {}
) {
  if (mailboxSettingsDocument && typeof mailboxSettingsDocument === 'object') {
    return (
      resolveCcoMailboxSignatureProfile(mailboxSettingsDocument, rawProfile, {
        fallbackMailboxIds,
      }) || getApprovedCcoSignatureProfile()
    );
  }
  const normalized = normalizeText(rawProfile).toLowerCase();
  if (normalized === 'fazli') return CCO_SIGNATURE_PROFILES.fazli;
  if (normalized === 'egzona' || normalized === 'egzona@hairtpclinic.com') {
    return CCO_SIGNATURE_PROFILES.egzona;
  }
  return getApprovedCcoSignatureProfile();
}

function sanitizeCcoSignatureOverrideHtml(html = '') {
  const normalizedHtml = normalizeText(html);
  if (!normalizedHtml) return '';
  const publicBaseUrl = normalizeText(
    process.env.PUBLIC_BASE_URL || process.env.ARCANA_PUBLIC_BASE_URL
  ).replace(/\/+$/, '') || 'https://arcana.hairtpclinic.se';

  return normalizedHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/@import/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(
      /https?:\/\/(?:127\.0\.0\.1|localhost):3000(?=\/assets\/hair-tp-clinic\/)/gi,
      publicBaseUrl
    )
    .replace(
      /\b(src|href)\s*=\s*(['"])(\/[^'"]+)\2/gi,
      (_match, attributeName, quote, pathValue) =>
        `${attributeName}=${quote}${publicBaseUrl}${pathValue}${quote}`
    )
    .trim();
}

function buildCcoSignatureOverride(rawInput = {}) {
  const input = safeObject(rawInput);
  const nestedOverride = safeObject(input.signatureOverride || input.signature_override);
  const source = Object.keys(nestedOverride).length ? nestedOverride : input;
  const key = normalizeText(
    source.key ||
      source.id ||
      source.signatureOverrideKey ||
      source.signature_override_key ||
      source.signatureKey ||
      source.signature_key
  ).toLowerCase();
  const label = normalizeText(
    source.label || source.signatureOverrideLabel || source.signature_override_label
  );
  const fullName = normalizeText(
    source.fullName || source.full_name || source.signatureOverrideFullName || source.signature_override_full_name
  );
  const title = normalizeText(
    source.title || source.line || source.signatureOverrideTitle || source.signature_override_title
  );
  const email = normalizeText(
    source.email ||
      source.signatureOverrideEmail ||
      source.signature_override_email ||
      source.senderEmail ||
      source.sender_email
  ).toLowerCase();
  const senderMailboxId = normalizeText(
    source.senderMailboxId ||
      source.sender_mailbox_id ||
      source.signatureOverrideSenderMailboxId ||
      source.signature_override_sender_mailbox_id
  ).toLowerCase();
  const html = sanitizeCcoSignatureOverrideHtml(
    source.html ||
      source.bodyHtml ||
      source.body_html ||
      source.signatureOverrideHtml ||
      source.signature_override_html
  );

  if (!key && !label && !fullName && !title && !senderMailboxId && !html) {
    return null;
  }

  const approvedProfile = getApprovedCcoSignatureProfile(
    {
      key,
      id: key,
      label,
      fullName,
      title,
      email,
      senderMailboxId,
    },
    email || senderMailboxId
  );
  if (!approvedProfile) {
    return null;
  }

  return {
    key: approvedProfile.key,
    label: approvedProfile.label,
    fullName: approvedProfile.fullName,
    title: approvedProfile.title || title,
    html: approvedProfile.html || html,
    email: approvedProfile.email || approvedProfile.senderMailboxId || CCO_DEFAULT_SENDER_MAILBOX,
    senderMailboxId:
      approvedProfile.senderMailboxId || approvedProfile.email || CCO_DEFAULT_SENDER_MAILBOX,
    source: 'override',
  };
}

function resolveCcoSignatureSelection(
  rawInput = {},
  { mailboxSettingsDocument = null, fallbackMailboxIds = [], actorEmail = '' } = {}
) {
  const input = safeObject(rawInput);
  const override = buildCcoSignatureOverride(input);
  if (override) {
    return override;
  }
  return resolveCcoSignatureProfile(
    input.signatureProfile || input.signature_profile || input.profile,
    {
      mailboxSettingsDocument,
      fallbackMailboxIds: [
        actorEmail,
        ...fallbackMailboxIds,
        input.senderMailboxId,
        input.sender_mailbox_id,
        input.sourceMailboxId,
        input.source_mailbox_id,
        input.mailboxId,
        input.mailbox_id,
      ],
    }
  );
}

function removeCcoSignature(body = '') {
  const normalizedBody = normalizeText(body);
  if (!normalizedBody) return '';
  return normalizedBody.replace(CCO_SIGNATURE_SPLIT_PATTERN, '').trimEnd();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTextAsHtml(value = '') {
  const escaped = escapeHtml(value || '');
  if (!escaped) return '';
  return escaped.replace(/\r?\n/g, '<br />');
}

function normalizeCcoSignatureTitle(value = '') {
  return normalizeText(value).replace(
    /\bHårspecialist\s+[Ii]\s+Hårtransplantationer\s*&\s*PRP-injektioner\b/i,
    'Hårspecialist | Hårtransplantationer & PRP-injektioner'
  );
}

function buildCcoSignature({
  profile = getApprovedCcoSignatureProfile(),
  senderMailboxId = CCO_DEFAULT_SENDER_MAILBOX,
}) {
  const safeProfile = getApprovedCcoSignatureProfile(profile, senderMailboxId);
  const safeDisplayEmail =
    normalizeText(
      safeProfile.displayEmail || safeProfile.signatureEmail || safeProfile.email || safeProfile.senderMailboxId
    ).toLowerCase() || CCO_DEFAULT_SENDER_MAILBOX;
  const safeTitle =
    normalizeCcoSignatureTitle(safeProfile.title) ||
    'Hårspecialist | Hårtransplantationer & PRP-injektioner';
  return [
    'Bästa hälsningar,',
    safeProfile.fullName,
    safeTitle,
    '031-88 11 66',
    safeDisplayEmail,
    'Vasaplatsen 2, 411 34 Göteborg',
  ].join('\n');
}

function buildCcoSignatureHtml({
  profile = getApprovedCcoSignatureProfile(),
  senderMailboxId = CCO_DEFAULT_SENDER_MAILBOX,
}) {
  const safeProfile = getApprovedCcoSignatureProfile(profile, senderMailboxId);
  const overrideHtml = sanitizeCcoSignatureOverrideHtml(
    safeProfile.html || safeProfile.bodyHtml || safeProfile.body_html
  );
  if (overrideHtml) return overrideHtml;
  return '';
}

function applyCcoSignature({
  body = '',
  profile = getApprovedCcoSignatureProfile(),
  senderMailboxId = CCO_DEFAULT_SENDER_MAILBOX,
}) {
  const withoutSignature = removeCcoSignature(body);
  const signature = buildCcoSignature({ profile, senderMailboxId });
  if (!withoutSignature) return signature;
  return `${withoutSignature}\n\n${signature}`;
}

function applyCcoSignatureHtml({
  body = '',
  bodyHtml = '',
  profile = getApprovedCcoSignatureProfile(),
  senderMailboxId = CCO_DEFAULT_SENDER_MAILBOX,
}) {
  const normalizedBodyHtml = normalizeText(bodyHtml);
  const withoutSignature = removeCcoSignature(body);
  const signatureHtml = buildCcoSignatureHtml({ profile, senderMailboxId });
  const formattedBodyHtml = normalizedBodyHtml || formatTextAsHtml(withoutSignature);
  if (!signatureHtml) return formattedBodyHtml;
  if (!formattedBodyHtml) return signatureHtml;
  return `${formattedBodyHtml}<br /><br />${signatureHtml}`;
}

function createCapabilityExecutor({
  executionGateway,
  authStore,
  tenantConfigStore,
  capabilityAnalysisStore = null,
  ccoSettingsStore = null,
  ccoHistoryStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  ccoConversationStateStore = null,
  buildVersion = 'dev',
}) {
  const runCapabilityThroughGateway = bindGatewayRunCapability(executionGateway);
  if (!authStore || typeof authStore.addAuditEvent !== 'function') {
    throw new Error('Capability executor kräver authStore.addAuditEvent.');
  }
  if (!tenantConfigStore || typeof tenantConfigStore.getTenantConfig !== 'function') {
    throw new Error('Capability executor kräver tenantConfigStore.getTenantConfig.');
  }

  async function getMailboxSettingsDocument({
    tenantId,
    graphSendEnabled = false,
    graphSendAllowlist = '',
  }) {
    const tenantSettings =
      ccoSettingsStore && typeof ccoSettingsStore.getTenantSettings === 'function'
        ? await ccoSettingsStore.getTenantSettings({ tenantId })
        : {};
    return buildCanonicalCcoMailboxSettingsDocument({
      tenantSettings,
      defaultSenderMailboxId:
        normalizeText(process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX) || CCO_DEFAULT_SENDER_MAILBOX,
      sendAllowlistMailboxIds: graphSendAllowlist,
      graphSendEnabled,
    });
  }

  async function writeAudit({
    tenantId,
    actorUserId = null,
    action,
    outcome = 'success',
    targetType = '',
    targetId = '',
    metadata = {},
  }) {
    await authStore.addAuditEvent({
      tenantId,
      actorUserId,
      action,
      outcome,
      targetType,
      targetId,
      metadata: metadata || {},
    });
  }

  function normalizeConversationActionWaitingOn(value = '') {
    const normalized = normalizeText(value).toLowerCase();
    if (normalized === 'customer') return 'customer';
    return 'owner';
  }

  function isMergeReviewResolved(decisionsByPairId = {}) {
    const decisions = Object.values(
      decisionsByPairId && typeof decisionsByPairId === 'object' ? decisionsByPairId : {}
    );
    if (decisions.length === 0) return false;
    return decisions.every((entry) => {
      const decision = normalizeText(entry?.decision).toLowerCase();
      return decision === 'approved' || decision === 'dismissed';
    });
  }

  async function resolveConversationActionTarget({
    tenantId,
    mailboxId,
    conversationId,
    messageId,
  }) {
    if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
      throw makeCapabilityError(
        'CCO_ACTION_TRUTH_UNAVAILABLE',
        'Mailbox truth store saknas för CCO action resolution.'
      );
    }
    const mailboxMessages = ccoMailboxTruthStore.listMessages({
      mailboxIds: [mailboxId],
      folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
    });
    const matchingMessage = mailboxMessages.find((message) => {
      const sameMessageId =
        normalizeText(message?.graphMessageId || message?.messageId) === normalizeText(messageId);
      const sameConversationId =
        normalizeText(message?.conversationId) === normalizeText(conversationId);
      return sameMessageId && sameConversationId;
    });
    if (!matchingMessage) {
      throw makeCapabilityError(
        'CCO_CONVERSATION_NOT_FOUND',
        'Conversation kunde inte resolvas i mailbox truth.'
      );
    }
    const customerState =
      ccoCustomerStore && typeof ccoCustomerStore.getTenantCustomerState === 'function'
        ? await ccoCustomerStore.getTenantCustomerState({ tenantId })
        : null;
    const worklistReadModel = createCcoMailboxTruthWorklistReadModel({
      store: ccoMailboxTruthStore,
      customerState,
      tenantId,
    });
    if (!worklistReadModel || typeof worklistReadModel.buildConsumerModel !== 'function') {
      throw makeCapabilityError(
        'CCO_ACTION_TRUTH_UNAVAILABLE',
        'Worklist consumer kunde inte byggas för CCO action resolution.'
      );
    }
    const rawConversationKey = toCanonicalMailboxConversationKey({
      mailboxId,
      conversationId: matchingMessage?.conversationId,
      mailboxConversationId: matchingMessage?.mailboxConversationId,
      messageId,
    });
    const consumerModel = worklistReadModel.buildConsumerModel({
      mailboxIds: [],
      limit: 1000,
    });
    const matchingRows = (Array.isArray(consumerModel?.rows) ? consumerModel.rows : []).filter((row) => {
      const underlyingConversationKeys = Array.isArray(row?.rollup?.underlyingConversationKeys)
        ? row.rollup.underlyingConversationKeys
        : [];
      return (
        normalizeText(row?.conversation?.key) === rawConversationKey ||
        underlyingConversationKeys.includes(rawConversationKey)
      );
    });
    if (matchingRows.length === 0) {
      throw makeCapabilityError(
        'CCO_CONVERSATION_NOT_FOUND',
        'Canonical conversation kunde inte resolvas i worklist consumer.'
      );
    }
    if (matchingRows.length > 1) {
      throw makeCapabilityError(
        'CCO_CONVERSATION_AMBIGUOUS',
        'Canonical conversation resolution blev tvetydig.'
      );
    }
    const row = matchingRows[0];
    const hardConflictSignals = Array.isArray(row?.hardConflictSignals) ? row.hardConflictSignals : [];
    if (hardConflictSignals.length > 0 && !isMergeReviewResolved(row?.mergeReviewDecisionsByPairId)) {
      throw makeCapabilityError(
        'CCO_CONVERSATION_REVIEW_REQUIRED',
        'Conversation kräver review innan operator-state kan skrivas.'
      );
    }
    const mergeKeyType = normalizeText(row?.rollup?.mergeKeyType || 'conversationKey') || 'conversationKey';
    return {
      canonicalConversationKey: normalizeText(row?.conversation?.key || row?.id),
      canonicalConversationSource:
        mergeKeyType === 'conversationKey' ? 'mailbox_conversation_fallback' : 'merge_identity',
      canonicalConversationType: mergeKeyType,
      primaryConversationId:
        normalizeText(row?.rollup?.primaryConversationId || row?.conversation?.conversationId) || null,
      underlyingConversationIds: Array.isArray(row?.rollup?.underlyingConversationIds)
        ? row.rollup.underlyingConversationIds
        : [normalizeText(conversationId)].filter(Boolean),
      underlyingMailboxIds: Array.isArray(row?.rollup?.underlyingMailboxIds)
        ? row.rollup.underlyingMailboxIds
        : [normalizeText(mailboxId).toLowerCase()].filter(Boolean),
      row,
    };
  }

  async function writeAuditSafely(payload = {}) {
    try {
      const event = await authStore.addAuditEvent(payload);
      return {
        ok: true,
        event,
      };
    } catch (error) {
      return {
        ok: false,
        error,
      };
    }
  }

  async function runCcoConversationStateAction({
    action,
    tenantId,
    actor = {},
    channel = 'admin',
    input = {},
    correlationId = null,
    idempotencyKey = null,
    requestMetadata = {},
  }) {
    const normalizedAction = normalizeText(action).toLowerCase();
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedActor = {
      id: normalizeText(actor?.id) || null,
      role: normalizeText(actor?.role || '').toUpperCase() || null,
      email: normalizeText(actor?.email).toLowerCase() || null,
    };
    const normalizedChannel = normalizeText(channel).toLowerCase() || 'admin';
    const normalizedCorrelationId = normalizeText(correlationId) || null;
    const normalizedIdempotencyKey = normalizeText(idempotencyKey) || null;
    const normalizedInput = safeObject(input);
    const mailboxId = normalizeText(normalizedInput.mailboxId).toLowerCase();
    const conversationId = normalizeText(normalizedInput.conversationId);
    const messageId = normalizeText(normalizedInput.messageId);
    const source = normalizeText(normalizedInput.source) || 'cco_action_route';
    const requestedActionAt = toIso(normalizedInput.actionAt);
    const actionAt = requestedActionAt || new Date().toISOString();
    const routeKey =
      normalizedAction === 'handled' ? '/api/v1/cco/handled' : '/api/v1/cco/reply-later';

    if (!normalizedTenantId) {
      throw makeCapabilityError('CAPABILITY_INVALID_TENANT', 'tenantId saknas för CCO action.');
    }
    if (!['OWNER', 'STAFF'].includes(normalizedActor.role || '')) {
      throw makeCapabilityError(
        'CAPABILITY_ROLE_DENIED',
        'Role saknar access till CCO conversation actions.'
      );
    }
    if (normalizedChannel !== 'admin') {
      throw makeCapabilityError(
        'CAPABILITY_CHANNEL_DENIED',
        'CCO conversation actions tillåter endast admin-channel.'
      );
    }
    if (!mailboxId || !conversationId || !messageId) {
      throw makeCapabilityError(
        'CCO_ACTION_INPUT_INVALID',
        'mailboxId, conversationId och messageId krävs.'
      );
    }
    if (!normalizedIdempotencyKey) {
      throw makeCapabilityError(
        'CCO_ACTION_INPUT_INVALID',
        'x-idempotency-key krävs för CCO conversation actions.'
      );
    }
    if (
      !ccoConversationStateStore ||
      typeof ccoConversationStateStore.writeConversationState !== 'function'
    ) {
      throw makeCapabilityError(
        'CCO_ACTION_STORE_UNAVAILABLE',
        'Conversation state store saknas för CCO action.'
      );
    }

    let followUpDueAt = null;
    let waitingOn = null;
    let nextActionLabel = null;
    let nextActionSummary = null;
    if (normalizedAction === 'reply_later') {
      followUpDueAt = toIso(normalizedInput.followUpDueAt);
      if (!followUpDueAt) {
        throw makeCapabilityError(
          'CCO_ACTION_INPUT_INVALID',
          'followUpDueAt krävs och måste vara giltig ISO-tid för reply-later.'
        );
      }
      waitingOn = normalizeConversationActionWaitingOn(normalizedInput.waitingOn);
      nextActionLabel = normalizeText(normalizedInput.nextActionLabel) || null;
      nextActionSummary = normalizeText(normalizedInput.nextActionSummary) || null;
    }

    const target = await resolveConversationActionTarget({
      tenantId: normalizedTenantId,
      mailboxId,
      conversationId,
      messageId,
    });
    const idempotencyPayload = {
      action: normalizedAction,
      mailboxId,
      conversationId,
      messageId,
      actionAt: requestedActionAt,
      followUpDueAt,
      waitingOn,
      nextActionLabel,
      nextActionSummary,
      actionLabel: normalizeText(normalizedInput.actionLabel) || null,
      source,
    };
    const idempotencyResult = await ccoConversationStateStore.reserveIdempotency({
      tenantId: normalizedTenantId,
      routeKey,
      actorUserId: normalizedActor.id,
      canonicalConversationKey: target.canonicalConversationKey,
      idempotencyKey: normalizedIdempotencyKey,
      payload: idempotencyPayload,
    });
    if (idempotencyResult.status === 'replay') {
      return safeObject(idempotencyResult.existing?.responseSnapshot);
    }
    if (idempotencyResult.status === 'mismatch') {
      throw makeCapabilityError(
        'CCO_IDEMPOTENCY_PAYLOAD_MISMATCH',
        'Idempotency-nyckeln återanvändes med annan payload.'
      );
    }
    if (idempotencyResult.status === 'in_progress') {
      throw makeCapabilityError(
        'CCO_IDEMPOTENCY_IN_PROGRESS',
        'En identisk action kör redan för denna conversation.'
      );
    }

    const requestedAuditAction =
      normalizedAction === 'handled'
        ? 'cco.reply.handled.requested'
        : 'cco.reply.later.requested';
    const completedAuditAction =
      normalizedAction === 'handled'
        ? 'cco.reply.handled.completed'
        : 'cco.reply.later.completed';
    const failedAuditAction =
      normalizedAction === 'handled'
        ? 'cco.reply.handled.failed'
        : 'cco.reply.later.failed';
    const historyActionType = normalizedAction === 'handled' ? 'handled' : 'reply_later';

    let stateRecord;
    try {
      stateRecord = await ccoConversationStateStore.writeConversationState({
        tenantId: normalizedTenantId,
        canonicalConversationKey: target.canonicalConversationKey,
        canonicalConversationSource: target.canonicalConversationSource,
        canonicalConversationType: target.canonicalConversationType,
        primaryConversationId: target.primaryConversationId,
        underlyingConversationIds: target.underlyingConversationIds,
        underlyingMailboxIds: target.underlyingMailboxIds,
        actionState: normalizedAction,
        needsReplyStatusOverride: normalizedAction === 'handled' ? 'handled' : 'needs_reply',
        followUpDueAt,
        waitingOn,
        nextActionLabel,
        nextActionSummary,
        actionAt,
        actionByUserId: normalizedActor.id,
        actionByEmail: normalizedActor.email,
        idempotencyKey: normalizedIdempotencyKey,
      });
    } catch (error) {
      await ccoConversationStateStore.clearPendingIdempotency({
        tenantId: normalizedTenantId,
        routeKey,
        actorUserId: normalizedActor.id,
        canonicalConversationKey: target.canonicalConversationKey,
        idempotencyKey: normalizedIdempotencyKey,
      });
      await writeAuditSafely({
        tenantId: normalizedTenantId,
        actorUserId: normalizedActor.id,
        action: failedAuditAction,
        outcome: 'failure',
        targetType: 'cco_conversation',
        targetId: conversationId,
        metadata: {
          correlationId: normalizedCorrelationId,
          mailboxId,
          conversationId,
          messageId,
          canonicalConversationKey: target.canonicalConversationKey,
          stage: 'state_write',
          errorCode: normalizeText(error?.code) || 'CCO_ACTION_STATE_WRITE_FAILED',
          errorMessage: normalizeText(error?.message) || 'Conversation state write misslyckades.',
          requestMetadata,
        },
      });
      throw makeCapabilityError(
        'CCO_ACTION_STATE_WRITE_FAILED',
        normalizeText(error?.message) || 'Conversation state write misslyckades.'
      );
    }

    let historyLogged = false;
    let historyRef = null;
    let historyWarning = null;
    try {
      if (!ccoHistoryStore || typeof ccoHistoryStore.recordAction !== 'function') {
        throw new Error('ccoHistoryStore.recordAction saknas.');
      }
      const historyEntry = await ccoHistoryStore.recordAction({
        tenantId: normalizedTenantId,
        conversationId,
        canonicalConversationKey: target.canonicalConversationKey,
        mailboxId,
        customerEmail: normalizeText(target?.row?.customer?.email || target?.row?.customerEmail) || null,
        messageId,
        actionType: historyActionType,
        actionLabel:
          normalizeText(normalizedInput.actionLabel) ||
          (normalizedAction === 'handled' ? 'Markera klar' : 'Svara senare'),
        subject: normalizeText(target?.row?.subject) || null,
        recordedAt: actionAt,
        actorUserId: normalizedActor.id,
        actorEmail: normalizedActor.email,
        source,
        waitingOn,
        nextActionLabel,
        nextActionSummary,
        followUpDueAt,
        version: stateRecord.version,
      });
      historyLogged = true;
      historyRef = historyEntry
        ? `${historyEntry.actionType}:${historyEntry.conversationId}:${historyEntry.recordedAt}`
        : null;
    } catch (error) {
      historyWarning = error;
    }

    const requestedAudit = await writeAuditSafely({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: requestedAuditAction,
      outcome: 'success',
      targetType: 'cco_conversation',
      targetId: conversationId,
      metadata: {
        correlationId: normalizedCorrelationId,
        mailboxId,
        conversationId,
        messageId,
        canonicalConversationKey: target.canonicalConversationKey,
        routeKey,
        requestMetadata,
      },
    });
    const terminalAudit = await writeAuditSafely({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: historyWarning ? failedAuditAction : completedAuditAction,
      outcome: historyWarning ? 'warning' : 'success',
      targetType: 'cco_conversation',
      targetId: conversationId,
      metadata: {
        correlationId: normalizedCorrelationId,
        mailboxId,
        conversationId,
        messageId,
        canonicalConversationKey: target.canonicalConversationKey,
        primaryConversationId: target.primaryConversationId,
        actionState: stateRecord.actionState,
        stateVersion: stateRecord.version,
        historyLogged,
        warningCode: historyWarning ? 'CCO_ACTION_HISTORY_WRITE_FAILED' : null,
        warningMessage: historyWarning ? normalizeText(historyWarning?.message) || null : null,
        requestMetadata,
      },
    });

    const auditLogged = requestedAudit.ok === true && terminalAudit.ok === true;
    const warningCode = historyWarning
      ? 'CCO_ACTION_HISTORY_WRITE_FAILED'
      : auditLogged
        ? null
        : 'CCO_ACTION_AUDIT_WRITE_FAILED';
    const warningMessage = historyWarning
      ? normalizeText(historyWarning?.message) || 'Historikloggning misslyckades efter state-write.'
      : auditLogged
        ? null
        : 'Auditloggning misslyckades efter state-write.';
    const responsePayload = {
      ok: true,
      action: normalizedAction,
      canonicalConversationKey: target.canonicalConversationKey,
      state: {
        actionState: stateRecord.actionState,
        needsReplyStatusOverride: stateRecord.needsReplyStatusOverride,
        followUpDueAt: stateRecord.followUpDueAt,
        waitingOn: stateRecord.waitingOn,
        nextActionLabel: stateRecord.nextActionLabel,
        nextActionSummary: stateRecord.nextActionSummary,
        actionAt: stateRecord.actionAt,
        superseded: stateRecord.superseded === true,
        version: stateRecord.version,
      },
      projection: {
        refreshMode: 'bootstrap_refresh',
        invalidate: ['worklist', 'focus', 'history'],
        primaryConversationId: target.primaryConversationId,
      },
      auditRef: normalizeText(terminalAudit?.event?.id || requestedAudit?.event?.id) || null,
      historyRef,
      writeCommitted: true,
      historyLogged,
      auditLogged,
      warningCode,
      warningMessage,
    };

    await ccoConversationStateStore.completeIdempotency({
      tenantId: normalizedTenantId,
      routeKey,
      actorUserId: normalizedActor.id,
      canonicalConversationKey: target.canonicalConversationKey,
      idempotencyKey: normalizedIdempotencyKey,
      responseSnapshot: responsePayload,
    });

    return responsePayload;
  }

  async function runCapability({
    tenantId,
    actor = {},
    channel = 'admin',
    capabilityName,
    input = {},
    systemStateSnapshot = {},
    correlationId = null,
    idempotencyKey = null,
    requestMetadata = {},
  }) {
    const CapabilityClass = getCapabilityByName(capabilityName);
    if (!CapabilityClass) {
      throw makeCapabilityError(
        'CAPABILITY_NOT_FOUND',
        `Capability saknas: ${normalizeText(capabilityName) || '<empty>'}.`
      );
    }
    const capabilityInstance = new CapabilityClass();

    const normalizedTenantId = normalizeText(tenantId);
    const normalizedActor = {
      id: normalizeText(actor?.id) || null,
      role: normalizeText(actor?.role) || null,
    };
    const normalizedChannel = normalizeText(channel).toLowerCase() || 'admin';
    const normalizedCorrelationId = normalizeText(correlationId) || null;
    const normalizedIdempotencyKey = normalizeText(idempotencyKey) || null;
    const capabilityRunId = crypto.randomUUID();

    if (!normalizedTenantId) {
      throw makeCapabilityError('CAPABILITY_INVALID_TENANT', 'tenantId saknas för capability-run.');
    }

    enforceCapabilityAccess({
      capability: CapabilityClass,
      actorRole: normalizedActor.role,
      channel: normalizedChannel,
    });

    const validatedInput = safeObject(input);
    const validatedSystemStateSnapshot = safeObject(systemStateSnapshot);
    ensureSchemaValidity({
      schema: CapabilityClass.inputSchema,
      value: validatedInput,
      rootPath: 'capability.input',
      errorCode: 'CAPABILITY_INPUT_INVALID',
      label: 'Input',
    });

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'capability.run.start',
      outcome: 'success',
      targetType: 'capability_run',
      targetId: capabilityRunId,
      metadata: {
        capabilityRunId,
        capabilityName: CapabilityClass.name,
        capabilityVersion: CapabilityClass.version,
        persistStrategy: CapabilityClass.persistStrategy,
        channel: normalizedChannel,
        correlationId: normalizedCorrelationId,
      },
    });

    const tenantRuntime = await getTenantRuntimeConfig(tenantConfigStore, normalizedTenantId);

    let gatewayResult = null;
    try {
      gatewayResult = await runCapabilityThroughGateway({
        capabilityName: CapabilityClass.name,
        context: {
          tenant_id: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          intent: `capability.${CapabilityClass.name}.run`,
          payload: {
            capabilityRunId,
            capabilityName: CapabilityClass.name,
            capabilityVersion: CapabilityClass.version,
            systemStateSnapshot: validatedSystemStateSnapshot,
          },
          correlation_id: normalizedCorrelationId,
          idempotency_key: normalizedIdempotencyKey,
        },
        handlers: {
          audit: async (event) => {
            await writeAudit({
              tenantId: normalizedTenantId,
              actorUserId: normalizedActor.id,
              action: event.action,
              outcome: event.outcome,
              targetType: 'gateway_run',
              targetId: String(event?.metadata?.runId || ''),
              metadata: {
                ...(event.metadata || {}),
                capabilityRunId,
                capabilityName: CapabilityClass.name,
              },
            });
          },
          inputRisk: async () => {
            if (CapabilityClass.requiresInputRisk !== true) {
              return buildAllowRiskEvaluation({
                scope: 'input',
                buildVersion,
              });
            }
            return evaluateTemplateRisk({
              scope: 'input',
              category: 'INTERNAL',
              content: stringifyForRisk(validatedInput),
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              riskThresholdVersion: tenantRuntime.riskThresholdVersion,
            });
          },
          agentRun: async ({ runId, context: gatewayContext }) => {
            const injectedSnapshot = safeObject(
              gatewayContext?.payload?.systemStateSnapshot ||
                gatewayContext?.payload?.system_state_snapshot ||
                validatedSystemStateSnapshot
            );
            const output = await capabilityInstance.execute({
              tenantId: normalizedTenantId,
              actor: normalizedActor,
              channel: normalizedChannel,
              correlationId: normalizedCorrelationId,
              requestId: runId,
              input: validatedInput,
              systemStateSnapshot: injectedSnapshot,
            });
            ensureSchemaValidity({
              schema: CapabilityClass.outputSchema,
              value: output,
              rootPath: 'capability.output',
              errorCode: 'CAPABILITY_OUTPUT_INVALID',
              label: 'Output',
            });
            return {
              output: safeObject(output),
            };
          },
          outputRisk: async ({ agentResult }) => {
            if (CapabilityClass.requiresOutputRisk !== true) {
              return buildAllowRiskEvaluation({
                scope: 'output',
                buildVersion,
              });
            }
            return evaluateTemplateRisk({
              scope: 'output',
              category: 'INTERNAL',
              content: stringifyForRisk(agentResult?.output || null),
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              riskThresholdVersion: tenantRuntime.riskThresholdVersion,
            });
          },
          policyFloor: async ({ agentResult }) => {
            if (CapabilityClass.requiresPolicyFloor !== true) {
              return {
                blocked: false,
                maxFloor: 1,
                hits: [],
              };
            }
            return evaluatePolicyFloorText({
              text: stringifyForRisk(agentResult?.output || null),
              context: 'orchestrator',
            });
          },
          persist: async ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => {
            const strategy = normalizeText(CapabilityClass.persistStrategy).toLowerCase();
            if (strategy === 'none') return null;
            if (strategy !== 'analysis') {
              const error = makeCapabilityError(
                'CAPABILITY_PERSIST_STRATEGY_NOT_IMPLEMENTED',
                `Persist-strategy stöds ej ännu: ${CapabilityClass.persistStrategy}.`
              );
              error.nonRetryable = true;
              throw error;
            }
            if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
              const error = makeCapabilityError(
                'CAPABILITY_ANALYSIS_STORE_MISSING',
                'Analysis store saknas för persistStrategy=analysis.'
              );
              error.nonRetryable = true;
              throw error;
            }

            const entry = await capabilityAnalysisStore.append({
              tenantId: normalizedTenantId,
              capability: {
                name: CapabilityClass.name,
                version: CapabilityClass.version,
                persistStrategy: CapabilityClass.persistStrategy,
              },
              decision,
              runId,
              capabilityRunId,
              correlationId: normalizedCorrelationId,
              actor: normalizedActor,
              input: validatedInput,
              output: agentResult?.output || null,
              riskSummary: {
                input: inputRisk?.evaluation || null,
                output: outputRisk?.evaluation || null,
              },
              policySummary: {
                blocked: policy?.blocked === true,
                reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
              },
              metadata: {
                channel: normalizedChannel,
                requestMetadata: safeObject(requestMetadata),
              },
            });
            return {
              artifact_refs: {
                analysis_id: entry.id,
                capability_name: CapabilityClass.name,
                capability_run_id: capabilityRunId,
              },
            };
          },
          safeResponse: ({ decision }) => ({
            error:
              'Capability-resultatet blockerades av risk/policy. Granska körningen i audit och försök igen.',
            decision,
            capability: {
              name: CapabilityClass.name,
              version: CapabilityClass.version,
              runId: capabilityRunId,
            },
          }),
          response: ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => ({
            capability: {
              name: CapabilityClass.name,
              version: CapabilityClass.version,
              runId: capabilityRunId,
              gatewayRunId: runId,
              persistStrategy: CapabilityClass.persistStrategy,
            },
            decision,
            riskSummary: {
              input: inputRisk?.evaluation || null,
              output: outputRisk?.evaluation || null,
            },
            policySummary: {
              blocked: policy?.blocked === true,
              reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
            },
            output: agentResult?.output || null,
          }),
        },
      });
    } catch (error) {
      await writeAudit({
        tenantId: normalizedTenantId,
        actorUserId: normalizedActor.id,
        action: 'capability.run.complete',
        outcome: 'error',
        targetType: 'capability_run',
        targetId: capabilityRunId,
        metadata: {
          capabilityRunId,
          capabilityName: CapabilityClass.name,
          errorCode: error?.code || null,
          errorMessage: normalizeText(error?.message) || 'capability_run_error',
          correlationId: normalizedCorrelationId,
        },
      });
      throw error;
    }

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'capability.run.decision',
      outcome:
        gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate'
          ? 'blocked'
          : 'success',
      targetType: 'capability_run',
      targetId: capabilityRunId,
      metadata: {
        capabilityRunId,
        capabilityName: CapabilityClass.name,
        gatewayRunId: gatewayResult.run_id || null,
        decision: gatewayResult.decision,
        correlationId: normalizedCorrelationId,
      },
    });

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'capability.run.persist',
      outcome: gatewayResult?.artifact_refs ? 'success' : 'skipped',
      targetType: 'capability_run',
      targetId: capabilityRunId,
      metadata: {
        capabilityRunId,
        capabilityName: CapabilityClass.name,
        gatewayRunId: gatewayResult.run_id || null,
        persisted: Boolean(gatewayResult?.artifact_refs),
        artifactRefs: gatewayResult?.artifact_refs || null,
        correlationId: normalizedCorrelationId,
      },
    });

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'capability.run.complete',
      outcome:
        gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate'
          ? 'blocked'
          : 'success',
      targetType: 'capability_run',
      targetId: capabilityRunId,
      metadata: {
        capabilityRunId,
        capabilityName: CapabilityClass.name,
        gatewayRunId: gatewayResult.run_id || null,
        decision: gatewayResult.decision,
        correlationId: normalizedCorrelationId,
        completedAt: toIso(new Date()) || new Date().toISOString(),
      },
    });

    if (CapabilityClass.name === 'CcoConversationAction') {
      const actionType = normalizeText(
        gatewayResult?.response_payload?.output?.data?.action
      ).toLowerCase();
      const targetConversationId = normalizeText(
        gatewayResult?.response_payload?.output?.data?.conversationId
      );
      if (actionType === 'handled') {
        await writeAudit({
          tenantId: normalizedTenantId,
          actorUserId: normalizedActor.id,
          action: 'cco.reply.handled',
          outcome: 'success',
          targetType: 'cco_conversation',
          targetId: targetConversationId || capabilityRunId,
          metadata: {
            capabilityRunId,
            capabilityName: CapabilityClass.name,
            gatewayRunId: gatewayResult?.run_id || null,
            correlationId: normalizedCorrelationId,
          },
        });
      } else if (actionType === 'flag_critical') {
        await writeAudit({
          tenantId: normalizedTenantId,
          actorUserId: normalizedActor.id,
          action: 'cco.reply.flagged_critical',
          outcome: 'success',
          targetType: 'cco_conversation',
          targetId: targetConversationId || capabilityRunId,
          metadata: {
            capabilityRunId,
            capabilityName: CapabilityClass.name,
            gatewayRunId: gatewayResult?.run_id || null,
            correlationId: normalizedCorrelationId,
          },
        });
      }
    }

    return {
      capabilityRunId,
      capability: CapabilityClass,
      gatewayResult,
    };
  }

  async function runAgent({
    tenantId,
    actor = {},
    channel = 'admin',
    agentName,
    input = {},
    systemStateSnapshot = {},
    correlationId = null,
    idempotencyKey = null,
    requestMetadata = {},
  }) {
    const agentBundle = getAgentBundleByName(agentName);
    if (!agentBundle) {
      throw makeCapabilityError(
        'CAPABILITY_AGENT_NOT_FOUND',
        `Agent saknas: ${normalizeText(agentName) || '<empty>'}.`
      );
    }

    const normalizedTenantId = normalizeText(tenantId);
    const normalizedActor = {
      id: normalizeText(actor?.id) || null,
      role: normalizeText(actor?.role) || null,
    };
    const normalizedChannel = normalizeText(channel).toLowerCase() || 'admin';
    const normalizedCorrelationId = normalizeText(correlationId) || null;
    const normalizedIdempotencyKey = normalizeText(idempotencyKey) || null;
    const agentRunId = crypto.randomUUID();

    if (!normalizedTenantId) {
      throw makeCapabilityError('CAPABILITY_INVALID_TENANT', 'tenantId saknas för agent-run.');
    }

    enforceAgentAccess({
      agentBundle,
      actorRole: normalizedActor.role,
      channel: normalizedChannel,
    });

    const validatedInput = safeObject(input);
    const validatedSystemStateSnapshot = safeObject(systemStateSnapshot);

    const normalizedAgentName = normalizeText(agentBundle.name).toUpperCase();

    if (normalizedAgentName === COO_AGENT_NAME) {
      ensureSchemaValidity({
        schema: cooDailyBriefInputSchema,
        value: validatedInput,
        rootPath: 'agent.input',
        errorCode: 'CAPABILITY_AGENT_INPUT_INVALID',
        label: 'Agent input',
      });
    } else if (normalizedAgentName === CCO_AGENT_NAME) {
      ensureSchemaValidity({
        schema: ccoInboxAnalysisInputSchema,
        value: validatedInput,
        rootPath: 'agent.input',
        errorCode: 'CAPABILITY_AGENT_INPUT_INVALID',
        label: 'Agent input',
      });
    } else {
      throw makeCapabilityError(
        'CAPABILITY_AGENT_NOT_IMPLEMENTED',
        `Agent ej implementerad for execution: ${agentBundle.name}.`
      );
    }

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'agent.run.start',
      outcome: 'success',
      targetType: 'agent_run',
      targetId: agentRunId,
      metadata: {
        agentRunId,
        agentName: agentBundle.name,
        agentVersion: agentBundle.version,
        persistStrategy: agentBundle.persistStrategy,
        channel: normalizedChannel,
        correlationId: normalizedCorrelationId,
      },
    });

    let gatewayResult = null;
    let dependencyRuns = [];
    let agentOutput = null;
    let agentOutputSchema = null;
    let agentCapabilityRef = '';
    try {
      if (normalizedAgentName === COO_AGENT_NAME) {
        const summarizeRun = await runCapability({
          tenantId: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          capabilityName: 'SummarizeIncidents',
          input: {
            includeClosed: validatedInput.includeClosed === true,
            timeframeDays: Number(validatedInput.timeframeDays || 14) || 14,
          },
          systemStateSnapshot: validatedSystemStateSnapshot,
          correlationId: normalizedCorrelationId,
          idempotencyKey: normalizedIdempotencyKey
            ? `${normalizedIdempotencyKey}:summarize`
            : null,
          requestMetadata: {
            ...safeObject(requestMetadata),
            parentAgentRunId: agentRunId,
            parentAgentName: agentBundle.name,
          },
        });

        if (
          summarizeRun?.gatewayResult?.decision === 'blocked' ||
          summarizeRun?.gatewayResult?.decision === 'critical_escalate'
        ) {
          throw makeCapabilityError(
            'CAPABILITY_AGENT_DEPENDENCY_BLOCKED',
            'SummarizeIncidents blockerade agent-korning.'
          );
        }

        const taskPlanRun = await runCapability({
          tenantId: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          capabilityName: 'GenerateTaskPlan',
          input: {
            maxTasks: Number(validatedInput.maxTasks || 5) || 5,
            includeEvidence: validatedInput.includeEvidence !== false,
          },
          systemStateSnapshot: validatedSystemStateSnapshot,
          correlationId: normalizedCorrelationId,
          idempotencyKey: normalizedIdempotencyKey ? `${normalizedIdempotencyKey}:taskplan` : null,
          requestMetadata: {
            ...safeObject(requestMetadata),
            parentAgentRunId: agentRunId,
            parentAgentName: agentBundle.name,
          },
        });

        if (
          taskPlanRun?.gatewayResult?.decision === 'blocked' ||
          taskPlanRun?.gatewayResult?.decision === 'critical_escalate'
        ) {
          throw makeCapabilityError(
            'CAPABILITY_AGENT_DEPENDENCY_BLOCKED',
            'GenerateTaskPlan blockerade agent-korning.'
          );
        }

        dependencyRuns = [toDependencyRunSummary(summarizeRun), toDependencyRunSummary(taskPlanRun)];
        agentOutput = composeCooDailyBrief({
          incidentOutput: toCapabilityResponseOutput(summarizeRun),
          taskPlanOutput: toCapabilityResponseOutput(taskPlanRun),
          channel: normalizedChannel,
          tenantId: normalizedTenantId,
          correlationId: normalizedCorrelationId,
        });
        agentOutputSchema = cooDailyBriefOutputSchema;
        agentCapabilityRef = COO_DAILY_BRIEF_CAPABILITY_REF;
      } else if (normalizedAgentName === CCO_AGENT_NAME) {
        const analyzeInboxInput = {
          includeClosed: validatedInput.includeClosed === true,
          maxDrafts: Number(validatedInput.maxDrafts || 5) || 5,
        };
        if (validatedInput.debug === true) {
          analyzeInboxInput.debug = true;
        }
        const analyzeInboxRun = await runCapability({
          tenantId: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          capabilityName: 'AnalyzeInbox',
          input: analyzeInboxInput,
          systemStateSnapshot: validatedSystemStateSnapshot,
          correlationId: normalizedCorrelationId,
          idempotencyKey: normalizedIdempotencyKey
            ? `${normalizedIdempotencyKey}:analyzeinbox`
            : null,
          requestMetadata: {
            ...safeObject(requestMetadata),
            parentAgentRunId: agentRunId,
            parentAgentName: agentBundle.name,
          },
        });

        if (
          analyzeInboxRun?.gatewayResult?.decision === 'blocked' ||
          analyzeInboxRun?.gatewayResult?.decision === 'critical_escalate'
        ) {
          throw makeCapabilityError(
            'CAPABILITY_AGENT_DEPENDENCY_BLOCKED',
            'AnalyzeInbox blockerade agent-korning.'
          );
        }

        dependencyRuns = [toDependencyRunSummary(analyzeInboxRun)];
        agentOutput = composeCcoInboxAnalysis({
          inboxOutput: toCapabilityResponseOutput(analyzeInboxRun),
          channel: normalizedChannel,
          tenantId: normalizedTenantId,
          correlationId: normalizedCorrelationId,
        });
        agentOutputSchema = ccoInboxAnalysisOutputSchema;
        agentCapabilityRef = CCO_INBOX_ANALYSIS_CAPABILITY_REF;
      }

      ensureSchemaValidity({
        schema: agentOutputSchema,
        value: agentOutput,
        rootPath: 'agent.output',
        errorCode: 'CAPABILITY_AGENT_OUTPUT_INVALID',
        label: 'Agent output',
      });

      const tenantRuntime = await getTenantRuntimeConfig(tenantConfigStore, normalizedTenantId);

      gatewayResult = await runCapabilityThroughGateway({
        capabilityName: agentCapabilityRef,
        context: {
          tenant_id: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          intent: `agent.${agentBundle.name}.run`,
          payload: {
            agentRunId,
            agentName: agentBundle.name,
            agentVersion: agentBundle.version,
            dependencyRuns,
          },
          correlation_id: normalizedCorrelationId,
          idempotency_key: normalizedIdempotencyKey,
        },
        handlers: {
          audit: async (event) => {
            await writeAudit({
              tenantId: normalizedTenantId,
              actorUserId: normalizedActor.id,
              action: event.action,
              outcome: event.outcome,
              targetType: 'gateway_run',
              targetId: String(event?.metadata?.runId || ''),
              metadata: {
                ...(event.metadata || {}),
                agentRunId,
                agentName: agentBundle.name,
              },
            });
          },
          inputRisk: async () =>
            buildAllowRiskEvaluation({
              scope: 'input',
              buildVersion,
            }),
          agentRun: async () => ({
            output: safeObject(agentOutput),
            dependencyRuns,
          }),
          outputRisk: async ({ agentResult }) =>
            evaluateTemplateRisk({
              scope: 'output',
              category: 'INTERNAL',
              content: stringifyForRisk(agentResult?.output || null),
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              riskThresholdVersion: tenantRuntime.riskThresholdVersion,
            }),
          policyFloor: async ({ agentResult }) =>
            evaluatePolicyFloorText({
              text: stringifyForRisk(agentResult?.output || null),
              context: 'orchestrator',
            }),
          persist: async ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => {
            if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
              const error = makeCapabilityError(
                'CAPABILITY_ANALYSIS_STORE_MISSING',
                'Analysis store saknas for agent persistStrategy=analysis.'
              );
              error.nonRetryable = true;
              throw error;
            }
            const entry = await capabilityAnalysisStore.append({
              tenantId: normalizedTenantId,
              capability: {
                name: agentCapabilityRef,
                version: agentBundle.version,
                persistStrategy: 'analysis',
              },
              decision,
              runId,
              capabilityRunId: agentRunId,
              correlationId: normalizedCorrelationId,
              actor: normalizedActor,
              input: validatedInput,
              output: agentResult?.output || null,
              riskSummary: {
                input: inputRisk?.evaluation || null,
                output: outputRisk?.evaluation || null,
              },
              policySummary: {
                blocked: policy?.blocked === true,
                reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
              },
              metadata: {
                agentName: agentBundle.name,
                channel: normalizedChannel,
                requestMetadata: safeObject(requestMetadata),
                dependencyRuns,
              },
            });
            return {
              artifact_refs: {
                analysis_id: entry.id,
                agent_name: agentBundle.name,
                agent_run_id: agentRunId,
              },
            };
          },
          safeResponse: ({ decision }) => ({
            error:
              'Agent-resultatet blockerades av risk/policy. Granska korningen i audit innan nytt forsok.',
            decision,
            agent: {
              name: agentBundle.name,
              version: agentBundle.version,
              runId: agentRunId,
            },
          }),
          response: ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => ({
            agent: {
              name: agentBundle.name,
              version: agentBundle.version,
              runId: agentRunId,
              gatewayRunId: runId,
              persistStrategy: agentBundle.persistStrategy,
              capabilities: Array.isArray(agentBundle.capabilities)
                ? [...agentBundle.capabilities]
                : [],
            },
            decision,
            riskSummary: {
              input: inputRisk?.evaluation || null,
              output: outputRisk?.evaluation || null,
            },
            policySummary: {
              blocked: policy?.blocked === true,
              reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
            },
            output: agentResult?.output || null,
            dependencyRuns,
          }),
        },
      });
    } catch (error) {
      await writeAudit({
        tenantId: normalizedTenantId,
        actorUserId: normalizedActor.id,
        action: 'agent.run.complete',
        outcome: 'error',
        targetType: 'agent_run',
        targetId: agentRunId,
        metadata: {
          agentRunId,
          agentName: agentBundle.name,
          errorCode: error?.code || null,
          errorMessage: normalizeText(error?.message) || 'agent_run_error',
          correlationId: normalizedCorrelationId,
        },
      });
      throw error;
    }

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'agent.run.complete',
      outcome:
        gatewayResult?.decision === 'blocked' || gatewayResult?.decision === 'critical_escalate'
          ? 'blocked'
          : 'success',
      targetType: 'agent_run',
      targetId: agentRunId,
      metadata: {
        agentRunId,
        agentName: agentBundle.name,
        gatewayRunId: gatewayResult?.run_id || null,
        decision: gatewayResult?.decision || null,
        correlationId: normalizedCorrelationId,
        completedAt: toIso(new Date()) || new Date().toISOString(),
      },
    });

    return {
      agentRunId,
      agent: agentBundle,
      gatewayResult,
      dependencyRuns,
    };
  }

  async function runCcoSend({
    tenantId,
    actor = {},
    channel = 'admin',
    input = {},
    correlationId = null,
    idempotencyKey = null,
    requestMetadata = {},
    graphSendConnector = null,
    graphSendEnabled = false,
    graphSendAllowlist = '',
  }) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedActor = {
      id: normalizeText(actor?.id) || null,
      role: normalizeText(actor?.role || '').toUpperCase() || null,
    };
    const normalizedChannel = normalizeText(channel).toLowerCase() || 'admin';
    const normalizedCorrelationId = normalizeText(correlationId) || null;
    const normalizedIdempotencyKey = normalizeText(idempotencyKey) || null;
    const normalizedInput = safeObject(input);
    const ccoSendRunId = crypto.randomUUID();

    if (!normalizedTenantId) {
      throw makeCapabilityError('CAPABILITY_INVALID_TENANT', 'tenantId saknas for CCO send.');
    }
    if (!['OWNER', 'STAFF'].includes(normalizedActor.role || '')) {
      throw makeCapabilityError('CAPABILITY_ROLE_DENIED', 'Role saknar access till CCO send.');
    }
    if (normalizedChannel !== 'admin') {
      throw makeCapabilityError('CAPABILITY_CHANNEL_DENIED', 'CCO send tillater endast admin-channel.');
    }

    const mailboxSettingsDocument = await getMailboxSettingsDocument({
      tenantId: normalizedTenantId,
      graphSendEnabled,
      graphSendAllowlist,
    });
    const mailboxSettingsDefaults = safeObject(mailboxSettingsDocument?.defaults);
    const signatureProfile = resolveCcoSignatureSelection(normalizedInput, {
      mailboxSettingsDocument,
      actorEmail: normalizeText(actor?.email),
      fallbackMailboxIds: [
        mailboxSettingsDefaults.replySenderMailboxId,
        mailboxSettingsDefaults.composeSenderMailboxId,
        mailboxSettingsDefaults.senderMailboxId,
      ],
    });
    const body = normalizeText(normalizedInput.body);
    const bodyWithSignature = applyCcoSignature({
      body,
      profile: signatureProfile,
      senderMailboxId:
        normalizeText(
          normalizedInput.senderMailboxId ||
            normalizedInput.sender_mailbox_id ||
            signatureProfile?.senderMailboxId ||
            mailboxSettingsDefaults.composeSenderMailboxId ||
            mailboxSettingsDefaults.senderMailboxId ||
            process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX ||
            CCO_DEFAULT_SENDER_MAILBOX ||
            normalizedInput.sourceMailboxId ||
            normalizedInput.source_mailbox_id ||
            normalizedInput.mailboxId ||
            normalizedInput.mailbox_id
        ) || CCO_DEFAULT_SENDER_MAILBOX,
    });
    const bodyWithSignatureHtml = applyCcoSignatureHtml({
      body,
      profile: signatureProfile,
      senderMailboxId:
        normalizeText(
          normalizedInput.senderMailboxId ||
            normalizedInput.sender_mailbox_id ||
            signatureProfile?.senderMailboxId ||
            mailboxSettingsDefaults.composeSenderMailboxId ||
            mailboxSettingsDefaults.senderMailboxId ||
            process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX ||
            CCO_DEFAULT_SENDER_MAILBOX ||
            normalizedInput.sourceMailboxId ||
            normalizedInput.source_mailbox_id ||
            normalizedInput.mailboxId ||
            normalizedInput.mailbox_id
        ) || CCO_DEFAULT_SENDER_MAILBOX,
    });
    const composeDocument = buildCanonicalMailComposeDocument(normalizedInput, {
      signatureProfile,
      renderedBodyText: bodyWithSignature,
      renderedBodyHtml: bodyWithSignatureHtml,
      defaultSenderMailboxId:
        mailboxSettingsDefaults.composeSenderMailboxId ||
        mailboxSettingsDefaults.senderMailboxId ||
        process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX ||
        CCO_DEFAULT_SENDER_MAILBOX,
    });
    const sourceMailboxId = normalizeText(composeDocument.sourceMailboxId);
    const senderMailboxId = normalizeText(composeDocument.senderMailboxId);
    const replyToMessageId = normalizeText(composeDocument.replyContext?.replyToMessageId);
    const conversationId = normalizeText(composeDocument.replyContext?.conversationId);
    const subject = normalizeText(composeDocument.subject);
    const to = toStringArray(composeDocument.recipients?.to, 20);
    const cc = toStringArray(composeDocument.recipients?.cc, 20);
    const bcc = toStringArray(composeDocument.recipients?.bcc, 20);
    const isComposeMode = composeDocument.mode === 'compose';
    const capabilityName =
      normalizeText(composeDocument.delivery?.capabilityName) ||
      (isComposeMode ? 'CCO.SendCompose' : 'CCO.SendReply');
    const sendIntent =
      normalizeText(composeDocument.delivery?.intent) ||
      (isComposeMode ? 'cco.send.compose' : 'cco.send.reply');
    const sendStrategy =
      normalizeText(composeDocument.delivery?.sendStrategy) ||
      (isComposeMode ? 'send_mail' : 'reply_draft');
    const composeDocumentSummary = summarizeComposeDocument(composeDocument);
    const composeValidationErrors = Array.isArray(composeDocument.validation?.errors)
      ? composeDocument.validation.errors
      : [];

    if (composeDocument.validation?.valid !== true) {
      const primaryError = composeValidationErrors[0] || {
        message: 'composeDocument ar ogiltigt.',
      };
      throw makeCapabilityError(
        'CCO_SEND_INPUT_INVALID',
        normalizeText(primaryError.message) || 'composeDocument ar ogiltigt.',
        {
          composeDocument: composeDocumentSummary,
          validationErrors: composeValidationErrors,
        }
      );
    }
    if (!normalizedIdempotencyKey) {
      throw makeCapabilityError(
        'CCO_SEND_INPUT_INVALID',
        'idempotencyKey kravs for CCO send.'
      );
    }

    if (!graphSendEnabled) {
      throw makeCapabilityError(
        'CCO_SEND_DISABLED',
        'CCO send ar avstangt (ARCANA_GRAPH_SEND_ENABLED=false).'
      );
    }
    if (
      !graphSendConnector ||
      (typeof graphSendConnector.sendComposeDocument !== 'function' &&
        (isComposeMode
          ? typeof graphSendConnector.sendNewMessage !== 'function'
          : typeof graphSendConnector.sendReply !== 'function'))
    ) {
      throw makeCapabilityError(
        'CCO_SEND_CONNECTOR_UNAVAILABLE',
        'Microsoft Graph send connector saknas.'
      );
    }

    const allowlistSet = toCcoSendAllowlistSet(graphSendAllowlist);
    if (!allowlistSet.size) {
      throw makeCapabilityError(
        'CCO_SEND_ALLOWLIST_EMPTY',
        'ARCANA_GRAPH_SEND_ALLOWLIST ar tom. Minst en mailbox kravs.'
      );
    }
    const normalizedSenderMailboxLower = senderMailboxId.toLowerCase();
    const wildcardAllowed = allowlistSet.has('*');
    if (!wildcardAllowed && !allowlistSet.has(normalizedSenderMailboxLower)) {
      throw makeCapabilityError(
        'CCO_SEND_ALLOWLIST_BLOCKED',
        `Mailbox ar inte allowlistad for send: ${senderMailboxId}.`
      );
    }

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'cco.send.requested',
      outcome: 'success',
      targetType: 'cco_send',
      targetId: ccoSendRunId,
      metadata: {
        ccoSendRunId,
        sourceMailboxId,
        senderMailboxId,
        signatureProfile: signatureProfile.key,
        mode: isComposeMode ? 'compose' : 'reply',
        sendStrategy,
        conversationId,
        replyToMessageId,
        to,
        cc,
        bcc,
        composeDocumentVersion: composeDocumentSummary?.version || null,
        correlationId: normalizedCorrelationId,
        channel: normalizedChannel,
      },
    });

    let gatewayResult;
    try {
      gatewayResult = await runCapabilityThroughGateway({
        capabilityName,
        context: {
          tenant_id: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          intent: sendIntent,
          payload: {
            ccoSendRunId,
            sourceMailboxId,
            senderMailboxId,
            replyToMessageId,
            conversationId,
            to,
            cc,
            bcc,
            subject,
            body: composeDocument.content?.bodyText || '',
            bodyHtml: composeDocument.content?.bodyHtml || '',
            signatureProfile: signatureProfile.key,
            mode: isComposeMode ? 'compose' : 'reply',
            composeDocument: composeDocumentSummary,
          },
          correlation_id: normalizedCorrelationId,
          idempotency_key: normalizedIdempotencyKey,
        },
        handlers: {
          audit: async (event) => {
            await writeAudit({
              tenantId: normalizedTenantId,
              actorUserId: normalizedActor.id,
              action: event.action,
              outcome: event.outcome,
              targetType: 'gateway_run',
              targetId: String(event?.metadata?.runId || ''),
              metadata: {
                ...(event.metadata || {}),
                ccoSendRunId,
                capabilityName,
              },
            });
          },
          inputRisk: async () =>
            buildAllowRiskEvaluation({
              scope: 'input',
              buildVersion,
            }),
          agentRun: async () => ({
            output: {
              sourceMailboxId,
              senderMailboxId,
              replyToMessageId,
              conversationId,
              to,
              cc,
              bcc,
              subject,
              body: composeDocument.content?.bodyText || '',
              bodyHtml: composeDocument.content?.bodyHtml || '',
              signatureProfile: signatureProfile.key,
              mode: isComposeMode ? 'compose' : 'reply',
              composeDocument: composeDocumentSummary,
              confidenceLevel: 'High',
            },
          }),
          outputRisk: async ({ agentResult }) =>
            evaluateTemplateRisk({
              scope: 'output',
              category: 'INTERNAL',
              content: stringifyForRisk({
                subject: agentResult?.output?.subject || '',
                body: agentResult?.output?.body || '',
              }),
              tenantRiskModifier: 0,
              riskThresholdVersion: 1,
            }),
          policyFloor: async ({ agentResult }) =>
            evaluatePolicyFloorText({
              text: stringifyForRisk({
                subject: agentResult?.output?.subject || '',
                body: agentResult?.output?.body || '',
              }),
              context: 'patient_response',
            }),
          persist: async ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => {
            if (!['allow', 'allow_flag'].includes(String(decision || '').toLowerCase())) {
              const decisionError = makeCapabilityError(
                'CCO_SEND_REQUIRES_ALLOW',
                'CCO send kraver allow eller allow_flag.'
              );
              decisionError.nonRetryable = true;
              throw decisionError;
            }

            const persistedComposeDocument = buildCanonicalMailComposeDocument(
              {
                ...normalizedInput,
                mode: isComposeMode ? 'compose' : 'reply',
                sourceMailboxId,
                senderMailboxId,
                replyToMessageId,
                conversationId,
                to,
                cc,
                bcc,
                subject: String(agentResult?.output?.subject || ''),
                body: String(agentResult?.output?.body || ''),
              },
              {
                signatureProfile,
                renderedBodyText: String(agentResult?.output?.body || ''),
                renderedBodyHtml: String(agentResult?.output?.bodyHtml || ''),
                defaultSenderMailboxId:
                  mailboxSettingsDefaults.composeSenderMailboxId ||
                  mailboxSettingsDefaults.senderMailboxId ||
                  process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX ||
                  CCO_DEFAULT_SENDER_MAILBOX,
              }
            );

            const sendResult =
              typeof graphSendConnector.sendComposeDocument === 'function'
                ? await graphSendConnector.sendComposeDocument({
                    composeDocument: persistedComposeDocument,
                  })
                : isComposeMode
                  ? await graphSendConnector.sendNewMessage({
                      mailboxId: senderMailboxId,
                      sourceMailboxId,
                      body: String(agentResult?.output?.body || ''),
                      bodyHtml: String(agentResult?.output?.bodyHtml || ''),
                      subject: String(agentResult?.output?.subject || ''),
                      to,
                      cc,
                      bcc,
                    })
                  : await graphSendConnector.sendReply({
                      mailboxId: senderMailboxId,
                      sourceMailboxId,
                      replyToMessageId,
                      body: String(agentResult?.output?.body || ''),
                      bodyHtml: String(agentResult?.output?.bodyHtml || ''),
                      subject: String(agentResult?.output?.subject || ''),
                      to,
                      cc,
                      bcc,
                    });

            if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
              const storeError = makeCapabilityError(
                'CAPABILITY_ANALYSIS_STORE_MISSING',
                'Analysis store saknas for CCO send persist.'
              );
              storeError.nonRetryable = true;
              throw storeError;
            }

            const analysisEntry = await capabilityAnalysisStore.append({
              tenantId: normalizedTenantId,
              capability: {
                name: capabilityName,
                version: '1.0.0',
                persistStrategy: 'analysis',
              },
              decision,
              runId,
              capabilityRunId: ccoSendRunId,
              correlationId: normalizedCorrelationId,
              actor: normalizedActor,
              input: {
                sourceMailboxId,
                senderMailboxId,
                replyToMessageId,
                conversationId,
                to,
                cc,
                bcc,
                subject: maskInboxText(subject, 180),
                bodyPreview: maskInboxText(composeDocument.content?.bodyText || '', 360),
                bodyHtmlPreview: maskInboxText(composeDocument.content?.bodyHtml || '', 360),
                signatureProfile: signatureProfile.key,
                composeDocument: composeDocumentSummary,
              },
              output: {
                provider: sendResult.provider,
                sourceMailboxId,
                senderMailboxId: sendResult.mailboxId,
                replyToMessageId: sendResult.replyToMessageId,
                conversationId,
                to: sendResult.to,
                cc: Array.isArray(sendResult.cc) ? sendResult.cc : [],
                bcc: Array.isArray(sendResult.bcc) ? sendResult.bcc : [],
                subject: maskInboxText(subject, 180),
                bodyPreview: maskInboxText(composeDocument.content?.bodyText || '', 360),
                sentAt: sendResult.sentAt,
                sendMode: sendResult.sendMode || 'reply',
              },
              riskSummary: {
                input: inputRisk?.evaluation || null,
                output: outputRisk?.evaluation || null,
              },
              policySummary: {
                blocked: policy?.blocked === true,
                reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
              },
              metadata: {
                channel: normalizedChannel,
                requestMetadata: safeObject(requestMetadata),
                sendMode: 'manual',
                signatureProfile: signatureProfile.key,
                composeMode: isComposeMode,
                sendStrategy,
                composeDocumentVersion: composeDocumentSummary?.version || null,
              },
            });

            return {
              artifact_refs: {
                analysis_id: analysisEntry.id,
                send_provider: sendResult.provider,
                cco_send_run_id: ccoSendRunId,
              },
            };
          },
          safeResponse: ({ decision }) => ({
            error:
              isComposeMode
                ? 'Mejlet blockerades av risk/policy och skickades inte. Justera texten och forsok igen.'
                : 'Svar blockerades av risk/policy och skickades inte. Justera texten och forsok igen.',
            decision,
            ccoSendRunId,
          }),
          response: ({ runId, decision, inputRisk, outputRisk, policy, persisted, safeResponse }) => ({
            send: {
              ccoSendRunId,
              gatewayRunId: runId,
              sourceMailboxId,
              senderMailboxId,
              replyToMessageId,
              conversationId,
              decision,
              mode: 'manual',
              composeMode: isComposeMode,
              signatureProfile: signatureProfile.key,
              sendStrategy,
            },
            composeDocument: composeDocumentSummary,
            preview: {
              subject,
              body: composeDocument.content?.bodyText || '',
              bodyHtml: composeDocument.content?.bodyHtml || '',
            },
            decision,
            riskSummary: {
              input: inputRisk?.evaluation || null,
              output: outputRisk?.evaluation || null,
            },
            policySummary: {
              blocked: policy?.blocked === true,
              reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
            },
            artifactRefs: persisted?.artifact_refs || null,
            safeResponse: safeResponse || null,
          }),
        },
      });
    } catch (error) {
      await writeAudit({
        tenantId: normalizedTenantId,
        actorUserId: normalizedActor.id,
        action: 'cco.send.error',
        outcome: 'error',
        targetType: 'cco_send',
        targetId: ccoSendRunId,
        metadata: {
          ccoSendRunId,
          sourceMailboxId,
          senderMailboxId,
          signatureProfile: signatureProfile.key,
          mode: isComposeMode ? 'compose' : 'reply',
          sendStrategy,
          conversationId,
          replyToMessageId,
          composeDocumentVersion: composeDocumentSummary?.version || null,
          correlationId: normalizedCorrelationId,
          errorCode: error?.code || null,
          errorMessage: normalizeText(error?.message) || 'cco_send_error',
        },
      });
      throw error;
    }

    const blocked =
      gatewayResult?.decision === 'blocked' ||
      gatewayResult?.decision === 'critical_escalate';
    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: blocked ? 'cco.send.blocked' : 'cco.send.sent',
      outcome: blocked ? 'blocked' : 'success',
      targetType: 'cco_send',
      targetId: ccoSendRunId,
      metadata: {
        ccoSendRunId,
        sourceMailboxId,
        senderMailboxId,
        signatureProfile: signatureProfile.key,
        mode: isComposeMode ? 'compose' : 'reply',
        sendStrategy,
        conversationId,
        replyToMessageId,
        composeDocumentVersion: composeDocumentSummary?.version || null,
        correlationId: normalizedCorrelationId,
        decision: gatewayResult?.decision || null,
        gatewayRunId: gatewayResult?.run_id || null,
      },
    });

    return {
      ccoSendRunId,
      gatewayResult,
    };
  }

  async function runCcoHandled(params = {}) {
    return runCcoConversationStateAction({
      action: 'handled',
      ...params,
    });
  }

  async function runCcoReplyLater(params = {}) {
    return runCcoConversationStateAction({
      action: 'reply_later',
      ...params,
    });
  }

  return {
    listCapabilities,
    listAgentBundles,
    runCapability,
    runAgent,
    runCcoHandled,
    runCcoReplyLater,
    runCcoSend,
  };
}

module.exports = {
  createCapabilityExecutor,
  buildCcoSignatureHtml,
  applyCcoSignatureHtml,
  resolveCcoSignatureProfile,
  resolveCcoSignatureSelection,
};
