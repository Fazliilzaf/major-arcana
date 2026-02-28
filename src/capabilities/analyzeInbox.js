const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { maskInboxText } = require('../privacy/inboxMasking');
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

function capText(value, maxLength = 240) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
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

const INTENT_DEFS = Object.freeze([
  {
    id: 'booking_request',
    patterns: [/\b(boka|bokning|boka tid|konsultation|appointment|reserv(er|ation)|tid hos)\b/i],
    baseWeight: 22,
  },
  {
    id: 'pricing_question',
    patterns: [/\b(pris|priser|kostnad|erbjudande|finansiering|delbetalning|paket)\b/i],
    baseWeight: 18,
  },
  {
    id: 'anxiety_pre_op',
    patterns: [/\b(radd|orolig|nervos|angest|inf(or|or) operation|fore operation)\b/i],
    baseWeight: 20,
  },
  {
    id: 'complaint',
    patterns: [/\b(missnojd|klagomal|fel|dalig upplevelse|besviken|anmalan|ersattning)\b/i],
    baseWeight: 24,
  },
  {
    id: 'cancellation',
    patterns: [/\b(avbok|ombok|stalla in|kan inte komma|cancel|reschedule)\b/i],
    baseWeight: 15,
  },
  {
    id: 'follow_up',
    patterns: [/\b(folja upp|uppfoljning|status|aterkoppling|horde ni|vill bara kolla)\b/i],
    baseWeight: 12,
  },
]);

const TONE_DEFS = Object.freeze([
  {
    id: 'urgent',
    patterns: [/\b(akut|snabbt|omedelbart|nu direkt|asap|sa fort som mojligt)\b/i, /!{2,}/],
    baseWeight: 24,
  },
  {
    id: 'frustrated',
    patterns: [/\b(irriterad|besviken|arg|upprord|inte okej|varfor svarar ni inte)\b/i],
    baseWeight: 20,
  },
  {
    id: 'anxious',
    patterns: [/\b(orolig|radd|angest|nervos|stressad over|hjalp mig snalla)\b/i],
    baseWeight: 18,
  },
  {
    id: 'stressed',
    patterns: [/\b(stressad|pressad|svart att hantera|sover inte|kan inte vanta)\b/i],
    baseWeight: 15,
  },
  {
    id: 'positive',
    patterns: [/\b(tack|uppskattar|fantastiskt|jattenojd|super|bra service)\b/i],
    baseWeight: 8,
  },
]);

const INTENT_ACTIONS = Object.freeze({
  booking_request: 'Boka tid',
  pricing_question: 'Skicka prisinformation',
  anxiety_pre_op: 'Be om mer info',
  complaint: 'Eskalera',
  cancellation: 'Bekräfta ändring',
  follow_up: 'Ge statusuppdatering',
  unclear: 'Be om mer info',
});

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

function pickPriorityLevel({ score = 0, hasCriticalSignal = false } = {}) {
  if (hasCriticalSignal || score >= 85) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 30) return 'Medium';
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
  const senderEmail =
    normalizeText(message.senderEmail) ||
    normalizeText(message.fromEmail) ||
    normalizeText(message?.from?.emailAddress?.address);
  const senderName =
    normalizeText(message.senderName) ||
    normalizeText(message.fromName) ||
    normalizeText(message?.from?.emailAddress?.name);
  const senderRaw = senderName || senderEmail;
  return {
    messageId:
      normalizeOpaqueId(message.messageId) ||
      normalizeOpaqueId(message.id) ||
      null,
    direction: normalizeDirection(message.direction || message.role || message.type),
    sentAt: toIso(message.sentAt || message.createdAt || message.ts) || null,
    bodyPreview: bodyMasked,
    masked: Boolean(bodyRaw && bodyRaw !== bodyMasked),
    mailboxId:
      normalizeOpaqueId(message.mailboxId || message.mailbox || message.userId) || null,
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
    sender:
      maskSender(
        normalizeText(source.sender) ||
          normalizeText(source.senderEmail) ||
          normalizeText(lastInbound?.sender)
      ) || null,
  };
}

function scoreSemanticMatch(text = '', definition = {}) {
  const source = normalizeText(text).toLowerCase();
  if (!source) return 0;
  const patterns = asArray(definition.patterns);
  let score = Number(definition.baseWeight || 0);
  let matches = 0;
  for (const pattern of patterns) {
    if (!(pattern instanceof RegExp)) continue;
    if (!pattern.test(source)) continue;
    matches += 1;
    score += 6;
  }
  if (matches === 0) return 0;
  return score;
}

function classifyIntent(text = '') {
  let bestIntent = 'unclear';
  let bestScore = 0;
  for (const definition of INTENT_DEFS) {
    const score = scoreSemanticMatch(text, definition);
    if (score <= bestScore) continue;
    bestIntent = definition.id;
    bestScore = score;
  }
  return {
    intent: bestIntent,
    score: bestScore,
  };
}

function detectTone(text = '') {
  let bestTone = 'neutral';
  let bestScore = 0;
  for (const definition of TONE_DEFS) {
    const score = scoreSemanticMatch(text, definition);
    if (score <= bestScore) continue;
    bestTone = definition.id;
    bestScore = score;
  }
  return {
    tone: bestTone,
    score: bestScore,
  };
}

function computeSlaStatus({ slaBreached = false, slaDeadlineMs = null, hoursSinceInbound = 0 } = {}) {
  if (slaBreached) return 'breached';
  if (Number.isFinite(slaDeadlineMs)) {
    const msLeft = slaDeadlineMs - Date.now();
    if (msLeft <= 24 * 60 * 60 * 1000) return 'due_24h';
    if (msLeft <= 48 * 60 * 60 * 1000) return 'due_48h';
  }
  if (hoursSinceInbound >= 48) return 'aging_48h';
  if (hoursSinceInbound >= 24) return 'aging_24h';
  return 'ok';
}

function computePriorityScore({
  hoursSinceInbound = 0,
  tone = 'neutral',
  intent = 'unclear',
  previousInteractions = 0,
  revenueSignal = false,
  riskFlags = [],
  slaBreached = false,
  slaStatus = 'ok',
} = {}) {
  const safeHours = Math.max(0, Number(hoursSinceInbound) || 0);
  const toneWeights = {
    neutral: 0,
    stressed: 12,
    anxious: 18,
    frustrated: 22,
    urgent: 28,
    positive: -6,
  };
  const intentWeights = {
    booking_request: 12,
    pricing_question: 8,
    anxiety_pre_op: 16,
    complaint: 24,
    cancellation: 10,
    follow_up: 6,
    unclear: 4,
  };

  let score = 0;
  score += Math.min(45, safeHours * 1.8);
  score += Number(toneWeights[tone] || 0);
  score += Number(intentWeights[intent] || 0);
  score += Math.min(14, Math.max(0, Number(previousInteractions) || 0) * 2);
  if (revenueSignal) score += 10;
  if (slaStatus === 'due_24h') score += 14;
  if (slaStatus === 'due_48h') score += 8;
  if (slaStatus === 'aging_24h') score += 12;
  if (slaStatus === 'aging_48h') score += 18;
  if (slaBreached) score += 25;
  score += asArray(riskFlags).reduce((sum, item) => sum + severityWeight(item?.severity) * 9, 0);

  const hasCriticalSignal =
    slaBreached ||
    tone === 'urgent' ||
    asArray(riskFlags).some((item) => severityWeight(item?.severity) >= 4);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    level: pickPriorityLevel({ score, hasCriticalSignal }),
  };
}

function buildTonePrefix({ tone = 'neutral', toneStyle = 'balanserad' } = {}) {
  if (tone === 'urgent') {
    return toneStyle === 'professionell'
      ? 'Tack for ditt meddelande. Vi prioriterar detta omedelbart och aterkommer skyndsamt.'
      : 'Tack for ditt meddelande. Vi ser allvarligt pa detta och foljer upp direkt.';
  }
  if (tone === 'anxious' || tone === 'stressed') {
    return toneStyle === 'professionell'
      ? 'Tack for att du delar detta. Vi forstar att situationen kan kanslas pressande.'
      : 'Tack for att du hor av dig. Vi forstar att det kan kanslas oroligt och vill hjalpa dig tryggt vidare.';
  }
  if (tone === 'frustrated') {
    return toneStyle === 'professionell'
      ? 'Tack for din aterkoppling. Vi tar detta pa stort allvar och vill losa det skyndsamt.'
      : 'Tack for att du beskriver detta tydligt. Vi tar det pa allvar och vill losa det snabbt.';
  }
  if (tone === 'positive') {
    return 'Tack for ditt meddelande och fortroende.';
  }
  return toneStyle === 'professionell'
    ? 'Tack for ditt meddelande. Vi har tagit emot din forfragan.'
    : 'Tack for ditt meddelande. Vi har tagit emot din forfragan och foljer upp snarast.';
}

function buildCtaLine(intent = 'unclear') {
  if (intent === 'booking_request') {
    return 'Foreslaget nasta steg: boka en konsultationstid sa att vi kan hjalpa dig vidare direkt.';
  }
  if (intent === 'pricing_question') {
    return 'Foreslaget nasta steg: vi skickar prisalternativ och hjalper dig valja ratt upplagg.';
  }
  if (intent === 'cancellation') {
    return 'Foreslaget nasta steg: bekrafta onskad tid eller ombokning sa uppdaterar vi dig direkt.';
  }
  if (intent === 'complaint') {
    return 'Foreslaget nasta steg: en ansvarig medarbetare granskar arendet och aterkommer personligen.';
  }
  return 'Foreslaget nasta steg: svara garna med mer detaljer sa att vi kan ge exakt hjalp.';
}

function buildDraftReply({
  subject = '',
  inboundPreview = '',
  riskHits = [],
  isMedicalTopic = false,
  isAcute = false,
  slaBreached = false,
  intent = 'unclear',
  tone = 'neutral',
  toneStyle = 'balanserad',
}) {
  const lines = [];
  lines.push('Hej,');
  lines.push('');
  lines.push(buildTonePrefix({ tone, toneStyle }));

  if (isAcute || slaBreached) {
    lines.push('Vi har markerat arendet for prioriterad uppfoljning av ansvarig medarbetare.');
  } else if (asArray(riskHits).some((item) => severityWeight(item?.severity) >= 3)) {
    lines.push('Arendet ar markerat for snabb uppfoljning sa att du far tydlig aterkoppling.');
  }

  if (isMedicalTopic) {
    lines.push(
      'Vi kan inte ge individuell medicinsk bedomning via meddelande. En legitimerad kliniker behover gora en personlig genomgang innan nasta steg.'
    );
  }

  if (isAcute) {
    lines.push('Om du har akuta symtom ska du ring 112 eller kontakta narmaste akutmottagning direkt.');
  }

  if (normalizeText(inboundPreview)) {
    lines.push('Vi har noterat uppgifterna i ditt meddelande.');
  } else {
    lines.push('For att hjalpa dig snabbare, svara garna med de viktigaste detaljerna i arendet.');
  }

  lines.push(buildCtaLine(intent));
  lines.push(`Arende: ${sanitizeSubject(subject)}`);
  lines.push('');
  lines.push('Med vanlig halsning,');
  lines.push('Hair TP Clinic');

  return lines.join('\n');
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
                'intent',
                'tone',
                'priorityLevel',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                reason: { type: 'string', minLength: 1, maxLength: 120 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
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
                tone: {
                  type: 'string',
                  enum: ['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'],
                },
                priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
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
                'intent',
                'tone',
                'priorityLevel',
                'needsReplyStatus',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                mailboxId: { type: 'string', minLength: 1, maxLength: 320 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                sender: { type: 'string', minLength: 1, maxLength: 120 },
                latestInboundPreview: { type: 'string', minLength: 1, maxLength: 360 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
                dueBy: { type: 'string', maxLength: 50 },
                slaStatus: {
                  type: 'string',
                  enum: ['ok', 'due_48h', 'due_24h', 'aging_24h', 'aging_48h', 'breached'],
                },
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
                tone: {
                  type: 'string',
                  enum: ['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'],
                },
                priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
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
                'slaStatus',
                'intent',
                'tone',
                'priorityLevel',
                'priorityScore',
                'recommendedAction',
                'escalationRequired',
                'needsReplyStatus',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                mailboxId: { type: 'string', minLength: 1, maxLength: 320 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                sender: { type: 'string', minLength: 1, maxLength: 120 },
                latestInboundPreview: { type: 'string', minLength: 1, maxLength: 360 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
                lastInboundAt: { type: 'string', minLength: 1, maxLength: 50 },
                slaStatus: {
                  type: 'string',
                  enum: ['ok', 'due_48h', 'due_24h', 'aging_24h', 'aging_48h', 'breached'],
                },
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
                tone: {
                  type: 'string',
                  enum: ['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'],
                },
                priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
                priorityScore: { type: 'number', minimum: 0, maximum: 100 },
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
                'intent',
                'tone',
                'priorityLevel',
                'priorityScore',
                'recommendedAction',
                'escalationRequired',
                'suggestedReply',
                'proposedReply',
                'confidenceLevel',
              ],
              additionalProperties: false,
              properties: {
                conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
                messageId: { type: 'string', minLength: 1, maxLength: 1024 },
                mailboxId: { type: 'string', minLength: 1, maxLength: 320 },
                subject: { type: 'string', minLength: 1, maxLength: 200 },
                sender: { type: 'string', minLength: 1, maxLength: 120 },
                latestInboundPreview: { type: 'string', minLength: 1, maxLength: 360 },
                hoursSinceInbound: { type: 'number', minimum: 0 },
                slaStatus: {
                  type: 'string',
                  enum: ['ok', 'due_48h', 'due_24h', 'aging_24h', 'aging_48h', 'breached'],
                },
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
                tone: {
                  type: 'string',
                  enum: ['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'],
                },
                priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
                priorityScore: { type: 'number', minimum: 0, maximum: 100 },
                recommendedAction: { type: 'string', minLength: 1, maxLength: 120 },
                escalationRequired: { type: 'boolean' },
                suggestedReply: { type: 'string', minLength: 1, maxLength: 3000 },
                proposedReply: { type: 'string', minLength: 1, maxLength: 3000 },
                confidenceLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
              },
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
    const debugMode = input.debug === true;
    const includeClosed = input.includeClosed === true;
    const maxDrafts = Math.max(1, Math.min(5, toNumber(input.maxDrafts, 5)));
    const snapshotSource = asObject(safeContext.systemStateSnapshot);
    const snapshotMetadata = asObject(snapshotSource.metadata);
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

      const intentResult = classifyIntent(semanticInput);
      const toneResult = detectTone(semanticInput);
      const intent = intentResult.intent;
      const tone = toneResult.tone;

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

      const slaDeadlineIso = toIso(conversation.slaDeadlineAt);
      const slaDeadlineMs = toTimestampMs(slaDeadlineIso);
      const isSlaBreached = slaDeadlineMs !== null && slaDeadlineMs < Date.now();
      const slaStatus = computeSlaStatus({
        slaBreached: isSlaBreached,
        slaDeadlineMs,
        hoursSinceInbound,
      });
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
      const messageThreadCount = asArray(conversation.messages).length;
      const revenueSignal = intent === 'booking_request' || intent === 'pricing_question';
      const priorityInfo = computePriorityScore({
        hoursSinceInbound,
        tone,
        intent,
        previousInteractions: messageThreadCount,
        revenueSignal,
        riskFlags: flags,
        slaBreached: isSlaBreached,
        slaStatus,
      });
      const escalationRequired =
        priorityInfo.level === 'Critical' ||
        intent === 'complaint' ||
        flags.some((item) => severityWeight(item.severity) >= 4);
      const recommendedAction = INTENT_ACTIONS[intent] || INTENT_ACTIONS.unclear;
      const sender = normalizeText(conversation.sender || inbound.sender) || 'okand avsandare';

      if (dueSoon || hoursSinceInbound >= 6 || flags.length > 0) {
        needsReplyToday.push({
          conversationId: conversation.conversationId,
          messageId,
          mailboxId: normalizeText(conversation.mailboxId) || 'unknown-mailbox',
          subject: conversation.subject,
          sender,
          latestInboundPreview: inboundPreview || 'Ingen preview tillganglig.',
          hoursSinceInbound,
          dueBy: slaDeadlineIso || '',
          slaStatus,
          intent,
          tone,
          priorityLevel: priorityInfo.level,
          needsReplyStatus: 'needs_reply',
        });
      }

      const hasHighFlag = flags.some((item) => severityWeight(item.severity) >= 3);
      if (isSlaBreached || hasHighFlag || hoursSinceInbound >= 24 || priorityInfo.level === 'Critical') {
        urgentConversations.push({
          conversationId: conversation.conversationId,
          messageId,
          subject: conversation.subject,
          reason: isSlaBreached ? 'sla_breach' : hasHighFlag ? 'risk_flag' : 'stale_unanswered',
          hoursSinceInbound,
          intent,
          tone,
          priorityLevel: priorityInfo.level,
        });
      }

      const workItem = {
        conversation: conversation,
        conversationId: conversation.conversationId,
        messageId,
        mailboxId: normalizeText(conversation.mailboxId) || 'unknown-mailbox',
        sender,
        latestInboundPreview: inboundPreview || 'Ingen preview tillganglig.',
        riskFlags: flags,
        hoursSinceInbound,
        slaBreached: isSlaBreached,
        slaDeadlineAt: slaDeadlineIso,
        slaStatus,
        intent,
        tone,
        priorityLevel: priorityInfo.level,
        priorityScore: priorityInfo.score,
        recommendedAction,
        escalationRequired,
        needsReplyStatus: 'needs_reply',
      };

      conversationWorklist.push({
        conversationId: workItem.conversationId,
        messageId: workItem.messageId,
        mailboxId: workItem.mailboxId,
        subject: conversation.subject,
        sender: workItem.sender,
        latestInboundPreview: workItem.latestInboundPreview,
        hoursSinceInbound: workItem.hoursSinceInbound,
        lastInboundAt: conversation.lastInboundAt || toIso(Date.now()) || new Date().toISOString(),
        slaStatus: workItem.slaStatus,
        intent: workItem.intent,
        tone: workItem.tone,
        priorityLevel: workItem.priorityLevel,
        priorityScore: workItem.priorityScore,
        recommendedAction: workItem.recommendedAction,
        escalationRequired: workItem.escalationRequired,
        needsReplyStatus: workItem.needsReplyStatus,
      });

      unresolved.push(workItem);
    }

    unresolved.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return b.hoursSinceInbound - a.hoursSinceInbound;
    });

    const suggestedDrafts = unresolved.slice(0, maxDrafts).map((item) => {
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
      const draftedReply = buildDraftReply({
        subject: item.conversation.subject,
        inboundPreview: item.latestInboundPreview,
        riskHits: item.riskFlags,
        isMedicalTopic,
        isAcute,
        slaBreached: item.slaBreached,
        intent: item.intent,
        tone: item.tone,
        toneStyle,
      });
      return {
        conversationId: item.conversationId,
        messageId: item.messageId,
        mailboxId: item.mailboxId,
        subject: item.conversation.subject,
        sender: item.sender,
        latestInboundPreview: item.latestInboundPreview,
        hoursSinceInbound: item.hoursSinceInbound,
        slaStatus: item.slaStatus,
        intent: item.intent,
        tone: item.tone,
        priorityLevel: item.priorityLevel,
        priorityScore: item.priorityScore,
        recommendedAction: item.recommendedAction,
        escalationRequired: item.escalationRequired,
        suggestedReply: draftedReply,
        proposedReply: draftedReply,
        confidenceLevel: mapConfidence(confidenceScore),
      };
    });

    const overallPriority = unresolved.reduce((current, item) => {
      const rank = { Low: 1, Medium: 2, High: 3, Critical: 4 };
      return rank[item.priorityLevel] > rank[current] ? item.priorityLevel : current;
    }, 'Low');

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
      `Prioritet: ${overallPriority}.`,
    ].join(' ');

    const metadata = {
      capability: AnalyzeInboxCapability.name,
      version: AnalyzeInboxCapability.version,
      channel: normalizeText(safeContext.channel) || 'admin',
      deliveryMode: 'manual_review_required',
      toneStyleApplied: toneStyle,
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
