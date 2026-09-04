const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function toIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createHash(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
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

function normalizeActionState(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'handled') return 'handled';
  if (normalized === 'reply_later') return 'reply_later';
  // ORD-217: arkiverad är ett EGET tillstånd, inte en synonym för handled.
  // Båda döljer tråden ur arbetslistan, men de betyder olika saker i audit och
  // i uppföljning: handled = besvarad, archived = undanlagd utan svar.
  if (normalized === 'archived') return 'archived';
  return '';
}

function normalizeNeedsReplyStatusOverride(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'handled') return 'handled';
  if (normalized === 'needs_reply') return 'needs_reply';
  return '';
}

function normalizeCanonicalConversationSource(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'merge_identity') return 'merge_identity';
  if (normalized === 'mailbox_conversation_fallback') return 'mailbox_conversation_fallback';
  return 'mailbox_conversation_fallback';
}

function normalizeCanonicalConversationType(value = '') {
  const normalized = normalizeText(value);
  if (
    [
      'explicitMergeGroupId',
      'canonicalContactId',
      'canonicalCustomerId',
      'conversationKey',
    ].includes(normalized)
  ) {
    return normalized;
  }
  return 'conversationKey';
}

function normalizeWaitingOn(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'customer') return 'customer';
  if (normalized === 'owner') return 'owner';
  return null;
}

function normalizeSupersededReason(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (
    ['new_inbound', 'reply_sent', 'merge_migrated', 'merge_conflict_lost', 'manual_clear'].includes(
      normalized
    )
  ) {
    return normalized;
  }
  return null;
}

function normalizeBookingEvent(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = normalizeText(value.kind).toLowerCase();
  if (!['created', 'confirmed', 'cancelled', 'rescheduled'].includes(kind)) return null;
  const at = toIso(value.at) || nowIso();
  return {
    kind,
    bookingId: normalizeText(value.bookingId) || null,
    at,
  };
}

function normalizeAiSummary(value) {
  if (!value || typeof value !== 'object') return null;
  const headline = normalizeText(value.headline) || null;
  const sentiment =
    value.sentiment && typeof value.sentiment === 'object' ? cloneJson(value.sentiment) : null;
  const intent = value.intent && typeof value.intent === 'object' ? cloneJson(value.intent) : null;
  if (
    !headline &&
    !sentiment &&
    !intent &&
    !normalizeText(value.risk) &&
    !normalizeText(value.nextStep)
  ) {
    return null;
  }
  return {
    headline,
    risk: normalizeText(value.risk) || null,
    nextStep: normalizeText(value.nextStep) || null,
    sentiment,
    intent,
    generatedAt: toIso(value.generatedAt) || nowIso(),
  };
}

function toStateKey(tenantId, canonicalConversationKey) {
  const safeTenantId = normalizeText(tenantId);
  const safeConversationKey = normalizeText(canonicalConversationKey);
  if (!safeTenantId || !safeConversationKey) return '';
  return `${safeTenantId}:${safeConversationKey}`;
}

function toIdempotencyRecordKey({
  tenantId,
  routeKey,
  actorUserId,
  canonicalConversationKey,
  idempotencyKey,
}) {
  const safeTenantId = normalizeText(tenantId);
  const safeRouteKey = normalizeText(routeKey).toLowerCase();
  const safeActorUserId = normalizeText(actorUserId);
  const safeConversationKey = normalizeText(canonicalConversationKey);
  const safeIdempotencyKey = normalizeText(idempotencyKey);
  if (
    !safeTenantId ||
    !safeRouteKey ||
    !safeActorUserId ||
    !safeConversationKey ||
    !safeIdempotencyKey
  ) {
    return '';
  }
  return [
    safeTenantId,
    safeRouteKey,
    safeActorUserId,
    safeConversationKey,
    safeIdempotencyKey,
  ].join('::');
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    conversationStates: {},
    idempotencyRecords: {},
  };
}

/**
 * ORD-218 — tilldelningens fält, ärvda om de inte uttryckligen sätts.
 *
 * `harEgenTilldelning` skiljer "anroparen sa inget om ägare" från "anroparen
 * satte ägare till ingen". Det första ärver; det andra avtilldelar. Utan den
 * skillnaden går det inte att ta bort en ägare — undefined och null hade
 * betytt samma sak.
 */
function arvdTilldelning(input = {}, existingRecord = null) {
  const harEgenTilldelning = Object.prototype.hasOwnProperty.call(input, 'assignedToEmail');
  if (!harEgenTilldelning) {
    return {
      assignedToEmail: existingRecord?.assignedToEmail ?? null,
      assignedToUserId: existingRecord?.assignedToUserId ?? null,
      assignedAt: existingRecord?.assignedAt ?? null,
      assignedByEmail: existingRecord?.assignedByEmail ?? null,
      assignedByUserId: existingRecord?.assignedByUserId ?? null,
      assignmentHistory: asArray(existingRecord?.assignmentHistory).slice(
        0,
        ASSIGNMENT_HISTORY_MAX
      ),
    };
  }
  const assignedToEmail = normalizeText(input.assignedToEmail).toLowerCase() || null;
  return {
    assignedToEmail,
    assignedToUserId: normalizeText(input.assignedToUserId) || null,
    assignedAt: assignedToEmail ? toIso(input.assignedAt) || nowIso() : null,
    assignedByEmail: normalizeText(input.assignedByEmail).toLowerCase() || null,
    assignedByUserId: normalizeText(input.assignedByUserId) || null,
    assignmentHistory: asArray(input.assignmentHistory).slice(0, ASSIGNMENT_HISTORY_MAX),
  };
}

/**
 * Historiken är BEGRÄNSAD med flit. En obegränsad lista växer så länge folk
 * skickar en tråd mellan sig, och posten skrivs till disk vid varje ändring.
 * Tjugo överlämningar räcker för att förstå vad som hänt; fler är arkivfråga,
 * inte driftfråga. Auditloggen har hela kedjan.
 */
const ASSIGNMENT_HISTORY_MAX = 20;

function normalizeConversationStateRecord(input = {}, existingRecord = null) {
  const tenantId = normalizeText(input.tenantId);
  const canonicalConversationKey = normalizeText(input.canonicalConversationKey);
  const key = toStateKey(tenantId, canonicalConversationKey);
  const actionState = normalizeActionState(input.actionState);
  const needsReplyStatusOverride = normalizeNeedsReplyStatusOverride(
    input.needsReplyStatusOverride
  );
  if (!tenantId || !canonicalConversationKey || !key || !actionState || !needsReplyStatusOverride) {
    return null;
  }
  const createdAt = normalizeText(existingRecord?.createdAt || input.createdAt) || nowIso();
  const updatedAt = nowIso();
  const existingVersion = Number.parseInt(String(existingRecord?.version ?? '0'), 10);
  const nextVersion =
    Number.isFinite(existingVersion) && existingVersion > 0 ? existingVersion + 1 : 1;
  return {
    key,
    tenantId,
    canonicalConversationKey,
    canonicalConversationSource: normalizeCanonicalConversationSource(
      input.canonicalConversationSource || existingRecord?.canonicalConversationSource
    ),
    canonicalConversationType: normalizeCanonicalConversationType(
      input.canonicalConversationType || existingRecord?.canonicalConversationType
    ),
    primaryConversationId:
      normalizeText(input.primaryConversationId || existingRecord?.primaryConversationId) || null,
    underlyingConversationIds: asArray(
      input.underlyingConversationIds || existingRecord?.underlyingConversationIds
    )
      .map((item) => normalizeText(item))
      .filter(Boolean),
    underlyingMailboxIds: asArray(
      input.underlyingMailboxIds || existingRecord?.underlyingMailboxIds
    )
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean),
    actionState,
    needsReplyStatusOverride,
    followUpDueAt: toIso(input.followUpDueAt),
    waitingOn: normalizeWaitingOn(input.waitingOn),
    nextActionLabel: normalizeText(input.nextActionLabel) || null,
    nextActionSummary: normalizeText(input.nextActionSummary) || null,
    bookingEvent: normalizeBookingEvent(input.bookingEvent || existingRecord?.bookingEvent),
    aiSummary: normalizeAiSummary(input.aiSummary || existingRecord?.aiSummary),
    actionAt: toIso(input.actionAt) || nowIso(),
    actionByUserId: normalizeText(input.actionByUserId) || null,
    actionByEmail: normalizeText(input.actionByEmail).toLowerCase() || null,
    /**
     * ORD-218 — TILLDELNING ÄR ORTOGONAL MOT ÅTGÄRDSSTATUS.
     *
     * En tråd kan vara tilldelad OCH obesvarad; tilldelad OCH snoozad. Fälten
     * får därför aldrig nollställas av att någon klickar Klar eller Senare —
     * de ärvs från den befintliga posten om anroparen inte uttryckligen sätter
     * dem.
     *
     * Utan arvet hade varje statusändring tyst kastat bort ägaren, och den som
     * ansvarade för tråden hade slutat göra det utan att någon sa något.
     */
    ...arvdTilldelning(input, existingRecord),
    source: 'cco_action_route',
    idempotencyKey: normalizeText(input.idempotencyKey) || null,
    version: nextVersion,
    superseded: false,
    supersededAt: null,
    supersededReason: null,
    supersededByMessageId: null,
    createdAt,
    updatedAt,
  };
}

function normalizeIdempotencyRecord(record = {}) {
  const key = normalizeText(record.key);
  if (!key) return null;
  const status = normalizeText(record.status).toLowerCase();
  if (!['pending', 'resolved'].includes(status)) return null;
  const expiresAt = toIso(record.expiresAt);
  if (!expiresAt) return null;
  return {
    key,
    tenantId: normalizeText(record.tenantId),
    routeKey: normalizeText(record.routeKey).toLowerCase(),
    actorUserId: normalizeText(record.actorUserId),
    canonicalConversationKey: normalizeText(record.canonicalConversationKey),
    idempotencyKey: normalizeText(record.idempotencyKey),
    payloadHash: normalizeText(record.payloadHash),
    payloadSnapshot: cloneJson(record.payloadSnapshot) || null,
    status,
    responseSnapshot: cloneJson(record.responseSnapshot) || null,
    createdAt: toIso(record.createdAt) || nowIso(),
    updatedAt: toIso(record.updatedAt) || nowIso(),
    expiresAt,
  };
}

function normalizeLoadedConversationStateRecord(record = {}) {
  const tenantId = normalizeText(record.tenantId);
  const canonicalConversationKey = normalizeText(record.canonicalConversationKey);
  const key = normalizeText(record.key) || toStateKey(tenantId, canonicalConversationKey);
  const actionState = normalizeActionState(record.actionState);
  const needsReplyStatusOverride = normalizeNeedsReplyStatusOverride(
    record.needsReplyStatusOverride
  );
  /**
   * ORD-218 — EN POST UTAN ÅTGÄRD ÄR INTE SKRÄP.
   *
   * Villkoret krävde tidigare actionState OCH needsReplyStatusOverride, och
   * kastade allt annat vid inläsning. Det var riktigt så länge posterna bara
   * kunde skapas av Klar/Senare — då fanns inget annat skäl att ha en post.
   *
   * Med tilldelning finns det: en tråd kan ha en ÄGARE utan att ha någon
   * åtgärd. Sådana poster föll tyst bort vid omstart, och tilldelningen
   * försvann utan spår. Mitt eget test fångade det; koden hade sett riktig ut.
   *
   * En post måste alltså bära NÅGOT för att vara värd att behålla: en åtgärd
   * eller en tilldelning. Bär den ingetdera är den skräp och kastas som förut.
   */
  const assignedToEmail = normalizeText(record.assignedToEmail).toLowerCase() || null;
  const harTilldelning = Boolean(assignedToEmail) || asArray(record.assignmentHistory).length > 0;
  const harAtgard = Boolean(actionState && needsReplyStatusOverride);
  if (!tenantId || !canonicalConversationKey || !key || (!harAtgard && !harTilldelning)) {
    return null;
  }
  return {
    key,
    tenantId,
    canonicalConversationKey,
    canonicalConversationSource: normalizeCanonicalConversationSource(
      record.canonicalConversationSource
    ),
    canonicalConversationType: normalizeCanonicalConversationType(record.canonicalConversationType),
    primaryConversationId: normalizeText(record.primaryConversationId) || null,
    underlyingConversationIds: asArray(record.underlyingConversationIds)
      .map((item) => normalizeText(item))
      .filter(Boolean),
    underlyingMailboxIds: asArray(record.underlyingMailboxIds)
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean),
    // Tomsträng från normaliseringen skrivs som null. En post utan åtgärd ska
    // se ut som en post utan åtgärd, inte som en med tomt värde.
    actionState: actionState || null,
    needsReplyStatusOverride: needsReplyStatusOverride || null,
    followUpDueAt: toIso(record.followUpDueAt),
    waitingOn: normalizeWaitingOn(record.waitingOn),
    nextActionLabel: normalizeText(record.nextActionLabel) || null,
    nextActionSummary: normalizeText(record.nextActionSummary) || null,
    bookingEvent: normalizeBookingEvent(record.bookingEvent),
    aiSummary: normalizeAiSummary(record.aiSummary),
    // ORD-218: actionAt får INTE hittas på för en post utan åtgärd. Ett påhittat
    // actionAt hade fått shouldSuppressOperatorState att jämföra mot en tidpunkt
    // som aldrig inträffat.
    actionAt: harAtgard ? toIso(record.actionAt) || nowIso() : toIso(record.actionAt),
    assignedToEmail,
    assignedToUserId: normalizeText(record.assignedToUserId) || null,
    assignedAt: toIso(record.assignedAt),
    assignedByEmail: normalizeText(record.assignedByEmail).toLowerCase() || null,
    assignedByUserId: normalizeText(record.assignedByUserId) || null,
    assignmentHistory: asArray(record.assignmentHistory).slice(0, ASSIGNMENT_HISTORY_MAX),
    actionByUserId: normalizeText(record.actionByUserId) || null,
    actionByEmail: normalizeText(record.actionByEmail).toLowerCase() || null,
    source: normalizeText(record.source) || 'cco_action_route',
    idempotencyKey: normalizeText(record.idempotencyKey) || null,
    version: Math.max(1, Number.parseInt(String(record.version ?? '1'), 10) || 1),
    superseded: record.superseded === true,
    supersededAt: toIso(record.supersededAt),
    supersededReason: normalizeSupersededReason(record.supersededReason),
    supersededByMessageId: normalizeText(record.supersededByMessageId) || null,
    createdAt: toIso(record.createdAt) || nowIso(),
    updatedAt: toIso(record.updatedAt) || nowIso(),
  };
}

async function createCcoConversationStateStore({ filePath, idempotencyTtlHours = 24 }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoConversationStateStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    conversationStates:
      state?.conversationStates && typeof state.conversationStates === 'object'
        ? Object.fromEntries(
            Object.entries(state.conversationStates)
              .map(([key, value]) => {
                const normalized = normalizeLoadedConversationStateRecord({ ...value, key });
                return normalized ? [key, normalized] : null;
              })
              .filter(Boolean)
          )
        : {},
    idempotencyRecords:
      state?.idempotencyRecords && typeof state.idempotencyRecords === 'object'
        ? Object.fromEntries(
            Object.entries(state.idempotencyRecords)
              .map(([key, value]) => {
                const normalized = normalizeIdempotencyRecord({ ...value, key });
                return normalized ? [key, normalized] : null;
              })
              .filter(Boolean)
          )
        : {},
  };

  function purgeExpiredIdempotencyRecords() {
    const nowMs = Date.now();
    let changed = false;
    for (const [key, record] of Object.entries(state.idempotencyRecords || {})) {
      const expiresMs = Date.parse(record?.expiresAt || '');
      if (Number.isFinite(expiresMs) && expiresMs > nowMs) continue;
      delete state.idempotencyRecords[key];
      changed = true;
    }
    return changed;
  }

  async function save() {
    purgeExpiredIdempotencyRecords();
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function getConversationState({ tenantId, canonicalConversationKey } = {}) {
    const key = toStateKey(tenantId, canonicalConversationKey);
    const record = key ? state.conversationStates[key] : null;
    return record ? cloneJson(record) : null;
  }

  function getActiveState({ tenantId, canonicalConversationKey } = {}) {
    const record = getConversationState({ tenantId, canonicalConversationKey });
    if (!record || record.superseded === true) return null;
    return record;
  }

  function getActiveStateMap({ tenantId, canonicalConversationKeys = [] } = {}) {
    const safeTenantId = normalizeText(tenantId);
    const result = {};
    for (const conversationKey of asArray(canonicalConversationKeys)) {
      const record = getActiveState({
        tenantId: safeTenantId,
        canonicalConversationKey: conversationKey,
      });
      if (record) result[normalizeText(conversationKey)] = record;
    }
    return result;
  }

  async function writeConversationState(input = {}) {
    const tenantId = normalizeText(input.tenantId);
    const canonicalConversationKey = normalizeText(input.canonicalConversationKey);
    const key = toStateKey(tenantId, canonicalConversationKey);
    if (!key) {
      throw new Error('tenantId och canonicalConversationKey krävs för conversation state.');
    }
    const existingRecord = state.conversationStates[key] || null;
    const nextRecord = normalizeConversationStateRecord(input, existingRecord);
    if (!nextRecord) {
      throw new Error('Conversation state saknar obligatoriska fält.');
    }
    state.conversationStates[key] = nextRecord;
    await save();
    return cloneJson(nextRecord);
  }

  /**
   * ORD-218 — tilldela eller avtilldela en konversation.
   *
   * EGEN SKRIVVÄG, inte writeConversationState. Den senare KRÄVER actionState
   * och needsReplyStatusOverride; att tilldela en obesvarad tråd hade då
   * tvingat fram ett påhittat åtgärdstillstånd, och tråden hade försvunnit ur
   * arbetslistan bara för att någon fick ansvar för den.
   *
   * REGELN (ägarbeslut, Fazli 2026-09-04): vem som helst får ta över. Det
   * följer ORD-198 — "personalen oavsett vem ska kunna kommunicera med alla
   * kunder". Ett övertagande NEKAS aldrig, men det syns: föregående ägare
   * hamnar i historiken och i auditloggen.
   *
   * Att neka övertaganden hade varit den andra rimliga regeln. Den valdes bort
   * därför att en tvåpersonsklinik där den ena är sjuk inte ska behöva en
   * administratör för att svara en patient.
   */
  async function assignConversation({
    tenantId,
    canonicalConversationKey,
    assignedToEmail = null,
    assignedToUserId = null,
    assignedByEmail = null,
    assignedByUserId = null,
    note = '',
    at = null,
  } = {}) {
    const key = toStateKey(tenantId, canonicalConversationKey);
    if (!key) {
      throw new Error('tenantId och canonicalConversationKey krävs för tilldelning.');
    }
    const nu = toIso(at) || nowIso();
    const till = normalizeText(assignedToEmail).toLowerCase() || null;
    const existing = state.conversationStates[key] || null;
    const foregaende = existing?.assignedToEmail ?? null;

    const handelse = {
      at: nu,
      fran: foregaende,
      till,
      avByEmail: normalizeText(assignedByEmail).toLowerCase() || null,
      avByUserId: normalizeText(assignedByUserId) || null,
      note: normalizeText(note).slice(0, 260) || null,
      // Ett övertagande är inte samma sak som en nytilldelning. Skillnaden är
      // det som gör historiken läsbar i efterhand.
      overtagande: Boolean(foregaende && till && foregaende !== till),
    };
    const historik = [handelse, ...asArray(existing?.assignmentHistory)].slice(
      0,
      ASSIGNMENT_HISTORY_MAX
    );

    if (existing) {
      existing.assignedToEmail = till;
      existing.assignedToUserId = normalizeText(assignedToUserId) || null;
      existing.assignedAt = till ? nu : null;
      existing.assignedByEmail = handelse.avByEmail;
      existing.assignedByUserId = handelse.avByUserId;
      existing.assignmentHistory = historik;
      existing.updatedAt = nu;
      await save();
      return cloneJson(existing);
    }

    /**
     * Ingen post finns ännu — tråden har aldrig fått en åtgärd. Den ska ändå
     * gå att tilldela, och posten får INTE se ut som en åtgärdad tråd.
     *
     * `actionState: null` gör att läsmodellens normalizeActionState ger tomt,
     * vilket betyder "ingen åtgärd" — tråden ligger kvar i arbetslistan, nu
     * med en ägare. Det är hela poängen: att ge någon ansvar är inte att bli
     * klar.
     */
    const record = {
      key,
      tenantId: normalizeText(tenantId),
      canonicalConversationKey: normalizeText(canonicalConversationKey),
      canonicalConversationSource: 'mailbox_conversation_fallback',
      canonicalConversationType: 'conversationKey',
      primaryConversationId: null,
      underlyingConversationIds: [],
      underlyingMailboxIds: [],
      actionState: null,
      needsReplyStatusOverride: null,
      followUpDueAt: null,
      waitingOn: null,
      nextActionLabel: null,
      nextActionSummary: null,
      bookingEvent: null,
      aiSummary: null,
      actionAt: null,
      actionByUserId: null,
      actionByEmail: null,
      assignedToEmail: till,
      assignedToUserId: normalizeText(assignedToUserId) || null,
      assignedAt: till ? nu : null,
      assignedByEmail: handelse.avByEmail,
      assignedByUserId: handelse.avByUserId,
      assignmentHistory: historik,
      source: 'cco_assign_route',
      idempotencyKey: null,
      version: 1,
      superseded: false,
      supersededAt: null,
      supersededReason: null,
      supersededByMessageId: null,
      createdAt: nu,
      updatedAt: nu,
    };
    state.conversationStates[key] = record;
    await save();
    return cloneJson(record);
  }

  async function supersedeConversationState({
    tenantId,
    canonicalConversationKey,
    supersededReason,
    supersededByMessageId = null,
    supersededAt = null,
  } = {}) {
    const key = toStateKey(tenantId, canonicalConversationKey);
    const existingRecord = key ? state.conversationStates[key] : null;
    if (!existingRecord) return null;
    existingRecord.superseded = true;
    existingRecord.supersededAt = toIso(supersededAt) || nowIso();
    existingRecord.supersededReason = normalizeSupersededReason(supersededReason) || 'manual_clear';
    existingRecord.supersededByMessageId = normalizeText(supersededByMessageId) || null;
    existingRecord.version = Number.parseInt(String(existingRecord.version || '0'), 10) + 1;
    existingRecord.updatedAt = nowIso();
    await save();
    return cloneJson(existingRecord);
  }

  async function migrateConversationState({
    tenantId,
    fromCanonicalConversationKey,
    toCanonicalConversationKey,
    canonicalConversationSource = 'merge_identity',
    canonicalConversationType = 'conversationKey',
    primaryConversationId = null,
    underlyingConversationIds = [],
    underlyingMailboxIds = [],
  } = {}) {
    const fromKey = toStateKey(tenantId, fromCanonicalConversationKey);
    const toKey = toStateKey(tenantId, toCanonicalConversationKey);
    if (!fromKey || !toKey || fromKey === toKey) return null;
    const existingRecord = state.conversationStates[fromKey];
    if (!existingRecord || existingRecord.superseded === true) return null;
    const targetRecord = normalizeConversationStateRecord(
      {
        ...existingRecord,
        tenantId,
        canonicalConversationKey: toCanonicalConversationKey,
        canonicalConversationSource,
        canonicalConversationType,
        primaryConversationId:
          normalizeText(primaryConversationId) || existingRecord.primaryConversationId,
        underlyingConversationIds:
          asArray(underlyingConversationIds).length > 0
            ? underlyingConversationIds
            : existingRecord.underlyingConversationIds,
        underlyingMailboxIds:
          asArray(underlyingMailboxIds).length > 0
            ? underlyingMailboxIds
            : existingRecord.underlyingMailboxIds,
        actionAt: existingRecord.actionAt,
        idempotencyKey: existingRecord.idempotencyKey,
      },
      state.conversationStates[toKey] || null
    );
    if (!targetRecord) return null;
    state.conversationStates[toKey] = targetRecord;
    existingRecord.superseded = true;
    existingRecord.supersededAt = nowIso();
    existingRecord.supersededReason = 'merge_migrated';
    existingRecord.updatedAt = nowIso();
    await save();
    return cloneJson(targetRecord);
  }

  async function reserveIdempotency({
    tenantId,
    routeKey,
    actorUserId,
    canonicalConversationKey,
    idempotencyKey,
    payload = {},
  } = {}) {
    const key = toIdempotencyRecordKey({
      tenantId,
      routeKey,
      actorUserId,
      canonicalConversationKey,
      idempotencyKey,
    });
    if (!key) {
      throw new Error('Idempotency-scope saknar obligatoriska fält.');
    }
    purgeExpiredIdempotencyRecords();
    const payloadSnapshot = cloneJson(payload) || {};
    const payloadHash = createHash(stableSerialize(payloadSnapshot));
    const existing = state.idempotencyRecords[key];
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return {
          status: 'mismatch',
          existing: cloneJson(existing),
        };
      }
      if (existing.status === 'pending') {
        return {
          status: 'in_progress',
          existing: cloneJson(existing),
        };
      }
      if (existing.status === 'resolved') {
        return {
          status: 'replay',
          existing: cloneJson(existing),
        };
      }
    }
    const createdAt = nowIso();
    const expiresAt = new Date(
      Date.now() + Math.max(1, Number(idempotencyTtlHours || 24)) * 60 * 60 * 1000
    ).toISOString();
    state.idempotencyRecords[key] = {
      key,
      tenantId: normalizeText(tenantId),
      routeKey: normalizeText(routeKey).toLowerCase(),
      actorUserId: normalizeText(actorUserId),
      canonicalConversationKey: normalizeText(canonicalConversationKey),
      idempotencyKey: normalizeText(idempotencyKey),
      payloadHash,
      payloadSnapshot,
      status: 'pending',
      responseSnapshot: null,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
    };
    await save();
    return {
      status: 'started',
      existing: cloneJson(state.idempotencyRecords[key]),
    };
  }

  async function completeIdempotency({
    tenantId,
    routeKey,
    actorUserId,
    canonicalConversationKey,
    idempotencyKey,
    responseSnapshot,
  } = {}) {
    const key = toIdempotencyRecordKey({
      tenantId,
      routeKey,
      actorUserId,
      canonicalConversationKey,
      idempotencyKey,
    });
    const existing = key ? state.idempotencyRecords[key] : null;
    if (!existing) {
      throw new Error('Idempotency-post saknas för completion.');
    }
    existing.status = 'resolved';
    existing.responseSnapshot = cloneJson(responseSnapshot) || null;
    existing.updatedAt = nowIso();
    await save();
    return cloneJson(existing);
  }

  async function clearPendingIdempotency({
    tenantId,
    routeKey,
    actorUserId,
    canonicalConversationKey,
    idempotencyKey,
  } = {}) {
    const key = toIdempotencyRecordKey({
      tenantId,
      routeKey,
      actorUserId,
      canonicalConversationKey,
      idempotencyKey,
    });
    if (!key || !state.idempotencyRecords[key]) return false;
    delete state.idempotencyRecords[key];
    await save();
    return true;
  }

  function getActiveStatesForTenant({ tenantId } = {}) {
    const safeTenantId = normalizeText(tenantId);
    if (!safeTenantId) return [];
    const prefix = `${safeTenantId}:`;
    return Object.values(state.conversationStates || {})
      .filter((record) => record.key && record.key.startsWith(prefix) && record.superseded !== true)
      .map((record) => cloneJson(record));
  }

  return {
    getConversationState,
    getActiveState,
    getActiveStateMap,
    getActiveStatesForTenant,
    writeConversationState,
    assignConversation,
    supersedeConversationState,
    migrateConversationState,
    reserveIdempotency,
    completeIdempotency,
    clearPendingIdempotency,
  };
}

module.exports = {
  createCcoConversationStateStore,
};
