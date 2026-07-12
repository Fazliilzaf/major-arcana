'use strict';

const KONS_MAILBOX = 'kons@hairtpclinic.com';
const FAZLI_MAILBOX = 'fazli@hairtpclinic.com';
const LIVE_MAILBOXES = Object.freeze([KONS_MAILBOX, FAZLI_MAILBOX]);

function normalizeEmail(value = '') {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function resolvePollMailboxes(config = {}) {
  const requested = Array.isArray(config.ccoMailIngestionPollMailboxes)
    ? config.ccoMailIngestionPollMailboxes
    : [config.ccoMailIngestionDefaultMailbox];
  const allowed = new Set(LIVE_MAILBOXES);
  return Array.from(new Set(requested.map(normalizeEmail).filter((email) => allowed.has(email))));
}

function resolveIntervalMs(config = {}) {
  const configured = Number(config.ccoMailIngestionPollIntervalMinutes);
  const minutes = Number.isFinite(configured) ? configured : 3;
  return Math.max(1, Number.isFinite(minutes) ? minutes : 3) * 60 * 1000;
}

function resolveInitialDelayMs(config = {}) {
  const configured = Number(config.ccoMailIngestionPollInitialDelayMs);
  return Number.isFinite(configured) ? Math.max(10000, configured) : 120000;
}

/**
 * Narrow live reader for KONS when the global scheduler is deliberately off.
 * It is read-only, only handles KONS, and never touches the send connector.
 */
function createCcoMailIngestionPoller({
  config = {},
  syncService,
  runtimeStreamRouter = null,
  logger = console,
  timers = {},
} = {}) {
  const setIntervalFn = timers.setInterval || setInterval;
  const clearIntervalFn = timers.clearInterval || clearInterval;
  const setTimeoutFn = timers.setTimeout || setTimeout;
  const clearTimeoutFn = timers.clearTimeout || clearTimeout;
  const mailboxEmails = resolvePollMailboxes(config);
  const enabled =
    config.ccoMailIngestionPollEnabled === true &&
    config.ccoMailIngestionEnabled === true &&
    config.ccoMailIngestionMode === 'read_only' &&
    mailboxEmails.length > 0 &&
    typeof syncService?.runMailboxCycle === 'function';

  let intervalId = null;
  let initialTimeoutId = null;
  let inFlight = false;

  async function runOnce() {
    if (!enabled) return { skipped: true, reason: 'kons_poller_disabled' };
    if (inFlight) return { skipped: true, reason: 'kons_poller_in_flight' };

    inFlight = true;
    try {
      const results = [];
      for (const mailboxEmail of mailboxEmails) {
        const result = await syncService.runMailboxCycle({
          mailboxEmail,
          mode: 'read_only',
          trigger: 'cco_mailbox_poller',
          createdBy: 'system:cco_mailbox_poller',
          folderTypes: ['inbox', 'sent'],
          truthLimit: Math.max(1, Number(config.ccoMailIngestionPollTruthLimit) || 100),
        });
        results.push({ mailboxEmail, result });
      }
      const fetched = results.reduce(
        (sum, item) => sum + Number(item.result?.ingestResult?.totalFetched || 0),
        0
      );
      const saved = results.reduce(
        (sum, item) => sum + Number(item.result?.ingestResult?.totalSaved || 0),
        0
      );
      const processed = results.reduce(
        (sum, item) => sum + Number(item.result?.processResult?.processed || 0),
        0
      );
      logger?.log?.(
        `[cco-mailbox-poller] cycle klar mailboxes=${mailboxEmails.join(',')} ` +
          `fetched=${fetched} saved=${saved} processed=${processed}`
      );
      if (saved > 0 && typeof runtimeStreamRouter?.broadcast === 'function') {
        runtimeStreamRouter.broadcast('worklist_updated', {
          source: 'cco_mailbox_poller',
          mailboxIds: mailboxEmails,
          saved,
          processed,
          completedAt: new Date().toISOString(),
        });
      }
      return { skipped: false, mailboxEmails, results };
    } catch (error) {
      logger?.error?.('[cco-mailbox-poller] cycle failed', error?.message || error);
      return { skipped: false, error: error?.message || 'mailbox_poller_failed' };
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (!enabled) return { started: false, reason: 'kons_poller_disabled' };
    if (intervalId) return { started: true, alreadyRunning: true, mailboxEmails };

    const intervalMs = resolveIntervalMs(config);
    const initialDelayMs = resolveInitialDelayMs(config);
    initialTimeoutId = setTimeoutFn(async () => {
      initialTimeoutId = null;
      await runOnce();
      intervalId = setIntervalFn(() => {
        void runOnce();
      }, intervalMs);
      intervalId?.unref?.();
    }, initialDelayMs);
    initialTimeoutId?.unref?.();
    logger?.log?.(
      `[cco-mailbox-poller] aktiv mailboxes=${mailboxEmails.join(',')} ` +
        `initialDelayMs=${initialDelayMs} intervalMs=${intervalMs}`
    );
    return { started: true, mailboxEmails, initialDelayMs, intervalMs };
  }

  function stop() {
    if (intervalId) {
      clearIntervalFn(intervalId);
      intervalId = null;
    }
    if (initialTimeoutId) {
      clearTimeoutFn(initialTimeoutId);
      initialTimeoutId = null;
    }
  }

  return { start, stop, runOnce };
}

module.exports = {
  KONS_MAILBOX,
  FAZLI_MAILBOX,
  LIVE_MAILBOXES,
  createCcoMailIngestionPoller,
  resolveIntervalMs,
  resolveInitialDelayMs,
  resolvePollMailboxes,
};
