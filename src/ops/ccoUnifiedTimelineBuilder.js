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
  documents: ['asset_uploaded', 'consent_signed', 'agreement_signed'],
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
} = {}) {
  if (!customerId) return { events: [], counts: {} };

  const events = [];

  // 1. Trådar (mail + drafts + interna notiser + send-actions)
  if (threadStore?.buildThreadsForCustomer) {
    try {
      const { threads } = threadStore.buildThreadsForCustomer(customerId, { tenantId });
      for (const t of threads) {
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
          },
          source: 'thread',
          entityId: t.threadId,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Kundresa-historik
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
      const assets = lister({ patientId: customerId, tenantId, limit: 50 }) || [];
      for (const a of assets) {
        events.push({
          ts: a.createdAt || a.uploadedAt,
          kind: 'asset_uploaded',
          category: 'documents',
          icon: EVENT_KIND_ICONS.asset_uploaded,
          title: a.kind || a.assetKind || 'Fil',
          summary: a.label || a.filename || '',
          meta: {
            assetId: a.assetId,
            kind: a.kind || a.assetKind,
            status: a.status,
            // INTE path eller URL — bara metadata
          },
          source: 'asset',
          entityId: a.assetId,
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

  // ─── Sort by ts desc ──
  events.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));

  // ─── Filter ──
  const filtered = (() => {
    if (!filter || filter === 'all') return events;
    if (filter in EVENT_CATEGORIES) {
      return events.filter((e) => e.category === filter);
    }
    return events.filter((e) => e.kind === filter);
  })();

  // ─── Counts per category ──
  const counts = { all: events.length };
  for (const cat of Object.keys(EVENT_CATEGORIES)) {
    counts[cat] = events.filter((e) => e.category === cat).length;
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
};
