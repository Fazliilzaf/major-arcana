const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { maskInboxText } = require('../privacy/inboxMasking');
const { classifyIntent } = require('../intelligence/intentClassifier');
const { detectTone } = require('../intelligence/toneDetector');
const { resolveWritingIdentityProfile } = require('../intelligence/writingIdentityRegistry');
const {
  computePriorityScore: computeWeightedPriorityScore,
} = require('../intelligence/priorityScoreEngine');
const { composeContextAwareDraft } = require('../intelligence/draftComposer');
const { evaluateSlaMonitor } = require('../intelligence/slaMonitor');
const {
  evaluateLifecycleStatus,
  toLifecycleSortRank,
} = require('../intelligence/lifecycleEngine');
const { evaluateCustomerTemperature } = require('../intelligence/customerTemperatureEngine');
const { evaluateTempoProfile } = require('../intelligence/tempoEngine');
const { suggestFollowUpTiming } = require('../intelligence/timingEngine');
const { estimateConversationWorkload } = require('../intelligence/workloadEngine');
const { evaluateRiskStack } = require('../intelligence/riskStackEngine');
const { composeWeeklyBrief } = require('../intelligence/weeklyBriefComposer');
const { analyzeMonthlyRisk } = require('../intelligence/monthlyRiskAnalyzer');
const { simulateScenarios } = require('../intelligence/scenarioEngine');
const { analyzeBusinessThreats } = require('../intelligence/businessThreatAnalyzer');
const { computeForwardOutlook } = require('../intelligence/forwardOutlookEngine');
const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function toTimestampMs(value) {
  const iso = toIso(value);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function clamp(value, min, max, fallback = min) {
  const numeric = toNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function averageNumber(values = [], fallback = 0, precision = 3) {
  const safeValues = asArray(values)
    .map((value) => toNumber(value, Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!safeValues.length) return toNumber(fallback, 0);
  const factor = 10 ** Math.max(0, toNumber(precision, 3));
  const avg = safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
  return Math.round(avg * factor) / factor;
}

function isValidEmail(value = '') {
  const email = normalizeText(value).toLowerCase();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(value = '') {
  const email = normalizeText(value).toLowerCase();
  return isValidEmail(email) ? email : '';
}

function toDayDiff(fromIso = '', nowMs = Date.now()) {
  const fromMs = toTimestampMs(fromIso);
  if (!Number.isFinite(fromMs)) return null;
  const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  if (safeNowMs < fromMs) return 0;
  return Math.floor((safeNowMs - fromMs) / (24 * 60 * 60 * 1000));
}

function capText(value, maxLength = 240) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function clampTextLength(value, maxLength = 3000) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function normalizeIdentifier(value, maxLength = 120) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  const headLength = Math.max(1, maxLength - digest.length - 1);
  return `${normalized.slice(0, headLength)}:${digest}`.slice(0, maxLength);
}

function normalizeOpaqueId(value) {
  return normalizeText(value);
}

function sanitizeSubject(value) {
  let subject = capText(value, 180);
  if (!subject) subject = '(utan ämne)';
  subject = subject.replace(/\b(diagnos|diagnostiser[a-z]*)\b/gi, '[medicinsk fraga]');
  subject = subject.replace(/\b(garanti|garanterar|100\s*%)\b/gi, '[resultatfraga]');
  subject = subject.replace(
    /\b(akut|svar\s*smarta|andningssvarigheter)\b/gi,
    '[eskaleradfraga]'
  );
  return subject;
}

function maskBodyPreview(value) {
  return maskInboxText(value, 360);
}

function maskSender(sender = '') {
  const text = normalizeText(sender);
  if (!text) return '';
  const emailMatch = text.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!emailMatch) return capText(text, 80);
  const local = emailMatch[1];
  const domain = emailMatch[2];
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

function normalizeDirection(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['inbound', 'incoming', 'in', 'user', 'patient', 'customer'].includes(normalized)) {
    return 'inbound';
  }
  if (['outbound', 'outgoing', 'out', 'assistant', 'agent', 'staff', 'clinic'].includes(normalized)) {
    return 'outbound';
  }
  return 'unknown';
}

function mapConfidence(score = 0) {
  if (score >= 75) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

function formatPriorityLevelSv(level = 'Low') {
  const normalized = normalizeText(level).toLowerCase();
  if (normalized === 'critical') return 'Kritisk';
  if (normalized === 'high') return 'Hög';
  if (normalized === 'medium') return 'Medel';
  return 'Låg';
}

function countMessagesFromConversations(conversations = []) {
  return asArray(conversations).reduce((sum, conversation) => {
    return sum + asArray(conversation?.messages).length;
  }, 0);
}

function countMailboxesFromConversations(conversations = [], fallback = 0) {
  const mailboxIds = new Set();
  for (const conversation of asArray(conversations)) {
    const conversationMailboxId = normalizeText(conversation?.mailboxId);
    if (conversationMailboxId) mailboxIds.add(conversationMailboxId);
    for (const message of asArray(conversation?.messages)) {
      const messageMailboxId = normalizeText(message?.mailboxId);
      if (messageMailboxId) mailboxIds.add(messageMailboxId);
    }
  }
  const uniqueCount = mailboxIds.size;
  const conversationFallback = asArray(conversations).length > 0 ? 1 : 0;
  return Math.max(uniqueCount, toNumber(fallback, 0), conversationFallback);
}

const RISK_PATTERNS = Object.freeze([
  { code: 'ACUTE_URGENT', severity: 'critical', pattern: /\b(akut|andningssvarigheter|kraftig blodning|svimning)\b/i },
  { code: 'HIGH_PAIN', severity: 'high', pattern: /\b(svar smarta|kraftig smarta|intensiv smarta)\b/i },
  { code: 'INFECTION_SIGNAL', severity: 'high', pattern: /\b(infektion|feber|var|rodnad)\b/i },
  { code: 'COMPLAINT_LEGAL', severity: 'high', pattern: /\b(klagomal|juridik|advokat|anmalan|ersattning|stamning)\b/i },
  { code: 'MEDICAL_TOPIC', severity: 'medium', pattern: /\b(symptom|behandling|operation|biverkning|lakemedel|svullnad)\b/i },
]);

const MEDICAL_TOPIC_PATTERN =
  /\b(symptom|behandling|operation|biverkning|lakemedel|infektion|feber|svullnad|smarta)\b/i;

const INTENT_ACTIONS = Object.freeze({
  booking_request: 'Boka tid',
  pricing_question: 'Skicka prisinformation',
  anxiety_pre_op: 'Be om mer info',
  complaint: 'Eskalera',
  cancellation: 'Bekräfta ändring',
  follow_up: 'Ge statusuppdatering',
  unclear: 'Be om mer info',
});

function toStrategicUsageMetrics({
  conversationWorklist = [],
  unresolvedCount = 0,
  slaBreachCount = 0,
} = {}) {
  const rows = asArray(conversationWorklist);
  const safeUnresolvedCount = Math.max(0, toNumber(unresolvedCount, rows.length));
  const safeSlaBreachCount = Math.max(0, toNumber(slaBreachCount, 0));
  const total = Math.max(1, rows.length);
  const complaintRows = rows.filter(
    (row) => normalizeText(row?.intent).toLowerCase() === 'complaint'
  );
  const bookingRows = rows.filter(
    (row) => normalizeText(row?.intent).toLowerCase() === 'booking_request'
  );
  const followUpRows = rows.filter((row) => row?.followUpSuggested === true);
  const avgResponseTimeHours = averageNumber(rows.map((row) => row?.hoursSinceInbound), 0, 2);
  const avgPriorityScore = averageNumber(rows.map((row) => row?.priorityScore), 0, 2);
  const avgRiskStackScore = averageNumber(rows.map((row) => row?.riskStackScore), 0, 3);
  const complaintRate = complaintRows.length / total;
  const slaBreachRate = safeSlaBreachCount / total;
  const bookingPressure = bookingRows.length / total;
  const recommendationFollowRate = clamp(
    1 - followUpRows.length / total * 0.2,
    0,
    1,
    0.7
  );
  const ccoUsageRate = clamp(safeUnresolvedCount > 0 ? 1 : 0.35, 0, 1, 0.35);
  const conversionSignal = clamp(bookingPressure - followUpRows.length / total * 0.2 + 0.45, 0, 1, 0.45);
  const volatilityIndex = clamp(avgRiskStackScore + slaBreachRate * 0.2, 0, 1, 0);
  const healthScore = clamp(
    100 - slaBreachRate * 45 - complaintRate * 25 - Math.max(0, avgResponseTimeHours - 6) * 1.8,
    0,
    100,
    100
  );
  const conversionTrendPercent = roundToTwoDecimals((conversionSignal - 0.5) * 100);
  const complaintTrendPercent = roundToTwoDecimals(complaintRate * 100);
  const slaBreachTrendPercent = roundToTwoDecimals(slaBreachRate * 100);
  return {
    ccoUsageRate: roundToTwoDecimals(ccoUsageRate),
    avgResponseTimeHours: roundToTwoDecimals(avgResponseTimeHours),
    systemRecommendationFollowRate: roundToTwoDecimals(recommendationFollowRate),
    slaBreachTrendPercent,
    complaintTrendPercent,
    conversionTrendPercent,
    volatilityIndex: roundToTwoDecimals(volatilityIndex),
    healthScore: roundToTwoDecimals(healthScore),
    conversionSignal: roundToTwoDecimals(conversionSignal),
    avgPriorityScore: roundToTwoDecimals(avgPriorityScore),
  };
}

function roundToTwoDecimals(value = 0) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function toDerivedDailySignals({
  conversationWorklist = [],
  usageMetrics = {},
  nowMs = Date.now(),
  days = 14,
} = {}) {
  const safeDays = Math.max(7, Math.min(30, Math.round(toNumber(days, 14))));
  const rows = asArray(conversationWorklist);
  const complaintRate = clamp(toNumber(usageMetrics.complaintTrendPercent, 0) / 100, 0, 1, 0);
  const slaBreachRate = clamp(toNumber(usageMetrics.slaBreachTrendPercent, 0) / 100, 0, 1, 0);
  const conversionSignal = clamp(toNumber(usageMetrics.conversionSignal, 0.5), 0, 1, 0.5);
  const healthScore = clamp(toNumber(usageMetrics.healthScore, 100), 0, 100, 100);
  const volatilityIndex = clamp(toNumber(usageMetrics.volatilityIndex, 0), 0, 1, 0);
  const unresolvedCount = Math.max(1, rows.length);
  const bookingCount = rows.filter(
    (row) => normalizeText(row?.intent).toLowerCase() === 'booking_request'
  ).length;

  const signals = [];
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const tsMs = nowMs - offset * 24 * 60 * 60 * 1000;
    const curve = safeDays <= 1 ? 0 : offset / (safeDays - 1);
    signals.push({
      ts: new Date(tsMs).toISOString(),
      complaintRate: clamp(complaintRate * (0.9 + (1 - curve) * 0.2), 0, 1, complaintRate),
      bookingPressure: clamp(
        (bookingCount / unresolvedCount) * (0.92 + (1 - curve) * 0.16),
        0,
        1,
        0
      ),
      slaBreachRate: clamp(slaBreachRate * (0.88 + (1 - curve) * 0.24), 0, 1, slaBreachRate),
      conversionSignal: clamp(conversionSignal * (1 - (1 - curve) * 0.08), 0, 1, conversionSignal),
      healthScore: clamp(healthScore * (1 - (1 - curve) * 0.04), 0, 100, healthScore),
      volatilityIndex: clamp(volatilityIndex * (0.9 + (1 - curve) * 0.15), 0, 1, volatilityIndex),
      unresolvedCount,
      complaintCount: Math.max(0, Math.round(complaintRate * unresolvedCount)),
      bookingCount,
    });
  }
  return signals;
}

function normalizeStrategicDailySignals(values = [], fallbackSignals = []) {
  const source = asArray(values);
  if (!source.length) return fallbackSignals;
  const normalized = source
    .map((item) => asObject(item))
    .map((item) => {
      const ts = toIso(item.ts || item.date || item.generatedAt);
      if (!ts) return null;
      return {
        ts,
        complaintRate: clamp(item.complaintRate, 0, 1, 0),
        bookingPressure: clamp(item.bookingPressure, 0, 1, 0),
        slaBreachRate: clamp(item.slaBreachRate, 0, 1, 0),
        conversionSignal: clamp(item.conversionSignal, 0, 1, 0.5),
        healthScore: clamp(item.healthScore, 0, 100, 100),
        volatilityIndex: clamp(item.volatilityIndex, 0, 1, 0),
        unresolvedCount: Math.max(0, toNumber(item.unresolvedCount, 0)),
        complaintCount: Math.max(0, toNumber(item.complaintCount, 0)),
        bookingCount: Math.max(0, toNumber(item.bookingCount, 0)),
      };
    })
    .filter(Boolean)
    .sort((left, right) => String(left.ts || '').localeCompare(String(right.ts || '')));
  return normalized.length ? normalized : fallbackSignals;
}

function toDerivedFocusContext({
  source = {},
  usageMetrics = {},
  slaBreachCount = 0,
  complaintCount = 0,
} = {}) {
  const safeSource = asObject(source);
  const providedDrivers = asArray(safeSource.primaryDrivers)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  const derivedDrivers = [];
  if (toNumber(slaBreachCount, 0) > 0 || toNumber(usageMetrics.slaBreachTrendPercent, 0) > 0) {
    derivedDrivers.push('sla_breach');
  }
  if (toNumber(complaintCount, 0) > 0 || toNumber(usageMetrics.complaintTrendPercent, 0) > 0) {
    derivedDrivers.push('complaint_spike');
  }
  if (toNumber(usageMetrics.conversionTrendPercent, 0) < 0) {
    derivedDrivers.push('conversion_drop');
  }
  if (toNumber(usageMetrics.volatilityIndex, 0) > 0.6) {
    derivedDrivers.push('volatility');
  }
  if (toNumber(usageMetrics.healthScore, 100) < 60) {
    derivedDrivers.push('health_drop');
  }
  const primaryDrivers = Array.from(new Set([...providedDrivers, ...derivedDrivers])).slice(0, 5);
  const isActive =
    safeSource.isActive === true ||
    primaryDrivers.includes('sla_breach') ||
    primaryDrivers.includes('health_drop');
  const severity =
    normalizeText(safeSource.severity).toLowerCase() ||
    (isActive ? (toNumber(usageMetrics.healthScore, 100) < 55 ? 'high' : 'medium') : 'none');
  return {
    isActive,
    primaryDrivers,
    severity,
  };
}

const CCO_DEFAULT_SENDER_MAILBOX = 'contact@hairtpclinic.com';
const CCO_SIGNATURE_PROFILES = Object.freeze([
  Object.freeze({
    key: 'egzona',
    fullName: 'Egzona Krasniqi',
    title: 'Hårspecialist I Hårtransplantationer & PRP-injektioner',
    senderMailboxId: 'egzona@hairtpclinic.com',
  }),
  Object.freeze({
    key: 'fazli',
    fullName: 'Fazli Krasniqi',
    title: 'Hårspecialist I Hårtransplantationer & PRP-injektioner',
    senderMailboxId: 'fazli@hairtpclinic.com',
  }),
]);

function collectRiskFlags(text = '') {
  const source = normalizeText(text);
  if (!source) return [];
  const hits = [];
  for (const rule of RISK_PATTERNS) {
    if (!rule.pattern.test(source)) continue;
    hits.push({
      code: rule.code,
      severity: rule.severity,
    });
  }
  return hits;
}

function severityWeight(severity = '') {
  const normalized = normalizeText(severity).toLowerCase();
  if (normalized === 'critical') return 4;
  if (normalized === 'high') return 3;
  if (normalized === 'medium') return 2;
  if (normalized === 'low') return 1;
  return 0;
}

function countByField(snapshot = {}) {
  const safe = asObject(snapshot);
  const counts = {};
  for (const key of Object.keys(safe)) {
    const value = safe[key];
    if (Array.isArray(value)) {
      counts[key] = value.length;
      continue;
    }
    if (value && typeof value === 'object') {
      counts[key] = Object.keys(value).length;
      continue;
    }
    counts[key] = value === null || value === undefined ? 0 : 1;
  }
  return counts;
}

function buildSnapshotDebugInfo(snapshot = {}, derived = {}) {
  const safeSnapshot = asObject(snapshot);
  const timestamps = asObject(safeSnapshot.timestamps);
  return {
    keys: Object.keys(safeSnapshot).sort(),
    counts: {
      conversations: asArray(safeSnapshot.conversations).length,
      unresolvedConversations: Number(derived.unresolvedConversations || 0),
      slaBreaches: Number(derived.slaBreaches || 0),
      riskFlags: Number(derived.riskFlags || 0),
      suggestedDrafts: Number(derived.suggestedDrafts || 0),
    },
    fieldCounts: countByField(safeSnapshot),
    timestamp:
      toIso(
        safeSnapshot.snapshotTimestamp ||
          safeSnapshot.capturedAt ||
          timestamps.capturedAt
      ) || null,
    sourceTimestamp: toIso(timestamps.sourceGeneratedAt) || null,
    snapshotVersion:
      normalizeText(
        safeSnapshot.snapshotVersion ||
          safeSnapshot.version ||
          timestamps.version
      ) || null,
  };
}

function toMessageSnapshot(message = {}) {
  const bodyRaw =
    normalizeText(message.bodyPreview) ||
    normalizeText(message.preview) ||
    normalizeText(message.text) ||
    normalizeText(message.content);
  const bodyMasked = maskBodyPreview(bodyRaw);
  const senderEmail =
    normalizeText(message.senderEmail) ||
    normalizeText(message.fromEmail) ||
    normalizeText(message?.from?.emailAddress?.address);
  const senderName =
    normalizeText(message.senderName) ||
    normalizeText(message.fromName) ||
    normalizeText(message?.from?.emailAddress?.name);
  const senderRaw = senderName || senderEmail;
  const normalizedSenderEmail = normalizeEmail(senderEmail);
  return {
    messageId:
      normalizeOpaqueId(message.messageId) ||
      normalizeOpaqueId(message.id) ||
      null,
    direction: normalizeDirection(message.direction || message.role || message.type),
    sentAt: toIso(message.sentAt || message.createdAt || message.ts) || null,
    bodyPreview: bodyMasked,
    bodyLength: Math.max(0, Math.min(8000, bodyRaw.length)),
    masked: Boolean(bodyRaw && bodyRaw !== bodyMasked),
    mailboxId:
      normalizeOpaqueId(message.mailboxId || message.mailbox || message.userId) || null,
    mailboxAddress:
      normalizeText(message.mailboxAddress || message.mailboxEmail || message.mailAddress) || null,
    userPrincipalName: normalizeText(message.userPrincipalName || message.upn) || null,
    senderEmail: normalizedSenderEmail || null,
    senderName: normalizeText(senderName) || null,
    sender: maskSender(senderRaw),
  };
}

function toConversationSnapshot(input = {}) {
  const source = asObject(input);
  const messages = asArray(source.messages).map(toMessageSnapshot);
  const inboundMessages = messages
    .filter((item) => item.direction === 'inbound')
    .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
  const outboundMessages = messages
    .filter((item) => item.direction === 'outbound')
    .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
  const lastInbound = inboundMessages[0] || null;
  const lastOutbound = outboundMessages[0] || null;

  return {
    conversationId:
      normalizeOpaqueId(source.conversationId) ||
      normalizeOpaqueId(source.threadId) ||
      normalizeOpaqueId(source.id) ||
      null,
    rawSubject: capText(source.subject || source.title, 180),
    subject: sanitizeSubject(source.subject || source.title),
    status: normalizeText(source.status || 'open').toLowerCase(),
    slaDeadlineAt: toIso(source.slaDeadlineAt || source?.sla?.deadline) || null,
    lastInboundAt:
      toIso(source.lastInboundAt) ||
      normalizeText(lastInbound?.sentAt) ||
      null,
    lastOutboundAt:
      toIso(source.lastOutboundAt) ||
      normalizeText(lastOutbound?.sentAt) ||
      null,
    latestInboundMessage: lastInbound,
    latestOutboundMessage: lastOutbound,
    messages,
    rawRiskWords: asArray(source.riskWords)
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 20),
    mailboxId:
      normalizeOpaqueId(source.mailboxId || source.mailbox || source.userId) ||
      normalizeOpaqueId(lastInbound?.mailboxId) ||
      null,
    mailboxAddress:
      normalizeText(
        source.mailboxAddress || source.mailboxEmail || source.mailAddress || lastInbound?.mailboxAddress
      ) || null,
    userPrincipalName:
      normalizeText(source.userPrincipalName || source.upn || lastInbound?.userPrincipalName) || null,
    customerContext: {
      openCommitments:
        source.openCommitments ??
        source?.customerContext?.openCommitments ??
        source?.customer?.openCommitments ??
        null,
      repeatCustomer:
        source.repeatCustomer ??
        source?.customerContext?.repeatCustomer ??
        source?.customer?.repeatCustomer ??
        null,
      estimatedRevenueBand:
        source.estimatedRevenueBand ||
        source?.customerContext?.estimatedRevenueBand ||
        source?.customer?.estimatedRevenueBand ||
        '',
    },
    sender:
      maskSender(
        normalizeText(source.sender) ||
          normalizeText(source.senderEmail) ||
          normalizeText(lastInbound?.sender)
      ) || null,
  };
}

function toSlaStatusRank(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'breach') return 3;
  if (normalized === 'warning') return 2;
  return 1;
}

function compareWorkItemsBySlaAndPriority(left = {}, right = {}) {
  const slaRankDiff =
    toSlaStatusRank(right.slaStatus) - toSlaStatusRank(left.slaStatus);
  if (slaRankDiff !== 0) return slaRankDiff;

  const lifecycleRankDiff =
    toLifecycleSortRank(left?.customerSummary?.lifecycleStatus || left?.lifecycleStatus) -
    toLifecycleSortRank(right?.customerSummary?.lifecycleStatus || right?.lifecycleStatus);
  if (lifecycleRankDiff !== 0) return lifecycleRankDiff;

  const priorityDiff =
    toNumber(right.priorityScore, 0) - toNumber(left.priorityScore, 0);
  if (priorityDiff !== 0) return priorityDiff;

  return toNumber(right.hoursSinceInbound, 0) - toNumber(left.hoursSinceInbound, 0);
}

function resolveCaseStatus({ status = '', inboundAtMs = null, outboundAtMs = null } = {}) {
  const normalizedStatus = normalizeText(status).toLowerCase();
  if (normalizedStatus === 'closed' || normalizedStatus === 'resolved') return 'closed';
  if (normalizedStatus === 'follow_up_scheduled') return 'follow_up_scheduled';
  if (normalizedStatus === 'open' || normalizedStatus === 'needs_reply') return 'open';
  if (normalizedStatus === 'waiting' || normalizedStatus === 'waiting_on_customer') return 'waiting';
  const unanswered =
    Number.isFinite(inboundAtMs) &&
    (!Number.isFinite(outboundAtMs) || outboundAtMs < inboundAtMs);
  return unanswered ? 'open' : 'waiting';
}

function resolveCustomerIdentity(conversation = {}) {
  const inbound = asObject(conversation.latestInboundMessage);
  const outbound = asObject(conversation.latestOutboundMessage);
  const candidateEmail = normalizeEmail(
    inbound.senderEmail ||
      outbound.senderEmail ||
      conversation.customerEmail ||
      conversation.senderEmail ||
      ''
  );
  const candidateName =
    normalizeText(inbound.senderName) ||
    normalizeText(outbound.senderName) ||
    normalizeText(conversation.customerName);
  const senderLabel =
    candidateName ||
    maskSender(candidateEmail) ||
    normalizeText(conversation.sender) ||
    'Okänd kund';
  const customerKey = normalizeIdentifier(
    candidateEmail ||
      `customer:${normalizeText(conversation.conversationId) || normalizeText(senderLabel)}`,
    120
  );
  return {
    customerKey,
    customerEmail: candidateEmail || null,
    customerName: senderLabel,
  };
}

function computeCustomerEngagementScore(bucket = {}, nowMs = Date.now()) {
  const caseCount = Math.max(0, toNumber(bucket.caseCount, 0));
  const openCaseCount = Math.max(0, toNumber(bucket.openCaseCount, 0));
  const recencyDays = toDayDiff(bucket.lastInteractionAt, nowMs);
  let score = 0.1;
  score += Math.min(0.32, caseCount * 0.07);
  if (openCaseCount > 0) score += 0.18;
  if (recencyDays !== null && recencyDays <= 3) score += 0.24;
  else if (recencyDays !== null && recencyDays <= 7) score += 0.16;
  else if (recencyDays !== null && recencyDays <= 30) score += 0.08;
  return Math.round(clamp(score, 0, 1, 0.1) * 100) / 100;
}

function summarizeCaseStatusSv(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'open') return 'Öppen';
  if (normalized === 'waiting') return 'Väntar på kund';
  if (normalized === 'closed') return 'Stängd';
  if (normalized === 'follow_up_scheduled') return 'Uppföljning planerad';
  return 'Öppen';
}

function resolveWorkloadWarmth(summary = {}) {
  const safeSummary = asObject(summary);
  const lifecycleStatus = normalizeText(safeSummary.lifecycleStatus).toUpperCase();
  const interactionCount = Math.max(0, toNumber(safeSummary.interactionCount, 0));
  if (lifecycleStatus === 'DORMANT') return 'dormant';
  if (interactionCount >= 6 || lifecycleStatus === 'HANDLED') return 'loyal';
  if (
    lifecycleStatus === 'ACTIVE_DIALOGUE' ||
    lifecycleStatus === 'AWAITING_REPLY' ||
    lifecycleStatus === 'FOLLOW_UP_PENDING' ||
    interactionCount >= 3
  ) {
    return 'returning';
  }
  return 'new';
}

function buildCustomerIndex(conversations = [], nowMs = Date.now()) {
  const index = new Map();
  for (const conversation of asArray(conversations)) {
    const identity = resolveCustomerIdentity(conversation);
    const key = normalizeText(identity.customerKey);
    if (!key) continue;
    const inboundAtMs = toTimestampMs(conversation.lastInboundAt || conversation?.latestInboundMessage?.sentAt);
    const outboundAtMs = toTimestampMs(
      conversation.lastOutboundAt || conversation?.latestOutboundMessage?.sentAt
    );
    const caseStatus = resolveCaseStatus({
      status: conversation.status,
      inboundAtMs,
      outboundAtMs,
    });
    const lastInteractionAt =
      toIso(conversation.lastInboundAt) ||
      toIso(conversation.lastOutboundAt) ||
      toIso(conversation?.latestInboundMessage?.sentAt) ||
      toIso(conversation?.latestOutboundMessage?.sentAt) ||
      null;
    const interactionCount = Math.max(1, asArray(conversation.messages).length);
    const timelineEntry = {
      conversationId: normalizeText(conversation.conversationId) || '',
      subject: sanitizeSubject(conversation.rawSubject || conversation.subject),
      status: caseStatus,
      occurredAt: lastInteractionAt,
    };

    const current = index.get(key) || {
      customerKey: key,
      customerEmail: identity.customerEmail,
      customerName: identity.customerName,
      caseCount: 0,
      interactionCount: 0,
      openCaseCount: 0,
      closedCaseCount: 0,
      lastInteractionAt: null,
      lastClosedAt: null,
      timeline: [],
    };

    current.caseCount += 1;
    current.interactionCount += interactionCount;
    if (caseStatus === 'closed') {
      current.closedCaseCount += 1;
      const closedAtMs = toTimestampMs(lastInteractionAt);
      const currentClosedAtMs = toTimestampMs(current.lastClosedAt);
      if (Number.isFinite(closedAtMs) && (!Number.isFinite(currentClosedAtMs) || closedAtMs > currentClosedAtMs)) {
        current.lastClosedAt = lastInteractionAt;
      }
    } else {
      current.openCaseCount += 1;
    }
    const lastInteractionMs = toTimestampMs(lastInteractionAt);
    const currentLastMs = toTimestampMs(current.lastInteractionAt);
    if (Number.isFinite(lastInteractionMs) && (!Number.isFinite(currentLastMs) || lastInteractionMs > currentLastMs)) {
      current.lastInteractionAt = lastInteractionAt;
    }

    if (timelineEntry.conversationId) current.timeline.push(timelineEntry);
    index.set(key, current);
  }

  for (const bucket of index.values()) {
    bucket.timeline.sort((left, right) => {
      const leftMs = toTimestampMs(left?.occurredAt) || 0;
      const rightMs = toTimestampMs(right?.occurredAt) || 0;
      return rightMs - leftMs;
    });
    bucket.timeline = bucket.timeline.slice(0, 12);
    bucket.daysSinceLastInteraction = toDayDiff(bucket.lastInteractionAt, nowMs);
    bucket.daysSinceLastClosedCase = toDayDiff(bucket.lastClosedAt, nowMs);
    bucket.engagementScore = computeCustomerEngagementScore(bucket, nowMs);
    const reactivated =
      bucket.openCaseCount > 0 &&
      Number.isFinite(bucket.daysSinceLastClosedCase) &&
      bucket.daysSinceLastClosedCase >= 30;
    const lifecycle = evaluateLifecycleStatus({
      interactionCount: bucket.interactionCount,
      lastInteractionDate: bucket.lastInteractionAt,
      lastInboundAt: bucket.lastInteractionAt,
      lastOutboundAt: bucket.lastInteractionAt,
      openStatus: bucket.openCaseCount > 0 ? 'open' : 'closed',
      status: bucket.openCaseCount > 0 ? 'open' : 'handled',
      needsReplyStatus: bucket.openCaseCount > 0 ? 'needs_reply' : 'handled',
      dormantDaysThreshold: 30,
      archiveDaysThreshold: 90,
      reactivated,
    });
    bucket.lifecycleStatus = lifecycle.lifecycleStatus;
    bucket.lifecycleSource = lifecycle.source;
    const latestCase = bucket.timeline[0];
    if (latestCase) {
      const closedText =
        Number.isFinite(bucket.daysSinceLastClosedCase) && bucket.daysSinceLastClosedCase >= 0
          ? ` (avslutat för ${bucket.daysSinceLastClosedCase} dagar sedan)`
          : '';
      bucket.lastCaseSummary = `${latestCase.subject} (${summarizeCaseStatusSv(latestCase.status)})${closedText}`;
    } else {
      bucket.lastCaseSummary = 'Ingen tidigare ärendehistorik.';
    }
  }
  return index;
}

function buildCustomerSummaryView(bucket = {}) {
  const timeline = asArray(bucket.timeline).slice(0, 6).map((entry) => ({
    conversationId: normalizeText(entry.conversationId),
    subject: sanitizeSubject(entry.subject),
    status: resolveCaseStatus({ status: entry.status }),
    occurredAt: toIso(entry.occurredAt) || null,
  }));
  return {
    customerKey: normalizeText(bucket.customerKey),
    customerName: capText(normalizeText(bucket.customerName) || 'Okänd kund', 120),
    lifecycleStatus: normalizeText(bucket.lifecycleStatus) || 'NEW',
    lifecycleSource: normalizeText(bucket.lifecycleSource) || 'auto',
    interactionCount: Math.max(0, toNumber(bucket.interactionCount, 0)),
    caseCount: Math.max(0, toNumber(bucket.caseCount, 0)),
    lastInteractionAt: toIso(bucket.lastInteractionAt) || null,
    daysSinceLastInteraction:
      Number.isFinite(toNumber(bucket.daysSinceLastInteraction, NaN))
        ? toNumber(bucket.daysSinceLastInteraction, 0)
        : null,
    engagementScore: clamp(bucket.engagementScore, 0, 1, 0),
    lastCaseSummary: capText(bucket.lastCaseSummary || 'Ingen tidigare ärendehistorik.', 220),
    daysSinceLastClosedCase:
      Number.isFinite(toNumber(bucket.daysSinceLastClosedCase, NaN))
        ? toNumber(bucket.daysSinceLastClosedCase, 0)
        : null,
    timeline,
  };
}

function computeReplyLatencyHours(inboundAtIso = '', outboundAtIso = '') {
  const inboundMs = toTimestampMs(inboundAtIso);
  const outboundMs = toTimestampMs(outboundAtIso);
  if (!Number.isFinite(inboundMs) || !Number.isFinite(outboundMs) || outboundMs <= inboundMs) {
    return null;
  }
  return Math.round(((outboundMs - inboundMs) / (60 * 60 * 1000)) * 10) / 10;
}

async function buildDraftReply({
  subject = '',
  inboundPreview = '',
  priorityLevel = 'Low',
  isMedicalTopic = false,
  isAcute = false,
  intent = 'unclear',
  tone = 'neutral',
  toneStyle = 'balanserad',
  customerProfile = null,
  writingProfile = null,
}) {
  const originalMessage = [sanitizeSubject(subject), normalizeText(inboundPreview)]
    .filter(Boolean)
    .join('\n');
  const composed = await composeContextAwareDraft({
    intent,
    tone,
    priorityLevel,
    tenantToneStyle: toneStyle,
    writingProfile,
    originalMessage,
    customerProfile: asObject(customerProfile),
    isMedicalTopic,
    isAcute,
  });
  const recommendedMode = normalizeText(composed?.recommendedMode) || 'professional';
  const draftModes = asObject(composed?.draftModes);
  const fallbackReply =
    normalizeText(draftModes[recommendedMode]) ||
    normalizeText(draftModes.professional) ||
    normalizeText(draftModes.warm) ||
    normalizeText(draftModes.short) ||
    'Hej,\n\nTack för ditt meddelande. Vi har tagit emot ärendet.\n\nVänligen återkom med mer information så hjälper vi dig vidare.';
  const structureUsed = asObject(composed?.structureUsed);
  const acknowledgement =
    capText(normalizeText(structureUsed.acknowledgement), 600) || 'Tack för ditt meddelande.';
  const coreAnswer =
    capText(normalizeText(structureUsed.coreAnswer), 2000) ||
    'Vi har tagit emot ärendet och återkommer med tydlig återkoppling.';
  const cta =
    capText(normalizeText(structureUsed.cta), 600) ||
    'Vänligen återkom med kompletterande information så hjälper vi dig vidare.';

  return {
    draftModes: {
      short: clampTextLength(normalizeText(draftModes.short) || fallbackReply, 3000),
      warm: clampTextLength(normalizeText(draftModes.warm) || fallbackReply, 3000),
      professional: clampTextLength(normalizeText(draftModes.professional) || fallbackReply, 3000),
    },
    recommendedMode:
      ['short', 'warm', 'professional'].includes(recommendedMode) ? recommendedMode : 'professional',
    structureUsed: {
      acknowledgement,
      coreAnswer,
      cta,
    },
    proposedReply: clampTextLength(fallbackReply, 3000),
  };
}

class AnalyzeInboxCapability extends BaseCapability {
  static name = 'AnalyzeInbox';
  static capabilityName = 'AnalyzeInbox';
  static version = '2.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      includeClosed: { type: 'boolean' },
      maxDrafts: { type: 'integer', minimum: 1, maximum: 5 },
      debug: { type: 'boolean' },
      writingIdentityProfiles: { type: 'object', additionalProperties: true },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: [
          'urgentConversations',
          'needsReplyToday',
          'conversationWorklist',
          'slaBreaches',
          'riskFlags',
          'suggestedDrafts',
          'customerSummaries',
          'weeklyBrief',
          'monthlyRisk',
          'scenarioSimulation',
          'businessThreats',
          'forwardOutlook',
          'executiveSummary',
          'priorityLevel',
          'mailboxCount',
          'messageCount',
        ],
        additionalProperties: false,
        properties: {
          urgentConversations: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'object',
              required: [
                'conversationId',
                'messageId',
                'subject',
                'reason',
                'hoursSinceInbound',
                'slaStatus',
                'hoursRemaining',
                'slaThreshold',
                'stagnated',
                'stagnationHours',
                'followUpSuggested',
                'intent',
                'intentConfidence',
                'tone',
                'toneConfidence',
                'priorityLevel',
                'priorityScore',
                'priorityReasons',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                reason: { type: 'string', minLength: 1, maxLength: 120 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
                slaStatus: { type: 'string', enum: ['safe', 'warning', 'breach'] },
                hoursRemaining: { type: 'number' },
                slaThreshold: { type: 'number', minimum: 1 },
                stagnated: { type: 'boolean' },
                stagnationHours: { type: 'number', minimum: 0 },
                followUpSuggested: { type: 'boolean' },
                intent: {
                  type: 'string',
                  enum: [
                    'booking_request',
                    'pricing_question',
                    'anxiety_pre_op',
                    'complaint',
                    'cancellation',
                    'follow_up',
                    'unclear',
                  ],
                },
                intentConfidence: { type: 'number', minimum: 0, maximum: 1 },
                tone: {
                  type: 'string',
                  enum: ['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'],
                },
                toneConfidence: { type: 'number', minimum: 0, maximum: 1 },
                priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
                priorityScore: { type: 'number', minimum: 0, maximum: 100 },
                priorityReasons: {
                  type: 'array',
                  maxItems: 12,
                  items: { type: 'string', minLength: 1, maxLength: 80 },
                },
              },
            },
          },
          needsReplyToday: {
            type: 'array',
            maxItems: 80,
            items: {
              type: 'object',
              required: [
                'conversationId',
                'messageId',
                'mailboxId',
                'subject',
                'sender',
                'latestInboundPreview',
                'hoursSinceInbound',
                'slaStatus',
                'hoursRemaining',
                'slaThreshold',
                'stagnated',
                'stagnationHours',
                'followUpSuggested',
                'intent',
                'intentConfidence',
                'tone',
                'toneConfidence',
                'priorityLevel',
                'priorityScore',
                'priorityReasons',
                'needsReplyStatus',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                mailboxId: { type: 'string', minLength: 1, maxLength: 320 },
                mailboxAddress: { type: ['string', 'null'], maxLength: 320 },
                userPrincipalName: { type: ['string', 'null'], maxLength: 320 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                sender: { type: 'string', minLength: 1, maxLength: 120 },
                latestInboundPreview: { type: 'string', minLength: 1, maxLength: 360 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
                dueBy: { type: 'string', maxLength: 50 },
                slaStatus: { type: 'string', enum: ['safe', 'warning', 'breach'] },
                hoursRemaining: { type: 'number' },
                slaThreshold: { type: 'number', minimum: 1 },
                isUnanswered: { type: 'boolean' },
                unansweredThresholdHours: { type: 'number', minimum: 1 },
                stagnated: { type: 'boolean' },
                stagnationHours: { type: 'number', minimum: 0 },
                followUpSuggested: { type: 'boolean' },
                intent: {
                  type: 'string',
                  enum: [
                    'booking_request',
                    'pricing_question',
                    'anxiety_pre_op',
                    'complaint',
                    'cancellation',
                    'follow_up',
                    'unclear',
                  ],
                },
                intentConfidence: { type: 'number', minimum: 0, maximum: 1 },
                tone: {
                  type: 'string',
                  enum: ['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'],
                },
                toneConfidence: { type: 'number', minimum: 0, maximum: 1 },
                priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
                priorityScore: { type: 'number', minimum: 0, maximum: 100 },
                priorityReasons: {
                  type: 'array',
                  maxItems: 12,
                  items: { type: 'string', minLength: 1, maxLength: 80 },
                },
                needsReplyStatus: { type: 'string', enum: ['needs_reply', 'handled'] },
              },
            },
          },
          conversationWorklist: {
            type: 'array',
            maxItems: 120,
            items: {
              type: 'object',
              required: [
                'conversationId',
                'messageId',
                'mailboxId',
                'subject',
                'sender',
                'latestInboundPreview',
                'hoursSinceInbound',
                'lastInboundAt',
                'lastOutboundAt',
                'slaStatus',
                'hoursRemaining',
                'slaThreshold',
                'stagnated',
                'stagnationHours',
                'followUpSuggested',
                'intent',
                'intentConfidence',
                'tone',
                'toneConfidence',
                'priorityLevel',
                'priorityScore',
                'priorityReasons',
                'customerKey',
                'customerSummary',
                'tempoProfile',
                'recommendedFollowUpDelayDays',
                'ctaIntensity',
                'followUpSuggestedAt',
                'followUpTimingReason',
                'followUpUrgencyLevel',
                'followUpManualApprovalRequired',
                'estimatedWorkMinutes',
                'workloadBreakdown',
                'dominantRisk',
                'riskStackScore',
                'riskStackExplanation',
                'recommendedAction',
                'escalationRequired',
                'needsReplyStatus',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                mailboxId: { type: 'string', minLength: 1, maxLength: 320 },
                mailboxAddress: { type: ['string', 'null'], maxLength: 320 },
                userPrincipalName: { type: ['string', 'null'], maxLength: 320 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                sender: { type: 'string', minLength: 1, maxLength: 120 },
                latestInboundPreview: { type: 'string', minLength: 1, maxLength: 360 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
                lastInboundAt: { type: 'string', minLength: 1, maxLength: 50 },
                lastOutboundAt: { type: ['string', 'null'], maxLength: 50 },
                slaStatus: { type: 'string', enum: ['safe', 'warning', 'breach'] },
                hoursRemaining: { type: 'number' },
                slaThreshold: { type: 'number', minimum: 1 },
                isUnanswered: { type: 'boolean' },
                unansweredThresholdHours: { type: 'number', minimum: 1 },
                stagnated: { type: 'boolean' },
                stagnationHours: { type: 'number', minimum: 0 },
                followUpSuggested: { type: 'boolean' },
                intent: {
                  type: 'string',
                  enum: [
                    'booking_request',
                    'pricing_question',
                    'anxiety_pre_op',
                    'complaint',
                    'cancellation',
                    'follow_up',
                    'unclear',
                  ],
                },
                intentConfidence: { type: 'number', minimum: 0, maximum: 1 },
                tone: {
                  type: 'string',
                  enum: ['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'],
                },
                toneConfidence: { type: 'number', minimum: 0, maximum: 1 },
                priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
                priorityScore: { type: 'number', minimum: 0, maximum: 100 },
                priorityReasons: {
                  type: 'array',
                  maxItems: 12,
                  items: { type: 'string', minLength: 1, maxLength: 80 },
                },
                customerKey: { type: 'string', minLength: 1, maxLength: 120 },
                customerSummary: {
                  type: 'object',
                  required: [
                    'customerKey',
                    'customerName',
                    'lifecycleStatus',
                    'lifecycleSource',
                    'interactionCount',
                    'caseCount',
                    'engagementScore',
                    'lastCaseSummary',
                    'timeline',
                  ],
                  additionalProperties: false,
                  properties: {
                    customerKey: { type: 'string', minLength: 1, maxLength: 120 },
                    customerName: { type: 'string', minLength: 1, maxLength: 120 },
                    lifecycleStatus: {
                      type: 'string',
                      enum: [
                        'NEW',
                        'ACTIVE_DIALOGUE',
                        'AWAITING_REPLY',
                        'FOLLOW_UP_PENDING',
                        'DORMANT',
                        'HANDLED',
                        'ARCHIVED',
                      ],
                    },
                    lifecycleSource: { type: 'string', enum: ['auto', 'manual'] },
                    interactionCount: { type: 'number', minimum: 0 },
                    caseCount: { type: 'number', minimum: 0 },
                    lastInteractionAt: { type: ['string', 'null'], maxLength: 50 },
                    daysSinceLastInteraction: { type: ['number', 'null'], minimum: 0 },
                    engagementScore: { type: 'number', minimum: 0, maximum: 1 },
                    lastCaseSummary: { type: 'string', minLength: 1, maxLength: 240 },
                    daysSinceLastClosedCase: { type: ['number', 'null'], minimum: 0 },
                    timeline: {
                      type: 'array',
                      maxItems: 6,
                      items: {
                        type: 'object',
                        required: ['conversationId', 'subject', 'status', 'occurredAt'],
                        additionalProperties: false,
                        properties: {
                          conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                          subject: { type: 'string', minLength: 1, maxLength: 200 },
                          status: {
                            type: 'string',
                            enum: ['open', 'waiting', 'closed', 'follow_up_scheduled'],
                          },
                          occurredAt: { type: ['string', 'null'], maxLength: 50 },
                        },
                      },
                    },
                  },
                },
                tempoProfile: {
                  type: 'string',
                  enum: ['responsive', 'reflective', 'hesitant', 'low_engagement'],
                },
                recommendedFollowUpDelayDays: { type: 'number', minimum: 0, maximum: 30 },
                ctaIntensity: { type: 'string', enum: ['soft', 'normal', 'direct'] },
                followUpSuggestedAt: { type: ['string', 'null'], maxLength: 50 },
                followUpTimingReason: {
                  type: 'array',
                  maxItems: 6,
                  items: { type: 'string', minLength: 1, maxLength: 64 },
                },
                followUpUrgencyLevel: { type: 'string', enum: ['low', 'normal', 'high'] },
                followUpManualApprovalRequired: { type: 'boolean' },
                estimatedWorkMinutes: { type: 'number', minimum: 2, maximum: 25 },
                workloadBreakdown: {
                  type: 'object',
                  required: [
                    'base',
                    'toneAdjustment',
                    'priorityAdjustment',
                    'warmthAdjustment',
                    'lengthAdjustment',
                  ],
                  additionalProperties: false,
                  properties: {
                    base: { type: 'number' },
                    toneAdjustment: { type: 'number' },
                    priorityAdjustment: { type: 'number' },
                    warmthAdjustment: { type: 'number' },
                    lengthAdjustment: { type: 'number' },
                  },
                },
                dominantRisk: {
                  type: 'string',
                  enum: ['miss', 'tone', 'follow_up', 'relationship', 'neutral'],
                },
                riskStackScore: { type: 'number', minimum: 0, maximum: 1 },
                riskStackExplanation: { type: 'string', minLength: 1, maxLength: 200 },
                recommendedAction: { type: 'string', minLength: 1, maxLength: 120 },
                escalationRequired: { type: 'boolean' },
                needsReplyStatus: { type: 'string', enum: ['needs_reply', 'handled'] },
              },
            },
          },
          slaBreaches: {
            type: 'array',
            maxItems: 80,
            items: {
              type: 'object',
              required: ['conversationId', 'messageId', 'subject', 'slaDeadlineAt', 'overdueMinutes'],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                slaDeadlineAt: { type: 'string', minLength: 1, maxLength: 50 },
                overdueMinutes: { type: 'number', minimum: 0 },
              },
            },
          },
          riskFlags: {
            type: 'array',
            maxItems: 150,
            items: {
              type: 'object',
              required: ['conversationId', 'messageId', 'flagCode', 'severity', 'reason'],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                flagCode: { type: 'string', minLength: 1, maxLength: 80 },
                severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                reason: { type: 'string', minLength: 1, maxLength: 180 },
              },
            },
          },
          suggestedDrafts: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              required: [
                'conversationId',
                'messageId',
                'mailboxId',
                'subject',
                'sender',
                'latestInboundPreview',
                'hoursSinceInbound',
                'slaStatus',
                'hoursRemaining',
                'slaThreshold',
                'stagnated',
                'stagnationHours',
                'followUpSuggested',
                'intent',
                'intentConfidence',
                'tone',
                'toneConfidence',
                'priorityLevel',
                'priorityScore',
                'priorityReasons',
                'customerKey',
                'customerSummary',
                'tempoProfile',
                'recommendedFollowUpDelayDays',
                'ctaIntensity',
                'followUpSuggestedAt',
                'followUpTimingReason',
                'followUpUrgencyLevel',
                'followUpManualApprovalRequired',
                'estimatedWorkMinutes',
                'workloadBreakdown',
                'dominantRisk',
                'riskStackScore',
                'riskStackExplanation',
                'recommendedAction',
                'escalationRequired',
                'draftModes',
                'recommendedMode',
                'structureUsed',
                'suggestedReply',
                'proposedReply',
                'confidenceLevel',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                mailboxId: { type: 'string', minLength: 1, maxLength: 320 },
                mailboxAddress: { type: ['string', 'null'], maxLength: 320 },
                userPrincipalName: { type: ['string', 'null'], maxLength: 320 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                sender: { type: 'string', minLength: 1, maxLength: 120 },
                latestInboundPreview: { type: 'string', minLength: 1, maxLength: 360 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
                slaStatus: { type: 'string', enum: ['safe', 'warning', 'breach'] },
                hoursRemaining: { type: 'number' },
                slaThreshold: { type: 'number', minimum: 1 },
                isUnanswered: { type: 'boolean' },
                unansweredThresholdHours: { type: 'number', minimum: 1 },
                stagnated: { type: 'boolean' },
                stagnationHours: { type: 'number', minimum: 0 },
                followUpSuggested: { type: 'boolean' },
                intent: {
                  type: 'string',
                  enum: [
                    'booking_request',
                    'pricing_question',
                    'anxiety_pre_op',
                    'complaint',
                    'cancellation',
                    'follow_up',
                    'unclear',
                  ],
                },
                intentConfidence: { type: 'number', minimum: 0, maximum: 1 },
                tone: {
                  type: 'string',
                  enum: ['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'],
                },
                toneConfidence: { type: 'number', minimum: 0, maximum: 1 },
                priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
                priorityScore: { type: 'number', minimum: 0, maximum: 100 },
                priorityReasons: {
                  type: 'array',
                  maxItems: 12,
                  items: { type: 'string', minLength: 1, maxLength: 80 },
                },
                customerKey: { type: 'string', minLength: 1, maxLength: 120 },
                customerSummary: {
                  type: 'object',
                  required: [
                    'customerKey',
                    'customerName',
                    'lifecycleStatus',
                    'lifecycleSource',
                    'interactionCount',
                    'caseCount',
                    'engagementScore',
                    'lastCaseSummary',
                    'timeline',
                  ],
                  additionalProperties: false,
                  properties: {
                    customerKey: { type: 'string', minLength: 1, maxLength: 120 },
                    customerName: { type: 'string', minLength: 1, maxLength: 120 },
                    lifecycleStatus: {
                      type: 'string',
                      enum: [
                        'NEW',
                        'ACTIVE_DIALOGUE',
                        'AWAITING_REPLY',
                        'FOLLOW_UP_PENDING',
                        'DORMANT',
                        'HANDLED',
                        'ARCHIVED',
                      ],
                    },
                    lifecycleSource: { type: 'string', enum: ['auto', 'manual'] },
                    interactionCount: { type: 'number', minimum: 0 },
                    caseCount: { type: 'number', minimum: 0 },
                    lastInteractionAt: { type: ['string', 'null'], maxLength: 50 },
                    daysSinceLastInteraction: { type: ['number', 'null'], minimum: 0 },
                    engagementScore: { type: 'number', minimum: 0, maximum: 1 },
                    lastCaseSummary: { type: 'string', minLength: 1, maxLength: 240 },
                    daysSinceLastClosedCase: { type: ['number', 'null'], minimum: 0 },
                    timeline: {
                      type: 'array',
                      maxItems: 6,
                      items: {
                        type: 'object',
                        required: ['conversationId', 'subject', 'status', 'occurredAt'],
                        additionalProperties: false,
                        properties: {
                          conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                          subject: { type: 'string', minLength: 1, maxLength: 200 },
                          status: {
                            type: 'string',
                            enum: ['open', 'waiting', 'closed', 'follow_up_scheduled'],
                          },
                          occurredAt: { type: ['string', 'null'], maxLength: 50 },
                        },
                      },
                    },
                  },
                },
                tempoProfile: {
                  type: 'string',
                  enum: ['responsive', 'reflective', 'hesitant', 'low_engagement'],
                },
                recommendedFollowUpDelayDays: { type: 'number', minimum: 0, maximum: 30 },
                ctaIntensity: { type: 'string', enum: ['soft', 'normal', 'direct'] },
                followUpSuggestedAt: { type: ['string', 'null'], maxLength: 50 },
                followUpTimingReason: {
                  type: 'array',
                  maxItems: 6,
                  items: { type: 'string', minLength: 1, maxLength: 64 },
                },
                followUpUrgencyLevel: { type: 'string', enum: ['low', 'normal', 'high'] },
                followUpManualApprovalRequired: { type: 'boolean' },
                estimatedWorkMinutes: { type: 'number', minimum: 2, maximum: 25 },
                workloadBreakdown: {
                  type: 'object',
                  required: [
                    'base',
                    'toneAdjustment',
                    'priorityAdjustment',
                    'warmthAdjustment',
                    'lengthAdjustment',
                  ],
                  additionalProperties: false,
                  properties: {
                    base: { type: 'number' },
                    toneAdjustment: { type: 'number' },
                    priorityAdjustment: { type: 'number' },
                    warmthAdjustment: { type: 'number' },
                    lengthAdjustment: { type: 'number' },
                  },
                },
                dominantRisk: {
                  type: 'string',
                  enum: ['miss', 'tone', 'follow_up', 'relationship', 'neutral'],
                },
                riskStackScore: { type: 'number', minimum: 0, maximum: 1 },
                riskStackExplanation: { type: 'string', minLength: 1, maxLength: 200 },
                recommendedAction: { type: 'string', minLength: 1, maxLength: 120 },
                escalationRequired: { type: 'boolean' },
                draftModes: {
                  type: 'object',
                  required: ['short', 'warm', 'professional'],
                  additionalProperties: false,
                  properties: {
                    short: { type: 'string', minLength: 1, maxLength: 3000 },
                    warm: { type: 'string', minLength: 1, maxLength: 3000 },
                    professional: { type: 'string', minLength: 1, maxLength: 3000 },
                  },
                },
                recommendedMode: { type: 'string', enum: ['short', 'warm', 'professional'] },
                structureUsed: {
                  type: 'object',
                  required: ['acknowledgement', 'coreAnswer', 'cta'],
                  additionalProperties: false,
                  properties: {
                    acknowledgement: { type: 'string', minLength: 1, maxLength: 600 },
                    coreAnswer: { type: 'string', minLength: 1, maxLength: 2000 },
                    cta: { type: 'string', minLength: 1, maxLength: 600 },
                  },
                },
                suggestedReply: { type: 'string', minLength: 1, maxLength: 3000 },
                proposedReply: { type: 'string', minLength: 1, maxLength: 3000 },
                confidenceLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
              },
            },
          },
          customerSummaries: {
            type: 'array',
            maxItems: 120,
            items: {
              type: 'object',
              required: [
                'customerKey',
                'customerName',
                'lifecycleStatus',
                'lifecycleSource',
                'interactionCount',
                'caseCount',
                'engagementScore',
                'lastCaseSummary',
                'timeline',
              ],
              additionalProperties: false,
              properties: {
                customerKey: { type: 'string', minLength: 1, maxLength: 120 },
                customerName: { type: 'string', minLength: 1, maxLength: 120 },
                lifecycleStatus: {
                  type: 'string',
                  enum: [
                    'NEW',
                    'ACTIVE_DIALOGUE',
                    'AWAITING_REPLY',
                    'FOLLOW_UP_PENDING',
                    'DORMANT',
                    'HANDLED',
                    'ARCHIVED',
                  ],
                },
                lifecycleSource: { type: 'string', enum: ['auto', 'manual'] },
                interactionCount: { type: 'number', minimum: 0 },
                caseCount: { type: 'number', minimum: 0 },
                lastInteractionAt: { type: ['string', 'null'], maxLength: 50 },
                daysSinceLastInteraction: { type: ['number', 'null'], minimum: 0 },
                engagementScore: { type: 'number', minimum: 0, maximum: 1 },
                lastCaseSummary: { type: 'string', minLength: 1, maxLength: 240 },
                daysSinceLastClosedCase: { type: ['number', 'null'], minimum: 0 },
                timeline: {
                  type: 'array',
                  maxItems: 6,
                  items: {
                    type: 'object',
                    required: ['conversationId', 'subject', 'status', 'occurredAt'],
                    additionalProperties: false,
                    properties: {
                      conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                      subject: { type: 'string', minLength: 1, maxLength: 200 },
                      status: {
                        type: 'string',
                        enum: ['open', 'waiting', 'closed', 'follow_up_scheduled'],
                      },
                      occurredAt: { type: ['string', 'null'], maxLength: 50 },
                    },
                  },
                },
              },
            },
          },
          weeklyBrief: {
            type: 'object',
            required: ['mode', 'headline', 'sections', 'recommendations', 'generatedAt'],
            additionalProperties: true,
            properties: {
              mode: { type: 'string', enum: ['focus', 'normal'] },
              headline: { type: 'string', minLength: 1, maxLength: 240 },
              sections: { type: 'array', maxItems: 8, items: { type: 'object' } },
              recommendations: {
                type: 'array',
                maxItems: 5,
                items: { type: 'string', minLength: 1, maxLength: 220 },
              },
              generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
            },
          },
          monthlyRisk: {
            type: 'object',
            required: ['riskBand', 'riskIndex', 'dominantDrivers', 'recommendations', 'generatedAt'],
            additionalProperties: true,
            properties: {
              riskBand: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              riskIndex: { type: 'number', minimum: 0, maximum: 1 },
              dominantDrivers: {
                type: 'array',
                maxItems: 4,
                items: { type: 'string', minLength: 1, maxLength: 80 },
              },
              recommendations: {
                type: 'array',
                maxItems: 5,
                items: { type: 'string', minLength: 1, maxLength: 220 },
              },
              generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
            },
          },
          scenarioSimulation: {
            type: 'object',
            required: ['baseline', 'scenarios', 'generatedAt'],
            additionalProperties: true,
            properties: {
              baseline: { type: 'object', additionalProperties: true },
              scenarios: { type: 'array', maxItems: 8, items: { type: 'object' } },
              generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
            },
          },
          businessThreats: {
            type: 'object',
            required: ['threats', 'threatCount', 'highestSeverity', 'generatedAt'],
            additionalProperties: true,
            properties: {
              threats: { type: 'array', maxItems: 12, items: { type: 'object' } },
              threatCount: { type: 'number', minimum: 0 },
              highestSeverity: { type: 'string', minLength: 1, maxLength: 20 },
              generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
            },
          },
          forwardOutlook: {
            type: 'object',
            required: [
              'riskForecast',
              'capacityForecast',
              'recommendedPreparation',
              'volatilityIndex',
              'confidenceScore',
              'generatedAt',
            ],
            additionalProperties: true,
            properties: {
              riskForecast: { type: 'object', additionalProperties: true },
              capacityForecast: { type: 'object', additionalProperties: true },
              recommendedPreparation: {
                type: 'array',
                maxItems: 6,
                items: { type: 'string', minLength: 1, maxLength: 220 },
              },
              volatilityIndex: { type: 'number', minimum: 0, maximum: 1 },
              confidenceScore: { type: 'number', minimum: 0, maximum: 1 },
              generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
            },
          },
          executiveSummary: { type: 'string', minLength: 1, maxLength: 1200 },
          priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
          mailboxCount: { type: 'number', minimum: 0 },
          messageCount: { type: 'number', minimum: 0 },
        },
      },
      metadata: {
        type: 'object',
        required: ['capability', 'version', 'channel'],
        additionalProperties: true,
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          version: { type: 'string', minLength: 1, maxLength: 40 },
          channel: { type: 'string', minLength: 1, maxLength: 40 },
          tenantId: { type: 'string', minLength: 1, maxLength: 120 },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          correlationId: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 30,
        items: { type: 'string', minLength: 1, maxLength: 220 },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const writingIdentityOverrides = asObject(input.writingIdentityProfiles);
    const debugMode = input.debug === true;
    const includeClosed = input.includeClosed === true;
    const maxDrafts = Math.max(1, Math.min(5, toNumber(input.maxDrafts, 5)));
    const snapshotSource = asObject(safeContext.systemStateSnapshot);
    const snapshotMetadata = asObject(snapshotSource.metadata);
    const tenantBusinessHours = asObject(snapshotMetadata.tenantBusinessHours);
    const useOpeningHours = Object.keys(tenantBusinessHours).length > 0;
    const tenantProfile = asObject(snapshotSource.tenantProfile);
    const toneStyle =
      normalizeText(snapshotMetadata.toneStyle) ||
      normalizeText(tenantProfile.toneStyle) ||
      'balanserad';

    const rawConversations = asArray(snapshotSource.conversations);
    const conversations = rawConversations
      .map(toConversationSnapshot)
      .filter((item) => item.conversationId);

    const mailboxCount = countMailboxesFromConversations(
      conversations,
      snapshotMetadata.mailboxCount
    );
    const messageCount = Math.max(
      countMessagesFromConversations(conversations),
      toNumber(snapshotMetadata.messageCount, 0),
      toNumber(snapshotMetadata.fetchedMessages, 0)
    );

    const unresolved = [];
    const urgentConversations = [];
    const needsReplyToday = [];
    const slaBreaches = [];
    const riskFlags = [];
    const conversationWorklist = [];
    const customerSummariesByKey = new Map();
    const warnings = [];
    let maskedPreviewCount = 0;
    const nowMs = Date.now();
    const customerIndex = buildCustomerIndex(conversations, nowMs);
    for (const bucket of customerIndex.values()) {
      const summary = buildCustomerSummaryView(bucket);
      if (!summary.customerKey) continue;
      customerSummariesByKey.set(summary.customerKey, summary);
    }

    for (const conversation of conversations) {
      if (!includeClosed && normalizeText(conversation.status) === 'closed') continue;
      const inbound = asObject(conversation.latestInboundMessage);
      const outbound = asObject(conversation.latestOutboundMessage);
      const inboundAtMs = toTimestampMs(conversation.lastInboundAt || inbound.sentAt);
      const outboundAtMs = toTimestampMs(conversation.lastOutboundAt || outbound.sentAt);
      const unanswered =
        inboundAtMs !== null && (outboundAtMs === null || outboundAtMs < inboundAtMs);
      const wallHoursSinceInbound =
        inboundAtMs === null
          ? 0
          : Math.max(0, Math.round(((Date.now() - inboundAtMs) / (60 * 60 * 1000)) * 10) / 10);
      const messageId =
        normalizeText(inbound.messageId) ||
        normalizeText(conversation.conversationId);
      const inboundPreview = normalizeText(inbound.bodyPreview);
      if (inbound.masked === true) maskedPreviewCount += 1;

      const semanticInput = [
        conversation.rawSubject || conversation.subject,
        inboundPreview,
        conversation.rawRiskWords.join(' '),
      ].join('\n');

      const intentResult = await classifyIntent(semanticInput);
      const resolvedMailboxId =
        normalizeText(conversation.mailboxId) ||
        normalizeText(conversation.mailboxAddress) ||
        normalizeText(conversation.userPrincipalName) ||
        normalizeText(inbound.mailboxId) ||
        normalizeText(inbound.mailboxAddress) ||
        normalizeText(inbound.userPrincipalName) ||
        'okand-postlada';
      const writingProfile = resolveWritingIdentityProfile(
        {
          mailboxAddress: normalizeText(conversation.mailboxAddress) || normalizeText(inbound.mailboxAddress),
          userPrincipalName:
            normalizeText(conversation.userPrincipalName) || normalizeText(inbound.userPrincipalName),
          mailboxId: normalizeText(conversation.mailboxId) || normalizeText(inbound.mailboxId),
        },
        {
          overrides: writingIdentityOverrides,
          fallbackToTenantToneStyle: false,
        }
      );
      const toneResult = await detectTone(semanticInput, { writingProfile });
      const intent = intentResult.intent;
      const intentConfidence = toNumber(intentResult.confidence, 0.3);
      const tone = normalizeText(toneResult.tone) || 'neutral';
      const toneConfidence = Math.max(0, Math.min(1, toNumber(toneResult.toneConfidence, 0.4)));
      const customerIdentity = resolveCustomerIdentity(conversation);
      const customerBucket =
        customerIndex.get(customerIdentity.customerKey) || {
          customerKey: customerIdentity.customerKey,
          customerName: customerIdentity.customerName,
          caseCount: 1,
          interactionCount: Math.max(1, asArray(conversation.messages).length),
          lastInteractionAt: toIso(conversation.lastInboundAt || inbound.sentAt) || null,
          daysSinceLastInteraction: 0,
          engagementScore: 0.35,
          lifecycleStatus: 'NEW',
          lifecycleSource: 'auto',
          lastCaseSummary: `${conversation.subject} (Öppen)`,
          daysSinceLastClosedCase: null,
          timeline: [],
        };

      const flags = collectRiskFlags(semanticInput);
      for (const flag of flags) {
        riskFlags.push({
          conversationId: conversation.conversationId,
          messageId,
          flagCode: flag.code,
          severity: flag.severity,
          reason: `Risk flag ${flag.code} upptackt i inkommande meddelande.`,
        });
      }

      const priorityInfo = computeWeightedPriorityScore({
        hoursSinceInbound: wallHoursSinceInbound,
        intent,
        tone,
        customerContext: conversation.customerContext,
      });
      const priorityReasons = asArray(priorityInfo.priorityReasons)
        .map((item) => normalizeText(item))
        .filter(Boolean)
        .slice(0, 12);
      const escalationRequired =
        priorityInfo.priorityLevel === 'Critical' ||
        intent === 'complaint' ||
        flags.some((item) => severityWeight(item.severity) >= 4);
      const sender = normalizeText(conversation.sender || inbound.sender) || 'okänd avsändare';
      const lastInboundAtIso = toIso(conversation.lastInboundAt || inbound.sentAt);
      const lastOutboundAtIso = toIso(conversation.lastOutboundAt || outbound.sentAt);
      const needsReplyStatus =
        normalizeText(conversation.status).toLowerCase() === 'handled'
          ? 'handled'
          : 'needs_reply';
      const slaMonitor = evaluateSlaMonitor({
        hoursSinceInbound: wallHoursSinceInbound,
        lastInboundAt: lastInboundAtIso,
        lastOutboundAt: lastOutboundAtIso,
        priorityLevel: priorityInfo.priorityLevel,
        intent,
        tone,
        needsReplyStatus,
        nowMs,
        openingHours: useOpeningHours ? tenantBusinessHours : null,
        respectOpeningHours: useOpeningHours,
      });
      const hoursSinceInbound = Math.max(0, toNumber(slaMonitor.hoursSinceInbound, wallHoursSinceInbound));
      const slaStatus = normalizeText(slaMonitor.slaStatus) || 'safe';
      const hoursRemaining = toNumber(slaMonitor.hoursRemaining, 0);
      const slaThreshold = Math.max(1, toNumber(slaMonitor.slaThreshold, 48));
      const unansweredThresholdHours = Math.max(
        1,
        toNumber(slaMonitor.unansweredThresholdHours, 24)
      );
      const isUnanswered = unanswered;
      const stagnated = slaMonitor.stagnated === true;
      const stagnationHours = Math.max(0, toNumber(slaMonitor.stagnationHours, 0));
      const followUpSuggested = slaMonitor.followUpSuggested === true;
      const lifecycleInfo = evaluateLifecycleStatus({
        interactionCount: Math.max(1, asArray(conversation.messages).length),
        lastInteractionDate: customerBucket.lastInteractionAt,
        lastInboundAt: lastInboundAtIso,
        lastOutboundAt: lastOutboundAtIso,
        hoursSinceInbound,
        openStatus: unanswered ? 'open' : 'waiting',
        status: normalizeText(conversation.status) || 'open',
        intent,
        slaStatus,
        followUpSuggested,
        needsReplyStatus,
        dormantDaysThreshold: 30,
        archiveDaysThreshold: 90,
        microThreadWindowMinutes: 20,
        nowMs,
      });
      const customerTemperature = evaluateCustomerTemperature({
        lifecycleStatus: lifecycleInfo.lifecycleStatus,
        toneHistory: [tone],
        slaStatus,
        complaintCount: intent === 'complaint' ? 1 : 0,
        engagementScore: customerBucket.engagementScore,
        recencyDays: customerBucket.daysSinceLastInteraction,
      });
      const replyLatencyHours = computeReplyLatencyHours(lastInboundAtIso, lastOutboundAtIso);
      const tempoInfo = evaluateTempoProfile({
        replyLatencyHours:
          replyLatencyHours === null ? Math.max(6, hoursSinceInbound) : replyLatencyHours,
        responseCount: customerBucket.interactionCount,
        interactionDensity:
          customerBucket.daysSinceLastInteraction === null
            ? customerBucket.caseCount
            : customerBucket.caseCount /
              Math.max(1, Number(customerBucket.daysSinceLastInteraction) + 1),
        toneTrend: tone,
        warmthScore: customerBucket.engagementScore,
      });
      const timingSuggestion = followUpSuggested
        ? suggestFollowUpTiming({
            currentTimestamp: nowMs,
            intent,
            tone,
            tempoProfile: tempoInfo.tempoProfile,
            warmthScore: customerBucket.engagementScore,
            lifecycleStatus: lifecycleInfo.lifecycleStatus,
            recommendedFollowUpDelayDays: tempoInfo.recommendedFollowUpDelayDays,
            tenantBusinessHours: asObject(snapshotMetadata.tenantBusinessHours),
            timezone:
              normalizeText(snapshotMetadata.timezone) ||
              normalizeText(tenantProfile.timezone) ||
              'Europe/Stockholm',
          })
        : {
            suggestedDateTime: null,
            urgencyLevel: 'normal',
            reasoning: [],
            manualApprovalRequired: true,
          };
      if (customerTemperature.temperature === 'at_risk') {
        timingSuggestion.urgencyLevel = 'high';
      }
      const customerSummary = buildCustomerSummaryView({
        ...customerBucket,
        lifecycleStatus: lifecycleInfo.lifecycleStatus,
        lifecycleSource: lifecycleInfo.source,
      });
      customerSummariesByKey.set(customerSummary.customerKey, customerSummary);
      const workloadWarmth = resolveWorkloadWarmth(customerSummary);
      const relationshipStatus = workloadWarmth;
      const messageLength = Math.max(
        0,
        toNumber(inbound.bodyLength, normalizeText(inboundPreview).length)
      );
      const workload = estimateConversationWorkload({
        intent,
        tone,
        priorityLevel: priorityInfo.priorityLevel,
        warmth: workloadWarmth,
        messageLength,
      });
      const riskStack = evaluateRiskStack({
        isUnanswered,
        slaStatus,
        hoursSinceInbound,
        unansweredThresholdHours,
        tone,
        toneConfidence,
        followUpSuggested,
        stagnated,
        lifecycleState: lifecycleInfo.lifecycleStatus,
        relationshipStatus,
        interactionCount: customerSummary.interactionCount,
        intent,
      });
      const dominantRisk = normalizeText(riskStack.dominantRisk) || 'neutral';
      const riskStackScore = clamp(toNumber(riskStack.weightedScore, 0), 0, 1, 0);
      const riskStackExplanation =
        normalizeText(riskStack.explanation) || 'Ingen dominant förhöjd risk identifierad.';
      const recommendedAction =
        normalizeText(riskStack.recommendedAction) ||
        INTENT_ACTIONS[intent] ||
        INTENT_ACTIONS.unclear;
      const isSlaBreached = slaStatus === 'breach';
      const lastInboundMs = toTimestampMs(lastInboundAtIso);
      const slaDeadlineIso =
        lastInboundMs !== null
          ? new Date(lastInboundMs + slaThreshold * 60 * 60 * 1000).toISOString()
          : '';
      if (isSlaBreached) {
        const overdueMinutes = Math.max(
          0,
          Math.round((hoursSinceInbound - slaThreshold) * 60)
        );
        slaBreaches.push({
          conversationId: conversation.conversationId,
          messageId,
          subject: conversation.subject,
          slaDeadlineAt: slaDeadlineIso || toIso(conversation.slaDeadlineAt) || '',
          overdueMinutes,
        });
      }

      const dueSoon = slaStatus === 'warning' || slaStatus === 'breach';
      const isActionableLifecycle = ['NEW', 'ACTIVE_DIALOGUE', 'FOLLOW_UP_PENDING'].includes(
        lifecycleInfo.lifecycleStatus
      );

      if (
        isActionableLifecycle &&
        (dueSoon || followUpSuggested || hoursSinceInbound >= 6 || flags.length > 0)
      ) {
        needsReplyToday.push({
          conversationId: conversation.conversationId,
          messageId,
          mailboxId: resolvedMailboxId,
          mailboxAddress: normalizeText(conversation.mailboxAddress) || normalizeText(inbound.mailboxAddress) || null,
          userPrincipalName:
            normalizeText(conversation.userPrincipalName) || normalizeText(inbound.userPrincipalName) || null,
          subject: conversation.subject,
          sender,
          latestInboundPreview: inboundPreview || 'Ingen förhandsvisning tillgänglig.',
          hoursSinceInbound,
          dueBy: slaDeadlineIso || '',
          slaStatus,
          hoursRemaining,
          slaThreshold,
          isUnanswered,
          unansweredThresholdHours,
          stagnated,
          stagnationHours,
          followUpSuggested,
          intent,
          intentConfidence,
          tone,
          toneConfidence,
          priorityLevel: priorityInfo.priorityLevel,
          priorityScore: priorityInfo.priorityScore,
          priorityReasons,
          needsReplyStatus,
        });
      }

      const hasHighFlag = flags.some((item) => severityWeight(item.severity) >= 3);
      if (
        isSlaBreached ||
        hasHighFlag ||
        hoursSinceInbound >= 24 ||
        priorityInfo.priorityLevel === 'Critical'
      ) {
        urgentConversations.push({
          conversationId: conversation.conversationId,
          messageId,
          subject: conversation.subject,
          reason: isSlaBreached ? 'sla_breach' : hasHighFlag ? 'risk_flag' : 'stale_unanswered',
          hoursSinceInbound,
          slaStatus,
          hoursRemaining,
          slaThreshold,
          stagnated,
          stagnationHours,
          followUpSuggested,
          intent,
          intentConfidence,
          tone,
          toneConfidence,
          priorityLevel: priorityInfo.priorityLevel,
          priorityScore: priorityInfo.priorityScore,
          priorityReasons,
        });
      }

      const workItem = {
        conversation: conversation,
        conversationId: conversation.conversationId,
        messageId,
        mailboxId: resolvedMailboxId,
        mailboxAddress: normalizeText(conversation.mailboxAddress) || normalizeText(inbound.mailboxAddress),
        userPrincipalName:
          normalizeText(conversation.userPrincipalName) || normalizeText(inbound.userPrincipalName),
        writingProfile,
        sender,
        latestInboundPreview: inboundPreview || 'Ingen förhandsvisning tillgänglig.',
        riskFlags: flags,
        hoursSinceInbound,
        lastInboundAt: lastInboundAtIso || toIso(Date.now()) || new Date().toISOString(),
        lastOutboundAt: lastOutboundAtIso || null,
        slaBreached: isSlaBreached,
        slaDeadlineAt: slaDeadlineIso,
        slaStatus,
        hoursRemaining,
        slaThreshold,
        isUnanswered,
        unansweredThresholdHours,
        stagnated,
        stagnationHours,
        followUpSuggested,
        intent,
        intentConfidence,
        tone,
        toneConfidence,
        priorityLevel: priorityInfo.priorityLevel,
        priorityScore: priorityInfo.priorityScore,
        priorityReasons,
        customerKey: customerSummary.customerKey,
        customerSummary,
        tempoProfile: tempoInfo.tempoProfile,
        recommendedFollowUpDelayDays: tempoInfo.recommendedFollowUpDelayDays,
        ctaIntensity: tempoInfo.ctaIntensity,
        followUpSuggestedAt: timingSuggestion.suggestedDateTime,
        followUpTimingReason: asArray(timingSuggestion.reasoning)
          .map((item) => normalizeText(item))
          .filter(Boolean)
          .slice(0, 6),
        followUpUrgencyLevel: (() => {
          const urgency = normalizeText(timingSuggestion.urgencyLevel).toLowerCase();
          return ['low', 'normal', 'high'].includes(urgency) ? urgency : 'normal';
        })(),
        followUpManualApprovalRequired: timingSuggestion.manualApprovalRequired !== false,
        estimatedWorkMinutes: workload.estimatedMinutes,
        workloadBreakdown: asObject(workload.breakdown),
        dominantRisk,
        riskStackScore,
        riskStackExplanation,
        recommendedAction,
        escalationRequired,
        needsReplyStatus,
      };

      if (unanswered) {
        conversationWorklist.push({
          conversationId: workItem.conversationId,
          messageId: workItem.messageId,
          mailboxId: workItem.mailboxId,
          mailboxAddress: workItem.mailboxAddress || null,
          userPrincipalName: workItem.userPrincipalName || null,
          subject: conversation.subject,
          sender: workItem.sender,
          latestInboundPreview: workItem.latestInboundPreview,
          hoursSinceInbound: workItem.hoursSinceInbound,
          lastInboundAt: workItem.lastInboundAt,
          lastOutboundAt: workItem.lastOutboundAt,
          slaStatus: workItem.slaStatus,
          hoursRemaining: workItem.hoursRemaining,
          slaThreshold: workItem.slaThreshold,
          isUnanswered: workItem.isUnanswered,
          unansweredThresholdHours: workItem.unansweredThresholdHours,
          stagnated: workItem.stagnated,
          stagnationHours: workItem.stagnationHours,
          followUpSuggested: workItem.followUpSuggested,
          intent: workItem.intent,
          intentConfidence: workItem.intentConfidence,
          tone: workItem.tone,
          toneConfidence: workItem.toneConfidence,
          priorityLevel: workItem.priorityLevel,
          priorityScore: workItem.priorityScore,
          priorityReasons: workItem.priorityReasons,
          customerKey: workItem.customerKey,
          customerSummary: workItem.customerSummary,
          tempoProfile: workItem.tempoProfile,
          recommendedFollowUpDelayDays: workItem.recommendedFollowUpDelayDays,
          ctaIntensity: workItem.ctaIntensity,
          followUpSuggestedAt: workItem.followUpSuggestedAt,
          followUpTimingReason: workItem.followUpTimingReason,
          followUpUrgencyLevel: workItem.followUpUrgencyLevel,
          followUpManualApprovalRequired: workItem.followUpManualApprovalRequired,
          estimatedWorkMinutes: workItem.estimatedWorkMinutes,
          workloadBreakdown: workItem.workloadBreakdown,
          dominantRisk: workItem.dominantRisk,
          riskStackScore: workItem.riskStackScore,
          riskStackExplanation: workItem.riskStackExplanation,
          recommendedAction: workItem.recommendedAction,
          escalationRequired: workItem.escalationRequired,
          needsReplyStatus: workItem.needsReplyStatus,
        });
        unresolved.push(workItem);
      }
    }

    unresolved.sort(compareWorkItemsBySlaAndPriority);
    conversationWorklist.sort(compareWorkItemsBySlaAndPriority);

    const suggestedDrafts = [];
    for (const item of unresolved.slice(0, maxDrafts)) {
      const riskWeight = item.riskFlags.reduce(
        (sum, flag) => sum + severityWeight(flag.severity) * 10,
        0
      );
      const isMedicalTopic = MEDICAL_TOPIC_PATTERN.test(
        `${item.conversation.subject}\n${item.latestInboundPreview}`
      );
      const isAcute = item.riskFlags.some((flag) => flag.code === 'ACUTE_URGENT');
      const confidenceScore = Math.max(
        10,
        Math.min(
          95,
          82 -
            (item.slaBreached ? 14 : 0) -
            Math.min(34, riskWeight) +
            (normalizeText(item.latestInboundPreview) ? 8 : 0)
        )
      );
      const draftComposition = await buildDraftReply({
        subject: item.conversation.subject,
        inboundPreview: item.latestInboundPreview,
        priorityLevel: item.priorityLevel,
        isMedicalTopic,
        isAcute,
        intent: item.intent,
        tone: item.tone,
        toneStyle,
        customerProfile: item.conversation.customerContext,
        writingProfile: item.writingProfile,
      });
      suggestedDrafts.push({
        conversationId: item.conversationId,
        messageId: item.messageId,
        mailboxId: item.mailboxId,
        mailboxAddress: item.mailboxAddress || null,
        userPrincipalName: item.userPrincipalName || null,
        subject: item.conversation.subject,
        sender: item.sender,
        latestInboundPreview: item.latestInboundPreview,
        hoursSinceInbound: item.hoursSinceInbound,
        slaStatus: item.slaStatus,
        hoursRemaining: item.hoursRemaining,
        slaThreshold: item.slaThreshold,
        isUnanswered: item.isUnanswered,
        unansweredThresholdHours: item.unansweredThresholdHours,
        stagnated: item.stagnated,
        stagnationHours: item.stagnationHours,
        followUpSuggested: item.followUpSuggested,
        intent: item.intent,
        intentConfidence: item.intentConfidence,
        tone: item.tone,
        toneConfidence: item.toneConfidence,
        priorityLevel: item.priorityLevel,
        priorityScore: item.priorityScore,
        priorityReasons: item.priorityReasons,
        customerKey: item.customerKey,
        customerSummary: item.customerSummary,
        tempoProfile: item.tempoProfile,
        recommendedFollowUpDelayDays: item.recommendedFollowUpDelayDays,
        ctaIntensity: item.ctaIntensity,
        followUpSuggestedAt: item.followUpSuggestedAt,
        followUpTimingReason: item.followUpTimingReason,
        followUpUrgencyLevel: item.followUpUrgencyLevel,
        followUpManualApprovalRequired: item.followUpManualApprovalRequired,
        estimatedWorkMinutes: item.estimatedWorkMinutes,
        workloadBreakdown: item.workloadBreakdown,
        dominantRisk: item.dominantRisk,
        riskStackScore: item.riskStackScore,
        riskStackExplanation: item.riskStackExplanation,
        recommendedAction: item.recommendedAction,
        escalationRequired: item.escalationRequired,
        draftModes: draftComposition.draftModes,
        recommendedMode: draftComposition.recommendedMode,
        structureUsed: draftComposition.structureUsed,
        suggestedReply: draftComposition.proposedReply,
        proposedReply: draftComposition.proposedReply,
        confidenceLevel: mapConfidence(confidenceScore),
      });
    }

    const overallPriority = unresolved.reduce((current, item) => {
      const rank = { Low: 1, Medium: 2, High: 3, Critical: 4 };
      return rank[item.priorityLevel] > rank[current] ? item.priorityLevel : current;
    }, 'Low');

    if (conversations.length === 0) {
      warnings.push('Inga konversationer hittades i systemStateSnapshot.');
    }
    if (maskedPreviewCount > 0) {
      warnings.push(`Maskerade ${maskedPreviewCount} bodyPreview-fält i inkommande underlag.`);
    }
    warnings.push('Föreslagna utkast är endast förslag och kräver manuell granskning före eventuell skickning.');
    if (!toIso(snapshotSource?.timestamps?.capturedAt)) {
      warnings.push('systemStateSnapshot saknar tydlig capturedAt-tidsstämpel.');
    }

    const executiveSummary = [
      `Inboxanalys klar: ${unresolved.length} obesvarade konversationer.`,
      `${mailboxCount} postlådor och ${messageCount} meddelanden analyserade.`,
      `${slaBreaches.length} SLA-brott och ${riskFlags.length} riskflaggor identifierade.`,
      `${suggestedDrafts.length} svarsutkast förberedda för manuell granskning.`,
      `Prioritet: ${formatPriorityLevelSv(overallPriority)}.`,
    ].join(' ');

    const sourceMailboxIds = (() => {
      const fromMetadata = asArray(snapshotMetadata.mailboxIds)
        .map((item) => normalizeText(item))
        .filter(Boolean);
      if (fromMetadata.length > 0) return fromMetadata.slice(0, 50);
      return Array.from(
        new Set(
          conversations
            .map((item) => normalizeText(item?.mailboxId) || normalizeText(item?.mailboxAddress))
            .filter(Boolean)
        )
      ).slice(0, 50);
    })();
    const customerSummaries = Array.from(customerSummariesByKey.values())
      .sort((left, right) => {
        const leftMs = toTimestampMs(left?.lastInteractionAt) || 0;
        const rightMs = toTimestampMs(right?.lastInteractionAt) || 0;
        return rightMs - leftMs;
      })
      .slice(0, 120);
    const strategicGeneratedAt = toIso(snapshotSource?.timestamps?.capturedAt) || new Date().toISOString();
    const strategicUsageMetrics = toStrategicUsageMetrics({
      conversationWorklist,
      unresolvedCount: unresolved.length,
      slaBreachCount: slaBreaches.length,
    });
    const complaintCount = conversationWorklist.filter(
      (row) => normalizeText(row?.intent).toLowerCase() === 'complaint'
    ).length;
    const fallbackDailySignals = toDerivedDailySignals({
      conversationWorklist,
      usageMetrics: strategicUsageMetrics,
      nowMs: Date.now(),
      days: 14,
    });
    const strategicDailySignals = normalizeStrategicDailySignals(
      asArray(snapshotSource?.dailySignals).length
        ? snapshotSource?.dailySignals
        : asArray(input.dailySignals),
      fallbackDailySignals
    );
    const fallbackFocusContext = toDerivedFocusContext({
      source: asObject(snapshotSource?.focusContext || input.focusContext),
      usageMetrics: strategicUsageMetrics,
      slaBreachCount: slaBreaches.length,
      complaintCount,
    });
    const fallbackMonthlyRisk = {
      windowDays: 30,
      sampleSize: 0,
      riskBand: 'low',
      riskIndex: 0,
      dominantDrivers: [],
      recommendations: ['Ingen data tillganglig for manadsanalys.'],
      generatedAt: strategicGeneratedAt,
    };
    const fallbackScenarioSimulation = {
      baseline: {
        healthScore: clamp(strategicUsageMetrics.healthScore, 0, 100, 100),
        slaBreachRate: clamp(
          conversationWorklist.length > 0 ? slaBreaches.length / conversationWorklist.length : 0,
          0,
          1,
          0
        ),
        complaintRate: clamp(
          conversationWorklist.length > 0 ? complaintCount / conversationWorklist.length : 0,
          0,
          1,
          0
        ),
        conversionSignal: clamp(strategicUsageMetrics.conversionSignal, 0, 1, 0),
        workloadMinutes: unresolved
          .slice(0, 3)
          .reduce((sum, row) => sum + Math.max(0, toNumber(row?.estimatedWorkMinutes, 0)), 0),
        volatilityIndex: clamp(strategicUsageMetrics.volatilityIndex, 0, 1, 0),
      },
      scenarios: [],
      generatedAt: strategicGeneratedAt,
    };
    const fallbackBusinessThreats = {
      threats: [],
      threatCount: 0,
      highestSeverity: 'none',
      generatedAt: strategicGeneratedAt,
    };
    const fallbackForwardOutlook = {
      riskForecast: {
        type: 'stable',
        probability: 0,
        summary: 'Otillracklig data for riskprognos.',
      },
      capacityForecast: {
        level: 'stable',
        projectedBookingPressure: 0,
        summary: 'Otillracklig data for kapacitetsprognos.',
      },
      recommendedPreparation: ['Samla minst 7 dagars signaldata for att aktivera prognos.'],
      volatilityIndex: clamp(strategicUsageMetrics.volatilityIndex, 0, 1, 0),
      confidenceScore: 0,
      generatedAt: strategicGeneratedAt,
    };
    const fallbackWeeklyBrief = {
      mode: 'normal',
      headline: 'Weekly Brief: begransad data',
      sections: [
        {
          key: 'strategic_signals',
          title: 'Strategiska signaler',
          content: 'Otillracklig data for full weekly-analys.',
        },
      ],
      recommendations: ['Samla mer signaldata for veckovis styrning.'],
      generatedAt: strategicGeneratedAt,
    };
    let monthlyRisk = fallbackMonthlyRisk;
    let scenarioSimulation = fallbackScenarioSimulation;
    let businessThreats = fallbackBusinessThreats;
    let forwardOutlook = fallbackForwardOutlook;
    let weeklyBrief = fallbackWeeklyBrief;
    try {
      monthlyRisk = analyzeMonthlyRisk({
        dailySnapshots: strategicDailySignals,
        windowDays: 30,
        nowIso: strategicGeneratedAt,
      });
      const strategicFlags = [];
      if (slaBreaches.length >= 2 || strategicUsageMetrics.slaBreachTrendPercent > 15) {
        strategicFlags.push({
          isActive: true,
          code: 'sla_cluster',
          title: 'SLA-mönster upptäckt',
          triggerType: 'cluster',
          severity: slaBreaches.length >= 4 ? 'high' : 'medium',
          confidence: 0.72,
          impactScope: 'operations',
          drivers: ['sla_breach'],
          recommendedAction: 'Prioritera SLA-breach före sekundara arenden kommande 48h.',
        });
      }
      if (complaintCount >= 3 || strategicUsageMetrics.complaintTrendPercent > 10) {
        strategicFlags.push({
          isActive: true,
          code: 'complaint_cluster',
          title: 'Complaint-kluster upptäckt',
          triggerType: 'escalation',
          severity: complaintCount >= 5 ? 'high' : 'medium',
          confidence: 0.7,
          impactScope: 'customer_experience',
          drivers: ['complaint_spike'],
          recommendedAction: 'Sakra personliga complaint-svar inom samma arbetsdag.',
        });
      }
      if (
        normalizeText(monthlyRisk?.riskBand).toLowerCase() === 'critical' ||
        normalizeText(monthlyRisk?.riskBand).toLowerCase() === 'high'
      ) {
        strategicFlags.push({
          isActive: true,
          code: 'monthly_risk',
          title: 'Manadsrisk över tröskel',
          triggerType: 'volatility',
          severity: normalizeText(monthlyRisk?.riskBand).toLowerCase(),
          confidence: 0.68,
          impactScope: 'strategic',
          drivers: asArray(monthlyRisk?.dominantDrivers).slice(0, 3),
          recommendedAction:
            asArray(monthlyRisk?.recommendations)[0] ||
            'Skifta till stabiliseringsfokus tills riskindex minskar.',
        });
      }

      scenarioSimulation = simulateScenarios({
        baseline: fallbackScenarioSimulation.baseline,
        scenarios: asArray(input.scenarios),
        nowIso: strategicGeneratedAt,
      });
      businessThreats = analyzeBusinessThreats({
        conversationWorklist,
        usageMetrics: strategicUsageMetrics,
        strategicFlags: strategicFlags.slice(0, 4),
        monthlyRisk,
        nowIso: strategicGeneratedAt,
      });
      forwardOutlook = computeForwardOutlook({
        dailySignals: strategicDailySignals,
        windowDays: 14,
        forecastDays: 7,
        nowIso: strategicGeneratedAt,
      });
      weeklyBrief = composeWeeklyBrief({
        focusContext: fallbackFocusContext,
        usageMetrics: strategicUsageMetrics,
        strategicFlags: strategicFlags.slice(0, 4),
        systemImprovementProposal:
          asArray(businessThreats?.threats).length > 0
            ? {
                proposalTitle: normalizeText(businessThreats?.threats?.[0]?.title),
                rootCauseHypothesis:
                  normalizeText(asArray(businessThreats?.threats?.[0]?.evidence)[0]) ||
                  'Ingen hypotes tillgänglig.',
                recommendedActions: [normalizeText(businessThreats?.threats?.[0]?.recommendedAction)]
                  .filter(Boolean)
                  .slice(0, 3),
                confidenceScore: clamp(
                  businessThreats?.threats?.[0]?.confidence,
                  0,
                  1,
                  0.6
                ),
              }
            : null,
        initiativeSummaries: asArray(snapshotSource?.initiativeSummaries || input.initiativeSummaries),
        windowDays: 7,
        nowIso: strategicGeneratedAt,
      });
    } catch (error) {
      warnings.push(
        `Strategic intelligence fallback aktiverad (${normalizeText(error?.message) || 'unknown_error'}).`
      );
      monthlyRisk = fallbackMonthlyRisk;
      scenarioSimulation = fallbackScenarioSimulation;
      businessThreats = fallbackBusinessThreats;
      forwardOutlook = fallbackForwardOutlook;
      weeklyBrief = fallbackWeeklyBrief;
    }

    const metadata = {
      capability: AnalyzeInboxCapability.name,
      version: AnalyzeInboxCapability.version,
      channel: normalizeText(safeContext.channel) || 'admin',
      deliveryMode: 'manual_review_required',
      toneStyleApplied: toneStyle,
      ccoDefaultSenderMailbox: CCO_DEFAULT_SENDER_MAILBOX,
      ccoSenderMailboxOptions: [
        CCO_DEFAULT_SENDER_MAILBOX,
        ...CCO_SIGNATURE_PROFILES.map((item) => item.senderMailboxId),
      ],
      ccoDefaultSignatureProfile: 'egzona',
      ccoSignatureProfiles: CCO_SIGNATURE_PROFILES.map((item) => ({
        key: item.key,
        fullName: item.fullName,
        title: item.title,
        senderMailboxId: item.senderMailboxId,
      })),
      sourceMailboxIds,
      snapshotDebug: debugMode
        ? buildSnapshotDebugInfo(snapshotSource, {
            unresolvedConversations: unresolved.length,
            slaBreaches: slaBreaches.length,
            riskFlags: riskFlags.length,
            suggestedDrafts: suggestedDrafts.length,
          })
        : undefined,
    };
    const tenantId = normalizeIdentifier(safeContext.tenantId, 120);
    if (tenantId) metadata.tenantId = tenantId;
    const requestId = normalizeIdentifier(safeContext.requestId, 120);
    if (requestId) metadata.requestId = requestId;
    const correlationId = normalizeIdentifier(safeContext.correlationId, 120);
    if (correlationId) metadata.correlationId = correlationId;

    return {
      data: {
        urgentConversations: urgentConversations.slice(0, 25),
        needsReplyToday: needsReplyToday.slice(0, 50),
        conversationWorklist: conversationWorklist.slice(0, 120),
        slaBreaches: slaBreaches.slice(0, 50),
        riskFlags: riskFlags.slice(0, 120),
        suggestedDrafts,
        customerSummaries,
        weeklyBrief,
        monthlyRisk,
        scenarioSimulation,
        businessThreats,
        forwardOutlook,
        executiveSummary,
        priorityLevel: overallPriority,
        mailboxCount,
        messageCount,
      },
      metadata,
      warnings: warnings.slice(0, 30),
    };
  }
}

module.exports = {
  AnalyzeInboxCapability,
  analyzeInboxCapability: AnalyzeInboxCapability,
};
