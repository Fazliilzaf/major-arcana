'use strict';

function toPositiveInt(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createCcoImapMailboxPoller({
  config = {},
  syncService = null,
  runtimeStreamRouter = null,
  logger = console,
  timers = {},
} = {}) {
  const setIntervalFn = timers.setInterval || setInterval;
  const clearIntervalFn = timers.clearInterval || clearInterval;
  const setTimeoutFn = timers.setTimeout || setTimeout;
  const clearTimeoutFn = timers.clearTimeout || clearTimeout;
  const mailboxEmail = String(config.ccoImapUser || '').trim().toLowerCase();
  const enabled =
    config.ccoImapEnabled === true &&
    config.ccoImapPollEnabled === true &&
    config.ccoMailIngestionEnabled === true &&
    config.ccoMailIngestionMode === 'read_only' &&
    Boolean(mailboxEmail) &&
    typeof syncService?.runImapMailboxCycle === 'function';
  let initialTimeoutId = null;
  let intervalId = null;
  let inFlight = false;

  async function runOnce() {
    if (!enabled) return { skipped: true, reason: 'cco_imap_poller_disabled' };
    if (inFlight) return { skipped: true, reason: 'cco_imap_poller_in_flight' };
    inFlight = true;
    try {
      const result = await syncService.runImapMailboxCycle({
        mailboxEmail,
        mode: 'read_only',
        trigger: 'poller',
      });
      const completedAt = new Date().toISOString();
      const changed = Number(result?.imapResult?.changedMessageIds?.length || 0);
      if (changed > 0 && typeof runtimeStreamRouter?.broadcast === 'function') {
        runtimeStreamRouter.broadcast('worklist_updated', {
          source: 'cco_imap_mailbox_poller',
          mailboxIds: [mailboxEmail],
          truthChanged: changed,
          completedAt,
        });
      }
      if (typeof runtimeStreamRouter?.broadcast === 'function') {
        runtimeStreamRouter.broadcast('mailbox_sync_updated', {
          source: 'cco_imap_mailbox_poller',
          mailboxIds: [mailboxEmail],
          failedMailboxIds: result?.imapResult?.ok === false ? [mailboxEmail] : [],
          truthChanged: changed,
          completedAt,
        });
      }
      return result;
    } catch (error) {
      logger?.error?.('[cco-imap-poller] cycle failed', error?.message || error);
      return { skipped: false, error: error?.message || 'cco_imap_poller_failed' };
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (!enabled) return { started: false, reason: 'cco_imap_poller_disabled' };
    if (intervalId || initialTimeoutId) return { started: true, alreadyRunning: true, mailboxEmail };
    const initialDelayMs = Math.max(10000, toPositiveInt(config.ccoImapPollInitialDelayMs, 120000));
    const intervalMs = Math.max(60000, toPositiveInt(config.ccoImapPollIntervalMinutes, 3) * 60 * 1000);
    initialTimeoutId = setTimeoutFn(async () => {
      initialTimeoutId = null;
      await runOnce();
      intervalId = setIntervalFn(() => void runOnce(), intervalMs);
      intervalId?.unref?.();
    }, initialDelayMs);
    initialTimeoutId?.unref?.();
    logger?.log?.(
      `[cco-imap-poller] aktiv mailbox=${mailboxEmail} initialDelayMs=${initialDelayMs} intervalMs=${intervalMs}`
    );
    return { started: true, mailboxEmail, initialDelayMs, intervalMs };
  }

  function stop() {
    if (initialTimeoutId) clearTimeoutFn(initialTimeoutId);
    if (intervalId) clearIntervalFn(intervalId);
    initialTimeoutId = null;
    intervalId = null;
  }

  return { start, stop, runOnce };
}

module.exports = { createCcoImapMailboxPoller };
