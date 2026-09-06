'use strict';

/* ─── ccoConversationThreadStore — Komm Sprint 4 ─────────────────────────
 *
 * AGGREGATOR-store (inte rå store): mergar per-kund-konversation från
 * befintliga stores. Persisterar ENDAST per-thread-state (handled/snoozed/
 * read) i en liten egen fil — själva mailen/notiserna lever i sina stores.
 *
 * Inputs (injicieras via factory):
 *  - mailIngestionStore        (rawMessages + mailPatientMatches → inkommande)
 *  - mailboxTruthStore         (för utgående mail via SENT folder, om finns)
 *  - conversationNotesStore    (interna notiser per customer:<id>)
 *  - commDraftStore            (Sprint 2 — drafts per customerId)
 *  - sendActionsList           (Sprint C — utskick av formulär/samtycken)
 *  - portalMessageStore        (Fas 2.5 — patientportal-chatt)
 *
 * Owner-mandat:
 *  - INGEN extern AI på journalinnehåll
 *  - INGA Drive-länkar
 *  - INGA auto-utskick
 *  - INGEN live Graph-fetch direkt — endast via redan ingestade stores
 *  - PII-mask i audit-loggar (bara counts, kind, status, threadId)
 * ────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const { canonicalTenantId, HAIR_TP_CANONICAL } = require('../tenant/tenantIdCanonical');

const SYSTEM_PATTERNS = [
  /^no.?reply@/i,
  /^donot.?reply@/i,
  /^bounce@/i,
  /^postmaster@/i,
  /^mailer-daemon@/i,
  /^notifications?@/i,
  /^auto.?reply@/i,
  /^marketing@/i,
  /^newsletter@/i,
];

const VALID_ACTIONS = [
  'mark_handled',
  'unmark_handled',
  'snooze',
  'unsnooze',
  'mark_read',
  'link_journey',
];

const VALID_FILTERS = [
  'all',
  'incoming',
  'outgoing',
  'drafts',
  'needs_approval',
  'sent',
  'internal',
  'portal',
  'unanswered',
  'system',
];

function nowIso() {
  return new Date().toISOString();
}

function loadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function isSystemMail(fromEmail = '') {
  const email = String(fromEmail || '')
    .toLowerCase()
    .trim();
  if (!email) return false;
  return SYSTEM_PATTERNS.some((p) => p.test(email));
}

function maskEmail(email = '') {
  const s = String(email || '');
  if (!s.includes('@')) return s ? s.slice(0, 2) + '***' : '';
  const [user, domain] = s.split('@');
  return (user.slice(0, 2) || '**') + '***@' + (domain || '***');
}

function pickIso(...vals) {
  for (const v of vals) {
    if (v && typeof v === 'string') return v;
  }
  return null;
}

function normalizeMailboxId(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function mailboxBadge(mailboxId = '') {
  const email = normalizeMailboxId(mailboxId);
  if (!email) return null;
  const local = email.split('@')[0] || email;
  return local;
}

function resolveCustomerIdFromIdentity(identity = {}, fallback = '') {
  const safe = identity && typeof identity === 'object' ? identity : {};
  return (
    normalizeText(safe.canonicalCustomerId) ||
    normalizeText(safe.customerId) ||
    normalizeText(safe.customerKey) ||
    normalizeText(fallback)
  );
}

/**
 * ORD-96 — HÄRLED IDENTITETEN, KRÄV DEN INTE LAGRAD.
 *
 * Tidigare returnerade den här funktionen `false` så snart meddelandet saknade
 * `customerIdentity`. Men identiteten sätts aldrig på meddelandet:
 * `ccoConversationPatientResolver` säger uttryckligen att den läggs på
 * FLYKTIGA worklist-rader och aldrig skrivs tillbaka.
 *
 * Fältet krävdes alltså av läsaren och sattes aldrig av skrivaren. Kundnycklade
 * trådar var tomma av konstruktion — inte av en bugg någon införde, utan av att
 * två halvor aldrig möttes. Samma form som #1245.
 *
 * `customerEmails` är kundens EGNA adresser, hämtade ur patient-mastern och
 * grindade på entydighet av samma resolver som worklisten använder. En adress
 * som pekar på flera patienter kommer aldrig med — en osäker matchning som
 * slår ihop två personers korrespondens är värre än en tråd som är delad.
 */
function truthMessageMatchesCustomer(message = {}, customerId = '', customerEmails = null) {
  const target = normalizeText(customerId);
  if (!target) return false;

  const identity = message.customerIdentity || message.identity || null;
  if (identity) {
    const resolved = resolveCustomerIdFromIdentity(identity);
    if (resolved && resolved === target) return true;
  }

  // Härledning: motpartens adress mot kundens kända adresser.
  if (customerEmails && customerEmails.size > 0) {
    const counterpart = pickCustomerEmail(message, null);
    if (counterpart && customerEmails.has(counterpart)) return true;
  }
  return false;
}

function mailDedupeKey({
  mailboxId = '',
  graphMessageId = '',
  conversationId = '',
  rawId = '',
} = {}) {
  const mb = normalizeMailboxId(mailboxId);
  const gid = normalizeText(graphMessageId).toLowerCase();
  if (mb && gid) return `${mb}:${gid}`;
  const conv = normalizeText(conversationId);
  if (mb && conv) return `${mb}:conv:${conv}`;
  if (rawId) return `raw:${rawId}`;
  return '';
}

function safePreview(value = '', max = 140) {
  const text = normalizeText(value);
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function buildMailThreadFromTruthMessage(m = {}, customerId = '') {
  const fromEmail = m.fromEmail || m.from?.address || m.from || m.fromAddress || '';
  const sys = isSystemMail(fromEmail);
  const isOutbound =
    m.direction === 'outbound' || m.folderType === 'sent' || m.folderType === 'drafts';
  const mailboxId = normalizeMailboxId(m.mailboxId || m.mailboxAddress);
  return {
    threadId:
      normalizeText(m.mailboxConversationId) ||
      normalizeText(m.conversationId) ||
      mailDedupeKey({
        mailboxId,
        graphMessageId: m.graphMessageId,
        conversationId: m.conversationId,
      }) ||
      'mail-' + normalizeText(m.graphMessageId || m.id),
    kind: sys ? 'system_mail' : isOutbound ? 'outgoing_mail' : 'incoming_mail',
    direction: isOutbound ? 'outbound' : 'inbound',
    ts: pickIso(m.receivedAt, m.sentAt, m.lastModifiedAt, m.persistedAt),
    subject: m.subject || '(utan ämne)',
    from: maskEmail(fromEmail),
    preview: safePreview(m.bodyPreview || m.snippet),
    channel: 'email',
    mailboxId: mailboxId || null,
    mailboxBadge: mailboxBadge(mailboxId),
    graphMessageId: normalizeText(m.graphMessageId) || null,
    conversationId: normalizeText(m.conversationId) || null,
    systemMail: sys,
    requiresAttention: !sys && !isOutbound,
    sourceLayer: 'mailbox_truth',
    customerId: resolveCustomerIdFromIdentity(m.customerIdentity, customerId) || customerId,
  };
}

function buildMailThreadFromIngestionMessage(m = {}, customerId = '') {
  const fromEmail = m.fromAddress || m.from?.address || m.from || m.fromEmail || '';
  const sys = isSystemMail(fromEmail);
  const isOutbound = m.folderType === 'sent' || m.folderType === 'drafts';
  const mailboxId = normalizeMailboxId(m.mailboxId);
  return {
    threadId:
      normalizeText(m.conversationId) ||
      mailDedupeKey({
        mailboxId,
        graphMessageId: m.graphMessageId || m.immutableGraphId,
        rawId: m.id || m.rawMessageId,
      }) ||
      'mail-' + normalizeText(m.id || m.rawMessageId),
    kind: sys ? 'system_mail' : isOutbound ? 'outgoing_mail' : 'incoming_mail',
    direction: isOutbound ? 'outbound' : 'inbound',
    ts: pickIso(m.sortIso, m.receivedAt, m.sentAt, m.receivedDateTime),
    subject: m.subject || '(utan ämne)',
    from: maskEmail(fromEmail),
    preview: safePreview(m.snippet || m.bodyPreview),
    channel: 'email',
    mailboxId: mailboxId || null,
    mailboxBadge: mailboxBadge(mailboxId),
    graphMessageId: normalizeText(m.graphMessageId || m.immutableGraphId) || null,
    conversationId: normalizeText(m.conversationId) || null,
    systemMail: sys,
    requiresAttention: !sys && !isOutbound,
    sourceLayer: 'ingestion',
    customerId,
  };
}

function buildPortalThreadFromMessage(m = {}, customerId = '') {
  const isOutbound = m.direction === 'outbound';
  return {
    threadId: 'portal-' + normalizeText(m.id || m.createdAt),
    kind: 'portal_message',
    direction: isOutbound ? 'outbound' : 'inbound',
    ts: m.createdAt || null,
    subject: isOutbound ? 'Svar från kliniken' : 'Meddelande från patienten',
    from: isOutbound ? 'Kliniken' : 'Patienten',
    preview: safePreview(m.body),
    body: m.body || '',
    channel: m.channel || 'portal',
    portalMessageId: normalizeText(m.id) || null,
    systemMail: false,
    requiresAttention: !isOutbound,
    sourceLayer: 'portal',
    customerId,
  };
}

async function preloadTruthMailboxes(mailboxTruthStore, historyMailboxIds = []) {
  if (!mailboxTruthStore?.ensureMailboxLoaded) return;
  for (const mailboxId of asArray(historyMailboxIds)) {
    try {
      await mailboxTruthStore.ensureMailboxLoaded(mailboxId);
    } catch {
      /* optional shard */
    }
  }
}

/**
 * LADDA VARJE BREVLÅDA PRECIS INNAN DEN LÄSES.
 *
 * `preloadTruthMailboxes` laddade alla åtta i följd — men LRU-taket är TVÅ
 * (`maxLoadedShards`), så sex av dem var utvräkta igen innan loopen nedan
 * hann läsa dem. `listMessages` returnerar tom lista för en oladdad shard,
 * tyst. Diagnostiken visade det som `historyMailboxIds: 8` men
 * `loadedMailboxes: 2` och `truthMessagesMatched: 0`.
 *
 * Fjärde gången i dag samma tak: korsbrevlåderapporten såg två brevlådor,
 * `listMessages({})` betydde "de laddade", och nu detta. Åtgärden är densamma
 * som i rapporten — ladda EN i taget, direkt före läsningen, så att LRU:n
 * aldrig hinner vräka ut det vi just bad om.
 */
async function listTruthMessagesForCustomer(
  mailboxTruthStore,
  customerId,
  historyMailboxIds = [],
  customerEmails = null
) {
  if (!mailboxTruthStore?.listMessages || !customerId) return [];
  const mailboxIds = asArray(historyMailboxIds).map(normalizeMailboxId).filter(Boolean);
  const searchMailboxes =
    mailboxIds.length > 0
      ? mailboxIds
      : typeof mailboxTruthStore.listLoadedMailboxes === 'function'
        ? mailboxTruthStore.listLoadedMailboxes()
        : [];
  const rows = [];
  for (const mailboxId of searchMailboxes) {
    try {
      if (typeof mailboxTruthStore.ensureMailboxLoaded === 'function') {
        await mailboxTruthStore.ensureMailboxLoaded(mailboxId);
      }
    } catch (error) {
      console.warn('[cco-thread] kunde inte ladda brevlådan', mailboxId, error?.message);
      continue;
    }
    const msgs =
      mailboxTruthStore.listMessages({
        mailboxIds: [mailboxId],
        folderTypes: ['inbox', 'sent', 'drafts'],
        limit: 0,
      }) || [];
    for (const m of msgs) {
      if (truthMessageMatchesCustomer(m, customerId, customerEmails)) rows.push(m);
    }
  }
  if (rows.length === 0 && searchMailboxes.length === 0) {
    for (const m of mailboxTruthStore.listMessages({
      folderTypes: ['inbox', 'sent', 'drafts'],
      limit: 0,
    })) {
      if (truthMessageMatchesCustomer(m, customerId, customerEmails)) rows.push(m);
    }
  }
  return rows;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const { pickCustomerEmail } = require('./crossMailboxAggregator');
const { resolveConversationPatient } = require('./ccoConversationPatientResolver');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function createCcoConversationThreadStore({
  filePath,
  mailIngestionStore = null,
  mailboxTruthStore = null,
  conversationNotesStore = null,
  commDraftStore = null,
  sendActionsList = null, // function (customerId) => array av send-events
  auditLog = null,
  historyMailboxIds = [],
  enrichmentLookup = null, // optional (customerId) => { workflowLane, slaStatus, needsAction, riskLabel }
  patientMasterStore = null, // ORD-96: krävs för att härleda kundens adresser
  portalMessageStore = null, // Fas 2.5 — patientportal-chatt ska synas i trådar
} = {}) {
  if (!filePath) throw new Error('filePath required');

  const state = loadJson(filePath) || { threadStates: {}, lastSavedAt: null };
  if (!state.threadStates) state.threadStates = {};
  // P1-003/004 B-1 — flytta legacy tenant-lösa nycklar (customerId::threadId)
  // till hair-tp-clinic i minnet. Persisteras vid nästa skrivning, aldrig på
  // ren läsning (dossier/trådvy förblir read-only).
  migrateLegacyThreadStates(state.threadStates);

  function persist() {
    state.lastSavedAt = nowIso();
    saveJson(filePath, state);
  }

  function logAudit(kind, detail = {}) {
    try {
      if (auditLog?.logEvent) {
        auditLog.logEvent({
          kind,
          tenantId: detail.tenantId || 'hair_tp',
          actor: detail.actor || 'staff',
          entityKind: 'conversation_thread',
          entityId: detail.threadId || null,
          detail: {
            customerId: detail.customerId,
            previousStatus: detail.previousStatus,
            newStatus: detail.newStatus,
            reason: detail.reason,
            journeyStep: detail.journeyStep,
            kind: detail.threadKind,
          },
        });
      }
    } catch {
      /* audit bind fel ignoreras */
    }
  }

  function normalizeTenantKey(tenantId) {
    // P1-003/004 B-1 — thread-state keyas nu PER TENANT. Normalisera via samma
    // canonical-maskineri som resten av CCO så 'hair_tp'/'hairtpclinic' → hair-tp-clinic.
    return canonicalTenantId(tenantId) || String(tenantId || '').trim();
  }

  function getThreadStateKey(tenantId, customerId, threadId) {
    return [normalizeTenantKey(tenantId), String(customerId || ''), String(threadId || '')].join('::');
  }

  // Pre-P1-003/004 keyades state `customerId::threadId` (2 segment, UTAN tenant).
  // Den historiska enda tenanten var hair-tp-clinic, så dessa flyttas dit.
  function migrateLegacyThreadStates(threadStates) {
    for (const key of Object.keys(threadStates)) {
      if (key.split('::').length === 2) {
        threadStates[HAIR_TP_CANONICAL + '::' + key] = threadStates[key];
        delete threadStates[key];
      }
    }
  }

  function getThreadState(tenantId, customerId, threadId) {
    const key = getThreadStateKey(tenantId, customerId, threadId);
    return state.threadStates[key] || null;
  }

  function ensureThreadStateRecord(tenantId, customerId, threadId) {
    const key = getThreadStateKey(tenantId, customerId, threadId);
    if (!state.threadStates[key]) {
      state.threadStates[key] = {
        customerId,
        threadId,
        handled: false,
        snoozedUntil: null,
        readAt: null,
        linkedJourneyStep: null,
        history: [],
      };
    }
    return state.threadStates[key];
  }

  /**
   * ORD-96 — kundens egna adresser, grindade på entydighet.
   *
   * Vänder frågan rätt: i stället för att resolva VARJE meddelandes motpart
   * mot registret hämtas kundens egna adresser en gång, och meddelandena
   * matchas mot den lilla mängden. En patient har en handfull adresser; en
   * brevlåda har tiotusentals meddelanden.
   *
   * Varje adress prövas med SAMMA resolver som worklisten använder
   * (`resolveConversationPatient`). Pekar adressen på flera patienter blir
   * status `ambiguous` och adressen släpps — den får aldrig länka. Pekar den
   * på en annan patient än den vi frågar om släpps den också.
   */
  async function resolveCustomerEmailSet(customerId, tenantId) {
    const target = normalizeText(customerId);
    const tenant = normalizeText(tenantId);
    if (!target || !patientMasterStore?.getPatient) return null;

    // DIREKT UPPSLAGNING, INTE EN LISTNING.
    //
    // Första versionen kallade `listPatients({})` och letade i resultatet.
    // `listPatients` har `limit = 100` som standard — jag frågade efter hela
    // registret och fick 100 av 7 451. Patienten fanns aldrig i svaret, och
    // trådvyn returnerade noll rader utan att något gick fel.
    //
    // Exakt samma fel som `listMessages({})` som betydde "de laddade" och inte
    // "alla" — samma order, tre timmar isär. Ett listnings-API med ett tyst tak
    // är inte en fråga om allt.
    let patient = null;
    try {
      // tenantId MÅSTE med: tenantBucket kastar `tenantId saknas.` utan den
      // (ccoPatientMasterStore.js:114).
      patient = await patientMasterStore.getPatient({ tenantId: tenant, patientId: target });
    } catch (error) {
      // FAIL-OPEN, MEN ALDRIG TYST.
      // Utan den här raden svalde catch:en ett kastat `tenantId saknas.`,
      // adressmängden blev tom, och trådvyn svarade `threads: []` på 0,17 s —
      // ett fel som fångas och tystas ser ut som ett tomt resultat.
      console.warn(
        '[cco-thread] kunde inte läsa patienten för adressmängden',
        JSON.stringify({ tenantId: tenant || null, patientId: target, error: error?.message })
      );
      return null;
    }
    if (!patient) return null;

    const candidates = new Set(
      [
        patient.primaryEmail,
        ...asArray(patient.emails),
        ...asArray(patient.cliento?.emails),
        ...asArray(patient.pipedrive?.emails),
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .filter(Boolean)
    );

    const confirmed = new Set();
    for (const email of candidates) {
      try {
        // FÄLTET HETER `email`, INTE `customerEmail`.
        // Med fel nyckel blev `target` tomt, resolvern svarade `no_email`, och
        // ambiguitetsgrinden släppte VARJE adress. Diagnostiken visade det som
        // `customerEmails: 0` — patienten hittad, alla adresser bortkastade.
        // Samma söm som #1245: två korrekta halvor, fel nyckel emellan.
        const match = await resolveConversationPatient(
          { email, tenantId: tenant },
          { patientMasterStore }
        );
        // Bara entydiga matchningar mot RÄTT patient. `ambiguous` släpps.
        if (
          normalizeText(match?.status) === 'matched' &&
          normalizeText(match?.patientId) === target
        ) {
          confirmed.add(email);
        }
      } catch {
        /* en adress som inte går att pröva får inte länka */
      }
    }
    return confirmed;
  }

  // ─── Build threads for a customer ─────────────────────────────────
  async function buildThreadsForCustomer(
    customerId,
    { tenantId = 'hair_tp', includeMailTruth = true } = {}
  ) {
    if (!customerId) return { threads: [], counts: {}, summary: {}, mailboxes: [] };
    const threads = [];
    const mailKeys = new Set();
    let diagnostics = null;

    // ORD-116: includeMailTruth=false hoppar brevlådeskanningen. Den laddar
    // shards per kund (LRU-tak två → varje kund läser om från disk) och kostade
    // ~340 ms per kund i kundlistan. Listans signalräknare bygger på
    // tråd-state-räkningarna — inte på själva meddelandena.
    if (includeMailTruth) {
      await preloadTruthMailboxes(mailboxTruthStore, historyMailboxIds);
    }

    // 1. Mailbox truth (primary — includes hydration customerIdentity overlay)
    if (mailboxTruthStore && includeMailTruth) {
      try {
        const customerEmails = await resolveCustomerEmailSet(customerId, tenantId);
        const truthMessages = await listTruthMessagesForCustomer(
          mailboxTruthStore,
          customerId,
          historyMailboxIds,
          customerEmails
        );
        // DIAGNOSTIK (ORD-96). Tre gissningar i rad om varför tråden var tom —
        // tenantId, patientMasterStore, brevlådelistan — och ingen av dem gick
        // att avgöra utifrån ett svar som bara sa `threads: []`. Talen nedan
        // skiljer de tre fallen åt utan att någon behöver gissa igen.
        diagnostics = {
          customerEmails: customerEmails ? customerEmails.size : null,
          historyMailboxIds: asArray(historyMailboxIds).length,
          loadedMailboxes:
            typeof mailboxTruthStore.listLoadedMailboxes === 'function'
              ? mailboxTruthStore.listLoadedMailboxes().length
              : null,
          truthMessagesMatched: truthMessages.length,
          patientMasterStore: Boolean(patientMasterStore?.getPatient),
          tenantId: tenantId || null,
        };
        for (const m of truthMessages) {
          const row = buildMailThreadFromTruthMessage(m, customerId);
          const key =
            mailDedupeKey({
              mailboxId: row.mailboxId,
              graphMessageId: row.graphMessageId,
              conversationId: row.conversationId,
              rawId: row.threadId,
            }) || row.threadId;
          if (mailKeys.has(key)) continue;
          mailKeys.add(key);
          threads.push(row);
        }
      } catch {
        /* truth kan vara otillgänglig */
      }
    }

    // 2. Ingestion complement (endast rader som saknas i truth)
    if (mailIngestionStore?.listPatientMessages) {
      try {
        const msgs =
          mailIngestionStore.listPatientMessages({ patientId: customerId, limit: 200 }) || [];
        for (const m of msgs) {
          const row = buildMailThreadFromIngestionMessage(m, customerId);
          const key =
            mailDedupeKey({
              mailboxId: row.mailboxId,
              graphMessageId: row.graphMessageId,
              conversationId: row.conversationId,
              rawId: m.id || m.rawMessageId,
            }) || row.threadId;
          if (mailKeys.has(key)) continue;
          mailKeys.add(key);
          threads.push(row);
        }
      } catch {
        /* ingest store kan vara tom */
      }
    }
    if (conversationNotesStore?.listNotes) {
      try {
        const notes =
          conversationNotesStore.listNotes({
            // ORD-222 — tenant. Prefixet här var redan rätt; det var
            // ccoCustomerComm som skrev utan det. Se kommentaren där.
            tenantId,
            conversationKey: 'customer:' + customerId,
          }) || [];
        for (const n of notes) {
          threads.push({
            threadId: 'note-' + (n.id || n.createdAt),
            kind: 'internal_note',
            direction: 'internal',
            ts: n.createdAt,
            subject: 'Intern notis',
            from: n.authorName || n.authorEmail || 'staff',
            preview: (n.body || '').slice(0, 140),
            channel: 'internal',
            systemMail: false,
            requiresAttention: false,
          });
        }
      } catch (err) {
        /* ignore */
      }
    }

    // 4. Drafts (Sprint 2) — alla statusar
    if (commDraftStore?.listForCustomer) {
      try {
        const drafts = commDraftStore.listForCustomer(customerId, { limit: 50 }) || [];
        for (const d of drafts) {
          const draftKindMap = {
            draft: 'comm_draft',
            needs_approval: 'comm_draft_needs_approval',
            approved: 'comm_draft_approved',
            queued: 'comm_draft_queued',
            sent: 'comm_sent',
            failed: 'comm_failed',
            cancelled: 'comm_cancelled',
          };
          threads.push({
            threadId: d.draftId,
            kind: draftKindMap[d.status] || 'comm_draft',
            direction: 'outbound',
            ts: d.updatedAt || d.createdAt,
            subject: d.subject || '(' + d.channel + ' utkast)',
            from: d.createdBy || 'staff',
            preview: '',
            channel: d.channel,
            journeyStep: d.journeyStep,
            templateId: d.templateId,
            draftStatus: d.status,
            requiresAttention: d.status === 'needs_approval',
            requiresApproval: d.status === 'needs_approval',
          });
        }
      } catch (err) {
        /* ignore */
      }
    }

    // 5. Utskickade formulär/samtycken (Sprint C — sendActionsList(customerId))
    if (typeof sendActionsList === 'function') {
      try {
        const actions = sendActionsList(customerId) || [];
        for (const a of actions) {
          const sendId = a.actionId || a.id || null;
          threads.push({
            threadId: sendId || 'send-' + a.createdAt,
            kind:
              a.kind === 'form'
                ? 'form_sent'
                : a.kind === 'consent'
                  ? 'consent_sent'
                  : a.kind === 'file' || a.kind === 'offer' || a.kind === 'agreement'
                    ? 'file_sent'
                    : 'send_action',
            direction: 'outbound',
            ts: a.createdAt,
            subject: a.label || a.formKind || a.consentKind || 'Utskick',
            from: a.sentBy || 'staff',
            preview: '',
            channel: a.channel || 'email',
            requiresAttention: a.status === 'failed',
            sendActionId: sendId,
            conversationKey: a.conversationKey || null,
            relatedEntityKind: a.relatedEntityKind || null,
            relatedEntityId: a.relatedEntityId || null,
          });
        }
      } catch (err) {
        /* ignore */
      }
    }

    // 6. Patientportal-meddelanden (Fas 2.5)
    if (portalMessageStore?.listMessagesForCustomer) {
      try {
        const portalMessages =
          portalMessageStore.listMessagesForCustomer({ tenantId, customerId }) || [];
        for (const m of portalMessages) {
          const row = buildPortalThreadFromMessage(m, customerId);
          const key = row.portalMessageId ? `portal:${row.portalMessageId}` : row.threadId;
          if (mailKeys.has(key)) continue;
          mailKeys.add(key);
          threads.push(row);
        }
      } catch (err) {
        /* ignore */
      }
    }

    // ─── Sort by ts desc ──
    threads.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));

    // ─── Merge state (handled/snoozed/read) ──
    for (const t of threads) {
      const st = getThreadState(tenantId, customerId, t.threadId);
      if (st) {
        t.handled = !!st.handled;
        t.snoozedUntil = st.snoozedUntil || null;
        t.readAt = st.readAt || null;
        t.linkedJourneyStep = st.linkedJourneyStep || null;
      } else {
        t.handled = false;
        t.snoozedUntil = null;
        t.readAt = null;
        t.linkedJourneyStep = null;
      }
    }

    // ─── True-unanswered logic ──
    // En tråd är obesvarad om:
    //  1. senaste inkommande mail (icke-system) är nyare än senaste utgående
    //  2. inte handled, inte snoozed, inte systemmail
    const lastIncomingNonSys = threads
      .filter(
        (t) =>
          (t.kind === 'incoming_mail' || t.kind === 'portal_message') &&
          !t.systemMail &&
          t.direction === 'inbound'
      )
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
    const lastOutgoing = threads
      .filter(
        (t) =>
          t.kind === 'outgoing_mail' ||
          t.kind === 'comm_sent' ||
          t.kind === 'form_sent' ||
          t.kind === 'consent_sent' ||
          t.kind === 'portal_message'
      )
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];

    const nowMs = Date.now();
    for (const t of threads) {
      if ((t.kind !== 'incoming_mail' && t.kind !== 'portal_message') || t.systemMail) continue;
      if (t.handled) continue;
      if (t.snoozedUntil && Date.parse(t.snoozedUntil) > nowMs) continue;
      const inMs = Date.parse(t.ts || '');
      const outMs = lastOutgoing ? Date.parse(lastOutgoing.ts || '') : NaN;
      const isUnanswered = Number.isFinite(inMs) && (!Number.isFinite(outMs) || inMs > outMs);
      t.unanswered = isUnanswered;
    }

    // ─── Computed status per thread ──
    for (const t of threads) {
      if (t.kind === 'internal_note') t.threadStatus = 'internal';
      else if (t.systemMail) t.threadStatus = 'system';
      else if (t.kind === 'comm_draft') t.threadStatus = 'draft';
      else if (t.kind === 'comm_draft_needs_approval') t.threadStatus = 'needs_approval';
      else if (t.kind === 'comm_draft_approved') t.threadStatus = 'approved';
      else if (t.kind === 'comm_draft_queued') t.threadStatus = 'queued';
      else if (t.kind === 'comm_sent') t.threadStatus = 'sent';
      else if (t.kind === 'comm_failed') t.threadStatus = 'failed';
      else if (t.kind === 'comm_cancelled') t.threadStatus = 'cancelled';
      else if (t.kind === 'form_sent' || t.kind === 'consent_sent' || t.kind === 'file_sent')
        t.threadStatus = 'sent';
      else if (t.kind === 'outgoing_mail') t.threadStatus = 'sent';
      else if (t.kind === 'portal_message') t.threadStatus = 'portal';
      else if (t.handled) t.threadStatus = 'handled';
      else if (t.snoozedUntil && Date.parse(t.snoozedUntil) > nowMs) t.threadStatus = 'snoozed';
      else if (t.unanswered) t.threadStatus = 'unanswered';
      else if (!t.readAt) t.threadStatus = 'unread';
      else t.threadStatus = 'read';
    }

    // ─── Counts per filter ──
    const counts = {
      all: threads.filter((t) => !t.systemMail).length,
      incoming: threads.filter((t) => t.kind === 'incoming_mail' && !t.systemMail).length,
      outgoing: threads.filter(
        (t) =>
          t.kind === 'outgoing_mail' ||
          t.kind === 'comm_sent' ||
          t.kind === 'form_sent' ||
          t.kind === 'consent_sent' ||
          t.kind === 'file_sent'
      ).length,
      drafts: threads.filter((t) => /^comm_draft/.test(t.kind)).length,
      needs_approval: threads.filter((t) => t.threadStatus === 'needs_approval').length,
      sent: threads.filter((t) => t.threadStatus === 'sent').length,
      internal: threads.filter((t) => t.kind === 'internal_note').length,
      portal: threads.filter((t) => t.kind === 'portal_message').length,
      unanswered: threads.filter((t) => t.threadStatus === 'unanswered').length,
      system: threads.filter((t) => t.systemMail).length,
      handled: threads.filter((t) => t.handled).length,
      snoozed: threads.filter((t) => t.threadStatus === 'snoozed').length,
    };

    const mailboxes = [
      ...new Set(
        threads
          .filter((t) => t.channel === 'email' && t.mailboxId)
          .map((t) => normalizeMailboxId(t.mailboxId))
          .filter(Boolean)
      ),
    ].sort();

    const mailThreads = threads.filter(
      (t) => t.kind === 'incoming_mail' || t.kind === 'outgoing_mail'
    );
    const latestInbound = mailThreads
      .filter((t) => t.direction === 'inbound')
      .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0];
    const latestOutbound = mailThreads
      .filter((t) => t.direction === 'outbound')
      .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0];

    let enrichment = null;
    if (typeof enrichmentLookup === 'function') {
      try {
        enrichment = enrichmentLookup(customerId) || null;
      } catch {
        enrichment = null;
      }
    }

    const summary = {
      mailboxes,
      multiMailbox: mailboxes.length > 1,
      latestInboundAt: latestInbound?.ts || null,
      latestOutboundAt: latestOutbound?.ts || null,
      trueUnanswered: counts.unanswered,
      needsAction: counts.unanswered + counts.needs_approval,
      handled: counts.handled,
      snoozed: counts.snoozed,
      workflowLane: enrichment?.workflowLane || null,
      slaStatus: enrichment?.slaStatus || null,
      riskLabel: enrichment?.riskLabel || enrichment?.dominantRisk || null,
    };

    return { threads, counts, summary, mailboxes, diagnostics };
  }

  function filterThreads(threads, filter = 'all') {
    if (!filter || filter === 'all') return threads.filter((t) => !t.systemMail);
    if (filter === 'incoming')
      return threads.filter((t) => t.kind === 'incoming_mail' && !t.systemMail);
    if (filter === 'outgoing')
      return threads.filter(
        (t) =>
          t.kind === 'outgoing_mail' ||
          t.kind === 'comm_sent' ||
          t.kind === 'form_sent' ||
          t.kind === 'consent_sent' ||
          t.kind === 'file_sent'
      );
    if (filter === 'drafts') return threads.filter((t) => /^comm_draft/.test(t.kind));
    if (filter === 'needs_approval')
      return threads.filter((t) => t.threadStatus === 'needs_approval');
    if (filter === 'sent') return threads.filter((t) => t.threadStatus === 'sent');
    if (filter === 'internal') return threads.filter((t) => t.kind === 'internal_note');
    if (filter === 'portal') return threads.filter((t) => t.kind === 'portal_message');
    if (filter === 'unanswered') return threads.filter((t) => t.threadStatus === 'unanswered');
    if (filter === 'system') return threads.filter((t) => t.systemMail);
    if (filter === 'snoozed') return threads.filter((t) => t.threadStatus === 'snoozed');
    return threads;
  }

  // ─── Actions ────────────────────────────────────────────────
  function performAction({
    customerId,
    threadId,
    action,
    actor = 'staff',
    tenantId = 'hair_tp',
    snoozeUntilIso = null,
    journeyStep = null,
    reason = '',
  } = {}) {
    if (!customerId || !threadId) throw new Error('customerId + threadId krävs');
    if (!VALID_ACTIONS.includes(action)) throw new Error('invalid action: ' + action);

    const rec = ensureThreadStateRecord(tenantId, customerId, threadId);
    const previous = {
      handled: rec.handled,
      snoozedUntil: rec.snoozedUntil,
      readAt: rec.readAt,
      linkedJourneyStep: rec.linkedJourneyStep,
    };

    let auditKind = 'thread.unknown';
    if (action === 'mark_handled') {
      rec.handled = true;
      auditKind = 'thread.mark_handled';
    } else if (action === 'unmark_handled') {
      rec.handled = false;
      auditKind = 'thread.unmark_handled';
    } else if (action === 'snooze') {
      rec.snoozedUntil = snoozeUntilIso || new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      auditKind = 'thread.snoozed';
    } else if (action === 'unsnooze') {
      rec.snoozedUntil = null;
      auditKind = 'thread.unsnoozed';
    } else if (action === 'mark_read') {
      rec.readAt = nowIso();
      auditKind = 'thread.read';
    } else if (action === 'link_journey') {
      rec.linkedJourneyStep = journeyStep || null;
      auditKind = 'thread.linked_to_journey_step';
    }

    rec.history.push({
      ts: nowIso(),
      actor,
      action,
      reason: reason || null,
      previous,
      journeyStep,
    });
    if (rec.history.length > 100) rec.history = rec.history.slice(-100);

    persist();
    logAudit(auditKind, {
      tenantId,
      actor,
      customerId,
      threadId,
      previousStatus: previous,
      newStatus: rec,
      reason,
      journeyStep,
    });
    return rec;
  }

  function stats() {
    const all = Object.values(state.threadStates);
    return {
      totalStateRecords: all.length,
      handled: all.filter((s) => s.handled).length,
      snoozed: all.filter((s) => s.snoozedUntil && Date.parse(s.snoozedUntil) > Date.now()).length,
      read: all.filter((s) => s.readAt).length,
      linkedJourney: all.filter((s) => s.linkedJourneyStep).length,
    };
  }

  return {
    VALID_ACTIONS,
    VALID_FILTERS,
    isSystemMail,
    buildThreadsForCustomer,
    filterThreads,
    performAction,
    getThreadState,
    stats,
  };
}

module.exports = {
  createCcoConversationThreadStore,
  VALID_ACTIONS,
  VALID_FILTERS,
  SYSTEM_PATTERNS,
  isSystemMail,
};
