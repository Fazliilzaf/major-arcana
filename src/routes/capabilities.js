const crypto = require('node:crypto');
const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { createExecutionGateway } = require('../gateway/executionGateway');
const {
  createCapabilityExecutor,
  applyCcoSignatureHtml,
  resolveCcoSignatureProfile,
  resolveCcoSignatureSelection,
} = require('../capabilities/executionService');
const { createMicrosoftGraphReadConnector } = require('../infra/microsoftGraphReadConnector');
const { createMicrosoftGraphSendConnector } = require('../infra/microsoftGraphSendConnector');
const { createMicrosoftGraphMailboxTruthBackfill } = require('../infra/microsoftGraphMailboxTruthBackfill');
const {
  isValidEmail,
  normalizeMailboxAddress,
  toWritingProfile,
} = require('../intelligence/writingIdentityRegistry');
const {
  listWritingIdentityProfiles,
  upsertWritingIdentityProfile,
} = require('../intelligence/writingIdentityStore');
const {
  extractAndPersistWritingIdentityProfiles,
} = require('../intelligence/writingProfileExtractor');
const {
  computeUsageAnalytics,
  computeWorklistSnapshotMetrics,
  computeHealthScore,
} = require('../intelligence/usageAnalyticsEngine');
const { evaluateRedFlag } = require('../intelligence/redFlagEngine');
const { resolveAdaptiveFocusState } = require('../intelligence/adaptiveFocusController');
const { evaluateRecovery } = require('../intelligence/recoveryEngine');
const { evaluateStrategicInsights } = require('../intelligence/strategicInsightsEngine');
const { summarizeShadowReview } = require('../ops/ccoShadowRun');
const { buildCanonicalMailDocument } = require('../ops/ccoMailDocument');
const {
  buildCanonicalMailMimeMetadata,
  getMailMimeTriggerReasons,
} = require('../ops/ccoMailMimeLayer');
const {
  buildCanonicalCcoMailboxSettingsDocument,
} = require('../ops/ccoMailboxSettingsDocument');
const { buildCanonicalMailThreadDocument } = require('../ops/ccoMailThreadHydrator');
const { createCcoMailboxTruthReadAdapter } = require('../ops/ccoMailboxTruthReadAdapter');
const { createCcoMailboxTruthWorklistReadModel } = require('../ops/ccoMailboxTruthWorklistReadModel');
const { createCcoMailboxTruthWorklistShadow } = require('../ops/ccoMailboxTruthWorklistShadow');

const CCO_LIFECYCLE_AUDIT_STATES = new Set([
  'NEW',
  'ACTIVE_DIALOGUE',
  'AWAITING_REPLY',
  'FOLLOW_UP_PENDING',
  'DORMANT',
  'HANDLED',
  'ARCHIVED',
]);
const ccoLifecycleTrackerByTenant = new Map();
const CCO_GRAPH_READ_DEFAULT_ALLOWLIST = Object.freeze([
  'egzona@hairtpclinic.com',
  'contact@hairtpclinic.com',
  'fazli@hairtpclinic.com',
  'info@hairtpclinic.com',
  'kons@hairtpclinic.com',
  'marknad@hairtpclinic.com',
]);
const CCO_GRAPH_READ_LOCKED_ALLOWLIST_SET = new Set(
  CCO_GRAPH_READ_DEFAULT_ALLOWLIST.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
);
const CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS = Object.freeze([
  'kons@hairtpclinic.com',
  'info@hairtpclinic.com',
  'contact@hairtpclinic.com',
  'egzona@hairtpclinic.com',
  'fazli@hairtpclinic.com',
]);
const CCO_KONS_HISTORY_DEFAULT_MAILBOX = 'kons@hairtpclinic.com';
const CCO_KONS_HISTORY_DEFAULT_LOOKBACK_DAYS = 1095;
const CCO_KONS_HISTORY_MAX_LOOKBACK_DAYS = 1825;
const CCO_KONS_HISTORY_CHUNK_DAYS = 30;
const CCO_KONS_HISTORY_RECENT_FRESHNESS_MS = 10 * 60 * 1000;
const CCO_ANALYZE_HISTORY_SIGNAL_LOOKBACK_DAYS = 365;
const CCO_ANALYZE_HISTORY_SIGNAL_RECENT_WINDOW_DAYS = 45;
const CCO_HISTORY_SIGNAL_RESCHEDULE_PATTERN =
  /\b(ombok|boka om|avbok|cancel|cancell|resched|ny tid|andra tid|ändra tid|flytta tid)\b/i;
const CCO_HISTORY_SIGNAL_COMPLAINT_PATTERN =
  /\b(klag|complaint|missn[oö]jd|besviken|arg|reklamation|frustrerad|problem)\b/i;
const CCO_HISTORY_SIGNAL_BOOKING_PATTERN =
  /\b(boka|booking|appointment|konsultation|consultation|tid)\b/i;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function attachMailDocuments(messages = [], { sourceStore = 'unknown' } = {}) {
  return asArray(messages).map((message) => ({
    ...message,
    mailDocument: buildCanonicalMailDocument(message, { sourceStore }),
  }));
}

function attachMailThreadHydration(
  messages = [],
  {
    sourceStore = 'unknown',
    conversationId = '',
    customerEmail = '',
  } = {}
) {
  const threadDocument = buildCanonicalMailThreadDocument(messages, {
    sourceStore,
    conversationId,
    customerEmail,
  });
  const threadMessagesById = new Map(
    asArray(threadDocument?.messages).map((message) => [normalizeText(message?.messageId), message])
  );
  return {
    messages: asArray(messages).map((message) => ({
      ...message,
      mailThreadMessage:
        threadMessagesById.get(normalizeText(message?.messageId || message?.graphMessageId)) ||
        null,
    })),
    threadDocument,
  };
}

async function enrichMessagesWithMailAssets({
  messages = [],
  graphReadConnector = null,
  label = 'CCO runtime history mail asset enrichment',
} = {}) {
  const safeMessages = asArray(messages);
  if (!safeMessages.length || !graphReadConnector) return safeMessages;
  const shouldEnrich = safeMessages.some(
    (message) =>
      message?.hasAttachments === true ||
      /<img\b|cid:|data:image\//i.test(normalizeText(message?.bodyHtml))
  );
  if (!shouldEnrich) return safeMessages;
  try {
    if (typeof graphReadConnector.enrichStoredMessagesWithMailAssets === 'function') {
      return await graphReadConnector.enrichStoredMessagesWithMailAssets({
        messages: safeMessages,
        label,
      });
    }
    if (typeof graphReadConnector.enrichStoredMessagesWithInlineHtmlAssets === 'function') {
      return await graphReadConnector.enrichStoredMessagesWithInlineHtmlAssets({
        messages: safeMessages,
        label,
      });
    }
  } catch (_error) {
  }
  return safeMessages;
}

async function enrichMessagesWithMailMime({
  messages = [],
  graphReadConnector = null,
  label = 'CCO runtime history MIME enrichment',
  maxMessages = 3,
} = {}) {
  const safeMessages = asArray(messages).map((message) =>
    message && typeof message === 'object' ? { ...message } : message
  );
  if (
    !safeMessages.length ||
    !graphReadConnector ||
    typeof graphReadConnector.fetchMessageMimeContent !== 'function'
  ) {
    return safeMessages;
  }

  const candidates = safeMessages
    .map((message, index) => ({
      index,
      message,
      triggerReasons: getMailMimeTriggerReasons(message),
    }))
    .filter(
      (entry) =>
        entry.triggerReasons.length > 0 &&
        normalizeText(entry?.message?.graphMessageId || entry?.message?.messageId) &&
        normalizeText(
          entry?.message?.userPrincipalName ||
            entry?.message?.mailboxAddress ||
            entry?.message?.mailboxId
        )
    )
    .slice(0, Math.max(1, Number(maxMessages || 3)));

  if (!candidates.length) return safeMessages;

  for (const candidate of candidates) {
    const safeMessage =
      candidate.message && typeof candidate.message === 'object' ? { ...candidate.message } : {};
    try {
      const mimePayload = await graphReadConnector.fetchMessageMimeContent({
        userId: normalizeText(
          safeMessage?.userPrincipalName || safeMessage?.mailboxAddress || safeMessage?.mailboxId
        ),
        messageId: normalizeText(safeMessage?.graphMessageId || safeMessage?.messageId),
        label,
        timeoutMs: 7000,
      });
      safeMessages[candidate.index] = {
        ...safeMessage,
        mime: buildCanonicalMailMimeMetadata({
          rawMime: mimePayload?.rawMime,
          contentType: mimePayload?.contentType,
          fetchState: normalizeText(mimePayload?.rawMime) ? 'fetched' : 'empty',
          triggerReasons: candidate.triggerReasons,
        }),
      };
    } catch (error) {
      safeMessages[candidate.index] = {
        ...safeMessage,
        mime: buildCanonicalMailMimeMetadata({
          fetchState: 'failed',
          triggerReasons: candidate.triggerReasons,
          errorCode: normalizeText(error?.code),
          errorMessage: normalizeText(error?.message),
        }),
      };
    }
  }

  return safeMessages;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeGraphUserScope(value, fallback = 'single') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'all' || normalized === 'single') return normalized;
  return fallback;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLifecycleAuditState(value = '') {
  const normalized = normalizeText(value).toUpperCase();
  if (CCO_LIFECYCLE_AUDIT_STATES.has(normalized)) return normalized;
  if (normalized === 'NEW_LEAD') return 'NEW';
  if (normalized === 'WAITING' || normalized === 'WAITING_ON_CUSTOMER') return 'AWAITING_REPLY';
  if (normalized === 'FOLLOW_UP_SCHEDULED') return 'FOLLOW_UP_PENDING';
  if (normalized === 'CLOSED' || normalized === 'RESOLVED') return 'HANDLED';
  return '';
}

function formatSignaturePreviewBodyHtml(value = '') {
  const safeBody = normalizeText(value) || 'Kontrollerat inspectionsmail från CCO-next.';
  return escapeHtml(safeBody).replace(/\r?\n/g, '<br />');
}

function buildSignaturePreviewDocument({
  profile = null,
  senderMailboxId = '',
  emailHtml = '',
} = {}) {
  const safeProfileName = normalizeText(profile?.fullName) || normalizeText(profile?.label) || 'Fazli Krasniqi';
  const safeProfileKey = normalizeText(profile?.key) || 'fazli';
  const safeSenderMailbox = normalizeText(senderMailboxId) || 'fazli@hairtpclinic.com';
  const safeEmailHtml = String(emailHtml || '');

  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CCO Signaturpreview</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe7;
        --panel: rgba(255, 252, 248, 0.92);
        --panel-strong: #ffffff;
        --line: rgba(120, 105, 90, 0.16);
        --text: #2f2f33;
        --muted: rgba(70, 60, 50, 0.62);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        font-family: Arial, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(219, 204, 190, 0.28), transparent 28%),
          linear-gradient(180deg, #fbf7f2 0%, var(--bg) 100%);
        color: var(--text);
      }
      .page {
        max-width: 1360px;
        margin: 0 auto;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 24px;
        margin-bottom: 24px;
      }
      .title {
        margin: 0;
        font-size: 28px;
        line-height: 1.1;
        font-weight: 700;
      }
      .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.25;
      }
      .meta-chip {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 7px 12px;
        background: rgba(255,255,255,0.72);
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(620px, 1fr) 430px;
        gap: 24px;
        align-items: start;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 20px;
        box-shadow:
          0 8px 24px rgba(70, 50, 30, 0.08),
          0 2px 6px rgba(70, 50, 30, 0.05),
          inset 0 1px 0 rgba(255,255,255,0.55);
        overflow: hidden;
      }
      .panel-head {
        padding: 16px 20px;
        border-bottom: 1px solid var(--line);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .panel-title {
        margin: 0;
        font-size: 16px;
        line-height: 1.2;
        font-weight: 700;
      }
      .panel-subtitle {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.2;
      }
      .frame {
        padding: 20px;
        background: var(--panel-strong);
      }
      .desktop-canvas {
        min-height: 560px;
        border-radius: 16px;
        border: 1px solid rgba(120, 105, 90, 0.1);
        background: #ffffff;
        padding: 28px;
      }
      .mobile-shell {
        margin: 0 auto;
        width: 390px;
        max-width: 100%;
        border-radius: 32px;
        padding: 14px;
        background: #111214;
        box-shadow:
          0 18px 44px rgba(25, 16, 12, 0.18),
          inset 0 1px 0 rgba(255,255,255,0.12);
      }
      .mobile-screen {
        min-height: 720px;
        border-radius: 24px;
        background: #ffffff;
        padding: 24px 20px;
        overflow: hidden;
      }
      .email-preview {
        width: 100%;
      }
      .hint {
        margin: 16px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.35;
      }
      @media (max-width: 1180px) {
        body { padding: 20px; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div>
          <h1 class="title">CCO signaturpreview</h1>
          <div class="meta">
            <span class="meta-chip">Profil: ${escapeHtml(safeProfileName)}</span>
            <span class="meta-chip">Nyckel: ${escapeHtml(safeProfileKey)}</span>
            <span class="meta-chip">Avsändare: ${escapeHtml(safeSenderMailbox)}</span>
          </div>
        </div>
      </div>
      <div class="grid">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">Desktop</h2>
              <div class="panel-subtitle">Samma utskicks-HTML i bred klient</div>
            </div>
          </div>
          <div class="frame">
            <div class="desktop-canvas">
              <div class="email-preview">${safeEmailHtml}</div>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">Mobil</h2>
              <div class="panel-subtitle">Samma utskicks-HTML i smal klient</div>
            </div>
          </div>
          <div class="frame">
            <div class="mobile-shell">
              <div class="mobile-screen">
                <div class="email-preview">${safeEmailHtml}</div>
              </div>
            </div>
            <p class="hint">Previewn återanvänder exakt signatur-HTML från utskicket. Det är alltså samma markup som går ut i mail.</p>
          </div>
        </section>
      </div>
    </div>
  </body>
</html>`;
}

function toCcoSignaturePreviewHandler() {
  return async (req, res) => {
    const profile = resolveCcoSignatureSelection(req.query || {});
    const senderMailboxId =
      normalizeMailboxAddress(req.query?.senderMailboxId) ||
      normalizeMailboxAddress(profile?.senderMailboxId) ||
      'contact@hairtpclinic.com';
    const bodyHtml = formatSignaturePreviewBodyHtml(req.query?.body);
    const emailHtml = applyCcoSignatureHtml({
      bodyHtml,
      profile,
      senderMailboxId,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(
      buildSignaturePreviewDocument({
        profile,
        senderMailboxId,
        emailHtml,
      })
    );
  };
}

function extractCcoWorklistRowsFromResult(result = {}) {
  const payload = asObject(result?.gatewayResult?.response_payload);
  const output = asObject(payload.output);
  const directData = asObject(payload.data);
  const outputData = asObject(output.data);
  const fallbackData = asObject(payload);
  const candidates = [outputData, directData, fallbackData];
  for (const candidate of candidates) {
    const rows = asArray(candidate.conversationWorklist);
    if (rows.length > 0) return rows;
  }
  return [];
}

async function maybeWriteCcoLifecycleAuditEvents({
  authStore,
  tenantId = '',
  actorUserId = '',
  correlationId = '',
  result = {},
} = {}) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
  const safeTenantId = normalizeText(tenantId);
  if (!safeTenantId) return;
  const rows = extractCcoWorklistRowsFromResult(result);
  if (!rows.length) return;

  const tracker = ccoLifecycleTrackerByTenant.get(safeTenantId) || new Map();
  const safeActorUserId = normalizeText(actorUserId) || 'system';
  const safeCorrelationId = normalizeText(correlationId) || null;

  for (const row of rows.slice(0, 500)) {
    const conversationId = normalizeText(row?.conversationId);
    if (!conversationId) continue;
    const state = normalizeLifecycleAuditState(
      row?.lifecycleStatus || row?.customerSummary?.lifecycleStatus
    );
    if (!state) continue;
    const previousState = normalizeLifecycleAuditState(tracker.get(conversationId));
    const metadata = {
      correlationId: safeCorrelationId,
      conversationId,
      lifecycleState: state,
      lastInboundAt: toIso(row?.lastInboundAt),
      lastOutboundAt: toIso(row?.lastOutboundAt),
    };

    if (!previousState) {
      await authStore.addAuditEvent({
        tenantId: safeTenantId,
        actorUserId: safeActorUserId,
        action: 'cco.lifecycle.enter',
        outcome: 'success',
        targetType: 'cco_conversation',
        targetId: conversationId,
        metadata,
      });
      tracker.set(conversationId, state);
      continue;
    }

    if (previousState === state) continue;
    await authStore.addAuditEvent({
      tenantId: safeTenantId,
      actorUserId: safeActorUserId,
      action: 'cco.lifecycle.exit',
      outcome: 'success',
      targetType: 'cco_conversation',
      targetId: conversationId,
      metadata: {
        ...metadata,
        lifecycleState: previousState,
        nextLifecycleState: state,
      },
    });
    await authStore.addAuditEvent({
      tenantId: safeTenantId,
      actorUserId: safeActorUserId,
      action: 'cco.lifecycle.enter',
      outcome: 'success',
      targetType: 'cco_conversation',
      targetId: conversationId,
      metadata: {
        ...metadata,
        previousLifecycleState: previousState,
      },
    });
    tracker.set(conversationId, state);
  }

  ccoLifecycleTrackerByTenant.set(safeTenantId, tracker);
}

function pickErrorStatus(errorCode = '') {
  const code = normalizeText(errorCode).toUpperCase();
  if (code === 'CAPABILITY_NOT_FOUND') return 404;
  if (code === 'CAPABILITY_AGENT_NOT_FOUND') return 404;
  if (code === 'CAPABILITY_ROLE_DENIED' || code === 'CAPABILITY_CHANNEL_DENIED') return 403;
  if (code === 'CAPABILITY_AGENT_ROLE_DENIED' || code === 'CAPABILITY_AGENT_CHANNEL_DENIED') {
    return 403;
  }
  if (code === 'CAPABILITY_AGENT_DEPENDENCY_BLOCKED') return 403;
  if (code === 'CAPABILITY_INPUT_INVALID' || code === 'CAPABILITY_OUTPUT_INVALID') return 422;
  if (code === 'CAPABILITY_AGENT_INPUT_INVALID' || code === 'CAPABILITY_AGENT_OUTPUT_INVALID') {
    return 422;
  }
  if (code === 'CAPABILITY_AGENT_NOT_IMPLEMENTED') return 400;
  if (code === 'CAPABILITY_INVALID_TENANT') return 400;
  if (code === 'CCO_SEND_INPUT_INVALID') return 422;
  if (code === 'CCO_SEND_REQUIRES_ALLOW') return 403;
  if (code === 'CCO_SEND_ALLOWLIST_BLOCKED') return 403;
  if (code === 'CCO_SEND_ALLOWLIST_EMPTY') return 503;
  if (code === 'CCO_SEND_DISABLED') return 503;
  if (code === 'CCO_SEND_CONNECTOR_UNAVAILABLE') return 503;
  if (code === 'CCO_DELETE_INPUT_INVALID') return 422;
  if (code === 'CCO_DELETE_NOT_ENABLED') return 503;
  if (code === 'CCO_DELETE_CONNECTOR_UNAVAILABLE') return 503;
  if (code === 'CCO_DELETE_ALLOWLIST_EMPTY') return 503;
  if (code === 'CCO_DELETE_ALLOWLIST_BLOCKED') return 403;
  if (code === 'CCO_DELETE_GRAPH_ERROR') return 502;
  return 500;
}

function toTemplateChangeSnapshot(template = {}) {
  return {
    templateId: normalizeText(template.id) || null,
    templateName: normalizeText(template.name) || null,
    category: normalizeText(template.category) || null,
    updatedAt: normalizeText(template.updatedAt) || null,
    currentActiveVersionId: normalizeText(template.currentActiveVersionId) || null,
  };
}

function toOpenReviewSnapshot(evaluation = {}) {
  return {
    id: normalizeText(evaluation.id) || null,
    templateId: normalizeText(evaluation.templateId) || null,
    templateVersionId: normalizeText(evaluation.templateVersionId) || null,
    category: normalizeText(evaluation.category) || null,
    decision: normalizeText(evaluation.decision) || null,
    ownerDecision: normalizeText(evaluation.ownerDecision) || null,
    riskLevel: Number(evaluation.riskLevel || 0),
    riskScore: Number(evaluation.riskScore || 0),
    evaluatedAt: normalizeText(evaluation.evaluatedAt) || null,
    reasonCodes: Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes.slice(0, 6) : [],
  };
}

function toIncidentSnapshot(incident = {}) {
  return {
    id: normalizeText(incident.id) || null,
    category: normalizeText(incident.category) || null,
    riskLevel: Number(incident.riskLevel || 0),
    decision: normalizeText(incident.decision) || null,
    reasonCodes: Array.isArray(incident.reasonCodes) ? incident.reasonCodes.slice(0, 10) : [],
    severity: normalizeText(incident.severity) || null,
    status: normalizeText(incident.status) || null,
    ownerDecision: normalizeText(incident.ownerDecision) || null,
    openedAt: normalizeText(incident.openedAt) || null,
    updatedAt: normalizeText(incident.updatedAt) || null,
    sla:
      incident?.sla && typeof incident.sla === 'object'
        ? {
            state: normalizeText(incident.sla.state) || null,
            breached: incident.sla.breached === true,
            deadline: normalizeText(incident.sla.deadline) || null,
          }
        : null,
  };
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

function toIncidentSeverityWeight(incident = {}) {
  const severity = normalizeText(incident?.severity).toUpperCase();
  if (severity === 'L5') return 5;
  if (severity === 'L4') return 4;
  if (severity === 'L3') return 3;
  const riskLevel = toNumber(incident?.riskLevel, 0);
  if (riskLevel >= 5) return 5;
  if (riskLevel >= 4) return 4;
  if (riskLevel >= 3) return 3;
  return 0;
}

function toIncidentWindowCounts(incidents = [], windowDays = 14) {
  const safeWindowDays = Math.max(1, Math.min(90, toNumber(windowDays, 14)));
  const thresholdMs = Date.now() - safeWindowDays * 24 * 60 * 60 * 1000;
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const windowItems = safeIncidents.filter((incident) => {
    const tsMs = toTimestampMs(incident?.updatedAt || incident?.openedAt);
    if (!Number.isFinite(tsMs)) return false;
    return tsMs >= thresholdMs;
  });

  const breakdown = { L3: 0, L4: 0, L5: 0 };
  let highRisk = 0;
  let escalated = 0;
  for (const incident of windowItems) {
    const severityWeight = toIncidentSeverityWeight(incident);
    if (severityWeight >= 5) breakdown.L5 += 1;
    else if (severityWeight >= 4) breakdown.L4 += 1;
    else if (severityWeight >= 3) breakdown.L3 += 1;
    if (severityWeight >= 4) highRisk += 1;
    const ownerDecision = normalizeText(incident?.ownerDecision).toLowerCase();
    if (ownerDecision === 'escalate_to_owner' || ownerDecision === 'escalate_to_medical') {
      escalated += 1;
    }
  }

  return {
    windowDays: safeWindowDays,
    total: windowItems.length,
    ...breakdown,
    highRisk,
    escalated,
  };
}

function toReviewWindowCounts(openReviews = [], windowDays = 14) {
  const safeWindowDays = Math.max(1, Math.min(90, toNumber(windowDays, 14)));
  const thresholdMs = Date.now() - safeWindowDays * 24 * 60 * 60 * 1000;
  const safeReviews = Array.isArray(openReviews) ? openReviews : [];
  const windowItems = safeReviews.filter((review) => {
    const tsMs = toTimestampMs(review?.evaluatedAt || review?.updatedAt);
    if (!Number.isFinite(tsMs)) return false;
    return tsMs >= thresholdMs;
  });

  let highCritical = 0;
  let blocked = 0;
  for (const review of windowItems) {
    if (toNumber(review?.riskLevel, 0) >= 4) highCritical += 1;
    if (normalizeText(review?.decision).toLowerCase() === 'blocked') blocked += 1;
  }

  return {
    windowDays: safeWindowDays,
    total: windowItems.length,
    highCritical,
    blocked,
  };
}

function toIncidentAgeBuckets(incidents = []) {
  const buckets = {
    lt1d: 0,
    d1to3: 0,
    d4to7: 0,
    gt7: 0,
    unknown: 0,
  };
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  for (const incident of safeIncidents) {
    const tsMs = toTimestampMs(incident?.openedAt || incident?.updatedAt);
    if (!Number.isFinite(tsMs)) {
      buckets.unknown += 1;
      continue;
    }
    const ageDays = (Date.now() - tsMs) / (24 * 60 * 60 * 1000);
    if (ageDays < 1) buckets.lt1d += 1;
    else if (ageDays < 4) buckets.d1to3 += 1;
    else if (ageDays < 8) buckets.d4to7 += 1;
    else buckets.gt7 += 1;
  }
  return buckets;
}

function toTemplateHistorySummary(latestTemplateChanges = []) {
  const safeChanges = Array.isArray(latestTemplateChanges) ? latestTemplateChanges : [];
  const byCategory = {};
  let newestUpdatedAt = null;
  let oldestUpdatedAt = null;
  for (const change of safeChanges) {
    const category = normalizeText(change?.category) || 'unknown';
    byCategory[category] = (byCategory[category] || 0) + 1;
    const updatedIso = toIso(change?.updatedAt);
    if (!updatedIso) continue;
    if (!newestUpdatedAt || Date.parse(updatedIso) > Date.parse(newestUpdatedAt)) {
      newestUpdatedAt = updatedIso;
    }
    if (!oldestUpdatedAt || Date.parse(updatedIso) < Date.parse(oldestUpdatedAt)) {
      oldestUpdatedAt = updatedIso;
    }
  }

  return {
    totalRecentChanges: safeChanges.length,
    byCategory,
    newestUpdatedAt,
    oldestUpdatedAt,
  };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function compareIsoDesc(left = '', right = '') {
  return String(right || '').localeCompare(String(left || ''));
}

function toWritingIdentityProfilesMap(source = null) {
  const map = {};
  if (!source || typeof source !== 'object') return map;
  const profileMap =
    source.profilesByMailbox && typeof source.profilesByMailbox === 'object'
      ? source.profilesByMailbox
      : source;
  if (!profileMap || typeof profileMap !== 'object') return map;
  for (const [rawMailbox, rawProfile] of Object.entries(profileMap)) {
    const mailbox = normalizeMailboxAddress(rawMailbox);
    if (!isValidEmail(mailbox)) continue;
    if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) continue;
    map[mailbox] = toWritingProfile(rawProfile.profile || rawProfile);
  }
  return map;
}

function mergeWritingIdentityProfiles({
  storedProfiles = {},
  inputProfiles = {},
}) {
  const merged = {
    ...toWritingIdentityProfilesMap(storedProfiles),
    ...toWritingIdentityProfilesMap(inputProfiles),
  };
  if (!Object.keys(merged).length) return null;
  return { profilesByMailbox: merged };
}

function toMailboxAddress(value = '') {
  const mailbox = normalizeMailboxAddress(value);
  return isValidEmail(mailbox) ? mailbox : '';
}

function toMailboxAliases(value = '') {
  const normalized = toMailboxAddress(value);
  if (!normalized) return [];
  const [localPart = '', domainPart = ''] = normalized.split('@');
  const aliases = new Set([normalized]);
  const plusNormalized = localPart.replace(/\+.*/, '');
  if (plusNormalized && plusNormalized !== localPart) {
    aliases.add(`${plusNormalized}@${domainPart}`);
  }
  const separatorless = plusNormalized.replace(/[._-]/g, '');
  if (separatorless && separatorless !== plusNormalized) {
    aliases.add(`${separatorless}@${domainPart}`);
  }
  const domainMatch = domainPart.match(/^([a-z0-9.-]+)\.(com|se)$/i);
  if (domainMatch) {
    const domainRoot = normalizeText(domainMatch[1]).toLowerCase();
    const flippedTld = normalizeText(domainMatch[2]).toLowerCase() === 'com' ? 'se' : 'com';
    if (domainRoot) {
      aliases.add(`${plusNormalized}@${domainRoot}.${flippedTld}`);
      if (separatorless) aliases.add(`${separatorless}@${domainRoot}.${flippedTld}`);
    }
  }
  return Array.from(aliases);
}

function matchesMailboxAddressAlias(target = '', candidates = []) {
  const targetAliases = new Set(toMailboxAliases(target));
  if (targetAliases.size === 0) return false;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    for (const alias of toMailboxAliases(candidate)) {
      if (targetAliases.has(alias)) return true;
    }
    const normalizedCandidate = toMailboxAddress(candidate);
    if (normalizedCandidate && targetAliases.has(normalizedCandidate)) return true;
  }
  return false;
}

function parseMailboxList(raw = null) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => toMailboxAddress(item))
    .filter(Boolean);
}

function parseMailboxIndexes(rawValue = '', maxItems = 200) {
  const tokens = String(rawValue || '')
    .split(/[,\s]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const seen = new Set();
  const indexes = [];
  for (const token of tokens) {
    const parsed = Number.parseInt(token, 10);
    if (!Number.isFinite(parsed)) continue;
    if (parsed < 1 || parsed > maxItems) continue;
    if (seen.has(parsed)) continue;
    seen.add(parsed);
    indexes.push(parsed);
  }
  return indexes;
}

function parseMailboxIds(rawValue = '', maxItems = 200) {
  const tokens = String(rawValue || '')
    .split(/[,\s;]+/)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  const seen = new Set();
  const mailboxIds = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    if (mailboxIds.length >= maxItems) break;
    seen.add(token);
    mailboxIds.push(token);
  }
  return mailboxIds;
}

function parseMailboxIdValues(rawValue = [], maxItems = 200) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const tokens = [];
  for (const value of values) {
    const parsed = parseMailboxIds(value, maxItems);
    for (const token of parsed) {
      if (tokens.length >= maxItems) break;
      tokens.push(token);
    }
    if (tokens.length >= maxItems) break;
  }
  return tokens;
}

function normalizeMailboxIdList(rawMailboxIds = [], maxItems = 50) {
  const normalized = [];
  const seen = new Set();
  for (const rawMailboxId of Array.isArray(rawMailboxIds) ? rawMailboxIds : []) {
    if (normalized.length >= maxItems) break;
    const mailboxId = toMailboxAddress(rawMailboxId);
    if (!mailboxId || seen.has(mailboxId)) continue;
    seen.add(mailboxId);
    normalized.push(mailboxId);
  }
  return normalized;
}

function resolveCcoRuntimeHistoryMailboxIds(input = {}) {
  const safeInput = asObject(input);
  const explicitMailboxIds = normalizeMailboxIdList(
    parseMailboxIdValues(safeInput.mailboxIds, 50),
    50
  ).filter((mailboxId) => CCO_GRAPH_READ_LOCKED_ALLOWLIST_SET.has(mailboxId));
  if (explicitMailboxIds.length > 0) return explicitMailboxIds;

  const fallbackMailboxId = toMailboxAddress(safeInput.mailboxId);
  if (fallbackMailboxId && CCO_GRAPH_READ_LOCKED_ALLOWLIST_SET.has(fallbackMailboxId)) {
    return [fallbackMailboxId];
  }

  return CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS.slice();
}

function resolveAnalyzeInboxMailboxIds(input = {}) {
  const safeInput = asObject(input);
  const explicitMailboxIds = normalizeMailboxIdList(
    parseMailboxIdValues(safeInput.mailboxIds, 50),
    50
  ).filter((mailboxId) => CCO_GRAPH_READ_LOCKED_ALLOWLIST_SET.has(mailboxId));
  if (explicitMailboxIds.length > 0) return explicitMailboxIds;

  const fallbackMailboxId = toMailboxAddress(safeInput.mailboxId || safeInput.mailboxAddress);
  if (fallbackMailboxId && CCO_GRAPH_READ_LOCKED_ALLOWLIST_SET.has(fallbackMailboxId)) {
    return [fallbackMailboxId];
  }

  return [];
}

function parseCcoRuntimeOptionList(rawValue = null, maxItems = 20) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const tokens = [];
  const seen = new Set();
  for (const value of values) {
    const parts = String(value || '')
      .split(/[,\s;]+/)
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean);
    for (const part of parts) {
      if (seen.has(part)) continue;
      seen.add(part);
      tokens.push(part);
      if (tokens.length >= maxItems) return tokens;
    }
  }
  return tokens;
}

function normalizeCcoRuntimeHistoryResultTypes(values = []) {
  const normalized = [];
  const seen = new Set();
  for (const value of parseCcoRuntimeOptionList(values, 10)) {
    const resultType =
      value === 'mail' || value === 'email'
        ? 'message'
        : value === 'utfall'
          ? 'outcome'
          : value === 'activity' || value === 'event'
            ? 'action'
            : value;
    if (!['message', 'outcome', 'action'].includes(resultType) || seen.has(resultType)) continue;
    seen.add(resultType);
    normalized.push(resultType);
  }
  return normalized;
}

function normalizeCcoRuntimeHistoryActionTypes(values = []) {
  const normalized = [];
  const seen = new Set();
  for (const value of parseCcoRuntimeOptionList(values, 12)) {
    const actionType =
      value === 'sent' || value === 'replysent'
        ? 'reply_sent'
        : value === 'later' || value === 'snoozed'
          ? 'reply_later'
          : value === 'replied'
            ? 'customer_replied'
            : value === 'deleted'
              ? 'conversation_deleted'
              : value;
    if (
      !['reply_sent', 'reply_later', 'customer_replied', 'conversation_deleted'].includes(actionType) ||
      seen.has(actionType)
    ) {
      continue;
    }
    seen.add(actionType);
    normalized.push(actionType);
  }
  return normalized;
}

function normalizeCcoRuntimeHistoryOutcomeCodes(values = []) {
  const normalized = [];
  const seen = new Set();
  for (const value of parseCcoRuntimeOptionList(values, 12)) {
    const outcomeCode =
      value === 'booked' || value === 'bokad'
        ? 'booked'
        : value === 'rebooked' || value === 'ombokad'
          ? 'rebooked'
          : value === 'replied' || value === 'besvarat'
            ? 'replied'
            : value === 'notinterested' || value === 'ejintresserad'
              ? 'not_interested'
              : value === 'escalated' || value === 'eskalerad'
                ? 'escalated'
                : value === 'noresponse' || value === 'ingenrespons'
                  ? 'no_response'
                  : value === 'closedwithoutaction' || value === 'stängdutanåtgärd' || value === 'stangdutanatgard'
                    ? 'closed_no_action'
                    : value;
    if (
      ![
        'booked',
        'rebooked',
        'replied',
        'not_interested',
        'escalated',
        'no_response',
        'closed_no_action',
      ].includes(outcomeCode) ||
      seen.has(outcomeCode)
    ) {
      continue;
    }
    seen.add(outcomeCode);
    normalized.push(outcomeCode);
  }
  return normalized;
}

function toAnalyzeInboxHistoryWindowBounds(
  lookbackDays = CCO_ANALYZE_HISTORY_SIGNAL_LOOKBACK_DAYS
) {
  const safeLookbackDays = Math.max(
    30,
    Math.min(CCO_KONS_HISTORY_MAX_LOOKBACK_DAYS, Number(lookbackDays) || CCO_ANALYZE_HISTORY_SIGNAL_LOOKBACK_DAYS)
  );
  const endMs = Date.now();
  const startMs = endMs - safeLookbackDays * 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function resolveAnalyzeInboxCustomerEmail(conversation = {}) {
  const safeConversation = asObject(conversation);
  const explicitCustomerEmail = toMailboxAddress(
    safeConversation.customerEmail || safeConversation.senderEmail
  );
  if (explicitCustomerEmail) return explicitCustomerEmail;
  const messages = asArray(safeConversation.messages);
  for (const message of messages) {
    const direction = normalizeText(message?.direction).toLowerCase();
    if (direction !== 'inbound') continue;
    const senderEmail = toMailboxAddress(message?.senderEmail);
    if (senderEmail) return senderEmail;
  }
  for (const message of messages) {
    const senderEmail = toMailboxAddress(message?.senderEmail);
    if (senderEmail) return senderEmail;
  }
  return '';
}

function createHistorySignalAggregate(customerEmail = '') {
  return {
    customerEmail,
    mailboxIds: new Set(),
    messageCount: 0,
    recentMessageCount: 0,
    inboundCount: 0,
    outboundCount: 0,
    complaintCount: 0,
    rescheduleCount: 0,
    bookingCount: 0,
    latestMessageAt: null,
    outcomeCounts: {},
    positiveOutcomeCount: 0,
    negativeOutcomeCount: 0,
    neutralOutcomeCount: 0,
    preferredModeStats: {},
    dominantRiskStats: {},
    recommendedActionStats: {},
    latestOutcomeCode: null,
    latestOutcomeLabel: null,
    latestOutcomeAt: null,
  };
}

function applyHistorySignalPatternCounts(aggregate, text = '') {
  const safeAggregate = aggregate && typeof aggregate === 'object' ? aggregate : null;
  if (!safeAggregate) return;
  const haystack = normalizeText(text);
  if (!haystack) return;
  const hasComplaint = CCO_HISTORY_SIGNAL_COMPLAINT_PATTERN.test(haystack);
  const hasReschedule = CCO_HISTORY_SIGNAL_RESCHEDULE_PATTERN.test(haystack);
  const hasBooking = CCO_HISTORY_SIGNAL_BOOKING_PATTERN.test(haystack);
  if (hasComplaint) {
    safeAggregate.complaintCount += 1;
  }
  if (hasReschedule) {
    safeAggregate.rescheduleCount += 1;
  }
  if (hasBooking && !hasReschedule) {
    safeAggregate.bookingCount += 1;
  }
}

function resolveHistorySignalPattern(aggregate = {}) {
  const complaintCount = Math.max(0, Number(aggregate.complaintCount) || 0);
  const rescheduleCount = Math.max(0, Number(aggregate.rescheduleCount) || 0);
  const bookingCount = Math.max(0, Number(aggregate.bookingCount) || 0);
  const activeKinds = [
    complaintCount > 0 ? 'complaint' : '',
    rescheduleCount > 0 ? 'reschedule' : '',
    bookingCount > 0 ? 'booking' : '',
  ].filter(Boolean);
  if (activeKinds.length === 0) return 'none';
  if (
    complaintCount >= 2 &&
    complaintCount >= rescheduleCount &&
    complaintCount >= bookingCount
  ) {
    return 'complaint';
  }
  if (
    rescheduleCount >= 2 &&
    rescheduleCount >= complaintCount &&
    rescheduleCount >= bookingCount
  ) {
    return 'reschedule';
  }
  if (
    bookingCount >= 2 &&
    bookingCount >= complaintCount &&
    bookingCount >= rescheduleCount
  ) {
    return 'booking';
  }
  if (activeKinds.length >= 2) return 'mixed';
  return activeKinds[0] || 'none';
}

function buildHistorySignalSummarySv({
  pattern = 'none',
  mailboxCount = 0,
  recentMessageCount = 0,
} = {}) {
  const mailboxPhrase =
    mailboxCount > 1 ? `över ${mailboxCount} mailboxar` : 'i samma mailbox';
  const recentPhrase =
    recentMessageCount >= 3 ? ` (${recentMessageCount} mail senaste tiden)` : '';
  if (pattern === 'complaint') {
    return `Historik visar återkommande friktion ${mailboxPhrase}${recentPhrase}.`;
  }
  if (pattern === 'reschedule') {
    return `Historik visar återkommande ombokning ${mailboxPhrase}${recentPhrase}.`;
  }
  if (pattern === 'booking') {
    return `Historik visar tidigare bokningsdialog ${mailboxPhrase}${recentPhrase}.`;
  }
  if (pattern === 'mixed') {
    return `Historik visar återkommande kontakt ${mailboxPhrase}${recentPhrase}.`;
  }
  return mailboxCount > 1 || recentMessageCount >= 3
    ? `Historik visar återkommande kontakt${recentPhrase}.`
    : '';
}

function buildHistorySignalActionCueSv({ pattern = 'none', mailboxCount = 0 } = {}) {
  if (pattern === 'complaint') {
    return 'Bekräfta tidigare friktion och stäng loopen tydligt i samma svar.';
  }
  if (pattern === 'reschedule') {
    return 'Skicka två konkreta tider direkt och be kunden välja i samma svar.';
  }
  if (pattern === 'booking') {
    return 'Var konkret med tider eller nästa steg direkt i svaret.';
  }
  if (pattern === 'mixed' || mailboxCount > 1) {
    return 'Samla tråden kort och ge ett tydligt nästa steg i samma svar.';
  }
  return '';
}

function normalizeHistoryOutcomeCode(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['booked', 'bokad'].includes(normalized)) return 'booked';
  if (['rebooked', 'ombokad'].includes(normalized)) return 'rebooked';
  if (['replied', 'answered', 'besvarat'].includes(normalized)) return 'replied';
  if (['not_interested', 'not interested', 'ej intresserad'].includes(normalized)) {
    return 'not_interested';
  }
  if (['escalated', 'eskalerad'].includes(normalized)) return 'escalated';
  if (['no_response', 'no response', 'ingen respons'].includes(normalized)) return 'no_response';
  if (
    [
      'closed_no_action',
      'closed without action',
      'stängd utan åtgärd',
      'stangd utan atgard',
    ].includes(normalized)
  ) {
    return 'closed_no_action';
  }
  return '';
}

function normalizeHistoryActionType(value = '') {
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

function normalizeHistoryDraftMode(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['short', 'warm', 'professional'].includes(normalized)) return normalized;
  return '';
}

function normalizeHistoryPriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
  return null;
}

function classifyHistoryOutcomeBucket(outcomeCode = '') {
  const safeOutcomeCode = normalizeHistoryOutcomeCode(outcomeCode);
  if (['booked', 'rebooked', 'replied'].includes(safeOutcomeCode)) return 'positive';
  if (['escalated', 'no_response'].includes(safeOutcomeCode)) return 'negative';
  if (['not_interested', 'closed_no_action'].includes(safeOutcomeCode)) return 'neutral';
  return 'neutral';
}

function updateHistoryDecisionStat(index = {}, key = '', label = '', bucket = 'neutral', recordedAt = null) {
  const safeKey = normalizeText(key);
  if (!safeKey) return;
  const safeBucket =
    bucket === 'positive' || bucket === 'negative' || bucket === 'neutral' ? bucket : 'neutral';
  const current = index[safeKey] || {
    key: safeKey,
    label: normalizeText(label) || safeKey,
    totalCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
    lastRecordedAt: null,
  };
  current.totalCount += 1;
  current[`${safeBucket}Count`] += 1;
  if (
    recordedAt &&
    (!current.lastRecordedAt || Date.parse(recordedAt) >= Date.parse(current.lastRecordedAt))
  ) {
    current.lastRecordedAt = recordedAt;
  }
  index[safeKey] = current;
}

function pickTopHistoryDecisionStat(index = {}, bucket = 'positive') {
  const bucketField =
    bucket === 'negative' ? 'negativeCount' : bucket === 'neutral' ? 'neutralCount' : 'positiveCount';
  return Object.values(index).sort((left, right) => {
    if ((right[bucketField] || 0) !== (left[bucketField] || 0)) {
      return (right[bucketField] || 0) - (left[bucketField] || 0);
    }
    if ((right.totalCount || 0) !== (left.totalCount || 0)) {
      return (right.totalCount || 0) - (left.totalCount || 0);
    }
    const byRecordedAt = compareIsoDesc(left.lastRecordedAt, right.lastRecordedAt);
    if (byRecordedAt !== 0) return byRecordedAt;
    return String(left.label || '').localeCompare(String(right.label || ''));
  })[0] || null;
}

function pickDominantNegativeHistoryOutcome(outcomeCounts = {}) {
  let winningCode = '';
  let winningCount = 0;
  for (const code of ['no_response', 'escalated']) {
    const count = Math.max(0, Number(outcomeCounts?.[code]) || 0);
    if (count > winningCount) {
      winningCode = code;
      winningCount = count;
    }
  }
  return {
    code: winningCode || null,
    count: winningCount,
  };
}

function formatHistoryCalibrationModeSv(mode = '') {
  const safeMode = normalizeHistoryDraftMode(mode);
  if (safeMode === 'short') return 'kort ton';
  if (safeMode === 'warm') return 'varm ton';
  if (safeMode === 'professional') return 'professionell ton';
  return '';
}

function formatHistoryNegativeOutcomeSv(outcomeCode = '') {
  const safeOutcomeCode = normalizeHistoryOutcomeCode(outcomeCode);
  if (safeOutcomeCode === 'no_response') return 'uteblivet svar';
  if (safeOutcomeCode === 'escalated') return 'eskalering';
  return '';
}

function buildHistoryCalibrationSummarySv({
  preferredMode = '',
  positiveOutcomeCount = 0,
  negativeOutcomeCount = 0,
  dominantFailureOutcome = '',
} = {}) {
  const positiveModeLabel = formatHistoryCalibrationModeSv(preferredMode);
  const negativeOutcomeLabel = formatHistoryNegativeOutcomeSv(dominantFailureOutcome);
  if (positiveModeLabel && positiveOutcomeCount >= 2 && negativeOutcomeLabel && negativeOutcomeCount > 0) {
    return `Utfallshistorik: ${positiveModeLabel} gav bäst resultat, men ${negativeOutcomeLabel} återkommer i liknande trådar.`;
  }
  if (positiveModeLabel && positiveOutcomeCount >= 2) {
    return `Utfallshistorik: ${positiveModeLabel} gav bäst resultat i liknande trådar.`;
  }
  if (negativeOutcomeLabel && negativeOutcomeCount > 0) {
    return `Utfallshistorik: negativt mönster domineras av ${negativeOutcomeLabel}.`;
  }
  return '';
}

function buildHistoryCalibrationActionCueSv({
  preferredAction = '',
  preferredMode = '',
  dominantFailureOutcome = '',
} = {}) {
  const safePreferredAction = normalizeText(preferredAction);
  if (safePreferredAction) return safePreferredAction;
  if (normalizeHistoryOutcomeCode(dominantFailureOutcome) === 'no_response') {
    return 'Gör nästa steg binärt och tidsatt.';
  }
  if (normalizeHistoryOutcomeCode(dominantFailureOutcome) === 'escalated') {
    return 'Förbered tidig handoff om samma mönster återkommer.';
  }
  const safePreferredMode = normalizeHistoryDraftMode(preferredMode);
  if (safePreferredMode === 'short') {
    return 'Håll svaret kort och stäng nästa steg direkt.';
  }
  if (safePreferredMode === 'warm') {
    return 'Behåll varm ton men stäng nästa steg tydligt.';
  }
  if (safePreferredMode === 'professional') {
    return 'Håll svaret sakligt och ge ett tydligt nästa steg.';
  }
  return '';
}

function buildHistoryOutcomeSummarySv(outcomeCode = '') {
  const safeOutcomeCode = normalizeHistoryOutcomeCode(outcomeCode);
  if (safeOutcomeCode === 'booked') {
    return 'Tidigare utfall: bokning lyckades.';
  }
  if (safeOutcomeCode === 'rebooked') {
    return 'Tidigare utfall: ombokning lyckades efter tydliga alternativ.';
  }
  if (safeOutcomeCode === 'replied') {
    return 'Tidigare utfall: kunden svarade när svaret var kort och tydligt.';
  }
  if (safeOutcomeCode === 'not_interested') {
    return 'Tidigare utfall: kunden tackade nej efter tidigare kontakt.';
  }
  if (safeOutcomeCode === 'escalated') {
    return 'Tidigare utfall: liknande tråd krävde eskalering.';
  }
  if (safeOutcomeCode === 'no_response') {
    return 'Tidigare utfall: tidigare liknande tråd tappade fart utan svar.';
  }
  if (safeOutcomeCode === 'closed_no_action') {
    return 'Tidigare utfall: tidigare tråd stängdes utan åtgärd.';
  }
  return '';
}

function buildHistoryOutcomeActionCueSv(outcomeCode = '') {
  const safeOutcomeCode = normalizeHistoryOutcomeCode(outcomeCode);
  if (safeOutcomeCode === 'booked') {
    return 'Var konkret och stäng nästa steg i samma svar.';
  }
  if (safeOutcomeCode === 'rebooked') {
    return 'Upprepa två tydliga tider direkt.';
  }
  if (safeOutcomeCode === 'replied') {
    return 'Håll CTA kort och tydlig.';
  }
  if (safeOutcomeCode === 'not_interested') {
    return 'Bekräfta kort och stäng loopen utan friktion.';
  }
  if (safeOutcomeCode === 'escalated') {
    return 'Förbered tidig handoff om samma mönster återkommer.';
  }
  if (safeOutcomeCode === 'no_response') {
    return 'Gör CTA binär och tidsatt.';
  }
  if (safeOutcomeCode === 'closed_no_action') {
    return 'Bekräfta läget och håll svaret mycket kort.';
  }
  return '';
}

function applyHistoryOutcome(aggregate = null, outcome = {}) {
  const safeAggregate = aggregate && typeof aggregate === 'object' ? aggregate : null;
  if (!safeAggregate) return;
  const outcomeCode = normalizeHistoryOutcomeCode(outcome?.outcomeCode || outcome?.code);
  if (!outcomeCode) return;
  const outcomeBucket = classifyHistoryOutcomeBucket(outcomeCode);
  safeAggregate.outcomeCounts[outcomeCode] = (safeAggregate.outcomeCounts[outcomeCode] || 0) + 1;
  safeAggregate[`${outcomeBucket}OutcomeCount`] =
    (safeAggregate[`${outcomeBucket}OutcomeCount`] || 0) + 1;
  const recordedAt = toIso(outcome?.recordedAt);
  const preferredMode = normalizeHistoryDraftMode(
    outcome?.selectedMode || outcome?.recommendedMode
  );
  if (preferredMode) {
    updateHistoryDecisionStat(
      safeAggregate.preferredModeStats,
      preferredMode,
      preferredMode,
      outcomeBucket,
      recordedAt
    );
  }
  const dominantRisk = normalizeText(outcome?.dominantRisk).toLowerCase();
  if (dominantRisk) {
    updateHistoryDecisionStat(
      safeAggregate.dominantRiskStats,
      dominantRisk,
      dominantRisk,
      outcomeBucket,
      recordedAt
    );
  }
  const recommendedAction = normalizeText(outcome?.recommendedAction);
  if (recommendedAction) {
    updateHistoryDecisionStat(
      safeAggregate.recommendedActionStats,
      recommendedAction.toLowerCase(),
      recommendedAction,
      outcomeBucket,
      recordedAt
    );
  }
  if (
    recordedAt &&
    (!safeAggregate.latestOutcomeAt ||
      Date.parse(recordedAt) >= Date.parse(safeAggregate.latestOutcomeAt))
  ) {
    safeAggregate.latestOutcomeCode = outcomeCode;
    safeAggregate.latestOutcomeLabel = normalizeText(outcome?.outcomeLabel || outcome?.label) || null;
    safeAggregate.latestOutcomeAt = recordedAt;
  } else if (!safeAggregate.latestOutcomeCode) {
    safeAggregate.latestOutcomeCode = outcomeCode;
    safeAggregate.latestOutcomeLabel = normalizeText(outcome?.outcomeLabel || outcome?.label) || null;
  }
}

function finalizeHistorySignal(aggregate = {}) {
  const mailboxIds = Array.from(aggregate.mailboxIds || []).slice(0, 10);
  const mailboxCount = mailboxIds.length;
  const messageCount = Math.max(0, Number(aggregate.messageCount) || 0);
  const recentMessageCount = Math.max(0, Number(aggregate.recentMessageCount) || 0);
  const pattern = resolveHistorySignalPattern(aggregate);
  const outcomeCode = normalizeHistoryOutcomeCode(aggregate.latestOutcomeCode);
  const outcomeSummary = buildHistoryOutcomeSummarySv(outcomeCode);
  const outcomeActionCue = buildHistoryOutcomeActionCueSv(outcomeCode);
  const preferredModeCandidate = pickTopHistoryDecisionStat(aggregate.preferredModeStats, 'positive');
  const preferredActionCandidate = pickTopHistoryDecisionStat(aggregate.recommendedActionStats, 'positive');
  const dominantFailureOutcome = pickDominantNegativeHistoryOutcome(aggregate.outcomeCounts || {});
  const dominantFailureRiskCandidate = pickTopHistoryDecisionStat(aggregate.dominantRiskStats, 'negative');
  const preferredMode =
    preferredModeCandidate && preferredModeCandidate.positiveCount > 0
      ? preferredModeCandidate
      : null;
  const preferredAction =
    preferredActionCandidate && preferredActionCandidate.positiveCount > 0
      ? preferredActionCandidate
      : null;
  const dominantFailureRisk =
    dominantFailureRiskCandidate && dominantFailureRiskCandidate.negativeCount > 0
      ? dominantFailureRiskCandidate
      : null;
  const calibrationSummary = buildHistoryCalibrationSummarySv({
    preferredMode: preferredMode?.key || '',
    positiveOutcomeCount: Math.max(0, Number(aggregate.positiveOutcomeCount) || 0),
    negativeOutcomeCount: Math.max(0, Number(aggregate.negativeOutcomeCount) || 0),
    dominantFailureOutcome: dominantFailureOutcome.code || '',
  });
  const calibrationActionCue = buildHistoryCalibrationActionCueSv({
    preferredAction: preferredAction?.label || '',
    preferredMode: preferredMode?.key || '',
    dominantFailureOutcome: dominantFailureOutcome.code || '',
  });
  const hasOutcomeSignal = Boolean(outcomeCode && (outcomeSummary || outcomeActionCue));
  const hasCalibrationSignal = Boolean(calibrationSummary || calibrationActionCue);
  if (!hasOutcomeSignal && messageCount < 2 && mailboxCount <= 1 && recentMessageCount < 3) {
    if (!hasCalibrationSignal) return null;
  }
  if (!hasOutcomeSignal && !hasCalibrationSignal && pattern === 'none' && mailboxCount <= 1 && recentMessageCount < 3) {
    return null;
  }
  const summary = buildHistorySignalSummarySv({
    pattern,
    mailboxCount,
    recentMessageCount,
  });
  const actionCue = buildHistorySignalActionCueSv({
    pattern,
    mailboxCount,
  });
  if (!summary && !actionCue && !hasOutcomeSignal) return null;
  return {
    pattern,
    summary: summary || null,
    actionCue: actionCue || null,
    mailboxIds,
    mailboxCount,
    messageCount,
    recentMessageCount,
    latestMessageAt: normalizeText(aggregate.latestMessageAt) || null,
    outcomeCode: outcomeCode || null,
    outcomeLabel: normalizeText(aggregate.latestOutcomeLabel) || null,
    outcomeSummary: outcomeSummary || null,
    outcomeActionCue: outcomeActionCue || null,
    outcomeAt: normalizeText(aggregate.latestOutcomeAt) || null,
    calibrationSummary: calibrationSummary || null,
    calibrationActionCue: calibrationActionCue || null,
    preferredMode: preferredMode?.key || null,
    positiveOutcomeCount: Math.max(0, Number(aggregate.positiveOutcomeCount) || 0),
    negativeOutcomeCount: Math.max(0, Number(aggregate.negativeOutcomeCount) || 0),
    dominantFailureOutcome: dominantFailureOutcome.code || null,
    dominantFailureRisk: dominantFailureRisk?.key || null,
  };
}

async function buildAnalyzeInboxHistorySignalIndex({
  tenantId,
  conversations = [],
  ccoHistoryStore = null,
  mailboxIds = CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS,
  lookbackDays = CCO_ANALYZE_HISTORY_SIGNAL_LOOKBACK_DAYS,
} = {}) {
  if (!ccoHistoryStore || typeof ccoHistoryStore.listMailboxMessages !== 'function') {
    return new Map();
  }
  const customerEmails = Array.from(
    new Set(
      asArray(conversations)
        .map((conversation) => resolveAnalyzeInboxCustomerEmail(conversation))
        .filter(Boolean)
    )
  );
  if (customerEmails.length === 0) return new Map();

  const customerEmailSet = new Set(customerEmails.map((value) => value.toLowerCase()));
  const safeMailboxIds = normalizeMailboxIdList(mailboxIds, 20).filter((mailboxId) =>
    CCO_GRAPH_READ_LOCKED_ALLOWLIST_SET.has(mailboxId)
  );
  if (safeMailboxIds.length === 0) return new Map();

  const { startIso, endIso } = toAnalyzeInboxHistoryWindowBounds(lookbackDays);
  const recentThresholdMs =
    Date.now() - CCO_ANALYZE_HISTORY_SIGNAL_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const mailboxResults = await Promise.allSettled(
    safeMailboxIds.map((mailboxId) =>
      ccoHistoryStore.listMailboxMessages({
        tenantId,
        mailboxId,
        sinceIso: startIso,
        untilIso: endIso,
      })
    )
  );

  const aggregatesByCustomer = new Map();
  for (let index = 0; index < mailboxResults.length; index += 1) {
    const result = mailboxResults[index];
    if (!result || result.status !== 'fulfilled') continue;
    const mailboxId = safeMailboxIds[index];
    for (const message of asArray(result.value)) {
      const customerEmail = toMailboxAddress(message?.customerEmail || message?.senderEmail);
      if (!customerEmail || !customerEmailSet.has(customerEmail.toLowerCase())) continue;
      const aggregate =
        aggregatesByCustomer.get(customerEmail) || createHistorySignalAggregate(customerEmail);
      aggregate.messageCount += 1;
      if (normalizeText(message?.direction).toLowerCase() === 'outbound') {
        aggregate.outboundCount += 1;
      } else {
        aggregate.inboundCount += 1;
      }
      if (mailboxId) aggregate.mailboxIds.add(mailboxId);
      const sentAtMs = Date.parse(normalizeText(message?.sentAt) || '');
      if (Number.isFinite(sentAtMs) && sentAtMs >= recentThresholdMs) {
        aggregate.recentMessageCount += 1;
      }
      if (
        normalizeText(message?.sentAt) &&
        (!aggregate.latestMessageAt || Date.parse(message.sentAt) > Date.parse(aggregate.latestMessageAt))
      ) {
        aggregate.latestMessageAt = message.sentAt;
      }
      applyHistorySignalPatternCounts(
        aggregate,
        [message?.subject, message?.bodyPreview].map((item) => normalizeText(item)).filter(Boolean).join(' ')
      );
      aggregatesByCustomer.set(customerEmail, aggregate);
    }
  }

  if (typeof ccoHistoryStore.listCustomerOutcomes === 'function') {
    const outcomeResults = await Promise.allSettled(
      customerEmails.map((customerEmail) =>
        ccoHistoryStore.listCustomerOutcomes({
          tenantId,
          customerEmail,
          mailboxIds: safeMailboxIds,
          sinceIso: startIso,
          untilIso: endIso,
        })
      )
    );
    for (let index = 0; index < outcomeResults.length; index += 1) {
      const result = outcomeResults[index];
      if (!result || result.status !== 'fulfilled') continue;
      const customerEmail = customerEmails[index];
      const aggregate =
        aggregatesByCustomer.get(customerEmail) || createHistorySignalAggregate(customerEmail);
      for (const outcome of asArray(result.value)) {
        applyHistoryOutcome(aggregate, outcome);
      }
      aggregatesByCustomer.set(customerEmail, aggregate);
    }
  }

  const historySignalIndex = new Map();
  for (const [customerEmail, aggregate] of aggregatesByCustomer.entries()) {
    const signal = finalizeHistorySignal(aggregate);
    if (!signal) continue;
    historySignalIndex.set(customerEmail, signal);
  }
  return historySignalIndex;
}

async function augmentAnalyzeInboxSnapshotWithHistorySignals({
  tenantId,
  systemStateSnapshot = {},
  ccoHistoryStore = null,
} = {}) {
  const safeSnapshot = asObject(systemStateSnapshot);
  const conversations = asArray(safeSnapshot.conversations);
  if (conversations.length === 0) return safeSnapshot;
  const historySignalIndex = await buildAnalyzeInboxHistorySignalIndex({
    tenantId,
    conversations,
    ccoHistoryStore,
  });
  if (historySignalIndex.size === 0) return safeSnapshot;
  return {
    ...safeSnapshot,
    conversations: conversations.map((conversation) => {
      const customerEmail =
        resolveAnalyzeInboxCustomerEmail(conversation) || toMailboxAddress(conversation?.customerEmail);
      if (!customerEmail) return conversation;
      const historySignals = historySignalIndex.get(customerEmail);
      if (!historySignals) return conversation;
      return {
        ...conversation,
        customerEmail: normalizeText(conversation?.customerEmail) || customerEmail,
        historySignals,
      };
    }),
  };
}

function toMailboxAllowlistSet(rawValue = '') {
  const tokens = String(rawValue || '')
    .split(/[,\s;]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const allowlist = new Set();
  for (const token of tokens) {
    const lowered = token.toLowerCase();
    if (lowered === '*') {
      allowlist.add('*');
      continue;
    }
    const mailbox = toMailboxAddress(lowered);
    if (!mailbox) continue;
    allowlist.add(mailbox.toLowerCase());
  }
  return allowlist;
}

function resolveGraphReadAllowlistConfig(maxItems = 500) {
  const explicitAllowlist = parseMailboxIds(process.env.ARCANA_MAILBOX_ALLOWLIST, maxItems);
  if (explicitAllowlist.length > 0) {
    const sanitized = explicitAllowlist.filter((item) => CCO_GRAPH_READ_LOCKED_ALLOWLIST_SET.has(item));
    return {
      source: 'explicit',
      mailboxIds: sanitized.slice(0, maxItems),
    };
  }
  const configuredDefaultAllowlist = parseMailboxIds(
    process.env.ARCANA_GRAPH_READ_DEFAULT_ALLOWLIST,
    maxItems
  );
  if (configuredDefaultAllowlist.length > 0) {
    const sanitized = configuredDefaultAllowlist.filter((item) => CCO_GRAPH_READ_LOCKED_ALLOWLIST_SET.has(item));
    return {
      source: 'configured_default',
      mailboxIds: sanitized.slice(0, maxItems),
    };
  }
  return {
    source: 'locked_default',
    mailboxIds: CCO_GRAPH_READ_DEFAULT_ALLOWLIST.slice(0, maxItems),
  };
}

function resolveGraphReadAllowlistMailboxIds(maxItems = 500) {
  return resolveGraphReadAllowlistConfig(maxItems).mailboxIds;
}

function mergeUniqueMailboxIds(...collections) {
  const merged = [];
  const seen = new Set();
  for (const collection of collections) {
    const source = Array.isArray(collection) ? collection : [];
    for (const rawValue of source) {
      const value = normalizeText(rawValue).toLowerCase();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      merged.push(value);
    }
  }
  return merged;
}

function toGraphReadOptionsFromEnv() {
  const allowlistConfig = resolveGraphReadAllowlistConfig(500);
  const allowlistMailboxIds = allowlistConfig.mailboxIds;
  const allowlistMode = allowlistMailboxIds.length > 0;
  const forceFullTenantAllowlist =
    allowlistMode &&
    (allowlistConfig.source === 'locked_default' || allowlistMailboxIds.length > 1);
  const fullTenant = forceFullTenantAllowlist
    ? true
    : toBoolean(process.env.ARCANA_GRAPH_FULL_TENANT, false);
  const userScope = forceFullTenantAllowlist
      ? 'all'
      : normalizeGraphUserScope(
          process.env.ARCANA_GRAPH_USER_SCOPE,
          fullTenant ? 'all' : 'single'
        );
  const configuredMailboxIds = parseMailboxIds(process.env.ARCANA_GRAPH_MAILBOX_IDS);
  const mailboxIds = allowlistMode
    ? allowlistMailboxIds.slice()
    : mergeUniqueMailboxIds(allowlistMailboxIds, configuredMailboxIds);
  const defaultMailboxIndexes =
    forceFullTenantAllowlist ? '' : (fullTenant && userScope === 'all' ? '1,2,3,5,8' : '');
  const maxMessages = clampInteger(process.env.ARCANA_GRAPH_MAX_MESSAGES, 1, 200, 100);
  const maxMessagesPerUser = clampInteger(
    process.env.ARCANA_GRAPH_MAX_MESSAGES_PER_USER,
    1,
    200,
    50
  );
  const splitWindow = Math.max(1, Math.floor(maxMessages / 2));
  const splitWindowPerUser = Math.max(1, Math.floor(maxMessagesPerUser / 2));
  const configuredMaxUsers = clampInteger(process.env.ARCANA_GRAPH_MAX_USERS, 1, 200, 50);
  const minimumAllowlistUsers = forceFullTenantAllowlist
    ? Math.max(1, mailboxIds.length || allowlistMailboxIds.length || 1)
    : 1;
  const maxUsers = forceFullTenantAllowlist
    ? Math.max(configuredMaxUsers, minimumAllowlistUsers)
    : configuredMaxUsers;
  return {
    days: clampInteger(process.env.ARCANA_GRAPH_WINDOW_DAYS, 1, 30, 14),
    maxMessages,
    maxInboxMessages: clampInteger(
      process.env.ARCANA_GRAPH_MAX_INBOX_MESSAGES,
      1,
      200,
      Math.max(1, maxMessages - splitWindow)
    ),
    maxSentMessages: clampInteger(
      process.env.ARCANA_GRAPH_MAX_SENT_MESSAGES,
      1,
      200,
      splitWindow
    ),
    includeRead: toBoolean(process.env.ARCANA_GRAPH_INCLUDE_READ, false),
    fullTenant,
    allowlistMode,
    allowlistSource: allowlistConfig.source,
    allowlistMailboxIds,
    userScope,
    maxUsers,
    maxMessagesPerUser,
    maxInboxMessagesPerUser: clampInteger(
      process.env.ARCANA_GRAPH_MAX_INBOX_MESSAGES_PER_USER,
      1,
      200,
      Math.max(1, maxMessagesPerUser - splitWindowPerUser)
    ),
    maxSentMessagesPerUser: clampInteger(
      process.env.ARCANA_GRAPH_MAX_SENT_MESSAGES_PER_USER,
      1,
      200,
      splitWindowPerUser
    ),
    mailboxTimeoutMs: clampInteger(
      process.env.ARCANA_GRAPH_MAILBOX_TIMEOUT_MS,
      1000,
      15000,
      5000
    ),
    runTimeoutMs: clampInteger(
      process.env.ARCANA_GRAPH_RUN_TIMEOUT_MS,
      5000,
      120000,
      30000
    ),
    maxMailboxErrors: clampInteger(
      process.env.ARCANA_GRAPH_MAX_MAILBOX_ERRORS,
      1,
      20,
      5
    ),
    requestMaxRetries: clampInteger(
      process.env.ARCANA_GRAPH_REQUEST_MAX_RETRIES,
      0,
      6,
      2
    ),
    retryBaseDelayMs: clampInteger(
      process.env.ARCANA_GRAPH_RETRY_BASE_DELAY_MS,
      100,
      10000,
      500
    ),
    retryMaxDelayMs: clampInteger(
      process.env.ARCANA_GRAPH_RETRY_MAX_DELAY_MS,
      200,
      30000,
      5000
    ),
    maxPagesPerCollection: clampInteger(
      process.env.ARCANA_GRAPH_PAGINATION_MAX_PAGES,
      1,
      2000,
      200
    ),
    mailboxIndexes: allowlistMode
      ? []
      : parseMailboxIndexes(process.env.ARCANA_GRAPH_MAILBOX_INDEXES || defaultMailboxIndexes),
    mailboxIds,
  };
}

function toSnapshotMessageCount(snapshot = {}) {
  const conversations = asArray(snapshot.conversations);
  return conversations.reduce((sum, conversation) => {
    const count = asArray(conversation?.messages).length;
    return sum + count;
  }, 0);
}

async function writeMailboxReadAuditEvent({
  authStore,
  tenantId,
  actorUserId = null,
  action,
  outcome = 'success',
  mailboxReadId,
  correlationId = null,
  metadata = {},
}) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
  await authStore.addAuditEvent({
    tenantId,
    actorUserId,
    action,
    outcome,
    targetType: 'mailbox_read',
    targetId: normalizeText(mailboxReadId) || crypto.randomUUID(),
    metadata: {
      mailboxReadId: normalizeText(mailboxReadId) || null,
      correlationId: normalizeText(correlationId) || null,
      ...(metadata || {}),
    },
  });
}

async function hydrateAnalyzeInboxInput({
  tenantId,
  input = {},
  systemStateSnapshot = {},
  graphReadConnector = null,
  capabilityAnalysisStore = null,
  ccoHistoryStore = null,
  authStore = null,
  actorUserId = null,
  correlationId = null,
  graphReadOptionsOverride = null,
}) {
  const safeInput = asObject(input);
  const safeSnapshot = asObject(systemStateSnapshot);
  const normalizedInput = {};
  const requestedMailboxIds = resolveAnalyzeInboxMailboxIds(safeInput);

  if (typeof safeInput.includeClosed === 'boolean') {
    normalizedInput.includeClosed = safeInput.includeClosed;
  }
  if (Number.isFinite(Number(safeInput.maxDrafts))) {
    normalizedInput.maxDrafts = clampInteger(safeInput.maxDrafts, 1, 5, 5);
  }
  if (safeInput.debug === true) {
    normalizedInput.debug = true;
  }
  if (requestedMailboxIds.length > 0) {
    normalizedInput.mailboxIds = requestedMailboxIds.slice();
  }

  const storedWritingProfiles = capabilityAnalysisStore
    ? await listWritingIdentityProfiles({
        analysisStore: capabilityAnalysisStore,
        tenantId,
        limit: 500,
      })
    : [];
  const storedWritingProfilesMap = {};
  for (const record of asArray(storedWritingProfiles)) {
    const mailbox = toMailboxAddress(record?.mailbox);
    if (!mailbox) continue;
    storedWritingProfilesMap[mailbox] = toWritingProfile(record?.profile || {});
  }
  const mergedWritingProfiles = mergeWritingIdentityProfiles({
    storedProfiles: { profilesByMailbox: storedWritingProfilesMap },
    inputProfiles: safeInput.writingIdentityProfiles,
  });
  if (mergedWritingProfiles) {
    normalizedInput.writingIdentityProfiles = mergedWritingProfiles;
  }

  if (Array.isArray(safeSnapshot.conversations)) {
    const augmentedSnapshot = await augmentAnalyzeInboxSnapshotWithHistorySignals({
      tenantId,
      systemStateSnapshot: safeSnapshot,
      ccoHistoryStore,
    });
    return {
      input: normalizedInput,
      systemStateSnapshot: augmentedSnapshot,
    };
  }

  if (!graphReadConnector || typeof graphReadConnector.fetchInboxSnapshot !== 'function') {
    return {
      input: normalizedInput,
      systemStateSnapshot: safeSnapshot,
    };
  }

  const mailboxReadId = crypto.randomUUID();
  const mailboxSentReadId = crypto.randomUUID();
  const graphReadOptions = {
    ...toGraphReadOptionsFromEnv(),
    ...(requestedMailboxIds.length > 0
      ? {
          mailboxIds: requestedMailboxIds.slice(),
          mailboxIndexes: [],
        }
      : {}),
    ...asObject(graphReadOptionsOverride),
  };
  const capturedAt = new Date().toISOString();

  await writeMailboxReadAuditEvent({
    authStore,
    tenantId,
    actorUserId,
    action: 'mailbox.read.start',
    outcome: 'success',
    mailboxReadId,
    correlationId,
    metadata: {
      source: 'microsoft_graph',
      capabilityName: 'AnalyzeInbox',
      windowDays: graphReadOptions.days,
      maxMessages: graphReadOptions.maxMessages,
      maxInboxMessages: graphReadOptions.maxInboxMessages,
      maxSentMessages: graphReadOptions.maxSentMessages,
      includeRead: graphReadOptions.includeRead,
      fullTenant: graphReadOptions.fullTenant,
      allowlistMode: graphReadOptions.allowlistMode === true,
      allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
      userScope: graphReadOptions.userScope,
      maxUsers: graphReadOptions.maxUsers,
      maxMessagesPerUser: graphReadOptions.maxMessagesPerUser,
      maxInboxMessagesPerUser: graphReadOptions.maxInboxMessagesPerUser,
      maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
      mailboxTimeoutMs: graphReadOptions.mailboxTimeoutMs,
      runTimeoutMs: graphReadOptions.runTimeoutMs,
      maxMailboxErrors: graphReadOptions.maxMailboxErrors,
      requestMaxRetries: graphReadOptions.requestMaxRetries,
      retryBaseDelayMs: graphReadOptions.retryBaseDelayMs,
      retryMaxDelayMs: graphReadOptions.retryMaxDelayMs,
      maxPagesPerCollection: graphReadOptions.maxPagesPerCollection,
      mailboxIndexes: graphReadOptions.mailboxIndexes,
      mailboxIds: graphReadOptions.mailboxIds,
      capturedAt,
    },
  });

  await writeMailboxReadAuditEvent({
    authStore,
    tenantId,
    actorUserId,
    action: 'mailbox.sent.read.start',
    outcome: 'success',
    mailboxReadId: mailboxSentReadId,
    correlationId,
    metadata: {
      source: 'microsoft_graph',
      capabilityName: 'AnalyzeInbox',
      windowDays: graphReadOptions.days,
      maxSentMessages: graphReadOptions.maxSentMessages,
      maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
      fullTenant: graphReadOptions.fullTenant,
      allowlistMode: graphReadOptions.allowlistMode === true,
      allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
      userScope: graphReadOptions.userScope,
      maxUsers: graphReadOptions.maxUsers,
      mailboxTimeoutMs: graphReadOptions.mailboxTimeoutMs,
      runTimeoutMs: graphReadOptions.runTimeoutMs,
      requestMaxRetries: graphReadOptions.requestMaxRetries,
      retryBaseDelayMs: graphReadOptions.retryBaseDelayMs,
      retryMaxDelayMs: graphReadOptions.retryMaxDelayMs,
      maxPagesPerCollection: graphReadOptions.maxPagesPerCollection,
      mailboxIndexes: graphReadOptions.mailboxIndexes,
      mailboxIds: graphReadOptions.mailboxIds,
      capturedAt,
    },
  });

  try {
    const graphSnapshot = asObject(
      await graphReadConnector.fetchInboxSnapshot(graphReadOptions)
    );
    const graphTimestamps = asObject(graphSnapshot.timestamps);
    const mergedSnapshot = {
      ...safeSnapshot,
      ...graphSnapshot,
      conversations: asArray(graphSnapshot.conversations),
      timestamps: {
        capturedAt: normalizeText(graphTimestamps.capturedAt) || capturedAt,
        sourceGeneratedAt: normalizeText(graphTimestamps.sourceGeneratedAt) || null,
      },
      snapshotVersion:
        normalizeText(graphSnapshot.snapshotVersion) ||
        normalizeText(safeSnapshot.snapshotVersion) ||
        'graph.inbox.snapshot.v1',
    };
    const augmentedSnapshot = await augmentAnalyzeInboxSnapshotWithHistorySignals({
      tenantId,
      systemStateSnapshot: mergedSnapshot,
      ccoHistoryStore,
    });

    await writeMailboxReadAuditEvent({
      authStore,
      tenantId,
      actorUserId,
      action: 'mailbox.read.complete',
      outcome: 'success',
      mailboxReadId,
      correlationId,
      metadata: {
        source: 'microsoft_graph',
        capabilityName: 'AnalyzeInbox',
        windowDays: graphReadOptions.days,
        maxMessages: graphReadOptions.maxMessages,
        maxInboxMessages: graphReadOptions.maxInboxMessages,
        maxSentMessages: graphReadOptions.maxSentMessages,
        includeRead: graphReadOptions.includeRead,
        fullTenant: graphReadOptions.fullTenant,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
        userScope: graphReadOptions.userScope,
        maxUsers: graphReadOptions.maxUsers,
        maxMessagesPerUser: graphReadOptions.maxMessagesPerUser,
        maxInboxMessagesPerUser: graphReadOptions.maxInboxMessagesPerUser,
        maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
        mailboxTimeoutMs: graphReadOptions.mailboxTimeoutMs,
        runTimeoutMs: graphReadOptions.runTimeoutMs,
        maxMailboxErrors: graphReadOptions.maxMailboxErrors,
        requestMaxRetries: graphReadOptions.requestMaxRetries,
        retryBaseDelayMs: graphReadOptions.retryBaseDelayMs,
        retryMaxDelayMs: graphReadOptions.retryMaxDelayMs,
        maxPagesPerCollection: graphReadOptions.maxPagesPerCollection,
        mailboxIndexes: graphReadOptions.mailboxIndexes,
        mailboxIds: graphReadOptions.mailboxIds,
        mailboxCount: toNumber(graphSnapshot?.metadata?.mailboxCount, 0),
        mailboxErrors: toNumber(graphSnapshot?.metadata?.mailboxErrors, 0),
        conversationCount: asArray(augmentedSnapshot.conversations).length,
        messageCount: toSnapshotMessageCount(augmentedSnapshot),
        inboundMessageCount: toNumber(graphSnapshot?.metadata?.inboundMessageCount, 0),
        outboundMessageCount: toNumber(graphSnapshot?.metadata?.outboundMessageCount, 0),
        snapshotVersion: normalizeText(augmentedSnapshot.snapshotVersion) || null,
        capturedAt: normalizeText(augmentedSnapshot.timestamps?.capturedAt) || capturedAt,
      },
    });

    await writeMailboxReadAuditEvent({
      authStore,
      tenantId,
      actorUserId,
      action: 'mailbox.sent.read.complete',
      outcome: 'success',
      mailboxReadId: mailboxSentReadId,
      correlationId,
      metadata: {
        source: 'microsoft_graph',
        capabilityName: 'AnalyzeInbox',
        windowDays: graphReadOptions.days,
        maxSentMessages: graphReadOptions.maxSentMessages,
        maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
        fullTenant: graphReadOptions.fullTenant,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
        userScope: graphReadOptions.userScope,
        maxUsers: graphReadOptions.maxUsers,
        mailboxCount: toNumber(graphSnapshot?.metadata?.mailboxCount, 0),
        outboundMessageCount: toNumber(graphSnapshot?.metadata?.outboundMessageCount, 0),
        snapshotVersion: normalizeText(augmentedSnapshot.snapshotVersion) || null,
        capturedAt: normalizeText(augmentedSnapshot.timestamps?.capturedAt) || capturedAt,
      },
    });

    if (authStore && typeof authStore.addAuditEvent === 'function') {
      const answeredConversations = asArray(augmentedSnapshot.conversations).filter((conversation) => {
        const inboundAt = toIso(conversation?.lastInboundAt);
        const outboundAt = toIso(conversation?.lastOutboundAt);
        if (!inboundAt || !outboundAt) return false;
        return Date.parse(outboundAt) >= Date.parse(inboundAt);
      });
      for (const conversation of answeredConversations.slice(0, 200)) {
        await authStore.addAuditEvent({
          tenantId,
          actorUserId,
          action: 'cco.conversation.answered.detected',
          outcome: 'success',
          targetType: 'cco_conversation',
          targetId:
            normalizeText(conversation?.conversationId) ||
            normalizeText(conversation?.customerEmail) ||
            crypto.randomUUID(),
          metadata: {
            correlationId: normalizeText(correlationId) || null,
            conversationId: normalizeText(conversation?.conversationId) || null,
            customerId:
              normalizeText(conversation?.customerId) ||
              normalizeText(conversation?.customerEmail) ||
              null,
            customerEmail: normalizeText(conversation?.customerEmail) || null,
            lastInboundAt: toIso(conversation?.lastInboundAt) || null,
            lastOutboundAt: toIso(conversation?.lastOutboundAt) || null,
          },
        });
      }
    }

    return {
      input: normalizedInput,
      systemStateSnapshot: augmentedSnapshot,
    };
  } catch (error) {
    await writeMailboxReadAuditEvent({
      authStore,
      tenantId,
      actorUserId,
      action: 'mailbox.read.error',
      outcome: 'error',
      mailboxReadId,
      correlationId,
      metadata: {
        source: 'microsoft_graph',
        capabilityName: 'AnalyzeInbox',
        windowDays: graphReadOptions.days,
        maxMessages: graphReadOptions.maxMessages,
        maxInboxMessages: graphReadOptions.maxInboxMessages,
        maxSentMessages: graphReadOptions.maxSentMessages,
        includeRead: graphReadOptions.includeRead,
        fullTenant: graphReadOptions.fullTenant,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
        userScope: graphReadOptions.userScope,
        maxUsers: graphReadOptions.maxUsers,
        maxMessagesPerUser: graphReadOptions.maxMessagesPerUser,
        maxInboxMessagesPerUser: graphReadOptions.maxInboxMessagesPerUser,
        maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
        mailboxTimeoutMs: graphReadOptions.mailboxTimeoutMs,
        runTimeoutMs: graphReadOptions.runTimeoutMs,
        maxMailboxErrors: graphReadOptions.maxMailboxErrors,
        requestMaxRetries: graphReadOptions.requestMaxRetries,
        retryBaseDelayMs: graphReadOptions.retryBaseDelayMs,
        retryMaxDelayMs: graphReadOptions.retryMaxDelayMs,
        maxPagesPerCollection: graphReadOptions.maxPagesPerCollection,
        mailboxIndexes: graphReadOptions.mailboxIndexes,
        mailboxIds: graphReadOptions.mailboxIds,
        errorMessage: normalizeText(error?.message) || 'graph_read_failed',
      },
    });
    await writeMailboxReadAuditEvent({
      authStore,
      tenantId,
      actorUserId,
      action: 'mailbox.sent.read.error',
      outcome: 'error',
      mailboxReadId: mailboxSentReadId,
      correlationId,
      metadata: {
        source: 'microsoft_graph',
        capabilityName: 'AnalyzeInbox',
        windowDays: graphReadOptions.days,
        maxSentMessages: graphReadOptions.maxSentMessages,
        maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
        fullTenant: graphReadOptions.fullTenant,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
        userScope: graphReadOptions.userScope,
        maxUsers: graphReadOptions.maxUsers,
        mailboxIndexes: graphReadOptions.mailboxIndexes,
        mailboxIds: graphReadOptions.mailboxIds,
        errorMessage: normalizeText(error?.message) || 'graph_sent_read_failed',
      },
    });
    const wrappedError = new Error(
      `AnalyzeInbox Graph read failed: ${
        normalizeText(error?.message) || 'mailbox_source_unavailable'
      }.`
    );
    wrappedError.code = 'CAPABILITY_INBOX_SOURCE_UNAVAILABLE';
    throw wrappedError;
  }
}

async function hydrateGenerateTaskPlanInput({
  tenantId,
  templateStore,
  input = {},
  systemStateSnapshot = {},
}) {
  const safeInput = asObject(input);
  const safeSnapshot = asObject(systemStateSnapshot);

  const inputSnapshotOverride = {
    openReviews: Array.isArray(safeInput.openReviews) ? safeInput.openReviews : null,
    incidents: Array.isArray(safeInput.incidents) ? safeInput.incidents : null,
    latestTemplateChanges: Array.isArray(safeInput.latestTemplateChanges)
      ? safeInput.latestTemplateChanges
      : null,
    kpi: asObject(safeInput.kpi),
  };
  const explicitSnapshotOverride = {
    openReviews: Array.isArray(safeSnapshot.openReviews) ? safeSnapshot.openReviews : null,
    incidents: Array.isArray(safeSnapshot.incidents) ? safeSnapshot.incidents : null,
    latestTemplateChanges: Array.isArray(safeSnapshot.latestTemplateChanges)
      ? safeSnapshot.latestTemplateChanges
      : null,
    kpi: asObject(safeSnapshot.kpi),
  };

  const normalizedInput = {};
  if (Number.isFinite(Number(safeInput.maxTasks))) {
    normalizedInput.maxTasks = Number(safeInput.maxTasks);
  }
  if (typeof safeInput.includeEvidence === 'boolean') {
    normalizedInput.includeEvidence = safeInput.includeEvidence;
  }
  if (safeInput.debug === true) {
    normalizedInput.debug = true;
  }

  if (!templateStore) {
    return {
      input: normalizedInput,
      systemStateSnapshot: {
        openReviews:
          explicitSnapshotOverride.openReviews || inputSnapshotOverride.openReviews || [],
        incidents:
          explicitSnapshotOverride.incidents || inputSnapshotOverride.incidents || [],
        kpi: Object.keys(explicitSnapshotOverride.kpi).length
          ? explicitSnapshotOverride.kpi
          : inputSnapshotOverride.kpi,
        latestTemplateChanges:
          explicitSnapshotOverride.latestTemplateChanges ||
          inputSnapshotOverride.latestTemplateChanges ||
          [],
      },
    };
  }

  const [
    defaultOpenReviews,
    defaultIncidents,
    riskSummary,
    incidentSummary,
    latestTemplates,
    activeSnapshots,
  ] = await Promise.all([
    typeof templateStore.listEvaluations === 'function'
      ? templateStore.listEvaluations({
          tenantId,
          state: 'open',
          limit: 80,
        })
      : [],
    typeof templateStore.listIncidents === 'function'
      ? templateStore.listIncidents({
          tenantId,
          status: 'open',
          limit: 80,
        })
      : [],
    typeof templateStore.summarizeRisk === 'function'
      ? templateStore.summarizeRisk({
          tenantId,
          minRiskLevel: 1,
        })
      : null,
    typeof templateStore.summarizeIncidents === 'function'
      ? templateStore.summarizeIncidents({
          tenantId,
        })
      : null,
    typeof templateStore.listTemplates === 'function'
      ? templateStore.listTemplates({
          tenantId,
        })
      : [],
    typeof templateStore.listActiveVersionSnapshots === 'function'
      ? templateStore.listActiveVersionSnapshots({
          tenantId,
        })
      : [],
  ]);

  const kpiDefault = {
    triggeredNoGoCount: Number(inputSnapshotOverride?.kpi?.triggeredNoGoCount || 0),
    sloBreaches: Number(inputSnapshotOverride?.kpi?.sloBreaches || 0),
    openUnresolvedIncidents: Number(incidentSummary?.totals?.openUnresolved || 0),
    highCriticalOpenReviews: Number(riskSummary?.totals?.highCriticalOpen || 0),
    readinessScore: Number(inputSnapshotOverride?.kpi?.readinessScore || 0),
    templatesTotal: Number(Array.isArray(latestTemplates) ? latestTemplates.length : 0),
    activeTemplates: Number(Array.isArray(activeSnapshots) ? activeSnapshots.length : 0),
  };

  return {
    input: normalizedInput,
    systemStateSnapshot: {
      openReviews:
      explicitSnapshotOverride.openReviews ||
      inputSnapshotOverride.openReviews ||
      (Array.isArray(defaultOpenReviews) ? defaultOpenReviews : []).map(toOpenReviewSnapshot),
      incidents:
      explicitSnapshotOverride.incidents ||
      inputSnapshotOverride.incidents ||
      (Array.isArray(defaultIncidents) ? defaultIncidents : []).map(toIncidentSnapshot),
      kpi:
      Object.keys(explicitSnapshotOverride.kpi).length > 0
        ? explicitSnapshotOverride.kpi
        : (Object.keys(inputSnapshotOverride.kpi).length > 0
          ? inputSnapshotOverride.kpi
          : kpiDefault),
      latestTemplateChanges:
      explicitSnapshotOverride.latestTemplateChanges ||
      inputSnapshotOverride.latestTemplateChanges ||
      (Array.isArray(latestTemplates) ? latestTemplates : [])
        .slice(0, 25)
        .map(toTemplateChangeSnapshot),
    },
  };
}

async function hydrateSummarizeIncidentsInput({
  tenantId,
  templateStore,
  input = {},
  systemStateSnapshot = {},
}) {
  const safeInput = asObject(input);
  const safeSnapshot = asObject(systemStateSnapshot);
  const normalizedInput = {
    includeClosed: safeInput.includeClosed === true,
    timeframeDays: Math.max(1, Math.min(90, toNumber(safeInput.timeframeDays, 14))),
  };
  if (safeInput.debug === true) {
    normalizedInput.debug = true;
  }

  const snapshotIncidents = Array.isArray(safeSnapshot.incidents)
    ? safeSnapshot.incidents
    : null;
  const snapshotSlaStatus =
    safeSnapshot.slaStatus && typeof safeSnapshot.slaStatus === 'object'
      ? safeSnapshot.slaStatus
      : null;
  const snapshotTimestamps =
    safeSnapshot.timestamps && typeof safeSnapshot.timestamps === 'object'
      ? safeSnapshot.timestamps
      : null;

  if (!templateStore || typeof templateStore.listIncidents !== 'function') {
    return {
      input: normalizedInput,
      systemStateSnapshot: {
        incidents: snapshotIncidents || [],
        slaStatus: snapshotSlaStatus || {},
        timestamps: {
          capturedAt: new Date().toISOString(),
          ...(snapshotTimestamps || {}),
        },
      },
    };
  }

  const [defaultIncidents, incidentSummary] = await Promise.all([
    templateStore.listIncidents({
      tenantId,
      status: normalizedInput.includeClosed ? 'all' : 'open',
      limit: 300,
      sinceDays: normalizedInput.timeframeDays,
    }),
    typeof templateStore.summarizeIncidents === 'function'
      ? templateStore.summarizeIncidents({ tenantId })
      : null,
  ]);

  return {
    input: normalizedInput,
    systemStateSnapshot: {
      incidents:
        snapshotIncidents ||
        (Array.isArray(defaultIncidents) ? defaultIncidents : []).map(toIncidentSnapshot),
      slaStatus:
        snapshotSlaStatus ||
        (incidentSummary?.bySlaState && typeof incidentSummary.bySlaState === 'object'
          ? incidentSummary.bySlaState
          : {}),
      timestamps: {
        capturedAt: new Date().toISOString(),
        sourceGeneratedAt: normalizeText(incidentSummary?.generatedAt) || null,
        ...(snapshotTimestamps || {}),
      },
    },
  };
}

async function maybeHydrateCapabilityPayload({
  capabilityName,
  tenantId,
  templateStore,
  input,
  systemStateSnapshot,
  graphReadConnector,
  capabilityAnalysisStore,
  ccoHistoryStore,
  authStore,
  actorUserId = null,
  correlationId = null,
}) {
  const normalizedName = normalizeText(capabilityName).toLowerCase();
  if (normalizedName === 'generatetaskplan') {
    return hydrateGenerateTaskPlanInput({
      tenantId,
      templateStore,
      input,
      systemStateSnapshot,
    });
  }
  if (normalizedName === 'summarizeincidents') {
    return hydrateSummarizeIncidentsInput({
      tenantId,
      templateStore,
      input,
      systemStateSnapshot,
    });
  }
  if (normalizedName === 'analyzeinbox') {
    return hydrateAnalyzeInboxInput({
      tenantId,
      input,
      systemStateSnapshot,
      graphReadConnector,
      capabilityAnalysisStore,
      ccoHistoryStore,
      authStore,
      actorUserId,
      correlationId,
    });
  }
  return {
    input: asObject(input),
    systemStateSnapshot: asObject(systemStateSnapshot),
  };
}

async function maybeHydrateAgentPayload({
  agentName,
  tenantId,
  templateStore,
  input,
  systemStateSnapshot,
  graphReadConnector,
  capabilityAnalysisStore,
  ccoHistoryStore,
  authStore,
  actorUserId,
  correlationId,
}) {
  const safeInput = asObject(input);
  const normalizedAgentName = normalizeText(agentName).toLowerCase();
  if (normalizedAgentName === 'coo') {
    const [incidentPayload, taskPlanPayload] = await Promise.all([
      hydrateSummarizeIncidentsInput({
        tenantId,
        templateStore,
        input,
        systemStateSnapshot,
      }),
      hydrateGenerateTaskPlanInput({
        tenantId,
        templateStore,
        input,
        systemStateSnapshot,
      }),
    ]);

    const incidentInput = asObject(incidentPayload.input);
    const taskPlanInput = asObject(taskPlanPayload.input);
    const incidentSnapshot = asObject(incidentPayload.systemStateSnapshot);
    const taskPlanSnapshot = asObject(taskPlanPayload.systemStateSnapshot);
    const incidents = Array.isArray(incidentSnapshot.incidents) ? incidentSnapshot.incidents : [];
    const openReviews = Array.isArray(taskPlanSnapshot.openReviews) ? taskPlanSnapshot.openReviews : [];
    const latestTemplateChanges = Array.isArray(taskPlanSnapshot.latestTemplateChanges)
      ? taskPlanSnapshot.latestTemplateChanges
      : [];
    const baseSnapshotVersion =
      normalizeText(incidentSnapshot.snapshotVersion) ||
      normalizeText(taskPlanSnapshot.snapshotVersion) ||
      'coo.snapshot.v1';
    const baseTimestamps =
      incidentSnapshot.timestamps && typeof incidentSnapshot.timestamps === 'object'
        ? incidentSnapshot.timestamps
        : { capturedAt: new Date().toISOString() };
    const timestamps = {
      ...baseTimestamps,
      capturedAt: normalizeText(baseTimestamps.capturedAt) || new Date().toISOString(),
      sourceGeneratedAt: normalizeText(baseTimestamps.sourceGeneratedAt) || null,
      version: normalizeText(baseTimestamps.version) || baseSnapshotVersion,
    };
    const effectiveTimeframeDays = Math.max(1, Math.min(90, toNumber(incidentInput.timeframeDays, 14)));
    const incidentTrend7d = toIncidentWindowCounts(incidents, 7);
    const incidentTrend14d = toIncidentWindowCounts(incidents, Math.max(14, effectiveTimeframeDays));
    const riskTrend7d = toReviewWindowCounts(openReviews, 7);
    const riskTrend14d = toReviewWindowCounts(openReviews, Math.max(14, effectiveTimeframeDays));
    const incidentAgeBuckets = toIncidentAgeBuckets(incidents);
    const templateHistory = toTemplateHistorySummary(latestTemplateChanges);

    const normalizedAgentInput = {
      includeClosed: incidentInput.includeClosed === true,
      timeframeDays: effectiveTimeframeDays,
      maxTasks: Math.max(1, Math.min(5, toNumber(taskPlanInput.maxTasks, 5))),
      includeEvidence: taskPlanInput.includeEvidence !== false,
    };
    if (safeInput.debug === true || incidentInput.debug === true || taskPlanInput.debug === true) {
      normalizedAgentInput.debug = true;
    }

    return {
      input: normalizedAgentInput,
      systemStateSnapshot: {
        incidents,
        slaStatus:
          incidentSnapshot.slaStatus && typeof incidentSnapshot.slaStatus === 'object'
            ? incidentSnapshot.slaStatus
            : {},
        timestamps,
        openReviews,
        latestTemplateChanges,
        kpi: taskPlanSnapshot.kpi && typeof taskPlanSnapshot.kpi === 'object'
          ? taskPlanSnapshot.kpi
          : {},
        incidentTrend7d,
        incidentTrend14d,
        riskTrend7d,
        riskTrend14d,
        incidentAgeBuckets,
        templateHistory,
        snapshotVersion: baseSnapshotVersion,
      },
    };
  }

  if (normalizedAgentName === 'cco') {
    return hydrateAnalyzeInboxInput({
      tenantId,
      input,
      systemStateSnapshot,
      graphReadConnector,
      capabilityAnalysisStore,
      ccoHistoryStore,
      authStore,
      actorUserId,
      correlationId,
    });
  }

  return {
    input: asObject(input),
    systemStateSnapshot: asObject(systemStateSnapshot),
  };
}

function toRequestMetadata(req) {
  return {
    path: req.path,
    method: req.method,
  };
}

function toChannel(req) {
  return normalizeText(req.body?.channel || 'admin') || 'admin';
}

function toCorrelationId(req) {
  return normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null;
}

function toIdempotencyKey(req) {
  return (
    normalizeText(req.get('x-idempotency-key')) ||
    normalizeText(req.body?.idempotencyKey) ||
    null
  );
}

function toRunInputBody(rawBody = {}) {
  const payload = asObject(rawBody);
  if (payload.input && typeof payload.input === 'object') {
    return asObject(payload.input);
  }

  const input = {};
  for (const [key, value] of Object.entries(payload)) {
    if (
      key === 'channel' ||
      key === 'debug' ||
      key === 'idempotencyKey' ||
      key === 'input' ||
      key === 'systemStateSnapshot'
    ) {
      continue;
    }
    input[key] = value;
  }
  return input;
}

function isDebugRequested(req) {
  if (req?.body?.debug === true) return true;
  if (req?.body?.input?.debug === true) return true;
  return toBoolean(req?.query?.debug, false);
}

function toActor(req) {
  return {
    id: req.auth.userId,
    role: req.auth.role,
    email: normalizeMailboxAddress(req.currentUser?.email || ''),
  };
}

function toTenantId(req) {
  return req.auth.tenantId;
}

function toGatewayBlockedResponse(gatewayResult = {}) {
  return (
    gatewayResult.safe_response || {
      error:
        'Capability-resultatet blockerades av risk/policy. Granska körningen i riskpanelen.',
    }
  );
}

function toSuccessPayload(result = {}) {
  const gatewayResult = result.gatewayResult || {};
  return gatewayResult.response_payload || {};
}

function toErrorPayload(error) {
  return {
    error: error?.message || 'Kunde inte exekvera capability.',
    code: error?.code || 'CAPABILITY_RUN_FAILED',
    details: error?.details || null,
  };
}

function isBlockedDecision(gatewayResult = {}) {
  return (
    gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate'
  );
}

function isRoleAllowed(req) {
  return Boolean(req?.auth?.role);
}

function ensureRoleContext(req, res) {
  if (isRoleAllowed(req)) return true;
  res.status(401).json({ error: 'Ingen auth context.' });
  return false;
}

function toCapabilityName(req) {
  return normalizeText(req.params?.capabilityName);
}

function validateCapabilityName(capabilityName, res) {
  if (capabilityName) return true;
  res.status(400).json({ error: 'capabilityName krävs.' });
  return false;
}

function toAgentName(req) {
  return normalizeText(req.params?.agentName);
}

function validateAgentName(agentName, res) {
  if (agentName) return true;
  res.status(400).json({ error: 'agentName kravs.' });
  return false;
}

function toMetaPayload(executor) {
  return {
    capabilities: executor.listCapabilities(),
    agentBundles: executor.listAgentBundles(),
  };
}

function toAnalysisQuery(req) {
  return {
    capabilityName: normalizeText(req.query?.capability),
    agentName: normalizeText(req.query?.agent),
    limit: Math.max(1, Math.min(500, Number(req.query?.limit || 50) || 50)),
  };
}

const AGENT_ANALYSIS_CAPABILITY_MAP = Object.freeze({
  COO: 'COO.DailyBrief',
  CCO: 'CCO.InboxAnalysis',
});

function resolveAnalysisCapabilityName(query = {}) {
  const capabilityName = normalizeText(query?.capabilityName);
  if (capabilityName) return capabilityName;
  const agentName = normalizeText(query?.agentName).toUpperCase();
  if (!agentName) return '';
  if (AGENT_ANALYSIS_CAPABILITY_MAP[agentName]) {
    return AGENT_ANALYSIS_CAPABILITY_MAP[agentName];
  }
  return `${agentName}.DailyBrief`;
}

function toAnalysisPayload(entries = [], capabilityName = '', agentName = '') {
  return {
    entries,
    count: entries.length,
    capability: capabilityName || null,
    agent: agentName || null,
  };
}

function toAnalysisUnavailable(res) {
  return res.status(503).json({ error: 'Capability analysis store är inte konfigurerad.' });
}

function toAnalysisError(res) {
  return res.status(500).json({ error: 'Kunde inte läsa capability analysis.' });
}

function toCcoSprintEventType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'start' || normalized === 'cco.sprint.start') return 'start';
  if (
    normalized === 'item_completed' ||
    normalized === 'item-completed' ||
    normalized === 'itemcompleted' ||
    normalized === 'cco.sprint.item_completed'
  ) {
    return 'item_completed';
  }
  if (normalized === 'complete' || normalized === 'cco.sprint.complete') return 'complete';
  return '';
}

function toCcoUsageEventType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'workspace_open' || normalized === 'cco.workspace.open') {
    return 'workspace_open';
  }
  if (normalized === 'draft_mode_selected' || normalized === 'cco.draft.mode_selected') {
    return 'draft_mode_selected';
  }
  if (normalized === 'focus_mode_toggled' || normalized === 'cco.focus.toggled') {
    return 'focus_mode_toggled';
  }
  if (normalized === 'indicator_override_set' || normalized === 'cco.indicator.override.set') {
    return 'indicator_override_set';
  }
  if (
    normalized === 'indicator_override_cleared' ||
    normalized === 'cco.indicator.override.cleared'
  ) {
    return 'indicator_override_cleared';
  }
  if (normalized === 'outcome_recorded' || normalized === 'cco.outcome.recorded') {
    return 'outcome_recorded';
  }
  if (normalized === 'reply_sent' || normalized === 'cco.reply.sent') {
    return 'reply_sent';
  }
  if (normalized === 'reply_later' || normalized === 'cco.reply.later') {
    return 'reply_later';
  }
  if (normalized === 'customer_replied' || normalized === 'cco.customer.replied') {
    return 'customer_replied';
  }
  if (normalized === 'conversation_deleted' || normalized === 'cco.conversation.deleted') {
    return 'conversation_deleted';
  }
  return '';
}

function toCcoIndicatorOverrideState(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (['new', 'medium', 'high', 'critical', 'handled'].includes(normalized)) {
    return normalized;
  }
  return '';
}

function toSinceWindow(rawValue) {
  const fallback = { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 };
  const normalized = normalizeText(rawValue).toLowerCase();
  if (!normalized) {
    const startAtMs = Date.now() - fallback.ms;
    return {
      since: fallback.label,
      durationMs: fallback.ms,
      startAtMs,
      startAt: new Date(startAtMs).toISOString(),
    };
  }

  const match = normalized.match(/^(\d+)\s*([dh])$/);
  if (!match) {
    const startAtMs = Date.now() - fallback.ms;
    return {
      since: fallback.label,
      durationMs: fallback.ms,
      startAtMs,
      startAt: new Date(startAtMs).toISOString(),
    };
  }

  const amount = clampInteger(match[1], 1, match[2] === 'd' ? 90 : 24 * 30, 7);
  const unit = match[2] === 'h' ? 'h' : 'd';
  const durationMs = unit === 'h'
    ? amount * 60 * 60 * 1000
    : amount * 24 * 60 * 60 * 1000;
  const startAtMs = Date.now() - durationMs;
  return {
    since: `${amount}${unit}`,
    durationMs,
    startAtMs,
    startAt: new Date(startAtMs).toISOString(),
  };
}

function toEventTimestampMs(event = {}) {
  const iso = toIso(event?.ts || event?.metadata?.timestamp);
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function toAverage(numbers = [], precision = 2) {
  const list = (Array.isArray(numbers) ? numbers : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!list.length) return 0;
  const sum = list.reduce((acc, value) => acc + value, 0);
  return Number((sum / list.length).toFixed(precision));
}

function toSprintSlaAgeHours(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStressLevel(score = 0) {
  const safeScore = Number.isFinite(Number(score)) ? Number(score) : 0;
  if (safeScore <= 3) return 'Low';
  if (safeScore <= 7) return 'Medium';
  return 'High';
}

function toPriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
}

function toNeedsReplyStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'handled' ? 'handled' : 'needs_reply';
}

function toSlaAgeHours(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return 0;
}

function buildLatestCcoSprintFeedback({ startEvents = [], completeEvents = [] } = {}) {
  const latestComplete = (Array.isArray(completeEvents) ? completeEvents : [])
    .slice()
    .sort((left, right) => String(right?.ts || '').localeCompare(String(left?.ts || '')))[0] || null;
  if (!latestComplete) return null;

  const completeMeta = asObject(latestComplete.metadata);
  const sprintId = normalizeText(completeMeta.sprintId || latestComplete.targetId);
  const startBySprintId = new Map();
  for (const event of Array.isArray(startEvents) ? startEvents : []) {
    const eventMeta = asObject(event?.metadata);
    const eventSprintId = normalizeText(eventMeta.sprintId || event?.targetId);
    if (!eventSprintId) continue;
    if (!startBySprintId.has(eventSprintId)) {
      startBySprintId.set(eventSprintId, eventMeta);
    }
  }
  const startMeta = asObject(startBySprintId.get(sprintId));
  const startCritical = Math.max(0, toNumber(startMeta.criticalCount, 0));
  const startHigh = Math.max(0, toNumber(startMeta.highCount, 0));
  const remainingCritical = Math.max(0, toNumber(completeMeta.remainingCritical, 0));
  const remainingHigh = Math.max(0, toNumber(completeMeta.remainingHigh, 0));
  const resolvedCritical = Math.max(0, startCritical - remainingCritical);
  const initialSlaLoad = startCritical + startHigh;
  const remainingSlaLoad = remainingCritical + remainingHigh;

  return {
    sprintId: sprintId || null,
    itemsCompleted: Math.max(0, toNumber(completeMeta.itemsCompleted, 0)),
    resolvedCritical,
    remainingCritical,
    remainingHigh,
    slaImproved: initialSlaLoad > 0 ? remainingSlaLoad < initialSlaLoad : false,
    completedAt: normalizeText(latestComplete.ts) || normalizeText(completeMeta.timestamp) || null,
  };
}

async function runCcoSprintEventHandler({ req, res, authStore }) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') {
    return res.status(503).json({ error: 'Auth store saknar audit writer.' });
  }

  const rawPayload = asObject(req.body);
  const input = asObject(
    rawPayload.input && typeof rawPayload.input === 'object'
      ? rawPayload.input
      : rawPayload
  );
  const eventType = toCcoSprintEventType(input.eventType || input.type || input.action);
  if (!eventType) {
    return res.status(422).json({ error: 'eventType måste vara start, item_completed eller complete.' });
  }

  const sprintId = normalizeText(input.sprintId);
  if (!sprintId) {
    return res.status(422).json({ error: 'sprintId krävs.' });
  }

  const actor = toActor(req);
  const tenantId = toTenantId(req);
  const correlationId = toCorrelationId(req);
  const nowIso = new Date().toISOString();
  const timestamp = toIso(input.timestamp) || nowIso;

  let action = '';
  let targetType = 'cco_sprint';
  let targetId = sprintId;
  let metadata = {
    sprintId,
    timestamp,
    correlationId,
  };

  if (eventType === 'start') {
    action = 'cco.sprint.start';
    metadata = {
      ...metadata,
      queueSize: Math.max(0, clampInteger(input.queueSize, 0, 100, 0)),
      criticalCount: Math.max(0, clampInteger(input.criticalCount, 0, 100, 0)),
      highCount: Math.max(0, clampInteger(input.highCount, 0, 100, 0)),
    };
  } else if (eventType === 'item_completed') {
    const conversationId = normalizeText(input.conversationId);
    if (!conversationId) {
      return res.status(422).json({ error: 'conversationId krävs för item_completed.' });
    }
    action = 'cco.sprint.item_completed';
    targetType = 'cco_conversation';
    targetId = conversationId;
    metadata = {
      ...metadata,
      conversationId,
      priorityLevel: toPriorityLevel(input.priorityLevel),
      slaAge: normalizeText(input.slaAge),
      slaAgeHours: Number.isFinite(Number(input.slaAgeHours))
        ? Number(input.slaAgeHours)
        : (toSprintSlaAgeHours(input.slaAge) ?? null),
      handledAt: toIso(input.handledAt) || timestamp,
    };
  } else if (eventType === 'complete') {
    action = 'cco.sprint.complete';
    metadata = {
      ...metadata,
      durationMs: Math.max(0, toNumber(input.durationMs, 0)),
      itemsCompleted: Math.max(0, clampInteger(input.itemsCompleted, 0, 100, 0)),
      remainingHigh: Math.max(0, clampInteger(input.remainingHigh, 0, 100, 0)),
      remainingCritical: Math.max(0, clampInteger(input.remainingCritical, 0, 100, 0)),
    };
  }

  const event = await authStore.addAuditEvent({
    tenantId,
    actorUserId: actor.id,
    action,
    outcome: 'success',
    targetType,
    targetId,
    metadata,
  });

  return res.json({
    ok: true,
    action,
    sprintId,
    auditRef: event?.id || null,
    loggedAt: event?.ts || timestamp,
  });
}

async function runCcoUsageEventHandler({ req, res, authStore, ccoHistoryStore = null }) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') {
    return res.status(503).json({ error: 'Auth store saknar audit writer.' });
  }

  const rawPayload = asObject(req.body);
  const input = asObject(
    rawPayload.input && typeof rawPayload.input === 'object'
      ? rawPayload.input
      : rawPayload
  );
  const eventType = toCcoUsageEventType(input.eventType || input.type || input.action);
  if (!eventType) {
    return res.status(422).json({
      error:
        'eventType måste vara workspace_open, draft_mode_selected, focus_mode_toggled, indicator_override_set, indicator_override_cleared, outcome_recorded, reply_sent, reply_later, customer_replied eller conversation_deleted.',
    });
  }

  const actor = toActor(req);
  const tenantId = toTenantId(req);
  const correlationId = toCorrelationId(req);
  const nowIso = new Date().toISOString();
  const timestamp = toIso(input.timestamp) || nowIso;
  const conversationId = normalizeText(input.conversationId);
  const selectedMode = normalizeText(input.selectedMode).toLowerCase();
  const recommendedMode = normalizeText(input.recommendedMode).toLowerCase();
  const ignoredRecommended =
    input.ignoredRecommended === true ||
    (selectedMode &&
      recommendedMode &&
      ['short', 'warm', 'professional'].includes(selectedMode) &&
      ['short', 'warm', 'professional'].includes(recommendedMode) &&
      selectedMode !== recommendedMode);

  let action = '';
  let targetType = 'cco_workspace';
  let targetId = normalizeText(input.workspaceId) || 'cco';
  let metadata = {
    timestamp,
    correlationId,
  };

  if (eventType === 'workspace_open') {
    action = 'cco.workspace.open';
    metadata = {
      ...metadata,
      route: normalizeText(input.route) || '/cco',
    };
  } else if (eventType === 'draft_mode_selected') {
    action = 'cco.draft.mode_selected';
    targetType = 'cco_conversation';
    targetId = conversationId || targetId;
    metadata = {
      ...metadata,
      conversationId: conversationId || null,
      selectedMode: ['short', 'warm', 'professional'].includes(selectedMode) ? selectedMode : null,
      recommendedMode: ['short', 'warm', 'professional'].includes(recommendedMode)
        ? recommendedMode
        : null,
      ignoredRecommended,
    };
  } else if (eventType === 'focus_mode_toggled') {
    action = 'cco.focus.toggled';
    metadata = {
      ...metadata,
      isActive: input.isActive === true,
      source: normalizeText(input.source) || 'ui',
    };
  } else if (eventType === 'indicator_override_set') {
    if (!conversationId) {
      return res.status(422).json({ error: 'conversationId krävs för indicator_override_set.' });
    }
    const overrideState = toCcoIndicatorOverrideState(
      input.overrideState || input.state || input.indicatorState
    );
    if (!overrideState) {
      return res.status(422).json({
        error: 'overrideState måste vara new, medium, high, critical eller handled.',
      });
    }
    action = 'cco.indicator.override.set';
    targetType = 'cco_conversation';
    targetId = conversationId;
    metadata = {
      ...metadata,
      conversationId,
      overrideState,
      overrideBy: normalizeText(input.overrideBy || actor.email || actor.id || ''),
      overrideAt: toIso(input.overrideAt) || timestamp,
    };
  } else if (eventType === 'indicator_override_cleared') {
    if (!conversationId) {
      return res.status(422).json({ error: 'conversationId krävs för indicator_override_cleared.' });
    }
    action = 'cco.indicator.override.cleared';
    targetType = 'cco_conversation';
    targetId = conversationId;
    metadata = {
      ...metadata,
      conversationId,
      clearedAt: toIso(input.clearedAt) || timestamp,
    };
  } else if (eventType === 'outcome_recorded') {
    if (!conversationId) {
      return res.status(422).json({ error: 'conversationId krävs för outcome_recorded.' });
    }
    const outcomeCode = normalizeHistoryOutcomeCode(
      input.outcomeCode || input.outcomeLabel || input.outcome || input.label
    );
    if (!outcomeCode) {
      return res.status(422).json({
        error:
          'outcomeCode måste vara booked, rebooked, replied, not_interested, escalated, no_response eller closed_no_action.',
      });
    }
    const customerEmail = toMailboxAddress(input.customerEmail);
    if (!customerEmail) {
      return res.status(422).json({ error: 'customerEmail krävs för outcome_recorded.' });
    }
    const mailboxId = toMailboxAddress(input.mailboxId || input.mailboxAddress);
    const outcomeLabel = normalizeText(input.outcomeLabel || input.outcome || input.label) || null;
    const recordedAt = toIso(input.recordedAt || input.handledAt) || timestamp;
    const selectedMode = normalizeHistoryDraftMode(input.selectedMode);
    const recommendedMode = normalizeHistoryDraftMode(input.recommendedMode);
    const priorityLevel = normalizeHistoryPriorityLevel(input.priorityLevel);
    const priorityScore = Number(input.priorityScore);
    const dominantRisk = normalizeText(input.dominantRisk).toLowerCase() || null;
    const recommendedAction = normalizeText(input.recommendedAction) || null;
    const riskStackExplanation = normalizeText(input.riskStackExplanation) || null;
    const historySignalPattern = normalizeText(input.historySignalPattern).toLowerCase() || null;
    const historySignalSummary = normalizeText(input.historySignalSummary) || null;
    const intent = normalizeText(input.intent) || null;

    if (ccoHistoryStore && typeof ccoHistoryStore.recordOutcome === 'function') {
      await ccoHistoryStore.recordOutcome({
        tenantId,
        conversationId,
        mailboxId: mailboxId || null,
        customerEmail,
        outcomeCode,
        outcomeLabel,
        recordedAt,
        actorUserId: actor.id,
        source: 'cco_usage_event',
        selectedMode: selectedMode || null,
        recommendedMode: recommendedMode || null,
        priorityLevel,
        priorityScore: Number.isFinite(priorityScore) ? priorityScore : null,
        dominantRisk,
        recommendedAction,
        riskStackExplanation,
        historySignalPattern,
        historySignalSummary,
        intent,
      });
    }

    action = 'cco.outcome.recorded';
    targetType = 'cco_conversation';
    targetId = conversationId;
    metadata = {
      ...metadata,
      conversationId,
      messageId: normalizeText(input.messageId) || null,
      mailboxId: mailboxId || null,
      customerEmail,
      outcomeCode,
      outcomeLabel,
      recordedAt,
      selectedMode: selectedMode || null,
      recommendedMode: recommendedMode || null,
      priorityLevel: priorityLevel || null,
      priorityScore: Number.isFinite(priorityScore) ? priorityScore : null,
      dominantRisk,
      recommendedAction,
      historySignalPattern,
      intent,
    };
  } else if (
    eventType === 'reply_sent' ||
    eventType === 'reply_later' ||
    eventType === 'customer_replied' ||
    eventType === 'conversation_deleted'
  ) {
    if (!conversationId) {
      return res.status(422).json({
        error: `conversationId krävs för ${eventType}.`,
      });
    }
    const mailboxId = toMailboxAddress(input.mailboxId || input.mailboxAddress);
    const customerEmail = toMailboxAddress(input.customerEmail);
    const selectedActionType = normalizeHistoryActionType(eventType);
    const recordedAt = toIso(
      input.recordedAt || input.handledAt || input.deletedAt || input.replyAt || input.timestamp
    ) || timestamp;
    const selectedMode = normalizeHistoryDraftMode(input.selectedMode);
    const recommendedMode = normalizeHistoryDraftMode(input.recommendedMode);
    const priorityLevel = normalizeHistoryPriorityLevel(input.priorityLevel);
    const priorityScore = Number(input.priorityScore);
    const dominantRisk = normalizeText(input.dominantRisk).toLowerCase() || null;
    const recommendedAction = normalizeText(input.recommendedAction) || null;
    const riskStackExplanation = normalizeText(input.riskStackExplanation) || null;
    const historySignalPattern = normalizeText(input.historySignalPattern).toLowerCase() || null;
    const historySignalSummary = normalizeText(input.historySignalSummary) || null;
    const subject = normalizeText(input.subject) || null;
    const waitingOn = normalizeText(input.waitingOn).toLowerCase() || null;
    const nextActionLabel = normalizeText(input.nextActionLabel) || null;
    const nextActionSummary = normalizeText(input.nextActionSummary) || null;
    const followUpDueAt = toIso(input.followUpDueAt) || null;
    const intent = normalizeText(input.intent) || null;
    const actionLabel =
      normalizeText(input.actionLabel) ||
      (eventType === 'reply_sent'
        ? 'Svar skickat'
        : eventType === 'reply_later'
          ? 'Svara senare'
          : eventType === 'customer_replied'
            ? 'Kunden svarade'
            : 'Flyttad till papperskorg');

    if (ccoHistoryStore && typeof ccoHistoryStore.recordAction === 'function') {
      await ccoHistoryStore.recordAction({
        tenantId,
        conversationId,
        mailboxId: mailboxId || null,
        customerEmail: customerEmail || null,
        actionType: selectedActionType,
        actionLabel,
        subject,
        recordedAt,
        actorUserId: actor.id,
        source: 'cco_usage_event',
        selectedMode: selectedMode || null,
        recommendedMode: recommendedMode || null,
        priorityLevel,
        priorityScore: Number.isFinite(priorityScore) ? priorityScore : null,
        dominantRisk,
        recommendedAction,
        riskStackExplanation,
        historySignalPattern,
        historySignalSummary,
        waitingOn,
        nextActionLabel,
        nextActionSummary,
        followUpDueAt,
        intent,
      });
    }

    action =
      eventType === 'reply_sent'
        ? 'cco.reply.sent'
        : eventType === 'reply_later'
          ? 'cco.reply.later'
          : eventType === 'customer_replied'
            ? 'cco.customer.replied'
            : 'cco.conversation.deleted';
    targetType = 'cco_conversation';
    targetId = conversationId;
    metadata = {
      ...metadata,
      conversationId,
      messageId: normalizeText(input.messageId) || null,
      mailboxId: mailboxId || null,
      customerEmail: customerEmail || null,
      subject,
      actionLabel,
      recordedAt,
      selectedMode: selectedMode || null,
      recommendedMode: recommendedMode || null,
      priorityLevel: priorityLevel || null,
      priorityScore: Number.isFinite(priorityScore) ? priorityScore : null,
      dominantRisk,
      recommendedAction,
      historySignalPattern,
      historySignalSummary,
      waitingOn,
      nextActionLabel,
      nextActionSummary,
      followUpDueAt,
      intent,
    };
  }

  const event = await authStore.addAuditEvent({
    tenantId,
    actorUserId: actor.id,
    action,
    outcome: 'success',
    targetType,
    targetId,
    metadata,
  });

  return res.json({
    ok: true,
    action,
    eventType,
    auditRef: event?.id || null,
    loggedAt: event?.ts || timestamp,
  });
}

async function readCcoMetricsHandler({ req, res, authStore, capabilityAnalysisStore }) {
  if (!authStore || typeof authStore.listAuditEvents !== 'function') {
    return res.status(503).json({ error: 'Auth store saknar audit reader.' });
  }

  const tenantId = toTenantId(req);
  const window = toSinceWindow(req.query?.since);
  const auditEvents = await authStore.listAuditEvents({
    tenantId,
    limit: 500,
  });
  const recentAuditEvents = asArray(auditEvents).filter((event) => {
    const tsMs = toEventTimestampMs(event);
    return Number.isFinite(tsMs) && tsMs >= window.startAtMs;
  });

  const sprintStartEvents = recentAuditEvents.filter(
    (event) => normalizeText(event?.action) === 'cco.sprint.start'
  );
  const sprintItemCompletedEvents = recentAuditEvents.filter(
    (event) => normalizeText(event?.action) === 'cco.sprint.item_completed'
  );
  const sprintCompleteEvents = recentAuditEvents.filter(
    (event) => normalizeText(event?.action) === 'cco.sprint.complete'
  );

  const itemSlaAgeHours = sprintItemCompletedEvents
    .map((event) => toSprintSlaAgeHours(event?.metadata?.slaAgeHours ?? event?.metadata?.slaAge))
    .filter((value) => Number.isFinite(value));
  const sprintDurationsMinutes = sprintCompleteEvents
    .map((event) => Number(event?.metadata?.durationMs) / (60 * 1000))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const sprintItemsCompleted = sprintCompleteEvents
    .map((event) => Number(event?.metadata?.itemsCompleted))
    .filter((value) => Number.isFinite(value) && value >= 0);

  let analysisEntries = [];
  let recentEntries = [];
  let previousEntry = null;
  let conversationWorklist = [];
  let previousConversationWorklist = [];
  if (capabilityAnalysisStore && typeof capabilityAnalysisStore.list === 'function') {
    analysisEntries = await capabilityAnalysisStore.list({
      tenantId,
      capabilityName: 'CCO.InboxAnalysis',
      limit: 400,
    });
    recentEntries = asArray(analysisEntries).filter((entry) => {
      const tsMs = toEventTimestampMs(entry);
      return Number.isFinite(tsMs) && tsMs >= window.startAtMs;
    });
    const sourceEntries = recentEntries.length > 0 ? recentEntries : asArray(analysisEntries);
    const latestEntry = sourceEntries[0] || null;
    conversationWorklist = asArray(latestEntry?.output?.data?.conversationWorklist);
    previousEntry =
      asArray(analysisEntries)
        .filter((entry) => {
          const tsMs = toEventTimestampMs(entry);
          return Number.isFinite(tsMs) && tsMs < window.startAtMs;
        })
        .sort((left, right) => String(right?.ts || '').localeCompare(String(left?.ts || '')))[0] ||
      sourceEntries[1] ||
      null;
    previousConversationWorklist = asArray(previousEntry?.output?.data?.conversationWorklist);
  }

  const unresolved = conversationWorklist.filter(
    (row) => toNeedsReplyStatus(row?.needsReplyStatus) !== 'handled'
  );
  const criticalOver48hCount = unresolved.filter((row) => {
    return (
      toPriorityLevel(row?.priorityLevel) === 'Critical' &&
      toSlaAgeHours(row?.hoursSinceInbound) >= 48
    );
  }).length;
  const highOver24hCount = unresolved.filter((row) => {
    return (
      toPriorityLevel(row?.priorityLevel) === 'High' &&
      toSlaAgeHours(row?.hoursSinceInbound) >= 24
    );
  }).length;
  const unansweredCount = unresolved.length;

  const stressScore = criticalOver48hCount * 3 + highOver24hCount * 2 + unansweredCount;
  const latestSprintFeedback = buildLatestCcoSprintFeedback({
    startEvents: sprintStartEvents,
    completeEvents: sprintCompleteEvents,
  });
  const avgResponseTimeHours = toAverage(itemSlaAgeHours, 2);
  const avgSprintDurationMinutes = toAverage(sprintDurationsMinutes, 2);
  const avgItemsPerSprint = toAverage(sprintItemsCompleted, 2);
  const sprintCompletionRate = sprintStartEvents.length
    ? Number(((sprintCompleteEvents.length / sprintStartEvents.length) * 100).toFixed(1))
    : 0;

  const windowDays = Math.max(1, Math.round(window.durationMs / (24 * 60 * 60 * 1000)));
  const followRateSeed = (() => {
    const modeEvents = recentAuditEvents.filter(
      (event) => normalizeText(event?.action).toLowerCase() === 'cco.draft.mode_selected'
    );
    if (!modeEvents.length) return 0;
    const followed = modeEvents.filter((event) => event?.metadata?.ignoredRecommended !== true).length;
    return clampInteger((followed / modeEvents.length) * 100, 0, 100, 0) / 100;
  })();
  const activeDaySeed = new Set();
  recentAuditEvents.forEach((event) => {
    const action = normalizeText(event?.action).toLowerCase();
    if (!action.startsWith('cco.')) return;
    const tsMs = toEventTimestampMs(event);
    if (!Number.isFinite(tsMs)) return;
    activeDaySeed.add(new Date(tsMs).toISOString().slice(0, 10));
  });
  recentEntries.forEach((entry) => {
    const tsMs = toEventTimestampMs(entry);
    if (!Number.isFinite(tsMs)) return;
    activeDaySeed.add(new Date(tsMs).toISOString().slice(0, 10));
  });
  const ccoUsageRateSeed = Math.max(0, Math.min(1, activeDaySeed.size / windowDays));
  const sprintCompletionRateSeed = sprintCompletionRate / 100;
  const sortedAnalysisEntries = asArray(analysisEntries)
    .slice()
    .sort((left, right) => String(left?.ts || '').localeCompare(String(right?.ts || '')));
  const healthHistory = sortedAnalysisEntries
    .map((entry) => {
      const ts = toIso(entry?.ts);
      if (!ts) return null;
      const snapshotMetrics = computeWorklistSnapshotMetrics(
        asArray(entry?.output?.data?.conversationWorklist)
      );
      const score = computeHealthScore({
        snapshotMetrics,
        avgResponseTimeHours,
        recommendationFollowRate: followRateSeed,
        ccoUsageRate: ccoUsageRateSeed,
        sprintCompletionRate: sprintCompletionRateSeed,
      });
      return {
        ts,
        score,
        slaBreachRate: snapshotMetrics.slaBreachRate,
      };
    })
    .filter(Boolean)
    .slice(-30);

  const usageAnalytics = computeUsageAnalytics({
    windowDays,
    auditEvents: recentAuditEvents,
    analysisEntries: recentEntries,
    currentConversationWorklist: conversationWorklist,
    previousConversationWorklist,
    healthHistory,
  });

  const clusterSignals = {
    slaBreachRateUp: usageAnalytics.slaBreachTrendPercent > 0,
    complaintSpike: usageAnalytics.complaintTrendPercent > 0,
    conversionDrop: usageAnalytics.conversionTrendPercent < 0,
    volatilityIndex: usageAnalytics.volatilityIndex,
  };
  const redFlagState = evaluateRedFlag({
    healthHistory,
    currentHealthScore: usageAnalytics.healthScore,
    clusterSignals,
    usageMetrics: usageAnalytics,
  });
  const volatilityHistory = healthHistory.map((point, index, list) => {
    if (index === 0) return { ts: point.ts, index: 0 };
    const previous = list[index - 1];
    const delta = Math.abs(toNumber(point.score, 0) - toNumber(previous?.score, 0));
    return {
      ts: point.ts,
      index: Number((Math.min(1, delta / 20)).toFixed(3)),
    };
  });
  const recoveryState = evaluateRecovery({
    redFlagState,
    healthHistory,
    slaBreachHistory: healthHistory.map((point) => ({
      ts: point.ts,
      rate: point.slaBreachRate,
    })),
    volatilityHistory,
    driverDeltas: {
      health_drop: redFlagState.delta,
      sla_breach: usageAnalytics.slaBreachTrendPercent,
      complaint_spike: usageAnalytics.complaintTrendPercent,
      conversion_drop: usageAnalytics.conversionTrendPercent,
      volatility: usageAnalytics.volatilityIndex - 0.6,
      health_threshold: usageAnalytics.healthScore - 60,
    },
  });
  const adaptiveFocusState = resolveAdaptiveFocusState({
    redFlagState,
    recoveryState,
    nowMs: Date.now(),
    durationHours: 48,
  });
  const generatedAt = new Date().toISOString();
  const strategicInsights = evaluateStrategicInsights({
    analysisEntries,
    usageAnalytics,
    redFlagState,
    adaptiveFocusState,
    recoveryState,
    generatedAt,
  });

  return res.json({
    avgResponseTimeHours,
    criticalOver48hCount,
    avgSprintDurationMinutes,
    avgItemsPerSprint,
    sprintCompletionRate,
    stressProxyIndex: {
      score: stressScore,
      level: toStressLevel(stressScore),
      factors: {
        criticalOver48h: criticalOver48hCount,
        highOver24h: highOver24hCount,
        unansweredCount,
      },
    },
    usageAnalytics,
    redFlagState,
    adaptiveFocusState,
    recoveryState,
    strategicInsights,
    healthScore: usageAnalytics.healthScore,
    latestSprintFeedback,
    since: window.since,
    generatedAt,
  });
}

function toCcoRuntimeStatusHandler({
  authStore,
  capabilityAnalysisStore,
  ccoSettingsStore = null,
  graphReadEnabled = false,
  graphSendEnabled = false,
  graphDeleteEnabled = false,
  graphReadConnectorAvailable = false,
  graphSendConnectorAvailable = false,
}) {
  return async (req, res) => {
    const tenantId = toTenantId(req);
    const graphReadOptions = toGraphReadOptionsFromEnv();
    const normalizedAllowlistMailboxIds = asArray(graphReadOptions.allowlistMailboxIds)
      .map((mailboxId) => normalizeMailboxAddress(mailboxId) || normalizeText(mailboxId).toLowerCase())
      .filter(Boolean);
    const normalizedSendAllowlistMailboxIds = parseMailboxIds(process.env.ARCANA_GRAPH_SEND_ALLOWLIST)
      .map((mailboxId) => normalizeMailboxAddress(mailboxId) || normalizeText(mailboxId).toLowerCase())
      .filter(Boolean);
    const normalizedDeleteAllowlistMailboxIds = parseMailboxIds(
      process.env.ARCANA_CCO_DELETE_ALLOWLIST || process.env.ARCANA_GRAPH_SEND_ALLOWLIST
    )
      .map((mailboxId) => normalizeMailboxAddress(mailboxId) || normalizeText(mailboxId).toLowerCase())
      .filter(Boolean);
    const tenantSettings =
      ccoSettingsStore && typeof ccoSettingsStore.getTenantSettings === 'function'
        ? await ccoSettingsStore.getTenantSettings({ tenantId })
        : {};
    const mailboxSettingsDocument = buildCanonicalCcoMailboxSettingsDocument({
      tenantSettings,
      defaultSenderMailboxId: process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX,
      readAllowlistMailboxIds: normalizedAllowlistMailboxIds,
      sendAllowlistMailboxIds: normalizedSendAllowlistMailboxIds,
      deleteAllowlistMailboxIds: normalizedDeleteAllowlistMailboxIds,
      graphReadEnabled,
      graphSendEnabled,
      graphDeleteEnabled,
    });
    const signatureProfiles = asArray(mailboxSettingsDocument.signatureProfiles).map((profile) => ({
      key: normalizeText(profile?.key) || 'fazli',
      fullName: normalizeText(profile?.fullName) || normalizeText(profile?.label) || '',
      title: normalizeText(profile?.title) || '',
      senderMailboxId:
        normalizeMailboxAddress(profile?.senderMailboxId) || 'contact@hairtpclinic.com',
      email:
        normalizeMailboxAddress(profile?.email || profile?.senderMailboxId) ||
        normalizeMailboxAddress(profile?.senderMailboxId) ||
        'contact@hairtpclinic.com',
      displayEmail:
        normalizeMailboxAddress(
          profile?.displayEmail || profile?.visibleEmail || profile?.email || profile?.senderMailboxId
        ) ||
        normalizeMailboxAddress(profile?.email || profile?.senderMailboxId) ||
        'contact@hairtpclinic.com',
      html: normalizeText(profile?.html || profile?.bodyHtml || profile?.body_html),
      label: normalizeText(profile?.label) || normalizeText(profile?.fullName) || 'Signatur',
      source: normalizeText(profile?.source) || 'profile',
    }));
    const defaultSenderMailbox =
      normalizeMailboxAddress(mailboxSettingsDocument?.defaults?.senderMailboxId) ||
      'contact@hairtpclinic.com';
    const defaultSignatureProfile =
      normalizeText(mailboxSettingsDocument?.defaults?.signatureProfileId) || 'fazli';
    const senderMailboxOptions = asArray(mailboxSettingsDocument.senderMailboxOptions)
      .map((mailboxId) => normalizeMailboxAddress(mailboxId))
      .filter(Boolean);
    const mailboxCapabilities = asArray(mailboxSettingsDocument.mailboxCapabilities).map((capability) => ({
      ...capability,
      id: normalizeMailboxAddress(capability?.id || capability?.email),
      email: normalizeMailboxAddress(capability?.email || capability?.id),
      label: normalizeText(capability?.label) || 'Mailbox',
      signatureProfileId: normalizeText(capability?.signatureProfileId) || null,
      signatureProfileLabel: normalizeText(capability?.signatureProfileLabel) || null,
    }));
    const runtimeMode = graphReadEnabled === true ? 'live' : 'offline_history';

    let latestAnalysisEntry = null;
    if (capabilityAnalysisStore && typeof capabilityAnalysisStore.list === 'function') {
      const entries = await capabilityAnalysisStore.list({
        tenantId,
        capabilityName: 'CCO.InboxAnalysis',
        limit: 1,
      });
      latestAnalysisEntry = asArray(entries)[0] || null;
    }

    const latestOutputData = asObject(latestAnalysisEntry?.output?.data);
    const conversationWorklist = asArray(latestOutputData.conversationWorklist);
    const inboundFeed = asArray(latestOutputData.inboundFeed);
    const outboundFeed = asArray(latestOutputData.outboundFeed);
    const systemmailCount = conversationWorklist.filter((row) => {
      const classification = normalizeText(row?.messageClassification).toLowerCase();
      return classification === 'system_mail';
    }).length;

    let latestReadStart = null;
    let latestReadComplete = null;
    let latestReadError = null;
    if (authStore && typeof authStore.listAuditEvents === 'function') {
      const auditEvents = await authStore.listAuditEvents({
        tenantId,
        limit: 800,
      });
      for (const event of asArray(auditEvents)) {
        const action = normalizeText(event?.action).toLowerCase();
        if (!latestReadStart && action === 'mailbox.read.start') {
          latestReadStart = event;
        } else if (!latestReadComplete && action === 'mailbox.read.complete') {
          latestReadComplete = event;
        } else if (!latestReadError && action === 'mailbox.read.error') {
          latestReadError = event;
        }
        if (latestReadStart && latestReadComplete && latestReadError) break;
      }
    }

    const pickAuditSnapshot = (event) => {
      if (!event || typeof event !== 'object') return null;
      const metadata = asObject(event.metadata);
      return {
        id: normalizeText(event.id) || null,
        ts: normalizeText(event.ts) || null,
        action: normalizeText(event.action) || null,
        outcome: normalizeText(event.outcome) || null,
        mailboxCount: toNumber(metadata.mailboxCount, null),
        mailboxErrors: toNumber(metadata.mailboxErrors, null),
        inboundMessageCount: toNumber(metadata.inboundMessageCount, null),
        outboundMessageCount: toNumber(metadata.outboundMessageCount, null),
        errorMessage: normalizeText(metadata.errorMessage) || null,
      };
    };

    return res.json({
      generatedAt: new Date().toISOString(),
      graph: {
        readEnabled: graphReadEnabled === true,
        sendEnabled: graphSendEnabled === true,
        deleteEnabled: graphDeleteEnabled === true,
        runtimeMode,
        defaultSenderMailbox,
        defaultSignatureProfile,
        senderMailboxOptions,
        signatureProfiles,
        mailboxCapabilities,
        readConnectorAvailable: graphReadConnectorAvailable === true,
        sendConnectorAvailable: graphSendConnectorAvailable === true,
        fullTenant: graphReadOptions.fullTenant === true,
        userScope: graphReadOptions.userScope,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: normalizedAllowlistMailboxIds,
        allowlistMailboxCount: normalizedAllowlistMailboxIds.length,
        maxUsers: toNumber(graphReadOptions.maxUsers, 0),
        maxMessagesPerUser: toNumber(graphReadOptions.maxMessagesPerUser, 0),
        maxInboxMessagesPerUser: toNumber(graphReadOptions.maxInboxMessagesPerUser, 0),
        maxSentMessagesPerUser: toNumber(graphReadOptions.maxSentMessagesPerUser, 0),
        maxMessages: toNumber(graphReadOptions.maxMessages, 0),
        maxInboxMessages: toNumber(graphReadOptions.maxInboxMessages, 0),
        maxSentMessages: toNumber(graphReadOptions.maxSentMessages, 0),
      },
      latestCounts: {
        worklistCount: conversationWorklist.length,
        inboundFeedCount: inboundFeed.length,
        outboundFeedCount: outboundFeed.length,
        systemmailCount,
      },
      latestAnalysis: {
        ts: normalizeText(latestAnalysisEntry?.ts) || null,
        generatedAt: normalizeText(latestOutputData.generatedAt) || null,
      },
      latestAudit: {
        mailboxReadStart: pickAuditSnapshot(latestReadStart),
        mailboxReadComplete: pickAuditSnapshot(latestReadComplete),
        mailboxReadError: pickAuditSnapshot(latestReadError),
      },
    });
  };
}

function toCcoRuntimeHistoryQuery(query = {}) {
  const safeQuery = asObject(query);
  const mailboxIds = resolveCcoRuntimeHistoryMailboxIds(safeQuery);
  const customerEmail = toMailboxAddress(safeQuery.customerEmail);
  const conversationId = normalizeText(safeQuery.conversationId);
  const requestedCustomerEmail = normalizeText(safeQuery.customerEmail);
  const includeBodyHtml = toBoolean(safeQuery.includeBodyHtml, true);
  const lookbackDays = clampInteger(
    safeQuery.lookbackDays,
    30,
    CCO_KONS_HISTORY_MAX_LOOKBACK_DAYS,
    CCO_KONS_HISTORY_DEFAULT_LOOKBACK_DAYS
  );

  if (requestedCustomerEmail && !customerEmail) {
    return {
      ok: false,
      status: 400,
      error: 'customerEmail måste vara en giltig e-postadress.',
    };
  }
  if (!customerEmail && !conversationId && mailboxIds.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'customerEmail, conversationId eller mailboxIds krävs för att läsa historik.',
    };
  }

  return {
    ok: true,
    mailboxId: mailboxIds[0] || CCO_KONS_HISTORY_DEFAULT_MAILBOX,
    mailboxIds,
    customerEmail,
    conversationId,
    includeBodyHtml,
    lookbackDays,
  };
}

function doesHistoryMessageMatchCustomer(message = {}, customerEmail = '') {
  return matchesMailboxAddressAlias(customerEmail, [
    message.customerEmail,
    message.counterpartyEmail,
    message.senderEmail,
    ...asArray(message.recipients),
    ...asArray(message.replyToRecipients),
  ]);
}

function collectHistoryMessages(snapshot = {}) {
  const allMessages = [];
  for (const conversation of asArray(snapshot.conversations)) {
    const conversationId = normalizeText(conversation.conversationId);
    const subject = normalizeText(conversation.subject) || '(utan ämne)';
    const customerEmail = toMailboxAddress(conversation.customerEmail).toLowerCase() || null;
    for (const message of asArray(conversation.messages)) {
      const messageId = normalizeText(message.messageId);
      if (!messageId) continue;
      allMessages.push({
        messageId,
        conversationId: normalizeText(message.conversationId) || conversationId,
        subject: normalizeText(message.subject) || subject,
        customerEmail,
        sentAt: toIso(message.sentAt),
        direction: normalizeText(message.direction).toLowerCase() === 'outbound' ? 'outbound' : 'inbound',
        bodyPreview: normalizeText(message.bodyPreview) || '',
        senderEmail: toMailboxAddress(message.senderEmail) || null,
        senderName: normalizeText(message.senderName) || null,
        recipients: asArray(message.recipients).map((item) => toMailboxAddress(item)).filter(Boolean),
        replyToRecipients: asArray(message.replyToRecipients)
          .map((item) => toMailboxAddress(item))
          .filter(Boolean),
        internetMessageId: normalizeText(message.internetMessageId).toLowerCase() || null,
        counterpartyEmail:
          toMailboxAddress(message.counterpartyEmail || message.customerEmail || message.senderEmail) ||
          null,
        mailboxId: toMailboxAddress(message.mailboxId || conversation.mailboxId) || null,
        mailboxAddress: toMailboxAddress(message.mailboxAddress || conversation.mailboxAddress) || null,
        userPrincipalName: toMailboxAddress(message.userPrincipalName || conversation.userPrincipalName) || null,
      });
    }
  }
  return allMessages;
}

function filterHistoryMessages(messages = [], { conversationId = '', customerEmail = '' } = {}) {
  const safeConversationId = normalizeText(conversationId);
  const safeCustomerEmail = toMailboxAddress(customerEmail).toLowerCase();
  if (!safeConversationId && !safeCustomerEmail) return asArray(messages).slice();
  return asArray(messages).filter((message) => {
    if (safeConversationId && normalizeText(message.conversationId) === safeConversationId) {
      return true;
    }
    if (safeCustomerEmail && doesHistoryMessageMatchCustomer(message, safeCustomerEmail)) {
      return true;
    }
    return false;
  });
}

function summarizeHistoryMessages(messages = []) {
  const safeMessages = asArray(messages)
    .filter((message) => normalizeText(message.messageId))
    .slice()
    .sort((left, right) => String(left?.sentAt || '').localeCompare(String(right?.sentAt || '')));
  const firstMessage = safeMessages[0] || null;
  const latestMessage = safeMessages[safeMessages.length - 1] || null;
  const inboundCount = safeMessages.filter(
    (message) => normalizeText(message.direction).toLowerCase() !== 'outbound'
  ).length;
  const outboundCount = safeMessages.length - inboundCount;
  const conversationCount = new Set(
    safeMessages.map((message) => normalizeText(message.conversationId)).filter(Boolean)
  ).size;
  const mailboxIds = Array.from(
    new Set(
      safeMessages
        .map((message) => toMailboxAddress(message.mailboxId || message.mailboxAddress))
        .filter(Boolean)
    )
  );

  return {
    firstMessageAt: normalizeText(firstMessage?.sentAt) || null,
    latestMessageAt: normalizeText(latestMessage?.sentAt) || null,
    messageCount: safeMessages.length,
    inboundCount,
    outboundCount,
    conversationCount,
    mailboxIds,
    mailboxCount: mailboxIds.length,
  };
}

function toHistoryWindowBounds(lookbackDays = CCO_KONS_HISTORY_DEFAULT_LOOKBACK_DAYS) {
  const endMs = Date.now();
  const startMs = endMs - lookbackDays * 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function splitHistoryWindowIntoChunks({
  startIso,
  endIso,
  chunkDays = CCO_KONS_HISTORY_CHUNK_DAYS,
} = {}) {
  const startMs = Date.parse(String(startIso || ''));
  const endMs = Date.parse(String(endIso || ''));
  const safeChunkDays = Math.max(1, Math.min(90, Number(chunkDays) || CCO_KONS_HISTORY_CHUNK_DAYS));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const chunkMs = safeChunkDays * 24 * 60 * 60 * 1000;
  const chunks = [];
  for (let cursorMs = startMs; cursorMs < endMs; cursorMs += chunkMs) {
    const chunkEndMs = Math.min(endMs, cursorMs + chunkMs);
    chunks.push({
      startIso: new Date(cursorMs).toISOString(),
      endIso: new Date(chunkEndMs).toISOString(),
    });
  }
  return chunks.reverse();
}

function trimRecentHistoryGap(missingWindows = [], mailbox = null, requestedEndIso = '') {
  const safeRequestedEndIso = toIso(requestedEndIso);
  const coverageEndIso = toIso(mailbox?.coverageEndIso);
  if (!safeRequestedEndIso || !coverageEndIso) return asArray(missingWindows);
  const requestedEndMs = Date.parse(safeRequestedEndIso);
  const coverageEndMs = Date.parse(coverageEndIso);
  if (!Number.isFinite(requestedEndMs) || !Number.isFinite(coverageEndMs)) {
    return asArray(missingWindows);
  }
  const trailingGapMs = requestedEndMs - coverageEndMs;
  if (trailingGapMs <= 0 || trailingGapMs > CCO_KONS_HISTORY_RECENT_FRESHNESS_MS) {
    return asArray(missingWindows);
  }
  return asArray(missingWindows).filter((window) => {
    const startMs = Date.parse(String(window?.startIso || ''));
    const endMs = Date.parse(String(window?.endIso || ''));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return true;
    const isTrailingGap = startMs >= coverageEndMs && endMs <= requestedEndMs;
    return !isTrailingGap;
  });
}

async function fetchHistoryWindowMessagesFromGraph({
  graphReadConnector,
  mailboxId,
  windowStartIso,
  windowEndIso,
}) {
  const graphReadOptions = toGraphReadOptionsFromEnv();
  const snapshot = asObject(
    await graphReadConnector.fetchInboxSnapshot({
      ...graphReadOptions,
      includeRead: true,
      fullTenant: true,
      userScope: 'all',
      maxUsers: 1,
      maxMessages: 200,
      maxInboxMessages: 200,
      maxSentMessages: 200,
      maxMessagesPerUser: 200,
      maxInboxMessagesPerUser: 200,
      maxSentMessagesPerUser: 200,
      mailboxIds: [mailboxId],
      sinceIso: windowStartIso,
      untilIso: windowEndIso,
    })
  );
  return collectHistoryMessages(snapshot);
}

async function readHistoryMessagesFromGraph({
  graphReadConnector,
  mailboxId,
  mailboxIds = [],
  customerEmail,
  conversationId,
  lookbackDays,
}) {
  const { startIso, endIso } = toHistoryWindowBounds(lookbackDays);
  const messageMap = new Map();
  const chunkWindows = splitHistoryWindowIntoChunks({
    startIso,
    endIso,
    chunkDays: CCO_KONS_HISTORY_CHUNK_DAYS,
  });
  const targetMailboxIds = normalizeMailboxIdList(
    mailboxIds.length > 0 ? mailboxIds : [mailboxId],
    50
  );

  for (const currentMailboxId of targetMailboxIds) {
    for (const chunkWindow of chunkWindows) {
      const allMessages = await fetchHistoryWindowMessagesFromGraph({
        graphReadConnector,
        mailboxId: currentMailboxId,
        windowStartIso: chunkWindow.startIso,
        windowEndIso: chunkWindow.endIso,
      });
      const matchedMessages = filterHistoryMessages(allMessages, {
        conversationId,
        customerEmail,
      });
      for (const message of matchedMessages) {
        const compositeKey = `${toMailboxAddress(message.mailboxId || currentMailboxId)}:${normalizeText(message.messageId)}`;
        if (!normalizeText(message.messageId) || messageMap.has(compositeKey)) continue;
        messageMap.set(compositeKey, message);
      }
    }
  }

  const messages = Array.from(messageMap.values()).sort((left, right) =>
    String(right?.sentAt || '').localeCompare(String(left?.sentAt || ''))
  );
  return {
    messages,
    summary: summarizeHistoryMessages(messages),
    windowCount: chunkWindows.length * Math.max(1, targetMailboxIds.length),
    store: null,
  };
}

async function ensureCcoRuntimeHistoryCoverage({
  tenantId,
  mailboxId,
  lookbackDays,
  graphReadConnector,
  graphReadEnabled = false,
  ccoHistoryStore = null,
  refresh = false,
}) {
  const safeTenantId = normalizeText(tenantId);
  const safeMailboxId = toMailboxAddress(mailboxId);
  if (
    !ccoHistoryStore ||
    typeof ccoHistoryStore.getMissingMailboxWindows !== 'function' ||
    typeof ccoHistoryStore.upsertMailboxWindow !== 'function' ||
    typeof ccoHistoryStore.getMailboxSummary !== 'function'
  ) {
    return {
      mailbox: null,
      missingWindows: [],
      backfilledWindowCount: 0,
      available: false,
      startIso: null,
      endIso: null,
    };
  }

  const { startIso, endIso } = toHistoryWindowBounds(lookbackDays);
  const missingWindows = refresh
    ? [{ startIso, endIso }]
    : trimRecentHistoryGap(
        ccoHistoryStore.getMissingMailboxWindows({
          tenantId: safeTenantId,
          mailboxId: safeMailboxId,
          startIso,
          endIso,
        }),
        ccoHistoryStore.getMailboxSummary({
          tenantId: safeTenantId,
          mailboxId: safeMailboxId,
        }),
        endIso
      );

  if (missingWindows.length === 0) {
    return {
      mailbox: ccoHistoryStore.getMailboxSummary({
        tenantId: safeTenantId,
        mailboxId: safeMailboxId,
      }),
      missingWindows: [],
      backfilledWindowCount: 0,
      available: true,
      startIso,
      endIso,
    };
  }

  if (
    graphReadEnabled !== true ||
    !graphReadConnector ||
    typeof graphReadConnector.fetchInboxSnapshot !== 'function'
  ) {
    return {
      mailbox: ccoHistoryStore.getMailboxSummary({
        tenantId: safeTenantId,
        mailboxId: safeMailboxId,
      }),
      missingWindows,
      backfilledWindowCount: 0,
      available: true,
      startIso,
      endIso,
    };
  }

  const chunkWindows = missingWindows
    .flatMap((window) =>
      splitHistoryWindowIntoChunks({
        startIso: window.startIso,
        endIso: window.endIso,
        chunkDays: CCO_KONS_HISTORY_CHUNK_DAYS,
      })
    );

  for (const chunkWindow of chunkWindows) {
    const allMessages = await fetchHistoryWindowMessagesFromGraph({
      graphReadConnector,
      mailboxId: safeMailboxId,
      windowStartIso: chunkWindow.startIso,
      windowEndIso: chunkWindow.endIso,
    });
    await ccoHistoryStore.upsertMailboxWindow({
      tenantId: safeTenantId,
      mailboxId: safeMailboxId,
      messages: allMessages,
      windowStartIso: chunkWindow.startIso,
      windowEndIso: chunkWindow.endIso,
      source: 'graph_runtime_history_backfill',
    });
  }

  return {
    mailbox: ccoHistoryStore.getMailboxSummary({
      tenantId: safeTenantId,
      mailboxId: safeMailboxId,
    }),
    missingWindows: trimRecentHistoryGap(
      ccoHistoryStore.getMissingMailboxWindows({
        tenantId: safeTenantId,
        mailboxId: safeMailboxId,
        startIso,
        endIso,
      }),
      ccoHistoryStore.getMailboxSummary({
        tenantId: safeTenantId,
        mailboxId: safeMailboxId,
      }),
      endIso
    ),
    backfilledWindowCount: chunkWindows.length,
    available: true,
    startIso,
    endIso,
  };
}

async function ensureCcoRuntimeHistoryCoverageForMailboxIds({
  tenantId,
  mailboxIds = [],
  lookbackDays,
  graphReadConnector,
  graphReadEnabled = false,
  ccoHistoryStore = null,
  refresh = false,
}) {
  const coverages = [];
  for (const mailboxId of normalizeMailboxIdList(mailboxIds, 50)) {
    coverages.push(
      await ensureCcoRuntimeHistoryCoverage({
        tenantId,
        mailboxId,
        lookbackDays,
        graphReadConnector,
        graphReadEnabled,
        ccoHistoryStore,
        refresh,
      })
    );
  }
  return coverages;
}

async function collectStoredMailboxHistoryMessages({
  tenantId,
  mailboxIds = [],
  ccoHistoryStore = null,
  sinceIso = null,
  untilIso = null,
}) {
  if (!ccoHistoryStore || typeof ccoHistoryStore.listMailboxMessages !== 'function') return [];
  const merged = [];
  const seen = new Set();
  for (const mailboxId of normalizeMailboxIdList(mailboxIds, 50)) {
    const mailboxMessages = await ccoHistoryStore.listMailboxMessages({
      tenantId,
      mailboxId,
      sinceIso,
      untilIso,
    });
    for (const message of asArray(mailboxMessages)) {
      const internetMessageId = normalizeText(message.internetMessageId).toLowerCase();
      const dedupeKey = internetMessageId
        ? `internet:${internetMessageId}`
        : [
            normalizeText(message.direction).toLowerCase(),
            toIso(message.sentAt),
            normalizeText(message.normalizedSubject || message.subject).toLowerCase(),
            toMailboxAddress(
              message.counterpartyEmail ||
                message.customerEmail ||
                message.senderEmail ||
                asArray(message.recipients)[0]
            ),
            normalizeText(message.bodyPreview).slice(0, 120).toLowerCase(),
          ].join(':');
      if (!normalizeText(message.messageId) || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(message);
    }
  }
  return merged.sort((left, right) =>
    String(right?.sentAt || '').localeCompare(String(left?.sentAt || ''))
  );
}

function toCcoRuntimeHistoryBackfillInput(input = {}) {
  const safeInput = asObject(input);
  const mailboxIds = resolveCcoRuntimeHistoryMailboxIds(safeInput);
  const lookbackDays = clampInteger(
    safeInput.lookbackDays,
    30,
    CCO_KONS_HISTORY_MAX_LOOKBACK_DAYS,
    CCO_KONS_HISTORY_DEFAULT_LOOKBACK_DAYS
  );
  const refresh = toBoolean(safeInput.refresh, false);
  return {
    mailboxId: mailboxIds[0] || CCO_KONS_HISTORY_DEFAULT_MAILBOX,
    mailboxIds,
    lookbackDays,
    refresh,
  };
}

function toCcoRuntimeHistoryStatusQuery(query = {}) {
  const safeQuery = asObject(query);
  const mailboxIds = resolveCcoRuntimeHistoryMailboxIds(safeQuery);
  return {
    mailboxId: mailboxIds[0] || CCO_KONS_HISTORY_DEFAULT_MAILBOX,
    mailboxIds,
    lookbackDays: clampInteger(
      safeQuery.lookbackDays,
      30,
      CCO_KONS_HISTORY_MAX_LOOKBACK_DAYS,
      CCO_KONS_HISTORY_DEFAULT_LOOKBACK_DAYS
    ),
  };
}

function toCcoRuntimeCalibrationSummaryQuery(query = {}) {
  const safeQuery = asObject(query);
  const mailboxIds = resolveCcoRuntimeHistoryMailboxIds(safeQuery);
  const explicitSinceIso = toIso(safeQuery.sinceIso || safeQuery.from);
  const explicitUntilIso = toIso(safeQuery.untilIso || safeQuery.to);
  return {
    mailboxId: mailboxIds[0] || CCO_KONS_HISTORY_DEFAULT_MAILBOX,
    mailboxIds,
    customerEmail: toMailboxAddress(safeQuery.customerEmail) || null,
    intent: normalizeText(safeQuery.intent) || null,
    lookbackDays: clampInteger(
      safeQuery.lookbackDays,
      30,
      CCO_KONS_HISTORY_MAX_LOOKBACK_DAYS,
      CCO_KONS_HISTORY_DEFAULT_LOOKBACK_DAYS
    ),
    sinceIso: explicitSinceIso,
    untilIso: explicitUntilIso,
  };
}

function toCcoRuntimeHistorySearchQuery(query = {}) {
  const safeQuery = asObject(query);
  const mailboxIds = resolveCcoRuntimeHistoryMailboxIds(safeQuery);
  const customerEmail = toMailboxAddress(safeQuery.customerEmail) || null;
  const conversationId = normalizeText(safeQuery.conversationId) || null;
  const lookbackDays = clampInteger(
    safeQuery.lookbackDays,
    7,
    CCO_KONS_HISTORY_MAX_LOOKBACK_DAYS,
    90
  );
  const limit = clampInteger(safeQuery.limit, 1, 250, 50);
  const q = normalizeText(safeQuery.q || safeQuery.query || safeQuery.search);
  const explicitSinceIso = toIso(safeQuery.sinceIso || safeQuery.from);
  const explicitUntilIso = toIso(safeQuery.untilIso || safeQuery.to);
  const resultTypes = normalizeCcoRuntimeHistoryResultTypes(
    safeQuery.resultTypes || safeQuery.types || safeQuery.type
  );
  const includeMessages = toBoolean(safeQuery.includeMessages, true);
  const includeOutcomes = toBoolean(safeQuery.includeOutcomes, true);
  const includeActions = toBoolean(safeQuery.includeActions, true);
  const actionTypes = normalizeCcoRuntimeHistoryActionTypes(
    safeQuery.actionTypes || safeQuery.actions || safeQuery.action
  );
  const outcomeCodes = normalizeCcoRuntimeHistoryOutcomeCodes(
    safeQuery.outcomeCodes || safeQuery.outcomes || safeQuery.outcome
  );
  return {
    mailboxId: mailboxIds[0] || CCO_KONS_HISTORY_DEFAULT_MAILBOX,
    mailboxIds,
    customerEmail,
    conversationId,
    lookbackDays,
    limit,
    q,
    intent: normalizeText(safeQuery.intent) || null,
    sinceIso: explicitSinceIso,
    untilIso: explicitUntilIso,
    includeMessages,
    includeOutcomes,
    includeActions,
    resultTypes,
    actionTypes,
    outcomeCodes,
  };
}

function sanitizeAttachmentFilename(value = '', fallback = 'bilaga') {
  const safeValue = normalizeText(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return safeValue || fallback;
}

function buildContentDispositionHeader(filename = 'bilaga', { inline = false } = {}) {
  const safeFilename = sanitizeAttachmentFilename(filename);
  const asciiFilename = safeFilename
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '')
    .trim();
  const fallbackFilename = asciiFilename || 'attachment';
  const encodedFilename = encodeURIComponent(safeFilename);
  return `${inline ? 'inline' : 'attachment'}; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function toCcoRuntimeMailAssetQuery(query = {}) {
  const safeQuery = asObject(query);
  const mailboxId =
    toMailboxAddress(
      safeQuery.mailboxId || safeQuery.mailboxAddress || safeQuery.userId || safeQuery.mailbox
    ) || null;
  const messageId = normalizeText(
    safeQuery.messageId || safeQuery.graphMessageId || safeQuery.mailMessageId
  );
  const attachmentId = normalizeText(safeQuery.attachmentId || safeQuery.id || safeQuery.assetId);
  const mode = normalizeText(safeQuery.mode).toLowerCase() === 'open' ? 'open' : 'download';
  const fileName = sanitizeAttachmentFilename(
    safeQuery.fileName || safeQuery.filename || safeQuery.name,
    'bilaga'
  );
  return {
    mailboxId,
    messageId,
    attachmentId,
    mode,
    fileName,
    ok: Boolean(mailboxId && messageId && attachmentId),
  };
}

function toCcoRuntimeShadowQuery(query = {}) {
  const safeQuery = asObject(query);
  const mailboxIds = resolveCcoRuntimeHistoryMailboxIds(safeQuery);
  const explicitSinceIso = toIso(safeQuery.sinceIso || safeQuery.from);
  const explicitUntilIso = toIso(safeQuery.untilIso || safeQuery.to);
  return {
    mailboxId: mailboxIds[0] || CCO_KONS_HISTORY_DEFAULT_MAILBOX,
    mailboxIds,
    lookbackDays: clampInteger(safeQuery.lookbackDays, 7, 90, 14),
    limit: clampInteger(safeQuery.limit, 5, 120, 24),
    intent: normalizeText(safeQuery.intent) || null,
    sinceIso: explicitSinceIso,
    untilIso: explicitUntilIso,
  };
}

function toCcoRuntimeWorklistShadowQuery(query = {}) {
  const safeQuery = asObject(query);
  const mailboxIds = resolveCcoRuntimeHistoryMailboxIds(safeQuery);
  return {
    mailboxId: mailboxIds[0] || CCO_KONS_HISTORY_DEFAULT_MAILBOX,
    mailboxIds,
    limit: clampInteger(safeQuery.limit, 10, 1000, 250),
  };
}

function resolveCcoRuntimeWindowBounds({
  lookbackDays = CCO_KONS_HISTORY_DEFAULT_LOOKBACK_DAYS,
  sinceIso = null,
  untilIso = null,
} = {}) {
  if (sinceIso || untilIso) {
    const fallback = toHistoryWindowBounds(lookbackDays);
    return {
      startIso: sinceIso || fallback.startIso,
      endIso: untilIso || fallback.endIso,
    };
  }
  return toHistoryWindowBounds(lookbackDays);
}

function buildCcoNextConversationHref(conversationId = '') {
  const safeConversationId = normalizeText(conversationId);
  if (!safeConversationId) return '/cco-next';
  const params = new URLSearchParams({ conversationId: safeConversationId });
  return `/cco-next?${params.toString()}`;
}

async function materializeCustomerReplyActions({
  tenantId,
  messages = [],
  ccoHistoryStore = null,
} = {}) {
  if (
    !ccoHistoryStore ||
    typeof ccoHistoryStore.searchHistoryRecords !== 'function' ||
    typeof ccoHistoryStore.recordAction !== 'function'
  ) {
    return 0;
  }

  const messagesByConversation = new Map();
  for (const message of asArray(messages)) {
    const conversationId = normalizeText(message?.conversationId);
    if (!conversationId) continue;
    const entry = messagesByConversation.get(conversationId) || [];
    entry.push(message);
    messagesByConversation.set(conversationId, entry);
  }

  let recordedCount = 0;
  for (const [conversationId, conversationMessages] of messagesByConversation.entries()) {
    const latestInboundMessage = conversationMessages
      .filter((message) => normalizeText(message?.direction).toLowerCase() !== 'outbound')
      .sort((left, right) => compareIsoDesc(left?.sentAt, right?.sentAt))[0];
    if (!latestInboundMessage?.sentAt) continue;

    const actionResults = await ccoHistoryStore.searchHistoryRecords({
      tenantId,
      conversationId,
      sinceIso: null,
      untilIso: null,
      limit: 100,
      includeMessages: false,
      includeOutcomes: false,
      includeActions: true,
      resultTypes: ['action'],
    });
    const actions = asArray(actionResults).filter((item) => item?.resultType === 'action');
    const latestWaitingAction = actions
      .filter((item) => ['reply_sent', 'reply_later'].includes(normalizeHistoryActionType(item?.actionType)))
      .sort((left, right) => compareIsoDesc(left?.recordedAt, right?.recordedAt))[0];
    if (!latestWaitingAction?.recordedAt) continue;
    if (Date.parse(latestInboundMessage.sentAt) < Date.parse(latestWaitingAction.recordedAt)) continue;

    const existingCustomerReply = actions.find(
      (item) =>
        normalizeHistoryActionType(item?.actionType) === 'customer_replied' &&
        normalizeText(item?.recordedAt) === normalizeText(latestInboundMessage.sentAt)
    );
    if (existingCustomerReply) continue;

    await ccoHistoryStore.recordAction({
      tenantId,
      conversationId,
      mailboxId:
        toMailboxAddress(
          latestInboundMessage?.mailboxId ||
            latestInboundMessage?.mailboxAddress ||
            latestInboundMessage?.userPrincipalName
        ) || null,
      customerEmail: toMailboxAddress(
        latestInboundMessage?.customerEmail ||
          latestInboundMessage?.counterpartyEmail ||
          latestInboundMessage?.senderEmail
      ) || null,
      actionType: 'customer_replied',
      actionLabel: 'Kunden svarade',
      subject: normalizeText(latestInboundMessage?.subject) || null,
      recordedAt: latestInboundMessage.sentAt,
      source: 'cco_history_runtime',
      waitingOn: 'owner',
      nextActionLabel: 'Återuppta tråden',
      nextActionSummary: 'Kunden har svarat och tråden bör öppnas igen.',
      intent: normalizeText(latestWaitingAction?.intent || latestInboundMessage?.intent) || null,
    });
    recordedCount += 1;
  }

  return recordedCount;
}

function toCcoRuntimeHistoryHandler({
  graphReadConnector,
  graphReadEnabled = false,
  ccoHistoryStore = null,
  ccoMailboxTruthStore = null,
}) {
  return async (req, res) => {
    try {
      const parsedQuery = toCcoRuntimeHistoryQuery(req.query);
      if (parsedQuery.ok !== true) {
        return res.status(parsedQuery.status || 400).json({
          ok: false,
          error: parsedQuery.error || 'Historikfrågan kunde inte tolkas.',
        });
      }

      const {
        mailboxId,
        mailboxIds,
        customerEmail,
        conversationId,
        includeBodyHtml,
        lookbackDays,
      } = parsedQuery;
      const tenantId = toTenantId(req);
      const { startIso, endIso } = resolveCcoRuntimeWindowBounds({ lookbackDays });
      const mailboxTruthHistory = createCcoMailboxTruthReadAdapter({
        store: ccoMailboxTruthStore,
      });

      if (mailboxTruthHistory) {
        let messages = mailboxTruthHistory.listHistoryMessages({
          mailboxIds,
          sinceIso: startIso,
          untilIso: endIso,
          customerEmail,
          conversationId,
          includeBodyHtml,
        });
        messages = await enrichMessagesWithMailAssets({
          messages,
          graphReadConnector,
          label: `CCO runtime history mail asset enrichment (${mailboxId})`,
        });
        if (includeBodyHtml) {
          messages = await enrichMessagesWithMailMime({
            messages,
            graphReadConnector,
            label: `CCO runtime history MIME enrichment (${mailboxId})`,
          });
        }
        messages = attachMailDocuments(messages, { sourceStore: 'mailbox_truth_store' });
        const hydratedThread = attachMailThreadHydration(messages, {
          sourceStore: 'mailbox_truth_store',
          conversationId,
          customerEmail,
        });
        messages = hydratedThread.messages;
        const events = mailboxTruthHistory.listHistoryEvents({
          mailboxIds,
          sinceIso: startIso,
          untilIso: endIso,
          customerEmail,
          conversationId,
        });
        const historyCoverage = mailboxTruthHistory.getHistoryCoverage({ mailboxIds });
        return res.json({
          ok: true,
          mailboxId,
          mailboxIds,
          customerEmail: customerEmail || null,
          conversationId: conversationId || null,
          includeBodyHtml,
          lookbackDays,
          source: 'mailbox_truth_store',
          window: {
            startIso,
            endIso,
          },
          windowCount: mailboxIds.length,
          backfilledWindowCount: 0,
          summary: summarizeHistoryMessages(messages),
          messages,
          threadDocument: hydratedThread.threadDocument,
          events,
          store: {
            source: 'mailbox_truth_store',
            mailbox: historyCoverage.mailboxes[0]?.mailbox || null,
            mailboxes: historyCoverage.mailboxes.map((entry) => ({
              mailboxId: entry.mailboxId,
              mailbox: entry.mailbox,
              missingWindowCount: entry.coverage?.missingWindowCount || 0,
              missingWindowsPreview: entry.coverage?.missingWindowsPreview || [],
              backfilledWindowCount: 0,
              complete: entry.coverage?.complete === true,
            })),
            missingWindowCount: historyCoverage.coverage?.missingWindowCount || 0,
            mailboxCount: historyCoverage.mailboxes.length,
          },
        });
      }

      if (ccoHistoryStore && typeof ccoHistoryStore.listMailboxMessages === 'function') {
        const coverages = await ensureCcoRuntimeHistoryCoverageForMailboxIds({
          tenantId,
          mailboxIds,
          lookbackDays,
          graphReadConnector,
          graphReadEnabled,
          ccoHistoryStore,
        });
        const missingCoverages = coverages.filter(
          (coverage) => Array.isArray(coverage?.missingWindows) && coverage.missingWindows.length > 0
        );

        if (missingCoverages.length > 0 && graphReadEnabled !== true) {
          return res.status(503).json({
            ok: false,
            error: 'Historik finns inte lokalt ännu och Graph-läsning är inte tillgänglig.',
          });
        }

        let messages = filterHistoryMessages(
          await collectStoredMailboxHistoryMessages({
            tenantId,
            mailboxIds,
            ccoHistoryStore,
            sinceIso: startIso,
            untilIso: endIso,
          }),
          {
            conversationId,
            customerEmail,
          }
        );
        messages = await enrichMessagesWithMailAssets({
          messages,
          graphReadConnector,
          label: `CCO runtime history mail asset enrichment (${mailboxId})`,
        });
        if (includeBodyHtml) {
          messages = await enrichMessagesWithMailMime({
            messages,
            graphReadConnector,
            label: `CCO runtime history MIME enrichment (${mailboxId})`,
          });
        }
        const messagesWithDocuments = attachMailDocuments(messages, {
          sourceStore: 'cco_history_store',
        });
        const hydratedThread = attachMailThreadHydration(messagesWithDocuments, {
          sourceStore: 'cco_history_store',
          conversationId,
          customerEmail,
        });
        const hydratedMessages = hydratedThread.messages;
        await materializeCustomerReplyActions({
          tenantId,
          messages: hydratedMessages,
          ccoHistoryStore,
        });
        const events =
          typeof ccoHistoryStore.searchHistoryRecords === 'function'
            ? await ccoHistoryStore.searchHistoryRecords({
                tenantId,
                mailboxIds,
                customerEmail,
                conversationId,
                sinceIso: startIso,
                untilIso: endIso,
                limit: 250,
                includeMessages: true,
                includeOutcomes: true,
                includeActions: true,
                resultTypes: ['message', 'outcome', 'action'],
              })
            : [];
        const summary = summarizeHistoryMessages(hydratedMessages);
        const missingWindowCount = missingCoverages.reduce(
          (sum, coverage) => sum + Number(coverage?.missingWindows?.length || 0),
          0
        );
        const mailboxSummaries = coverages
          .map((coverage, index) => ({
            mailboxId: mailboxIds[index] || null,
            mailbox: coverage?.mailbox || null,
            missingWindowCount: Array.isArray(coverage?.missingWindows)
              ? coverage.missingWindows.length
              : 0,
            missingWindowsPreview: asArray(coverage?.missingWindows).slice(0, 6),
            backfilledWindowCount: Number(coverage?.backfilledWindowCount || 0),
            complete: Array.isArray(coverage?.missingWindows)
              ? coverage.missingWindows.length === 0
              : false,
          }))
          .filter((item) => item.mailboxId);
        const totalWindowCount = mailboxSummaries.reduce(
          (sum, item) => sum + Number(item?.mailbox?.coverageWindowCount || 0),
          0
        );
        const totalBackfilledWindowCount = mailboxSummaries.reduce(
          (sum, item) => sum + Number(item?.backfilledWindowCount || 0),
          0
        );

        return res.json({
          ok: true,
          mailboxId,
          mailboxIds,
          customerEmail: customerEmail || null,
          conversationId: conversationId || null,
          lookbackDays,
          window: {
            startIso,
            endIso,
          },
          windowCount: totalWindowCount,
          backfilledWindowCount: totalBackfilledWindowCount,
          summary,
          messages: hydratedMessages,
          threadDocument: hydratedThread.threadDocument,
          events,
          store: {
            source: 'cco_history_store',
            mailbox: mailboxSummaries[0]?.mailbox || null,
            mailboxes: mailboxSummaries,
            missingWindowCount,
            mailboxCount: mailboxSummaries.length,
          },
        });
      }

      if (
        graphReadEnabled !== true ||
        !graphReadConnector ||
        typeof graphReadConnector.fetchInboxSnapshot !== 'function'
      ) {
        return res.status(503).json({
          ok: false,
          error: 'Graph-läsning är inte tillgänglig för historik just nu.',
        });
      }

      const result = await readHistoryMessagesFromGraph({
        graphReadConnector,
        mailboxId,
        mailboxIds,
        customerEmail,
        conversationId,
        lookbackDays,
      });
      const enrichedGraphMessages = await enrichMessagesWithMailAssets({
        messages: result.messages,
        graphReadConnector,
        label: `CCO runtime history mail asset enrichment (${mailboxId})`,
      });
      const mimeEnrichedGraphMessages = includeBodyHtml
        ? await enrichMessagesWithMailMime({
            messages: enrichedGraphMessages,
            graphReadConnector,
            label: `CCO runtime history MIME enrichment (${mailboxId})`,
          })
        : enrichedGraphMessages;
      const graphMessages = attachMailDocuments(mimeEnrichedGraphMessages, {
        sourceStore: 'graph_runtime_fallback',
      });
      const hydratedThread = attachMailThreadHydration(graphMessages, {
        sourceStore: 'graph_runtime_fallback',
        conversationId,
        customerEmail,
      });
      const hydratedMessages = hydratedThread.messages;

      return res.json({
        ok: true,
        mailboxId,
        mailboxIds: [mailboxId],
        customerEmail: customerEmail || null,
        conversationId: conversationId || null,
        lookbackDays,
        window: {
          startIso,
          endIso,
        },
        windowCount: result.windowCount,
        summary: summarizeHistoryMessages(hydratedMessages),
        messages: hydratedMessages,
        threadDocument: hydratedThread.threadDocument,
        events: [],
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Historik kunde inte läsas.',
      });
    }
  };
}

function toCcoRuntimeMailAssetContentHandler({
  graphReadConnector,
  graphReadEnabled = false,
}) {
  return async (req, res) => {
    try {
      const query = toCcoRuntimeMailAssetQuery(req.query);
      if (!query.ok) {
        return res.status(400).json({
          ok: false,
          error: 'mailboxId, messageId och attachmentId krävs för bilageåtkomst.',
        });
      }

      if (
        graphReadEnabled !== true ||
        !graphReadConnector ||
        typeof graphReadConnector.fetchMessageAttachmentContent !== 'function'
      ) {
        return res.status(503).json({
          ok: false,
          error: 'Bilageåtkomst är inte tillgänglig just nu.',
        });
      }

      const asset = await graphReadConnector.fetchMessageAttachmentContent({
        userId: query.mailboxId,
        messageId: query.messageId,
        attachmentId: query.attachmentId,
        label: `CCO runtime mail asset content (${query.mailboxId})`,
      });

      const buffer = Buffer.isBuffer(asset?.buffer)
        ? asset.buffer
        : Buffer.from(asset?.buffer || []);
      if (!buffer.length) {
        return res.status(404).json({
          ok: false,
          error: 'Bilagan kunde inte hämtas.',
        });
      }

      const contentType = normalizeText(asset?.contentType) || 'application/octet-stream';
      const fileName = sanitizeAttachmentFilename(asset?.name || query.fileName, 'bilaga');
      res.setHeader('content-type', contentType);
      res.setHeader(
        'content-disposition',
        buildContentDispositionHeader(fileName, { inline: query.mode === 'open' })
      );
      res.setHeader('content-length', String(buffer.length));
      res.setHeader('cache-control', 'private, max-age=300');
      res.setHeader('x-content-type-options', 'nosniff');
      return res.status(200).send(buffer);
    } catch (error) {
      return res.status(Number(error?.status || 500) || 500).json({
        ok: false,
        error: error?.message || 'Bilagan kunde inte hämtas.',
      });
    }
  };
}

function toCcoRuntimeHistoryBackfillHandler({
  graphReadConnector,
  graphReadEnabled = false,
  ccoHistoryStore = null,
  ccoMailboxTruthStore = null,
}) {
  return async (req, res) => {
    try {
      if (ccoMailboxTruthStore && typeof ccoMailboxTruthStore.getCompletenessReport === 'function') {
        if (
          graphReadEnabled !== true ||
          !graphReadConnector ||
          typeof graphReadConnector.fetchMailboxTruthFolderPage !== 'function'
        ) {
          return res.status(503).json({
            ok: false,
            error: 'Graph-läsning är inte tillgänglig för mailbox truth-backfill just nu.',
          });
        }

        const input = toCcoRuntimeHistoryBackfillInput({
          ...(asObject(req.body)),
          ...(asObject(req.query)),
        });
        const mailboxTruthHistory = createCcoMailboxTruthReadAdapter({
          store: ccoMailboxTruthStore,
        });
        const currentCoverage = mailboxTruthHistory.getHistoryCoverage({
          mailboxIds: input.mailboxIds,
        });
        if (input.refresh !== true && currentCoverage?.coverage?.complete === true) {
          return res.json({
            ok: true,
            mailboxId: input.mailboxId,
            mailboxIds: input.mailboxIds,
            lookbackDays: input.lookbackDays,
            refresh: input.refresh,
            source: 'mailbox_truth_store',
            backfilledWindowCount: 0,
            backfilledFolderCount: 0,
            missingWindowCount: 0,
            mailbox: currentCoverage.mailboxes[0]?.mailbox || null,
            mailboxes: currentCoverage.mailboxes,
          });
        }

        const backfill = createMicrosoftGraphMailboxTruthBackfill({
          connectorFactory: () => graphReadConnector,
          store: ccoMailboxTruthStore,
        });
        const result = await backfill.runBackfill({
          mailboxIds: input.mailboxIds,
          folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
          resume: input.refresh !== true,
        });
        const nextCoverage = mailboxTruthHistory.getHistoryCoverage({
          mailboxIds: input.mailboxIds,
        });
        const backfilledFolderCount = asArray(result?.perMailbox).reduce(
          (sum, mailbox) => sum + asArray(mailbox?.folderReports).length,
          0
        );
        return res.json({
          ok: true,
          mailboxId: input.mailboxId,
          mailboxIds: input.mailboxIds,
          lookbackDays: input.lookbackDays,
          refresh: input.refresh,
          source: 'mailbox_truth_store',
          backfilledWindowCount: backfilledFolderCount,
          backfilledFolderCount,
          missingWindowCount: nextCoverage?.coverage?.missingWindowCount || 0,
          mailbox: nextCoverage?.mailboxes?.[0]?.mailbox || null,
          mailboxes: nextCoverage?.mailboxes || [],
        });
      }

      if (
        !ccoHistoryStore ||
        typeof ccoHistoryStore.getMailboxSummary !== 'function' ||
        typeof ccoHistoryStore.upsertMailboxWindow !== 'function'
      ) {
        return res.status(503).json({
          ok: false,
          error: 'Persistent historikstore är inte tillgänglig just nu.',
        });
      }
      if (
        graphReadEnabled !== true ||
        !graphReadConnector ||
        typeof graphReadConnector.fetchInboxSnapshot !== 'function'
      ) {
        return res.status(503).json({
          ok: false,
          error: 'Graph-läsning är inte tillgänglig för backfill just nu.',
        });
      }

      const input = toCcoRuntimeHistoryBackfillInput({
        ...(asObject(req.body)),
        ...(asObject(req.query)),
      });
      const tenantId = toTenantId(req);
      const coverages = await ensureCcoRuntimeHistoryCoverageForMailboxIds({
        tenantId,
        mailboxIds: input.mailboxIds,
        lookbackDays: input.lookbackDays,
        graphReadConnector,
        graphReadEnabled,
        ccoHistoryStore,
        refresh: input.refresh,
      });
      const { startIso, endIso } = toHistoryWindowBounds(input.lookbackDays);
      await materializeCustomerReplyActions({
        tenantId,
        messages: await collectStoredMailboxHistoryMessages({
          tenantId,
          mailboxIds: input.mailboxIds,
          ccoHistoryStore,
          sinceIso: startIso,
          untilIso: endIso,
        }),
        ccoHistoryStore,
      });
      const mailboxSummaries = coverages
        .map((coverage, index) => ({
          mailboxId: input.mailboxIds[index] || null,
          mailbox: coverage?.mailbox || null,
          missingWindowCount: Array.isArray(coverage?.missingWindows)
            ? coverage.missingWindows.length
            : 0,
          backfilledWindowCount: Number(coverage?.backfilledWindowCount || 0),
        }))
        .filter((item) => item.mailboxId);
      const missingWindowCount = mailboxSummaries.reduce(
        (sum, item) => sum + Number(item?.missingWindowCount || 0),
        0
      );
      const backfilledWindowCount = mailboxSummaries.reduce(
        (sum, item) => sum + Number(item?.backfilledWindowCount || 0),
        0
      );

      return res.json({
        ok: true,
        mailboxId: input.mailboxId,
        mailboxIds: input.mailboxIds,
        lookbackDays: input.lookbackDays,
        refresh: input.refresh,
        backfilledWindowCount,
        missingWindowCount,
        mailbox: mailboxSummaries[0]?.mailbox || null,
        mailboxes: mailboxSummaries,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Kunde inte backfilla historik.',
      });
    }
  };
}

function toCapabilityRunError(res, error) {
  const status = pickErrorStatus(error?.code);
  return res.status(status).json(toErrorPayload(error));
}

function toCapabilityRunBlocked(res, result = {}) {
  return res.status(403).json(toGatewayBlockedResponse(result.gatewayResult || {}));
}

function toCapabilityRunSuccess(res, result = {}) {
  return res.json(toSuccessPayload(result));
}

function toRoleGuardedHandler(handler) {
  return async (req, res) => {
    if (!ensureRoleContext(req, res)) return;
    return handler(req, res);
  };
}

async function runCapabilityHandler({
  req,
  res,
  executor,
  capabilityName,
  templateStore,
  graphReadConnector,
  capabilityAnalysisStore,
  ccoHistoryStore,
  authStore,
}) {
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const rawPayload = asObject(req.body);
  const payload = await maybeHydrateCapabilityPayload({
    capabilityName,
    tenantId: toTenantId(req),
    templateStore,
    input: toRunInputBody(rawPayload),
    systemStateSnapshot: rawPayload.systemStateSnapshot,
    graphReadConnector,
    capabilityAnalysisStore,
    ccoHistoryStore,
    authStore,
    actorUserId: actor.id,
    correlationId,
  });
  if (isDebugRequested(req)) {
    payload.input = {
      ...asObject(payload.input),
      debug: true,
    };
  }

  const result = await executor.runCapability({
    tenantId: toTenantId(req),
    actor,
    channel: toChannel(req),
    capabilityName,
    input: payload.input,
    systemStateSnapshot: payload.systemStateSnapshot,
    correlationId,
    idempotencyKey: toIdempotencyKey(req),
    requestMetadata: toRequestMetadata(req),
  });

  if (isBlockedDecision(result.gatewayResult || {})) {
    return toCapabilityRunBlocked(res, result);
  }
  await maybeWriteCcoLifecycleAuditEvents({
    authStore,
    tenantId: toTenantId(req),
    actorUserId: actor.id,
    correlationId,
    result,
  });
  return toCapabilityRunSuccess(res, result);
}

async function runAgentHandler({
  req,
  res,
  executor,
  agentName,
  templateStore,
  graphReadConnector,
  capabilityAnalysisStore,
  ccoHistoryStore,
  authStore,
}) {
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const rawPayload = asObject(req.body);
  const payload = await maybeHydrateAgentPayload({
    agentName,
    tenantId: toTenantId(req),
    templateStore,
    input: toRunInputBody(rawPayload),
    systemStateSnapshot: rawPayload.systemStateSnapshot,
    graphReadConnector,
    capabilityAnalysisStore,
    ccoHistoryStore,
    authStore,
    actorUserId: actor.id,
    correlationId,
  });
  if (isDebugRequested(req)) {
    payload.input = {
      ...asObject(payload.input),
      debug: true,
    };
  }

  const result = await executor.runAgent({
    tenantId: toTenantId(req),
    actor,
    channel: toChannel(req),
    agentName,
    input: payload.input,
    systemStateSnapshot: payload.systemStateSnapshot,
    correlationId,
    idempotencyKey: toIdempotencyKey(req),
    requestMetadata: toRequestMetadata(req),
  });

  if (isBlockedDecision(result.gatewayResult || {})) {
    return toCapabilityRunBlocked(res, result);
  }
  await maybeWriteCcoLifecycleAuditEvents({
    authStore,
    tenantId: toTenantId(req),
    actorUserId: actor.id,
    correlationId,
    result,
  });
  return toCapabilityRunSuccess(res, result);
}

async function runCcoSendHandler({
  req,
  res,
  executor,
  graphSendConnector,
  graphSendEnabled,
  graphSendAllowlist,
}) {
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const rawPayload = asObject(req.body);
  const input = asObject(rawPayload.input && typeof rawPayload.input === 'object'
    ? rawPayload.input
    : rawPayload);

  const result = await executor.runCcoSend({
    tenantId: toTenantId(req),
    actor,
    channel: toChannel(req),
    input,
    correlationId,
    idempotencyKey: toIdempotencyKey(req),
    requestMetadata: toRequestMetadata(req),
    graphSendConnector,
    graphSendEnabled,
    graphSendAllowlist,
  });

  const gatewayResult = result.gatewayResult || {};
  if (
    isBlockedDecision(gatewayResult) &&
    normalizeText(gatewayResult.error_stage) === 'persist'
  ) {
    const statusCode =
      Number.isFinite(Number(gatewayResult.error_status)) && Number(gatewayResult.error_status) >= 400
        ? Number(gatewayResult.error_status)
        : 503;
    return res.status(statusCode).json({
      error:
        normalizeText(gatewayResult.error_message) ||
        'Microsoft Graph-send misslyckades. Försök igen om en stund.',
      code: normalizeText(gatewayResult.error_code) || 'CCO_SEND_TRANSPORT_ERROR',
      ccoSendRunId: normalizeText(result.ccoSendRunId) || null,
      decision: gatewayResult.decision || 'blocked',
      retryAfterSeconds:
        Number.isFinite(Number(gatewayResult.retry_after_seconds)) &&
        Number(gatewayResult.retry_after_seconds) >= 0
          ? Number(gatewayResult.retry_after_seconds)
          : null,
    });
  }

  if (isBlockedDecision(gatewayResult)) {
    return toCapabilityRunBlocked(res, result);
  }
  return toCapabilityRunSuccess(res, result);
}

async function runCcoDeleteHandler({
  req,
  res,
  graphSendConnector,
  graphDeleteEnabled,
  graphDeleteAllowlist,
  authStore,
}) {
  const actor = toActor(req);
  const tenantId = toTenantId(req);
  const correlationId = toCorrelationId(req);
  const payload = asObject(req.body);
  const input = asObject(
    payload.input && typeof payload.input === 'object' ? payload.input : payload
  );
  const mailboxId = toMailboxAddress(input.mailboxId);
  const messageId = normalizeText(input.messageId);
  const conversationId = normalizeText(input.conversationId);
  const softDelete = toBoolean(input.softDelete, true);
  if (!mailboxId || !messageId || !conversationId) {
    return res.status(422).json({
      error: 'mailboxId, messageId och conversationId krävs.',
      code: 'CCO_DELETE_INPUT_INVALID',
    });
  }
  if (!graphDeleteEnabled) {
    return res.status(503).json({
      error: 'Radera mail är inte aktiverat i denna miljö.',
      code: 'CCO_DELETE_NOT_ENABLED',
    });
  }
  if (!graphSendConnector || typeof graphSendConnector.moveMessageToDeletedItems !== 'function') {
    return res.status(503).json({
      error: 'Microsoft Graph delete-connector saknas.',
      code: 'CCO_DELETE_CONNECTOR_UNAVAILABLE',
    });
  }
  const allowlist = toMailboxAllowlistSet(graphDeleteAllowlist);
  if (!allowlist.size) {
    return res.status(503).json({
      error: 'CCO delete-allowlist är tom.',
      code: 'CCO_DELETE_ALLOWLIST_EMPTY',
    });
  }
  const mailboxLower = mailboxId.toLowerCase();
  if (!allowlist.has('*') && !allowlist.has(mailboxLower)) {
    return res.status(403).json({
      error: `Mailbox är inte allowlistad för delete: ${mailboxId}.`,
      code: 'CCO_DELETE_ALLOWLIST_BLOCKED',
    });
  }

  if (authStore && typeof authStore.addAuditEvent === 'function') {
    await authStore.addAuditEvent({
      tenantId,
      actorUserId: actor.id,
      action: 'cco.delete.requested',
      outcome: 'success',
      targetType: 'cco_conversation',
      targetId: conversationId,
      metadata: {
        correlationId,
        mailboxId,
        messageId,
        conversationId,
        softDelete,
      },
    });
  }

  try {
    const deleteResult = await graphSendConnector.moveMessageToDeletedItems({
      mailboxId,
      messageId,
    });
    if (authStore && typeof authStore.addAuditEvent === 'function') {
      await authStore.addAuditEvent({
        tenantId,
        actorUserId: actor.id,
        action: 'cco.delete.completed',
        outcome: 'success',
        targetType: 'cco_conversation',
        targetId: conversationId,
        metadata: {
          correlationId,
          mailboxId,
          messageId,
          conversationId,
          softDelete,
          movedMessageId: normalizeText(deleteResult?.movedMessageId) || null,
          destinationFolderId: normalizeText(deleteResult?.destinationFolderId) || 'deleteditems',
        },
      });
    }
    return res.json({
      ok: true,
      mode: 'soft_delete',
      softDelete,
      mailboxId,
      messageId,
      conversationId,
      deleteResult: {
        provider: normalizeText(deleteResult?.provider) || 'microsoft_graph',
        movedMessageId: normalizeText(deleteResult?.movedMessageId) || messageId,
        destinationFolderId: normalizeText(deleteResult?.destinationFolderId) || 'deleteditems',
        deletedAt: normalizeText(deleteResult?.deletedAt) || new Date().toISOString(),
      },
    });
  } catch (error) {
    if (authStore && typeof authStore.addAuditEvent === 'function') {
      await authStore.addAuditEvent({
        tenantId,
        actorUserId: actor.id,
        action: 'cco.delete.completed',
        outcome: 'error',
        targetType: 'cco_conversation',
        targetId: conversationId,
        metadata: {
          correlationId,
          mailboxId,
          messageId,
          conversationId,
          softDelete,
          graphCode: normalizeText(error?.code) || null,
          graphStatus: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
          retryAfterSeconds:
            Number.isFinite(Number(error?.retryAfterSeconds)) &&
            Number(error.retryAfterSeconds) >= 0
              ? Number(error.retryAfterSeconds)
              : null,
          error: normalizeText(error?.message) || 'graph_delete_failed',
        },
      });
    }
    const wrappedError = new Error(error?.message || 'Microsoft Graph delete misslyckades.');
    wrappedError.code = 'CCO_DELETE_GRAPH_ERROR';
    throw wrappedError;
  }
}

async function runCcoDeleteStatusHandler({
  req,
  res,
  graphSendConnector,
  graphDeleteEnabled,
  graphDeleteAllowlist,
}) {
  const allowlist = toMailboxAllowlistSet(graphDeleteAllowlist);
  const hasConnector =
    !!graphSendConnector && typeof graphSendConnector.moveMessageToDeletedItems === 'function';
  let deleteEnabled = true;
  let reasonCode = '';
  let reason = '';
  let permissionSummary = null;

  if (!graphDeleteEnabled) {
    deleteEnabled = false;
    reasonCode = 'CCO_DELETE_NOT_ENABLED';
    reason = 'Radera mail är inte aktiverat i denna miljö.';
  } else if (!hasConnector) {
    deleteEnabled = false;
    reasonCode = 'CCO_DELETE_CONNECTOR_UNAVAILABLE';
    reason = 'Microsoft Graph delete-connector saknas.';
  } else if (!allowlist.size) {
    deleteEnabled = false;
    reasonCode = 'CCO_DELETE_ALLOWLIST_EMPTY';
    reason = 'CCO delete-allowlist är tom.';
  } else if (typeof graphSendConnector?.inspectPermissions === 'function') {
    try {
      permissionSummary = await graphSendConnector.inspectPermissions();
      if (permissionSummary?.hasMailReadWrite !== true) {
        deleteEnabled = false;
        reasonCode = 'CCO_DELETE_GRAPH_PERMISSION_MISSING';
        reason = 'Microsoft Graph app saknar Mail.ReadWrite för delete/move.';
      }
    } catch (error) {
      deleteEnabled = false;
      reasonCode = 'CCO_DELETE_PERMISSION_CHECK_FAILED';
      reason = normalizeText(error?.message) || 'Kunde inte verifiera Graph delete-behörighet.';
    }
  }

  return res.json({
    ok: true,
    deleteEnabled,
    reasonCode: reasonCode || null,
    reason: reason || null,
    allowlist: Array.from(allowlist),
    connectorReady: hasConnector,
    permissions: permissionSummary,
  });
}

async function readAnalysisHandler({ req, res, capabilityAnalysisStore }) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') {
    return toAnalysisUnavailable(res);
  }
  const query = toAnalysisQuery(req);
  const resolvedCapabilityName = resolveAnalysisCapabilityName(query);
  const entries = await capabilityAnalysisStore.list({
    tenantId: toTenantId(req),
    capabilityName: resolvedCapabilityName,
    limit: query.limit,
  });
  return res.json(toAnalysisPayload(entries, resolvedCapabilityName, query.agentName));
}

async function readWritingIdentitiesHandler({ req, res, capabilityAnalysisStore }) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') {
    return res.status(503).json({ error: 'Capability analysis store är inte konfigurerad.' });
  }
  const tenantId = toTenantId(req);
  const queryMailbox = toMailboxAddress(req.query?.mailbox);
  const records = await listWritingIdentityProfiles({
    analysisStore: capabilityAnalysisStore,
    tenantId,
    limit: 500,
  });
  const filtered = queryMailbox
    ? records.filter((record) => toMailboxAddress(record?.mailbox) === queryMailbox)
    : records;
  return res.json({
    count: filtered.length,
    profiles: filtered.map((record) => ({
      mailbox: toMailboxAddress(record?.mailbox),
      version: Number(record?.version || 1),
      profile: toWritingProfile(record?.profile || {}),
      source: normalizeText(record?.source) || 'auto',
      createdAt: toIso(record?.createdAt) || null,
      updatedAt: toIso(record?.updatedAt) || null,
    })),
    generatedAt: new Date().toISOString(),
  });
}

async function saveWritingIdentityProfileHandler({
  req,
  res,
  capabilityAnalysisStore,
  authStore,
}) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
    return res.status(503).json({ error: 'Capability analysis store är inte konfigurerad.' });
  }
  const tenantId = toTenantId(req);
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const mailbox =
    toMailboxAddress(req.params?.mailbox) ||
    toMailboxAddress(req.body?.mailbox) ||
    toMailboxAddress(req.body?.input?.mailbox);
  if (!mailbox) {
    return res.status(422).json({ error: 'mailbox måste vara en giltig email/UPN.' });
  }
  const sourceProfile = asObject(
    req.body?.profile && typeof req.body.profile === 'object'
      ? req.body.profile
      : req.body?.input?.profile && typeof req.body.input.profile === 'object'
      ? req.body.input.profile
      : req.body
  );
  const profile = toWritingProfile(sourceProfile);
  const record = await upsertWritingIdentityProfile({
    analysisStore: capabilityAnalysisStore,
    authStore,
    tenantId,
    actorUserId: actor.id,
    mailboxAddress: mailbox,
    profile,
    source: 'manual',
    correlationId,
  });
  return res.json({
    ok: true,
    mailbox,
    profile: {
      mailbox: record.mailbox,
      version: record.version,
      profile: record.profile,
      source: record.source,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
  });
}

async function autoExtractWritingIdentityProfilesHandler({
  req,
  res,
  capabilityAnalysisStore,
  authStore,
}) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') {
    return res.status(503).json({ error: 'Capability analysis store är inte konfigurerad.' });
  }
  const tenantId = toTenantId(req);
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const payload = asObject(req.body);
  const input = asObject(
    payload.input && typeof payload.input === 'object' ? payload.input : payload
  );
  const sampleSize = clampInteger(input.sampleSize, 30, 50, 40);
  const mailboxes = parseMailboxList(input.mailboxes);
  const result = await extractAndPersistWritingIdentityProfiles({
    analysisStore: capabilityAnalysisStore,
    authStore,
    tenantId,
    mailboxes,
    actorUserId: actor.id,
    correlationId,
    sampleSize,
  });
  return res.json({
    ok: true,
    sampleSize: result.sampleSize,
    requestedMailboxes: result.requestedMailboxes,
    updatedProfiles: result.updatedProfiles.map((item) => ({
      mailbox: item.mailbox,
      sampleCount: item.sampleCount,
      version: Number(item?.record?.version || 1),
      source: normalizeText(item?.record?.source) || 'auto',
      profile: toWritingProfile(item?.profile || {}),
      updatedAt: toIso(item?.record?.updatedAt) || null,
    })),
    skipped: asArray(result.skipped),
    generatedAt: new Date().toISOString(),
  });
}

function toMetaHandler({ executor }) {
  return async (_req, res) => res.json(toMetaPayload(executor));
}

function toCapabilityRunHandler({
  executor,
  templateStore,
  graphReadConnector,
  capabilityAnalysisStore,
  ccoHistoryStore,
  authStore,
}) {
  return async (req, res) => {
    const capabilityName = toCapabilityName(req);
    if (!validateCapabilityName(capabilityName, res)) return;
    try {
      return await runCapabilityHandler({
        req,
        res,
        executor,
        capabilityName,
        templateStore,
        graphReadConnector,
        capabilityAnalysisStore,
        ccoHistoryStore,
        authStore,
      });
    } catch (error) {
      return toCapabilityRunError(res, error);
    }
  };
}

function toAgentRunHandler({
  executor,
  templateStore,
  graphReadConnector,
  capabilityAnalysisStore,
  ccoHistoryStore,
  authStore,
}) {
  return async (req, res) => {
    const agentName = toAgentName(req);
    if (!validateAgentName(agentName, res)) return;
    try {
      return await runAgentHandler({
        req,
        res,
        executor,
        agentName,
        templateStore,
        graphReadConnector,
        capabilityAnalysisStore,
        ccoHistoryStore,
        authStore,
      });
    } catch (error) {
      return toCapabilityRunError(res, error);
    }
  };
}

function toAnalysisHandler({ capabilityAnalysisStore }) {
  return async (req, res) => {
    try {
      return await readAnalysisHandler({ req, res, capabilityAnalysisStore });
    } catch (error) {
      console.error(error);
      return toAnalysisError(res);
    }
  };
}

function toCcoSendHandler({
  executor,
  graphSendConnector,
  graphSendEnabled,
  graphSendAllowlist,
}) {
  return async (req, res) => {
    try {
      return await runCcoSendHandler({
        req,
        res,
        executor,
        graphSendConnector,
        graphSendEnabled,
        graphSendAllowlist,
      });
    } catch (error) {
      return toCapabilityRunError(res, error);
    }
  };
}

function toCcoDeleteHandler({
  graphSendConnector,
  graphDeleteEnabled,
  graphDeleteAllowlist,
  authStore,
}) {
  return async (req, res) => {
    try {
      return await runCcoDeleteHandler({
        req,
        res,
        graphSendConnector,
        graphDeleteEnabled,
        graphDeleteAllowlist,
        authStore,
      });
    } catch (error) {
      return res.status(pickErrorStatus(error?.code)).json({
        error: error?.message || 'Kunde inte radera mail.',
        code: error?.code || 'CCO_DELETE_FAILED',
      });
    }
  };
}

function toCcoDeleteStatusHandler({
  graphSendConnector,
  graphDeleteEnabled,
  graphDeleteAllowlist,
}) {
  return async (req, res) => {
    try {
      return await runCcoDeleteStatusHandler({
        req,
        res,
        graphSendConnector,
        graphDeleteEnabled,
        graphDeleteAllowlist,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte läsa delete-status.',
        code: error?.code || 'CCO_DELETE_STATUS_FAILED',
      });
    }
  };
}

function toCcoSprintEventHandler({ authStore }) {
  return async (req, res) => {
    try {
      return await runCcoSprintEventHandler({ req, res, authStore });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte logga sprint-event.',
        code: error?.code || 'CCO_SPRINT_EVENT_FAILED',
      });
    }
  };
}

function toCcoUsageEventHandler({ authStore, ccoHistoryStore = null }) {
  return async (req, res) => {
    try {
      return await runCcoUsageEventHandler({ req, res, authStore, ccoHistoryStore });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte logga usage-event.',
        code: error?.code || 'CCO_USAGE_EVENT_FAILED',
      });
    }
  };
}

function toCcoMetricsHandler({ authStore, capabilityAnalysisStore }) {
  return async (req, res) => {
    try {
      return await readCcoMetricsHandler({ req, res, authStore, capabilityAnalysisStore });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte läsa CCO metrics.',
        code: error?.code || 'CCO_METRICS_READ_FAILED',
      });
    }
  };
}

function toWritingIdentitiesReadHandler({ capabilityAnalysisStore }) {
  return async (req, res) => {
    try {
      return await readWritingIdentitiesHandler({ req, res, capabilityAnalysisStore });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte läsa Writing Identity-profiler.',
        code: error?.code || 'CCO_WRITING_PROFILE_READ_FAILED',
      });
    }
  };
}

function toWritingIdentitySaveHandler({ capabilityAnalysisStore, authStore }) {
  return async (req, res) => {
    try {
      return await saveWritingIdentityProfileHandler({
        req,
        res,
        capabilityAnalysisStore,
        authStore,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte spara Writing Identity-profil.',
        code: error?.code || 'CCO_WRITING_PROFILE_SAVE_FAILED',
      });
    }
  };
}

function toWritingIdentityAutoExtractHandler({ capabilityAnalysisStore, authStore }) {
  return async (req, res) => {
    try {
      return await autoExtractWritingIdentityProfilesHandler({
        req,
        res,
        capabilityAnalysisStore,
        authStore,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte auto-extrahera Writing Identity-profiler.',
        code: error?.code || 'CCO_WRITING_PROFILE_AUTO_EXTRACT_FAILED',
      });
    }
  };
}

function toCcoRuntimeHistoryStatusHandler({
  ccoHistoryStore = null,
  ccoMailboxTruthStore = null,
  graphReadEnabled = false,
  scheduler = null,
}) {
  return async (req, res) => {
    try {
      const mailboxTruthHistory = createCcoMailboxTruthReadAdapter({
        store: ccoMailboxTruthStore,
      });
      if (mailboxTruthHistory) {
        const { mailboxId, mailboxIds, lookbackDays } = toCcoRuntimeHistoryStatusQuery(req.query);
        const historyCoverage = mailboxTruthHistory.getHistoryCoverage({ mailboxIds });
        const schedulerStatus =
          scheduler && typeof scheduler.getStatus === 'function'
            ? scheduler.getStatus()
            : null;
        return res.json({
          ok: true,
          mailboxId,
          mailboxIds,
          lookbackDays,
          graphReadEnabled: graphReadEnabled === true,
          source: 'mailbox_truth_store',
          mailbox: historyCoverage.mailboxes[0]?.mailbox || null,
          mailboxes: historyCoverage.mailboxes,
          coverage: historyCoverage.coverage,
          scheduler: schedulerStatus
            ? {
                enabled: schedulerStatus.enabled === true,
                started: schedulerStatus.started === true,
                job: null,
              }
            : null,
        });
      }

      if (
        !ccoHistoryStore ||
        typeof ccoHistoryStore.getMailboxSummary !== 'function' ||
        typeof ccoHistoryStore.getMissingMailboxWindows !== 'function'
      ) {
        return res.status(503).json({
          ok: false,
          error: 'Persistent historikstore är inte tillgänglig just nu.',
        });
      }

      const { mailboxId, mailboxIds, lookbackDays } = toCcoRuntimeHistoryStatusQuery(req.query);
      const tenantId = toTenantId(req);
      const { startIso, endIso } = toHistoryWindowBounds(lookbackDays);
      const mailboxes = normalizeMailboxIdList(mailboxIds, 50).map((currentMailboxId) => {
        const mailbox = ccoHistoryStore.getMailboxSummary({
          tenantId,
          mailboxId: currentMailboxId,
        });
        const missingWindows = trimRecentHistoryGap(
          ccoHistoryStore.getMissingMailboxWindows({
            tenantId,
            mailboxId: currentMailboxId,
            startIso,
            endIso,
          }),
          mailbox,
          endIso
        );
        return {
          mailboxId: currentMailboxId,
          mailbox,
          coverage: {
            startIso,
            endIso,
            missingWindowCount: missingWindows.length,
            missingWindowsPreview: missingWindows.slice(0, 6),
            complete: missingWindows.length === 0,
          },
        };
      });
      const missingWindowCount = mailboxes.reduce(
        (sum, entry) => sum + Number(entry?.coverage?.missingWindowCount || 0),
        0
      );
      const schedulerStatus =
        scheduler && typeof scheduler.getStatus === 'function'
          ? scheduler.getStatus()
          : null;
      const historyJob = Array.isArray(schedulerStatus?.jobs)
        ? schedulerStatus.jobs.find((job) => normalizeText(job?.id) === 'cco_history_sync') || null
        : null;

      return res.json({
        ok: true,
        mailboxId,
        mailboxIds,
        lookbackDays,
        graphReadEnabled: graphReadEnabled === true,
        mailbox: mailboxes[0]?.mailbox || null,
        mailboxes,
        coverage: {
          startIso,
          endIso,
          missingWindowCount,
          missingWindowsPreview: mailboxes.flatMap((entry) =>
            asArray(entry?.coverage?.missingWindowsPreview).map((window) => ({
              mailboxId: entry.mailboxId,
              startIso: window?.startIso || null,
              endIso: window?.endIso || null,
            }))
          ).slice(0, 6),
          complete: missingWindowCount === 0,
        },
        scheduler: schedulerStatus
          ? {
              enabled: schedulerStatus.enabled === true,
              started: schedulerStatus.started === true,
              job: historyJob
                ? {
                    id: historyJob.id,
                    name: historyJob.name,
                    enabled: historyJob.enabled === true,
                    running: historyJob.running === true,
                    lastRunAt: historyJob.lastRunAt || null,
                    lastSuccessAt: historyJob.lastSuccessAt || null,
                    lastStatus: historyJob.lastStatus || null,
                    lastError: historyJob.lastError || null,
                    nextRunAt: historyJob.nextRunAt || null,
                    lastResult: historyJob.lastResult || null,
                  }
                : null,
            }
          : null,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Historikstatus kunde inte läsas.',
      });
    }
  };
}

function toCcoRuntimeCalibrationSummaryHandler({
  ccoHistoryStore = null,
}) {
  return async (req, res) => {
    try {
      if (
        !ccoHistoryStore ||
        typeof ccoHistoryStore.summarizeOutcomeEvaluations !== 'function'
      ) {
        return res.status(503).json({
          ok: false,
          error: 'Kalibreringsstore är inte tillgänglig just nu.',
        });
      }

      const { mailboxId, mailboxIds, customerEmail, lookbackDays, intent, sinceIso, untilIso } =
        toCcoRuntimeCalibrationSummaryQuery(req.query);
      const tenantId = toTenantId(req);
      const { startIso, endIso } = resolveCcoRuntimeWindowBounds({
        lookbackDays,
        sinceIso,
        untilIso,
      });
      const summary = await ccoHistoryStore.summarizeOutcomeEvaluations({
        tenantId,
        customerEmail,
        mailboxIds,
        sinceIso: startIso,
        untilIso: endIso,
        intent,
      });

      return res.json({
        ok: true,
        mailboxId,
        mailboxIds,
        customerEmail,
        intent,
        lookbackDays,
        window: {
          startIso,
          endIso,
        },
        summary,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Kalibreringssummary kunde inte läsas.',
      });
    }
  };
}

function toHistorySearchResultLabelSv(result = {}) {
  if (result?.resultType === 'outcome') return 'Utfall';
  if (result?.resultType === 'action') return 'Åtgärd';
  return 'Mail';
}

function toHistoryActionLabelSv(actionType = '') {
  const normalized = normalizeHistoryActionType(actionType);
  if (normalized === 'reply_sent') return 'Svar skickat';
  if (normalized === 'reply_later') return 'Svara senare';
  if (normalized === 'customer_replied') return 'Kunden svarade';
  if (normalized === 'conversation_deleted') return 'Flyttad till papperskorg';
  return normalizeText(actionType) || 'Åtgärd';
}

function toHistoryOutcomeLabelSv(outcomeCode = '') {
  const normalized = normalizeHistoryOutcomeCode(outcomeCode);
  if (normalized === 'booked') return 'Bokad';
  if (normalized === 'rebooked') return 'Ombokad';
  if (normalized === 'replied') return 'Besvarat';
  if (normalized === 'not_interested') return 'Ej intresserad';
  if (normalized === 'escalated') return 'Eskalerad';
  if (normalized === 'no_response') return 'Ingen respons';
  if (normalized === 'closed_no_action') return 'Stängd utan åtgärd';
  return normalizeText(outcomeCode) || 'Utfall';
}

function formatReadoutDateTimeSv(value = '') {
  const iso = toIso(value);
  if (!iso) return '–';
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatCalibrationStatList(summary = [], formatter = (item) => item.label) {
  const items = asArray(summary).slice(0, 5);
  if (items.length === 0) {
    return '<li class="readout-empty">Ingen signal ännu.</li>';
  }
  return items
    .map(
      (item) => `<li><strong>${escapeHtml(formatter(item))}</strong><span>${escapeHtml(
        `${item.positiveCount || 0} positiva · ${item.negativeCount || 0} negativa · ${item.totalCount || 0} totalt`
      )}</span></li>`
    )
    .join('');
}

function formatCalibrationIntentBreakdown(summary = [], type = 'action') {
  const items = asArray(summary).slice(0, 6);
  if (items.length === 0) {
    return '<li class="readout-empty">Ingen intentsignal ännu.</li>';
  }
  return items
    .map((item) => {
      const bestLabel =
        normalizeText(item?.best?.label || item?.best?.key) || '–';
      const worstEntry = item?.worst || null;
      const worstLabel =
        worstEntry && type === 'mode'
          ? normalizeText(worstEntry?.label || worstEntry?.key) || '–'
          : worstEntry && worstEntry?.key === 'no_response'
            ? toHistoryOutcomeLabelSv(worstEntry?.key)
            : normalizeText(worstEntry?.label || worstEntry?.key) || '–';
      return `<li><strong>${escapeHtml(normalizeText(item?.label) || 'Okänd intent')}</strong><span>${escapeHtml(
        `Bäst: ${bestLabel} · Svagast: ${worstLabel} · ${Number(item?.totalCount || 0)} case`
      )}</span></li>`;
    })
    .join('');
}

function formatFailurePatternList(summary = []) {
  const items = asArray(summary).slice(0, 6);
  if (items.length === 0) {
    return '<li class="readout-empty">Inga tydliga failure patterns ännu.</li>';
  }
  return items
    .map((item) => {
      const label =
        item?.type === 'outcome'
          ? toHistoryOutcomeLabelSv(item?.key)
          : normalizeText(item?.label || item?.key) || '–';
      return `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(
        `${Number(item?.count || 0)} träffar`
      )}</span></li>`;
    })
    .join('');
}

function buildMailboxComparisonCards(mailboxSummaries = []) {
  const items = asArray(mailboxSummaries);
  if (items.length === 0) {
    return '<p class="readout-empty">Ingen mailboxsummary ännu.</p>';
  }
  return items
    .map(
      (entry) => `<article class="mailbox-card">
        <h4>${escapeHtml(normalizeText(entry.mailboxId || entry.label) || 'Mailbox')}</h4>
        <p>${escapeHtml(
          `Positiva ${Number(entry.positiveOutcomeCount || 0)} · Negativa ${Number(entry.negativeOutcomeCount || 0)} · Totalt ${Number(entry.totalOutcomeCount || 0)}`
        )}</p>
        <p>${escapeHtml(
          `Bästa action: ${normalizeText(entry.preferredAction) || '–'}`
        )}</p>
        <p>${escapeHtml(
          `Bästa mode: ${normalizeText(entry.preferredMode) || '–'}`
        )}</p>
        <p>${escapeHtml(
          `Svagaste utfall: ${toHistoryOutcomeLabelSv(entry.dominantFailureOutcome)}`
        )}</p>
      </article>`
    )
    .join('');
}

function buildCalibrationReadoutDocument({
  mailboxIds = [],
  customerEmail = null,
  conversationId = null,
  lookbackDays = 90,
  q = '',
  intent = null,
  resultTypes = [],
  actionTypes = [],
  outcomeCodes = [],
  sinceIso = null,
  untilIso = null,
  summary = {},
  mailboxSummaries = [],
  searchResults = [],
} = {}) {
  const mailboxValue = mailboxIds.join(',');
  const intentValue = normalizeText(intent);
  const resultTypeValue = asArray(resultTypes).join(',');
  const actionTypeValue = asArray(actionTypes).join(',');
  const outcomeCodeValue = asArray(outcomeCodes).join(',');
  const positiveRate =
    Number(summary.totalOutcomeCount || 0) > 0
      ? Math.round((Number(summary.positiveOutcomeCount || 0) / Number(summary.totalOutcomeCount || 1)) * 100)
      : 0;
  const bestActionLabel = normalizeText(summary.preferredAction) || '–';
  const bestModeLabel = normalizeText(summary.preferredMode) || '–';
  const worstOutcomeLabel = toHistoryOutcomeLabelSv(summary.dominantFailureOutcome);
  const worstRiskLabel = normalizeText(summary.dominantFailureRisk) || '–';
  const searchItems = asArray(searchResults)
    .map((result) => {
      const label =
        result.resultType === 'outcome'
          ? toHistoryOutcomeLabelSv(result.outcomeCode || result.title)
          : result.resultType === 'action'
            ? toHistoryActionLabelSv(result.actionType || result.title)
            : normalizeText(result.title) || 'Mail';
      return `<article class="result-card">
        <div class="result-head">
          <span class="result-type">${escapeHtml(toHistorySearchResultLabelSv(result))}</span>
          <span class="result-time">${escapeHtml(formatReadoutDateTimeSv(result.recordedAt))}</span>
        </div>
        <h4>${escapeHtml(label)}</h4>
        <p class="result-summary">${escapeHtml(normalizeText(result.summary || result.subject || result.detail) || '–')}</p>
        <p class="result-meta">${escapeHtml(
          [
            normalizeText(result.mailboxId),
            normalizeText(result.customerEmail),
            normalizeText(result.conversationId),
          ]
            .filter(Boolean)
            .join(' · ')
        )}</p>
        ${
          normalizeText(result.conversationId)
            ? `<p class="result-links"><a href="${escapeHtml(
                buildCcoNextConversationHref(result.conversationId)
              )}" target="_blank" rel="noreferrer">Öppna i CCO Next</a></p>`
            : ''
        }
      </article>`;
    })
    .join('');

  const mailboxCards = buildMailboxComparisonCards(
    asArray(summary.mailboxComparisonSummary).length > 0
      ? summary.mailboxComparisonSummary
      : asArray(mailboxSummaries).map((entry) => ({
          mailboxId: entry.mailboxId,
          totalOutcomeCount: entry.summary?.totalOutcomeCount || 0,
          positiveOutcomeCount: entry.summary?.positiveOutcomeCount || 0,
          negativeOutcomeCount: entry.summary?.negativeOutcomeCount || 0,
          preferredAction: entry.summary?.preferredAction || null,
          preferredMode: entry.summary?.preferredMode || null,
          dominantFailureOutcome: entry.summary?.dominantFailureOutcome || null,
        }))
  );

  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CCO Kons-readout</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; padding: 32px; font-family: Arial, sans-serif; background: #f6f2ec; color: #2f2f33; }
      .page { max-width: 1280px; margin: 0 auto; }
      h1 { margin: 0 0 8px; font-size: 30px; }
      .lead { margin: 0 0 24px; color: rgba(70,60,50,.72); }
      .panel { background: rgba(255,252,248,.92); border: 1px solid rgba(120,105,90,.16); border-radius: 20px; box-shadow: 0 8px 24px rgba(70,50,30,.08), 0 2px 6px rgba(70,50,30,.05), inset 0 1px 0 rgba(255,255,255,.55); padding: 24px; margin-bottom: 24px; }
      .filters { display: grid; grid-template-columns: 1.2fr 1fr 1fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 1fr 1fr auto; gap: 12px; align-items: end; }
      .filters label { display: block; font-size: 13px; color: rgba(70,60,50,.72); margin-bottom: 6px; }
      .filters input, .filters select { width: 100%; border: 1px solid rgba(120,105,90,.16); border-radius: 14px; padding: 11px 12px; font-size: 14px; background: rgba(255,255,255,.82); }
      .filters button { border: 0; border-radius: 14px; padding: 12px 16px; background: linear-gradient(180deg, rgba(34,108,74,.94), rgba(18,88,58,.98)); color: #fff; font-weight: 700; cursor: pointer; }
      .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
      .kpi { padding: 16px; border-radius: 16px; background: rgba(255,255,255,.82); border: 1px solid rgba(120,105,90,.12); }
      .kpi-label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: rgba(70,60,50,.62); margin-bottom: 8px; }
      .kpi-value { font-size: 28px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 24px; }
      .lists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .list-card, .mailbox-card, .result-card { padding: 16px; border-radius: 16px; background: rgba(255,255,255,.82); border: 1px solid rgba(120,105,90,.12); }
      .list-card h3, .mailbox-card h4, .result-card h4 { margin: 0 0 12px; font-size: 16px; }
      .list-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
      .list-card li { display: grid; gap: 4px; }
      .list-card li span { color: rgba(70,60,50,.72); font-size: 13px; }
      .mailboxes { display: grid; gap: 12px; }
      .result-grid { display: grid; gap: 12px; }
      .result-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: rgba(70,60,50,.62); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .06em; }
      .result-summary { margin: 0 0 8px; font-size: 14px; line-height: 1.45; }
      .result-meta { margin: 0; color: rgba(70,60,50,.62); font-size: 12px; }
      .result-links { margin: 10px 0 0; }
      .result-links a { color: #2a5bd7; text-decoration: none; font-size: 13px; font-weight: 600; }
      .readout-empty { color: rgba(70,60,50,.62); }
      @media (max-width: 1100px) {
        body { padding: 20px; }
        .filters, .kpis, .grid, .lists { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>CCO kons-readout</h1>
      <p class="lead">Kalibrering, historiksök och operativ readout för kons-flödet utan att belasta huvudytan i CCO Next.</p>

      <section class="panel">
        <form method="get" action="/api/v1/cco/runtime/calibration/readout" class="filters">
          <div>
            <label for="mailboxIds">Mailboxar</label>
            <input id="mailboxIds" name="mailboxIds" value="${escapeHtml(mailboxValue)}" />
          </div>
          <div>
            <label for="customerEmail">Kundmail</label>
            <input id="customerEmail" name="customerEmail" value="${escapeHtml(normalizeText(customerEmail))}" />
          </div>
          <div>
            <label for="conversationId">Conversation</label>
            <input id="conversationId" name="conversationId" value="${escapeHtml(normalizeText(conversationId))}" />
          </div>
          <div>
            <label for="lookbackDays">Lookback</label>
            <select id="lookbackDays" name="lookbackDays">
              ${[30, 90, 365, 1095]
                .map(
                  (days) =>
                    `<option value="${days}"${Number(days) === Number(lookbackDays) ? ' selected' : ''}>${days} dagar</option>`
                )
                .join('')}
            </select>
          </div>
          <div>
            <label for="intent">Intent</label>
            <input id="intent" name="intent" value="${escapeHtml(intentValue)}" placeholder="reschedule" />
          </div>
          <div>
            <label for="resultTypes">Resultattyper</label>
            <input id="resultTypes" name="resultTypes" value="${escapeHtml(resultTypeValue)}" placeholder="message,action" />
          </div>
          <div>
            <label for="actionTypes">Åtgärdstyper</label>
            <input id="actionTypes" name="actionTypes" value="${escapeHtml(actionTypeValue)}" placeholder="reply_sent,reply_later" />
          </div>
          <div>
            <label for="outcomeCodes">Utfall</label>
            <input id="outcomeCodes" name="outcomeCodes" value="${escapeHtml(outcomeCodeValue)}" placeholder="rebooked,no_response" />
          </div>
          <div>
            <label for="q">Sök historik</label>
            <input id="q" name="q" value="${escapeHtml(normalizeText(q))}" />
          </div>
          <div>
            <label for="sinceIso">Från</label>
            <input id="sinceIso" name="sinceIso" value="${escapeHtml(normalizeText(sinceIso))}" />
          </div>
          <div>
            <label for="untilIso">Till</label>
            <input id="untilIso" name="untilIso" value="${escapeHtml(normalizeText(untilIso))}" />
          </div>
          <button type="submit">Uppdatera</button>
        </form>

        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Totala utfall</div><div class="kpi-value">${escapeHtml(String(summary.totalOutcomeCount || 0))}</div></div>
          <div class="kpi"><div class="kpi-label">Positiv andel</div><div class="kpi-value">${escapeHtml(`${positiveRate}%`)}</div></div>
          <div class="kpi"><div class="kpi-label">Bästa action</div><div class="kpi-value">${escapeHtml(bestActionLabel)}</div></div>
          <div class="kpi"><div class="kpi-label">Bästa mode</div><div class="kpi-value">${escapeHtml(bestModeLabel)}</div></div>
        </div>
      </section>

      <div class="grid">
        <section class="panel">
          <div class="lists">
            <div class="list-card">
              <h3>Det som fungerar bäst</h3>
              <ul>
                <li><strong>${escapeHtml(bestActionLabel)}</strong><span>Rekommenderad action med bäst positivt utfall.</span></li>
                <li><strong>${escapeHtml(bestModeLabel)}</strong><span>Draft mode som gav bäst resultat.</span></li>
              </ul>
            </div>
            <div class="list-card">
              <h3>Det som fungerar sämst</h3>
              <ul>
                <li><strong>${escapeHtml(worstOutcomeLabel || '–')}</strong><span>Vanligaste negativa utfall.</span></li>
                <li><strong>${escapeHtml(worstRiskLabel)}</strong><span>Dominant negativ risksignal.</span></li>
              </ul>
            </div>
            <div class="list-card">
              <h3>Toppactions</h3>
              <ul>${formatCalibrationStatList(summary.actionSummary)}</ul>
            </div>
            <div class="list-card">
              <h3>Toppmodes</h3>
              <ul>${formatCalibrationStatList(summary.modeSummary, (item) => item.label)}</ul>
            </div>
            <div class="list-card">
              <h3>Bästa/sämsta action per intent</h3>
              <ul>${formatCalibrationIntentBreakdown(summary.actionSummaryByIntent, 'action')}</ul>
            </div>
            <div class="list-card">
              <h3>Bästa/sämsta mode per intent</h3>
              <ul>${formatCalibrationIntentBreakdown(summary.modeSummaryByIntent, 'mode')}</ul>
            </div>
            <div class="list-card">
              <h3>Vanligaste failure patterns</h3>
              <ul>${formatFailurePatternList(summary.failurePatternSummary)}</ul>
            </div>
            <div class="list-card">
              <h3>Intentvolym</h3>
              <ul>${formatCalibrationStatList(summary.intentSummary)}</ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <h3>Per mailbox</h3>
          <div class="mailboxes">${mailboxCards || '<p class="readout-empty">Ingen mailboxsummary ännu.</p>'}</div>
        </section>
      </div>

      <section class="panel">
        <h3>Historiksök</h3>
        <div class="result-grid">${searchItems || '<p class="readout-empty">Ingen historik matchar filtret ännu.</p>'}</div>
      </section>
    </div>
  </body>
</html>`;
}

async function listCapabilityEntriesByName({
  capabilityAnalysisStore = null,
  tenantId = '',
  capabilityName = '',
  limit = 500,
} = {}) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') return [];
  return capabilityAnalysisStore.list({
    tenantId,
    capabilityName,
    limit,
  });
}

function buildWorklistLegacyBaselineEntrySummary(entry = {}) {
  const directOutputData = asObject(entry?.output?.data);
  const nestedOutputData = asObject(directOutputData.data);
  const outputData =
    Array.isArray(directOutputData.conversationWorklist) ||
    Array.isArray(directOutputData.needsReplyToday)
      ? directOutputData
      : Array.isArray(nestedOutputData.conversationWorklist) ||
          Array.isArray(nestedOutputData.needsReplyToday)
        ? nestedOutputData
        : directOutputData;
  const conversationWorklist = asArray(outputData.conversationWorklist);
  const needsReplyToday = asArray(outputData.needsReplyToday);
  const rowMailboxIds = Array.from(
    new Set(
      [...conversationWorklist, ...needsReplyToday]
        .map((row) =>
          normalizeText(row?.mailboxId || row?.mailboxAddress || row?.userPrincipalName).toLowerCase()
        )
        .filter(Boolean)
    )
  );
  const inputMailboxIds = asArray(entry?.input?.mailboxIds)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  const mailboxIds = Array.from(new Set([...rowMailboxIds, ...inputMailboxIds]));
  return {
    outputData,
    conversationWorklist,
    needsReplyToday,
    rowCount: conversationWorklist.length + needsReplyToday.length,
    mailboxIds,
  };
}

function getWorklistLegacyBaselineObservedAt(entry = {}) {
  const summary = buildWorklistLegacyBaselineEntrySummary(entry);
  const outputData = asObject(summary.outputData);
  return (
    normalizeText(outputData?.generatedAt) ||
    normalizeText(entry?.ts) ||
    normalizeText(entry?.id) ||
    ''
  );
}

function selectLatestWorklistLegacyBaseline({
  entries = [],
  mailboxIds = [],
} = {}) {
  const safeEntries = asArray(entries).sort((left, right) => {
    const observedCompare = getWorklistLegacyBaselineObservedAt(right).localeCompare(
      getWorklistLegacyBaselineObservedAt(left)
    );
    if (observedCompare !== 0) return observedCompare;
    const tsCompare = normalizeText(right?.ts).localeCompare(normalizeText(left?.ts));
    if (tsCompare !== 0) return tsCompare;
    return normalizeText(right?.id).localeCompare(normalizeText(left?.id));
  });
  const requestedMailboxIds = new Set(
    asArray(mailboxIds)
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean)
  );
  const latestObservedEntry = safeEntries[0] || null;
  let firstNonEmptyEntry = null;
  let firstScopeMatchedEntry = null;
  let skippedEmptyEntries = 0;
  let skippedScopeMismatchEntries = 0;

  for (const entry of safeEntries) {
    const summary = buildWorklistLegacyBaselineEntrySummary(entry);
    if (summary.rowCount <= 0) {
      skippedEmptyEntries += 1;
      continue;
    }
    if (!firstNonEmptyEntry) {
      firstNonEmptyEntry = {
        entry,
        summary,
      };
    }
    const scopeMatched =
      requestedMailboxIds.size === 0 ||
      summary.mailboxIds.some((mailboxId) => requestedMailboxIds.has(mailboxId));
    if (scopeMatched) {
      firstScopeMatchedEntry = {
        entry,
        summary,
      };
      break;
    }
    skippedScopeMismatchEntries += 1;
  }

  const selected =
    firstScopeMatchedEntry ||
    firstNonEmptyEntry || {
      entry: latestObservedEntry,
      summary: buildWorklistLegacyBaselineEntrySummary(latestObservedEntry),
    };

  const strategy =
    firstScopeMatchedEntry
      ? 'latest_non_empty_scope_match'
      : firstNonEmptyEntry
        ? 'latest_non_empty_fallback'
        : 'latest_entry';

  return {
    latestObservedEntry,
    selectedEntry: selected.entry,
    selectedOutputData: selected.summary.outputData,
    selectedConversationWorklist: selected.summary.conversationWorklist,
    selectedNeedsReplyToday: selected.summary.needsReplyToday,
    selection: {
      strategy,
      latestObservedEntryId: normalizeText(latestObservedEntry?.id) || null,
      selectedEntryId: normalizeText(selected.entry?.id) || null,
      skippedEmptyEntries,
      skippedScopeMismatchEntries,
      selectedRowCount: Number(selected.summary.rowCount || 0),
      selectedMailboxIds: selected.summary.mailboxIds,
    },
  };
}

async function buildShadowReviewContext({
  tenantId = '',
  capabilityAnalysisStore = null,
  ccoHistoryStore = null,
  mailboxIds = [],
  lookbackDays = 14,
  intent = null,
  limit = 24,
  sinceIso = null,
  untilIso = null,
} = {}) {
  const { startIso, endIso } = resolveCcoRuntimeWindowBounds({
    lookbackDays,
    sinceIso,
    untilIso,
  });
  if (
    ccoHistoryStore &&
    typeof ccoHistoryStore.listMailboxMessages === 'function' &&
    typeof materializeCustomerReplyActions === 'function'
  ) {
    const recentMessages = (
      await Promise.all(
        asArray(mailboxIds).map((mailboxId) =>
          ccoHistoryStore.listMailboxMessages({
            tenantId,
            mailboxId,
            sinceIso: startIso,
            untilIso: endIso,
          })
        )
      )
    ).flat();
    await materializeCustomerReplyActions({
      tenantId,
      messages: recentMessages,
      ccoHistoryStore,
    });
  }
  const [shadowEntries, reviewEntries, actions, outcomes] = await Promise.all([
    listCapabilityEntriesByName({
      capabilityAnalysisStore,
      tenantId,
      capabilityName: 'CCO.ShadowRun',
      limit: 500,
    }),
    listCapabilityEntriesByName({
      capabilityAnalysisStore,
      tenantId,
      capabilityName: 'CCO.ShadowReview',
      limit: 60,
    }),
    ccoHistoryStore && typeof ccoHistoryStore.listActions === 'function'
      ? ccoHistoryStore.listActions({
          tenantId,
          mailboxIds,
          sinceIso: startIso,
          untilIso: endIso,
          intent,
        })
      : [],
    ccoHistoryStore && typeof ccoHistoryStore.listOutcomes === 'function'
      ? ccoHistoryStore.listOutcomes({
          tenantId,
          mailboxIds,
          sinceIso: startIso,
          untilIso: endIso,
          intent,
        })
      : [],
  ]);

  const summary = summarizeShadowReview({
    shadowEntries,
    actions,
    outcomes,
    mailboxIds,
    lookbackDays,
    intent,
    limit,
  });

  return {
    window: {
      startIso,
      endIso,
    },
    shadowEntries,
    reviewEntries,
    actions,
    outcomes,
    summary,
    latestRunEntry: asArray(shadowEntries)[0] || null,
    latestReviewEntry: asArray(reviewEntries)[0] || null,
  };
}

async function resolveWorklistCustomerState({
  tenantId = '',
  customerState = null,
  ccoCustomerStore = null,
} = {}) {
  if (customerState && typeof customerState === 'object') {
    return customerState;
  }
  if (ccoCustomerStore && typeof ccoCustomerStore.getTenantCustomerState === 'function') {
    return ccoCustomerStore.getTenantCustomerState({ tenantId });
  }
  return null;
}

async function buildWorklistShadowContext({
  tenantId = '',
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  customerState = null,
  mailboxIds = [],
  limit = 250,
} = {}) {
  const resolvedCustomerState = await resolveWorklistCustomerState({
    tenantId,
    customerState,
    ccoCustomerStore,
  });
  const shadow = createCcoMailboxTruthWorklistShadow({
    store: ccoMailboxTruthStore,
    customerState: resolvedCustomerState,
  });
  const legacyEntries = await listCapabilityEntriesByName({
    capabilityAnalysisStore,
    tenantId,
    capabilityName: 'CCO.InboxAnalysis',
    limit: 50,
  });
  const baseline = selectLatestWorklistLegacyBaseline({
    entries: legacyEntries,
    mailboxIds,
  });
  const latestEntry = baseline.selectedEntry;
  const latestOutputData = baseline.selectedOutputData;
  const diffReport = shadow
    ? shadow.buildDiffReport({
        legacyConversationWorklist: baseline.selectedConversationWorklist,
        legacyNeedsReplyToday: baseline.selectedNeedsReplyToday,
        mailboxIds,
        limit,
        customerState: resolvedCustomerState,
      })
    : null;

  return {
    latestEntry,
    latestObservedEntry: baseline.latestObservedEntry,
    latestOutputData,
    baselineSelection: baseline.selection,
    diffReport,
    truthCoverage:
      ccoMailboxTruthStore && typeof ccoMailboxTruthStore.getCompletenessReport === 'function'
        ? ccoMailboxTruthStore.getCompletenessReport({ mailboxIds })
        : null,
    deltaCoverage:
      ccoMailboxTruthStore && typeof ccoMailboxTruthStore.getDeltaSyncReport === 'function'
        ? ccoMailboxTruthStore.getDeltaSyncReport({ mailboxIds })
        : null,
  };
}

async function buildWorklistTruthContext({
  tenantId = '',
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  customerState = null,
  mailboxIds = [],
  limit = 250,
} = {}) {
  const resolvedCustomerState = await resolveWorklistCustomerState({
    tenantId,
    customerState,
    ccoCustomerStore,
  });
  const worklistReadModel = createCcoMailboxTruthWorklistReadModel({
    store: ccoMailboxTruthStore,
    customerState: resolvedCustomerState,
  });
  const shadowContext = await buildWorklistShadowContext({
    tenantId,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    customerState: resolvedCustomerState,
    mailboxIds,
    limit,
  });

  return {
    readModel: worklistReadModel
      ? worklistReadModel.buildReadModel({
          mailboxIds,
          limit,
        })
      : null,
    latestEntry: shadowContext.latestEntry,
    latestObservedEntry: shadowContext.latestObservedEntry,
    latestOutputData: shadowContext.latestOutputData,
    baselineSelection: shadowContext.baselineSelection,
    truthCoverage: shadowContext.truthCoverage,
    deltaCoverage: shadowContext.deltaCoverage,
    shadowDiffReport: shadowContext.diffReport,
  };
}

function buildWorklistConsumerParityBaseline({
  shadowDiffReport = null,
  mailboxIds = [],
} = {}) {
  const mailboxAssessment = asArray(shadowDiffReport?.mailboxAssessment)
    .map((item) => asObject(item))
    .filter((item) => normalizeText(item.mailboxId));
  const assessmentByMailboxId = new Map(
    mailboxAssessment.map((item) => [normalizeText(item.mailboxId).toLowerCase(), item])
  );
  const requestedMailboxIds = asArray(mailboxIds)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  const comparableMailboxIds = mailboxAssessment
    .filter((item) => item.comparable === true)
    .map((item) => normalizeText(item.mailboxId).toLowerCase());
  const notComparableMailboxIds = requestedMailboxIds.filter((mailboxId) => {
    const assessment = assessmentByMailboxId.get(mailboxId);
    return !assessment || assessment.comparable !== true;
  });

  return {
    comparableMailboxIds,
    notComparableMailboxIds,
    mailboxAssessment: requestedMailboxIds.map((mailboxId) => {
      const assessment = assessmentByMailboxId.get(mailboxId);
      if (assessment) return assessment;
      return {
        mailboxId,
        legacyCount: 0,
        shadowCount: 0,
        bothCount: 0,
        legacyOnlyCount: 0,
        shadowOnlyCount: 0,
        unreadDiffCount: 0,
        ownershipDiffCount: 0,
        laneDiffCount: 0,
        classificationCounts: {},
        comparable: false,
        parityStatus: 'not_comparable_no_data',
      };
    }),
  };
}

async function buildWorklistConsumerContext({
  tenantId = '',
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  customerState = null,
  mailboxIds = [],
  limit = 120,
} = {}) {
  const resolvedCustomerState = await resolveWorklistCustomerState({
    tenantId,
    customerState,
    ccoCustomerStore,
  });
  const worklistReadModel = createCcoMailboxTruthWorklistReadModel({
    store: ccoMailboxTruthStore,
    customerState: resolvedCustomerState,
  });
  const truthContext = await buildWorklistTruthContext({
    tenantId,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    customerState: resolvedCustomerState,
    mailboxIds,
    limit,
  });

  return {
    consumerModel: worklistReadModel
      ? worklistReadModel.buildConsumerModel({
          mailboxIds,
          limit,
        })
      : null,
    latestEntry: truthContext.latestEntry,
    latestObservedEntry: truthContext.latestObservedEntry,
    latestOutputData: truthContext.latestOutputData,
    baselineSelection: truthContext.baselineSelection,
    truthCoverage: truthContext.truthCoverage,
    deltaCoverage: truthContext.deltaCoverage,
    shadowDiffReport: truthContext.shadowDiffReport,
    parityBaseline: buildWorklistConsumerParityBaseline({
      shadowDiffReport: truthContext.shadowDiffReport,
      mailboxIds,
    }),
  };
}

function buildWorklistConsumerCountList(items = {}) {
  return Object.entries(asObject(items))
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    .map(
      ([key, value]) =>
        `<li><strong>${escapeHtml(normalizeText(key) || 'okänd')}</strong><span>${escapeHtml(
          String(Number(value || 0))
        )}</span></li>`
    )
    .join('');
}

function buildWorklistConsumerMailboxCards(items = []) {
  const rows = asArray(items);
  if (rows.length === 0) {
    return '<p class="readout-empty">Ingen parity-baseline ännu.</p>';
  }
  return rows
    .map((item) => {
      const comparable = item.comparable === true;
      const parityLabel = comparable ? 'Jämförbar' : 'Inte jämförbar ännu';
      return `<article class="result-card">
        <div class="result-head">
          <span class="result-type">${escapeHtml(parityLabel)}</span>
          <span class="result-time">${escapeHtml(normalizeText(item.mailboxId) || 'okänd mailbox')}</span>
        </div>
        <h4>${escapeHtml(normalizeText(item.mailboxId) || 'okänd mailbox')}</h4>
        <p class="result-summary">${escapeHtml(
          [
            `Legacy ${Number(item.legacyCount || 0)}`,
            `Truth ${Number(item.shadowCount || 0)}`,
            `Båda ${Number(item.bothCount || 0)}`,
          ].join(' · ')
        )}</p>
        <p class="result-meta">${escapeHtml(
          [
            `Unread diff ${Number(item.unreadDiffCount || 0)}`,
            `Ownership diff ${Number(item.ownershipDiffCount || 0)}`,
            `Lane diff ${Number(item.laneDiffCount || 0)}`,
          ].join(' · ')
        )}</p>
        <p class="result-meta">${escapeHtml(
          normalizeText(item.parityStatus) || 'okänd paritystatus'
        )}</p>
      </article>`;
    })
    .join('');
}

function buildWorklistConsumerRowCards(rows = []) {
  const items = asArray(rows).slice(0, 40);
  if (items.length === 0) {
    return '<p class="readout-empty">Inga truth-rader i det här scope:t ännu.</p>';
  }
  return items
    .map((item) => {
      const stateBits = [];
      if (item?.state?.hasUnreadInbound === true) stateBits.push('Unread inbound');
      if (item?.state?.needsReply === true) stateBits.push('Needs reply');
      if (item?.state?.folderPresence?.inbox === true) stateBits.push('Inbox');
      if (item?.state?.folderPresence?.sent === true) stateBits.push('Sent');
      if (item?.state?.folderPresence?.drafts === true) stateBits.push('Drafts');
      if (item?.state?.folderPresence?.deleted === true) stateBits.push('Deleted');
      const rollup = item?.rollup && typeof item.rollup === 'object' ? item.rollup : null;
      const rollupBits = [];
      if (rollup?.enabled === true) {
        rollupBits.push(`Rollup ${Number(rollup.count || 0)}`);
        if (Number(rollup?.mailboxCount || 0) > 0) {
          rollupBits.push(`${Number(rollup.mailboxCount || 0)} mailboxar`);
        }
        if (normalizeText(rollup?.provenanceDetail)) {
          rollupBits.push(normalizeText(rollup.provenanceDetail));
        }
        const operationalSummary = rollup?.operationalSummary || {};
        const operationalBits = [];
        if (Number(operationalSummary.unreadCount || 0) > 0) {
          operationalBits.push(`Unread ${Number(operationalSummary.unreadCount || 0)}`);
        }
        if (Number(operationalSummary.needsReplyCount || 0) > 0) {
          operationalBits.push(`Needs reply ${Number(operationalSummary.needsReplyCount || 0)}`);
        }
        if (Number(operationalSummary.inboxCount || 0) > 0) {
          operationalBits.push(`Inbox ${Number(operationalSummary.inboxCount || 0)}`);
        }
        if (Number(operationalSummary.sentCount || 0) > 0) {
          operationalBits.push(`Sent ${Number(operationalSummary.sentCount || 0)}`);
        }
        if (operationalBits.length) {
          rollupBits.push(operationalBits.join(' · '));
        }
      }
      const rollupMarkup = rollupBits.length
        ? `<p class="result-meta">${escapeHtml(rollupBits.join(' · '))}</p>`
        : '';
      return `<article class="result-card">
        <div class="result-head">
          <span class="result-type">Truth-rad · ${escapeHtml(normalizeText(item?.lane) || 'all')}</span>
          <span class="result-time">${escapeHtml(formatReadoutDateTimeSv(item?.timing?.latestMessageAt))}</span>
        </div>
        <h4>${escapeHtml(normalizeText(item?.subject) || '(utan ämne)')}</h4>
        <p class="result-summary">${escapeHtml(
          normalizeText(item?.preview) || 'Ingen preview tillgänglig.'
        )}</p>
        ${rollupMarkup}
        <p class="result-meta">${escapeHtml(
          [
            normalizeText(item?.mailbox?.mailboxId),
            normalizeText(item?.customer?.email || item?.customer?.name),
            normalizeText(item?.conversation?.key),
          ]
            .filter(Boolean)
            .join(' · ')
        )}</p>
        <p class="result-meta">${escapeHtml(
          [
            `Ownership: ${normalizeText(item?.mailbox?.ownershipMailbox) || 'okänd'}`,
            `Message count: ${Number(item?.state?.messageCount || 0)}`,
            ...stateBits,
          ]
            .filter(Boolean)
            .join(' · ')
        )}</p>
        ${
          normalizeText(item?.conversation?.conversationId)
            ? `<p class="result-links"><a href="${escapeHtml(
                buildCcoNextConversationHref(item.conversation.conversationId)
              )}" target="_blank" rel="noreferrer">Öppna i CCO Next</a></p>`
            : ''
        }
      </article>`;
    })
    .join('');
}

function buildWorklistConsumerReadoutDocument({
  mailboxIds = [],
  limit = 120,
  consumerModel = null,
  parityBaseline = null,
  shadowDiffReport = null,
  latestEntry = null,
  latestOutputData = null,
} = {}) {
  const mailboxValue = asArray(mailboxIds).join(',');
  const consumerParams = new URLSearchParams();
  if (mailboxValue) consumerParams.set('mailboxIds', mailboxValue);
  consumerParams.set('limit', String(limit));
  const consumerJsonHref = `/api/v1/cco/runtime/worklist/consumer?${consumerParams.toString()}`;
  const shadowJsonHref = `/api/v1/cco/runtime/worklist/shadow?${consumerParams.toString()}`;
  const summary = asObject(consumerModel?.summary);
  const aggregate = asObject(shadowDiffReport?.aggregate);
  const acceptanceGate = asObject(shadowDiffReport?.acceptanceGate);
  const parity = asObject(parityBaseline);
  const comparableMailboxIds = asArray(parity.comparableMailboxIds);
  const notComparableMailboxIds = asArray(parity.notComparableMailboxIds);

  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CCO worklist consumer preview</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; padding: 32px; font-family: Arial, sans-serif; background: #f6f2ec; color: #2f2f33; }
      .page { max-width: 1360px; margin: 0 auto; }
      h1 { margin: 0 0 8px; font-size: 30px; }
      .lead { margin: 0 0 24px; color: rgba(70,60,50,.72); }
      .panel { background: rgba(255,252,248,.92); border: 1px solid rgba(120,105,90,.16); border-radius: 20px; box-shadow: 0 8px 24px rgba(70,50,30,.08), 0 2px 6px rgba(70,50,30,.05), inset 0 1px 0 rgba(255,255,255,.55); padding: 24px; margin-bottom: 24px; }
      .warning { border-radius: 16px; padding: 16px 18px; background: rgba(108, 70, 34, 0.08); border: 1px solid rgba(120,105,90,.16); margin-top: 18px; }
      .warning strong { display: block; margin-bottom: 6px; }
      .filters { display: grid; grid-template-columns: 1.2fr .8fr auto; gap: 12px; align-items: end; }
      .filters label { display: block; font-size: 13px; color: rgba(70,60,50,.72); margin-bottom: 6px; }
      .filters input { width: 100%; border: 1px solid rgba(120,105,90,.16); border-radius: 14px; padding: 11px 12px; font-size: 14px; background: rgba(255,255,255,.82); }
      .filters button { border: 0; border-radius: 14px; padding: 12px 16px; background: linear-gradient(180deg, rgba(34,108,74,.94), rgba(18,88,58,.98)); color: #fff; font-weight: 700; cursor: pointer; }
      .meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; color: rgba(70,60,50,.72); font-size: 13px; }
      .meta-chip { border: 1px solid rgba(120,105,90,.16); border-radius: 999px; padding: 7px 12px; background: rgba(255,255,255,.72); }
      .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
      .kpi { padding: 16px; border-radius: 16px; background: rgba(255,255,255,.82); border: 1px solid rgba(120,105,90,.12); }
      .kpi-label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: rgba(70,60,50,.62); margin-bottom: 8px; }
      .kpi-value { font-size: 28px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .list-card, .result-card { padding: 16px; border-radius: 16px; background: rgba(255,255,255,.82); border: 1px solid rgba(120,105,90,.12); }
      .list-card h3, .result-card h4 { margin: 0 0 12px; font-size: 16px; }
      .list-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
      .list-card li { display: grid; gap: 4px; }
      .list-card li span { color: rgba(70,60,50,.72); font-size: 13px; }
      .result-grid { display: grid; gap: 12px; }
      .result-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: rgba(70,60,50,.62); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .06em; }
      .result-summary { margin: 0 0 8px; font-size: 14px; line-height: 1.45; }
      .result-meta { margin: 0; color: rgba(70,60,50,.62); font-size: 12px; }
      .result-links { margin: 10px 0 0; }
      .result-links a { color: #2a5bd7; text-decoration: none; font-size: 13px; font-weight: 600; }
      .readout-empty { color: rgba(70,60,50,.62); }
      .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px; }
      .links a { color: #2a5bd7; text-decoration: none; font-size: 13px; font-weight: 600; }
      @media (max-width: 1100px) {
        body { padding: 20px; }
        .filters, .kpis, .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>CCO worklist consumer preview</h1>
      <p class="lead">Intern read-only preview av den truth-driven worklist-consumern. Detta är inte primär operativ arbetskö och får inte användas som styrande vänsterkö i det här steget.</p>

      <section class="panel">
        <form method="get" action="/api/v1/cco/runtime/worklist/consumer/readout" class="filters">
          <div>
            <label for="mailboxIds">Mailboxar</label>
            <input id="mailboxIds" name="mailboxIds" value="${escapeHtml(mailboxValue)}" />
          </div>
          <div>
            <label for="limit">Antal rader</label>
            <input id="limit" name="limit" value="${escapeHtml(String(limit))}" />
          </div>
          <button type="submit">Uppdatera</button>
        </form>

        <div class="warning">
          <strong>Preview-läge</strong>
          <span>Legacy-worklisten fortsätter vara styrande. Shadow guardrail är obligatorisk. Cutover är uttryckligen inte tillåten i denna yta.</span>
        </div>

        <div class="meta">
          <span class="meta-chip">Senaste legacy-analys: ${escapeHtml(formatReadoutDateTimeSv(normalizeText(latestOutputData?.generatedAt) || latestEntry?.ts))}</span>
          <span class="meta-chip">Parity-scope: draft-only review out of scope</span>
          <span class="meta-chip">Comparable mailboxar: ${escapeHtml(comparableMailboxIds.join(', ') || 'inga ännu')}</span>
          <span class="meta-chip">Not comparable yet: ${escapeHtml(notComparableMailboxIds.join(', ') || 'inga')}</span>
        </div>

        <div class="links">
          <a href="${escapeHtml(consumerJsonHref)}" target="_blank" rel="noreferrer">Öppna consumer JSON</a>
          <a href="${escapeHtml(shadowJsonHref)}" target="_blank" rel="noreferrer">Öppna shadow JSON</a>
        </div>

        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Truth-rader</div><div class="kpi-value">${escapeHtml(String(summary.rowCount || 0))}</div></div>
          <div class="kpi"><div class="kpi-label">Unread inbound</div><div class="kpi-value">${escapeHtml(String(summary.unreadCount || 0))}</div></div>
          <div class="kpi"><div class="kpi-label">Needs reply</div><div class="kpi-value">${escapeHtml(String(summary.needsReplyCount || 0))}</div></div>
          <div class="kpi"><div class="kpi-label">Shadow gate</div><div class="kpi-value">${escapeHtml(acceptanceGate.canConsiderCutover === true ? 'Klar' : 'Block')}</div></div>
        </div>
      </section>

      <div class="grid">
        <section class="panel">
          <div class="grid">
            <div class="list-card">
              <h3>Consumer summary</h3>
              <ul>
                <li><strong>Lane counts</strong><span>${escapeHtml(JSON.stringify(asObject(summary.laneCounts)))}</span></li>
                <li><strong>Ownership counts</strong><span>${escapeHtml(JSON.stringify(asObject(summary.ownershipCounts)))}</span></li>
                <li><strong>Act now</strong><span>${escapeHtml(String(Number(summary.actNowCount || 0)))}</span></li>
                <li><strong>Out of scope draft review</strong><span>${escapeHtml(String(Number(summary.outOfScopeDraftReviewCount || 0)))}</span></li>
              </ul>
            </div>
            <div class="list-card">
              <h3>Shadow guardrail</h3>
              <ul>
                <li><strong>Mapping gap</strong><span>${escapeHtml(String(Number(aggregate.classificationCounts?.mapping_gap || 0)))}</span></li>
                <li><strong>Truth shift</strong><span>${escapeHtml(String(Number(aggregate.classificationCounts?.truth_shift || 0)))}</span></li>
                <li><strong>Legacy heuristic</strong><span>${escapeHtml(String(Number(aggregate.classificationCounts?.legacy_heuristic || 0)))}</span></li>
                <li><strong>Unread diff</strong><span>${escapeHtml(String(Number(aggregate.unreadDiffCount || 0)))}</span></li>
              </ul>
            </div>
            <div class="list-card">
              <h3>Comparable mailboxar</h3>
              <ul>${comparableMailboxIds.length ? comparableMailboxIds.map((item) => `<li><strong>${escapeHtml(item)}</strong><span>Parity jämförbar i den här körningen.</span></li>`).join('') : '<li class="readout-empty">Ingen jämförbar mailbox ännu.</li>'}</ul>
            </div>
            <div class="list-card">
              <h3>Not comparable yet</h3>
              <ul>${notComparableMailboxIds.length ? notComparableMailboxIds.map((item) => `<li><strong>${escapeHtml(item)}</strong><span>Coverage finns men legacy-baseline saknas eller är inte jämförbar ännu.</span></li>`).join('') : '<li class="readout-empty">Ingen mailbox i detta läge.</li>'}</ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <h3>Per mailbox parity-baseline</h3>
          <div class="result-grid">${buildWorklistConsumerMailboxCards(parity.mailboxAssessment)}</div>
        </section>
      </div>

      <section class="panel">
        <h3>Truth-driven consumer rows</h3>
        <div class="result-grid">${buildWorklistConsumerRowCards(consumerModel?.rows)}</div>
      </section>
    </div>
  </body>
</html>`;
}

function formatShadowStatList(items = [], formatter = (item) => item?.label || item?.key || '–') {
  const rows = asArray(items).slice(0, 6);
  if (rows.length === 0) {
    return '<li class="readout-empty">Ingen stabil signal ännu.</li>';
  }
  return rows
    .map((item) => {
      const pending = Number(item?.pendingCount || 0);
      const pendingLabel = pending > 0 ? ` · ${pending} utan utfall` : '';
      return `<li><strong>${escapeHtml(formatter(item))}</strong><span>${escapeHtml(
        `${Number(item?.positiveCount || 0)} positiva · ${Number(item?.negativeCount || 0)} negativa${pendingLabel}`
      )}</span></li>`;
    })
    .join('');
}

function formatShadowIntentBreakdown(items = [], type = 'action') {
  const rows = asArray(items).slice(0, 6);
  if (rows.length === 0) {
    return '<li class="readout-empty">Ingen intentsignal ännu.</li>';
  }
  return rows
    .map((item) => {
      const bestLabel =
        normalizeText(item?.best?.label || item?.best?.key) || '–';
      const worstLabel =
        normalizeText(item?.worst?.label || item?.worst?.key) || '–';
      return `<li><strong>${escapeHtml(normalizeText(item?.label) || 'Okänd intent')}</strong><span>${escapeHtml(
        `${type === 'mode' ? 'Bästa mode' : 'Bästa action'}: ${bestLabel} · Svagast: ${worstLabel} · ${Number(item?.totalCount || 0)} case`
      )}</span></li>`;
    })
    .join('');
}

function formatShadowFailurePatterns(items = []) {
  const rows = asArray(items).slice(0, 6);
  if (rows.length === 0) {
    return '<li class="readout-empty">Inga failure patterns ännu.</li>';
  }
  return rows
    .map(
      (item) => `<li><strong>${escapeHtml(normalizeText(item?.label) || 'Mönster')}</strong><span>${escapeHtml(
        `${Number(item?.count || 0)} träffar`
      )}</span></li>`
    )
    .join('');
}

function buildShadowMailboxCards(items = []) {
  const rows = asArray(items);
  if (rows.length === 0) {
    return '<p class="readout-empty">Ingen mailboxjämförelse ännu.</p>';
  }
  return rows
    .map(
      (item) => `<article class="result-card">
        <div class="result-head">
          <span class="result-type">Mailbox</span>
          <span class="result-time">${escapeHtml(String(Number(item?.totalCount || 0)))} case</span>
        </div>
        <h4>${escapeHtml(normalizeText(item?.mailboxId) || 'Okänd mailbox')}</h4>
        <p class="result-summary">${escapeHtml(
          `Positiva ${Number(item?.positiveCount || 0)} · Negativa ${Number(item?.negativeCount || 0)} · Väntar ${Number(item?.pendingCount || 0)}`
        )}</p>
        <p class="result-meta">${escapeHtml(
          [
            `Bästa action: ${normalizeText(item?.bestAction?.label) || '–'}`,
            `Bästa mode: ${normalizeText(item?.bestMode?.label || item?.bestMode?.key) || '–'}`,
          ].join(' · ')
        )}</p>
      </article>`
    )
    .join('');
}

function formatShadowCaseMeta(caseItem = {}) {
  return [
    normalizeText(caseItem.mailboxId),
    normalizeText(caseItem.customerEmail),
    normalizeText(caseItem.conversationId),
  ]
    .filter(Boolean)
    .join(' · ');
}

function buildShadowComparisonCards(comparisons = []) {
  const items = asArray(comparisons).slice(0, 24);
  if (items.length === 0) {
    return '<p class="readout-empty">Ingen shadow-run-jämförelse ännu.</p>';
  }
  return items
    .map((item) => {
      const outcomeLabel = item.outcomeCode ? toHistoryOutcomeLabelSv(item.outcomeCode) : 'Inget utfall ännu';
      const operatorAction = item.operatorActionType
        ? toHistoryActionLabelSv(item.operatorActionType)
        : 'Ingen operatörsåtgärd ännu';
      const modeLabel = item.recommendedMode
        ? `${item.recommendedMode}${item.selectedMode ? ` → ${item.selectedMode}` : ''}`
        : item.selectedMode || '–';
      return `<article class="result-card">
        <div class="result-head">
          <span class="result-type">Shadow-run</span>
          <span class="result-time">${escapeHtml(formatReadoutDateTimeSv(item.generatedAt))}</span>
        </div>
        <h4>${escapeHtml(normalizeText(item.subject) || '(utan ämne)')}</h4>
        <p class="result-summary">${escapeHtml(
          [
            `CCO föreslog: ${normalizeText(item.recommendedAction) || '–'}`,
            `Operatör: ${operatorAction}`,
            `Utfall: ${outcomeLabel}`,
          ].join(' · ')
        )}</p>
        <p class="result-meta">${escapeHtml(
          [
            `Mode: ${modeLabel}`,
            item.intent ? `Intent: ${item.intent}` : '',
            item.actualIntent && item.actualIntent !== item.intent ? `Faktisk intent: ${item.actualIntent}` : '',
            item.dominantRisk ? `Risk: ${item.dominantRisk}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        )}</p>
        <p class="result-meta">${escapeHtml(formatShadowCaseMeta(item))}</p>
        ${
          normalizeText(item.conversationId)
            ? `<p class="result-links"><a href="${escapeHtml(
                buildCcoNextConversationHref(item.conversationId)
              )}" target="_blank" rel="noreferrer">Öppna i CCO Next</a></p>`
            : ''
        }
      </article>`;
    })
    .join('');
}

function buildShadowIssueCards(items = [], type = 'case') {
  const rows = asArray(items).slice(0, 16);
  if (rows.length === 0) {
    return '<p class="readout-empty">Ingen träff i den här kategorin.</p>';
  }
  if (type === 'merge') {
    return rows
      .map(
        (item) => `<article class="result-card">
          <div class="result-head">
            <span class="result-type">Merge-suspekt</span>
            <span class="result-time">${escapeHtml(String(item.count || 0))} trådar</span>
          </div>
          <h4>${escapeHtml(normalizeText(item.subject) || '(utan ämne)')}</h4>
          <p class="result-summary">${escapeHtml(
            `Kund: ${normalizeText(item.customerEmail) || 'okänd'} · Mailboxar: ${asArray(item.mailboxIds).join(', ')}`
          )}</p>
          <p class="result-meta">${escapeHtml(asArray(item.conversationIds).join(' · '))}</p>
        </article>`
      )
      .join('');
  }
  return rows
    .map(
      (item) => `<article class="result-card">
        <div class="result-head">
          <span class="result-type">Suspekt</span>
          <span class="result-time">${escapeHtml(formatReadoutDateTimeSv(item.generatedAt || item.customerRepliedAt || item.followUpSuggestedAt))}</span>
        </div>
        <h4>${escapeHtml(normalizeText(item.subject) || '(utan ämne)')}</h4>
        <p class="result-summary">${escapeHtml(
          [
            normalizeText(item.recommendedAction) ? `CCO: ${item.recommendedAction}` : '',
            item.operatorActionType ? `Operatör: ${toHistoryActionLabelSv(item.operatorActionType)}` : '',
            item.outcomeCode ? `Utfall: ${toHistoryOutcomeLabelSv(item.outcomeCode)}` : '',
            item.actualIntent && item.actualIntent !== item.intent ? `Faktisk intent: ${item.actualIntent}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        )}</p>
        <p class="result-meta">${escapeHtml(formatShadowCaseMeta(item))}</p>
        ${
          normalizeText(item.conversationId)
            ? `<p class="result-links"><a href="${escapeHtml(
                buildCcoNextConversationHref(item.conversationId)
              )}" target="_blank" rel="noreferrer">Öppna i CCO Next</a></p>`
            : ''
        }
      </article>`
    )
    .join('');
}

function buildShadowReadoutDocument({
  mailboxIds = [],
  lookbackDays = 14,
  intent = null,
  limit = 24,
  summary = {},
  window = {},
  latestRunEntry = null,
  latestReviewEntry = null,
} = {}) {
  const mailboxValue = asArray(mailboxIds).join(',');
  const bestAction = normalizeText(summary?.best?.action?.label) || '–';
  const bestMode = normalizeText(summary?.best?.mode?.label) || '–';
  const worstAction = normalizeText(summary?.worst?.action?.label) || '–';
  const worstMode = normalizeText(summary?.worst?.mode?.label) || '–';
  const totals = asObject(summary?.totals);
  const suspectCounts = asObject(summary?.suspectCounts);
  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CCO shadow-run readout</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; padding: 32px; font-family: Arial, sans-serif; background: #f6f2ec; color: #2f2f33; }
      .page { max-width: 1360px; margin: 0 auto; }
      h1 { margin: 0 0 8px; font-size: 30px; }
      .lead { margin: 0 0 24px; color: rgba(70,60,50,.72); }
      .panel { background: rgba(255,252,248,.92); border: 1px solid rgba(120,105,90,.16); border-radius: 20px; box-shadow: 0 8px 24px rgba(70,50,30,.08), 0 2px 6px rgba(70,50,30,.05), inset 0 1px 0 rgba(255,255,255,.55); padding: 24px; margin-bottom: 24px; }
      .filters { display: grid; grid-template-columns: 1.2fr .8fr .8fr .8fr auto; gap: 12px; align-items: end; }
      .filters label { display: block; font-size: 13px; color: rgba(70,60,50,.72); margin-bottom: 6px; }
      .filters input, .filters select { width: 100%; border: 1px solid rgba(120,105,90,.16); border-radius: 14px; padding: 11px 12px; font-size: 14px; background: rgba(255,255,255,.82); }
      .filters button { border: 0; border-radius: 14px; padding: 12px 16px; background: linear-gradient(180deg, rgba(34,108,74,.94), rgba(18,88,58,.98)); color: #fff; font-weight: 700; cursor: pointer; }
      .meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; color: rgba(70,60,50,.72); font-size: 13px; }
      .meta-chip { border: 1px solid rgba(120,105,90,.16); border-radius: 999px; padding: 7px 12px; background: rgba(255,255,255,.72); }
      .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
      .kpi { padding: 16px; border-radius: 16px; background: rgba(255,255,255,.82); border: 1px solid rgba(120,105,90,.12); }
      .kpi-label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: rgba(70,60,50,.62); margin-bottom: 8px; }
      .kpi-value { font-size: 28px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .list-card, .result-card { padding: 16px; border-radius: 16px; background: rgba(255,255,255,.82); border: 1px solid rgba(120,105,90,.12); }
      .list-card h3, .result-card h4 { margin: 0 0 12px; font-size: 16px; }
      .list-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
      .list-card li { display: grid; gap: 4px; }
      .list-card li span { color: rgba(70,60,50,.72); font-size: 13px; }
      .result-grid { display: grid; gap: 12px; }
      .result-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: rgba(70,60,50,.62); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .06em; }
      .result-summary { margin: 0 0 8px; font-size: 14px; line-height: 1.45; }
      .result-meta { margin: 0; color: rgba(70,60,50,.62); font-size: 12px; }
      .result-links { margin: 10px 0 0; }
      .result-links a { color: #2a5bd7; text-decoration: none; font-size: 13px; font-weight: 600; }
      .readout-empty { color: rgba(70,60,50,.62); }
      @media (max-width: 1100px) {
        body { padding: 20px; }
        .filters, .kpis, .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>CCO shadow-run readout</h1>
      <p class="lead">Daglig kalibreringsgranskning för kons-trafik. Här jämförs vad CCO föreslog, vad som faktiskt gjordes och vilket utfall det gav.</p>

      <section class="panel">
        <form method="get" action="/api/v1/cco/runtime/shadow/readout" class="filters">
          <div>
            <label for="mailboxIds">Mailboxar</label>
            <input id="mailboxIds" name="mailboxIds" value="${escapeHtml(mailboxValue)}" />
          </div>
          <div>
            <label for="lookbackDays">Lookback</label>
            <select id="lookbackDays" name="lookbackDays">
              ${[7, 14, 30, 90]
                .map(
                  (days) =>
                    `<option value="${days}"${Number(days) === Number(lookbackDays) ? ' selected' : ''}>${days} dagar</option>`
                )
                .join('')}
            </select>
          </div>
          <div>
            <label for="intent">Intent</label>
            <input id="intent" name="intent" value="${escapeHtml(normalizeText(intent))}" placeholder="reschedule" />
          </div>
          <div>
            <label for="limit">Antal case</label>
            <input id="limit" name="limit" value="${escapeHtml(String(limit))}" />
          </div>
          <button type="submit">Uppdatera</button>
        </form>

        <div class="meta">
          <span class="meta-chip">Senaste shadow-run: ${escapeHtml(formatReadoutDateTimeSv(latestRunEntry?.ts))}</span>
          <span class="meta-chip">Senaste daily review: ${escapeHtml(formatReadoutDateTimeSv(latestReviewEntry?.ts))}</span>
          <span class="meta-chip">Fönster: ${escapeHtml(formatReadoutDateTimeSv(window?.startIso))} → ${escapeHtml(formatReadoutDateTimeSv(window?.endIso))}</span>
        </div>

        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Shadow-cases</div><div class="kpi-value">${escapeHtml(String(totals.recommendationCount || 0))}</div></div>
          <div class="kpi"><div class="kpi-label">Positiva utfall</div><div class="kpi-value">${escapeHtml(String(totals.positiveCount || 0))}</div></div>
          <div class="kpi"><div class="kpi-label">Negativa utfall</div><div class="kpi-value">${escapeHtml(String(totals.negativeCount || 0))}</div></div>
          <div class="kpi"><div class="kpi-label">Överstyrda modes</div><div class="kpi-value">${escapeHtml(String(totals.modeOverrideCount || 0))}</div></div>
        </div>
      </section>

      <div class="grid">
        <section class="panel">
          <div class="grid">
            <div class="list-card">
              <h3>Det som fungerar bäst</h3>
              <ul>
                <li><strong>${escapeHtml(bestAction)}</strong><span>Bästa rekommenderade action just nu.</span></li>
                <li><strong>${escapeHtml(bestMode)}</strong><span>Bästa draft mode just nu.</span></li>
              </ul>
            </div>
            <div class="list-card">
              <h3>Det som fungerar sämst</h3>
              <ul>
                <li><strong>${escapeHtml(worstAction)}</strong><span>Svagaste action i shadow-run-fönstret.</span></li>
                <li><strong>${escapeHtml(worstMode)}</strong><span>Svagaste mode i shadow-run-fönstret.</span></li>
              </ul>
            </div>
            <div class="list-card">
              <h3>Actions</h3>
              <ul>${formatShadowStatList(summary?.summaries?.actionSummary)}</ul>
            </div>
            <div class="list-card">
              <h3>Modes</h3>
              <ul>${formatShadowStatList(summary?.summaries?.modeSummary)}</ul>
            </div>
            <div class="list-card">
              <h3>Bästa/sämsta action per intent</h3>
              <ul>${formatShadowIntentBreakdown(summary?.summaries?.actionSummaryByIntent, 'action')}</ul>
            </div>
            <div class="list-card">
              <h3>Bästa/sämsta mode per intent</h3>
              <ul>${formatShadowIntentBreakdown(summary?.summaries?.modeSummaryByIntent, 'mode')}</ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="grid">
            <div class="list-card">
              <h3>Suspekter</h3>
              <ul>
                <li><strong>${escapeHtml(String(suspectCounts.intentMismatch || 0))}</strong><span>Intent mismatch</span></li>
                <li><strong>${escapeHtml(String(suspectCounts.missedReopen || 0))}</strong><span>Missad reopen</span></li>
                <li><strong>${escapeHtml(String(suspectCounts.missedFollowUp || 0))}</strong><span>Missad follow-up</span></li>
                <li><strong>${escapeHtml(String(suspectCounts.mergeDuplicate || 0))}</strong><span>Merge/dubblett</span></li>
              </ul>
            </div>
            <div class="list-card">
              <h3>Intent</h3>
              <ul>${formatShadowStatList(summary?.summaries?.intentSummary)}</ul>
            </div>
            <div class="list-card">
              <h3>Failure patterns</h3>
              <ul>${formatShadowFailurePatterns(summary?.summaries?.failurePatternSummary)}</ul>
            </div>
          </div>
        </section>
      </div>

      <section class="panel">
        <h3>Mailboxjämförelse</h3>
        <div class="result-grid">${buildShadowMailboxCards(summary?.summaries?.mailboxSummary)}</div>
      </section>

      <section class="panel">
        <h3>Jämför vad CCO föreslog mot vad som faktiskt hände</h3>
        <div class="result-grid">${buildShadowComparisonCards(summary?.comparisons)}</div>
      </section>

      <div class="grid">
        <section class="panel">
          <h3>Suspekt intent mismatch</h3>
          <div class="result-grid">${buildShadowIssueCards(summary?.suspectCases?.intentMismatch)}</div>
        </section>
        <section class="panel">
          <h3>Suspekt missad reopen</h3>
          <div class="result-grid">${buildShadowIssueCards(summary?.suspectCases?.missedReopen)}</div>
        </section>
      </div>

      <div class="grid">
        <section class="panel">
          <h3>Suspekt missad follow-up</h3>
          <div class="result-grid">${buildShadowIssueCards(summary?.suspectCases?.missedFollowUp)}</div>
        </section>
        <section class="panel">
          <h3>Merge/dubblett-suspekter</h3>
          <div class="result-grid">${buildShadowIssueCards(summary?.suspectCases?.mergeDuplicate, 'merge')}</div>
        </section>
      </div>
    </div>
  </body>
</html>`;
}

function toCcoRuntimeShadowStatusHandler({
  scheduler = null,
  capabilityAnalysisStore = null,
  mailboxIds = [],
  runLookbackDays = 14,
  reviewLookbackDays = 14,
}) {
  return async (req, res) => {
    const tenantId = toTenantId(req);
    const schedulerStatus =
      scheduler && typeof scheduler.getStatus === 'function' ? scheduler.getStatus() : null;
    const jobs = asArray(schedulerStatus?.jobs);
    const shadowRunJob = jobs.find((job) => normalizeText(job?.id) === 'cco_shadow_run') || null;
    const shadowReviewJob =
      jobs.find((job) => normalizeText(job?.id) === 'cco_shadow_review') || null;
    const [latestRunEntry, latestReviewEntry] = await Promise.all([
      listCapabilityEntriesByName({
        capabilityAnalysisStore,
        tenantId,
        capabilityName: 'CCO.ShadowRun',
        limit: 1,
      }).then((entries) => asArray(entries)[0] || null),
      listCapabilityEntriesByName({
        capabilityAnalysisStore,
        tenantId,
        capabilityName: 'CCO.ShadowReview',
        limit: 1,
      }).then((entries) => asArray(entries)[0] || null),
    ]);
    return res.json({
      ok: true,
      mailboxIds: asArray(mailboxIds),
      runLookbackDays: Number(runLookbackDays || 14),
      reviewLookbackDays: Number(reviewLookbackDays || 14),
      shadowRunJob,
      shadowReviewJob,
      latestRunEntry: latestRunEntry
        ? {
            id: latestRunEntry.id,
            ts: latestRunEntry.ts,
            metadata: latestRunEntry.metadata || {},
          }
        : null,
      latestReviewEntry: latestReviewEntry
        ? {
            id: latestReviewEntry.id,
            ts: latestReviewEntry.ts,
            metadata: latestReviewEntry.metadata || {},
          }
        : null,
    });
  };
}

function toCcoRuntimeShadowSummaryHandler({
  capabilityAnalysisStore = null,
  ccoHistoryStore = null,
}) {
  return async (req, res) => {
    try {
      const tenantId = toTenantId(req);
      const query = toCcoRuntimeShadowQuery(req.query);
      const context = await buildShadowReviewContext({
        tenantId,
        capabilityAnalysisStore,
        ccoHistoryStore,
        mailboxIds: query.mailboxIds,
        lookbackDays: query.lookbackDays,
        intent: query.intent,
        limit: query.limit,
        sinceIso: query.sinceIso,
        untilIso: query.untilIso,
      });
      return res.json({
        ok: true,
        mailboxId: query.mailboxId,
        mailboxIds: query.mailboxIds,
        lookbackDays: query.lookbackDays,
        intent: query.intent,
        limit: query.limit,
        window: context.window,
        summary: context.summary,
        latestRunEntry: context.latestRunEntry
          ? { id: context.latestRunEntry.id, ts: context.latestRunEntry.ts }
          : null,
        latestReviewEntry: context.latestReviewEntry
          ? { id: context.latestReviewEntry.id, ts: context.latestReviewEntry.ts }
          : null,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Shadow-summary kunde inte byggas.',
      });
    }
  };
}

function toCcoRuntimeShadowReadoutHandler({
  capabilityAnalysisStore = null,
  ccoHistoryStore = null,
}) {
  return async (req, res) => {
    try {
      const tenantId = toTenantId(req);
      const query = toCcoRuntimeShadowQuery(req.query);
      const context = await buildShadowReviewContext({
        tenantId,
        capabilityAnalysisStore,
        ccoHistoryStore,
        mailboxIds: query.mailboxIds,
        lookbackDays: query.lookbackDays,
        intent: query.intent,
        limit: query.limit,
        sinceIso: query.sinceIso,
        untilIso: query.untilIso,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(
        buildShadowReadoutDocument({
          mailboxIds: query.mailboxIds,
          lookbackDays: query.lookbackDays,
          intent: query.intent,
          limit: query.limit,
          summary: context.summary,
          window: context.window,
          latestRunEntry: context.latestRunEntry,
          latestReviewEntry: context.latestReviewEntry,
        })
      );
    } catch (error) {
      return res
        .status(500)
        .send(escapeHtml(error?.message || 'Shadow-readout kunde inte byggas.'));
    }
  };
}

function toCcoRuntimeWorklistShadowHandler({
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
}) {
  return async (req, res) => {
    try {
      const tenantId = toTenantId(req);
      const query = toCcoRuntimeWorklistShadowQuery(req.query);
      const context = await buildWorklistShadowContext({
        tenantId,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        ccoCustomerStore,
        mailboxIds: query.mailboxIds,
        limit: query.limit,
      });
      if (!context.diffReport) {
        return res.status(503).json({
          ok: false,
          error: 'Mailbox truth shadow-adapter är inte tillgänglig.',
        });
      }
      return res.json({
        ok: true,
        mailboxId: query.mailboxId,
        mailboxIds: query.mailboxIds,
        limit: query.limit,
        latestAnalysisEntry: context.latestEntry
          ? {
              id: context.latestEntry.id,
              ts: context.latestEntry.ts,
              generatedAt: normalizeText(context.latestOutputData?.generatedAt) || null,
            }
          : null,
        latestObservedAnalysisEntry: context.latestObservedEntry
          ? {
              id: context.latestObservedEntry.id,
              ts: context.latestObservedEntry.ts,
              generatedAt: normalizeText(
                buildWorklistLegacyBaselineEntrySummary(context.latestObservedEntry).outputData
                  ?.generatedAt
              ) || null,
            }
          : null,
        legacyBaselineSelection: context.baselineSelection,
        truthCoverage: context.truthCoverage,
        deltaCoverage: context.deltaCoverage,
        aggregate: context.diffReport.aggregate,
        dimensionAssessment: context.diffReport.dimensionAssessment,
        acceptanceGate: context.diffReport.acceptanceGate,
        conversationDiffs: context.diffReport.conversationDiffs,
        metadata: context.diffReport.metadata,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Worklist-shadow kunde inte byggas.',
      });
    }
  };
}

function toCcoRuntimeWorklistTruthHandler({
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
}) {
  return async (req, res) => {
    try {
      const tenantId = toTenantId(req);
      const query = toCcoRuntimeWorklistShadowQuery(req.query);
      const context = await buildWorklistTruthContext({
        tenantId,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        ccoCustomerStore,
        mailboxIds: query.mailboxIds,
        limit: query.limit,
      });
      if (!context.readModel) {
        return res.status(503).json({
          ok: false,
          error: 'Mailbox truth worklist-read-model är inte tillgänglig.',
        });
      }

      return res.json({
        ok: true,
        source: context.readModel.source,
        modelVersion: context.readModel.modelVersion,
        mailboxId: query.mailboxId,
        mailboxIds: query.mailboxIds,
        limit: query.limit,
        parityScope: context.readModel.parityScope,
        metadata: context.readModel.metadata,
        summary: context.readModel.summary,
        rows: context.readModel.rows,
        truthCoverage: context.truthCoverage,
        deltaCoverage: context.deltaCoverage,
        shadowGuardrail: context.shadowDiffReport
          ? {
              latestAnalysisEntry: context.latestEntry
                ? {
                    id: context.latestEntry.id,
                    ts: context.latestEntry.ts,
                    generatedAt: normalizeText(context.latestOutputData?.generatedAt) || null,
                  }
                : null,
              latestObservedAnalysisEntry: context.latestObservedEntry
                ? {
                    id: context.latestObservedEntry.id,
                    ts: context.latestObservedEntry.ts,
                    generatedAt: normalizeText(
                      buildWorklistLegacyBaselineEntrySummary(context.latestObservedEntry).outputData
                        ?.generatedAt
                    ) || null,
                  }
                : null,
              legacyBaselineSelection: context.baselineSelection,
              aggregate: context.shadowDiffReport.aggregate,
              dimensionAssessment: context.shadowDiffReport.dimensionAssessment,
              acceptanceGate: context.shadowDiffReport.acceptanceGate,
              metadata: context.shadowDiffReport.metadata,
            }
          : null,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Worklist truth-read-model kunde inte byggas.',
      });
    }
  };
}

function toCcoRuntimeWorklistConsumerHandler({
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
}) {
  return async (req, res) => {
    try {
      const tenantId = toTenantId(req);
      const query = toCcoRuntimeWorklistShadowQuery(req.query);
      const context = await buildWorklistConsumerContext({
        tenantId,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        ccoCustomerStore,
        mailboxIds: query.mailboxIds,
        limit: query.limit,
      });
      if (!context.consumerModel) {
        return res.status(503).json({
          ok: false,
          error: 'Mailbox truth worklist-consumer är inte tillgänglig.',
        });
      }

      return res.json({
        ok: true,
        source: context.consumerModel.source,
        modelVersion: context.consumerModel.modelVersion,
        mailboxId: query.mailboxId,
        mailboxIds: query.mailboxIds,
        limit: query.limit,
        parityScope: context.consumerModel.parityScope,
        metadata: context.consumerModel.metadata,
        summary: context.consumerModel.summary,
        rows: context.consumerModel.rows,
        truthCoverage: context.truthCoverage,
        deltaCoverage: context.deltaCoverage,
        consumerExposure: {
          mode: 'limited',
          legacyUiDriving: true,
          cutoverState: 'not_allowed',
          shadowGuardrail: 'required',
        },
        readiness: {
          canStartLimitedConsumerExposure:
            context.shadowDiffReport?.acceptanceGate?.canConsiderCutover === true,
          canConsiderCutover: false,
          blockers: asArray(context.shadowDiffReport?.acceptanceGate?.blockers),
        },
        parityBaseline: context.parityBaseline,
        shadowGuardrail: context.shadowDiffReport
          ? {
              latestAnalysisEntry: context.latestEntry
                ? {
                    id: context.latestEntry.id,
                    ts: context.latestEntry.ts,
                    generatedAt: normalizeText(context.latestOutputData?.generatedAt) || null,
                  }
                : null,
              latestObservedAnalysisEntry: context.latestObservedEntry
                ? {
                    id: context.latestObservedEntry.id,
                    ts: context.latestObservedEntry.ts,
                    generatedAt: normalizeText(
                      buildWorklistLegacyBaselineEntrySummary(context.latestObservedEntry).outputData
                        ?.generatedAt
                    ) || null,
                  }
                : null,
              legacyBaselineSelection: context.baselineSelection,
              aggregate: context.shadowDiffReport.aggregate,
              mailboxAssessment: context.shadowDiffReport.mailboxAssessment,
              dimensionAssessment: context.shadowDiffReport.dimensionAssessment,
              acceptanceGate: context.shadowDiffReport.acceptanceGate,
              metadata: context.shadowDiffReport.metadata,
            }
          : null,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Worklist consumer kunde inte byggas.',
      });
    }
  };
}

function toCcoRuntimeWorklistConsumerReadoutHandler({
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
}) {
  return async (req, res) => {
    try {
      const tenantId = toTenantId(req);
      const query = toCcoRuntimeWorklistShadowQuery(req.query);
      const context = await buildWorklistConsumerContext({
        tenantId,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        ccoCustomerStore,
        mailboxIds: query.mailboxIds,
        limit: query.limit,
      });
      if (!context.consumerModel) {
        return res
          .status(503)
          .send(escapeHtml('Worklist consumer-preview kunde inte byggas.'));
      }
      return res.send(
        buildWorklistConsumerReadoutDocument({
          mailboxIds: query.mailboxIds,
          limit: query.limit,
          consumerModel: context.consumerModel,
          parityBaseline: context.parityBaseline,
          shadowDiffReport: context.shadowDiffReport,
          latestEntry: context.latestEntry,
          latestOutputData: context.latestOutputData,
        })
      );
    } catch (error) {
      return res
        .status(500)
        .send(escapeHtml(error?.message || 'Worklist consumer-preview kunde inte byggas.'));
    }
  };
}

function toCcoRuntimeHistorySearchHandler({
  ccoHistoryStore = null,
  ccoMailboxTruthStore = null,
}) {
  return async (req, res) => {
    try {
      const parsedQuery = toCcoRuntimeHistorySearchQuery(req.query);
      const resultTypes = new Set(
        asArray(parsedQuery.resultTypes)
          .map((item) => normalizeText(item).toLowerCase())
          .filter(Boolean)
      );
      const explicitMessageOnlyResultType =
        resultTypes.size === 1 && resultTypes.has('message');
      const implicitMessageOnlyFlags =
        resultTypes.size === 0 &&
        parsedQuery.includeMessages === true &&
        parsedQuery.includeActions !== true &&
        parsedQuery.includeOutcomes !== true;
      const messageOnlySearch =
        (explicitMessageOnlyResultType || implicitMessageOnlyFlags) &&
        asArray(parsedQuery.actionTypes).length === 0 &&
        asArray(parsedQuery.outcomeCodes).length === 0;
      const mailboxTruthHistory =
        messageOnlySearch && ccoMailboxTruthStore
          ? createCcoMailboxTruthReadAdapter({ store: ccoMailboxTruthStore })
          : null;
      if (mailboxTruthHistory) {
        const { startIso, endIso } = resolveCcoRuntimeWindowBounds({
          lookbackDays: parsedQuery.lookbackDays,
          sinceIso: parsedQuery.sinceIso,
          untilIso: parsedQuery.untilIso,
        });
        const results = mailboxTruthHistory.searchHistoryMessages({
          mailboxIds: parsedQuery.mailboxIds,
          customerEmail: parsedQuery.customerEmail,
          conversationId: parsedQuery.conversationId,
          q: parsedQuery.q,
          sinceIso: startIso,
          untilIso: endIso,
          limit: parsedQuery.limit,
        });
        return res.json({
          ok: true,
          mailboxId: parsedQuery.mailboxId,
          mailboxIds: parsedQuery.mailboxIds,
          customerEmail: parsedQuery.customerEmail,
          conversationId: parsedQuery.conversationId,
          lookbackDays: parsedQuery.lookbackDays,
          q: parsedQuery.q,
          intent: parsedQuery.intent,
          resultTypes: ['message'],
          actionTypes: [],
          outcomeCodes: [],
          source: 'mailbox_truth_store',
          window: {
            startIso,
            endIso,
          },
          resultCount: results.length,
          results,
        });
      }

      if (!ccoHistoryStore || typeof ccoHistoryStore.searchHistoryRecords !== 'function') {
        return res.status(503).json({
          ok: false,
          error: 'Historiksök är inte tillgänglig just nu.',
        });
      }
      const tenantId = toTenantId(req);
      const { startIso, endIso } = resolveCcoRuntimeWindowBounds({
        lookbackDays: parsedQuery.lookbackDays,
        sinceIso: parsedQuery.sinceIso,
        untilIso: parsedQuery.untilIso,
      });
      const results = await ccoHistoryStore.searchHistoryRecords({
        tenantId,
        mailboxIds: parsedQuery.mailboxIds,
        customerEmail: parsedQuery.customerEmail,
        conversationId: parsedQuery.conversationId,
        queryText: parsedQuery.q,
        sinceIso: startIso,
        untilIso: endIso,
        limit: parsedQuery.limit,
        includeMessages: parsedQuery.includeMessages,
        includeOutcomes: parsedQuery.includeOutcomes,
        includeActions: parsedQuery.includeActions,
        intent: parsedQuery.intent,
        resultTypes: parsedQuery.resultTypes,
        actionTypes: parsedQuery.actionTypes,
        outcomeCodes: parsedQuery.outcomeCodes,
      });
      return res.json({
        ok: true,
        mailboxId: parsedQuery.mailboxId,
        mailboxIds: parsedQuery.mailboxIds,
        customerEmail: parsedQuery.customerEmail,
        conversationId: parsedQuery.conversationId,
        lookbackDays: parsedQuery.lookbackDays,
        q: parsedQuery.q,
        intent: parsedQuery.intent,
        resultTypes: parsedQuery.resultTypes,
        actionTypes: parsedQuery.actionTypes,
        outcomeCodes: parsedQuery.outcomeCodes,
        window: {
          startIso,
          endIso,
        },
        resultCount: results.length,
        results,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Historiksök kunde inte köras.',
      });
    }
  };
}

function toCcoRuntimeCalibrationReadoutHandler({
  ccoHistoryStore = null,
}) {
  return async (req, res) => {
    try {
      if (!ccoHistoryStore || typeof ccoHistoryStore.summarizeOutcomeEvaluations !== 'function') {
        return res.status(503).send('Kalibreringsstore är inte tillgänglig just nu.');
      }
      const searchQuery = toCcoRuntimeHistorySearchQuery(req.query);
      const calibrationQuery = toCcoRuntimeCalibrationSummaryQuery(req.query);
      const tenantId = toTenantId(req);
      const { startIso, endIso } = resolveCcoRuntimeWindowBounds({
        lookbackDays: calibrationQuery.lookbackDays,
        sinceIso: searchQuery.sinceIso || calibrationQuery.sinceIso,
        untilIso: searchQuery.untilIso || calibrationQuery.untilIso,
      });
      const summary = await ccoHistoryStore.summarizeOutcomeEvaluations({
        tenantId,
        customerEmail: calibrationQuery.customerEmail,
        mailboxIds: calibrationQuery.mailboxIds,
        sinceIso: startIso,
        untilIso: endIso,
        intent: calibrationQuery.intent,
      });
      const mailboxSummaries = [];
      for (const mailboxId of calibrationQuery.mailboxIds) {
        mailboxSummaries.push({
          mailboxId,
          summary: await ccoHistoryStore.summarizeOutcomeEvaluations({
            tenantId,
            customerEmail: calibrationQuery.customerEmail,
            mailboxIds: [mailboxId],
            sinceIso: startIso,
            untilIso: endIso,
            intent: calibrationQuery.intent,
          }),
        });
      }
      const searchResults =
        typeof ccoHistoryStore.searchHistoryRecords === 'function'
          ? await ccoHistoryStore.searchHistoryRecords({
              tenantId,
              mailboxIds: searchQuery.mailboxIds,
              customerEmail: searchQuery.customerEmail,
              conversationId: searchQuery.conversationId,
              queryText: searchQuery.q,
              sinceIso: startIso,
              untilIso: endIso,
              limit: 24,
              intent: searchQuery.intent,
              resultTypes: searchQuery.resultTypes,
              actionTypes: searchQuery.actionTypes,
              outcomeCodes: searchQuery.outcomeCodes,
            })
          : [];
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(
        buildCalibrationReadoutDocument({
          mailboxIds: calibrationQuery.mailboxIds,
          customerEmail: calibrationQuery.customerEmail,
          conversationId: searchQuery.conversationId,
          lookbackDays: calibrationQuery.lookbackDays,
          q: searchQuery.q,
          intent: searchQuery.intent || calibrationQuery.intent,
          resultTypes: searchQuery.resultTypes,
          actionTypes: searchQuery.actionTypes,
          outcomeCodes: searchQuery.outcomeCodes,
          sinceIso: searchQuery.sinceIso,
          untilIso: searchQuery.untilIso,
          summary,
          mailboxSummaries,
          searchResults,
        })
      );
    } catch (error) {
      return res.status(500).send(escapeHtml(error?.message || 'Kalibreringsreadout kunde inte byggas.'));
    }
  };
}

function createCapabilitiesRouter({
  authStore,
  tenantConfigStore,
  ccoSettingsStore = null,
  requireAuth,
  requireRole,
  executionGateway = null,
  capabilityAnalysisStore = null,
  ccoHistoryStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  templateStore = null,
  scheduler = null,
  graphReadConnector = null,
  graphReadConnectorFactory = createMicrosoftGraphReadConnector,
  graphSendConnector = null,
  graphSendConnectorFactory = createMicrosoftGraphSendConnector,
}) {
  const router = express.Router();
  const gateway =
    executionGateway ||
    createExecutionGateway({
      buildVersion: process.env.npm_package_version || 'dev',
    });
  const shouldEnableGraphRead = toBoolean(process.env.ARCANA_GRAPH_READ_ENABLED, false);
  const graphReadAllowlistConfig = resolveGraphReadAllowlistConfig(500);
  const graphReadAllowlist = graphReadAllowlistConfig.mailboxIds;
  const graphReadAllowlistMode = graphReadAllowlist.length > 0;
  const graphReadForceFullTenantAllowlist =
    graphReadAllowlistMode &&
    (graphReadAllowlistConfig.source === 'locked_default' || graphReadAllowlist.length > 1);
  const graphReadFullTenant = graphReadForceFullTenantAllowlist
    ? true
    : toBoolean(process.env.ARCANA_GRAPH_FULL_TENANT, false);
  const graphReadUserScope = graphReadForceFullTenantAllowlist
    ? 'all'
    : normalizeGraphUserScope(
        process.env.ARCANA_GRAPH_USER_SCOPE,
        graphReadFullTenant ? 'all' : 'single'
      );
  const graphReadRequiresUserId = !(graphReadFullTenant && graphReadUserScope === 'all');
  const shouldEnableGraphSend = toBoolean(process.env.ARCANA_GRAPH_SEND_ENABLED, false);
  const shouldEnableGraphDelete = toBoolean(process.env.ARCANA_CCO_DELETE_ENABLED, false);
  const graphSendAllowlist = normalizeText(process.env.ARCANA_GRAPH_SEND_ALLOWLIST);
  const graphDeleteAllowlist = normalizeText(
    process.env.ARCANA_CCO_DELETE_ALLOWLIST || graphSendAllowlist
  );
  const resolvedGraphReadConnector = (() => {
    if (
      graphReadConnector &&
      (typeof graphReadConnector.fetchInboxSnapshot === 'function' ||
        typeof graphReadConnector.fetchMailboxTruthFolderPage === 'function')
    ) {
      return graphReadConnector;
    }
    if (!shouldEnableGraphRead) return null;
    const tenantId = normalizeText(process.env.ARCANA_GRAPH_TENANT_ID);
    const clientId = normalizeText(process.env.ARCANA_GRAPH_CLIENT_ID);
    const clientSecret = normalizeText(process.env.ARCANA_GRAPH_CLIENT_SECRET);
    const userId = normalizeText(process.env.ARCANA_GRAPH_USER_ID);
    const missing = [];
    if (!tenantId) missing.push('ARCANA_GRAPH_TENANT_ID');
    if (!clientId) missing.push('ARCANA_GRAPH_CLIENT_ID');
    if (!clientSecret) missing.push('ARCANA_GRAPH_CLIENT_SECRET');
    if (graphReadRequiresUserId && !userId) missing.push('ARCANA_GRAPH_USER_ID');
    if (missing.length > 0) {
      throw new Error(
        `ARCANA_GRAPH_READ_ENABLED=true requires: ${missing.join(', ')}.`
      );
    }
    return graphReadConnectorFactory({
      tenantId,
      clientId,
      clientSecret,
      userId,
      fullTenant: graphReadFullTenant,
      userScope: graphReadUserScope,
      authorityHost: normalizeText(process.env.ARCANA_GRAPH_AUTHORITY_HOST) || undefined,
      graphBaseUrl: normalizeText(process.env.ARCANA_GRAPH_BASE_URL) || undefined,
      scope: normalizeText(process.env.ARCANA_GRAPH_SCOPE) || undefined,
    });
  })();
  const resolvedGraphSendConnector = (() => {
    if (
      graphSendConnector &&
      (typeof graphSendConnector.sendComposeDocument === 'function' ||
        typeof graphSendConnector.sendReply === 'function' ||
        typeof graphSendConnector.sendNewMessage === 'function')
    ) {
      return graphSendConnector;
    }
    if (!shouldEnableGraphSend && !shouldEnableGraphDelete) return null;
    const tenantId = normalizeText(process.env.ARCANA_GRAPH_TENANT_ID);
    const clientId = normalizeText(process.env.ARCANA_GRAPH_CLIENT_ID);
    const clientSecret = normalizeText(process.env.ARCANA_GRAPH_CLIENT_SECRET);
    const missing = [];
    if (!tenantId) missing.push('ARCANA_GRAPH_TENANT_ID');
    if (!clientId) missing.push('ARCANA_GRAPH_CLIENT_ID');
    if (!clientSecret) missing.push('ARCANA_GRAPH_CLIENT_SECRET');
    if (shouldEnableGraphSend && !graphSendAllowlist) {
      missing.push('ARCANA_GRAPH_SEND_ALLOWLIST');
    }
    if (shouldEnableGraphDelete && !graphDeleteAllowlist) {
      missing.push('ARCANA_CCO_DELETE_ALLOWLIST|ARCANA_GRAPH_SEND_ALLOWLIST');
    }
    if (missing.length > 0) {
      throw new Error(
        `ARCANA_GRAPH_SEND_ENABLED=true requires: ${missing.join(', ')}.`
      );
    }
    return graphSendConnectorFactory({
      tenantId,
      clientId,
      clientSecret,
      authorityHost: normalizeText(process.env.ARCANA_GRAPH_AUTHORITY_HOST) || undefined,
      graphBaseUrl: normalizeText(process.env.ARCANA_GRAPH_BASE_URL) || undefined,
      scope: normalizeText(process.env.ARCANA_GRAPH_SCOPE) || undefined,
      requestTimeoutMs: clampInteger(
        process.env.ARCANA_GRAPH_SEND_TIMEOUT_MS,
        1000,
        60000,
        8000
      ),
    });
  })();
  const isGraphReadOperational =
    shouldEnableGraphRead ||
    (!!resolvedGraphReadConnector &&
      (typeof resolvedGraphReadConnector.fetchInboxSnapshot === 'function' ||
        typeof resolvedGraphReadConnector.fetchMailboxTruthFolderPage === 'function'));
  const executor = createCapabilityExecutor({
    executionGateway: gateway,
    authStore,
    tenantConfigStore,
    capabilityAnalysisStore,
    ccoSettingsStore,
    buildVersion: process.env.npm_package_version || 'dev',
  });

  router.get(
    '/capabilities/meta',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toMetaHandler({ executor }))
  );

  router.get(
    '/agents/meta',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toMetaHandler({ executor }))
  );

  router.get(
    '/capabilities/analysis',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toAnalysisHandler({ capabilityAnalysisStore }))
  );

  router.get(
    '/agents/analysis',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toAnalysisHandler({ capabilityAnalysisStore }))
  );

  router.post(
    '/capabilities/:capabilityName/run',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCapabilityRunHandler({
        executor,
        templateStore,
        graphReadConnector: resolvedGraphReadConnector,
        capabilityAnalysisStore,
        ccoHistoryStore,
        authStore,
      })
    )
  );

  router.post(
    '/cco/sprint/event',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toCcoSprintEventHandler({ authStore }))
  );

  router.post(
    '/cco/usage/event',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toCcoUsageEventHandler({ authStore, ccoHistoryStore }))
  );

  router.get(
    '/cco/metrics',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoMetricsHandler({ authStore, capabilityAnalysisStore })
    )
  );

  router.get(
    '/cco/runtime/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeStatusHandler({
        authStore,
        capabilityAnalysisStore,
        ccoSettingsStore,
        graphReadEnabled: isGraphReadOperational,
        graphSendEnabled: shouldEnableGraphSend,
        graphDeleteEnabled: shouldEnableGraphDelete,
        graphReadConnectorAvailable:
          !!resolvedGraphReadConnector &&
          typeof resolvedGraphReadConnector.fetchInboxSnapshot === 'function',
        graphSendConnectorAvailable:
          !!resolvedGraphSendConnector &&
          (typeof resolvedGraphSendConnector.sendComposeDocument === 'function' ||
            typeof resolvedGraphSendConnector.sendReply === 'function' ||
            typeof resolvedGraphSendConnector.sendNewMessage === 'function'),
      })
    )
  );

  router.get(
    '/cco/runtime/history/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeHistoryStatusHandler({
        ccoHistoryStore,
        ccoMailboxTruthStore,
        graphReadEnabled: isGraphReadOperational,
        scheduler,
      })
    )
  );

  router.get(
    '/cco/runtime/shadow/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeShadowStatusHandler({
        scheduler,
        capabilityAnalysisStore,
        mailboxIds: normalizeMailboxIdList(
          parseMailboxIdValues(
            process.env.ARCANA_SCHEDULER_CCO_SHADOW_MAILBOX_IDS || 'kons@hairtpclinic.com',
            50
          ),
          50
        ),
        runLookbackDays: clampInteger(
          process.env.ARCANA_SCHEDULER_CCO_SHADOW_LOOKBACK_DAYS,
          7,
          90,
          14
        ),
        reviewLookbackDays: clampInteger(
          process.env.ARCANA_SCHEDULER_CCO_SHADOW_REVIEW_LOOKBACK_DAYS,
          7,
          90,
          14
        ),
      })
    )
  );

  router.get(
    '/cco/runtime/shadow/summary',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeShadowSummaryHandler({
        capabilityAnalysisStore,
        ccoHistoryStore,
      })
    )
  );

  router.get(
    '/cco/runtime/shadow/readout',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeShadowReadoutHandler({
        capabilityAnalysisStore,
        ccoHistoryStore,
      })
    )
  );

  router.get(
    '/cco/runtime/worklist/truth',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeWorklistTruthHandler({
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        ccoCustomerStore,
      })
    )
  );

  router.get(
    '/cco/runtime/worklist/consumer',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeWorklistConsumerHandler({
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        ccoCustomerStore,
      })
    )
  );

  router.get(
    '/cco/runtime/worklist/consumer/readout',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeWorklistConsumerReadoutHandler({
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        ccoCustomerStore,
      })
    )
  );

  router.get(
    '/cco/runtime/worklist/shadow',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeWorklistShadowHandler({
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        ccoCustomerStore,
      })
    )
  );

  router.get(
    '/cco/runtime/calibration/summary',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeCalibrationSummaryHandler({
        ccoHistoryStore,
      })
    )
  );

  router.get(
    '/cco/runtime/calibration/readout',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeCalibrationReadoutHandler({
        ccoHistoryStore,
      })
    )
  );

  router.get(
    '/cco/runtime/history',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeHistoryHandler({
        graphReadConnector: resolvedGraphReadConnector,
        graphReadEnabled: isGraphReadOperational,
        ccoHistoryStore,
        ccoMailboxTruthStore,
      })
    )
  );

  router.get(
    '/cco/runtime/history/search',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeHistorySearchHandler({
        ccoHistoryStore,
        ccoMailboxTruthStore,
      })
    )
  );

  router.get(
    '/cco/runtime/mail-asset/content',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeMailAssetContentHandler({
        graphReadConnector: resolvedGraphReadConnector,
        graphReadEnabled: isGraphReadOperational,
      })
    )
  );

  router.post(
    '/cco/runtime/history/backfill',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoRuntimeHistoryBackfillHandler({
        graphReadConnector: resolvedGraphReadConnector,
        graphReadEnabled: isGraphReadOperational,
        ccoHistoryStore,
        ccoMailboxTruthStore,
      })
    )
  );

  router.get(
    '/cco/writing-identities',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toWritingIdentitiesReadHandler({ capabilityAnalysisStore })
    )
  );

  router.post(
    '/cco/writing-identities/auto-extract',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toWritingIdentityAutoExtractHandler({ capabilityAnalysisStore, authStore })
    )
  );

  router.put(
    '/cco/writing-identities/:mailbox',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toWritingIdentitySaveHandler({ capabilityAnalysisStore, authStore })
    )
  );

  router.post(
    '/cco/send',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoSendHandler({
        executor,
        graphSendConnector: resolvedGraphSendConnector,
        graphSendEnabled: shouldEnableGraphSend,
        graphSendAllowlist,
      })
    )
  );

  router.get(
    '/cco/signature-preview',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toCcoSignaturePreviewHandler())
  );

  router.post(
    '/cco/delete',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoDeleteHandler({
        graphSendConnector: resolvedGraphSendConnector,
        graphDeleteEnabled: shouldEnableGraphDelete,
        graphDeleteAllowlist,
        authStore,
      })
    )
  );

  router.get(
    '/cco/delete/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoDeleteStatusHandler({
        graphSendConnector: resolvedGraphSendConnector,
        graphDeleteEnabled: shouldEnableGraphDelete,
        graphDeleteAllowlist,
      })
    )
  );

  router.post(
    '/agents/:agentName/run',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toAgentRunHandler({
        executor,
        templateStore,
        graphReadConnector: resolvedGraphReadConnector,
        capabilityAnalysisStore,
        ccoHistoryStore,
        authStore,
      })
    )
  );

  return router;
}

module.exports = {
  createCapabilitiesRouter,
  hydrateAnalyzeInboxInput,
  materializeCustomerReplyActions,
  toGraphReadOptionsFromEnv,
};
