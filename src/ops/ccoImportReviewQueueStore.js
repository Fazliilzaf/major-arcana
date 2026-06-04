'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function createCcoImportReviewQueueStore({ filePath, auditLog } = {}) {
  if (!filePath) {
    throw new Error('ccoImportReviewQueueStore: filePath krävs');
  }

  let state = { schemaVersion: '1.0.0', items: {}, createdAt: new Date().toISOString() };

  async function load() {
    if (!fs.existsSync(filePath)) return;
    state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!state.items) state.items = {};
  }

  async function save() {
    state.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  await load();

  function getItem(id) {
    return state.items[id] || null;
  }

  async function applyDecision(id, patch, { actor = {}, reason = null } = {}) {
    const existing = getItem(id);
    if (!existing) {
      const e = new Error('import_review_item_not_found');
      e.statusCode = 404;
      throw e;
    }
    const next = {
      ...existing,
      ...patch,
      reviewedAt: new Date().toISOString(),
      reviewedBy: actor.userId || actor.role || 'operator',
      reviewReason: reason || patch.reviewReason || null,
    };
    state.items[id] = next;
    await save();
    if (auditLog?.append) {
      auditLog.append({
        action: 'import_review.decision',
        actor,
        target: { kind: 'import_review_queue', id },
        result: 'ok',
        detail: {
          decision: patch.decision,
          status: next.status,
          matchedPatientId: next.matchedPatientId || null,
          sourceSystem: next.sourceSystem,
          reason,
        },
      });
    }
    return next;
  }

  return {
    filePath,
    getItem,
    applyDecision,
    _state: () => state,
  };
}

module.exports = { createCcoImportReviewQueueStore };
