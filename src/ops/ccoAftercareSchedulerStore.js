// src/ops/ccoAftercareSchedulerStore.js
// CCO Aftercare Scheduler Store (Steg 5 av Communication & Compliance audit).
// Spec: docs/strategy/CONSENT-AGREEMENT-AFTERCARE-FLOW.md (Del B).
//
// Koar aftercare- och follow-up-jobb per avslutad behandling (encounter) och
// processar forfallna jobb via sendStore (ccoSendActionStore). Om send-pipelinen
// inte ar monterad annu ligger jobben kvar i ko (outcome 'deferred') - graceful
// degradation tills ccoSendActionStore/ccoTemplateRegistry finns.
//
// OBS PDL/GDPR: jobbfilen innehaller patientkontakt (namn/email/telefon) och
// MASTE ligga under data/ (gitignorad). Ingen patientdata i loggar eller audit.

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { renderMessage } = require('./ccoMessageRenderer');

const JOB_STATUSES = Object.freeze(['queued', 'sent', 'failed', 'cancelled', 'skipped']);
const DEFAULT_AFTERCARE_TOUCHPOINTS = Object.freeze(['1h', '1d']);
const MAX_SEND_ATTEMPTS = 10;

const MS_PER_UNIT = Object.freeze({
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  m: 30 * 24 * 60 * 60 * 1000, // ~1 manad enligt spec (1m = ~30d)
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Cadence-/offset-parser. Tolkar '1h', '1d', '7d', '2w', '1m', '3m', '12m'
// samt sammansatta tokens som '2w_after_each_session', '1m_after_final',
// '7d_suture_removal', '2w_touchup_window' (ledande Nh/Nd/Nw/Nm avgor offset).
function parseCadenceOffset(token) {
  const normalized = normalizeText(token).toLowerCase();
  const match = normalized.match(/^(\d+)\s*(h|d|w|m)/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    token: normalized,
    offsetMs: amount * MS_PER_UNIT[match[2]],
    afterFinal: normalized.includes('after_final'),
    eachSession: normalized.includes('each'),
  };
}

// Idempotent jobb-id enligt spec B.3: sha256(customerId|encounterId|templateRef|offset).
// sessionIndex ingår när en 'each_session'-kadens skapar flera jobb, så varje
// session får ett eget id och återupprepning av samma session inte dupliceras.
function mkJobId(customerId, encounterId, templateRef, offsetToken, sessionIndex) {
  const parts = [customerId, encounterId, templateRef, offsetToken].map((v) => normalizeText(v));
  const index = Number(sessionIndex);
  if (Number.isFinite(index) && index > 1) parts.push(`s${index}`);
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Kopplar follow-up-kadens (4m/6m/8m/12m) till följebrevsvarianten i
// ccoJournalStore (FORM_VARIANTS.follow_up). Övriga kadenser (2w, 7d, 1m,
// 3m, ...) saknar egen variant och faller tillbaka på journalstorets default.
const FOLLOWUP_FORM_VARIANT_BY_CADENCE = Object.freeze({
  '4m': '4_manader',
  '6m': '6_manader',
  '8m': '8_manader',
  '12m': '12_manader',
});

function resolveFollowUpFormVariant(offsetToken) {
  const key = normalizeText(offsetToken).toLowerCase();
  const match = key.match(/^(\d+)\s*m/);
  if (!match) return null;
  return FOLLOWUP_FORM_VARIANT_BY_CADENCE[`${match[1]}m`] || null;
}

const FOLLOWUP_CADENCE_LABELS = Object.freeze({
  '4m': '4 månader',
  '6m': '6 månader',
  '8m': '8 månader',
  '12m': '12 månader',
});

async function createCcoAftercareSchedulerStore({
  filePath,
  treatmentRequirements = null,
  auditLog = null,
  sendStore = null,
  templateRegistry = null,
  journalStore = null,
  logger = console,
} = {}) {
  if (!filePath) throw new Error('filePath saknas for aftercare-scheduler.');

  const treatments =
    treatmentRequirements?.treatments && typeof treatmentRequirements.treatments === 'object'
      ? treatmentRequirements.treatments
      : {};

  let data = { version: 1, updatedAt: null, jobs: {} };
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.jobs && typeof parsed.jobs === 'object') {
      data = parsed;
    }
  } catch {
    // Forsta korningen - filen skapas vid forsta persist.
  }

  let persistChain = Promise.resolve();
  function persist() {
    persistChain = persistChain
      .then(async () => {
        data.updatedAt = nowIso();
        const tmpPath = `${filePath}.tmp`;
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
        await fs.rename(tmpPath, filePath);
      })
      .catch((err) => {
        logger?.warn?.('[cco-aftercare] persist misslyckades:', err.message);
      });
    return persistChain;
  }

  function audit(action, { target = null, result = 'ok', role = 'system', detail = null } = {}) {
    try {
      auditLog?.append?.({ action, actor: { role }, target, result, detail });
    } catch {
      // Audit far aldrig falla sjalva flodet.
    }
  }

  // Antal sessioner i en behandlingsserie. Styr 'each_session'-kadens: en
  // follow-up per session. Saknas fält i config blir det 1 (en enda session).
  function resolveSessionCount(treatment = {}) {
    const raw = treatment.sessionCount ?? treatment.expectedSessions ?? treatment.numSessions;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }

  // Expandera en kadenstoken till rätt antal planposter. Läser flaggorna som
  // parseCadenceOffset redan sätter:
  //   'after_final'   → en post (offset räknas från sista sessionen)
  //   'each_session'  → en post per session (sessionCount styr antalet)
  //   vanlig offset   → en post
  function expandCadencePlan(kind, templateRef, offset, treatment) {
    const base = {
      kind,
      templateRef,
      offsetToken: offset.token,
      offsetMs: offset.offsetMs,
      channel: kind === 'aftercare' ? (offset.offsetMs < MS_PER_UNIT.d ? 'sms' : 'email') : 'email',
    };
    if (offset.eachSession) {
      const sessionCount = resolveSessionCount(treatment);
      const entries = [];
      for (let i = 1; i <= sessionCount; i += 1) {
        entries.push({ ...base, sessionIndex: i, sessionCount });
      }
      return entries;
    }
    return [{ ...base, sessionIndex: null, sessionCount: null }];
  }

  // Planera jobb for en behandling: aftercare-touchpoints (default T+1h sms,
  // T+1d email; kan overstyras med treatment.aftercareTouchpoints i config)
  // plus follow-ups fran followupCadence (templateRef followup_<cadence>).
  function plannedJobsForTreatment(treatmentKey, treatment) {
    const planned = [];
    const aftercareTemplate = normalizeText(treatment.aftercareTemplate);
    if (aftercareTemplate) {
      const touchpoints =
        Array.isArray(treatment.aftercareTouchpoints) && treatment.aftercareTouchpoints.length > 0
          ? treatment.aftercareTouchpoints
          : DEFAULT_AFTERCARE_TOUCHPOINTS;
      for (const token of touchpoints) {
        const offset = parseCadenceOffset(token);
        if (!offset) {
          logger?.warn?.(`[cco-aftercare] okand touchpoint '${token}' for ${treatmentKey}`);
          continue;
        }
        planned.push(...expandCadencePlan('aftercare', aftercareTemplate, offset, treatment));
      }
    }
    const cadences = Array.isArray(treatment.followupCadence) ? treatment.followupCadence : [];
    for (const cadence of cadences) {
      const offset = parseCadenceOffset(cadence);
      if (!offset) {
        logger?.warn?.(`[cco-aftercare] okand cadence '${cadence}' for ${treatmentKey}`);
        continue;
      }
      planned.push(
        // ORD-111 (Väg B): delad mall per tillfälle i stället för per behandling.
        // Behandlingstypen kommer in som {{treatment}}-variabel vid sändning.
        ...expandCadencePlan('followup', `followup_${offset.token}`, offset, treatment)
      );
    }
    return planned;
  }

  // När en follow-up schemaläggs skapas ett journal-UTKAST (follow_up) så att
  // uppföljningen börjar som något att fylla i — inte som ett tomt blad.
  // Idempotent: entryId härleds ur jobb-id:t, så samma jobb ger samma utkast.
  // Fail-safe: ett fel här får aldrig bryta själva schemaläggningen.
  async function createFollowUpJournalDraft(job, tenantId) {
    const tid = normalizeText(tenantId);
    const patientId = normalizeText(job.customerId);
    if (!tid || !patientId) return null;
    const formVariant = resolveFollowUpFormVariant(job.offsetToken);
    const label =
      FOLLOWUP_CADENCE_LABELS[normalizeText(job.offsetToken).toLowerCase()] || job.offsetToken;
    const input = {
      tenantId: tid,
      patientId,
      entryId: `followup_${job.id}`,
      journalType: 'follow_up',
      status: 'draft',
      title: `Uppföljning · ${label}`,
      treatmentEncounterId: job.encounterId,
      fields: {
        aftercareJobId: job.id,
        scheduledForIso: job.dueAt,
        treatmentKey: job.treatmentKey,
        cadence: job.offsetToken,
      },
    };
    if (formVariant) input.formVariant = formVariant;
    try {
      const draft = await journalStore?.upsertEntry?.(input, { actor: { role: 'system' } });
      const entryId = normalizeText(draft?.entryId) || null;
      if (!entryId) {
        // journalStore är en proxy (se server.js) — med optional chaining kan
        // anropet "lyckas" och ändå returnera undefined om den riktiga storen
        // saknas. Då ska det höras, inte tyst bli null.
        logger?.warn?.(
          '[cco-aftercare] journal-utkast skapades inte — journalStore saknas eller returnerade tomt.'
        );
      }
      return entryId;
    } catch (err) {
      logger?.warn?.('[cco-aftercare] journal-utkast misslyckades:', err.message);
      return null;
    }
  }

  // Skapa jobb for en avslutad behandling. Idempotent: samma encounter +
  // templateRef + offset ger samma jobb-id och dubbletter hoppas over.
  async function scheduleForCompletedEncounter(input = {}) {
    const customerId = normalizeText(input.customerId);
    const encounterId = normalizeText(input.encounterId);
    const treatmentKey = normalizeText(input.treatmentKey).toLowerCase();
    const tenantId = normalizeText(input.tenantId);
    if (!customerId) throw httpError(400, 'customerId kravs');
    if (!encounterId) throw httpError(400, 'encounterId kravs');
    if (!treatmentKey) throw httpError(400, 'treatmentKey kravs');

    const treatment = treatments[treatmentKey];
    if (!treatment) {
      return {
        scheduled: 0,
        skippedExisting: 0,
        jobs: [],
        reason: `okand treatmentKey: ${treatmentKey}`,
      };
    }

    const completedAtMs = Number.isFinite(Date.parse(input.completedAt))
      ? Date.parse(input.completedAt)
      : Date.now();
    const completedAt = new Date(completedAtMs).toISOString();

    const planned = plannedJobsForTreatment(treatmentKey, treatment);
    if (planned.length === 0) {
      return {
        scheduled: 0,
        skippedExisting: 0,
        jobs: [],
        reason: 'ingen aftercare/follow-up konfigurerad',
      };
    }

    const created = [];
    let skippedExisting = 0;
    for (const plan of planned) {
      const id = mkJobId(
        customerId,
        encounterId,
        plan.templateRef,
        plan.offsetToken,
        plan.sessionIndex
      );
      if (data.jobs[id]) {
        skippedExisting += 1;
        continue;
      }
      const job = {
        id,
        status: 'queued',
        kind: plan.kind,
        customerId,
        customerName: normalizeText(input.customerName) || null,
        customerEmail: normalizeText(input.customerEmail) || null,
        customerPhone: normalizeText(input.customerPhone) || null,
        treatmentKey,
        encounterId,
        templateRef: plan.templateRef,
        channel: plan.channel,
        sessionIndex: plan.sessionIndex || null,
        sessionCount: plan.sessionCount || null,
        offsetToken: plan.offsetToken,
        completedAt,
        dueAt: new Date(completedAtMs + plan.offsetMs).toISOString(),
        createdAt: nowIso(),
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        sentAt: null,
        cancelledAt: null,
        cancelReason: null,
        journalDraftEntryId: null,
      };
      if (plan.kind === 'followup') {
        job.journalDraftEntryId = await createFollowUpJournalDraft(job, tenantId);
      }
      data.jobs[id] = job;
      created.push({ ...job });
      audit('aftercare.job.queued', {
        target: { type: 'aftercare_job', id },
        detail: {
          treatmentKey,
          templateRef: plan.templateRef,
          channel: plan.channel,
          offset: plan.offsetToken,
          dueAt: job.dueAt,
          journalDraftEntryId: job.journalDraftEntryId,
        },
      });
    }

    if (created.length > 0) await persist();
    return { scheduled: created.length, skippedExisting, jobs: created };
  }

  function listJobs({ status = null, customerId = null, treatmentKey = null, limit = 200 } = {}) {
    const wantStatus = normalizeText(status).toLowerCase() || null;
    const wantCustomer = normalizeText(customerId) || null;
    const wantTreatment = normalizeText(treatmentKey).toLowerCase() || null;
    const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 200;
    return Object.values(data.jobs)
      .filter((job) => {
        if (wantStatus && job.status !== wantStatus) return false;
        if (wantCustomer && job.customerId !== wantCustomer) return false;
        if (wantTreatment && job.treatmentKey !== wantTreatment) return false;
        return true;
      })
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
      .slice(0, max)
      .map((job) => ({ ...job }));
  }

  function getJob(id) {
    const job = data.jobs[normalizeText(id)];
    return job ? { ...job } : null;
  }

  function stats() {
    const byStatus = {};
    for (const statusName of JOB_STATUSES) byStatus[statusName] = 0;
    let nextDueAt = null;
    let overdue = 0;
    const now = Date.now();
    for (const job of Object.values(data.jobs)) {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
      if (job.status === 'queued') {
        const dueMs = Date.parse(job.dueAt);
        if (dueMs <= now) overdue += 1;
        if (!nextDueAt || dueMs < Date.parse(nextDueAt)) nextDueAt = job.dueAt;
      }
    }
    return { total: Object.keys(data.jobs).length, byStatus, nextDueAt, overdue };
  }

  async function cancelJob(id, { reason = '', role = 'staff' } = {}) {
    const job = data.jobs[normalizeText(id)];
    if (!job) throw httpError(404, 'job_not_found');
    if (job.status !== 'queued') {
      throw httpError(409, `kan inte avbryta jobb i status ${job.status}`);
    }
    job.status = 'cancelled';
    job.cancelledAt = nowIso();
    job.cancelReason = normalizeText(reason) || null;
    audit('aftercare.job.cancelled', {
      target: { type: 'aftercare_job', id: job.id },
      role,
      detail: { reason: job.cancelReason, templateRef: job.templateRef },
    });
    await persist();
    return { ...job };
  }

  // ORD-140 §2/§4 — stäng alla follow-up-jobb + utkast för ett tillfälle.
  // Ett redan skickat jobb (eller annan icke-queued status) får INTE fälla
  // flödet — det hoppas över och räknas i outcome.skipped.
  async function cancelFollowUpsForEncounter({ tenantId, encounterId, reason = '', eventId = '', actor = {} } = {}) {
    const eid = normalizeText(encounterId);
    const tid = normalizeText(tenantId);
    const jobs = Object.values(data.jobs).filter((job) => job.encounterId === eid);
    const outcome = { cancelled: 0, skipped: 0, closedDrafts: 0 };
    for (const job of jobs) {
      if (job.status === 'queued') {
        job.status = 'cancelled';
        job.cancelledAt = nowIso();
        job.cancelReason = normalizeText(reason);
        outcome.cancelled += 1;
      } else {
        outcome.skipped += 1; // skickat/misslyckat/redan avbrutet
      }
      if (job.kind === 'followup' && job.journalDraftEntryId) {
        try {
          const closed = await journalStore?.closeEntry?.({
            tenantId: tid,
            patientId: job.customerId,
            entryId: job.journalDraftEntryId,
            reason: normalizeText(reason),
            eventId: normalizeText(eventId),
            actor,
          });
          if (closed && closed.closedAt) {
            outcome.closedDrafts += 1;
          } else {
            logger?.warn?.(
              '[cco-aftercare] utkast stängdes inte — journalStore saknas eller returnerade tomt.'
            );
          }
        } catch (err) {
          logger?.warn?.('[cco-aftercare] stängning av utkast misslyckades:', err.message);
        }
      }
    }
    if (outcome.cancelled > 0 || outcome.closedDrafts > 0) await persist();
    audit('aftercare.encounter.followups_cancelled', {
      target: { type: 'aftercare_encounter', id: eid },
      detail: { reason: normalizeText(reason), ...outcome },
    });
    return outcome;
  }

  // ORD-147 §4 — avslutad vård gäller ALLT framtida, inte ett enda tillfälle.
  // Samma väg som cancelFollowUpsForEncounter, men filtrerar på kund i stället
  // för encounter: alla köade jobb (oavsett behandlingstillfälle) avbryts och
  // deras uppföljningsutkast stängs via ORD-140:s journal-closeEntry. Ingen andra
  // stängningsimplementation — bara utlösaren.
  async function cancelFollowUpsForCustomer({
    tenantId,
    customerId,
    reason = '',
    eventId = '',
    actor = {},
  } = {}) {
    const cid = normalizeText(customerId);
    const tid = normalizeText(tenantId);
    if (!cid) {
      return { cancelled: 0, skipped: 0, closedDrafts: 0, reason: 'customerId krävs' };
    }
    const jobs = Object.values(data.jobs).filter((job) => normalizeText(job.customerId) === cid);
    const outcome = { cancelled: 0, skipped: 0, closedDrafts: 0 };
    for (const job of jobs) {
      if (job.status === 'queued') {
        job.status = 'cancelled';
        job.cancelledAt = nowIso();
        job.cancelReason = normalizeText(reason);
        outcome.cancelled += 1;
      } else {
        outcome.skipped += 1; // skickat/misslyckat/redan avbrutet — rörs inte
      }
      if (job.kind === 'followup' && job.journalDraftEntryId) {
        try {
          const closed = await journalStore?.closeEntry?.({
            tenantId: tid,
            patientId: job.customerId,
            entryId: job.journalDraftEntryId,
            reason: normalizeText(reason),
            eventId: normalizeText(eventId),
            actor,
          });
          if (closed && closed.closedAt) {
            outcome.closedDrafts += 1;
          } else {
            logger?.warn?.(
              '[cco-aftercare] utkast stängdes inte vid avslutad vård — journalStore saknas eller returnerade tomt.'
            );
          }
        } catch (err) {
          logger?.warn?.('[cco-aftercare] stängning av utkast misslyckades:', err.message);
        }
      }
    }
    if (outcome.cancelled > 0 || outcome.closedDrafts > 0) await persist();
    audit('aftercare.customer.followups_cancelled', {
      target: { type: 'aftercare_customer', id: cid },
      detail: { reason: normalizeText(reason), ...outcome },
    });
    return outcome;
  }

  // Processa ETT jobb. Outcomes:
  //  'sent'     - skickat via sendStore
  //  'skipped'  - terminal skip (mall saknas i registry)
  //  'deferred' - send-pipeline ej monterad, jobbet ligger kvar i ko
  //  'retry'    - sandfel, forsoker igen nasta tick (tills MAX_SEND_ATTEMPTS)
  //  'failed'   - terminal efter MAX_SEND_ATTEMPTS
  //  'dry_run'  - ingen mutation
  async function processJob(job, { dryRun = false, role = 'system' } = {}) {
    if (dryRun) return { id: job.id, outcome: 'dry_run' };
    job.lastAttemptAt = nowIso();

    // OBS: registry-wrappern i server.js ger undefined BADE nar registryt inte
    // ar monterat och nar mallen saknas - vi kan inte skilja fallen at. Darfor
    // deferred (kvar i ko) istallet for terminal skip; staff kan avbryta jobb
    // vars mall aldrig kommer registreras. Terminal 'skipped' reserveras for
    // consent-revocation (nar ccoMarketingConsentStore finns).
    if (typeof templateRegistry?.get === 'function') {
      const template = templateRegistry.get(job.templateRef);
      if (template === null || template === undefined) {
        job.lastError = 'template_unavailable';
        return { id: job.id, outcome: 'deferred' };
      }
    }

    // Render mall-revisionen till ett klart meddelande. VARIABLER: vi fyller
    // det systemet redan vet (firstName, treatment-label, treatmentKey). Om en
    // variabel saknar värde stannar vi (TEMPLATE_MISSING_VARIABLE) — en patient
    // ska aldrig se ofyllda {{namn}} (se ccoMessageRenderer).
    let message;
    try {
      const lang = job.templateLang || 'sv';
      const snap =
        typeof templateRegistry?.snapshot === 'function'
          ? templateRegistry.snapshot(job.templateRef, lang)
          : null;
      if (snap) {
        const vars = {
          firstName: job.customerName ? String(job.customerName).trim().split(/\s+/)[0] : '',
          treatment: treatments[job.treatmentKey]?.label || job.treatmentKey,
          treatmentKey: job.treatmentKey,
          customerName: job.customerName,
          customerEmail: job.customerEmail,
          sessionIndex: job.sessionIndex || null,
          sessionCount: job.sessionCount || null,
        };
        message = renderMessage(snap, vars);
      }
    } catch (renderErr) {
      const isLegalBlock =
        renderErr?.code === 'TEMPLATE_NOT_LEGALLY_APPROVED' || renderErr?.statusCode === 403;
      if (isLegalBlock) {
        // JURIDISKT STOPPAT: mallen är inte godkänd. Jobbet är inte trasigt — det VÄNTAR.
        // Låt det stå kvar som queued (inte terminal 'failed') så en senare godkännande
        // återupplivar det vid nästa körning, och skilj det från rendererfel i auditen.
        //
        // attempts räknas INTE upp här. Väntan är inte ett försök: med 5-minuterskronet
        // passerade en juridiskt blockerad kö MAX_SEND_ATTEMPTS (10) på under en timme,
        // och när juridiken sedan godkände mallen hade jobbet noll återförsök kvar —
        // ett enda sändfel hade blivit terminalt direkt. Uppmätt: 12 tick gav attempts=12.
        job.status = 'queued';
        job.lastError = 'legal_review_pending';
        audit('aftercare.job.legal_blocked', {
          target: { type: 'aftercare_job', id: job.id },
          detail: { templateRef: job.templateRef, legalReviewStatus: 'pending' },
        });
      } else {
        job.attempts += 1;
        job.lastError = String(renderErr?.message || renderErr).slice(0, 300);
        job.status = 'failed';
        audit('aftercare.job.render_failed', {
          target: { type: 'aftercare_job', id: job.id },
          detail: { templateRef: job.templateRef, error: job.lastError },
        });
      }
      return { id: job.id, outcome: job.status };
    }
    try {
      const result = await sendStore?.performSend?.({
        kind: 'aftercare',
        payload: {
          jobId: job.id,
          jobKind: job.kind,
          templateRef: job.templateRef,
          channel: job.channel,
          customerId: job.customerId,
          customerName: job.customerName,
          customerEmail: job.customerEmail,
          customerPhone: job.customerPhone,
          treatmentKey: job.treatmentKey,
          encounterId: job.encounterId,
          subject: message?.subject || '',
          text: message?.text || '',
          html: message?.html || '',
        },
        customerId: job.customerId,
        role,
        templateRef: job.templateRef,
        templateLang: 'sv',
      });
      if (result === undefined || result === null) {
        // ccoSendActionStore ej monterad (optional chaining gav undefined).
        job.lastError = 'send_store_unavailable';
        return { id: job.id, outcome: 'deferred' };
      }
      job.status = 'sent';
      job.sentAt = nowIso();
      job.attempts += 1;
      job.lastError = null;
      audit('aftercare.job.sent', {
        target: { type: 'aftercare_job', id: job.id },
        detail: { templateRef: job.templateRef, channel: job.channel },
      });
      return { id: job.id, outcome: 'sent' };
    } catch (err) {
      job.attempts += 1;
      job.lastError = String(err?.message || err).slice(0, 300);
      const terminal = job.attempts >= MAX_SEND_ATTEMPTS;
      if (terminal) job.status = 'failed';
      audit('aftercare.job.failed', {
        target: { type: 'aftercare_job', id: job.id },
        result: 'error',
        detail: { error: job.lastError, attempts: job.attempts, willRetry: !terminal },
      });
      return { id: job.id, outcome: terminal ? 'failed' : 'retry' };
    }
  }

  async function triggerNow(id, { role = 'staff' } = {}) {
    const job = data.jobs[normalizeText(id)];
    if (!job) throw httpError(404, 'job_not_found');
    if (job.status !== 'queued') {
      throw httpError(409, `kan inte trigga jobb i status ${job.status}`);
    }
    const result = await processJob(job, { role });
    await persist();
    return { ...job, lastOutcome: result.outcome };
  }

  async function runDueJobs({ maxPerTick = 50, dryRun = false } = {}) {
    const now = Date.now();
    const cap =
      Number.isFinite(Number(maxPerTick)) && Number(maxPerTick) > 0 ? Number(maxPerTick) : 50;
    const due = Object.values(data.jobs)
      .filter((job) => job.status === 'queued' && Date.parse(job.dueAt) <= now)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
      .slice(0, cap);

    let success = 0;
    let failed = 0;
    let skipped = 0;
    let deferred = 0;
    for (const job of due) {
      const result = await processJob(job, { dryRun });
      if (result.outcome === 'sent' || result.outcome === 'dry_run') success += 1;
      else if (result.outcome === 'skipped') skipped += 1;
      else if (result.outcome === 'deferred') deferred += 1;
      else failed += 1;
    }
    if (!dryRun && due.length > 0) await persist();
    return { processed: due.length, success, failed, skipped, deferred, dryRun: Boolean(dryRun) };
  }

  return {
    scheduleForCompletedEncounter,
    listJobs,
    getJob,
    stats,
    cancelJob,
    cancelFollowUpsForEncounter,
    cancelFollowUpsForCustomer,
    triggerNow,
    runDueJobs,
  };
}

module.exports = {
  JOB_STATUSES,
  parseCadenceOffset,
  mkJobId,
  resolveFollowUpFormVariant,
  createCcoAftercareSchedulerStore,
};
