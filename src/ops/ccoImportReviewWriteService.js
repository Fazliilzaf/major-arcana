'use strict';

const path = require('node:path');
const { invalidateImportReviewCache, OPERATOR_SOURCES } = require('./ccoImportReviewReadService');
const { createCcoImportReviewQueueStore } = require('./ccoImportReviewQueueStore');
const { assertCanaryAllows, recordCanaryDecision } = require('./ccoOperatorCanary');
const { isStrongCustomerMatch } = require('./ccoImportReviewMatch');

const STRONG_MATCH_ACTIONS = new Set([
  'approve_match',
  'reject_match',
  'leave_unresolved',
  'needs_owner_source',
]);

function resolveQueuePath(projectRoot) {
  const root = projectRoot || path.join(__dirname, '../..');
  const dataDir = process.env.ARCANA_STATE_ROOT || path.join(root, 'data');
  return path.join(dataDir, 'cco-import-review-queue.json');
}

async function applyImportReviewDecision({
  projectRoot,
  config,
  auditLog,
  itemId,
  action,
  reason,
  reviewer,
  actor,
}) {
  if (!config?.enableImportReviewWrite) {
    const e = new Error('import_review_write_disabled');
    e.statusCode = 403;
    throw e;
  }
  if (!STRONG_MATCH_ACTIONS.has(action)) {
    const e = new Error('invalid_import_review_action');
    e.statusCode = 400;
    throw e;
  }
  const rev = String(reviewer || actor?.userId || '').trim();
  if (rev.length < 2) {
    const e = new Error('reviewer krävs');
    e.statusCode = 400;
    throw e;
  }
  const why = String(reason || '').trim();
  if (action === 'reject_match' && why.length < 3) {
    const e = new Error('reason krävs för reject_match');
    e.statusCode = 400;
    throw e;
  }

  assertCanaryAllows('import', {
    projectRoot,
    maxDecisions: config.importReviewCanaryMax,
    enabled: config.enableImportReviewWrite,
  });

  const store = await createCcoImportReviewQueueStore({
    filePath: resolveQueuePath(projectRoot),
    auditLog,
  });
  const item = store.getItem(itemId);
  if (!item || item.status !== 'pending') {
    const e = new Error('item_not_pending');
    e.statusCode = 409;
    throw e;
  }
  if (!OPERATOR_SOURCES.has(item.sourceSystem)) {
    const e = new Error('item_outside_operator_scope');
    e.statusCode = 403;
    throw e;
  }

  let patch = { decision: action, reviewedBy: rev };
  let counterPatch = {};

  if (action === 'approve_match') {
    if (!isStrongCustomerMatch(item)) {
      const e = new Error('approve_match_requires_strong_single_customer_match');
      e.statusCode = 409;
      throw e;
    }
    const matchedPatientId = item.suggestedPatientIds[0];
    if (!matchedPatientId || String(matchedPatientId).startsWith('new_')) {
      const e = new Error('new_customer_blocked');
      e.statusCode = 409;
      throw e;
    }
    patch = {
      ...patch,
      status: 'approved',
      matchedPatientId,
      matchConfidence: 'high',
    };
    counterPatch = { approved: 1 };
  } else if (action === 'reject_match') {
    patch = { ...patch, status: 'rejected' };
    counterPatch = { rejected: 1 };
  } else if (action === 'leave_unresolved') {
    patch = { ...patch, status: 'pending' };
    counterPatch = { unresolved: 1 };
  } else if (action === 'needs_owner_source') {
    patch = { ...patch, status: 'pending', needsOwnerSource: true };
    counterPatch = { needsOwnerSource: 1 };
  }

  const updated = await store.applyDecision(itemId, patch, {
    actor: { ...actor, userId: rev },
    reason: why,
  });
  invalidateImportReviewCache();
  const canary = recordCanaryDecision('import', counterPatch, {
    projectRoot,
    maxDecisions: config.importReviewCanaryMax,
  });

  return { item: updated, canary, newAssets: 0, customerIdMismatch: 0 };
}

module.exports = {
  applyImportReviewDecision,
  isStrongCustomerMatch,
  STRONG_MATCH_ACTIONS,
};
