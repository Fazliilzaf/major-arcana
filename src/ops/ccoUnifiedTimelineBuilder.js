'use strict';

/* ─── ccoUnifiedTimelineBuilder — Komm Sprint 6 ──────────────────────────
 *
 * Aggregator (read-only): mergar alla event-källor per kund i en kronologisk
 * unified timeline. Bygger ovanpå Sprint 4 thread-store och drar in
 * journal-events, journey-history, send-history, bokningar-history.
 *
 * INGEN egen state-fil — ren beräkning per request.
 * INGA externa anrop. Endast befintliga stores.
 *
 * Owner-mandat:
 *  - Inga Drive-länkar (filer visas som "fil bifogad", inte länkad)
 *  - Inga AI på journalinnehåll
 *  - PII-mask i meta (counts, kind, status — ingen rå mail-body utöver preview-snippet)
 *  - Visas bara för authenticated staff (RBAC i endpoint-lager)
 * ────────────────────────────────────────────────────────────────────── */

const EVENT_KIND_ICONS = {
  // Kommunikation
  incoming_mail: '📥',
  outgoing_mail: '📤',
  comm_draft: '✏',
  comm_draft_needs_approval: '⏳',
  comm_draft_approved: '✓',
  comm_draft_queued: '📨',
  comm_sent: '📨',
  comm_failed: '✗',
  comm_cancelled: '⊘',
  internal_note: '🗒',
  portal_chat: '💬',
  portal_sms_inbound: '📩',
  portal_staff_reply: '💬',
  // Utskick
  form_sent: '📋',
  consent_sent: '✍',
  file_sent: '📎',
  // Journal
  journal_entry: '📓',
  journal_signed: '🔏',
  journal_corrected: '✎',
  // Bokningar
  booking_created: '📅',
  booking_confirmed: '✓',
  booking_no_show: '⊘',
  booking_completed: '✓',
  encounter_completed: '🩺',
  // Kundresa
  journey_advance: '→',
  journey_rollback: '↩',
  // Övrigt
  asset_uploaded: '📎',
  consent_signed: '✍',
  agreement_signed: '📝',
  legacy_agreement_imported: '📜',
  document_chain: '🔗',
  health_declaration_received: '📋',
  fitness_certificate_received: '📋',
  patient_document_received: '📎',
};

const EVENT_CATEGORIES = {
  communication: [
    'incoming_mail',
    'outgoing_mail',
    'comm_draft',
    'comm_draft_needs_approval',
    'comm_draft_approved',
    'comm_draft_queued',
    'comm_sent',
    'comm_failed',
    'comm_cancelled',
    'internal_note',
    'portal_chat',
    'portal_sms_inbound',
    'portal_staff_reply',
    'form_sent',
    'consent_sent',
    'file_sent',
  ],
  journal: ['journal_entry', 'journal_signed', 'journal_corrected'],
  bookings: [
    'booking_created',
    'booking_confirmed',
    'booking_no_show',
    'booking_completed',
    'encounter_completed',
  ],
  journey: ['journey_advance', 'journey_rollback'],
  documents: [
    'asset_uploaded',
    'consent_signed',
    'agreement_signed',
    'legacy_agreement_imported',
    'document_chain',
    'health_declaration_received',
    'fitness_certificate_received',
    'patient_document_received',
  ],
};

function nowIso() {
  return new Date().toISOString();
}

function categoryForKind(kind) {
  for (const [cat, kinds] of Object.entries(EVENT_CATEGORIES)) {
    if (kinds.includes(kind)) return cat;
  }
  return 'other';
}

// Endast assets med denna status får visas på kundkortet/tidslinjen.
// Osäkra Drive-filer (NEEDS_REVIEW) och allt annat filtreras bort i byggaren
// själv — defense-in-depth, oberoende av hur assetStore anropas.
const ASSET_VISIBLE_STATUS = 'VISIBLE_ON_PATIENT_CARD';

// Kommunikationskinds som är riktig e-post (används för mail → konversationslänk).
const MAIL_KINDS = new Set([
  'incoming_mail',
  'outgoing_mail',
  'comm_draft',
  'comm_draft_needs_approval',
  'comm_draft_approved',
  'comm_draft_queued',
  'comm_sent',
  'comm_failed',
  'comm_cancelled',
]);

const SEND_KINDS = new Set(['form_sent', 'consent_sent', 'file_sent']);

// Tydlig typ per rad (spec C6): mail, anteckning, utskick, journal, bokning,
// kundresa, bild, dokument, avtal.
function displayTypeForEvent(event) {
  const { kind, category, meta } = event;
  if (MAIL_KINDS.has(kind)) return 'mail';
  if (['portal_chat', 'portal_sms_inbound', 'portal_staff_reply'].includes(kind)) return 'mail';
  if (kind === 'internal_note') return 'anteckning';
  if (SEND_KINDS.has(kind)) return 'utskick';
  if (category === 'journal') return 'journal';
  if (category === 'bookings') return 'bokning';
  if (category === 'journey') return 'kundresa';
  if (kind === 'asset_uploaded') {
    return String(meta?.category || '').startsWith('photo_') ? 'bild' : 'dokument';
  }
  if (kind === 'agreement_signed' || kind === 'legacy_agreement_imported') return 'avtal';
  if (kind === 'document_chain') return 'dokumentkedja';
  return 'övrigt';
}

function maskEmail(email = '') {
  const s = String(email || '');
  if (!s.includes('@')) return s ? s.slice(0, 2) + '***' : '';
  const [user, domain] = s.split('@');
  return (user.slice(0, 2) || '**') + '***@' + (domain || '***');
}

async function buildUnifiedTimeline({
  customerId,
  tenantId = 'hair_tp',
  filter = 'all',
  limit = 200,
  threadStore = null,
  journeyStore = null,
  journalStore = null,
  bookingStore = null,
  encounterStore = null,
  assetStore = null,
  agreementStore = null,
  legacyAgreementStore = null,
  portalMessageStore = null,
  sendActionStore = null,
} = {}) {
  if (!customerId) return { events: [], counts: {} };

  const events = [];

  // 1. Trådar (mail + drafts + interna notiser + send-actions)
  if (threadStore?.buildThreadsForCustomer) {
    try {
      const { threads } = await threadStore.buildThreadsForCustomer(customerId, { tenantId });
      for (const t of threads) {
        const isMail = MAIL_KINDS.has(t.kind);
        events.push({
          ts: t.ts || null,
          kind: t.kind,
          category: categoryForKind(t.kind),
          icon: EVENT_KIND_ICONS[t.kind] || '·',
          title: t.subject || t.kind,
          summary: t.preview || '',
          meta: {
            from: t.from || null,
            channel: t.channel || null,
            journeyStep: t.journeyStep || null,
            status: t.threadStatus || null,
            systemMail: !!t.systemMail,
            // Mail → länka tillbaka till konversationstråden i CCO-inkorgen.
            conversationKey: isMail ? t.threadId || t.conversationId || null : null,
            mailboxId: isMail ? t.mailboxId || null : null,
            // Fas 7: utskick → dokument-kedja.
            sendActionId: t.sendActionId || null,
            relatedEntityKind: t.relatedEntityKind || null,
            relatedEntityId: t.relatedEntityId || null,
          },
          source: 'thread',
          entityId: t.threadId,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Portal-meddelanden (patient↔klinik fri kanal + SMS-brygga)
  if (portalMessageStore?.listMessagesForCustomer) {
    try {
      const msgs = portalMessageStore.listMessagesForCustomer({ tenantId, customerId });
      for (const m of msgs || []) {
        const kind =
          m.channel === 'sms'
            ? 'portal_sms_inbound'
            : m.direction === 'outbound'
              ? 'portal_staff_reply'
              : 'portal_chat';
        events.push({
          ts: m.createdAt || null,
          kind,
          category: 'communication',
          icon: EVENT_KIND_ICONS[kind] || '·',
          title: m.direction === 'inbound' ? 'Portal — patient' : 'Portal — klinik',
          summary: m.body || '',
          meta: {
            direction: m.direction,
            channel: m.channel || 'portal',
            author: m.author || null,
            readAt: m.readAt || null,
          },
          source: 'portal_message',
          entityId: m.id || null,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // 3. Kundresa-historik
  if (journeyStore?.getJourney) {
    try {
      const j = journeyStore.getJourney(customerId, { tenantId });
      for (const h of j.stepHistory || []) {
        const isRollback = h.triggerSource === 'rollback';
        events.push({
          ts: h.ts,
          kind: isRollback ? 'journey_rollback' : 'journey_advance',
          category: 'journey',
          icon: isRollback ? EVENT_KIND_ICONS.journey_rollback : EVENT_KIND_ICONS.journey_advance,
          title:
            (isRollback ? 'Rollback' : 'Steg') +
            ': ' +
            (h.previousStep || '?') +
            ' → ' +
            (h.newStep || '?'),
          summary: h.reason || '',
          meta: {
            previousStep: h.previousStep,
            newStep: h.newStep,
            triggerSource: h.triggerSource,
            actor: h.actor,
          },
          source: 'journey',
          entityId: customerId + ':' + h.ts,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // 3. Journal-entries
  if (journalStore?.listForPatient || journalStore?.listEntries) {
    try {
      const lister = journalStore.listForPatient || journalStore.listEntries;
      const entries = lister({ patientId: customerId, tenantId, limit: 100 }) || [];
      for (const e of entries) {
        events.push({
          ts: e.signedAt || e.updatedAt || e.createdAt || e.ts,
          kind: e.signedAt ? 'journal_signed' : 'journal_entry',
          category: 'journal',
          icon: e.signedAt ? EVENT_KIND_ICONS.journal_signed : EVENT_KIND_ICONS.journal_entry,
          title: e.title || e.subject || 'Journalanteckning',
          summary: '',
          meta: {
            entryId: e.entryId || e.id,
            author: e.authorName || e.author || null,
            signed: !!e.signedAt,
            correction: !!e.isCorrection,
            // INTE rå body — bara metadata
          },
          source: 'journal',
          entityId: e.entryId || e.id,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Bokningar / encounters
  if (encounterStore?.listForPatient) {
    try {
      const encs =
        encounterStore.listForPatient({ patientId: customerId, tenantId, limit: 100 }) || [];
      for (const e of encs) {
        events.push({
          ts: e.completedAt || e.startedAt || e.createdAt,
          kind: e.status === 'completed' ? 'encounter_completed' : 'booking_confirmed',
          category: 'bookings',
          icon: EVENT_KIND_ICONS.encounter_completed,
          title: e.treatment || e.serviceName || 'Behandling',
          summary: e.notes || '',
          meta: {
            encounterId: e.encounterId || e.id,
            resource: e.resourceName || e.resourceId,
            durationMinutes: e.durationMinutes,
            status: e.status,
          },
          source: 'encounter',
          entityId: e.encounterId || e.id,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // 5. Assets (filer uppladdade — INGA länkar, bara metadata)
  if (assetStore?.listAssetsForPatient || assetStore?.listForPatient) {
    try {
      const lister = assetStore.listAssetsForPatient || assetStore.listForPatient;
      const { assetDisplayLabel } = require('./ccoAssetNaming/assetDisplayLabel');
      const assets =
        typeof lister === 'function' && lister.length >= 2
          ? lister(customerId, {}, { actor: { role: 'system' } }) || []
          : lister({ patientId: customerId, tenantId, limit: 50 }) || [];
      for (const a of assets) {
        // SÄKERHET (spec C6): endast VISIBLE_ON_PATIENT_CARD får visas.
        // Osäkra Drive-filer (NEEDS_REVIEW) och alla andra statusar hoppas över.
        if (a.status !== ASSET_VISIBLE_STATUS) continue;
        const label = assetDisplayLabel(a, {
          fallback:
            a.category === 'journal'
              ? 'Journal'
              : (a.category || '').startsWith('photo_')
                ? 'Bild'
                : 'Dokument',
        });
        events.push({
          ts: a.documentDate || a.importedAt || a.createdAt,
          kind: 'asset_uploaded',
          category: 'documents',
          icon: EVENT_KIND_ICONS.asset_uploaded,
          title: label,
          summary: a.patientCardSection || a.subCategory || '',
          meta: {
            assetId: a.id,
            category: a.category,
            status: a.status,
            encounterId: a.encounterId || null,
            patientCardSection: a.patientCardSection || null,
            // Fas 7: spårning tillbaka till utskick.
            sourceSendId: a.sourceSendId || null,
            conversationKey: a.conversationKey || null,
            journeyStep: a.journeyStep || null,
            // Bild/dokument öppnas via befintlig säkrad asset-endpoint
            // (/api/v1/cco/assets/:assetId/download?inline=1 — samma URL som
            // assetToPatientFile().viewUrl), ALDRIG direkt Drive-länk och
            // ALDRIG migration-index-routen (som bara löser fileId, inte
            // native asset-id).
            openRef: a.id ? { kind: 'patient_asset', assetId: a.id } : null,
          },
          source: 'asset',
          entityId: a.id,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // 6. Avtal signerade
  if (agreementStore?.listForCustomer) {
    try {
      const ags = agreementStore.listForCustomer(customerId, { tenantId, limit: 50 }) || [];
      for (const a of ags) {
        if (!a.signedAt) continue;
        events.push({
          ts: a.signedAt,
          kind: 'agreement_signed',
          category: 'documents',
          icon: EVENT_KIND_ICONS.agreement_signed,
          title: a.title || 'Avtal signerat',
          summary: '',
          meta: {
            agreementId: a.agreementId,
            kind: a.kind,
            signedBy: a.signedBy || null,
          },
          source: 'agreement',
          entityId: a.agreementId,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // 6b. Legacy GetAccept-avtal (importerade metadata/PDF)
  if (legacyAgreementStore?.listForCustomer) {
    try {
      const legacy = legacyAgreementStore.listForCustomer(customerId, { limit: 50 }) || [];
      for (const a of legacy) {
        if (!a.signedAt) continue;
        events.push({
          ts: a.signedAt,
          kind: 'legacy_agreement_imported',
          category: 'documents',
          icon: EVENT_KIND_ICONS.legacy_agreement_imported,
          title: a.documentName || 'Legacy-avtal importerat',
          summary: a.brand || '',
          meta: {
            agreementId: a.agreementId,
            sourceSystem: a.sourceSystem,
            sourceRecordId: a.sourceRecordId,
            brand: a.brand,
          },
          source: 'legacy_agreement',
          entityId: a.agreementId,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // ─── Tydlig typ per rad (spec C6) ──
  for (const e of events) {
    e.displayType = displayTypeForEvent(e);
  }

  // ─── Fas 7: kedje-ID från utskick → signerat/importerat dokument ──
  function resolveChainId(e) {
    const meta = e.meta || {};
    if (meta.sendActionId) return meta.sendActionId;
    if (meta.sourceSendId) return meta.sourceSendId;
    if (sendActionStore?.findSendByRelatedEntity) {
      if (e.source === 'agreement' && meta.agreementId) {
        const s = sendActionStore.findSendByRelatedEntity('agreement', meta.agreementId);
        if (s) return s.sendId;
      }
      if (e.source === 'legacy_agreement' && meta.agreementId) {
        const s = sendActionStore.findSendByRelatedEntity('agreement', meta.agreementId);
        if (s) return s.sendId;
      }
    }
    return null;
  }

  function chainSummary(members) {
    const labels = members.map((m) => {
      if (m.kind === 'form_sent') return 'skickat formulär';
      if (m.kind === 'consent_sent') return 'skickat samtycke';
      if (m.kind === 'file_sent') return 'skickat fil';
      if (m.kind === 'agreement_signed') return 'signerat avtal';
      if (m.kind === 'legacy_agreement_imported') return 'importerat avtal';
      if (m.kind === 'asset_uploaded') return 'dokument uppladdat';
      return m.kind;
    });
    if (labels.length === 2) return `${labels[0]} → ${labels[1]}`;
    return labels.slice(0, -1).join(' → ') + ' → ' + labels[labels.length - 1];
  }

  const chainMap = new Map();
  const unchained = [];
  for (const e of events) {
    const chainId = resolveChainId(e);
    if (chainId) {
      e.meta = { ...e.meta, chainId };
      if (!chainMap.has(chainId)) chainMap.set(chainId, []);
      chainMap.get(chainId).push(e);
    } else {
      unchained.push(e);
    }
  }

  const chainEvents = [];
  for (const [chainId, members] of chainMap) {
    if (members.length < 2) {
      unchained.push(...members);
      continue;
    }
    members.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
    const latest = members[0];
    chainEvents.push({
      ts: latest.ts,
      kind: 'document_chain',
      category: 'documents',
      icon: '🔗',
      title: 'Dokumentkedja',
      summary: chainSummary(members),
      displayType: 'dokumentkedja',
      meta: {
        chainId,
        eventCount: members.length,
        kinds: members.map((m) => m.kind),
        firstTs: members[members.length - 1].ts,
        lastTs: latest.ts,
      },
      source: 'chain',
      entityId: chainId,
      events: members.map((m) => ({ ...m })),
    });
  }

  // ─── Sort by ts desc (faktisk timestamp) ──
  const merged = [...chainEvents, ...unchained];
  merged.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));

  // ─── Filter ──
  const filtered = (() => {
    if (!filter || filter === 'all') return merged;
    if (filter in EVENT_CATEGORIES) {
      return merged.filter((e) => e.category === filter);
    }
    return merged.filter((e) => e.kind === filter);
  })();

  // ─── Counts per category ──
  const counts = { all: merged.length };
  for (const cat of Object.keys(EVENT_CATEGORIES)) {
    counts[cat] = merged.filter((e) => e.category === cat).length;
  }

  return {
    customerId,
    tenantId,
    counts,
    count: filtered.slice(0, limit).length,
    events: filtered.slice(0, limit),
    availableFilters: ['all', ...Object.keys(EVENT_CATEGORIES)],
    builtAt: nowIso(),
  };
}

module.exports = {
  buildUnifiedTimeline,
  EVENT_KIND_ICONS,
  EVENT_CATEGORIES,
  categoryForKind,
  displayTypeForEvent,
  ASSET_VISIBLE_STATUS,
};
