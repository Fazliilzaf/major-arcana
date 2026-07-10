'use strict';

const KONS_MAILBOX = 'kons@hairtpclinic.com';

function normalizeEmail(value = '') {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function resolveIntervalMs(config = {}) {
  const configured = Number(config.ccoMailIngestionPollIntervalMinutes);
  const minutes = Number.isFinite(configured) ? configured : 3;
  return Math.max(1, Number.isFinite(minutes) ? minutes : 3) * 60 * 1000;
}

/**
 * Narrow live reader for KONS when the global scheduler is deliberately off.
 * It is read-only, only handles KONS, and never touches the send connector.
 */
function createCcoMailIngestionPoller({ config = {}, syncService, logger = console, timers = {} } = {}) {
  const setIntervalFn = timers.setInterval || setInterval;
  const clearIntervalFn = timers.clearInterval || clearInterval;
  const mailboxEmail = normalizeEmail(config.ccoMailIngestionDefaultMailbox);
  const enabled =
    config.ccoMailIngestionPollEnabled === true &&
    config.ccoMailIngestionEnabled === true &&
    config.ccoMailIngestionMode === 'read_only' &&
    mailboxEmail === KONS_MAILBOX &&
    typeof syncService?.runMailboxCycle === 'function';

  let intervalId = null;
  let inFlight = false;

  async function runOnce() {
    if (!enabled) return { skipped: true, reason: 'kons_poller_disabled' };
    if (inFlight) return { skipped: true, reason: 'kons_poller_in_flight' };

    inFlight = true;
    try {
      const result = await syncService.runMailboxCycle({
        mailboxEmail: KONS_MAILBOX,
        mode: 'read_only',
        trigger: 'kons_poller',
        createdBy: 'system:cco_kons_poller',
        folderTypes: ['inbox', 'sent'],
      });
      logger?.log?.(
        `[cco-kons-poller] cycle klar fetched=${Number(result?.ingestResult?.totalFetched || 0)} ` +
          `saved=${Number(result?.ingestResult?.totalSaved || 0)} ` +
          `processed=${Number(result?.processResult?.processed || 0)}`
      );
      return { skipped: false, result };
    } catch (error) {
      logger?.error?.('[cco-kons-poller] cycle failed', error?.message || error);
      return { skipped: false, error: error?.message || 'kons_poller_failed' };
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (!enabled) return { started: false, reason: 'kons_poller_disabled' };
    if (intervalId) return { started: true, alreadyRunning: true, mailboxEmail: KONS_MAILBOX };

    const intervalMs = resolveIntervalMs(config);
    intervalId = setIntervalFn(() => {
      void runOnce();
    }, intervalMs);
    intervalId?.unref?.();
    logger?.log?.(`[cco-kons-poller] aktiv mailbox=${KONS_MAILBOX} intervalMs=${intervalMs}`);
    return { started: true, mailboxEmail: KONS_MAILBOX, intervalMs };
  }

  function stop() {
    if (!intervalId) return;
    clearIntervalFn(intervalId);
    intervalId = null;
  }

  return { start, stop, runOnce };
}

module.exports = { KONS_MAILBOX, createCcoMailIngestionPoller, resolveIntervalMs };
