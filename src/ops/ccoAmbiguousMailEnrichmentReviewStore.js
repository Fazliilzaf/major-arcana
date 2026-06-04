// @ts-nocheck
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const REVIEW_ACTIONS = Object.freeze([
  'approve_single_match',
  'leave_unresolved',
  'exclude_non_actionable',
  'reject_candidate',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function emptyState() {
  const ts = new Date().toISOString();
  return { version: 1, createdAt: ts, updatedAt: ts, decisions: {} };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function resolveReviewStorePath(stateRoot = '', tenantId = '') {
  const safeTenant = normalizeText(tenantId).replace(/[^a-z0-9_-]+/gi, '_') || 'default';
  return path.join(
    normalizeText(stateRoot) || process.cwd(),
    `cco-inbox-ambiguous-graph-message-id-review.${safeTenant}.json`
  );
}

async function createCcoAmbiguousMailEnrichmentReviewStore({ stateRoot = '', tenantId = '' } = {}) {
  const filePath = resolveReviewStorePath(stateRoot, tenantId);
  const state = await readJson(filePath, emptyState());

  async function save() {
    state.updatedAt = new Date().toISOString();
    await writeJsonAtomic(filePath, state);
  }

  function getDecision(conversationKey = '') {
    const key = normalizeText(conversationKey).toLowerCase();
    const row = state.decisions[key];
    return row ? { ...row } : null;
  }

  function listDecisions() {
    return Object.entries(state.decisions).map(([conversationKey, row]) => ({
      conversationKey,
      ...row,
    }));
  }

  async function recordDecision(input = {}) {
    const conversationKey = normalizeText(input.conversationKey);
    if (!conversationKey) throw new Error('conversationKey krävs.');
    const action = normalizeText(input.action);
    if (!REVIEW_ACTIONS.includes(action)) {
      throw new Error(`action måste vara en av: ${REVIEW_ACTIONS.join(', ')}`);
    }
    const reason = normalizeText(input.reason);
    if (action === 'exclude_non_actionable' && reason.length < 3) {
      const error = new Error('reason krävs för exclude_non_actionable (minst 3 tecken).');
      error.statusCode = 400;
      throw error;
    }
    const reviewer = normalizeText(input.reviewer || input.actorUserId);
    if (!reviewer) {
      const error = new Error('reviewer krävs.');
      error.statusCode = 400;
      throw error;
    }

    const normalizedKey = conversationKey.toLowerCase();
    const existing = state.decisions[normalizedKey] || {};
    const rejectedCandidateIds = Array.isArray(existing.rejectedCandidateIds)
      ? [...existing.rejectedCandidateIds]
      : [];
    if (action === 'reject_candidate') {
      const candidateId = normalizeText(input.candidateId);
      if (!candidateId) {
        const error = new Error('candidateId krävs för reject_candidate.');
        error.statusCode = 400;
        throw error;
      }
      if (!rejectedCandidateIds.includes(candidateId)) rejectedCandidateIds.push(candidateId);
    }

    let reviewStatus = existing.reviewStatus || 'pending';
    if (action === 'approve_single_match') reviewStatus = 'approved';
    else if (action === 'leave_unresolved') {
      reviewStatus = input.ownerAccepted ? 'owner_accepted_unresolved' : 'unresolved_review';
    } else if (action === 'exclude_non_actionable') reviewStatus = 'excluded_non_actionable';
    else if (action === 'reject_candidate') reviewStatus = existing.reviewStatus || 'pending';

    const record = {
      conversationKey,
      action,
      reviewStatus,
      reason: reason ? reason.slice(0, 500) : null,
      reviewer,
      decidedAt: new Date().toISOString(),
      candidateId: normalizeText(input.candidateId) || null,
      matchedFields: Array.isArray(input.matchedFields) ? input.matchedFields.slice(0, 12) : [],
      matchStrategy: normalizeText(input.matchStrategy) || null,
      rejectedCandidateIds,
      repairRunId: normalizeText(input.repairRunId) || null,
      enrichTriggered: Boolean(input.enrichTriggered),
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    };

    state.decisions[normalizedKey] = record;
    await save();
    return { ...record };
  }

  function stats() {
    const decisions = listDecisions();
    const counts = {
      approved: 0,
      unresolved_review: 0,
      owner_accepted_unresolved: 0,
      excluded_non_actionable: 0,
      rejected_candidate_events: 0,
      pending: 0,
    };
    for (const row of decisions) {
      if (row.reviewStatus === 'approved') counts.approved += 1;
      else if (row.reviewStatus === 'unresolved_review') counts.unresolved_review += 1;
      else if (row.reviewStatus === 'owner_accepted_unresolved')
        counts.owner_accepted_unresolved += 1;
      else if (row.reviewStatus === 'excluded_non_actionable') counts.excluded_non_actionable += 1;
      if (row.action === 'reject_candidate') counts.rejected_candidate_events += 1;
    }
    return { totalDecisions: decisions.length, counts };
  }

  return {
    filePath,
    getDecision,
    listDecisions,
    recordDecision,
    stats,
  };
}

module.exports = {
  REVIEW_ACTIONS,
  createCcoAmbiguousMailEnrichmentReviewStore,
  resolveReviewStorePath,
};
