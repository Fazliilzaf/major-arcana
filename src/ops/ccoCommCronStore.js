'use strict';

/* ─── ccoCommCronStore — Komm Sprint 3 (cron dry-run queue) ──────────────
 *
 * Owner-mandat:
 *  - INGET externt utskick i Sprint 3 (allt är dry-run).
 *  - Cron schemalägger PROPOSALS — staff måste fortfarande godkänna
 *    via Svarstudio (Sprint 2 draft-flöde).
 *  - Aldrig auto-trigger på lead/journal/AI-content.
 *  - Allt auditas. PII maskas i log.
 *
 * 6 cron-triggers (deterministiska tidsregler):
 *   1. booking_confirmation      → vid case.status="booked"          (omedelbart)
 *   2. reminder_24h              → 24 timmar före booking.startTime
 *   3. missing_documents         → 48h före booking om HD/FF/samtycke saknas
 *   4. no_show_followup          → 2h efter case.status="no_show"
 *   5. aftercare_d7              → 7 dagar efter encounter.completed
 *   6. follow_up_3m              → 90 dagar efter encounter.completed
 *
 * Sprint 3 = DRY-RUN. Producerar rapport:
 *   { trigger, customerId, scheduledFor, templateId, status: "queued"|"already_exists"|"skipped" }
 *
 * Persisterar dry-run-historik så staff kan se vad cron skulle ha gjort.
 *
 * ───────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const TRIGGER_TO_TEMPLATE = {
  booking_confirmation: 'booking_confirmation_v1',
  reminder_24h: 'reminder_24h_v1',
  missing_documents: 'missing_documents_v1',
  no_show_followup: 'no_show_followup_v1',
  aftercare_d7: 'aftercare_d7_v1',
  follow_up_3m: 'follow_up_3m_v1',
};

const VALID_TRIGGERS = Object.keys(TRIGGER_TO_TEMPLATE);

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

async function createCcoCommCronStore({ filePath, auditLog } = {}) {
  if (!filePath) throw new Error('filePath required');

  const state = loadJson(filePath) || { runs: [], lastRunAt: null };

  function persist() {
    saveJson(filePath, state);
  }

  function log(eventKind, detail) {
    try {
      if (auditLog?.logEvent) {
        auditLog.logEvent({
          kind: eventKind,
          tenantId: detail.tenantId || 'hair_tp',
          actor: 'system:cron',
          entityKind: 'comm_cron',
          entityId: detail.runId || null,
          detail: {
            trigger: detail.trigger,
            proposalsCount: detail.proposalsCount,
            dryRun: true,
          },
        });
      }
    } catch {
      /* ignore audit-bind fel */
    }
  }

  /**
   * Bedöm dry-run-proposals utan att skapa drafts.
   * Tar in befintliga bookings + encounters + drafts från andra stores.
   */
  function buildProposals({
    trigger,
    tenantId,
    bookings = [],
    encounters = [],
    cases = [],
    existingDrafts = [],
  }) {
    if (!VALID_TRIGGERS.includes(trigger)) {
      throw new Error('invalid trigger: ' + trigger);
    }
    const templateId = TRIGGER_TO_TEMPLATE[trigger];
    const proposals = [];
    const now = Date.now();

    const hasDraftFor = (customerId, journeyStep) => {
      return existingDrafts.some(
        (d) =>
          d.customerId === customerId &&
          d.templateId === templateId &&
          d.status !== 'cancelled' &&
          d.status !== 'failed'
      );
    };

    if (trigger === 'booking_confirmation') {
      for (const b of bookings) {
        if (b.status !== 'booked' && b.status !== 'confirmed') continue;
        if (!b.customerId) continue;
        const status = hasDraftFor(b.customerId, 'booking_confirmed')
          ? 'already_exists'
          : 'would_create';
        proposals.push({
          trigger,
          customerId: b.customerId,
          templateId,
          channel: 'email',
          scheduledFor: nowIso(),
          status,
          reason: status === 'already_exists' ? 'draft exists for this booking' : null,
          context: { bookingId: b.bookingId || b.id, startTime: b.startTime },
        });
      }
    }

    if (trigger === 'reminder_24h') {
      const T_24H = 24 * 3600 * 1000;
      const WINDOW = 60 * 60 * 1000; // 1h-fönster (cron körs varje timme)
      for (const b of bookings) {
        if (b.status !== 'booked' && b.status !== 'confirmed') continue;
        if (!b.customerId || !b.startTime) continue;
        const ms = new Date(b.startTime).getTime();
        if (isNaN(ms)) continue;
        const delta = ms - now;
        if (delta > T_24H + WINDOW || delta < T_24H - WINDOW) continue;
        const status = hasDraftFor(b.customerId, 'pre_treatment_reminder')
          ? 'already_exists'
          : 'would_create';
        proposals.push({
          trigger,
          customerId: b.customerId,
          templateId,
          channel: 'sms',
          scheduledFor: nowIso(),
          status,
          reason: null,
          context: { bookingId: b.bookingId || b.id, startTime: b.startTime, hoursBefore: 24 },
        });
      }
    }

    if (trigger === 'missing_documents') {
      const T_48H = 48 * 3600 * 1000;
      const WINDOW = 60 * 60 * 1000;
      for (const b of bookings) {
        if (b.status !== 'booked' && b.status !== 'confirmed') continue;
        if (!b.customerId || !b.startTime) continue;
        const ms = new Date(b.startTime).getTime();
        if (isNaN(ms)) continue;
        const delta = ms - now;
        if (delta > T_48H + WINDOW || delta < T_48H - WINDOW) continue;
        // Bara om kund saknar dokument
        if (!b.missingDocuments || b.missingDocuments.length === 0) continue;
        const status = hasDraftFor(b.customerId, 'missing_documents_reminder')
          ? 'already_exists'
          : 'would_create';
        proposals.push({
          trigger,
          customerId: b.customerId,
          templateId,
          channel: 'email',
          scheduledFor: nowIso(),
          status,
          reason: null,
          context: {
            bookingId: b.bookingId || b.id,
            missingDocuments: b.missingDocuments,
          },
        });
      }
    }

    if (trigger === 'no_show_followup') {
      const T_2H = 2 * 3600 * 1000;
      const T_24H = 24 * 3600 * 1000; // gräns: kör bara upp till 24h efter
      for (const c of cases) {
        if (c.status !== 'no_show') continue;
        if (!c.customerId || !c.updatedAt) continue;
        const ms = new Date(c.updatedAt).getTime();
        if (isNaN(ms)) continue;
        const age = now - ms;
        if (age < T_2H || age > T_24H) continue;
        const status = hasDraftFor(c.customerId, 'no_show_followup')
          ? 'already_exists'
          : 'would_create';
        proposals.push({
          trigger,
          customerId: c.customerId,
          templateId,
          channel: 'email',
          scheduledFor: nowIso(),
          status,
          reason: null,
          context: { caseId: c.caseId || c.id, noShowAt: c.updatedAt },
        });
      }
    }

    if (trigger === 'aftercare_d7') {
      const T_7D = 7 * 24 * 3600 * 1000;
      const WINDOW = 12 * 3600 * 1000; // 12h-fönster (cron körs 1×/dygn)
      for (const e of encounters) {
        if (e.status !== 'completed') continue;
        if (!e.customerId || !e.completedAt) continue;
        const ms = new Date(e.completedAt).getTime();
        if (isNaN(ms)) continue;
        const age = now - ms;
        if (age < T_7D - WINDOW || age > T_7D + WINDOW) continue;
        const status = hasDraftFor(e.customerId, 'aftercare_reminder')
          ? 'already_exists'
          : 'would_create';
        proposals.push({
          trigger,
          customerId: e.customerId,
          templateId,
          channel: 'email',
          scheduledFor: nowIso(),
          status,
          reason: null,
          context: { encounterId: e.encounterId || e.id, completedAt: e.completedAt, daysAfter: 7 },
        });
      }
    }

    if (trigger === 'follow_up_3m') {
      const T_90D = 90 * 24 * 3600 * 1000;
      const WINDOW = 24 * 3600 * 1000;
      for (const e of encounters) {
        if (e.status !== 'completed') continue;
        if (!e.customerId || !e.completedAt) continue;
        const ms = new Date(e.completedAt).getTime();
        if (isNaN(ms)) continue;
        const age = now - ms;
        if (age < T_90D - WINDOW || age > T_90D + WINDOW) continue;
        const status = hasDraftFor(e.customerId, 'follow_up_reminder')
          ? 'already_exists'
          : 'would_create';
        proposals.push({
          trigger,
          customerId: e.customerId,
          templateId,
          channel: 'email',
          scheduledFor: nowIso(),
          status,
          reason: null,
          context: {
            encounterId: e.encounterId || e.id,
            completedAt: e.completedAt,
            daysAfter: 90,
          },
        });
      }
    }

    return proposals;
  }

  /**
   * Persistera en dry-run-körning med alla proposals.
   * Returnerar runId + summary.
   */
  function recordRun({ trigger, tenantId = 'hair_tp', proposals, requestedBy = 'system:cron' }) {
    const runId = 'cron_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const summary = {
      total: proposals.length,
      would_create: proposals.filter((p) => p.status === 'would_create').length,
      already_exists: proposals.filter((p) => p.status === 'already_exists').length,
      skipped: proposals.filter((p) => p.status === 'skipped').length,
    };
    const run = {
      runId,
      trigger,
      tenantId,
      requestedBy,
      ranAt: nowIso(),
      dryRun: true,
      summary,
      proposals,
    };
    state.runs.unshift(run);
    if (state.runs.length > 200) state.runs = state.runs.slice(0, 200);
    state.lastRunAt = run.ranAt;
    persist();
    log('comm_cron.dry_run.executed', {
      runId,
      trigger,
      tenantId,
      proposalsCount: proposals.length,
    });
    return run;
  }

  function listRuns({ trigger, tenantId, limit = 50 } = {}) {
    let runs = state.runs.slice();
    if (trigger) runs = runs.filter((r) => r.trigger === trigger);
    if (tenantId) runs = runs.filter((r) => r.tenantId === tenantId);
    return runs.slice(0, limit);
  }

  function getRun(runId) {
    return state.runs.find((r) => r.runId === runId) || null;
  }

  function stats({ tenantId } = {}) {
    let runs = state.runs;
    if (tenantId) runs = runs.filter((r) => r.tenantId === tenantId);
    const byTrigger = {};
    let totalProposals = 0;
    let totalWouldCreate = 0;
    let totalAlreadyExists = 0;
    for (const r of runs) {
      byTrigger[r.trigger] = (byTrigger[r.trigger] || 0) + 1;
      totalProposals += r.summary?.total || 0;
      totalWouldCreate += r.summary?.would_create || 0;
      totalAlreadyExists += r.summary?.already_exists || 0;
    }
    return {
      totalRuns: runs.length,
      byTrigger,
      lastRunAt: state.lastRunAt,
      totalProposals,
      totalWouldCreate,
      totalAlreadyExists,
    };
  }

  return {
    VALID_TRIGGERS,
    TRIGGER_TO_TEMPLATE,
    buildProposals,
    recordRun,
    listRuns,
    getRun,
    stats,
  };
}

module.exports = { createCcoCommCronStore, VALID_TRIGGERS, TRIGGER_TO_TEMPLATE };
