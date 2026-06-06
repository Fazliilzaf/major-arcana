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
function mkJobId(customerId, encounterId, templateRef, offsetToken) {
  return crypto
    .createHash('sha256')
    .update(
      [customerId, encounterId, templateRef, offsetToken].map((v) => normalizeText(v)).join('|')
    )
    .digest('hex')
    .slice(0, 24);
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function createCcoAftercareSchedulerStore({
  filePath,
  treatmentRequirements = null,
  auditLog = null,
  sendStore = null,
  templateRegistry = null,
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

  // Planera jobb for en behandling: aftercare-touchpoints (default T+1h sms,
  // T+1d email; kan overstyras med treatment.aftercareTouchpoints i config)
  // plus follow-ups fran followupCadence (templateRef followup_<treatment>_<cadence>).
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
        planned.push({
          kind: 'aftercare',
          templateRef: aftercareTemplate,
          offsetToken: offset.token,
          offsetMs: offset.offsetMs,
          channel: offset.offsetMs < MS_PER_UNIT.d ? 'sms' : 'email',
        });
      }
    }
    const cadences = Array.isArray(treatment.followupCadence) ? treatment.followupCadence : [];
    for (const cadence of cadences) {
      const offset = parseCadenceOffset(cadence);
      if (!offset) {
        logger?.warn?.(`[cco-aftercare] okand cadence '${cadence}' for ${treatmentKey}`);
        continue;
      }
      planned.push({
        kind: 'followup',
        templateRef: `followup_${treatmentKey}_${offset.token}`,
        offsetToken: offset.token,
        offsetMs: offset.offsetMs,
        channel: 'email',
      });
    }
    return planned;
  }

  // Skapa jobb for en avslutad behandling. Idempotent: samma encounter +
  // templateRef + offset ger samma jobb-id och dubbletter hoppas over.
  async function scheduleForCompletedEncounter(input = {}) {
    const customerId = normalizeText(input.customerId);
    const encounterId = normalizeText(input.encounterId);
    const treatmentKey = normalizeText(input.treatmentKey).toLowerCase();
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
      const id = mkJobId(customerId, encounterId, plan.templateRef, plan.offsetToken);
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
      };
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
    triggerNow,
    runDueJobs,
  };
}

module.exports = {
  JOB_STATUSES,
  parseCadenceOffset,
  mkJobId,
  createCcoAftercareSchedulerStore,
};
