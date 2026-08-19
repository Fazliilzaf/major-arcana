'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createDeferredCcoMailIngestionStore({
  placeholderStore,
  createStore,
  logger = console,
  label = 'ccoMailIngestionStore',
} = {}) {
  if (!placeholderStore || typeof placeholderStore !== 'object') {
    throw new Error('placeholderStore krävs för deferred CCO mail-ingestion store.');
  }
  if (typeof createStore !== 'function') {
    throw new Error('createStore krävs för deferred CCO mail-ingestion store.');
  }

  let activeStore = placeholderStore;
  let loaded = false;
  let loading = null;
  let lastError = null;

  async function load() {
    if (loaded) return activeStore;
    if (loading) return loading;
    loading = Promise.resolve()
      .then(() => createStore())
      .then((store) => {
        if (!store || typeof store !== 'object') {
          throw new Error('deferred store factory returned no store');
        }
        activeStore = store;
        loaded = true;
        lastError = null;
        logger?.log?.(`[${label}] deferred load klar`);
        return activeStore;
      })
      .catch((error) => {
        lastError = normalizeText(error?.message) || 'deferred_load_failed';
        logger?.error?.(`[${label}] deferred load failed`, lastError);
        throw error;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function status() {
    return {
      deferred: true,
      loaded,
      loading: Boolean(loading),
      lastError,
    };
  }

  const methodNames = new Set([
    ...Object.keys(placeholderStore),
    'save',
    'ensureMailAccount',
    'upsertMailFolder',
    'startImportRun',
    'finishImportRun',
    'saveRawMessageFromTruth',
    'updateLedger',
    'getLedgerByRawMessageId',
    'getRawMessage',
    'shouldSkipProcessing',
    'appendAudit',
    'resetMailboxLocalState',
    'buildDashboardSummary',
    'compactProcessingQueue',
    'getQueueLength',
    'listReviewQueue',
    'getConversationIngestionMap',
    'linkPatientToMessage',
    'requestReprocessUnmatched',
    'isQueued',
    'enqueueRawMessageId',
    'reconcileProcessingQueue',
    'listNeedsReview',
    'dequeueNextRawMessageId',
    'completeQueuedMessage',
    'completeQueuedMessages',
    'saveGraphSubscription',
    'getAccountByEmail',
    'savePatientMatch',
    'listPatientMessages',
    'listPatientMessagesByCustomerId',
    'listUnmatchedMessages',
    'listAmbiguousMatches',
    'listMailboxStats',
    'listRawMessages',
    'listQueuedMailboxCounts',
    // Saknades tidigare — och i prod ar storen ALLTID deferrad (prod-safe), sa
    // de gick inte att anropa dar. hydrateRawMessage ar lasvagen for
    // externaliserade bodies och anropas av syncService fore varje meddelande;
    // updateThreadIdentityForMessage anropas av pipelinen vid varje matchning.
    // Bada hade kastat TypeError sa fort kon borjade bearbetas.
    'hydrateRawMessage',
    'getThreadIdentity',
    'listThreadIdentities',
    'updateThreadIdentityForMessage',
    'getState',
  ]);

  const facade = {
    deferred: true,
    get disabled() {
      return !loaded && Boolean(activeStore?.disabled);
    },
    get reason() {
      return loaded ? null : activeStore?.reason || 'deferred_until_explicit_load';
    },
    get filePath() {
      return loaded ? activeStore?.filePath || null : null;
    },
    _load: load,
    _isLoaded: () => loaded,
    _status: status,
  };

  for (const name of methodNames) {
    if (name in facade || name.startsWith('_')) continue;
    facade[name] = (...args) => {
      const fn = activeStore?.[name];
      if (typeof fn === 'function') return fn(...args);
      const fallback = placeholderStore?.[name];
      if (typeof fallback === 'function') return fallback(...args);
      return undefined;
    };
  }

  return facade;
}

module.exports = {
  createDeferredCcoMailIngestionStore,
};
