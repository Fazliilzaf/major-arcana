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

function truthMessageMatchesCustomer(message = {}, customerId = '') {
  const target = normalizeText(customerId);
  if (!target) return false;
  const identity = message.customerIdentity || message.identity || null;
  if (identity) {
    const resolved = resolveCustomerIdFromIdentity(identity);
    if (resolved && resolved === target) return true;
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

function listTruthMessagesForCustomer(mailboxTruthStore, customerId, historyMailboxIds = []) {
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
    const msgs =
      mailboxTruthStore.listMessages({
        mailboxIds: [mailboxId],
        folderTypes: ['inbox', 'sent', 'drafts'],
        limit: 0,
      }) || [];
    for (const m of msgs) {
      if (truthMessageMatchesCustomer(m, customerId)) rows.push(m);
    }
  }
  if (rows.length === 0 && searchMailboxes.length === 0) {
    for (const m of mailboxTruthStore.listMessages({
      folderTypes: ['inbox', 'sent', 'drafts'],
      limit: 0,
    })) {
      if (truthMessageMatchesCustomer(m, customerId)) rows.push(m);
    }
  }
  return rows;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

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
} = {}) {
  if (!filePath) throw new Error('filePath required');

  const state = loadJson(filePath) || { threadStates: {}, lastSavedAt: null };
  if (!state.threadStates) state.threadStates = {};

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

  function getThreadStateKey(customerId, threadId) {
    return String(customerId || '') + '::' + String(threadId || '');
  }

  function getThreadState(customerId, threadId) {
    const key = getThreadStateKey(customerId, threadId);
    return state.threadStates[key] || null;
  }

  function ensureThreadStateRecord(customerId, threadId) {
    const key = getThreadStateKey(customerId, threadId);
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

  // ─── Build threads for a customer ─────────────────────────────────
  async function buildThreadsForCustomer(customerId, { tenantId = 'hair_tp' } = {}) {
    if (!customerId) return { threads: [], counts: {}, summary: {}, mailboxes: [] };
    const threads = [];
    const mailKeys = new Set();

    await preloadTruthMailboxes(mailboxTruthStore, historyMailboxIds);

    // 1. Mailbox truth (primary — includes hydration customerIdentity overlay)
    if (mailboxTruthStore) {
      try {
        const truthMessages = listTruthMessagesForCustomer(
          mailboxTruthStore,
          customerId,
          historyMailboxIds
        );
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
          threads.push({
            threadId: a.actionId || a.id || 'send-' + a.createdAt,
            kind:
              a.kind === 'form'
                ? 'form_sent'
                : a.kind === 'consent'
                  ? 'consent_sent'
                  : a.kind === 'file'
                    ? 'file_sent'
                    : 'send_action',
            direction: 'outbound',
            ts: a.createdAt,
            subject: a.label || a.formKind || a.consentKind || 'Utskick',
            from: a.sentBy || 'staff',
            preview: '',
            channel: a.channel || 'email',
            requiresAttention: a.status === 'failed',
          });
        }
      } catch (err) {
        /* ignore */
      }
    }

    // ─── Sort by ts desc ──
    threads.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));

    // ─── Merge state (handled/snoozed/read) ──
    for (const t of threads) {
      const st = getThreadState(customerId, t.threadId);
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
      .filter((t) => t.kind === 'incoming_mail' && !t.systemMail)
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
    const lastOutgoing = threads
      .filter(
        (t) =>
          t.kind === 'outgoing_mail' ||
          t.kind === 'comm_sent' ||
          t.kind === 'form_sent' ||
          t.kind === 'consent_sent'
      )
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];

    const nowMs = Date.now();
    for (const t of threads) {
      if (t.kind !== 'incoming_mail' || t.systemMail) continue;
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

    return { threads, counts, summary, mailboxes };
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

    const rec = ensureThreadStateRecord(customerId, threadId);
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
