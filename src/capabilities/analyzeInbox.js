const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { maskInboxText } = require('../privacy/inboxMasking');

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

function capText(value, maxLength = 240) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function sanitizeSubject(value) {
  let subject = capText(value, 180);
  if (!subject) subject = '(utan amne)';
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

function pickPriorityLevel({ slaBreaches = 0, riskFlags = [] } = {}) {
  if (Number(slaBreaches) > 0) return 'High';
  if (asArray(riskFlags).some((item) => severityWeight(item?.severity) >= 3)) return 'High';
  if (asArray(riskFlags).length > 0) return 'Medium';
  return 'Low';
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
  return {
    messageId:
      normalizeText(message.messageId) ||
      normalizeText(message.id) ||
      null,
    direction: normalizeDirection(message.direction || message.role || message.type),
    sentAt: toIso(message.sentAt || message.createdAt || message.ts) || null,
    bodyPreview: bodyMasked,
    masked: Boolean(bodyRaw && bodyRaw !== bodyMasked),
    mailboxId: normalizeText(message.mailboxId || message.mailbox || message.userId) || null,
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
      normalizeText(source.conversationId) ||
      normalizeText(source.threadId) ||
      normalizeText(source.id) ||
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
      normalizeText(source.mailboxId || source.mailbox || source.userId) ||
      normalizeText(lastInbound?.mailboxId) ||
      null,
  };
}

function buildDraftReply({
  subject = '',
  inboundPreview = '',
  riskHits = [],
  isMedicalTopic = false,
  isAcute = false,
  slaBreached = false,
}) {
  const lines = [];
  lines.push('Hej,');
  lines.push('');

  if (isAcute || slaBreached) {
    lines.push(
      'Tack for ditt meddelande. Vi prioriterar detta arende och en ansvarig medarbetare foljer upp skyndsamt.'
    );
  } else if (asArray(riskHits).some((item) => severityWeight(item?.severity) >= 3)) {
    lines.push(
      'Tack for ditt meddelande. Vi har markerat arendet for snabb uppfoljning av ansvarig medarbetare.'
    );
  } else {
    lines.push('Tack for ditt meddelande. Vi har tagit emot din forfragan och aterkommer snarast.');
  }

  if (isMedicalTopic) {
    lines.push(
      'Vi kan inte ge individuell medicinsk bedomning via meddelande. En legitimerad kliniker behover gora en personlig genomgang innan nasta steg.'
    );
  }

  if (isAcute) {
    lines.push(
      'Om du har akuta symtom ska du ring 112 eller kontakta narmaste akutmottagning direkt.'
    );
  }

  if (normalizeText(inboundPreview)) {
    lines.push('Vi bekraftar att vi har noterat detaljerna i ditt meddelande.');
  } else {
    lines.push('For att hjalpa dig snabbare, svara garna med de viktigaste detaljerna i arendet.');
  }

  lines.push(`Arende: ${sanitizeSubject(subject)}`);
  lines.push('');
  lines.push('Med vanlig halsning,');
  lines.push('Hair TP Clinic');

  return lines.join('\n');
}

class AnalyzeInboxCapability extends BaseCapability {
  static name = 'AnalyzeInbox';
  static capabilityName = 'AnalyzeInbox';
  static version = '1.0.0';

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
          'slaBreaches',
          'riskFlags',
          'suggestedDrafts',
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
              required: ['conversationId', 'messageId', 'subject', 'reason', 'hoursSinceInbound'],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 120 },
                messageId: { type: 'string', minLength: 1, maxLength: 120 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                reason: { type: 'string', minLength: 1, maxLength: 120 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
              },
            },
          },
          needsReplyToday: {
            type: 'array',
            maxItems: 80,
            items: {
              type: 'object',
              required: ['conversationId', 'messageId', 'subject', 'hoursSinceInbound'],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 120 },
                messageId: { type: 'string', minLength: 1, maxLength: 120 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
                dueBy: { type: 'string', maxLength: 50 },
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
                conversationId: { type: 'string', minLength: 1, maxLength: 120 },
                messageId: { type: 'string', minLength: 1, maxLength: 120 },
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
                conversationId: { type: 'string', minLength: 1, maxLength: 120 },
                messageId: { type: 'string', minLength: 1, maxLength: 120 },
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
                'subject',
                'proposedReply',
                'confidenceLevel',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 120 },
                messageId: { type: 'string', minLength: 1, maxLength: 120 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                proposedReply: { type: 'string', minLength: 1, maxLength: 3000 },
                confidenceLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
              },
            },
          },
          executiveSummary: { type: 'string', minLength: 1, maxLength: 1200 },
          priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
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
    const debugMode = input.debug === true;
    const includeClosed = input.includeClosed === true;
    const maxDrafts = Math.max(1, Math.min(5, toNumber(input.maxDrafts, 5)));
    const snapshotSource = asObject(safeContext.systemStateSnapshot);
    const rawConversations = asArray(snapshotSource.conversations);
    const conversations = rawConversations
      .map(toConversationSnapshot)
      .filter((item) => item.conversationId);
    const snapshotMetadata = asObject(snapshotSource.metadata);
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
    const warnings = [];
    let maskedPreviewCount = 0;

    for (const conversation of conversations) {
      if (!includeClosed && normalizeText(conversation.status) === 'closed') continue;
      const inbound = asObject(conversation.latestInboundMessage);
      const outbound = asObject(conversation.latestOutboundMessage);
      const inboundAtMs = toTimestampMs(conversation.lastInboundAt || inbound.sentAt);
      const outboundAtMs = toTimestampMs(conversation.lastOutboundAt || outbound.sentAt);
      const unanswered =
        inboundAtMs !== null && (outboundAtMs === null || outboundAtMs < inboundAtMs);
      if (!unanswered) continue;

      const hoursSinceInbound =
        inboundAtMs === null ? 0 : Math.max(0, Math.round(((Date.now() - inboundAtMs) / (60 * 60 * 1000)) * 10) / 10);
      const messageId =
        normalizeText(inbound.messageId) ||
        normalizeText(conversation.conversationId);
      const inboundPreview = normalizeText(inbound.bodyPreview);
      if (inbound.masked === true) maskedPreviewCount += 1;

      const riskInput = `${conversation.rawSubject || conversation.subject}\n${inboundPreview}\n${conversation.rawRiskWords.join(' ')}`;
      const flags = collectRiskFlags(riskInput);
      for (const flag of flags) {
        riskFlags.push({
          conversationId: conversation.conversationId,
          messageId,
          flagCode: flag.code,
          severity: flag.severity,
          reason: `Risk flag ${flag.code} upptackt i inkommande meddelande.`,
        });
      }

      const slaDeadlineIso = toIso(conversation.slaDeadlineAt);
      const slaDeadlineMs = toTimestampMs(slaDeadlineIso);
      const isSlaBreached = slaDeadlineMs !== null && slaDeadlineMs < Date.now();
      if (isSlaBreached) {
        const overdueMinutes = Math.max(0, Math.round((Date.now() - slaDeadlineMs) / (60 * 1000)));
        slaBreaches.push({
          conversationId: conversation.conversationId,
          messageId,
          subject: conversation.subject,
          slaDeadlineAt: slaDeadlineIso,
          overdueMinutes,
        });
      }

      const dueSoon = slaDeadlineMs !== null && slaDeadlineMs <= Date.now() + 24 * 60 * 60 * 1000;
      if (dueSoon || hoursSinceInbound >= 6 || flags.length > 0) {
        needsReplyToday.push({
          conversationId: conversation.conversationId,
          messageId,
          subject: conversation.subject,
          hoursSinceInbound,
          dueBy: slaDeadlineIso || '',
        });
      }

      const hasHighFlag = flags.some((item) => severityWeight(item.severity) >= 3);
      if (isSlaBreached || hasHighFlag || hoursSinceInbound >= 24) {
        urgentConversations.push({
          conversationId: conversation.conversationId,
          messageId,
          subject: conversation.subject,
          reason: isSlaBreached ? 'sla_breach' : hasHighFlag ? 'risk_flag' : 'stale_unanswered',
          hoursSinceInbound,
        });
      }

      unresolved.push({
        conversation,
        messageId,
        inboundPreview,
        riskFlags: flags,
        hoursSinceInbound,
        slaBreached: isSlaBreached,
        slaDeadlineAt: slaDeadlineIso,
      });
    }

    unresolved.sort((a, b) => {
      const scoreA =
        (a.slaBreached ? 120 : 0) +
        a.hoursSinceInbound * 1.5 +
        a.riskFlags.reduce((sum, item) => sum + severityWeight(item.severity) * 8, 0);
      const scoreB =
        (b.slaBreached ? 120 : 0) +
        b.hoursSinceInbound * 1.5 +
        b.riskFlags.reduce((sum, item) => sum + severityWeight(item.severity) * 8, 0);
      return scoreB - scoreA;
    });

    const suggestedDrafts = unresolved.slice(0, maxDrafts).map((item) => {
      const riskWeight = item.riskFlags.reduce(
        (sum, flag) => sum + severityWeight(flag.severity) * 10,
        0
      );
      const isMedicalTopic = MEDICAL_TOPIC_PATTERN.test(
        `${item.conversation.subject}\n${item.inboundPreview}`
      );
      const isAcute = item.riskFlags.some((flag) => flag.code === 'ACUTE_URGENT');
      const confidenceScore = Math.max(
        10,
        Math.min(
          95,
          80 -
            (item.slaBreached ? 15 : 0) -
            Math.min(30, riskWeight) +
            (normalizeText(item.inboundPreview) ? 10 : 0)
        )
      );
      return {
        conversationId: item.conversation.conversationId,
        messageId: item.messageId,
        subject: item.conversation.subject,
        proposedReply: buildDraftReply({
          subject: item.conversation.subject,
          inboundPreview: item.inboundPreview,
          riskHits: item.riskFlags,
          isMedicalTopic,
          isAcute,
          slaBreached: item.slaBreached,
        }),
        confidenceLevel: mapConfidence(confidenceScore),
      };
    });

    const priorityLevel = pickPriorityLevel({
      slaBreaches: slaBreaches.length,
      riskFlags,
    });

    if (conversations.length === 0) {
      warnings.push('Inga konversationer hittades i systemStateSnapshot.');
    }
    if (maskedPreviewCount > 0) {
      warnings.push(`Maskerade ${maskedPreviewCount} bodyPreview-falt i inkommande underlag.`);
    }
    warnings.push('Suggested drafts ar endast forslag och kraver manuell granskning fore eventuell skickning.');
    if (!toIso(snapshotSource?.timestamps?.capturedAt)) {
      warnings.push('systemStateSnapshot saknar tydlig capturedAt timestamp.');
    }

    const executiveSummary = [
      `Inboxanalys klar: ${unresolved.length} obesvarade konversationer.`,
      `${mailboxCount} mailboxar och ${messageCount} meddelanden analyserade.`,
      `${slaBreaches.length} SLA-brott och ${riskFlags.length} riskflaggor identifierade.`,
      `${suggestedDrafts.length} svarsutkast forberedda for manuell granskning.`,
      `Prioritet: ${priorityLevel}.`,
    ].join(' ');

    return {
      data: {
        urgentConversations: urgentConversations.slice(0, 25),
        needsReplyToday: needsReplyToday.slice(0, 50),
        slaBreaches: slaBreaches.slice(0, 50),
        riskFlags: riskFlags.slice(0, 120),
        suggestedDrafts,
        executiveSummary,
        priorityLevel,
        mailboxCount,
        messageCount,
      },
      metadata: {
        capability: AnalyzeInboxCapability.name,
        version: AnalyzeInboxCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
        deliveryMode: 'manual_review_required',
        snapshotDebug: debugMode
          ? buildSnapshotDebugInfo(snapshotSource, {
              unresolvedConversations: unresolved.length,
              slaBreaches: slaBreaches.length,
              riskFlags: riskFlags.length,
              suggestedDrafts: suggestedDrafts.length,
            })
          : undefined,
      },
      warnings: warnings.slice(0, 30),
    };
  }
}

module.exports = {
  AnalyzeInboxCapability,
  analyzeInboxCapability: AnalyzeInboxCapability,
};
