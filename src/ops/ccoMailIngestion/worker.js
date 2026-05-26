const { MAILBOX_FOLDER_TYPES } = require('./constants');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function createCcoMailIngestionWorker({
  config = {},
  ingestionStore,
  syncService,
  logger = console,
} = {}) {
  if (!ingestionStore || !syncService) {
    throw new Error('createCcoMailIngestionWorker requires ingestionStore and syncService');
  }

  const jobs = new Map();
  let processInFlight = false;

  async function reconcileStuckImportRuns({ maxAgeMinutes = 15 } = {}) {
    const state = ingestionStore.getState();
    const cutoffMs = Date.now() - maxAgeMinutes * 60 * 1000;
    let healed = 0;
    for (const run of Object.values(state.mailImportRuns || {})) {
      if (normalizeText(run.status) !== 'running') continue;
      const startedMs = Date.parse(run.startedAt || '');
      if (!Number.isFinite(startedMs) || startedMs > cutoffMs) continue;
      await ingestionStore.finishImportRun(run.id, {
        status: 'failed',
        error: 'interrupted_by_timeout_or_restart',
      });
      healed += 1;
    }
    if (healed > 0) {
      logger?.log?.(`[mail-ingestion-worker] healed ${healed} stuck import run(s)`);
    }
    return healed;
  }

  async function ensureQueueIntegrity({ mailboxEmail = '' } = {}) {
    const normalized = normalizeEmail(mailboxEmail);
    const state = ingestionStore.getState();
    const queue = new Set(state.processingQueue || []);
    let requeued = 0;
    for (const ledger of Object.values(state.mailProcessingLedger || {})) {
      const raw = state.mailRawMessages[ledger.rawMessageId];
      if (!raw) continue;
      if (normalized && normalizeEmail(raw.mailboxId) !== normalized) continue;
      if (ingestionStore.shouldSkipProcessing(ledger)) continue;
      if (queue.has(ledger.rawMessageId)) continue;
      state.processingQueue.push(ledger.rawMessageId);
      queue.add(ledger.rawMessageId);
      requeued += 1;
    }
    if (requeued > 0) {
      await ingestionStore.save();
      logger?.log?.(`[mail-ingestion-worker] requeued ${requeued} raw message(s) for ${normalized || 'all'}`);
    }
    return requeued;
  }

  function getJob(jobId = '') {
    return jobs.get(normalizeText(jobId)) || null;
  }

  function listJobs({ limit = 20 } = {}) {
    return Array.from(jobs.values())
      .sort((left, right) => String(right.startedAt || '').localeCompare(String(left.startedAt || '')))
      .slice(0, Math.max(1, Number(limit) || 20));
  }

  async function runImportJob({
    mailboxEmail = '',
    mode = 'read_only',
    trigger = 'background',
    createdBy = 'system',
    skipDelta = false,
    folderTypes = MAILBOX_FOLDER_TYPES,
  } = {}) {
    const normalized = normalizeEmail(mailboxEmail);
    const jobId = `${normalized}:${Date.now()}`;
    const job = {
      id: jobId,
      mailboxEmail: normalized,
      mode,
      trigger,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      result: null,
    };
    jobs.set(jobId, job);

    try {
      await ensureQueueIntegrity({ mailboxEmail: normalized });
      const result = await syncService.runMailboxImport({
        mailboxEmail: normalized,
        mode,
        trigger,
        createdBy,
        skipDelta,
        folderTypes,
      });
      job.status = 'completed';
      job.result = result;
      job.finishedAt = new Date().toISOString();
      jobs.set(jobId, job);
      return job;
    } catch (error) {
      job.status = 'failed';
      job.error = normalizeText(error?.message) || 'import_failed';
      job.finishedAt = new Date().toISOString();
      jobs.set(jobId, job);
      throw error;
    }
  }

  function enqueueImportJob(options = {}) {
    const jobId = `${normalizeEmail(options.mailboxEmail)}:${Date.now()}`;
    const job = {
      id: jobId,
      mailboxEmail: normalizeEmail(options.mailboxEmail),
      mode: normalizeText(options.mode) || 'read_only',
      trigger: normalizeText(options.trigger) || 'background',
      status: 'queued',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      result: null,
    };
    jobs.set(jobId, job);
    setImmediate(() => {
      job.status = 'running';
      jobs.set(jobId, job);
      runImportJob({ ...options, trigger: options.trigger || 'background' })
        .then((completed) => {
          jobs.set(jobId, completed);
        })
        .catch((error) => {
          job.status = 'failed';
          job.error = normalizeText(error?.message) || 'import_failed';
          job.finishedAt = new Date().toISOString();
          jobs.set(jobId, job);
          logger?.error?.('[mail-ingestion-worker] import job failed', error);
        });
    });
    return job;
  }

  async function runProcessBatch({
    mailboxEmail = '',
    mode = 'read_only',
    maxMessages = null,
  } = {}) {
    if (processInFlight) {
      return { skipped: true, reason: 'process_in_flight' };
    }
    processInFlight = true;
    try {
      const batchSize = Number(maxMessages || config.ccoMailIngestionQueueBatchSize || 75);
      await ensureQueueIntegrity({ mailboxEmail });
      const result = await syncService.processQueue({
        mailboxEmail: normalizeEmail(mailboxEmail),
        mode: mode || config.ccoMailIngestionMode || 'read_only',
        maxMessages: batchSize,
      });
      return { skipped: false, ...result };
    } finally {
      processInFlight = false;
    }
  }

  function enqueueProcessDrain({
    mailboxEmail = '',
    mode = 'read_only',
    maxBatches = 500,
  } = {}) {
    const normalized = normalizeEmail(mailboxEmail);
    const jobId = `${normalized}:drain:${Date.now()}`;
    const job = {
      id: jobId,
      mailboxEmail: normalized,
      mode,
      trigger: 'process_drain',
      status: 'queued',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      totalProcessed: 0,
      totalFailed: 0,
      batches: 0,
      error: null,
    };
    jobs.set(jobId, job);

    setImmediate(async () => {
      job.status = 'running';
      jobs.set(jobId, job);
      try {
        const batchSize = Number(config.ccoMailIngestionQueueBatchSize || 75);
        for (let i = 0; i < maxBatches; i += 1) {
          const batch = await runProcessBatch({
            mailboxEmail: normalized,
            mode,
            maxMessages: batchSize,
          });
          job.batches += 1;
          job.totalProcessed += Number(batch.processed || 0);
          job.totalFailed += Number(batch.failed || 0);
          jobs.set(jobId, job);
          const remaining = ingestionStore.buildDashboardSummary({ mailboxEmail: normalized }).queueLength;
          if (remaining <= 0) break;
          if (Number(batch.processed || 0) === 0 && Number(batch.failed || 0) === 0) break;
        }
        job.status = 'completed';
        job.finishedAt = new Date().toISOString();
        jobs.set(jobId, job);
      } catch (error) {
        job.status = 'failed';
        job.error = normalizeText(error?.message) || 'process_drain_failed';
        job.finishedAt = new Date().toISOString();
        jobs.set(jobId, job);
        logger?.error?.('[mail-ingestion-worker] process drain failed', error);
      }
    });

    return job;
  }

  return {
    reconcileStuckImportRuns,
    ensureQueueIntegrity,
    enqueueImportJob,
    enqueueProcessDrain,
    runImportJob,
    runProcessBatch,
    getJob,
    listJobs,
  };
}

module.exports = {
  createCcoMailIngestionWorker,
};
